import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyCompiledMigrations } from './migration-artifacts.js';

describe('Production migration artifact gate', () => {
  let directory: string;
  const name = '1792627200002-consolidate-tracking.js';
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'mindy-migration-artifacts-'));
    mkdirSync(join(directory, 'migrations'));
    const bytes = 'export class TestMigration {}';
    writeFileSync(join(directory, 'migrations', name), bytes);
    writeFileSync(
      join(directory, 'migration-manifest.json'),
      JSON.stringify({
        version: 1,
        files: [{ name, sha256: createHash('sha256').update(bytes).digest('hex') }],
      }),
    );
  });
  afterEach(() => {
    if (
      !resolve(directory).startsWith(`${resolve(tmpdir())}${sep}`) ||
      !basename(directory).startsWith('mindy-migration-artifacts-')
    )
      throw new Error('Unexpected migration test directory');
    rmSync(directory, { recursive: true, force: true });
  });
  it('accepts the complete unchanged release catalog', () => {
    expect(verifyCompiledMigrations(directory)).toEqual([name]);
  });
  it('rejects a missing artifact before any database work', () => {
    rmSync(join(directory, 'migrations', name));
    expect(() => verifyCompiledMigrations(directory)).toThrow('incomplete');
  });
  it('rejects stale or altered JavaScript even when the filename is correct', () => {
    writeFileSync(join(directory, 'migrations', name), 'export class WrongRelease {}');
    expect(() => verifyCompiledMigrations(directory)).toThrow('checksum mismatch');
  });
  it('rejects unexpected files and duplicate manifest entries', () => {
    const extra = join(directory, 'migrations', '1792627200003-extra.js');
    writeFileSync(extra, 'export class Extra {}');
    expect(() => verifyCompiledMigrations(directory)).toThrow('unexpected files');
    rmSync(extra);
    const manifest = JSON.parse(readFileSync(join(directory, 'migration-manifest.json'), 'utf8'));
    manifest.files.push(manifest.files[0]);
    writeFileSync(join(directory, 'migration-manifest.json'), JSON.stringify(manifest));
    expect(() => verifyCompiledMigrations(directory)).toThrow('incomplete');
  });
  it('rejects an empty manifest and paths outside the migration directory', () => {
    for (const files of [[], [{ name: '../outside.js', sha256: 'a'.repeat(64) }]]) {
      writeFileSync(
        join(directory, 'migration-manifest.json'),
        JSON.stringify({ version: 1, files }),
      );
      expect(() => verifyCompiledMigrations(directory)).toThrow('Invalid');
    }
  });
});
