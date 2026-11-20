import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChatFoundation1792800000000 } from '../../src/database/migrations/1792800000000-chat-foundation.js';
import { ChatCryptoService } from '../../src/modules/chat/services/chat-crypto.service.js';
import { ChatEventService } from '../../src/modules/chat/services/chat-event.service.js';
import { ChatJobsService } from '../../src/modules/chat/services/chat-jobs.service.js';
import { ChatReceiptService } from '../../src/modules/chat/services/chat-receipt.service.js';
import { chatDatabase } from '../helpers/chat-fixture.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase6'))(
  'Phase 6 full catalog / encrypted storage PostgreSQL',
  () => {
    let db: DataSource,
      f: ReturnType<typeof paymentFixture>,
      crypto: ChatCryptoService,
      receipts: ChatReceiptService,
      events: ChatEventService,
      jobs: ChatJobsService;
    beforeAll(async () => {
      db = await chatDatabase(false);
      await rehearseMigration(db, new ChatFoundation1792800000000(), 'down');
      await rehearseMigration(db, new ChatFoundation1792800000000(), 'up');
      expect(await db.runMigrations()).toHaveLength(0);
      f = paymentFixture(db);
      crypto = new ChatCryptoService(
        new ConfigService({
          CHAT_ENABLED: true,
          CHAT_ENCRYPTION_ACTIVE_KEY_VERSION: 1,
          CHAT_ENCRYPTION_KEYS: JSON.stringify({ 1: randomBytes(32).toString('base64') }),
        }),
      );
      receipts = new ChatReceiptService(crypto);
      events = new ChatEventService();
      jobs = new ChatJobsService(db);
    }, 60000);
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });
    async function fixture() {
      const order = await f.order(),
        conversationId = randomUUID();
      await db.query(`INSERT INTO chat_conversations(id,type,class_id) VALUES($1,'CLASS',$2)`, [
        conversationId,
        order.classIds[0],
      ]);
      await db.query(`INSERT INTO chat_members(conversation_id,user_id) VALUES($1,$2),($1,$3)`, [
        conversationId,
        order.student.id,
        order.mentor.id,
      ]);
      return { order, conversationId };
    }
    it('enforces unique group/pair and composite reply scope at the database boundary', async () => {
      const { order, conversationId } = await fixture();
      await expect(
        db.query(`INSERT INTO chat_conversations(type,class_id) VALUES('CLASS',$1)`, [
          order.classIds[0],
        ]),
      ).rejects.toMatchObject({ code: '23505' });
      const pair = [order.student.id, order.mentor.id].sort();
      await db.query(
        `INSERT INTO chat_conversations(type,user_low,user_high) VALUES('DIRECT',$1,$2)`,
        pair,
      );
      await expect(
        db.query(
          `INSERT INTO chat_conversations(type,user_low,user_high) VALUES('DIRECT',$1,$2)`,
          pair,
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        db.query(
          `INSERT INTO chat_conversations(type,user_low,user_high) VALUES('DIRECT',$2,$1)`,
          pair,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        db.query(
          `INSERT INTO chat_messages(conversation_id,sender_id,client_message_id,sequence,last_changed_seq)
      VALUES($1,$2,$3,1,1)`,
          [conversationId, order.student.id, randomUUID()],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
    it('serializes sequences and HMAC receipts, rolls back all writes, and never persists the body', async () => {
      const { order, conversationId } = await fixture(),
        key = randomUUID(),
        request = ['TEXT', 'Nội dung riêng tư 🔐', null];
      async function send(fail = false) {
        return db.transaction(async (m) => {
          await m.query('SELECT id FROM chat_conversations WHERE id=$1 FOR UPDATE', [
            conversationId,
          ]);
          const prior = await receipts.lookup(
            m,
            order.student.id,
            `send/${conversationId}`,
            key,
            request,
          );
          if (prior) return prior;
          const sequence = await events.nextSequence(m, conversationId),
            id = randomUUID();
          const encrypted = crypto.encrypt(
            { messageId: id, conversationId, senderId: order.student.id },
            String(request[1]),
          );
          await m.query(
            `INSERT INTO chat_messages(id,conversation_id,sender_id,client_message_id,sequence,last_changed_seq,
          ciphertext,iv,tag,key_version,crypto_version) VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,1)`,
            [
              id,
              conversationId,
              order.student.id,
              key,
              sequence,
              encrypted.ciphertext,
              encrypted.iv,
              encrypted.tag,
              encrypted.keyVersion,
            ],
          );
          await receipts.insert(m, order.student.id, `send/${conversationId}`, key, request, id);
          await events.append(m, {
            conversationId,
            sequence,
            type: 'message:created',
            messageId: id,
            actorId: order.student.id,
            recipientIds: [order.mentor.id, order.student.id],
          });
          if (fail) throw new Error('injected rollback');
          return id;
        });
      }
      await expect(send(true)).rejects.toThrow('injected rollback');
      expect(
        await db.query('SELECT * FROM chat_messages WHERE conversation_id=$1', [conversationId]),
      ).toHaveLength(0);
      for (const table of ['chat_events', 'chat_jobs'])
        expect(
          await db.query(`SELECT id FROM ${table} WHERE conversation_id=$1`, [conversationId]),
        ).toHaveLength(0);
      expect(
        await db.query("SELECT key FROM mutation_receipts WHERE namespace='chat' AND route=$1", [
          `send/${conversationId}`,
        ]),
      ).toHaveLength(0);
      const ids = await Promise.all(Array.from({ length: 8 }, () => send()));
      expect(new Set(ids).size).toBe(1);
      await expect(
        db.query(
          `INSERT INTO chat_messages(id,conversation_id,sender_id,client_message_id,sequence,last_changed_seq,ciphertext,iv,tag,key_version,crypto_version)
        SELECT gen_random_uuid(),conversation_id,sender_id,gen_random_uuid(),sequence,last_changed_seq,ciphertext,iv,tag,key_version,crypto_version
        FROM chat_messages WHERE id=$1`,
          [ids[0]],
        ),
      ).rejects.toMatchObject({ code: '23505' });
      const other = await fixture();
      await expect(
        db.query(
          `INSERT INTO chat_messages(id,conversation_id,sender_id,client_message_id,sequence,last_changed_seq,reply_to_id,ciphertext,iv,tag,key_version,crypto_version)
        SELECT gen_random_uuid(),$2,sender_id,gen_random_uuid(),100,100,id,ciphertext,iv,tag,key_version,crypto_version
        FROM chat_messages WHERE id=$1`,
          [ids[0], other.conversationId],
        ),
      ).rejects.toMatchObject({ code: '23503' });
      expect(
        await db.query('SELECT * FROM chat_events WHERE conversation_id=$1', [conversationId]),
      ).toHaveLength(1);
      expect(
        await db.query('SELECT * FROM chat_jobs WHERE conversation_id=$1', [conversationId]),
      ).toHaveLength(2);
      await expect(
        receipts.lookup(db.manager, order.student.id, `send/${conversationId}`, key, ['different']),
      ).rejects.toMatchObject({ status: 409 });
      const dump = JSON.stringify(
        await db.query(
          `SELECT to_jsonb(m) AS data FROM chat_messages m WHERE conversation_id=$1
      UNION ALL SELECT to_jsonb(e) FROM chat_events e WHERE conversation_id=$1
      UNION ALL SELECT to_jsonb(j) FROM chat_jobs j WHERE conversation_id=$1
      UNION ALL SELECT to_jsonb(r) FROM mutation_receipts r WHERE namespace='chat'`,
          [conversationId],
        ),
      );
      expect(dump).not.toContain('Nội dung riêng tư');
      await expect(
        db.query(`UPDATE mutation_receipts SET outcome='{}' WHERE namespace='chat'`),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        rehearseMigration(db, new ChatFoundation1792800000000(), 'down'),
      ).rejects.toThrow('Chat history exists');
    });
    it('reclaims expired leases and fences stale owners, with independent consumer delivery', async () => {
      const first = await jobs.claim('REALTIME');
      expect(first).not.toBeNull();
      if (!first) return;
      expect(await jobs.claim('REALTIME')).toBeNull();
      expect(await jobs.claim('NOTIFICATION')).not.toBeNull();
      await db.query(
        `UPDATE chat_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1`,
        [first.id],
      );
      const second = await jobs.claim('REALTIME');
      expect(second?.id).toBe(first.id);
      if (!second) return;
      expect(second.lease_token).not.toBe(first.lease_token);
      expect(await jobs.complete(first)).toBe(false);
      expect(await jobs.checkpoint(second, 1)).toBe(true);
      expect(await jobs.complete(second)).toBe(true);
    });
    it('refuses further encryption after the durable per-key limit', async () => {
      await db.query(
        'INSERT INTO chat_key_usage(key_version,encryptions) VALUES(1,1000000) ON CONFLICT(key_version) DO UPDATE SET encryptions=1000000',
      );
      await expect(db.transaction((m) => crypto.reserveEncryption(m))).rejects.toMatchObject({
        status: 503,
      });
      expect(
        (await db.query('SELECT encryptions::text FROM chat_key_usage WHERE key_version=1'))[0]
          ?.encryptions,
      ).toBe('1000000');
    });
  },
);
