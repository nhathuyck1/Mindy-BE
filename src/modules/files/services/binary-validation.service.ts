import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI needs runtime constructor.
import { ConfigService } from '@nestjs/config';
import { BinaryValidationError } from '../exceptions/file.exceptions.js';
import type { FileDeclaration } from '../files.contracts.js';
import type { VerifiedBinary } from '../validation/binary-validation.js';
export interface BinaryValidator {
  validate(
    path: string,
    declaration: FileDeclaration,
    signal?: AbortSignal,
  ): Promise<VerifiedBinary>;
}
export const BINARY_VALIDATOR = Symbol('BINARY_VALIDATOR');
const exec = promisify(execFile);
@Injectable()
export class BinaryValidationService implements BinaryValidator {
  constructor(private readonly config: ConfigService) {}
  async validate(
    path: string,
    declaration: FileDeclaration,
    signal?: AbortSignal,
  ): Promise<VerifiedBinary> {
    try {
      const result = await exec(
        process.execPath,
        [
          '--max-old-space-size=128',
          fileURLToPath(new URL('../validation/binary-validation.runner.js', import.meta.url)),
          path,
          declaration.filename,
          declaration.mimeType,
          String(declaration.sizeBytes),
        ],
        {
          timeout: this.config.getOrThrow<number>('FILE_VALIDATION_TIMEOUT_SECONDS') * 1000,
          maxBuffer: 1024 * 1024,
          signal,
          windowsHide: true,
        },
      );
      return JSON.parse(result.stdout) as VerifiedBinary;
    } catch (error: unknown) {
      signal?.throwIfAborted();
      // Parser exit 2 denotes a rejected payload; launch/I/O errors remain retryable.
      if (error instanceof Error && 'code' in error && error.code === 2)
        throw new BinaryValidationError('FILE_BINARY_INVALID');
      if (error instanceof Error && 'killed' in error && error.killed)
        throw new BinaryValidationError('FILE_VALIDATION_TIMEOUT');
      throw error;
    }
  }
}
