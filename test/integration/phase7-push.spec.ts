import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushNotifications1793059200000 } from '../../src/database/migrations/1793059200000-push-notifications.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { PasswordService } from '../../src/modules/auth/services/password.service.js';
import { SessionService } from '../../src/modules/auth/services/session.service.js';
import { TokenService } from '../../src/modules/auth/services/token.service.js';
import { ChatAccessService } from '../../src/modules/chat/services/chat-access.service.js';
import { ChatCryptoService } from '../../src/modules/chat/services/chat-crypto.service.js';
import { ChatCursorService } from '../../src/modules/chat/services/chat-cursor.service.js';
import { ChatEventService } from '../../src/modules/chat/services/chat-event.service.js';
import type { ChatJob } from '../../src/modules/chat/services/chat-jobs.service.js';
import { ChatLifecycleService } from '../../src/modules/chat/services/chat-lifecycle.service.js';
import { ChatNotificationsService } from '../../src/modules/chat/services/chat-notifications.service.js';
import { ChatPushPolicy } from '../../src/modules/chat/services/chat-push-policy.service.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { OrdersService } from '../../src/modules/commerce/services/orders.service.js';
import {
  PushProviderError,
  type PushRequest,
} from '../../src/modules/push-notifications/fcm.adapter.js';
import { PushConfig } from '../../src/modules/push-notifications/push-config.service.js';
import { PushCrypto } from '../../src/modules/push-notifications/push-crypto.service.js';
import { PushEligibility } from '../../src/modules/push-notifications/push-eligibility.service.js';
import { PushMaintenance } from '../../src/modules/push-notifications/push-maintenance.service.js';
import { PushOutbox } from '../../src/modules/push-notifications/push-outbox.service.js';
import {
  type InstallationRow,
  PushRegistry,
} from '../../src/modules/push-notifications/push-registry.service.js';
import { PushWorker } from '../../src/modules/push-notifications/push-worker.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { CHAT_MIGRATIONS } from '../helpers/chat-migrations.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';
import { pushConfig } from '../helpers/push-fixture.js';

