import { type ChildProcess, fork } from 'node:child_process';
import { generateKeyPairSync, randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { io, type Socket } from 'socket.io-client';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TokenService } from '../../src/modules/auth/services/token.service.js';
import type { NotificationDto } from '../../src/modules/notifications/dtos/notification.dto.js';
import { separateTestUrl } from '../helpers/payment-fixture.js';

const origin = 'http://localhost:3001';
describe.skipIf(!separateTestUrl('phase16_http'))(
  'Phase 16 compiled API, PostgreSQL and real WebSocket',
  () => {
    let server: ChildProcess,
      db: DataSource,
      url: string,
      classId: string,
      sessionId: string,
      studentId: string,
      mentorId: string;
    let student: string,
      mentor: string,
      other: string,
      manager: string,
      orderId: string,
      tokens: TokenService;
    const sockets: Socket[] = [];
    let output = '';
    beforeAll(async () => {
      const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const keyEnv = {
        JWT_PRIVATE_KEY_BASE64: Buffer.from(
          keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
        ).toString('base64'),
        JWT_PUBLIC_KEY_BASE64: Buffer.from(
          keys.publicKey.export({ type: 'spki', format: 'pem' }),
        ).toString('base64'),
      };
      tokens = new TokenService(new ConfigService({ ...keyEnv, ACCESS_TOKEN_TTL_SECONDS: 900 }));
      server = fork('test/http/payment-server.mjs', [], {
        execArgv: [],
        silent: true,
        env: {
          ...process.env,
          ...keyEnv,
          NODE_ENV: 'test',
          DATABASE_URL: separateTestUrl('phase16_http'),
          DATABASE_LOGGING: 'false',
          COOKIE_SECURE: 'false',
          CORS_ORIGINS: origin,
          GOOGLE_AUTH_ENABLED: 'false',
          MAIL_ENABLED: 'false',
          MINIO_ENABLED: 'false',
          PAYOS_ENABLED: 'false',
          SWAGGER_ENABLED: 'true',
          ORDER_EXPIRY_JOB_ENABLED: 'false',
          PAYMENT_MAIL_JOB_ENABLED: 'false',
          ASSIGNMENT_TIMEOUT_JOB_ENABLED: 'false',
          ASSIGNMENT_FILE_JOB_ENABLED: 'false',
          FILE_JOB_ENABLED: 'false',
          CODE_JUDGE_JOB_ENABLED: 'false',
          CLASS_OPENING_JOB_ENABLED: 'false',
          WHITEBOARD_ENABLED: 'true',
          WHITEBOARD_WORKER_ENABLED: 'false',
          CHAT_ENABLED: 'true',
          CHAT_JOB_ENABLED: 'false',
          CHAT_ENCRYPTION_KEYS: JSON.stringify({ 1: randomBytes(32).toString('base64') }),
          CHAT_ENCRYPTION_ACTIVE_KEY_VERSION: '1',
          ASSIGNMENT_ZIP_ENABLED: 'true',
          NOTIFICATIONS_ENABLED: 'true',
          NOTIFICATION_SOCKET_ENABLED: 'true',
          NOTIFICATION_JOB_ENABLED: 'false',
          NOTIFICATION_CURSOR_SECRET: 'phase16-test-only-random-secret-minimum-32-bytes',
        },
      });
      server.stdout?.on('data', (c) => {
        output += String(c);
      });
      server.stderr?.on('data', (c) => {
        output += String(c);
      });
      const ready = await new Promise<{ url: string; classId: string }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Boot timeout: ${output}`)), 45000);
        server.once('message', (m) => {
          clearTimeout(timer);
          resolve(m as { url: string; classId: string });
        });
        server.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`Exit ${code}: ${output}`));
        });
        server.once('error', reject);
      });
      url = `${ready.url}/api/v1`;
      classId = ready.classId;
      db = new DataSource({ type: 'postgres', url: separateTestUrl('phase16_http') });
      await db.initialize();
      student = await login('student');
      mentor = await login('mentor');
      other = await login('other');
      manager = await login('manager');
      studentId = (await db.query("SELECT id FROM users WHERE email='student@http.test'"))[0].id;
      mentorId = (await db.query("SELECT id FROM users WHERE email='mentor@http.test'"))[0].id;
      sessionId = (await db.query('SELECT id FROM class_sessions WHERE class_id=$1', [classId]))[0]
        .id;
      expect((await request('/me/cart/items', student, { classId })).status).toBe(201);
      const checkout = await request('/me/cart/checkout', student, { paymentType: 'CASH' });
      expect(checkout.status, output).toBe(201);
      orderId = (await db.query('SELECT id FROM orders WHERE student_id=$1', [studentId]))[0].id;
    }, 60000);
    afterAll(async () => {
      for (const socket of sockets) socket.disconnect();
      if (db?.isInitialized) await db.destroy();
      if (server && server.exitCode === null)
        await new Promise<void>((resolve) => {
          const t = setTimeout(() => {
            server.kill();
            resolve();
          }, 5000);
          server.once('exit', () => {
            clearTimeout(t);
            resolve();
          });
          server.send('close');
        });
    });
    async function login(name: string): Promise<string> {
      const r = await request('/auth/login', '', {
        email: `${name}@http.test`,
        password: 'Http-test-password1!',
      });
      expect(r.status, output).toBe(200);
      return r.headers
        .getSetCookie()
        .map((c) => c.split(';')[0])
        .join('; ');
    }
    function request(
      path: string,
      cookie = student,
      body?: unknown,
      method = body === undefined ? 'GET' : 'POST',
    ): Promise<Response> {
      return fetch(`${url}${path}`, {
        method,
        headers: {
          cookie,
          origin,
          'content-type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }
    async function tick(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(output)), 10000);
        const listener = (m: unknown) => {
          if (m && typeof m === 'object' && 'notificationTick' in m) {
            clearTimeout(timer);
            server.off('message', listener);
            resolve();
          }
        };
        server.on('message', listener);
        server.send('notifications-tick');
      });
    }
    async function drain(): Promise<void> {
      for (let i = 0; i < 40; i++) {
        const [{ count }] = await db.query(
          "SELECT count(*)::int count FROM notification_events WHERE status='PENDING' AND not_before<=clock_timestamp() AND available_at<=clock_timestamp()",
        );
        if (!count) return;
        await tick();
      }
      throw new Error('Unprocessed notification jobs');
    }
    async function list(
      cookie = student,
      query = 'category=BUSINESS',
    ): Promise<{ data: NotificationDto[]; meta: { hasMore: boolean; nextCursor: string | null } }> {
      const r = await request(`/notification-inbox?${query}`, cookie);
      expect(r.status, output).toBe(200);
      return r.json() as Promise<{
        data: NotificationDto[];
        meta: { hasMore: boolean; nextCursor: string | null };
      }>;
    }
    async function connect(
      cookie = student,
      path = '/ws/notifications',
      namespace = '/notifications',
      auth?: Record<string, unknown>,
      requestedOrigin = origin,
    ): Promise<Socket> {
      const socket = io(`${url.replace('/api/v1', '')}${namespace}`, {
        path,
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
        auth,
        extraHeaders: { cookie, origin: requestedOrigin },
        timeout: 3000,
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
      });
      return socket;
    }
    function packet<T>(socket: Socket, event: string): Promise<T> {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Missing ${event}: ${output}`)), 7000);
        socket.once(event, (data) => {
          clearTimeout(timer);
          resolve(data as T);
        });
      });
    }

    it('migrates additive schema, keeps capture inactive until activation, validates API input', async () => {
      expect((await db.query('SELECT count(*)::int count FROM migrations'))[0].count).toBe(43);
      expect((await db.query('SELECT count(*)::int count FROM notification_events'))[0].count).toBe(
        0,
      );
      await db.query(
        "UPDATE class_sessions SET starts_at=starts_at+interval '1 minute',ends_at=ends_at+interval '1 minute',version=version+1 WHERE id=$1",
        [sessionId],
      );
      expect((await db.query('SELECT count(*)::int count FROM notification_events'))[0].count).toBe(
        0,
      );
      await db.query(
        'UPDATE notification_producers SET activated_at=clock_timestamp() WHERE activated_at IS NULL',
      );
      const draft = randomUUID(),
        unit = randomUUID(),
        draftSession = randomUUID();
      await db.query(
        `INSERT INTO classes(id,course_id,mentor_id,code,name,start_date,end_date,max_students,delivery_mode)
        SELECT $1,course_id,mentor_id,'PHASE16-DRAFT','Draft',start_date,end_date,10,delivery_mode FROM classes WHERE id=$2`,
        [draft, classId],
      );
      await db.query(
        `INSERT INTO class_units(id,class_id,course_unit_id,position) SELECT $1,$2,course_unit_id,1 FROM class_units WHERE class_id=$3 LIMIT 1`,
        [unit, draft, classId],
      );
      await db.query(
        `INSERT INTO class_sessions(id,class_unit_id,session_number,title,starts_at,ends_at) VALUES($1,$2,1,'Draft',clock_timestamp()+interval '2 days',clock_timestamp()+interval '2 days 1 hour')`,
        [draftSession, unit],
      );
      await db.query(
        "UPDATE class_sessions SET starts_at=starts_at+interval '1 minute',ends_at=ends_at+interval '1 minute',version=version+1 WHERE id=$1",
        [draftSession],
      );
      expect((await db.query('SELECT count(*)::int count FROM notification_events'))[0].count).toBe(
        0,
      );
      expect((await request('/notification-inbox?category=NOPE')).status).toBe(422);
      expect((await request('/notification-inbox?unreadOnly=oops')).status).toBe(422);
      expect(
        (await request('/notification-inbox/not-a-uuid/read', student, {}, 'PATCH')).status,
      ).toBe(400);
      expect(
        (await request(`/notification-inbox/${randomUUID()}/read`, student, {}, 'PATCH')).status,
      ).toBe(404);
      expect((await request('/notification-inbox', '')).status).toBe(401);
    });
    it('runs all three socket paths, rejects manager/foreign origin/wrong-channel tickets', async () => {
      const active = await Promise.all([
        connect(),
        connect(mentor, '/socket.io', '/chat'),
        connect(student, '/ws/whiteboards', ''),
      ]);
      for (const s of active) s.disconnect();
      await expect(connect(manager)).rejects.toThrow();
      await expect(
        connect(student, '/ws/notifications', '/notifications', undefined, 'https://foreign.test'),
      ).rejects.toThrow();
      const ticketResponse = await request('/auth/realtime-ticket', student, {
        channel: 'notifications',
      });
      expect(ticketResponse.status).toBe(200);
      const { ticket } = (await ticketResponse.json()) as { ticket: string };
      const valid = await connect('', '/ws/notifications', '/notifications', { ticket });
      valid.disconnect();
      const wrong = await request('/auth/realtime-ticket', student, { channel: 'whiteboards' });
      await expect(
        connect(student, '/ws/notifications', '/notifications', {
          ticket: ((await wrong.json()) as { ticket: string }).ticket,
        }),
      ).rejects.toThrow();
    });
    it('captures rollback/no-op/bulk reschedule once, own sockets and offline recovery', async () => {
      const first = await connect(),
        second = await connect(),
        foreign = await connect(other);
      let foreignPackets = 0;
      foreign.on('notification-inbox:created', () => foreignPackets++);
      const before = (await db.query('SELECT count(*)::int count FROM notification_events'))[0]
        .count;
      await expect(
        db.transaction(async (m) => {
          await m.query(
            "UPDATE class_sessions SET starts_at=starts_at+interval '1 minute',ends_at=ends_at+interval '1 minute',version=version+1 WHERE id=$1",
            [sessionId],
          );
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect((await db.query('SELECT count(*)::int count FROM notification_events'))[0].count).toBe(
        before,
      );
      const received = packet<{ notification: NotificationDto }>(
        first,
        'notification-inbox:created',
      );
      await db.query(
        "UPDATE class_sessions SET starts_at=starts_at+interval '1 minute',ends_at=ends_at+interval '1 minute',version=version+1 WHERE id=$1",
        [sessionId],
      );
      await db.query('UPDATE class_sessions SET title=title WHERE id=$1', [sessionId]);
      await drain();
      const { notification } = await received;
      expect(notification.type).toBe('SESSION_RESCHEDULED');
      expect(notification.actorId).toBeNull();
      expect(foreignPackets).toBe(0);
      expect((await list(other)).data).toHaveLength(0);
      expect(
        (await request(`/notification-inbox/${notification.id}/read`, other, {}, 'PATCH')).status,
      ).toBe(404);
      const invalidation = packet(second, 'notification-inbox:read');
      const read = await request(
        `/notification-inbox/${notification.id}/read`,
        student,
        {},
        'PATCH',
      );
      expect(read.status).toBe(200);
      await invalidation;
      const saved = ((await read.json()) as NotificationDto).readAt;
      expect(
        (
          (await (
            await request(`/notification-inbox/${notification.id}/read`, student, {}, 'PATCH')
          ).json()) as NotificationDto
        ).readAt,
      ).toBe(saved);
      for (const s of [first, second, foreign]) s.disconnect();
      await db.query(
        "UPDATE class_sessions SET starts_at=starts_at+interval '1 minute',ends_at=ends_at+interval '1 minute',version=version+1 WHERE id=$1",
        [sessionId],
      );
      await drain();
      expect((await list()).data.filter((n) => n.type === 'SESSION_RESCHEDULED')).toHaveLength(2);
      await db.query(
        "UPDATE notification_events SET status='PENDING',available_at=clock_timestamp(); UPDATE notification_recipients SET processed_at=NULL",
      );
      await drain();
      expect((await list()).data.filter((n) => n.type === 'SESSION_RESCHEDULED')).toHaveLength(2);
      const page = await list(student, 'category=BUSINESS&limit=1');
      expect(page.meta.hasMore).toBe(true);
      expect(
        (await request(`/notification-inbox?category=ALL&cursor=${page.meta.nextCursor}`)).status,
      ).toBe(422);
      expect(
        (
          await request(
            `/notification-inbox?category=BUSINESS&cursor=${page.meta.nextCursor}`,
            other,
          )
        ).status,
      ).toBe(422);
    });
    it('creates order expiry reminder and payment confirmation via real CASH workflow', async () => {
      await db.query(
        "UPDATE orders SET expires_at=clock_timestamp()+interval '2 hours' WHERE id=$1",
        [orderId],
      );
      await drain();
      await tick();
      await drain();
      expect((await list()).data.some((n) => n.type === 'ORDER_EXPIRING')).toBe(true);
      const confirmation = await request(`/manager/cash-orders/${orderId}/confirm`, manager, {
        receivedAmount: 5000,
      });
      expect(confirmation.status, await confirmation.text()).toBe(200);
      await drain();
      const rows = (await list()).data;
      expect(rows.some((n) => n.type === 'PAYMENT_CONFIRMED')).toBe(true);
      expect(rows.some((n) => n.type === 'ORDER_EXPIRING')).toBe(false);
    });
    it('publishes assignment, notifies deadlines, suppresses obsolete reminders', async () => {
      const aid = randomUUID();
      await db.query(
        `INSERT INTO assignments(id,session_id,purpose,type,title,max_score,due_at,created_by) VALUES($1,$2,'HOMEWORK','ZIP','Private homework',10,clock_timestamp()+interval '2 hours',$3)`,
        [aid, sessionId, mentorId],
      );
      await db.query(
        "UPDATE assignments SET status='PUBLISHED',published_at=clock_timestamp(),revision=revision+1 WHERE id=$1",
        [aid],
      );
      await drain();
      const initial = (await list()).data;
      expect(initial.some((n) => n.type === 'ASSIGNMENT_PUBLISHED')).toBe(true);
      expect(initial.some((n) => n.type === 'ASSIGNMENT_DUE_SOON')).toBe(true);
      await db.query(
        "UPDATE assignments SET due_at=due_at+interval '3 days',revision=revision+1 WHERE id=$1",
        [aid],
      );
      await drain();
      const after = (await list()).data;
      expect(after.some((n) => n.type === 'ASSIGNMENT_DEADLINE_CHANGED')).toBe(true);
      expect(after.some((n) => n.type === 'ASSIGNMENT_DUE_SOON')).toBe(false);
    });
    it('notifies ZIP submit/attempt and released grades with no score leakage', async () => {
      const [{ id: aid, revision }] = await db.query(
        "SELECT id,revision FROM assignments WHERE type='ZIP' LIMIT 1",
      );
      const [{ id: enrollment }] = await db.query(
        'SELECT id FROM enrollments WHERE student_id=$1 AND class_id=$2',
        [studentId, classId],
      );
      const submission = randomUUID(),
        file = randomUUID();
      await db.query(
        'INSERT INTO assignment_zip_submissions(id,assignment_id,student_id,enrollment_id) VALUES($1,$2,$3,$4)',
        [submission, aid, studentId, enrollment],
      );
      // Verified-file fixture: actual upload/validation has its own integration suites.
      await db.query(
        `INSERT INTO assignment_files(id,assignment_id,owner_user_id,zip_submission_id,purpose,original_name,
        declared_mime_type,declared_size_bytes,bucket,staging_key,object_key,object_version_id,mime_type,size_bytes,status,intent_expires_at,ready_at)
        VALUES($1::uuid,$2,$3,$4,'SUBMISSION','work.zip','application/zip',10,'phase16-test',$1::uuid::text,$1::uuid::text,'verified','application/zip',10,'READY',clock_timestamp()+interval '1 hour',clock_timestamp())`,
        [file, aid, studentId, submission],
      );
      await db.query(
        "UPDATE assignment_zip_submissions SET file_id=$2,object_version_id='verified' WHERE id=$1",
        [submission, file],
      );
      const submitted = await request(`/me/zip-submissions/${submission}/submit`, student, {
        expectedVersion: 1,
      });
      expect(submitted.status, await submitted.text()).toBe(200);
      await drain();
      const pending = (await list(mentor)).data.find(
        (n) => n.type === 'ZIP_SUBMISSION_REVIEW_REQUIRED',
      );
      expect(pending?.target.id).toBe(submission);
      expect((await list(other)).data.some((n) => n.target.id === submission)).toBe(false);
      const graded = await request(
        `/mentor/zip-submissions/${submission}/grade`,
        mentor,
        { expectedVersion: 0, score: '8.5', feedback: 'private feedback' },
        'PUT',
      );
      expect(graded.status, await graded.text()).toBe(200);
      await drain();
      expect((await list()).data.some((n) => n.type === 'ASSIGNMENT_GRADE_RELEASED')).toBe(false);
      const released = await request(
        `/mentor/zip-submissions/${submission}/grade/release`,
        mentor,
        { expectedVersion: 1, gradeVersion: 1 },
      );
      expect(released.status, await released.text()).toBe(200);
      await drain();
      const notice = (await list()).data.find((n) => n.type === 'ASSIGNMENT_GRADE_RELEASED');
      expect(notice?.target.id).toBe(submission);
      expect(JSON.stringify(notice)).not.toContain('private feedback');
      expect(notice?.data).not.toHaveProperty('score');
      expect(
        (await list(mentor)).data.some((n) => n.type === 'ZIP_SUBMISSION_REVIEW_REQUIRED'),
      ).toBe(false);
      expect(revision).toBeGreaterThan(0);
    });
    it('captures material approval/publication and rejection; unpublish hides student notices', async () => {
      const [{ course_unit_id: unit }] = await db.query(
        'SELECT course_unit_id FROM class_units WHERE class_id=$1 LIMIT 1',
        [classId],
      );
      const [{ id: reviewer }] = await db.query(
        "SELECT id FROM users WHERE email='manager@http.test'",
      );
      const mid = randomUUID(),
        rejected = randomUUID();
      for (const id of [mid, rejected])
        await db.query(
          `INSERT INTO materials(id,course_unit_id,content_type,title,content_html,content_schema_version,created_by,created_in_class_id,review_status)
        VALUES($1,$2,'ARTICLE','Review fixture','<p>Safe article</p>',1,$3,$4,'PENDING_REVIEW')`,
          [id, unit, mentorId, classId],
        );
      await db.query(
        `UPDATE materials SET review_status='APPROVED',approved_revision=revision,reviewed_by=$2,reviewed_at=clock_timestamp(),
        first_approved_at=clock_timestamp(),published_at=clock_timestamp(),available_at=clock_timestamp()+interval '1 hour' WHERE id=$1`,
        [mid, reviewer],
      );
      await db.query(
        `UPDATE materials SET review_status='REJECTED',reviewed_by=$2,reviewed_at=clock_timestamp(),rejection_reason='private rejection detail' WHERE id=$1`,
        [rejected, reviewer],
      );
      await drain();
      expect((await list()).data.some((n) => n.type === 'MATERIAL_PUBLISHED')).toBe(false);
      const reviews = (await list(mentor)).data.filter((n) =>
        n.type.startsWith('MATERIAL_REVIEW_'),
      );
      expect(reviews.map((n) => n.type).sort()).toEqual([
        'MATERIAL_REVIEW_APPROVED',
        'MATERIAL_REVIEW_REJECTED',
      ]);
      expect(JSON.stringify(reviews)).not.toContain('private rejection detail');
      await db.query(
        "UPDATE materials SET available_at=clock_timestamp()-interval '1 minute' WHERE id=$1",
        [mid],
      );
      await db.query(
        "UPDATE notification_events SET not_before=clock_timestamp() WHERE type='MATERIAL_PUBLISHED'",
      );
      await drain();
      expect((await list()).data.some((n) => n.type === 'MATERIAL_PUBLISHED')).toBe(true);
      await db.query('UPDATE materials SET published_at=NULL WHERE id=$1', [mid]);
      expect((await list()).data.some((n) => n.type === 'MATERIAL_PUBLISHED')).toBe(false);
    });
    it('captures mentor leave outcomes only for requester and staff requests via REST', async () => {
      const [{ id: reviewer }] = await db.query(
        "SELECT id FROM users WHERE email='manager@http.test'",
      );
      for (const status of ['APPROVED', 'REJECTED']) {
        const id = randomUUID();
        await db.query(
          `INSERT INTO mentor_leave_requests(id,mentor_id,from_date,to_date,period,reason,expires_at)
          VALUES($1,$2,current_date+2,current_date+2,'FULL_DAY','private leave reason',clock_timestamp()+interval '1 day')`,
          [id, mentorId],
        );
        await drain();
        expect((await list(manager)).data.some((n) => n.type === 'MENTOR_LEAVE_REQUESTED')).toBe(
          true,
        );
        await db.query(
          'UPDATE mentor_leave_requests SET status=$2,version=version+1,reviewed_by=$3,reviewed_at=clock_timestamp() WHERE id=$1',
          [id, status, reviewer],
        );
        await drain();
      }
      const notices = (await list(mentor, 'category=LEAVE_MAKEUP')).data;
      expect(notices.map((n) => n.type).sort()).toEqual([
        'MENTOR_LEAVE_APPROVED',
        'MENTOR_LEAVE_REJECTED',
      ]);
      expect(JSON.stringify(notices)).not.toContain('private leave reason');
      expect((await list(manager)).data.some((n) => n.type === 'MENTOR_LEAVE_REQUESTED')).toBe(
        false,
      );
      expect((await list()).data.some((n) => n.type.startsWith('MENTOR_LEAVE_'))).toBe(false);
    });
    it('keeps late fanout unread when read-all has already snapshotted IDs', async () => {
      const blocker = db.createQueryRunner();
      await blocker.connect();
      await blocker.startTransaction();
      await blocker.query('SELECT pg_advisory_xact_lock(161616)');
      await db.query(`CREATE FUNCTION phase16_read_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(161616); RETURN NEW; END $$;
        CREATE TRIGGER phase16_read_barrier BEFORE UPDATE OF read_at ON notifications FOR EACH ROW EXECUTE FUNCTION phase16_read_barrier()`);
      let pending: Promise<Response> | undefined;
      try {
        pending = request('/notification-inbox/read-all?category=BUSINESS', student, {});
        for (let n = 0; n < 100; n++) {
          const [{ waiting }] = await db.query(
            "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=161616 AND NOT granted) waiting",
          );
          if (waiting) break;
          if (n === 99) throw new Error('Read barrier did not engage');
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        await db.query(
          "UPDATE class_sessions SET starts_at=starts_at+interval '1 minute',ends_at=ends_at+interval '1 minute',version=version+1 WHERE id=$1",
          [sessionId],
        );
        await drain();
        await blocker.commitTransaction();
        expect((await pending).status).toBe(200);
        expect(
          (
            (await (
              await request('/notification-inbox/unread-count?category=BUSINESS')
            ).json()) as { unreadCount: number }
          ).unreadCount,
        ).toBe(1);
      } finally {
        if (blocker.isTransactionActive) await blocker.rollbackTransaction();
        await blocker.release();
        if (pending) await pending;
        await db.query(
          'DROP TRIGGER phase16_read_barrier ON notifications; DROP FUNCTION phase16_read_barrier()',
        );
      }
    });
    it('survives failed fanout and retries the same event without losing recipient checkpoints', async () => {
      await db.query(`CREATE FUNCTION phase16_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.type='SESSION_RESCHEDULED' THEN RAISE EXCEPTION 'test fanout crash'; END IF; RETURN NEW; END $$;
        CREATE TRIGGER phase16_fail_insert BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION phase16_fail_insert()`);
      await db.query(
        "UPDATE class_sessions SET starts_at=starts_at+interval '1 minute',ends_at=ends_at+interval '1 minute',version=version+1 WHERE id=$1",
        [sessionId],
      );
      await tick();
      const [failed] = await db.query(
        "SELECT id,status,last_error FROM notification_events WHERE type='SESSION_RESCHEDULED' ORDER BY occurred_at DESC LIMIT 1",
      );
      expect(failed.status).toBe('PENDING');
      expect(failed.last_error).toBe('DELIVERY_RETRY_REQUIRED');
      expect(
        (
          await db.query('SELECT count(*)::int n FROM notifications WHERE event_id=$1', [failed.id])
        )[0].n,
      ).toBe(0);
      await db.query(
        'DROP TRIGGER phase16_fail_insert ON notifications; DROP FUNCTION phase16_fail_insert()',
      );
      await db.query('UPDATE notification_events SET available_at=clock_timestamp() WHERE id=$1', [
        failed.id,
      ]);
      await drain();
      expect(
        (
          await db.query('SELECT count(*)::int n FROM notifications WHERE event_id=$1', [failed.id])
        )[0].n,
      ).toBe(2);
    });
    it('delivers with CHAT_OFF and preserves capture/inbox while unified delivery is disabled', async () => {
      const flags = async (values: Record<string, boolean>): Promise<void> => {
        const id = randomUUID();
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('Flag timeout')), 5000);
          const listener = (m: unknown) => {
            if (
              m &&
              typeof m === 'object' &&
              'notificationFlags' in m &&
              m.notificationFlags === id
            ) {
              clearTimeout(timer);
              server.off('message', listener);
              resolve();
            }
          };
          server.on('message', listener);
          server.send({ type: 'notification-flags', id, ...values });
        });
      };
      await flags({ CHAT_ENABLED: false });
      const live = await connect(),
        received = packet<{ notification: NotificationDto }>(live, 'notification-inbox:created');
      await db.query(
        "UPDATE class_sessions SET starts_at=starts_at+interval '1 minute',ends_at=ends_at+interval '1 minute',version=version+1 WHERE id=$1",
        [sessionId],
      );
      await drain();
      expect((await received).notification.type).toBe('SESSION_RESCHEDULED');
      live.disconnect();
      expect((await list(student, 'category=CHAT')).data).toEqual([]);
      await flags({ NOTIFICATIONS_ENABLED: false });
      expect((await request('/notification-inbox')).status).toBe(503);
      await expect(connect()).rejects.toThrow();
      const before = (await db.query('SELECT count(*)::int n FROM notification_events'))[0].n;
      await db.query(
        "UPDATE class_sessions SET starts_at=starts_at+interval '1 minute',ends_at=ends_at+interval '1 minute',version=version+1 WHERE id=$1",
        [sessionId],
      );
      await drain();
      expect((await db.query('SELECT count(*)::int n FROM notification_events'))[0].n).toBe(
        before + 1,
      );
      await flags({ NOTIFICATIONS_ENABLED: true, CHAT_ENABLED: true });
      expect((await list()).data.some((n) => n.type === 'SESSION_RESCHEDULED')).toBe(true);
      const peers = await Promise.all(Array.from({ length: 5 }, () => connect()));
      await expect(connect()).rejects.toThrow();
      for (const peer of peers) peer.disconnect();
    });
    it('sends reminder only before the scheduled start and informs an old mentor generically after replacement', async () => {
      const [{ id: replacement }] = await db.query(
        `INSERT INTO users(email,password_hash,display_name,role,status)
        SELECT 'mentor2@http.test',password_hash,'Replacement','MENTOR','ACTIVE' FROM users WHERE id=$1 RETURNING id`,
        [mentorId],
      );
      await db.query(
        "UPDATE class_sessions SET starts_at=clock_timestamp()+interval '20 minutes',ends_at=clock_timestamp()+interval '80 minutes',version=version+1 WHERE id=$1",
        [sessionId],
      );
      await tick();
      await drain();
      expect((await list()).data.some((n) => n.type === 'SESSION_STARTING_SOON')).toBe(true);
      await db.query(
        'UPDATE class_sessions SET mentor_override_id=$2,version=version+1 WHERE id=$1',
        [sessionId, replacement],
      );
      await drain();
      const old = (await list(mentor)).data.find((n) => n.type === 'SESSION_MENTOR_CHANGED');
      expect(old?.target.available).toBe(false);
      expect(old?.target.contextId).toBeUndefined();
      await db.query(
        "UPDATE class_sessions SET starts_at=clock_timestamp()-interval '1 hour',ends_at=clock_timestamp()+interval '1 hour',version=version+1 WHERE id=$1",
        [sessionId],
      );
      expect((await list()).data.some((n) => n.type === 'SESSION_STARTING_SOON')).toBe(false);
      await db.query(
        'UPDATE class_sessions SET mentor_override_id=NULL,version=version+1 WHERE id=$1',
        [sessionId],
      );
      await drain();
    });
    it('scopes placement notifications to the placed student and target mentor', async () => {
      const target = randomUUID(),
        unit = randomUUID(),
        targetSession = randomUUID(),
        conflict = randomUUID(),
        placement = randomUUID();
      const [{ id: enrollment }] = await db.query(
        'SELECT id FROM enrollments WHERE student_id=$1 AND class_id=$2',
        [studentId, classId],
      );
      const [{ course_unit_id: courseUnit }] = await db.query(
        'SELECT course_unit_id FROM class_units WHERE class_id=$1 LIMIT 1',
        [classId],
      );
      await db.query(
        `INSERT INTO classes(id,course_id,mentor_id,code,name,start_date,end_date,max_students,delivery_mode,status)
        SELECT $1,course_id,mentor_id,'PHASE16-TARGET','Target',start_date,end_date,10,delivery_mode,'OPEN' FROM classes WHERE id=$2`,
        [target, classId],
      );
      await db.query(
        'INSERT INTO class_units(id,class_id,course_unit_id,position) VALUES($1,$2,$3,1)',
        [unit, target, courseUnit],
      );
      await db.query(
        `INSERT INTO class_sessions(id,class_unit_id,session_number,title,starts_at,ends_at) VALUES($1,$2,1,'Makeup target',clock_timestamp()+interval '2 days',clock_timestamp()+interval '2 days 1 hour')`,
        [targetSession, unit],
      );
      await db.query(
        'INSERT INTO student_schedule_conflicts(id,enrollment_id,source_session_id) VALUES($1,$2,$3)',
        [conflict, enrollment, sessionId],
      );
      await db.query(
        `INSERT INTO makeup_placements(id,conflict_id,enrollment_id,student_id,source_class_id,source_session_id,source_root_session_id,target_class_id,target_session_id,course_unit_id,content_match_confirmed,reason,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,true,'placement fixture',$10)`,
        [
          placement,
          conflict,
          enrollment,
          studentId,
          classId,
          sessionId,
          target,
          targetSession,
          courseUnit,
          mentorId,
        ],
      );
      await drain();
      expect((await list()).data.some((n) => n.type === 'MAKEUP_PLACEMENT_CREATED')).toBe(true);
      expect((await list(mentor)).data.some((n) => n.type === 'MAKEUP_PLACEMENT_CREATED')).toBe(
        true,
      );
      expect((await list(other)).data.some((n) => n.type === 'MAKEUP_PLACEMENT_CREATED')).toBe(
        false,
      );
      await db.query(
        "UPDATE makeup_placements SET status='CANCELLED',version=version+1 WHERE id=$1",
        [placement],
      );
      await drain();
      const terminal = (await list()).data.find((n) => n.type === 'MAKEUP_PLACEMENT_CANCELLED');
      expect(terminal?.target.available).toBe(false);
    });
    it('captures cancellation before scope loss, creates a replacement session and avoids class cascade spam', async () => {
      const [{ class_unit_id: unit }] = await db.query(
        'SELECT class_unit_id FROM class_sessions WHERE id=$1',
        [sessionId],
      );
      await db.query("UPDATE class_sessions SET status='CANCELLED',version=version+1 WHERE id=$1", [
        sessionId,
      ]);
      await drain();
      const cancelled = (await list()).data.find((n) => n.type === 'SESSION_CANCELLED');
      expect(cancelled?.target.available).toBe(false);
      const replacement = randomUUID();
      await db.query(
        `INSERT INTO class_sessions(id,class_unit_id,session_number,title,starts_at,ends_at,makeup_for_session_id,makeup_root_session_id)
        VALUES($1,$2,2,'Replacement',clock_timestamp()+interval '3 days',clock_timestamp()+interval '3 days 1 hour',$3,$3)`,
        [replacement, unit, sessionId],
      );
      await drain();
      expect(
        (await list()).data.some(
          (n) => n.type === 'MAKEUP_SESSION_SCHEDULED' && n.target.id === replacement,
        ),
      ).toBe(true);
      // This is the same transaction marker used by the audited class-cancel service.
      await db.transaction(async (m) => {
        await m.query("SELECT set_config('mindy.notification_class_cancel',$1,true)", [classId]);
        await m.query(
          "UPDATE class_sessions SET status='CANCELLED',version=version+1 WHERE class_id=$1 AND status='SCHEDULED'",
          [classId],
        );
        await m.query(
          "UPDATE classes SET status='CANCELLED',assignment_version=assignment_version+1 WHERE id=$1",
          [classId],
        );
      });
      await drain();
      expect(
        (
          await db.query(
            "SELECT count(*)::int n FROM notification_events WHERE type='CLASS_CANCELLED' AND resource_id=$1",
            [classId],
          )
        )[0].n,
      ).toBe(1);
      expect(
        (
          await db.query(
            "SELECT count(*)::int n FROM notification_events WHERE type='SESSION_CANCELLED' AND resource_id=$1",
            [replacement],
          )
        )[0].n,
      ).toBe(0);
      expect((await list()).data.some((n) => n.type === 'CLASS_CANCELLED')).toBe(true);
    });
    it('hides active notices after enrollment revoke while order owner notices remain', async () => {
      await db.query("UPDATE enrollments SET status='CANCELLED' WHERE student_id=$1", [studentId]);
      const rows = (await list()).data;
      expect(rows.some((n) => n.type === 'SESSION_RESCHEDULED')).toBe(false);
      expect(rows.some((n) => n.type === 'PAYMENT_CONFIRMED')).toBe(true);
      expect(
        (await request('/notification-inbox/read-all?category=BUSINESS', student, {})).status,
      ).toBe(200);
      expect(
        await (await request('/notification-inbox/unread-count?category=BUSINESS')).json(),
      ).toEqual({ unreadCount: 0 });
    });
    it('disconnects revoked accounts and refuses stale access tickets', async () => {
      const socket = await connect(other),
        closed = packet(socket, 'disconnect');
      await db.query("UPDATE users SET status='SUSPENDED' WHERE email='other@http.test'");
      await closed;
      await expect(connect(other)).rejects.toThrow();
      expect(tokens).toBeDefined();
    });
    it('does not resurrect notifications when an enrollment is revoked and later restored', async () => {
      const [{ id: target }] = await db.query("SELECT id FROM classes WHERE code='PHASE16-TARGET'");
      const [{ id: sid }] = await db.query('SELECT id FROM class_sessions WHERE class_id=$1', [
        target,
      ]);
      expect((await request('/me/cart/items', student, { classId: target })).status).toBe(201);
      expect((await request('/me/cart/checkout', student, { paymentType: 'CASH' })).status).toBe(
        201,
      );
      const [{ id: oid }] = await db.query(
        "SELECT id FROM orders WHERE student_id=$1 AND status='PENDING'",
        [studentId],
      );
      expect(
        (await request(`/manager/cash-orders/${oid}/confirm`, manager, { receivedAmount: 5000 }))
          .status,
      ).toBe(200);
      await drain();
      await db.query(
        "UPDATE class_sessions SET starts_at=starts_at+interval '1 minute',ends_at=ends_at+interval '1 minute',version=version+1 WHERE id=$1",
        [sid],
      );
      const [{ id: event }] = await db.query(
        "SELECT id FROM notification_events WHERE type='SESSION_RESCHEDULED' AND resource_id=$1 ORDER BY occurred_at DESC LIMIT 1",
        [sid],
      );
      await db.query(
        "UPDATE enrollments SET status='CANCELLED' WHERE class_id=$1 AND student_id=$2",
        [target, studentId],
      );
      await db.query("UPDATE enrollments SET status='ACTIVE' WHERE class_id=$1 AND student_id=$2", [
        target,
        studentId,
      ]);
      await drain();
      expect(
        (
          await db.query(
            'SELECT count(*)::int n FROM notifications WHERE event_id=$1 AND user_id=$2',
            [event, studentId],
          )
        )[0].n,
      ).toBe(0);
      expect(
        (await list()).data.some((n) => n.type === 'SESSION_RESCHEDULED' && n.target.id === sid),
      ).toBe(false);
    });
    it('preserves legacy chat read state and BUSINESS read-all excludes chat rows', async () => {
      const [{ id: target }] = await db.query("SELECT id FROM classes WHERE code='PHASE16-TARGET'");
      const conv = randomUUID(),
        message = randomUUID(),
        id = randomUUID();
      await db.query("INSERT INTO chat_conversations(id,type,class_id) VALUES($1,'CLASS',$2)", [
        conv,
        target,
      ]);
      await db.query('INSERT INTO chat_members(conversation_id,user_id) VALUES($1,$2)', [
        conv,
        studentId,
      ]);
      await db.query(
        `INSERT INTO chat_messages(id,conversation_id,sender_id,client_message_id,sequence,last_changed_seq,ciphertext,iv,tag,key_version,crypto_version)
        VALUES($1,$2,$3,$4,1,1,$5,$6,$7,1,1)`,
        [
          message,
          conv,
          mentorId,
          randomUUID(),
          Buffer.from('fixture'),
          Buffer.alloc(12),
          Buffer.alloc(16),
        ],
      );
      await db.query(
        'INSERT INTO notifications(id,user_id,actor_id,conversation_id,message_id) VALUES($1,$2,$3,$4,$5)',
        [id, studentId, mentorId, conv, message],
      );
      expect((await list(student, 'category=CHAT')).data.map((n) => n.id)).toContain(id);
      expect((await list()).data.some((n) => n.id === id)).toBe(false);
      expect(
        (await request('/notification-inbox/read-all?category=BUSINESS', student, {})).status,
      ).toBe(200);
      expect(
        (await db.query('SELECT read_at FROM notifications WHERE id=$1', [id]))[0].read_at,
      ).toBeNull();
      const peer = await connect(),
        signal = packet(peer, 'notification-inbox:read');
      expect((await request(`/notifications/${id}/read`, student, {}, 'PATCH')).status).toBe(200);
      await signal;
      expect(
        (await list(student, 'category=CHAT')).data.find((n) => n.id === id)?.readAt,
      ).not.toBeNull();
      peer.disconnect();
      expect(
        (
          await db.query(
            'SELECT last_read_seq FROM chat_members WHERE conversation_id=$1 AND user_id=$2',
            [conv, studentId],
          )
        )[0].last_read_seq,
      ).toBe('0');
      expect(
        (
          await request('/notification-inbox/read-all?category=BUSINESS', student, {
            unexpected: true,
          })
        ).status,
      ).toBe(422);
    });
    it('disconnects a revoked auth session and enforces current role on a ticket', async () => {
      const peer = await connect(mentor),
        closed = packet(peer, 'disconnect');
      await db.query('UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=$1', [
        mentorId,
      ]);
      await closed;
      await expect(connect(mentor)).rejects.toThrow();
      mentor = await login('mentor');
      const issued = await request('/auth/realtime-ticket', mentor, { channel: 'notifications' });
      const { ticket } = (await issued.json()) as { ticket: string };
      await db.query("UPDATE users SET role='STUDENT' WHERE id=$1", [mentorId]);
      await expect(
        connect('', '/ws/notifications', '/notifications', { ticket }),
      ).rejects.toThrow();
      await db.query("UPDATE users SET role='MENTOR' WHERE id=$1", [mentorId]);
    });
    it('measures 100-recipient fanout and list/count with 10000 durable rows for one user', async () => {
      const [{ id: target }] = await db.query("SELECT id FROM classes WHERE code='PHASE16-TARGET'");
      const [{ id: sid }] = await db.query('SELECT id FROM class_sessions WHERE class_id=$1', [
        target,
      ]);
      await db.query('UPDATE classes SET max_students=150 WHERE id=$1', [target]);
      await db.query(
        `WITH members AS (INSERT INTO users(email,password_hash,display_name,role,status)
        SELECT 'load-'||n::text||'@phase16.test',u.password_hash,'Load fixture','STUDENT','ACTIVE' FROM users u CROSS JOIN generate_series(1,100) n WHERE u.id=$2 RETURNING id),
        paid AS (INSERT INTO orders(student_id,order_code,total_amount,status,payment_type,expires_at,paid_at)
          SELECT id,'load-'||id::text,5000,'PAID','PAYOS',clock_timestamp()+interval '1 day',clock_timestamp() FROM members RETURNING id,student_id),
        details AS (INSERT INTO order_details(order_id,class_id,course_title_snapshot,class_name_snapshot,price_snapshot,total_amount)
          SELECT id,$1,'Load course','Load class',5000,5000 FROM paid RETURNING id,order_id)
        INSERT INTO enrollments(student_id,class_id,order_detail_id,status,enrolled_at)
          SELECT p.student_id,$1,d.id,'ACTIVE',clock_timestamp() FROM details d JOIN paid p ON p.id=d.order_id`,
        [target, mentorId],
      );
      const started = performance.now();
      await db.query(
        "UPDATE class_sessions SET starts_at=starts_at+interval '1 minute',ends_at=ends_at+interval '1 minute',version=version+1 WHERE id=$1",
        [sid],
      );
      await drain();
      const fanoutMs = performance.now() - started;
      const [{ n }] = await db.query(
        `SELECT count(*)::int n FROM notifications n JOIN notification_events e ON e.id=n.event_id
        WHERE e.id=(SELECT id FROM notification_events WHERE type='SESSION_RESCHEDULED' AND resource_id=$1 ORDER BY occurred_at DESC LIMIT 1)`,
        [sid],
      );
      expect(n).toBe(102);
      expect(fanoutMs).toBeLessThan(10000);
      await db.query(
        `WITH captured AS (INSERT INTO notification_events(event_key,producer,epoch,type,resource_kind,resource_id,revision,status,completed_at)
        SELECT 'benchmark/'||g::text,'PAYMENT',p.epoch,'PAYMENT_CONFIRMED','ORDER',$1,g::text,'DONE',clock_timestamp()
        FROM generate_series(1,10000) g CROSS JOIN notification_producers p WHERE p.name='PAYMENT' RETURNING id),
        recipients AS (INSERT INTO notification_recipients(event_id,user_id,role,terminal,processed_at)
          SELECT id,$2,'STUDENT',true,clock_timestamp() FROM captured RETURNING event_id)
        INSERT INTO notifications(user_id,type,event_id) SELECT $2,'PAYMENT_CONFIRMED',event_id FROM recipients`,
        [orderId, studentId],
      );
      const lists: number[] = [],
        counts: number[] = [];
      for (let i = 0; i < 7; i++) {
        let start = performance.now();
        expect((await list()).data).toHaveLength(20);
        lists.push(performance.now() - start);
        start = performance.now();
        const result = await request('/notification-inbox/unread-count?category=BUSINESS');
        expect(result.status).toBe(200);
        expect(
          ((await result.json()) as { unreadCount: number }).unreadCount,
        ).toBeGreaterThanOrEqual(10000);
        counts.push(performance.now() - start);
      }
      const p95 = (xs: number[]): number =>
        Math.round(xs.sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1] ?? 0);
      console.info(
        'Phase16 local benchmark',
        JSON.stringify({
          node: process.version,
          recipients: n,
          fanoutMs: Math.round(fanoutMs),
          inboxRows: 10000,
          samples: 7,
          listP95Ms: p95(lists),
          countP95Ms: p95(counts),
        }),
      );
      expect(p95(lists)).toBeLessThan(500);
      expect(p95(counts)).toBeLessThan(500);
    }, 30000);
  },
);
