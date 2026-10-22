import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
if (result.status !== 0) process.exit(result.status ?? 1);

// The production image only contains dist. Record exactly what was compiled so
// deployment can reject a missing/stale migration before connecting to the DB.
const sources = readdirSync(join(projectRoot, 'src/database/migrations'))
  .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
  .map((file) => file.replace(/\.ts$/, '.js'))
  .sort();
const migrationsDirectory = join(output, 'database/migrations');
const compiled = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith('.js'))
  .sort();
if (!sources.length || JSON.stringify(sources) !== JSON.stringify(compiled))
  throw new Error('Compiled migration files do not match the source catalog.');
const files = compiled.map((name) => ({
  name,
  sha256: createHash('sha256')
    .update(readFileSync(join(migrationsDirectory, name)))
    .digest('hex'),
}));
writeFileSync(
  join(output, 'database/migration-manifest.json'),
  JSON.stringify({ version: 1, files }, null, 2),
);
console.log(`Built and verified ${files.length} migration artifacts.`);
