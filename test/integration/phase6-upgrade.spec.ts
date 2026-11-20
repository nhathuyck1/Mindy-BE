import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { CHAT_MIGRATIONS } from '../helpers/chat-migrations.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase6_upgrade'))('Phase 6 populated Phase 5 upgrade', () => {
  let db: DataSource;
  beforeAll(async () => {
    db = await paymentDatabase('phase6_upgrade', {
      migrations: CHAT_MIGRATIONS.filter(
        (m) => !m.name.startsWith('Chat') && !m.name.startsWith('MentorLeave'),
      ),
    });
  }, 60000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  it('upgrades populated pre-chat rows through all three chat migrations and repeats as a no-op', async () => {
    const f = paymentFixture(db);
    const order = await f.order({ paymentType: PaymentType.CASH });
    await db.query(
      `INSERT INTO file_objects(owner_user_id,course_unit_id,bucket,staging_key,original_name,extension,declared_mime_type,declared_size_bytes,intent_expires_at,status,mime_type,size_bytes,kind,sha256,object_key,object_version_id,staging_version_id,ready_at)
      SELECT $1,course_unit_id,'mindy-upgrade-test',$2,'legacy.pdf','pdf','application/pdf',1,clock_timestamp()+interval '1 hour','READY','application/pdf',1,'PDF',repeat('a',64),$2,$3,$3,clock_timestamp()
      FROM class_units WHERE class_id=$4 LIMIT 1`,
      [order.mentor.id, randomUUID(), randomUUID(), order.classIds[0]],
    );
    const tables = [
      'users',
      'courses',
      'course_units',
      'classes',
      'class_units',
      'class_sessions',
      'orders',
      'order_details',
      'enrollments',
      'file_objects',
      'assignments',
    ];
    async function snapshot(): Promise<string[]> {
      return Promise.all(
        tables.map(async (table) =>
          JSON.stringify(await db.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY id`)),
        ),
      );
    }
    const before = await snapshot();
    db.setOptions({ migrations: CHAT_MIGRATIONS });
    // Reinitialize so TypeORM discovers the newly supplied migration constructors.
    await db.destroy();
    await db.initialize();
    expect((await db.runMigrations()).map((m) => m.name)).toEqual([
      'ChatFoundation1792800000000',
      'ChatLifecycle1792800000001',
      'ChatAttachments1792800000002',
    ]);
    expect(await snapshot()).toEqual(before);
    expect(await db.runMigrations()).toHaveLength(0);
    for (const table of [
      'chat_conversations',
      'chat_messages',
      'chat_file_objects',
      'notifications',
    ])
      expect(await db.query(`SELECT 1 FROM ${table}`)).toHaveLength(0);
  }, 30000);
});