describe.skipIf(!separateTestUrl('phase7'))(
  'Phase 7 installations, atomic fanout and durable worker PostgreSQL',
  () => {
    let db: DataSource,
      f: ReturnType<typeof paymentFixture>,
      auth: AuthService,
      access: ChatAccessService,
      crypto: PushCrypto,
      registry: PushRegistry,
      outbox: PushOutbox,
      notifications: ChatNotificationsService,
      lifecycle: ChatLifecycleService,
      worker: PushWorker,
      scope: PushEligibility,
      maintenance: PushMaintenance;
    const env = pushConfig(),
      config = new PushConfig(env),
      chatCrypto = new ChatCryptoService(env),
      events = new ChatEventService();
    const send = vi.fn<(r: PushRequest) => Promise<string>>();
    beforeAll(async () => {
      db = await paymentDatabase('phase7', {
        migrations: [
          ...CHAT_MIGRATIONS.filter((m) => m.name !== 'MentorLeave1792195200000'),
          PushNotifications1793059200000,
        ],
      });
      f = paymentFixture(db);
      const passwords = new PasswordService(),
        tokens = new TokenService(env);
      auth = new AuthService(
        db,
        env,
        f.users,
        passwords,
        tokens,
        new SessionService(env, passwords, tokens),
      );
      access = new ChatAccessService(env, f.read, f.enrollments, new OrdersService(db), f.users);
      lifecycle = new ChatLifecycleService(db, access, f.read, f.users, events);
      crypto = new PushCrypto(env);
      registry = new PushRegistry(db, config, crypto, auth);
      outbox = new PushOutbox(config);
      notifications = new ChatNotificationsService(
        db,
        access,
        new ChatCursorService(chatCrypto),
        outbox,
      );
      scope = new PushEligibility();
      new ChatPushPolicy(scope, access).onModuleInit();
      worker = new PushWorker(db, config, crypto, scope, auth, { send });
      maintenance = new PushMaintenance(db, crypto);
    }, 60000);
    beforeEach(async () => {
      send.mockReset().mockResolvedValue('projects/mindy-test/messages/accepted');
      await db.query(
        'TRUNCATE notification_push_deliveries,push_installations,push_mutation_events',
      );
    });
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });
    async function actor(userId: string, role = UserRole.STUDENT): Promise<AuthenticatedUser> {
      const sessionId = randomUUID();
      await db.query(
        "INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '1 hour')",
        [sessionId, userId],
      );
      return { userId, sessionId, role };
    }
    async function fixture(withFanout = true, ageSeconds = 0) {
      const order = await f.order({ paymentType: PaymentType.CASH }),
        student = await actor(order.student.id),
        mentor = await actor(order.mentor.id, UserRole.MENTOR);
      await lifecycle.reconcileClass(order.classIds[0] ?? '');
      const conversations: { id: string }[] = await db.query(
        'SELECT id FROM chat_conversations WHERE class_id=$1',
        [order.classIds[0]],
      );
      const conversationId = conversations[0]?.id ?? '',
        installationId = randomUUID();
      await registry.put(student, installationId, 'fake-push-token');
      await registry.put(mentor, randomUUID(), 'fake-sender-token');
      const messageId = randomUUID();
      await db.transaction(async (m) => {
        const sequence = await events.nextSequence(m, conversationId),
          body = chatCrypto.encrypt(
            { messageId, conversationId, senderId: mentor.userId },
            'secret chat content',
          );
        await m.query(
          `INSERT INTO chat_messages(id,conversation_id,sender_id,client_message_id,sequence,last_changed_seq,ciphertext,iv,tag,key_version,crypto_version,created_at)
        VALUES($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,1,clock_timestamp()-make_interval(secs=>$10))`,
          [
            messageId,
            conversationId,
            mentor.userId,
            randomUUID(),
            sequence,
            body.ciphertext,
            body.iv,
            body.tag,
            body.keyVersion,
            ageSeconds,
          ],
        );
        await events.append(m, {
          conversationId,
          sequence,
          type: 'message:created',
          messageId,
          actorId: mentor.userId,
          recipientIds: [student.userId, mentor.userId],
        });
      });
      const jobs: ChatJob[] = await db.query(
        "SELECT j.* FROM chat_jobs j JOIN chat_events e ON e.id=j.event_id WHERE e.message_id=$1 AND j.consumer='NOTIFICATION'",
        [messageId],
      );
      const job = jobs[0];
      if (!job) throw new Error('No fanout job');
      if (withFanout) await notifications.fanout(job);
      return { order, student, mentor, conversationId, installationId, messageId, job };
    }
    async function status(): Promise<string | undefined> {
      const rows: { status: string }[] = await db.query(
        'SELECT status FROM notification_push_deliveries',
      );
      return rows[0]?.status;
    }
    it('migration supports clean catalog, repeat no-op and populated down/up preserving inbox', async () => {
      const s = await fixture();
      const before = await db.query('SELECT * FROM notifications WHERE message_id=$1', [
        s.messageId,
      ]);
      expect(await db.runMigrations()).toHaveLength(0);
      await rehearseMigration(db, new PushNotifications1793059200000(), 'down');
      await rehearseMigration(db, new PushNotifications1793059200000(), 'up');
      expect(
        await db.query('SELECT * FROM notifications WHERE message_id=$1', [s.messageId]),
      ).toEqual(before);
      expect(await db.runMigrations()).toHaveLength(0);
    });
    it('serializes identical PUT, protects crypto ownership and increments generation on rotation', async () => {
      const s = await fixture();
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          registry.put(s.student, s.installationId, 'fake-push-token'),
        ),
      );
      expect(results.every((r) => r.generation === '1')).toBe(true);
      const [row]: InstallationRow[] = await db.query(
        'SELECT * FROM push_installations WHERE id=$1',
        [s.installationId],
      );
      expect(row && crypto.decrypt(s.installationId, row)).toBe('fake-push-token');
      expect(JSON.stringify(results)).not.toContain('fake-push-token');
      expect((await registry.put(s.student, s.installationId, 'rotated-token')).generation).toBe(
        '2',
      );
      await expect(registry.put(s.mentor, s.installationId, 'other')).rejects.toMatchObject({
        status: 409,
      });
      await expect(registry.put(s.mentor, randomUUID(), 'rotated-token')).rejects.toMatchObject({
        status: 409,
      });
      await expect(registry.revoke(s.mentor, s.installationId, '2')).rejects.toMatchObject({
        status: 404,
      });
    });
    it('stale DELETE cannot revoke a concurrent new generation; rebind requires owner session', async () => {
      const s = await fixture(),
        newer = await actor(s.student.userId);
      expect((await registry.put(newer, s.installationId, 'new-session-token')).generation).toBe(
        '2',
      );
      await expect(registry.revoke(s.student, s.installationId, '1')).rejects.toMatchObject({
        status: 404,
      });
      await expect(registry.revoke(newer, s.installationId, '1')).rejects.toMatchObject({
        status: 409,
      });
      await registry.revoke(newer, s.installationId, '2');
      await registry.revoke(newer, s.installationId, '2');
      expect((await registry.put(newer, s.installationId, 'new-session-token')).generation).toBe(
        '3',
      );
    });
    it('enforces quota and a PostgreSQL shared session mutation budget', async () => {
      const s = await fixture();
      for (let i = 0; i < 9; i++) await registry.put(s.student, randomUUID(), `token-${i}`);
      await expect(registry.put(s.student, randomUUID(), 'over-quota')).rejects.toMatchObject({
        status: 409,
      });
      for (let i = 0; i < 9; i++)
        await registry.put(s.student, s.installationId, 'fake-push-token');
      await expect(
        registry.put(s.student, s.installationId, 'fake-push-token'),
      ).rejects.toMatchObject({ status: 429 });
    });
    it('logout and logout-all revoke correct installations and prevent reactivation by revoked sessions', async () => {
      const s = await fixture(),
        other = await actor(s.student.userId),
        id = randomUUID();
      await registry.put(other, id, 'second-session-token');
      await auth.logout(s.student);
      expect(
        (await db.query('SELECT status FROM push_installations WHERE id=$1', [id]))[0].status,
      ).toBe('ACTIVE');
      await expect(
        registry.put(s.student, s.installationId, 'fake-push-token'),
      ).rejects.toMatchObject({ status: 401 });
      await auth.logoutAll(s.student.userId);
      expect(
        (await db.query('SELECT status FROM push_installations WHERE id=$1', [id]))[0].status,
      ).toBe('REVOKED');
    });
    it('commits inbox/delivery atomically, retries fanout idempotently and excludes sender/new registrations', async () => {
      const s = await fixture(false);
      const enqueue = vi
        .spyOn(outbox, 'enqueue')
        .mockRejectedValueOnce(new Error('crash before commit'));
      await expect(notifications.fanout(s.job)).rejects.toThrow();
      enqueue.mockRestore();
      expect(
        await db.query('SELECT * FROM notifications WHERE message_id=$1', [s.messageId]),
      ).toHaveLength(0);
      expect(await db.query('SELECT * FROM notification_push_deliveries')).toHaveLength(0);
      await notifications.fanout(s.job);
      await registry.put(s.student, randomUUID(), 'after-fanout-token');
      await notifications.fanout(s.job);
      expect(await db.query('SELECT * FROM notification_push_deliveries')).toHaveLength(1);
      expect(send).not.toHaveBeenCalled();
      await worker.tick();
      expect(send).toHaveBeenCalledOnce();
      expect(await status()).toBe('SENT');
    });
    it.each([
      'read',
      'cursor',
      'delete',
      'leave',
      'logout',
      'rotate',
      'suspend',
      'role',
      'expire',
      'session-expire',
      'scope',
    ])('rechecks %s before sending without calling provider', async (reason) => {
      const s = await fixture();
      if (reason === 'read')
        await db.query('UPDATE notifications SET read_at=clock_timestamp() WHERE message_id=$1', [
          s.messageId,
        ]);
      if (reason === 'cursor')
        await db.query(
          'UPDATE chat_members SET last_read_seq=100 WHERE conversation_id=$1 AND user_id=$2',
          [s.conversationId, s.student.userId],
        );
      if (reason === 'delete')
        await db.query(
          'UPDATE chat_messages SET deleted_at=clock_timestamp(),ciphertext=NULL,iv=NULL,tag=NULL,key_version=NULL,crypto_version=NULL WHERE id=$1',
          [s.messageId],
        );
      if (reason === 'leave')
        await db.query(
          'UPDATE chat_members SET left_at=clock_timestamp() WHERE conversation_id=$1 AND user_id=$2',
          [s.conversationId, s.student.userId],
        );
      if (reason === 'logout') await auth.logout(s.student);
      if (reason === 'rotate') await registry.put(s.student, s.installationId, 'rotated');
      if (reason === 'suspend')
        await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [s.student.userId]);
      if (reason === 'role')
        await db.query("UPDATE users SET role='MANAGER' WHERE id=$1", [s.student.userId]);
      if (reason === 'expire')
        await db.query(
          "UPDATE notification_push_deliveries SET expires_at=clock_timestamp()-interval '1 second'",
        );
      if (reason === 'session-expire')
        await db.query(
          "UPDATE auth_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
          [s.student.sessionId],
        );
      if (reason === 'scope')
        await db.query("UPDATE orders SET status='CANCELLED' WHERE id=$1", [s.order.order.id]);
      await worker.tick();
      expect(send).not.toHaveBeenCalled();
      expect(await status()).toBe('SKIPPED');
    });
    it('rechecks read/rotation/logout races that commit during scope validation', async () => {
      for (const reason of ['read', 'rotate', 'logout']) {
        await db.query(
          'TRUNCATE notification_push_deliveries,push_installations,push_mutation_events',
        );
        const s = await fixture();
        const spy = vi.spyOn(scope, 'allowed').mockImplementationOnce(async () => {
          if (reason === 'read')
            await db.query(
              'UPDATE notifications SET read_at=clock_timestamp() WHERE message_id=$1',
              [s.messageId],
            );
          if (reason === 'rotate') await registry.put(s.student, s.installationId, 'rotated');
          if (reason === 'logout') await auth.logout(s.student);
          return true;
        });
        await worker.tick();
        spy.mockRestore();
        expect(send).not.toHaveBeenCalled();
        expect(await status()).toBe('SKIPPED');
      }
    });
    it('read-before-fanout and cutoff/expired/disabled enqueue preserve inbox without push', async () => {
      for (const reason of ['read', 'cutoff', 'expired', 'disabled']) {
        await db.query(
          'TRUNCATE notification_push_deliveries,push_installations,push_mutation_events',
        );
        const s = await fixture(false, reason === 'expired' ? 301 : 0);
        if (reason === 'read')
          await db.query(
            'UPDATE chat_members SET last_read_seq=100 WHERE conversation_id=$1 AND user_id=$2',
            [s.conversationId, s.student.userId],
          );
        const cfg =
          reason === 'cutoff'
            ? new PushConfig(pushConfig({ PUSH_ACTIVATED_AT: '2099-01-01T00:00:00Z' }))
            : reason === 'disabled'
              ? new PushConfig(pushConfig({ PUSH_ENABLED: false, PUSH_WORKER_ENABLED: false }))
              : config;
        const original = notifications;
        notifications = new ChatNotificationsService(
          db,
          access,
          new ChatCursorService(chatCrypto),
          new PushOutbox(cfg),
        );
        await notifications.fanout(s.job);
        notifications = original;
        expect(
          await db.query('SELECT * FROM notifications WHERE message_id=$1', [s.messageId]),
        ).toHaveLength(1);
        expect(await db.query('SELECT * FROM notification_push_deliveries')).toHaveLength(0);
      }
    });
    it('concurrent claims and stale worker completion are fenced after lease expiry', async () => {
      await fixture();
      const claims = await Promise.all([worker.claim(), worker.claim()]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      const old = claims.find(Boolean);
      if (!old) throw new Error('No claim');
      await db.query(
        "UPDATE notification_push_deliveries SET lease_until=clock_timestamp()-interval '1 second'",
      );
      const current = await worker.claim();
      if (!current) throw new Error('No reclaim');
      await worker.finish(old, 'SENT', null);
      expect(await status()).toBe('RUNNING');
      await worker.deliver(current);
      expect(await status()).toBe('SENT');
    });
    it.each([
      'UNREGISTERED',
      'INVALID_PAYLOAD',
      'CONFIGURATION',
      'QUOTA',
      'UNAVAILABLE',
      'TIMEOUT',
    ] as const)(
      'handles provider %s with bounded durable retry and token isolation',
      async (reason) => {
        const s = await fixture();
        send.mockRejectedValueOnce(
          new PushProviderError(reason, reason === 'UNAVAILABLE' ? 90000 : 0),
        );
        await worker.tick();
        const [row] = await db.query(
          'SELECT *,extract(epoch FROM next_attempt_at-clock_timestamp()) AS wait FROM notification_push_deliveries',
        );
        expect(row.status).toBe(
          ['QUOTA', 'UNAVAILABLE', 'TIMEOUT'].includes(reason)
            ? 'PENDING'
            : reason === 'UNREGISTERED'
              ? 'SKIPPED'
              : 'DEAD',
        );
        if (reason === 'QUOTA') expect(Number(row.wait)).toBeGreaterThan(59);
        if (reason === 'UNAVAILABLE') expect(Number(row.wait)).toBeGreaterThan(89);
        const [installation] = await db.query('SELECT status FROM push_installations WHERE id=$1', [
          s.installationId,
        ]);
        expect(installation.status).toBe(reason === 'UNREGISTERED' ? 'INVALID' : 'ACTIVE');
      },
    );
    it('retry stops at max attempts or expiry and rollback worker flag prevents provider calls', async () => {
      await fixture();
      send.mockRejectedValue(new PushProviderError('UNAVAILABLE'));
      await db.query('UPDATE notification_push_deliveries SET attempts=7');
      await worker.tick();
      expect(await status()).toBe('DEAD');
      const disabled = new PushWorker(
        db,
        new PushConfig(pushConfig({ PUSH_WORKER_ENABLED: false })),
        crypto,
        scope,
        auth,
        { send },
      );
      send.mockClear();
      await disabled.tick();
      expect(send).not.toHaveBeenCalled();
      expect(await maintenance.run('replay', 10, false)).toMatchObject({
        dryRun: true,
        eligible: 1,
      });
      await maintenance.run('replay', 10, true);
      expect(await status()).toBe('PENDING');
      await db.query(
        "UPDATE notification_push_deliveries SET expires_at=clock_timestamp()+interval '1 second'",
      );
      send.mockRejectedValueOnce(new PushProviderError('QUOTA'));
      await worker.tick();
      expect(await status()).toBe('SKIPPED');
    });
    it('maintenance dry-run is bounded, rotation keeps bindings, and retention preserves inbox', async () => {
      const s = await fixture();
      await worker.tick();
      await db.query(
        "UPDATE notification_push_deliveries SET completed_at=clock_timestamp()-interval '31 days'",
      );
      expect(await maintenance.run('retention', 10)).toMatchObject({ dryRun: true, deliveries: 1 });
      expect(await status()).toBe('SENT');
      await maintenance.run('retention', 10, true);
      expect(await status()).toBeUndefined();
      expect(
        await db.query('SELECT * FROM notifications WHERE message_id=$1', [s.messageId]),
      ).toHaveLength(1);
      expect(await maintenance.metrics()).toHaveProperty('installations');
    });
    it('concurrent rotate and old DELETE leave the latest generation active', async () => {
      const s = await fixture();
      const result = await Promise.allSettled([
        registry.put(s.student, s.installationId, 'rotate-race'),
        registry.revoke(s.student, s.installationId, '1'),
      ]);
      expect(result[0].status).toBe('fulfilled');
      const [row]: InstallationRow[] = await db.query(
        'SELECT * FROM push_installations WHERE id=$1',
        [s.installationId],
      );
      expect(row).toMatchObject({ status: 'ACTIVE', generation: '2' });
      await notifications.fanout(s.job);
      expect(await db.query('SELECT * FROM notification_push_deliveries')).toHaveLength(1);
    });
    it('two accounts racing a new installation cannot replace the winning owner or session', async () => {
      const s = await fixture(),
        id = randomUUID();
      const results = await Promise.allSettled([
        registry.put(s.student, id, 'student-race-token'),
        registry.put(s.mentor, id, 'mentor-race-token'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const [row]: InstallationRow[] = await db.query(
        'SELECT * FROM push_installations WHERE id=$1',
        [id],
      );
      const winner = results[0].status === 'fulfilled' ? s.student : s.mentor;
      expect(row).toMatchObject({
        user_id: winner.userId,
        session_id: winner.sessionId,
        generation: '1',
      });
      const loser = results.find((r) => r.status === 'rejected');
      expect(loser?.status === 'rejected' && loser.reason).toMatchObject({ status: 409 });
    });
    it('source infrastructure failure keeps a recoverable lease and shutdown blocks new sends', async () => {
      await fixture();
      const policy = vi
        .spyOn(scope, 'allowed')
        .mockRejectedValueOnce(new Error('temporary source DB failure'));
      await expect(worker.tick()).rejects.toThrow('temporary source DB failure');
      policy.mockRestore();
      expect(await status()).toBe('RUNNING');
      expect(send).not.toHaveBeenCalled();
      await db.query(
        "UPDATE notification_push_deliveries SET lease_until=clock_timestamp()-interval '1 second'",
      );
      await worker.tick();
      expect(await status()).toBe('SENT');
      send.mockClear();
      const stopped = new PushWorker(db, config, crypto, scope, auth, { send });
      await stopped.onApplicationShutdown();
      await stopped.tick();
      expect(send).not.toHaveBeenCalled();
    });
    it('provider accept followed by failed DB completion can retry without creating another logical delivery', async () => {
      await fixture();
      const complete = vi
        .spyOn(worker, 'finish')
        .mockRejectedValueOnce(new Error('completion DB unavailable'));
      await expect(worker.tick()).rejects.toThrow('completion DB unavailable');
      complete.mockRestore();
      expect(send).toHaveBeenCalledOnce();
      expect(await status()).toBe('RUNNING');
      await db.query(
        "UPDATE notification_push_deliveries SET lease_until=clock_timestamp()-interval '1 second'",
      );
      await worker.tick();
      expect(send).toHaveBeenCalledTimes(2);
      expect(await status()).toBe('SENT');
      expect(await db.query('SELECT id FROM notification_push_deliveries')).toHaveLength(1);
    });
    it('rotates encrypted token keys without changing fingerprint, generation or queued binding', async () => {
      const s = await fixture();
      const oldKeys = JSON.parse(env.getOrThrow<string>('PUSH_TOKEN_KEYRING')) as Record<
        string,
        string
      >;
      const next = new PushCrypto(
        pushConfig({
          PUSH_TOKEN_ACTIVE_KEY_VERSION: 2,
          PUSH_TOKEN_KEYRING: JSON.stringify({
            ...oldKeys,
            2: Buffer.alloc(32, 97).toString('base64'),
          }),
          PUSH_TOKEN_FINGERPRINT_KEY: env.getOrThrow<string>('PUSH_TOKEN_FINGERPRINT_KEY'),
        }),
      );
      const service = new PushMaintenance(db, next);
      expect(await service.run('rotate', 10)).toMatchObject({ dryRun: true, eligible: 2 });
      await service.run('rotate', 10, true);
      const [row]: InstallationRow[] = await db.query(
        'SELECT * FROM push_installations WHERE id=$1',
        [s.installationId],
      );
      expect(row?.key_version).toBe(2);
      expect(row?.generation).toBe('1');
      expect(row && next.decrypt(s.installationId, row)).toBe('fake-push-token');
      expect(await service.run('rotate', 10, true)).toMatchObject({ eligible: 0 });
    });
  },
);
