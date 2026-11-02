import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
export const BOARD_RENDERER = Symbol('BOARD_RENDERER');
export interface BoardRenderer {
  render(input: string, output: string, signal: AbortSignal): Promise<void>;
}
@Injectable()
export class IsolatedBoardRenderer implements BoardRenderer {
  async render(input: string, output: string, signal: AbortSignal): Promise<void> {
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
  }
}
