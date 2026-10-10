import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { crc32 } from 'node:zlib';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import ffprobe from 'ffprobe-static';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import * as yauzl from 'yauzl';
import { validateFileDeclaration } from '../domain/file-upload-policy.js';
import { BinaryValidationError } from '../exceptions/file.exceptions.js';
import type { FileDeclaration, FileKind } from '../files.contracts.js';

export interface VerifiedBinary {
  readonly mimeType: string;
  readonly kind: FileKind;
}
const exec = promisify(execFile);

async function office(path: string, kind: FileKind): Promise<void> {
  const required: Record<
    string,
    { root: string; mime: string; element: string; namespace: string }
  > = {
    DOCUMENT: {
      root: 'word/document.xml',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
      element: 'document',
      namespace: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    },
    PRESENTATION: {
      root: 'ppt/presentation.xml',
      mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
      element: 'presentation',
      namespace: 'http://schemas.openxmlformats.org/presentationml/2006/main',
    },
    SPREADSHEET: {
      root: 'xl/workbook.xml',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
      element: 'workbook',
      namespace: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    },
  };
  const expected = required[kind];
  if (!expected) throw new BinaryValidationError();
  await new Promise<void>((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) return reject(new BinaryValidationError());
      let entries = 0;
      let expanded = 0;
      let root = false;
      let contentTypes = false;
      let relationships = false;
      const names = new Set<string>();
      let failed = false;
      const fail = () => {
        if (failed) return;
        failed = true;
        zip.close();
        reject(new BinaryValidationError());
      };
      zip.on('error', fail);
      zip.on('end', () =>
        root && contentTypes && relationships ? resolve() : reject(new BinaryValidationError()),
      );
      zip.on('entry', (entry: yauzl.Entry) => {
        entries++;
        expanded += entry.uncompressedSize;
        if (
          entries > 4096 ||
          expanded > 128 * 1024 * 1024 ||
          entry.isEncrypted() ||
          (entry.uncompressedSize > 1024 * 1024 &&
            entry.uncompressedSize / Math.max(entry.compressedSize, 1) > 200) ||
          names.has(entry.fileName) ||
          /(^\/|^[a-z]:|\\|(^|\/)\.\.(\/|$)|vbaProject|\.exe$)/i.test(entry.fileName)
        )
          return fail();
        names.add(entry.fileName);
        if (entry.fileName.endsWith('/')) {
          zip.readEntry();
          return;
        }
        const capture =
          entry.fileName === '[Content_Types].xml' ||
          entry.fileName === expected.root ||
          entry.fileName === '_rels/.rels';
        if (capture && entry.uncompressedSize > 4 * 1024 * 1024) return fail();
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return fail();
          let bytes = 0;
          let checksum = 0;
          const chunks: Buffer[] = [];
          stream.on('error', fail);
          stream.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            checksum = crc32(chunk, checksum);
            if (bytes > entry.uncompressedSize || bytes > 128 * 1024 * 1024) {
              stream.destroy();
              fail();
            } else if (capture) chunks.push(chunk);
          });
          stream.on('end', () => {
            try {
              if (failed) return;
              if (bytes !== entry.uncompressedSize || checksum !== entry.crc32) return fail();
              if (capture) {
                const xml = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
                if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
                  return fail();
                const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml) as Record<
                  string,
                  Record<string, unknown>
                >;
                if (entry.fileName === '[Content_Types].xml') {
                  const types = parsed.Types;
                  const overrides = types?.Override;
                  const list: unknown[] = Array.isArray(overrides) ? overrides : [overrides];
                  contentTypes =
                    types?.['@_xmlns'] ===
                      'http://schemas.openxmlformats.org/package/2006/content-types' &&
                    !/macroEnabled/i.test(xml) &&
                    list.some((item) => {
                      if (!item || typeof item !== 'object') return false;
                      const attributes = item as Record<string, unknown>;
                      return (
                        attributes['@_PartName'] === `/${expected.root}` &&
                        attributes['@_ContentType'] === expected.mime
                      );
                    });
                }
                if (entry.fileName === expected.root) {
                  root = Object.entries(parsed).some(([name, value]) => {
                    const [prefix, local] = name.includes(':') ? name.split(':') : ['', name];
                    return (
                      local === expected.element &&
                      value?.[prefix ? `@_xmlns:${prefix}` : '@_xmlns'] === expected.namespace
                    );
                  });
                }
                if (entry.fileName === '_rels/.rels') {
                  const rels = parsed.Relationships;
                  const items = rels?.Relationship;
                  const list: unknown[] = Array.isArray(items) ? items : [items];
                  relationships =
                    rels?.['@_xmlns'] ===
                      'http://schemas.openxmlformats.org/package/2006/relationships' &&
                    list.some((item) => {
                      if (!item || typeof item !== 'object') return false;
                      const attributes = item as Record<string, unknown>;
                      return (
                        attributes['@_Type'] ===
                          'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' &&
                        (attributes['@_Target'] === expected.root ||
                          attributes['@_Target'] === `/${expected.root}`) &&
                        attributes['@_TargetMode'] !== 'External'
                      );
                    });
                }
              }
              zip.readEntry();
            } catch {
              fail();
            }
          });
        });
      });
      zip.readEntry();
    });
  });
}

