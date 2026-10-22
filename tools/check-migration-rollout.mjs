import { spawnSync } from 'node:child_process';
import pg from 'pg';

// CI-only smoke test. Never run this against an application database URL.
const base = process.env.TEST_DATABASE_URL;
if (!base) throw new Error('A dedicated TEST_DATABASE_URL is required.');
const original = new URL(base);
if (!/^\/\w+_test$/.test(original.pathname))
  throw new Error('Only a dedicated _test database is allowed.');
const database = `mindy_compiled_rollout_${process.pid}_${Date.now()}_test`;
if (!/^mindy_compiled_rollout_\d+_\d+_test$/.test(database))
  throw new Error('Invalid rollout test database.');
const target = new URL(original);
target.pathname = `/${database}`;
const admin = new pg.Client({ connectionString: base });
let created = false;
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const run = spawnSync(process.execPath, ['dist/operations/migrate.js'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: target.toString(),
        DATABASE_LOGGING: 'false',
      },
      stdio: 'inherit',
      timeout: 120000,
    });
    if (run.error) throw run.error;
    if (run.status !== 0) throw new Error(`Compiled migration rollout attempt ${attempt} failed.`);
  }
  const check = new pg.Client({ connectionString: target.toString() });
  try {
    await check.connect();
    const applied = await check.query('SELECT 1 FROM migrations WHERE name=$1', [
      'ConsolidateTracking1792627200002',
    ]);
    if (applied.rowCount !== 1) throw new Error('Tracking migration was not applied exactly once.');
    const relations = await check.query(`SELECT c.relname,c.relkind FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND c.relname IN ('audit_events','mutation_receipts','teaching_note_audits','teaching_note_receipts')`);
    const kinds = new Map(relations.rows.map((row) => [row.relname, row.relkind]));
    if (
      kinds.get('audit_events') !== 'r' ||
      kinds.get('mutation_receipts') !== 'r' ||
      kinds.get('teaching_note_audits') !== 'v' ||
      kinds.get('teaching_note_receipts') !== 'v'
    )
      throw new Error('Consolidated tracking schema was not installed correctly.');
    console.log(
      'Compiled migration rollout and repeat deploy passed on the isolated test database.',
    );
  } finally {
    await check.end();
  }
} finally {
  if (created) await admin.query(`DROP DATABASE "${database}"`);
  await admin.end();
}
