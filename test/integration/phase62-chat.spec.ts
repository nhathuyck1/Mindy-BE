import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AssignmentAccessService } from '../../src/modules/assignments/services/assignment-access.service.js';
import { AssignmentsService } from '../../src/modules/assignments/services/assignments.service.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { PasswordService } from '../../src/modules/auth/services/password.service.js';
import { SessionService } from '../../src/modules/auth/services/session.service.js';
import { TokenService } from '../../src/modules/auth/services/token.service.js';
import { ChatService } from '../../src/modules/chat/services/chat.service.js';
import { ChatAccessService } from '../../src/modules/chat/services/chat-access.service.js';
import { ChatAttachmentsService } from '../../src/modules/chat/services/chat-attachments.service.js';
import { ChatCryptoService } from '../../src/modules/chat/services/chat-crypto.service.js';
import { ChatCursorService } from '../../src/modules/chat/services/chat-cursor.service.js';
import { ChatEventService } from '../../src/modules/chat/services/chat-event.service.js';
import { ChatJobsService } from '../../src/modules/chat/services/chat-jobs.service.js';
import { ChatLifecycleService } from '../../src/modules/chat/services/chat-lifecycle.service.js';
import { ChatNotificationsService } from '../../src/modules/chat/services/chat-notifications.service.js';
import { ChatRateService } from '../../src/modules/chat/services/chat-rate.service.js';
import { ChatReceiptService } from '../../src/modules/chat/services/chat-receipt.service.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { OrdersService } from '../../src/modules/commerce/services/orders.service.js';
import { MinioFileStorage } from '../../src/modules/files/storage/minio-file-storage.js';
import { validateBinary } from '../../src/modules/files/validation/binary-validation.js';
import { PayosPaymentDetailEntity } from '../../src/modules/payments/entities/payos-payment-detail.entity.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { chatDatabase } from '../helpers/chat-fixture.js';
import { fileConfig } from '../helpers/files-fixture.js';
import { paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase6'))(
  'Phase 6 lifecycle, messages, mutations and inbox PostgreSQL',
  () => {
    let db: DataSource,
      f: ReturnType<typeof paymentFixture>,
      chat: ChatService,
      lifecycle: ChatLifecycleService,
      notifications: ChatNotificationsService,
      jobs: ChatJobsService;
    beforeAll(async () => {
      db = await chatDatabase();
      f = paymentFixture(db);
      const config = new ConfigService({
        CHAT_ENABLED: true,
        CHAT_ENCRYPTION_ACTIVE_KEY_VERSION: 1,
        CHAT_ENCRYPTION_KEYS: JSON.stringify({ 1: randomBytes(32).toString('base64') }),
      });
      const crypto = new ChatCryptoService(config),
        cursors = new ChatCursorService(crypto);
      const access = new ChatAccessService(
        config,
        f.read,
        f.enrollments,
        new OrdersService(db),
        f.users,
      );
      const password = new PasswordService(),
        tokens = new TokenService(config);
      const auth = new AuthService(
        db,
        config,
        f.users,
        password,
        tokens,
        new SessionService(config, password, tokens),
      );
      lifecycle = new ChatLifecycleService(db, access, f.read, f.users, new ChatEventService());
      chat = new ChatService(
        db,
        auth,
        access,
        crypto,
        new ChatReceiptService(crypto),
        new ChatEventService(),
        cursors,
        new ChatRateService(),
        f.users,
        f.read,
        new ChatAttachmentsService(
          db,
          fileConfig({ MINIO_ENABLED: false }),
          access,
          new ChatJobsService(db),
          new MinioFileStorage(fileConfig()),
          { validate: validateBinary },
          new ChatReceiptService(crypto),
        ),
      );
      notifications = new ChatNotificationsService(db, access, cursors);
      jobs = new ChatJobsService(db);
    }, 60000);
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });
    async function actor(userId: string, role: UserRole): Promise<AuthenticatedUser> {
      const sessionId = randomUUID();
      await db.query(
        `INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')`,
        [sessionId, userId],
      );
      return { userId, role, sessionId };
    }
    async function setup() {
      const order = await f.order({ paymentType: PaymentType.CASH }),
        id = order.classIds[0] ?? '';
      const student = await actor(order.student.id, UserRole.STUDENT),
        mentor = await actor(order.mentor.id, UserRole.MENTOR);
      await lifecycle.reconcileClass(id);
      const conversation = await chat.classChat(student, id);
      return { order, id, student, mentor, conversation };
    }
    async function fanout(messageId: string): Promise<void> {
      const rows = await db.query(
        `SELECT j.* FROM chat_jobs j JOIN chat_events e ON e.id=j.event_id
        WHERE j.consumer='NOTIFICATION' AND e.message_id=$1`,
        [messageId],
      );
      if (!rows[0]) throw new Error('Missing notification job');
      await notifications.fanout(rows[0]);
    }
    it('provisions CASH group and one DM idempotently without opening learning content', async () => {
      const s = await setup();
      expect(s.conversation.accessMode).toBe('CASH_PENDING');
      expect(s.conversation.capabilities.canSend).toBe(true);
      await Promise.all([lifecycle.reconcileClass(s.id), lifecycle.reconcileClass(s.id)]);
      const dm = await Promise.all(
        Array.from({ length: 4 }, () => lifecycle.ensureDirect(s.student.userId, s.mentor.userId)),
      );
      expect(new Set(dm.map((x) => x.id)).size).toBe(1);
      expect(
        await db.query('SELECT * FROM chat_members WHERE conversation_id=$1', [dm[0]?.id]),
      ).toHaveLength(2);
      const before = JSON.stringify(
        await db.query('SELECT * FROM chat_members WHERE conversation_id=$1', [s.conversation.id]),
      );
      await chat.get(s.student, s.conversation.id);
      await chat.history(s.student, s.conversation.id, { limit: 20 });
      expect(
        JSON.stringify(
          await db.query('SELECT * FROM chat_members WHERE conversation_id=$1', [
            s.conversation.id,
          ]),
        ),
      ).toBe(before);
      const views = await chat.list(s.student, { limit: 20 });
      expect(views.data.some((c) => c.id === s.conversation.id)).toBe(true);
      await expect(f.access.get(s.student.userId, s.id)).rejects.toMatchObject({ status: 403 });
      const assignmentAccess = new AssignmentAccessService(
        new TeachingReadService(db, f.config, f.users, new ScheduleReservationsService()),
        f.users,
        f.enrollments,
      );
      const assignments = new AssignmentsService(db, assignmentAccess, f.workspace, f.enrollments);
      const sessions: { id: string }[] = await db.query(
        'SELECT id FROM class_sessions WHERE class_id=$1',
        [s.id],
      );
      const quiz = await assignments.create(s.mentor, sessions[0]?.id ?? '', {
        purpose: 'HOMEWORK',
        type: 'QUIZ',
        title: 'Paid-only quiz',
        maxScore: '100',
      });
      await expect(assignments.get(s.student, quiz.id)).rejects.toMatchObject({ status: 404 });
      const pendingMessage = await chat.send(s.student, s.conversation.id, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'Pending history',
      });
      await chat.read(s.mentor, s.conversation.id, pendingMessage.message.sequence);
      const windows = await db.query(
        'SELECT user_id,joined_at,visible_from_seq,last_read_seq FROM chat_members WHERE conversation_id=$1 ORDER BY user_id',
        [s.conversation.id],
      );
      await f.cash.confirm(
        (await f.user(UserRole.MANAGER)).id,
        s.order.order.id,
        s.order.order.totalAmount,
      );
      await lifecycle.reconcileClass(s.id);
      expect((await chat.classChat(s.student, s.id)).id).toBe(s.conversation.id);
      expect((await chat.get(s.student, s.conversation.id)).accessMode).toBe('ACTIVE');
      expect(
        await db.query(
          'SELECT user_id,joined_at,visible_from_seq,last_read_seq FROM chat_members WHERE conversation_id=$1 ORDER BY user_id',
          [s.conversation.id],
        ),
      ).toEqual(windows);
      expect((await chat.history(s.student, s.conversation.id, { limit: 20 })).data[0]?.id).toBe(
        pendingMessage.message.id,
      );
      expect((await lifecycle.ensureDirect(s.student.userId, s.mentor.userId)).id).toBe(dm[0]?.id);
      expect((await f.access.get(s.student.userId, s.id)).enrollment.status).toBe('ACTIVE');
      const payos = await f.order({ paymentType: PaymentType.PAYOS }),
        payosClass = payos.classIds[0] ?? '';
      await lifecycle.reconcileClass(payosClass);
      await expect(
        chat.classChat(await actor(payos.student.id, UserRole.STUDENT), payosClass),
      ).rejects.toMatchObject({ status: 404 });
      const link = await f.links.create(payos.student.id, payos.order.id);
      const detail = await db
        .getRepository(PayosPaymentDetailEntity)
        .findOneByOrFail({ paymentId: link.paymentId });
      await f.settlement.settle(
        {
          orderCode: detail.providerOrderCode,
          amount: link.amount,
          paymentLinkId: detail.paymentLinkId ?? '',
          currency: 'VND',
          reference: randomUUID(),
          code: '00',
          isConfirmSample: false,
        },
        'WEBHOOK',
        null,
      );
      await lifecycle.reconcileClass(payosClass);
      expect(
        (await chat.classChat(await actor(payos.student.id, UserRole.STUDENT), payosClass))
          .accessMode,
      ).toBe('ACTIVE');
    });
    it('keeps backfill dry-run read-only and rolls source changes back with lifecycle outbox jobs', async () => {
      const s = await setup();
      async function snapshot() {
        return JSON.stringify(
          await db.query(`SELECT
          (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM chat_conversations c) AS conversations,
          (SELECT jsonb_agg(to_jsonb(m) ORDER BY conversation_id,user_id) FROM chat_members m) AS members,
          (SELECT count(*) FROM notifications) AS notifications,
          (SELECT count(*) FROM domain_outbox) AS outbox,
          (SELECT count(*) FROM chat_jobs) AS jobs`),
        );
      }
      const before = await snapshot();
      const dry = await lifecycle.backfill(null, 100);
      expect(dry.ids).toContain(s.id);
      expect(await snapshot()).toBe(before);
      await expect(
        db.transaction(async (m) => {
          await m.query("UPDATE classes SET status='CANCELLED' WHERE id=$1", [s.id]);
          const events = await m.query(
            "SELECT event_id FROM domain_outbox WHERE aggregate_id=$1 AND type='CLASS_CHANGED'",
            [s.id],
          );
          expect(events.length).toBeGreaterThan(1);
          throw new Error('source rollback');
        }),
      ).rejects.toThrow('source rollback');
      expect(await snapshot()).toBe(before);
      expect((await chat.get(s.student, s.conversation.id)).capabilities.canSend).toBe(true);
      await lifecycle.backfill(null, 100, false);
      const applied = await snapshot();
      await lifecycle.backfill(null, 100, false);
      expect(await snapshot()).toBe(applied);
    });
    it('persists/replies/retries once, edits with receipts, deletes to tombstones, and replays current state', async () => {
      const s = await setup(),
        input = {
          clientMessageId: randomUUID(),
          type: 'TEXT' as const,
          body: 'Tin nhắn riêng tư 🔐',
        };
      const sent = await Promise.all([
        chat.send(s.student, s.conversation.id, input),
        chat.send(s.student, s.conversation.id.toUpperCase(), input),
      ]);
      expect(sent[0]?.message.id).toBe(sent[1]?.message.id);
      const id = sent[0]?.message.id ?? '',
        key = randomUUID();
      const edited = await chat.mutate(s.student, s.conversation.id, id, key, 1, {
        expectedVersion: 1,
        body: 'Nội dung mới',
      });
      expect(edited.message.version).toBe(2);
      expect(
        (
          await chat.mutate(s.student, s.conversation.id, id, key, 1, {
            expectedVersion: 1,
            body: 'Nội dung mới',
          })
        ).replayed,
      ).toBe(true);
      await expect(
        chat.send(s.student, s.conversation.id, { ...input, body: 'different' }),
      ).rejects.toMatchObject({ status: 409 });
      const reply = await chat.send(s.mentor, s.conversation.id, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'Reply',
        replyToMessageId: id,
      });
      expect(reply.message.replyTo?.id).toBe(id);
      expect(reply.message.clientMessageId).not.toBeNull();
      await chat.mutate(s.student, s.conversation.id, id, randomUUID(), 2, null);
      const replay = await chat.send(s.student, s.conversation.id, input);
      expect(replay.message.body).toBeNull();
      expect(replay.message.version).toBe(3);
      const events = await chat.catchup(s.mentor, s.conversation.id, {
        limit: 100,
        afterSequence: '0',
      });
      expect(
        events.data.filter((e) => e.message?.id === id).every((e) => e.message?.body === null),
      ).toBe(true);
      expect(events.meta.throughSequence).toBe('5');
      const history = await chat.history(s.mentor, s.conversation.id, { limit: 1 });
      expect(history.meta.hasMore).toBe(true);
      const next = await chat.history(s.mentor, s.conversation.id, {
        limit: 1,
        cursor: history.meta.nextCursor ?? '',
      });
      expect(next.data[0]?.id).toBe(id);
      await expect(
        chat.history(s.student, s.conversation.id, {
          limit: 1,
          cursor: history.meta.nextCursor ?? '',
        }),
      ).rejects.toMatchObject({ status: 422 });
    });
    it('races first provisioning with backfill and direct creation without duplicating or resetting membership', async () => {
      const order = await f.order({ paymentType: PaymentType.CASH });
      const id = order.classIds[0] ?? '';
      await Promise.all([
        lifecycle.reconcileClass(id),
        lifecycle.backfill(null, 100, false),
        lifecycle.ensureDirect(order.student.id, order.mentor.id),
        lifecycle.ensureDirect(order.mentor.id, order.student.id),
      ]);
      const groups = await db.query('SELECT id FROM chat_conversations WHERE class_id=$1', [id]);
      expect(groups).toHaveLength(1);
      const pair = [order.student.id, order.mentor.id].sort();
      const directs = await db.query(
        'SELECT id FROM chat_conversations WHERE user_low=$1 AND user_high=$2',
        pair,
      );
      expect(directs).toHaveLength(1);
      expect(
        await db.query('SELECT user_id FROM chat_members WHERE conversation_id=$1', [
          directs[0]?.id,
        ]),
      ).toHaveLength(2);
      const before = await db.query(
        'SELECT to_jsonb(m) FROM chat_members m WHERE conversation_id=ANY($1::uuid[]) ORDER BY conversation_id,user_id',
        [[groups[0]?.id, directs[0]?.id]],
      );
      const inboxBefore = await db.query('SELECT count(*) FROM notifications');
      await lifecycle.reconcileClass(id);
      expect(
        await db.query(
          'SELECT to_jsonb(m) FROM chat_members m WHERE conversation_id=ANY($1::uuid[]) ORDER BY conversation_id,user_id',
          [[groups[0]?.id, directs[0]?.id]],
        ),
      ).toEqual(before);
      expect(await db.query('SELECT count(*) FROM notifications')).toEqual(inboxBefore);
    });
    it('maintains monotonic reads and generic deduplicated notifications when fanout comes after read', async () => {
      const s = await setup(),
        sent = await chat.send(s.student, s.conversation.id, {
          clientMessageId: randomUUID(),
          type: 'TEXT',
          body: 'Never in inbox',
        });
      await chat.read(s.mentor, s.conversation.id, sent.message.sequence);
      const rows: {
        id: string;
        event_id: string;
        conversation_id: string;
        recipient_ids: string[];
        checkpoint: number;
        lease_token: string;
        attempts: number;
      }[] = await db.query(
        `SELECT j.* FROM chat_jobs j JOIN chat_events e ON e.id=j.event_id WHERE j.consumer='NOTIFICATION' AND e.message_id=$1`,
        [sent.message.id],
      );
      const job = rows[0];
      if (!job) throw new Error('Missing notification job');
      await notifications.fanout(job);
      await notifications.fanout(job);
      expect((await notifications.list(s.mentor, { limit: 20 })).data).toHaveLength(1);
      expect(await notifications.count(s.mentor)).toEqual({ unreadCount: 0 });
      expect(await notifications.count(s.student)).toEqual({ unreadCount: 0 });
      const read = await chat.read(s.mentor, s.conversation.id, '0');
      expect(read.lastReadSequence).toBe(sent.message.sequence);
      await expect(chat.read(s.mentor, s.conversation.id, '99')).rejects.toMatchObject({
        status: 422,
      });
      expect(JSON.stringify(await notifications.list(s.mentor, { limit: 20 }))).not.toContain(
        'Never in inbox',
      );
      await db.query('UPDATE orders SET expires_at=clock_timestamp() WHERE student_id=$1', [
        s.student.userId,
      ]);
      await expect(chat.history(s.student, s.conversation.id, { limit: 20 })).rejects.toMatchObject(
        { status: 404 },
      );
      expect((await notifications.list(s.student, { limit: 20 })).data).toHaveLength(0);
    });
    it('cancels/rejoins a group with a new history window and denies completed writes and revoked sessions', async () => {
      const s = await setup();
      await chat.send(s.mentor, s.conversation.id, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'Before rejoin',
      });
      await db.query("UPDATE enrollments SET status='CANCELLED' WHERE student_id=$1", [
        s.student.userId,
      ]);
      await expect(chat.get(s.student, s.conversation.id)).rejects.toMatchObject({ status: 404 });
      await db.query("UPDATE enrollments SET status='ACTIVE' WHERE student_id=$1", [
        s.student.userId,
      ]);
      await lifecycle.reconcileClass(s.id);
      expect((await chat.history(s.student, s.conversation.id, { limit: 20 })).data).toHaveLength(
        0,
      );
      await db.query("UPDATE classes SET status='COMPLETED' WHERE id=$1", [s.id]);
      expect((await chat.get(s.student, s.conversation.id)).capabilities.canSend).toBe(false);
      await expect(
        chat.send(s.student, s.conversation.id, {
          clientMessageId: randomUUID(),
          type: 'TEXT',
          body: 'deny',
        }),
      ).rejects.toMatchObject({ status: 403 });
      await db.query('UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1', [
        s.student.sessionId,
      ]);
      await expect(
        chat.send(s.student, s.conversation.id, {
          clientMessageId: randomUUID(),
          type: 'TEXT',
          body: 'deny',
        }),
      ).rejects.toMatchObject({ status: 401 });
      const job = await jobs.claim('LIFECYCLE');
      expect(job).not.toBeNull();
    });
    it('rejects stale mentor/account/role access using source state before reconciliation', async () => {
      const s = await setup();
      const replacement = await f.user(UserRole.MENTOR);
      await db.query('UPDATE classes SET mentor_id=$2 WHERE id=$1', [s.id, replacement.id]);
      await expect(chat.get(s.mentor, s.conversation.id)).rejects.toMatchObject({ status: 404 });
      await lifecycle.reconcileClass(s.id);
      const current = await actor(replacement.id, UserRole.MENTOR);
      expect((await chat.get(current, s.conversation.id)).capabilities.canSend).toBe(true);
      await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [s.student.userId]);
      await expect(chat.get(s.student, s.conversation.id)).rejects.toMatchObject({ status: 404 });
      await db.query("UPDATE users SET status='ACTIVE' WHERE id=$1", [s.student.userId]);
      await lifecycle.reconcileClass(s.id);
      await db.query("UPDATE users SET role='MANAGER' WHERE id=$1", [s.student.userId]);
      await expect(chat.get(s.student, s.conversation.id)).rejects.toMatchObject({ status: 404 });
    });
    it('denies cross-conversation, deleted and hidden replies, and out-of-window reads after rejoin', async () => {
      const s = await setup(),
        other = await setup();
      const original = await chat.send(s.mentor, s.conversation.id, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'Old window',
      });
      const reply = (id: string) =>
        chat.send(s.student, s.conversation.id, {
          clientMessageId: randomUUID(),
          type: 'TEXT',
          body: 'Reply',
          replyToMessageId: id,
        });
      const foreign = await chat.send(other.mentor, other.conversation.id, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'Foreign',
      });
      await expect(reply(foreign.message.id)).rejects.toMatchObject({ status: 404 });
      await fanout(original.message.id);
      await db.query("UPDATE enrollments SET status='CANCELLED' WHERE student_id=$1", [
        s.student.userId,
      ]);
      await db.query("UPDATE enrollments SET status='ACTIVE' WHERE student_id=$1", [
        s.student.userId,
      ]);
      await lifecycle.reconcileClass(s.id);
      await expect(reply(original.message.id)).rejects.toMatchObject({ status: 404 });
      await expect(chat.read(s.student, s.conversation.id, '0')).rejects.toMatchObject({
        status: 422,
      });
      const current = await chat.get(s.student, s.conversation.id);
      expect(current.unreadCount).toBe(0);
      expect(BigInt(current.lastReadSequence)).toBeGreaterThanOrEqual(
        BigInt(original.message.sequence),
      );
      expect((await notifications.list(s.student, { limit: 20 })).data).toHaveLength(0);
      const deleted = await chat.send(s.mentor, s.conversation.id, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'Deleted reply target',
      });
      await chat.mutate(s.mentor, s.conversation.id, deleted.message.id, randomUUID(), 1, null);
      await expect(reply(deleted.message.id)).rejects.toMatchObject({ status: 404 });
    });
    it('preserves a DM history through source loss/restoration while paginating only authorized conversations', async () => {
      const s = await setup(),
        other = await setup();
      await chat.send(other.mentor, other.conversation.id, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'Foreign',
      });
      const dm = await lifecycle.ensureDirect(s.student.userId, s.mentor.userId);
      const sent = await chat.send(s.mentor, dm.id, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'Pair history',
      });
      await db.query("UPDATE enrollments SET status='CANCELLED' WHERE student_id=$1", [
        s.student.userId,
      ]);
      await expect(chat.get(s.student, dm.id)).rejects.toMatchObject({ status: 404 });
      await db.query("UPDATE enrollments SET status='ACTIVE' WHERE student_id=$1", [
        s.student.userId,
      ]);
      await lifecycle.reconcileClass(s.id);
      expect((await chat.history(s.student, dm.id, { limit: 20 })).data[0]?.id).toBe(
        sent.message.id,
      );
      const found = [];
      let cursor: string | undefined;
      do {
        const page = await chat.list(s.student, { limit: 1, cursor });
        found.push(...page.data);
        cursor = page.meta.nextCursor ?? undefined;
      } while (cursor);
      expect(found).toHaveLength(2);
      expect(found.map((c) => c.id)).not.toContain(other.conversation.id);
      expect(found.every((c) => c.lastMessage?.body !== 'Foreign')).toBe(true);
    });
    it('serializes competing edits/deletes and replays an edit after its window without restoring deleted content', async () => {
      const s = await setup();
      const sent = await chat.send(s.student, s.conversation.id, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'Concurrent mutation',
      });
      const results = await Promise.allSettled([
        chat.mutate(s.student, s.conversation.id, sent.message.id, randomUUID(), 1, {
          expectedVersion: 1,
          body: 'Winner edit',
        }),
        chat.mutate(s.student, s.conversation.id, sent.message.id, randomUUID(), 1, null),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const loser = results.find((r) => r.status === 'rejected');
      expect(loser?.status === 'rejected' && loser.reason).toMatchObject({ status: 409 });
      const second = await chat.send(s.student, s.conversation.id, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'Receipt survives window',
      });
      const key = randomUUID(),
        input = { expectedVersion: 1, body: 'Persisted edit' };
      await chat.mutate(s.student, s.conversation.id, second.message.id, key, 1, input);
      const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 960000);
      try {
        expect(
          (await chat.mutate(s.student, s.conversation.id, second.message.id, key, 1, input))
            .replayed,
        ).toBe(true);
        await expect(
          chat.mutate(s.student, s.conversation.id, second.message.id, randomUUID(), 2, {
            expectedVersion: 2,
            body: 'Too late',
          }),
        ).rejects.toMatchObject({ status: 409 });
        await chat.mutate(s.student, s.conversation.id, second.message.id, randomUUID(), 2, null);
        const replay = await chat.mutate(
          s.student,
          s.conversation.id,
          second.message.id,
          key,
          1,
          input,
        );
        expect(replay.message.body).toBeNull();
        expect(replay.message.version).toBe(3);
      } finally {
        clock.mockRestore();
      }
    });
    it('enforces the exact edit window and author/completed restrictions without inflating unread', async () => {
      const s = await setup();
      const sent = await chat.send(s.student, s.conversation.id, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'Edit boundary',
      });
      const rows: { created_at: Date }[] = await db.query(
        'SELECT created_at FROM chat_messages WHERE id=$1',
        [sent.message.id],
      );
      const created = rows[0]?.created_at.getTime();
      if (!created) throw new Error('Missing creation time');
      const clock = vi.spyOn(Date, 'now').mockReturnValue(created + 900000);
      try {
        await expect(
          chat.mutate(s.mentor, s.conversation.id, sent.message.id, randomUUID(), 1, {
            expectedVersion: 1,
            body: 'Foreign author',
          }),
        ).rejects.toMatchObject({ status: 404 });
        await chat.mutate(s.student, s.conversation.id, sent.message.id, randomUUID(), 1, {
          expectedVersion: 1,
          body: 'At fifteen minutes',
        });
        clock.mockReturnValue(created + 900001);
        await expect(
          chat.mutate(s.student, s.conversation.id, sent.message.id, randomUUID(), 2, {
            expectedVersion: 2,
            body: 'One millisecond late',
          }),
        ).rejects.toMatchObject({ status: 409 });
      } finally {
        clock.mockRestore();
      }
      expect((await chat.get(s.mentor, s.conversation.id)).unreadCount).toBe(1);
      expect((await chat.get(s.student, s.conversation.id)).unreadCount).toBe(0);
      await chat.history(s.mentor, s.conversation.id, { limit: 20 });
      await chat.catchup(s.mentor, s.conversation.id, { limit: 20, afterSequence: '0' });
      expect((await chat.get(s.mentor, s.conversation.id)).unreadCount).toBe(1);
      await db.query("UPDATE classes SET status='COMPLETED' WHERE id=$1", [s.id]);
      await expect(
        chat.mutate(s.student, s.conversation.id, sent.message.id, randomUUID(), 2, null),
      ).rejects.toMatchObject({ status: 403 });
      await db.query("UPDATE classes SET status='OPEN' WHERE id=$1", [s.id]);
      await chat.mutate(s.student, s.conversation.id, sent.message.id, randomUUID(), 2, null);
      expect((await chat.get(s.mentor, s.conversation.id)).unreadCount).toBe(0);
    });
    it('keeps concurrent device reads monotonic and preserves the timestamp on no-op reads', async () => {
      const s = await setup();
      const messages = [];
      for (let i = 0; i < 3; i++)
        messages.push(
          await chat.send(s.student, s.conversation.id, {
            clientMessageId: randomUUID(),
            type: 'TEXT',
            body: `Read cursor ${i}`,
          }),
        );
      const last = messages.at(-1)?.message.sequence ?? '';
      const secondDevice = await actor(s.mentor.userId, UserRole.MENTOR);
      await Promise.all([
        chat.read(s.mentor, s.conversation.id, last),
        chat.read(secondDevice, s.conversation.id, messages[0]?.message.sequence ?? ''),
      ]);
      const current = await chat.read(s.mentor, s.conversation.id, last);
      const noop = await chat.read(secondDevice, s.conversation.id, '0');
      expect(noop.lastReadSequence).toBe(last);
      expect(noop.lastReadAt).toBe(current.lastReadAt);
      expect(noop.unreadCount).toBe(0);
    });
    it('keeps inbox reads separate from conversation reads and leaves post-snapshot fanout unread', async () => {
      const s = await setup();
      const send = () =>
        chat.send(s.student, s.conversation.id, {
          clientMessageId: randomUUID(),
          type: 'TEXT',
          body: 'Generic inbox only',
        });
      const first = await send();
      await fanout(first.message.id);
      const item = (await notifications.list(s.mentor, { limit: 20 })).data[0];
      if (!item) throw new Error('Missing inbox item');
      const read = await notifications.read(s.mentor, item.id);
      expect((await notifications.read(s.mentor, item.id)).readAt).toBe(read.readAt);
      await expect(notifications.read(s.student, item.id)).rejects.toMatchObject({ status: 404 });
      expect((await chat.get(s.mentor, s.conversation.id)).unreadCount).toBe(1);
      const second = await send();
      await fanout(second.message.id);
      const late = await send();
      const originalQuery = db.query.bind(db);
      // Insert fanout after read-all has captured visible IDs, before its UPDATE.
      const barrier = vi.spyOn(db, 'query').mockImplementation(async (...args) => {
        if (args[0] === 'SELECT clock_timestamp() AS now') {
          barrier.mockRestore();
          await fanout(late.message.id);
        }
        return originalQuery(...args);
      });
      try {
        await notifications.readAll(s.mentor);
      } finally {
        barrier.mockRestore();
      }
      const unread = await notifications.list(s.mentor, { limit: 20, unreadOnly: true });
      expect(unread.data.map((n) => n.messageId)).toEqual([late.message.id]);
      expect((await chat.get(s.mentor, s.conversation.id)).unreadCount).toBe(3);
    });
    it('does not notify late joiners, retries committed fanout once and keeps realtime completion independent', async () => {
      const s = await setup();
      const sent = await chat.send(s.mentor, s.conversation.id, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'Cutoff private body',
      });
      const realtime = await db.query(
        "SELECT * FROM chat_jobs WHERE consumer='REALTIME' AND event_id=(SELECT id FROM chat_events WHERE message_id=$1 AND type='message:created')",
        [sent.message.id],
      );
      await db.query(
        "UPDATE chat_jobs SET status='RUNNING',lease_token=$2,lease_until=clock_timestamp()+interval '30 seconds' WHERE id=$1",
        [realtime[0]?.id, randomUUID()],
      );
      const claimed = await db.query('SELECT * FROM chat_jobs WHERE id=$1', [realtime[0]?.id]);
      expect(await jobs.complete(claimed[0])).toBe(true);
      const late = await actor((await f.user()).id, UserRole.STUDENT);
      await db.query('UPDATE classes SET max_students=2 WHERE id=$1', [s.id]);
      await f.cart.addItem(late.userId, s.id);
      await f.checkout.checkout(late.userId, PaymentType.CASH);
      await lifecycle.reconcileClass(s.id);
      await fanout(sent.message.id);
      // Simulate a crash after the database commit and before recording completion.
      await fanout(sent.message.id);
      expect(
        await db.query('SELECT id FROM notifications WHERE message_id=$1', [sent.message.id]),
      ).toHaveLength(1);
      expect((await notifications.list(late, { limit: 20 })).data).toHaveLength(0);
      expect((await notifications.list(s.mentor, { limit: 20 })).data).toHaveLength(0);
      expect(JSON.stringify(await notifications.list(s.student, { limit: 20 }))).not.toContain(
        'Cutoff private body',
      );
      const before = await db.query('SELECT count(*) FROM notifications');
      await lifecycle.backfill(null, 100, false);
      expect(await db.query('SELECT count(*) FROM notifications')).toEqual(before);
    });
    it('serializes conversation reads with fanout and reads inbox only through the requested cursor', async () => {
      const s = await setup();
      const first = await chat.send(s.mentor, s.conversation.id, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'First cutoff',
      });
      const second = await chat.send(s.mentor, s.conversation.id, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'Second cutoff',
      });
      await Promise.all([
        fanout(first.message.id),
        chat.read(s.student, s.conversation.id, first.message.sequence),
      ]);
      await fanout(second.message.id);
      const list = await notifications.list(s.student, { limit: 20 });
      expect(list.data.find((n) => n.messageId === first.message.id)?.readAt).not.toBeNull();
      expect(list.data.find((n) => n.messageId === second.message.id)?.readAt).toBeNull();
      await Promise.all([
        fanout(second.message.id),
        chat.read(s.student, s.conversation.id, second.message.sequence),
      ]);
      expect(await notifications.count(s.student)).toEqual({ unreadCount: 0 });
    });
    it('rejects a cached catchup cursor after source revocation and holds its original upper watermark', async () => {
      const s = await setup();
      for (let i = 0; i < 2; i++)
        await chat.send(s.mentor, s.conversation.id, {
          clientMessageId: randomUUID(),
          type: 'TEXT',
          body: `Watermark ${i}`,
        });
      const first = await chat.catchup(s.student, s.conversation.id, {
        limit: 1,
        afterSequence: '0',
      });
      const third = await chat.send(s.mentor, s.conversation.id, {
        clientMessageId: randomUUID(),
        type: 'TEXT',
        body: 'After snapshot',
      });
      const next = await chat.catchup(s.student, s.conversation.id, {
        limit: 100,
        cursor: first.meta.nextCursor ?? '',
      });
      expect(next.meta.throughSequence).toBe(first.meta.throughSequence);
      expect(next.data.every((e) => e.message?.id !== third.message.id)).toBe(true);
      await db.query('UPDATE orders SET expires_at=clock_timestamp() WHERE id=$1', [
        s.order.order.id,
      ]);
      await expect(
        chat.catchup(s.student, s.conversation.id, {
          limit: 100,
          cursor: first.meta.nextCursor ?? '',
        }),
      ).rejects.toMatchObject({ status: 404 });
    });
    it('suppresses revoked or deleted fanout and hides an existing inbox after source revocation', async () => {
      const s = await setup();
      const send = () =>
        chat.send(s.mentor, s.conversation.id, {
          clientMessageId: randomUUID(),
          type: 'TEXT',
          body: 'Revocation boundary',
        });
      const existing = await send();
      await fanout(existing.message.id);
      const item = (await notifications.list(s.student, { limit: 20 })).data[0];
      if (!item) throw new Error('Missing student notification');
      const deleted = await send();
      await chat.mutate(s.mentor, s.conversation.id, deleted.message.id, randomUUID(), 1, null);
      await fanout(deleted.message.id);
      expect(
        await db.query('SELECT id FROM notifications WHERE message_id=$1', [deleted.message.id]),
      ).toHaveLength(0);
      const revoked = await send();
      await db.query('UPDATE orders SET expires_at=clock_timestamp() WHERE id=$1', [
        s.order.order.id,
      ]);
      await fanout(revoked.message.id);
      expect(
        await db.query('SELECT id FROM notifications WHERE message_id=$1', [revoked.message.id]),
      ).toHaveLength(0);
      expect((await notifications.list(s.student, { limit: 20 })).data).toHaveLength(0);
      expect(await notifications.count(s.student)).toEqual({ unreadCount: 0 });
      await expect(notifications.read(s.student, item.id)).rejects.toMatchObject({ status: 404 });
    });
  },
);
