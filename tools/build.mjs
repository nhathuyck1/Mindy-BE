import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(projectRoot, 'dist');
if (output !== join(projectRoot, 'dist')) throw new Error('Unexpected build output path');

// TypeScript does not remove outputs for deleted source files. Stale migration
// modules would otherwise still be discovered by the production DataSource glob.
rmSync(output, { recursive: true, force: true });
const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json'],
  {
    cwd: projectRoot,
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
