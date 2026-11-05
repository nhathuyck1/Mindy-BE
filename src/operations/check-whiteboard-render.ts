import 'dotenv/config';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileProcessingDiagnostics } from '../modules/files/services/file-processing-diagnostics.js';
import { IsolatedBoardRenderer } from '../modules/whiteboards/board-renderer.service.js';

// Runs inside the deployed image as its normal user. No database or storage writes.
const root = resolve(process.env.FILE_SCRATCH_DIRECTORY || join(tmpdir(), 'mindy-file-validation'));
let directory: string | undefined;
let stage = 'CREATE_SCRATCH';
try {
  await mkdir(root, { recursive: true });
  directory = await mkdtemp(join(root, 'whiteboard-check-'));
  const input = join(directory, 'render.json'),
    output = join(directory, 'result');
  for (const format of ['PNG', 'PDF']) {
    stage = `RENDER_${format}`;
    await writeFile(
      input,
      JSON.stringify({
        shapes: [
          {
            id: 'test',
            type: 'text',
            x: 24,
            y: 24,
            width: 300,
            height: 100,
            color: '#338a85',
            text: 'Bảng trắng Mindy — Tiếng Việt',
            fontSize: 24,
          },
        ],
        bounds: { x: 0, y: 0, width: 400, height: 180, scale: 1 },
        images: {},
        format,
      }),
    );
    await new IsolatedBoardRenderer().render(input, output, AbortSignal.timeout(65000));
    console.log(
      JSON.stringify({
        event: 'WHITEBOARD_RENDER_CHECK_OK',
        format,
        bytes: (await readFile(output)).length,
      }),
    );
  }
} catch (error: unknown) {
  console.error(
    JSON.stringify({
      event: 'WHITEBOARD_RENDER_CHECK_FAILED',
      stage,
      ...fileProcessingDiagnostics(error),
    }),
  );
  process.exitCode = 1;
} finally {
  if (directory && resolve(directory).startsWith(root + sep))
    await rm(directory, { recursive: true, force: true });
}
