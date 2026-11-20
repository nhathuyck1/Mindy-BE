import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileStorage } from '../files/files.contracts.js';
import { BoardRenderError } from './board-renderer.service.js';
import { WhiteboardMediaWorker } from './whiteboard-media.worker.js';

describe('whiteboard export failure diagnostics', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(['RENDER', 'STORE_OUTPUT'] as const)(
    'persists and logs %s failures without private error messages',
    async (stage) => {
      const root = resolve(tmpdir());
      const scratch = await mkdtemp(join(root, 'whiteboard-worker-test-'));
      const log = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      const query = vi.fn().mockResolvedValue([]);
      const job = {
        id: 'job',
        board_id: 'board',
        lease_token: 'lease',
        attempts: 3,
        projection: [],
        viewport: { x: 0, y: 0, width: 400, height: 300, scale: 1 },
        format: 'PNG',
      };
      query.mockResolvedValueOnce([[], 0]).mockResolvedValueOnce([[job], 1]);
      const failure = Object.assign(new Error('https://private.example/?signature=secret'), {
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403 },
      });
      const put = vi.fn().mockRejectedValue(failure);
      const storage = { put } as unknown as FileStorage;
      const renderer = {
        render: async (_input: string, output: string) => {
          if (stage === 'RENDER')
            throw new BoardRenderError({
              stderr: 'Error [ERR_MODULE_NOT_FOUND]: private path',
              code: 1,
            });
          await writeFile(output, Buffer.from('png'));
        },
      };
      try {
        const worker = new WhiteboardMediaWorker(
          { query } as unknown as DataSource,
          new ConfigService({ FILE_SCRATCH_DIRECTORY: scratch, MINIO_BUCKET: 'bucket' }),
          storage,
          {
            validate: async () => {
              throw new Error('Export does not validate uploads');
            },
          },
          renderer,
        );
        await worker.tick();
        expect(query).toHaveBeenLastCalledWith(expect.stringContaining('error_code=$4'), [
          'job',
          'lease',
          'FAILED',
          `BOARD_EXPORT_${stage}_FAILED`,
        ]);
        expect(log).toHaveBeenCalledWith(
          expect.objectContaining({
            stage,
            event: 'WHITEBOARD_MEDIA_FAILED',
            errorCode: `BOARD_EXPORT_${stage}_FAILED`,
            ...(stage === 'RENDER'
              ? { causeCode: 'BOARD_RENDER_MODULE_MISSING' }
              : { errorName: 'AccessDenied', httpStatus: 403 }),
          }),
        );
        expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|signature|secret/);
        expect(put).toHaveBeenCalledTimes(stage === 'RENDER' ? 0 : 1);
      } finally {
        if (resolve(scratch).startsWith(root + sep))
          await rm(scratch, { recursive: true, force: true });
      }
    },
  );
});
