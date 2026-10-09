import type { Readable } from 'node:stream';
import type { ClassContentContext } from '../classes/domain/class-content-context.js';

export { validateFileDeclaration } from './domain/file-upload-policy.js';
export { UploadPolicyError } from './exceptions/file.exceptions.js';

export type FileStatus = 'PENDING_UPLOAD' | 'PROCESSING' | 'READY' | 'FAILED' | 'DELETED';
export type FileKind =
  | 'PDF'
  | 'IMAGE'
  | 'DOCUMENT'
  | 'PRESENTATION'
  | 'SPREADSHEET'
  | 'AUDIO'
  | 'VIDEO'
  | 'SOURCE_CODE';
export interface FileRule {
  readonly kind: FileKind;
  readonly mimeTypes: readonly string[];
  readonly maxSizeBytes: number;
}
export interface UploadScope {
  readonly courseUnitId: string;
  readonly classId?: string;
  readonly classUnitId?: string;
}
export interface FileDeclaration {
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}
export interface AuthorizedUpload {
  readonly courseUnitId: string;
  readonly classContext: ClassContentContext | null;
  readonly fileRule: FileRule;
}
export interface FileSummary {
  readonly id: string;
  readonly ownerUserId: string;
  readonly courseUnitId: string;
  readonly status: FileStatus;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly kind: FileKind;
}
export interface ObjectVersion {
  readonly versionId: string;
  readonly size: number;
}
export interface StorageLocation {
  readonly bucket: string;
  readonly key: string;
  readonly versionId: string;
}
export const FILE_STORAGE = Symbol('FILE_STORAGE');
export interface FileStorage {
  assertAvailable(): Promise<void>;
  presignPut(bucket: string, key: string, mimeType: string, ttl: number): Promise<string>;
  head(bucket: string, key: string, versionId?: string): Promise<ObjectVersion>;
  copy(source: StorageLocation, destinationKey: string, signal?: AbortSignal): Promise<string>;
  read(location: StorageLocation, signal?: AbortSignal): Promise<Readable>;
}
