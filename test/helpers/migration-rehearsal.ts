import type { DataSource, MigrationInterface } from 'typeorm';

/** Rehearse the named policy even after later additive migrations have been introduced. */
export async function rehearseMigration(
  db: DataSource,
  migration: MigrationInterface,
  direction: 'up' | 'down',
): Promise<void> {
  await db.transaction(async (m) => {
    if (!m.queryRunner) throw new Error('Migration rehearsal requires a transaction');
    await migration[direction](m.queryRunner);
  });
}
