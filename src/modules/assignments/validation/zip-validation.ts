import { open, stat } from 'node:fs/promises';
import { crc32 } from 'node:zlib';
import * as yauzl from 'yauzl';

export class ZipValidationError extends Error {
  constructor(readonly code: 'ZIP_INVALID' | 'ZIP_LIMIT_EXCEEDED' = 'ZIP_INVALID') {
    super(code);
  }
}
function archive(bytes: Buffer): boolean {
  return (
    (bytes.length >= 4 && [0x04034b50, 0x06054b50, 0x08074b50].includes(bytes.readUInt32LE(0))) ||
    bytes.subarray(0, 6).equals(Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) ||
    bytes.subarray(0, 4).toString('ascii') === 'Rar!' ||
    bytes.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b])) ||
    bytes.subarray(0, 3).toString('ascii') === 'BZh' ||
    bytes.subarray(0, 6).equals(Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0])) ||
    bytes.subarray(257, 262).toString('ascii') === 'ustar'
  );
}
/** Streams entries into counters only. No extraction, execution or trust in central-directory sizes. */
export async function validateZip(path: string, signal?: AbortSignal): Promise<void> {
  if ((await stat(path)).size > 20 * 1024 * 1024)
    throw new ZipValidationError('ZIP_LIMIT_EXCEEDED');
  const handle = await open(path, 'r');
  try {
    const bytes = Buffer.alloc(4);
    await handle.read(bytes, 0, 4, 0);
    if (bytes.readUInt32LE(0) !== 0x04034b50) throw new ZipValidationError();
  } finally {
    await handle.close();
  }
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    yauzl.open(
      path,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip) return reject(new ZipValidationError());
        let settled = false,
          count = 0,
          expanded = 0,
          fileCount = 0;
        const names = new Set<string>();
        let active: import('node:stream').Readable | undefined;
        const done = (failure?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          signal?.removeEventListener('abort', abort);
          active?.destroy();
          zip.close();
          if (failure) reject(failure);
          else resolve();
        };
        const abort = () => done(new ZipValidationError('ZIP_LIMIT_EXCEEDED'));
        const timer = setTimeout(abort, 30000);
        timer.unref();
        signal?.addEventListener('abort', abort, { once: true });
        zip.on('error', () => done(new ZipValidationError()));
        zip.on('end', () => done(fileCount > 0 ? undefined : new ZipValidationError()));
        zip.on('entry', (entry: yauzl.Entry) => {
          if (settled) return;
          const name = entry.fileName.normalize('NFKC'),
            parts = name.replace(/\/$/, '').split('/');
          const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
          if (
            ++count > 1000 ||
            expanded + entry.uncompressedSize > 100 * 1024 * 1024 ||
            entry.uncompressedSize > Math.max(1, entry.compressedSize) * 100
          )
            return done(new ZipValidationError('ZIP_LIMIT_EXCEEDED'));
          if (
            entry.isEncrypted() ||
            ![0, 8].includes(entry.compressionMethod) ||
            mode === 0o120000 ||
            (mode !== 0 && mode !== 0o100000 && mode !== 0o040000) ||
            !name ||
            name.length > 1024 ||
            /[\\:\u202a-\u202e\u2066-\u2069]/.test(name) ||
            [...name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
            parts.some(
              (p) =>
                !p ||
                p === '.' ||
                p === '..' ||
                /[. ]$/.test(p) ||
                /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p),
            ) ||
            names.has(name.toLowerCase()) ||
            /\.(zip|rar|7z|gz|tgz|bz2|xz|tar|docx|pptx|xlsx|jar|war|apk)$/i.test(name)
          )
            return done(new ZipValidationError());
          names.add(name.toLowerCase());
          if (name.endsWith('/')) {
            if (entry.uncompressedSize !== 0) return done(new ZipValidationError());
            zip.readEntry();
            return;
          }
          fileCount++;
          zip.openReadStream(entry, (streamError, stream) => {
            if (settled) {
              stream?.destroy();
              return;
            }
            if (streamError || !stream) return done(new ZipValidationError());
            active = stream;
            let size = 0,
              crc = 0;
            let prefix = Buffer.alloc(0);
            stream.on('error', () => done(new ZipValidationError()));
            stream.on('data', (chunk: Buffer) => {
              size += chunk.length;
              expanded += chunk.length;
              crc = crc32(chunk, crc);
              if (prefix.length < 512)
                prefix = Buffer.concat([prefix, chunk.subarray(0, 512 - prefix.length)]);
              if (expanded > 100 * 1024 * 1024 || size > Math.max(1, entry.compressedSize) * 100)
                return done(new ZipValidationError('ZIP_LIMIT_EXCEEDED'));
              if (size > entry.uncompressedSize || archive(prefix)) done(new ZipValidationError());
            });
            stream.on('end', () => {
              active = undefined;
              if (settled) return;
              if (size !== entry.uncompressedSize || crc !== entry.crc32)
                return done(new ZipValidationError());
              zip.readEntry();
            });
          });
        });
        if (signal?.aborted) abort();
        else zip.readEntry();
      },
    );
  });
}
