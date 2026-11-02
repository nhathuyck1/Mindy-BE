import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import { ZipValidationError } from '../validation/zip-validation.js';

const exec = promisify(execFile);
@Injectable()
export class AssignmentFileValidator {
  async zip(path: string, signal: AbortSignal): Promise<void> {
    try {
      await exec(
        process.execPath,
        [
          '--max-old-space-size=128',
          fileURLToPath(new URL('../validation/zip-validation.runner.js', import.meta.url)),
          path,
        ],
        { timeout: 35000, maxBuffer: 1024, windowsHide: true, signal },
      );
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof Error && 'code' in error && error.code === 2) {
        const limit = 'stderr' in error && String(error.stderr).includes('ZIP_LIMIT_EXCEEDED');
        throw new ZipValidationError(limit ? 'ZIP_LIMIT_EXCEEDED' : 'ZIP_INVALID');
      }
      if (error instanceof Error && 'killed' in error && error.killed)
        throw new ZipValidationError('ZIP_LIMIT_EXCEEDED');
      throw error;
    }
  }
}
