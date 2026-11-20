import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Artifact {
  name: string;
  sha256: string;
}
function isArtifact(value: unknown): value is Artifact {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    /^\d{13}-[a-z0-9-]+\.js$/.test(value.name) &&
    'sha256' in value &&
    typeof value.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(value.sha256)
  );
}

/** Verify files without reading environment variables or connecting to PostgreSQL. */
export function verifyCompiledMigrations(
  directory = dirname(fileURLToPath(import.meta.url)),
): string[] {
  const manifest: unknown = JSON.parse(
    readFileSync(join(directory, 'migration-manifest.json'), 'utf8'),
  );
  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    !('version' in manifest) ||
    manifest.version !== 1 ||
    !('files' in manifest) ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length ||
    !manifest.files.every(isArtifact)
  )
    throw new Error('Invalid compiled migration manifest. Run the production build again.');
  const files: Artifact[] = manifest.files;
  const expected = files.map((file) => file.name).sort();
  const actual = readdirSync(join(directory, 'migrations'))
    .filter((file) => file.endsWith('.js'))
    .sort();
  if (
    new Set(expected).size !== expected.length ||
    JSON.stringify(expected) !== JSON.stringify(actual)
  )
    throw new Error('Compiled migration catalog is incomplete or contains unexpected files.');
  for (const file of files) {
    const checksum = createHash('sha256')
      .update(readFileSync(join(directory, 'migrations', file.name)))
      .digest('hex');
    if (checksum !== file.sha256)
      throw new Error(`Migration artifact checksum mismatch: ${file.name}`);
  }
  return expected;
}
