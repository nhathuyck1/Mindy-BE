import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
export const BOARD_RENDERER = Symbol('BOARD_RENDERER');
export interface BoardRenderer {
  render(input: string, output: string, signal: AbortSignal): Promise<void>;
}
export class BoardRenderError extends Error {
  readonly code: string;
  constructor(cause: unknown) {
    super('Isolated whiteboard render failed', { cause });
    const stderr =
      typeof cause === 'object' &&
      cause !== null &&
      'stderr' in cause &&
      typeof cause.stderr === 'string'
        ? cause.stderr
        : '';
    this.code = /ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Cannot find module/.test(stderr)
      ? 'BOARD_RENDER_MODULE_MISSING'
      : /heap out of memory|bad alloc|out of memory/i.test(stderr)
        ? 'BOARD_RENDER_OUT_OF_MEMORY'
        : /EACCES|EPERM|EROFS/.test(stderr)
          ? 'BOARD_RENDER_FILESYSTEM_DENIED'
          : /ENOSPC/.test(stderr)
            ? 'BOARD_RENDER_DISK_FULL'
            : 'BOARD_RENDER_PROCESS_FAILED';
  }
}
@Injectable()
export class IsolatedBoardRenderer implements BoardRenderer {
  async render(input: string, output: string, signal: AbortSignal): Promise<void> {
    try {
      await promisify(execFile)(
        process.execPath,
        [
          '--max-old-space-size=256',
          fileURLToPath(new URL('./board-render.runner.js', import.meta.url)),
          input,
          output,
        ],
        { timeout: 60000, maxBuffer: 65536, signal, windowsHide: true },
      );
    } catch (error: unknown) {
      throw new BoardRenderError(error);
    }
  }
}
