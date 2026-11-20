import { extname } from 'node:path';
import { UploadPolicyError } from '../exceptions/file.exceptions.js';
import type { FileRule } from '../files.contracts.js';

const ordinaryLimit = 25 * 1024 * 1024;
const textRule: FileRule = {
  kind: 'SOURCE_CODE',
  mimeTypes: [
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'text/javascript',
    'application/javascript',
    'text/css',
  ],
  maxSizeBytes: ordinaryLimit,
};

/** Closed MVP allowlist. Binary signatures/actual sizes must still be checked by 3.2. */
const rules: Readonly<Record<string, FileRule>> = {
  '.pdf': { kind: 'PDF', mimeTypes: ['application/pdf'], maxSizeBytes: ordinaryLimit },
  '.png': { kind: 'IMAGE', mimeTypes: ['image/png'], maxSizeBytes: ordinaryLimit },
  '.jpg': { kind: 'IMAGE', mimeTypes: ['image/jpeg'], maxSizeBytes: ordinaryLimit },
  '.jpeg': { kind: 'IMAGE', mimeTypes: ['image/jpeg'], maxSizeBytes: ordinaryLimit },
  '.docx': {
    kind: 'DOCUMENT',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    maxSizeBytes: ordinaryLimit,
  },
  '.pptx': {
    kind: 'PRESENTATION',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    maxSizeBytes: ordinaryLimit,
  },
  '.xlsx': {
    kind: 'SPREADSHEET',
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    maxSizeBytes: ordinaryLimit,
  },
  '.mp3': { kind: 'AUDIO', mimeTypes: ['audio/mpeg'], maxSizeBytes: ordinaryLimit },
  '.mp4': { kind: 'VIDEO', mimeTypes: ['video/mp4'], maxSizeBytes: 200 * 1024 * 1024 },
  ...Object.fromEntries(
    [
      '.txt',
      '.md',
      '.csv',
      '.json',
      '.js',
      '.ts',
      '.py',
      '.java',
      '.c',
      '.cpp',
      '.h',
      '.css',
      '.sql',
    ].map((extension) => [extension, textRule]),
  ),
};

export function validateFileDeclaration(
  filename: string,
  mimeType: string,
  sizeBytes: number,
): FileRule {
  if (
    filename.length === 0 ||
    filename.length > 250 ||
    /[\p{Cc}\\/]/u.test(filename) ||
    filename !== filename.trim() ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0
  ) {
    throw new UploadPolicyError('MATERIAL_CONTENT_INVALID');
  }
  const rule = rules[extname(filename).toLowerCase()];
  if (rule === undefined || !rule.mimeTypes.includes(mimeType) || sizeBytes > rule.maxSizeBytes) {
    throw new UploadPolicyError('MATERIAL_CONTENT_INVALID');
  }
  return { ...rule, mimeTypes: [...rule.mimeTypes] };
}
