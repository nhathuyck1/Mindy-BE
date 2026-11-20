import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { verifyCompiledMigrations } from '../../dist/database/migration-artifacts.js';
import { ChatCryptoService } from '../../dist/modules/chat/services/chat-crypto.service.js';
import { ChatReceiptService } from '../../dist/modules/chat/services/chat-receipt.service.js';

// Explicit local test only. Creates and removes only two randomly named databases for this run.
const base = new URL(process.env.TEST_DATABASE_URL ?? '');
if (!['127.0.0.1', 'localhost'].includes(base.hostname) || !/^\/\w+_test$/.test(base.pathname))
  throw new Error('A local dedicated TEST_DATABASE_URL ending in _test is required');
const exec = promisify(execFile);
const binary = (name) =>
  process.env.PG_BIN_DIRECTORY
    ? join(process.env.PG_BIN_DIRECTORY, `${name}${process.platform === 'win32' ? '.exe' : ''}`)
    : name;
const run = randomUUID().replaceAll('-', '').slice(0, 12);
const names = [`mindy_chat_${run}_test`, `mindy_chat_${run}_restore_test`];
const created = [];
const admin = new DataSource({ type: 'postgres', url: base.toString() });
let source, restored, scratch;
const keys = { 1: randomBytes(32).toString('base64'), 2: randomBytes(32).toString('base64') };
const crypto = (active, ring = keys) =>
  new ChatCryptoService(
    new ConfigService({
      CHAT_ENABLED: true,
      CHAT_ENCRYPTION_ACTIVE_KEY_VERSION: active,
      CHAT_ENCRYPTION_KEYS: JSON.stringify(ring),
    }),
  );