export async function validateBinary(
  path: string,
  declaration: FileDeclaration,
  signal?: AbortSignal,
  probePath = process.platform === 'linux' ? '/usr/bin/ffprobe' : ffprobe.path,
): Promise<VerifiedBinary> {
  const rule = validateFileDeclaration(
    declaration.filename,
    declaration.mimeType,
    declaration.sizeBytes,
  );
  try {
    signal?.throwIfAborted();
    if ((await stat(path)).size !== declaration.sizeBytes)
      throw new BinaryValidationError('FILE_SIZE_MISMATCH');
    const handle = await open(path, 'r');
    const prefix = Buffer.alloc(16);
    try {
      await handle.read(prefix, 0, 16, 0);
    } finally {
      await handle.close();
    }
    switch (rule.kind) {
      case 'SOURCE_CODE': {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        for await (const chunk of createReadStream(path, { signal })) {
          if (chunk.includes(0)) throw new BinaryValidationError();
          decoder.decode(chunk, { stream: true });
        }
        decoder.decode();
        break;
      }
      case 'PDF': {
        if (prefix.subarray(0, 5).toString() !== '%PDF-') throw new BinaryValidationError();
        const bytes = await readFile(path);
        if (!bytes.subarray(-1024).includes(Buffer.from('%%EOF')))
          throw new BinaryValidationError();
        const pdf = await PDFDocument.load(bytes, {
          throwOnInvalidObject: true,
          updateMetadata: false,
        });
        if (pdf.isEncrypted || pdf.getPageCount() < 1 || pdf.getPageCount() > 10000)
          throw new BinaryValidationError();
        break;
      }
      case 'IMAGE': {
        const image = sharp(path, {
          failOn: 'warning',
          limitInputPixels: 40_000_000,
          animated: false,
        });
        const metadata = await image.metadata();
        if (
          (declaration.mimeType === 'image/png' && metadata.format !== 'png') ||
          (declaration.mimeType === 'image/jpeg' && metadata.format !== 'jpeg') ||
          (metadata.pages ?? 1) !== 1
        )
          throw new BinaryValidationError();
        await image.stats();
        break;
      }
      case 'DOCUMENT':
      case 'PRESENTATION':
      case 'SPREADSHEET':
        await office(path, rule.kind);
        break;
      case 'AUDIO':
      case 'VIDEO': {
        if (rule.kind === 'VIDEO' && prefix.subarray(4, 8).toString() !== 'ftyp')
          throw new BinaryValidationError();
        const result = await exec(
          probePath,
          [
            '-v',
            'error',
            '-max_alloc',
            '67108864',
            '-protocol_whitelist',
            'file,pipe',
            '-format_whitelist',
            rule.kind === 'AUDIO' ? 'mp3' : 'mov',
            '-count_packets',
            '-show_entries',
            'format=format_name,duration:stream=codec_type,codec_name,nb_read_packets',
            '-of',
            'json',
            path,
          ],
          { timeout: 20000, maxBuffer: 1024 * 1024, windowsHide: true, signal },
        );
        const info: {
          format?: { format_name?: string; duration?: string };
          streams?: { codec_type?: string; codec_name?: string; nb_read_packets?: string }[];
        } = JSON.parse(result.stdout);
        if (
          !info.format?.format_name ||
          (rule.kind === 'AUDIO'
            ? info.format.format_name !== 'mp3'
            : !info.format.format_name.split(',').includes('mp4')) ||
          Number(info.format.duration) <= 0 ||
          !Number.isFinite(Number(info.format.duration)) ||
          !info.streams?.some(
            (s) =>
              s.codec_type === (rule.kind === 'AUDIO' ? 'audio' : 'video') &&
              Number(s.nb_read_packets) > 0,
          )
        )
          throw new BinaryValidationError();
        break;
      }
    }
    return { mimeType: declaration.mimeType, kind: rule.kind };
  } catch {
    signal?.throwIfAborted();
    throw new BinaryValidationError();
  }
}
