import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { ChatCryptoService } from '../modules/chat/services/chat-crypto.service.js';
import { ChatLifecycleService } from '../modules/chat/services/chat-lifecycle.service.js';

/** Explicit bounded maintenance only. Default mode is dry-run; never output bodies or secrets. */
const command = process.argv[2] ?? 'metrics',
  apply = process.argv.includes('--apply');
const option = (name: string) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const limit = Number(option('limit') ?? 20),
  after = option('after');
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (after && !isUUID(after, '4')))
  throw new Error('Expected --limit=1..100 and optional --after=UUIDv4');
if (!['metrics', 'backfill', 'rotate', 'replay', 'retention'].includes(command))
  throw new Error('Unknown chat maintenance command');
process.env.CHAT_JOB_ENABLED = 'false';
process.env.ORDER_EXPIRY_JOB_ENABLED = 'false';
process.env.PAYMENT_MAIL_JOB_ENABLED = 'false';
process.env.FILE_JOB_ENABLED = 'false';
process.env.ASSIGNMENT_TIMEOUT_JOB_ENABLED = 'false';
const { AppModule } = await import('../app.module.js');
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
try {
  const db = app.get(DataSource),
    crypto = app.get(ChatCryptoService);
  if (command === 'metrics') {
    const jobs = await db.query(
      `SELECT consumer,status,count(*)::text AS count,min(created_at) AS oldest FROM chat_jobs GROUP BY consumer,status`,
    );
    const usage = await db.query(
      `SELECT key_version,encryptions::text FROM chat_key_usage ORDER BY key_version`,
    );
    const dependencies =
      await db.query(`SELECT (outcome->>'keyVersion')::int AS key_version,count(*)::text AS receipts
      FROM mutation_receipts WHERE namespace='chat' GROUP BY outcome->>'keyVersion'`);
    console.log(JSON.stringify({ jobs, usage, receiptKeyDependencies: dependencies }));
  } else if (command === 'backfill') {
    console.log(
      JSON.stringify({
        dryRun: !apply,
        ...(await app.get(ChatLifecycleService).backfill(after ?? null, limit, !apply)),
      }),
    );
  } else if (command === 'rotate') {
    const rows: {
      id: string;
      conversation_id: string;
      sender_id: string;
      version: number;
      ciphertext: Buffer;
      iv: Buffer;
      tag: Buffer;
      key_version: number;
      crypto_version: number;
    }[] = await db.query(
      `SELECT * FROM chat_messages WHERE deleted_at IS NULL AND key_version<>$1
        AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,
      [crypto.activeKeyVersion, after ?? null, limit],
    );
    let changed = 0;
    if (apply)
      for (const row of rows)
        await db.transaction(async (m) => {
          await m.query('SELECT id FROM chat_conversations WHERE id=$1 FOR UPDATE', [
            row.conversation_id,
          ]);
          const current: { version: number; key_version: number; deleted_at: Date | null }[] =
            await m.query('SELECT * FROM chat_messages WHERE id=$1 FOR UPDATE', [row.id]);
          if (
            !current[0] ||
            current[0].deleted_at ||
            current[0].version !== row.version ||
            current[0].key_version !== row.key_version
          )
            return;
          const identity = {
            messageId: row.id,
            conversationId: row.conversation_id,
            senderId: row.sender_id,
          };
          const body = crypto.decrypt(identity, {
            ciphertext: row.ciphertext,
            iv: row.iv,
            tag: row.tag,
            keyVersion: row.key_version,
            cryptoVersion: row.crypto_version,
          });
          await crypto.reserveEncryption(m);
          const encrypted = crypto.encrypt(identity, body);
          await m.query(
            'UPDATE chat_messages SET ciphertext=$2,iv=$3,tag=$4,key_version=$5,crypto_version=$6 WHERE id=$1',
            [
              row.id,
              encrypted.ciphertext,
              encrypted.iv,
              encrypted.tag,
              encrypted.keyVersion,
              encrypted.cryptoVersion,
            ],
          );
          changed++;
        });
    console.log(
      JSON.stringify({
        dryRun: !apply,
        candidates: rows.length,
        changed,
        nextCursor: rows.at(-1)?.id ?? null,
      }),
    );
  } else if (command === 'replay') {
    const rows: { id: string }[] = await db.query(
      `SELECT id FROM chat_jobs WHERE status='DEAD'
      AND ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT $2`,
      [after ?? null, limit],
    );
    if (apply)
      await db.query(
        `UPDATE chat_jobs SET status='PENDING',attempts=0,next_attempt_at=clock_timestamp(),last_error_code=NULL
      WHERE status='DEAD' AND id=ANY($1::uuid[])`,
        [rows.map((r) => r.id)],
      );
    console.log(
      JSON.stringify({
        dryRun: !apply,
        candidates: rows.length,
        nextCursor: rows.at(-1)?.id ?? null,
      }),
    );
  } else {
    const candidates: { id: string }[] = await db.query(
      `SELECT id FROM chat_conversations WHERE ($1::uuid IS NULL OR id>$1)
      AND EXISTS(SELECT 1 FROM chat_events e WHERE e.conversation_id=chat_conversations.id AND e.created_at<clock_timestamp()-interval '90 days')
      ORDER BY id LIMIT $2`,
      [after ?? null, limit],
    );
    if (apply) {
      for (const row of candidates)
        await db.transaction(async (m) => {
          await m.query('SELECT id FROM chat_conversations WHERE id=$1 FOR UPDATE', [row.id]);
          await m.query(
            `WITH expired AS (DELETE FROM chat_events WHERE conversation_id=$1
          AND created_at<clock_timestamp()-interval '90 days' RETURNING sequence)
          UPDATE chat_conversations SET events_pruned_through_seq=GREATEST(events_pruned_through_seq,
            COALESCE((SELECT max(sequence) FROM expired),0)) WHERE id=$1`,
            [row.id],
          );
        });
      await db.query(
        `DELETE FROM chat_jobs WHERE id IN (SELECT id FROM chat_jobs WHERE status='DONE'
        AND completed_at<clock_timestamp()-interval '30 days' ORDER BY id LIMIT $1)`,
        [limit],
      );
      await db.query(
        `DELETE FROM notifications WHERE id IN (SELECT id FROM notifications WHERE created_at<clock_timestamp()-interval '90 days' ORDER BY id LIMIT $1)`,
        [limit],
      );
    }
    console.log(
      JSON.stringify({
        dryRun: !apply,
        candidates: candidates.length,
        nextCursor: candidates.at(-1)?.id ?? null,
      }),
    );
  }
} finally {
  await app.close();
}
