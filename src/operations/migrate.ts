import 'reflect-metadata';
import dataSource from '../database/data-source.js';
import { verifyCompiledMigrations } from '../database/migration-artifacts.js';

try {
  const files = verifyCompiledMigrations();
  console.log(`Verified ${files.length} compiled migration artifacts.`);
  await dataSource.initialize();
  if (dataSource.migrations.length !== files.length)
    throw new Error('TypeORM migration catalog does not match the compiled artifact manifest.');
  const executed = await dataSource.runMigrations({ transaction: 'all' });
  if (await dataSource.showMigrations())
    throw new Error('Pending migrations remain after rollout.');
  console.log(`Applied ${executed.length} migrations; none pending.`);
} catch (error: unknown) {
  // Avoid dumping the DataSource, production environment or SQL parameter values.
  console.error(
    'Migration rollout failed:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exitCode = 1;
} finally {
  if (dataSource.isInitialized) await dataSource.destroy();
}