try {
  await admin.initialize();
  for (const name of names) {
    if (!/^mindy_chat_[a-f0-9]{12}_(restore_)?test$/.test(name))
      throw new Error('Unsafe test DB name');
    await admin.query(`CREATE DATABASE "${name}"`);
    created.push(name);
  }
  const sourceUrl = new URL(base),
    restoreUrl = new URL(base);
  sourceUrl.pathname = `/${names[0]}`;
  restoreUrl.pathname = `/${names[1]}`;
  const migrations = [];
  for (const file of verifyCompiledMigrations(resolve('dist/database'))) {
    const module = await import(new URL(`../../dist/database/migrations/${file}`, import.meta.url));
    migrations.push(...Object.values(module).filter((value) => typeof value === 'function'));
  }
  source = new DataSource({
    type: 'postgres',
    url: sourceUrl.toString(),
    migrations,
    synchronize: false,
  });
  await source.initialize();
  await source.runMigrations();
  assert.equal((await source.runMigrations()).length, 0);
  const sender = randomUUID(),
    peer = randomUUID(),
    conversationId = randomUUID(),
    messageId = randomUUID();
  const pair = [sender, peer].sort(),
    clientId = randomUUID();
  await source.query(
    `INSERT INTO users(id,email,display_name,role,status) VALUES
    ($1,'backup-student@example.test','Student','STUDENT','ACTIVE'),
    ($2,'backup-mentor@example.test','Mentor','MENTOR','ACTIVE')`,
    [sender, peer],
  );
  await source.query(
    `INSERT INTO chat_conversations(id,type,user_low,user_high,last_event_seq)
    VALUES($1,'DIRECT',$2,$3,1)`,
    [conversationId, ...pair],
  );
  const identity = { messageId, conversationId, senderId: sender },
    body = 'Backup rehearsal 🔐';
  const old = crypto(1),
    receipt = new ChatReceiptService(old),
    request = ['send', conversationId, 'TEXT', body];
  await source.transaction(async (manager) => {
    await old.reserveEncryption(manager);
    const encrypted = old.encrypt(identity, body);
    await manager.query(
      `INSERT INTO chat_messages(id,conversation_id,sender_id,client_message_id,sequence,last_changed_seq,
      ciphertext,iv,tag,key_version,crypto_version) VALUES($1,$2,$3,$4,1,1,$5,$6,$7,1,1)`,
      [
        messageId,
        conversationId,
        sender,
        clientId,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.tag,
      ],
    );
    await receipt.insert(manager, sender, `send/${conversationId}`, clientId, request, messageId);
  });
  const environment = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: sourceUrl.toString(),
    CORS_ORIGINS: 'http://localhost:3001',
    CHAT_ENABLED: 'true',
    CHAT_ENCRYPTION_KEYS: JSON.stringify(keys),
    CHAT_ENCRYPTION_ACTIVE_KEY_VERSION: '2',
    CHAT_JOB_ENABLED: 'false',
    MINIO_ENABLED: 'false',
    PAYOS_ENABLED: 'false',
    MAIL_ENABLED: 'false',
  };
  const ops = (args) =>
    exec(process.execPath, ['dist/operations/chat-maintenance.js', ...args], {
      env: environment,
      timeout: 30000,
      windowsHide: true,
    });
  const beforeOps = JSON.stringify(
    await source.query('SELECT to_jsonb(m) FROM chat_messages m ORDER BY id'),
  );
  await ops(['metrics']);
  await ops(['backfill', '--limit=10']);
  await ops(['backfill', '--limit=10', '--apply']);
  assert.equal(
    JSON.stringify(await source.query('SELECT to_jsonb(m) FROM chat_messages m ORDER BY id')),
    beforeOps,
  );
  const deadId = randomUUID();
  await source.query(
    "INSERT INTO chat_jobs(id,consumer,event_id,conversation_id,status,attempts) VALUES($1,'REALTIME',$2,$3,'DEAD',8)",
    [deadId, randomUUID(), conversationId],
  );
  await ops(['replay', '--limit=10']);
  assert.equal(
    (await source.query('SELECT status FROM chat_jobs WHERE id=$1', [deadId]))[0].status,
    'DEAD',
  );
  await ops(['replay', '--limit=10', '--apply']);
  const replayed = (
    await source.query('SELECT status,attempts FROM chat_jobs WHERE id=$1', [deadId])
  )[0];
  assert.equal(replayed.status, 'PENDING');
  assert.equal(replayed.attempts, 0);
  await exec(
    process.execPath,
    ['dist/operations/chat-maintenance.js', 'rotate', '--apply', '--limit=10'],
    { env: environment, timeout: 30000, windowsHide: true },
  );
  const [rotated] = await source.query('SELECT key_version FROM chat_messages WHERE id=$1', [
    messageId,
  ]);
  assert.equal(rotated.key_version, 2);
  scratch = await mkdtemp(join(tmpdir(), 'mindy-chat-restore-'));
  const dump = join(scratch, 'database.dump');
  const pgEnv = {
    ...process.env,
    PGHOST: base.hostname,
    PGPORT: base.port || '5432',
    PGUSER: decodeURIComponent(base.username),
    PGPASSWORD: decodeURIComponent(base.password),
  };
  await exec(
    binary('pg_dump'),
    ['--format=custom', '--no-owner', '--no-privileges', `--file=${dump}`, `--dbname=${names[0]}`],
    { env: pgEnv, timeout: 30000, windowsHide: true },
  );
  await exec(
    binary('pg_restore'),
    ['--exit-on-error', '--no-owner', '--no-privileges', `--dbname=${names[1]}`, dump],
    { env: pgEnv, timeout: 30000, windowsHide: true },
  );
  restored = new DataSource({ type: 'postgres', url: restoreUrl.toString(), synchronize: false });
  await restored.initialize();
  const [row] = await restored.query('SELECT * FROM chat_messages WHERE id=$1', [messageId]);
  const payload = {
    ciphertext: row.ciphertext,
    iv: row.iv,
    tag: row.tag,
    keyVersion: row.key_version,
    cryptoVersion: row.crypto_version,
  };
  const recovered = crypto(2);
  assert.ok(
    recovered.decrypt(identity, payload) === body,
    'Restored keyring must decrypt the restored DB',
  );
  assert.equal(
    await new ChatReceiptService(recovered).lookup(
      restored.manager,
      sender,
      `send/${conversationId}`,
      clientId,
      request,
    ),
    messageId,
  );
  assert.throws(() =>
    crypto(2, { 2: randomBytes(32).toString('base64') }).decrypt(identity, payload),
  );
  assert.throws(() => crypto(2, { 2: keys[2] }).matches(request, old.fingerprint(request), 1));
  console.log(
    JSON.stringify({
      freshMigration: true,
      repeatNoop: true,
      rotation: true,
      databaseRestore: true,
      keyringRestore: true,
      oldReceiptKeyRequired: true,
      wrongKeyRejected: true,
      boundedBackfill: true,
      deadLetterReplay: true,
    }),
  );
} finally {
  if (source?.isInitialized) await source.destroy();
  if (restored?.isInitialized) await restored.destroy();
  if (admin.isInitialized) {
    for (const name of created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.destroy();
  }
  if (
    scratch &&
    resolve(scratch).startsWith(`${resolve(tmpdir())}${sep}`) &&
    basename(scratch).startsWith('mindy-chat-restore-')
  )
    await rm(scratch, { recursive: true, force: true });
}
