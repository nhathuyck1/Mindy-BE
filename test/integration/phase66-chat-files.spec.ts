import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { chatDatabase } from '../helpers/chat-fixture.js';
import { chatServices } from '../helpers/chat-services.js';
import { fileConfig, storageFixture, upload } from '../helpers/files-fixture.js';
import { separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase6'))(
  'Phase 6 image/PDF isolated PostgreSQL and versioned MinIO',
  () => {
    let db: DataSource,
      remote: Awaited<ReturnType<typeof storageFixture>>,
      s: ReturnType<typeof chatServices>,
      config: ConfigService;
    beforeAll(async () => {
      db = await chatDatabase();
      config = fileConfig({
        CHAT_ENABLED: true,
        CHAT_ATTACHMENTS_ENABLED: true,
        CHAT_ENCRYPTION_KEYS: JSON.stringify({ 1: randomBytes(32).toString('base64') }),
      });
      remote = await storageFixture(config);
      s = chatServices(db, config, remote.storage);
    }, 60000);
    afterAll(async () => {
      if (remote) await remote.cleanup();
      if (db?.isInitialized) await db.destroy();
    }, 30000);
    async function setup() {
      const order = await s.f.order({ paymentType: PaymentType.CASH }),
        id = order.classIds[0] ?? '';
      const student: AuthenticatedUser = {
        userId: order.student.id,
        role: UserRole.STUDENT,
        sessionId: randomUUID(),
      };
      const mentor: AuthenticatedUser = {
        userId: order.mentor.id,
        role: UserRole.MENTOR,
        sessionId: randomUUID(),
      };
      for (const actor of [student, mentor])
        await db.query(
          `INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')`,
          [actor.sessionId, actor.userId],
        );
      await s.lifecycle.reconcileClass(id);
      const conversation = await s.chat.classChat(student, id);
      return { order, student, mentor, id: conversation.id, classId: id };
    }
    async function ready(
      actor: AuthenticatedUser,
      id: string,
      bytes: Buffer,
      name: string,
      mime: string,
    ) {
      const key = randomUUID(),
        declaration = {
          originalFilename: name,
          declaredMimeType: mime,
          declaredSizeBytes: bytes.length,
        };
      const intent = await s.attachments.intent(actor, id, declaration, key);
      const replay = await s.attachments.intent(actor, id.toUpperCase(), declaration, key);
      expect(replay.fileId).toBe(intent.fileId);
      expect(replay.replayed).toBe(true);
      await expect(
        s.attachments.intent(
          actor,
          id,
          { ...declaration, declaredSizeBytes: bytes.length + 1 },
          key,
        ),
      ).rejects.toMatchObject({ status: 409 });
      await upload(intent.uploadUrl, mime, bytes);
      expect((await s.attachments.complete(actor, id, intent.fileId)).status).toBe('PROCESSING');
      expect((await s.attachments.complete(actor, id, intent.fileId)).status).toBe('PROCESSING');
      expect(
        await db.query("SELECT id FROM chat_jobs WHERE consumer='UPLOAD' AND event_id=$1", [
          intent.fileId,
        ]),
      ).toHaveLength(1);
      await expect(
        s.chat.send(actor, id, {
          clientMessageId: randomUUID(),
          type: 'IMAGE',
          fileObjectId: intent.fileId,
        }),
      ).rejects.toMatchObject({ status: 409 });
      const job = await s.jobs.claim('UPLOAD');
      if (!job) throw new Error('Missing upload job');
      await s.attachments.process(job);
      await s.jobs.complete(job);
      return { intent, status: await s.attachments.status(actor, id, intent.fileId) };
    }
    it('validates real images/PDF, pins the completed version, and signs only visible attached messages', async () => {
      const f = await setup(),
        bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } })
          .png()
          .toBuffer();
      const file = await ready(f.student, f.id, bytes, 'image.png', 'image/png');
      expect(file.status.status).toBe('READY');
      await expect(
        db.query('UPDATE chat_file_objects SET object_version_id=$2 WHERE id=$1', [
          file.intent.fileId,
          randomUUID(),
        ]),
      ).rejects.toMatchObject({ code: '23514' });
      await upload(file.intent.uploadUrl, 'image/png', Buffer.alloc(bytes.length, 65));
      const sent = await s.chat.send(f.student, f.id, {
        clientMessageId: randomUUID(),
        type: 'IMAGE',
        fileObjectId: file.intent.fileId,
      });
      const replay = await s.chat.send(f.student, f.id, {
        clientMessageId: sent.message.clientMessageId ?? '',
        type: 'IMAGE',
        fileObjectId: file.intent.fileId,
      });
      expect(replay.replayed).toBe(true);
      expect(replay.message.id).toBe(sent.message.id);
      expect(
        await db.query('SELECT id FROM chat_messages WHERE file_object_id=$1', [
          file.intent.fileId,
        ]),
      ).toHaveLength(1);
      expect(
        await db.query(
          "SELECT id FROM chat_jobs WHERE consumer='NOTIFICATION' AND event_id=(SELECT id FROM chat_events WHERE message_id=$1 AND type='message:created')",
          [sent.message.id],
        ),
      ).toHaveLength(1);
      expect(sent.message.body).toBeNull();
      expect(sent.message.file?.kind).toBe('IMAGE');
      const link = await s.attachments.sign(f.mentor, f.id, sent.message.id);
      expect(new URL(link.url).searchParams.get('X-Amz-Expires')).toBe('60');
      expect(Buffer.from(await (await fetch(link.url)).arrayBuffer()).equals(bytes)).toBe(true);
      await db.query("UPDATE classes SET status='COMPLETED' WHERE id=$1", [f.classId]);
      expect((await s.attachments.sign(f.mentor, f.id, sent.message.id)).url).toBeTruthy();
      await expect(
        s.attachments.intent(f.student, f.id, {
          originalFilename: 'closed.png',
          declaredMimeType: 'image/png',
          declaredSizeBytes: bytes.length,
        }),
      ).rejects.toMatchObject({ status: 403 });
      await db.query("UPDATE classes SET status='OPEN' WHERE id=$1", [f.classId]);
      expect(
        await db.query('SELECT 1 FROM file_objects WHERE id=$1', [file.intent.fileId]),
      ).toHaveLength(0);
      const pdf = await PDFDocument.create();
      pdf.addPage([100, 100]);
      expect(
        (
          await ready(
            f.student,
            f.id,
            Buffer.from(await pdf.save()),
            'document.pdf',
            'application/pdf',
          )
        ).status.status,
      ).toBe('READY');
      await s.chat.mutate(f.student, f.id, sent.message.id, randomUUID(), 1, null);
      await expect(s.attachments.sign(f.mentor, f.id, sent.message.id)).rejects.toMatchObject({
        status: 404,
      });
    });
    it('rejects MIME spoofing, foreign files, cross-conversation scope and completed uploads', async () => {
      const f = await setup(),
        other = await setup();
      const invalid = await ready(
        f.student,
        f.id,
        Buffer.from('not an image'),
        'fake.png',
        'image/png',
      );
      expect(invalid.status.status).toBe('FAILED');
      await expect(
        s.chat.send(f.student, f.id, {
          clientMessageId: randomUUID(),
          type: 'IMAGE',
          fileObjectId: invalid.intent.fileId,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        s.attachments.status(other.student, f.id, invalid.intent.fileId),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        s.attachments.status(other.student, other.id, invalid.intent.fileId),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        s.chat.send(other.student, other.id, {
          clientMessageId: randomUUID(),
          type: 'IMAGE',
          fileObjectId: invalid.intent.fileId,
        }),
      ).rejects.toMatchObject({ status: 404 });
      const materialId = randomUUID();
      await db.query(
        `INSERT INTO file_objects(id,owner_user_id,course_unit_id,bucket,staging_key,original_name,extension,declared_mime_type,declared_size_bytes,intent_expires_at,status,mime_type,size_bytes,kind,sha256,object_key,object_version_id,staging_version_id,ready_at)
        SELECT $1,$2,course_unit_id,'mindy-purpose-test',$3,'material.pdf','pdf','application/pdf',1,clock_timestamp()+interval '1 hour','READY','application/pdf',1,'PDF',repeat('a',64),$3,$4,$4,clock_timestamp()
        FROM class_units WHERE class_id=$5 LIMIT 1`,
        [materialId, f.mentor.userId, randomUUID(), randomUUID(), f.classId],
      );
      await expect(
        s.chat.send(f.mentor, f.id, {
          clientMessageId: randomUUID(),
          type: 'FILE',
          fileObjectId: materialId,
        }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        s.attachments.intent(f.student, f.id, {
          originalFilename: 'x.svg',
          declaredMimeType: 'image/svg+xml',
          declaredSizeBytes: 10,
        }),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        s.attachments.intent(f.student, f.id, {
          originalFilename: 'x.png',
          declaredMimeType: 'image/png',
          declaredSizeBytes: 5242881,
        }),
      ).rejects.toMatchObject({ status: 422 });
      await db.query("UPDATE classes SET status='COMPLETED' WHERE id=$1", [f.classId]);
      await expect(
        s.attachments.complete(f.student, f.id, invalid.intent.fileId),
      ).rejects.toMatchObject({ status: 403 });
    });
    it('denies new signing after source revoke or a new history window while issued URLs retain their bounded TTL', async () => {
      const f = await setup();
      const bytes = await sharp({
        create: { width: 1, height: 1, channels: 3, background: 'green' },
      })
        .png()
        .toBuffer();
      const file = await ready(f.mentor, f.id, bytes, 'mentor.png', 'image/png');
      await expect(
        s.chat.send(f.student, f.id, {
          clientMessageId: randomUUID(),
          type: 'IMAGE',
          fileObjectId: file.intent.fileId,
        }),
      ).rejects.toMatchObject({ status: 404 });
      const sent = await s.chat.send(f.mentor, f.id, {
        clientMessageId: randomUUID(),
        type: 'IMAGE',
        fileObjectId: file.intent.fileId,
      });
      const issued = await s.attachments.sign(f.student, f.id, sent.message.id);
      expect(new URL(issued.url).searchParams.get('X-Amz-Expires')).toBe('60');
      await db.query('UPDATE orders SET expires_at=clock_timestamp() WHERE id=$1', [
        f.order.order.id,
      ]);
      await expect(s.attachments.sign(f.student, f.id, sent.message.id)).rejects.toMatchObject({
        status: 404,
      });
      expect((await fetch(issued.url)).status).toBe(200);
      await db.query("UPDATE enrollments SET status='CANCELLED' WHERE student_id=$1", [
        f.student.userId,
      ]);
      await db.query("UPDATE enrollments SET status='ACTIVE' WHERE student_id=$1", [
        f.student.userId,
      ]);
      await s.lifecycle.reconcileClass(f.classId);
      await expect(s.attachments.sign(f.student, f.id, sent.message.id)).rejects.toMatchObject({
        status: 404,
      });
    });
    it('serializes an in-flight attach ahead of cleanup and refuses attaches after cleanup claims deletion', async () => {
      const f = await setup();
      const bytes = await sharp({
        create: { width: 1, height: 1, channels: 3, background: 'blue' },
      })
        .png()
        .toBuffer();
      const live = await ready(f.student, f.id, bytes, 'race.png', 'image/png');
      const lock = db.createQueryRunner();
      await lock.connect();
      await lock.startTransaction();
      await lock.query('SELECT id FROM chat_file_objects WHERE id=$1 FOR UPDATE', [
        live.intent.fileId,
      ]);
      const send = s.chat.send(f.student, f.id, {
        clientMessageId: randomUUID(),
        type: 'IMAGE',
        fileObjectId: live.intent.fileId,
      });
      async function waitForWaiters(expected: number): Promise<void> {
        for (let i = 0; i < 60; i++) {
          const rows: { count: string }[] = await db.query(
            "SELECT count(*)::text FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%chat_file_objects%' AND pid<>pg_backend_pid()",
          );
          if (Number(rows[0]?.count) >= expected) return;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error('Missing file lock barrier');
      }
      const queued: { id: string }[] = await db.query(
        "INSERT INTO chat_jobs(consumer,event_id,conversation_id) VALUES('CLEANUP',$1,$2) RETURNING id",
        [live.intent.fileId, f.id],
      );
      const job = await s.jobs.claim('CLEANUP');
      if (!job || job.id !== queued[0]?.id) throw new Error('Missing cleanup job');
      let cleanup: Promise<void> | undefined;
      try {
        await waitForWaiters(1);
        cleanup = s.attachments.cleanup(job);
        await waitForWaiters(2);
      } finally {
        await lock.commitTransaction();
        await lock.release();
      }
      const sent = await send;
      await cleanup;
      await s.jobs.complete(job);
      expect((await s.attachments.status(f.student, f.id, live.intent.fileId)).status).toBe(
        'READY',
      );
      expect(sent.message.file?.id).toBe(live.intent.fileId);

      const orphan = await ready(f.student, f.id, bytes, 'orphan.png', 'image/png');
      await db.query(
        "INSERT INTO chat_jobs(consumer,event_id,conversation_id) VALUES('CLEANUP',$1,$2)",
        [orphan.intent.fileId, f.id],
      );
      const deleting = await s.jobs.claim('CLEANUP');
      if (!deleting) throw new Error('Missing deletion job');
      let reached: () => void = () => {},
        release: () => void = () => {};
      const barrier = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = remote.storage.deleteVersion.bind(remote.storage);
      const spy = vi.spyOn(remote.storage, 'deleteVersion').mockImplementation(async (input) => {
        reached();
        await released;
        return original(input);
      });
      const deletion = s.attachments.cleanup(deleting);
      try {
        await barrier;
        await expect(
          s.chat.send(f.student, f.id, {
            clientMessageId: randomUUID(),
            type: 'IMAGE',
            fileObjectId: orphan.intent.fileId,
          }),
        ).rejects.toMatchObject({ status: 409 });
      } finally {
        release();
        await deletion;
        spy.mockRestore();
      }
      expect((await s.attachments.status(f.student, f.id, orphan.intent.fileId)).status).toBe(
        'DELETED',
      );
      await s.jobs.complete(deleting);
    }, 20000);
    it('rechecks orphan references under the file lock and preserves live attachments', async () => {
      const f = await setup(),
        bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: 'red' } })
          .png()
          .toBuffer();
      const live = await ready(f.student, f.id, bytes, 'live.png', 'image/png');
      const sent = await s.chat.send(f.student, f.id, {
        clientMessageId: randomUUID(),
        type: 'IMAGE',
        fileObjectId: live.intent.fileId,
      });
      await db.query(
        "UPDATE chat_file_objects SET created_at=clock_timestamp()-interval '2 days' WHERE id=$1",
        [live.intent.fileId],
      );
      await s.attachments.enqueueCleanup();
      expect(await s.jobs.claim('CLEANUP')).toBeNull();
      // A candidate queued before the attach must recheck its live reference at claim time.
      await db.query(
        "INSERT INTO chat_jobs(consumer,event_id,conversation_id) VALUES('CLEANUP',$1,$2)",
        [live.intent.fileId, f.id],
      );
      const raced = await s.jobs.claim('CLEANUP');
      if (!raced) throw new Error('Missing raced cleanup');
      await s.attachments.cleanup(raced);
      await s.jobs.complete(raced);
      expect((await s.attachments.status(f.student, f.id, live.intent.fileId)).status).toBe(
        'READY',
      );
      await s.chat.mutate(f.student, f.id, sent.message.id, randomUUID(), 1, null);
      await s.attachments.enqueueCleanup();
      const job = await s.jobs.claim('CLEANUP');
      if (!job) throw new Error('Missing cleanup job');
      expect(job.id).toBe(raced.id);
      await s.attachments.cleanup(job);
      await s.jobs.complete(job);
      expect((await s.attachments.status(f.student, f.id, live.intent.fileId)).status).toBe(
        'DELETED',
      );
    });
  },
);
