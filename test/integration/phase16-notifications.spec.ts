import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import type { DataSource, MigrationInterface } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BusinessNotifications1795132800000 } from '../../src/database/migrations/1795132800000-business-notifications.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

function migrationClass(value: unknown): value is new () => MigrationInterface {
  if (typeof value !== 'function') return false;
  const p: unknown = Reflect.get(value, 'prototype');
  return (
    p !== null &&
    typeof p === 'object' &&
    'up' in p &&
    typeof p.up === 'function' &&
    'down' in p &&
    typeof p.down === 'function'
  );
}
describe.skipIf(!separateTestUrl('phase16_migrations'))(
  'Phase 16 additive migration compatibility',
  () => {
    let db: DataSource;
    beforeAll(async () => {
      const catalog: (new () => MigrationInterface)[] = [];
      for (const name of (await readdir('src/database/migrations'))
        .filter((n) => n.endsWith('.ts') && !n.startsWith('1795132800000'))
        .sort()) {
        const module: Record<string, unknown> = await import(
          `../../src/database/migrations/${name.slice(0, -3)}.ts`
        );
        catalog.push(...Object.values(module).filter(migrationClass));
      }
      db = await paymentDatabase('phase16_migrations', {
        migrations: catalog.filter((m) => m.name !== 'MentorLeave1792195200000'),
      });
    }, 45000);
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });
    it('preserves legacy chat IDs, read state, FK and unique guarantees on upgrade and repeat', async () => {
      const f = paymentFixture(db),
        order = await f.order({ paymentType: PaymentType.CASH });
      const conv = randomUUID(),
        message = randomUUID(),
        id = randomUUID();
      await db.query("INSERT INTO chat_conversations(id,type,class_id) VALUES($1,'CLASS',$2)", [
        conv,
        order.classIds[0],
      ]);
      await db.query(
        `INSERT INTO chat_messages(id,conversation_id,sender_id,client_message_id,sequence,last_changed_seq,
      ciphertext,iv,tag,key_version,crypto_version) VALUES($1,$2,$3,$4,1,1,$5,$6,$7,1,1)`,
        [
          message,
          conv,
          order.mentor.id,
          randomUUID(),
          Buffer.from('cipher'),
          Buffer.alloc(12),
          Buffer.alloc(16),
        ],
      );
      await db.query(
        'INSERT INTO notifications(id,user_id,actor_id,conversation_id,message_id,read_at) VALUES($1,$2,$3,$4,$5,clock_timestamp())',
        [id, order.student.id, order.mentor.id, conv, message],
      );
      const [before] = await db.query('SELECT * FROM notifications WHERE id=$1', [id]);
      const runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await new BusinessNotifications1795132800000().up(runner);
        await runner.commitTransaction();
      } catch (error) {
        await runner.rollbackTransaction();
        throw error;
      } finally {
        await runner.release();
      }
      const [after] = await db.query('SELECT * FROM notifications WHERE id=$1', [id]);
      for (const key of [
        'id',
        'read_at',
        'created_at',
        'actor_id',
        'conversation_id',
        'message_id',
      ])
        expect(after[key]).toEqual(before[key]);
      expect(after.event_id).toBeNull();
      await expect(
        db.query(
          'INSERT INTO notifications(user_id,actor_id,conversation_id,message_id) VALUES($1,$2,$3,$4)',
          [order.student.id, order.mentor.id, conv, message],
        ),
      ).rejects.toThrow();
      await expect(
        db.query("INSERT INTO notifications(user_id,type) VALUES($1,'SESSION_CANCELLED')", [
          order.student.id,
        ]),
      ).rejects.toThrow();
      // Record the new migration through TypeORM, then prove a second runner is a no-op.
      await db.query('INSERT INTO migrations(timestamp,name) VALUES($1,$2)', [
        1795132800000,
        'BusinessNotifications1795132800000',
      ]);
      expect(await db.runMigrations()).toEqual([]);
      const clean = db.createQueryRunner();
      await clean.connect();
      await clean.startTransaction();
      try {
        await new BusinessNotifications1795132800000().down(clean);
        await clean.rollbackTransaction();
      } finally {
        await clean.release();
      }
      expect(
        (await db.query('SELECT count(*)::int n FROM notifications WHERE id=$1', [id]))[0].n,
      ).toBe(1);
    });
  },
);
