import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { expect, it } from 'vitest';

it('production renderer creates real PNG and PDF files in its isolated subprocess', async () => {
  const root = resolve(tmpdir()),
    directory = await mkdtemp(join(root, 'whiteboard-render-test-'));
  try {
    const input = join(directory, 'input.json'),
      output = join(directory, 'result');
    const image = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    for (const format of ['PNG', 'PDF']) {
      await writeFile(
        input,
        JSON.stringify({
          shapes: [
            {
              id: 'image',
              type: 'image',
              assetId: 'asset',
              x: 20,
              y: 20,
              width: 20,
              height: 20,
              color: '#ffffff',
            },
            {
              id: 'text',
              type: 'text',
              x: 50,
              y: 20,
              width: 300,
              height: 100,
              color: '#338a85',
              text: 'Bảng trắng Tiếng Việt',
              fontSize: 24,
            },
          ],
          bounds: { x: 0, y: 0, width: 400, height: 200, scale: 1 },
          images: { asset: `data:image/png;base64,${image.toString('base64')}` },
          format,
        }),
      );
      await promisify(execFile)(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { IsolatedBoardRenderer } from './dist/modules/whiteboards/board-renderer.service.js'; await new IsolatedBoardRenderer().render(process.argv[1],process.argv[2],AbortSignal.timeout(65000));`,
          input,
          output,
        ],
        { timeout: 70000, windowsHide: true },
      );
      const bytes = await readFile(output);
      if (format === 'PNG')
        expect(await sharp(bytes).metadata()).toMatchObject({
          width: 400,
          height: 200,
          format: 'png',
        });
      else expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    }
  } finally {
    if (resolve(directory).startsWith(root + sep))
      await rm(directory, { recursive: true, force: true });
  }
}, 75000);
