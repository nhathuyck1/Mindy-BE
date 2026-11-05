import { readFile, writeFile } from 'node:fs/promises';
import { WhiteboardShapes1793664000001 } from '../../src/database/migrations/1793664000001-whiteboard-shapes.js';
import type { BoardShape } from '../../src/modules/whiteboards/domain/board-document.js';
import { type BoardBounds, boardSvg } from '../../src/modules/whiteboards/domain/board-render.js';
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { Whiteboards1793664000000 } from '../../src/database/migrations/1793664000000-whiteboards.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { PasswordService } from '../../src/modules/auth/services/password.service.js';
import { SessionService } from '../../src/modules/auth/services/session.service.js';
import { TokenService } from '../../src/modules/auth/services/token.service.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { PaymentType } from '../../src/modules/commerce/enums/payment-type.enum.js';
import { validateBinary } from '../../src/modules/files/validation/binary-validation.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { loadDocument, projectBoard } from '../../src/modules/whiteboards/domain/board-document.js';
import { WhiteboardAccessService } from '../../src/modules/whiteboards/whiteboard-access.service.js';
import { WhiteboardMediaService } from '../../src/modules/whiteboards/whiteboard-media.service.js';
import { WhiteboardMediaWorker } from '../../src/modules/whiteboards/whiteboard-media.worker.js';
import { WhiteboardsService } from '../../src/modules/whiteboards/whiteboards.service.js';
import { CHAT_MIGRATIONS } from '../helpers/chat-migrations.js';
import { fileConfig, storageFixture, upload } from '../helpers/files-fixture.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

function sticky(doc: Y.Doc, text = 'Tiếng Việt') {
  const id = randomUUID(),
    s = new Y.Map<unknown>();
  doc.transact(() => {
    for (const [key, value] of Object.entries({
      id,
      type: 'sticky',
      x: 20,
      y: 30,
      width: 220,
      height: 150,
      color: '#f9d85f',
    }))
      s.set(key, value);
    s.set('text', new Y.Text(text));
    doc.getMap('shapes').set(id, s);
  });
  return id;
}
describe.skipIf(!separateTestUrl('whiteboards'))(
  'Phase 7 durable boards and private media PostgreSQL/MinIO',
  () => {
    let db: DataSource,
      f: ReturnType<typeof paymentFixture>,
      boards: WhiteboardsService,
      media: WhiteboardMediaService,
      worker: WhiteboardMediaWorker;
    let remote: Awaited<ReturnType<typeof storageFixture>>, config: ConfigService;
    beforeAll(async () => {
      db = await paymentDatabase('whiteboards', {
        migrations: [
          ...CHAT_MIGRATIONS.filter((m) => m.name !== 'MentorLeave1792195200000'),
          Whiteboards1793664000000,
          WhiteboardShapes1793664000001,
        ],
      });
      f = paymentFixture(db);
      config = fileConfig({
        WHITEBOARD_ENABLED: true,
        WHITEBOARD_PDF_ENABLED: true,
        WHITEBOARD_PDFTOPPM_PATH: process.env.WHITEBOARD_PDFTOPPM_PATH ?? 'pdftoppm',
      });
      const passwords = new PasswordService(),
        tokens = new TokenService(config);
      const auth = new AuthService(
        db,
        config,
        f.users,
        passwords,
        tokens,
        new SessionService(config, passwords, tokens),
      );
      const access = new WhiteboardAccessService(
        new TeachingReadService(db, f.config, f.users, new ScheduleReservationsService()),
        f.users,
        f.enrollments,
        auth,
      );
      boards = new WhiteboardsService(db, config, access);
      remote = await storageFixture(config);
      media = new WhiteboardMediaService(db, config, boards, remote.storage);
      worker = new WhiteboardMediaWorker(
        db,
        config,
        remote.storage,
        { validate: validateBinary },
        {
          render: async (input, output) => {
            const data = JSON.parse(await readFile(input, 'utf8')) as {
              shapes: BoardShape[];
              bounds: BoardBounds;
              images: Record<string, string>;
              format: string;
            };
            const png = await sharp(Buffer.from(boardSvg(data.shapes, data.bounds, data.images)))
              .png()
              .toBuffer();
            if (data.format === 'PNG') await writeFile(output, png);
            else {
              const pdf = await PDFDocument.create();
              const img = await pdf.embedPng(png);
              pdf.addPage([img.width, img.height]).drawImage(img);
              await writeFile(output, await pdf.save());
            }
          },
        },
      );
    }, 60000);
    afterAll(async () => {
      await remote?.cleanup();
      if (db?.isInitialized) await db.destroy();
    });
    async function actor(userId: string, role: UserRole): Promise<AuthenticatedUser> {
      const sessionId = randomUUID();
      await db.query(
        "INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')",
        [sessionId, userId],
      );
      return { userId, role, sessionId };
    }
    async function setup(active = true) {
      const order = await f.order({ paymentType: PaymentType.CASH });
      const classId = order.classIds[0];
      const mentor = await actor(order.mentor.id, UserRole.MENTOR),
        student = await actor(order.student.id, UserRole.STUDENT);
      if (active)
        await db.query(
          "UPDATE enrollments SET status='ACTIVE',enrolled_at=now() WHERE class_id=$1",
          [classId],
        );
      const sessions: { id: string }[] = await db.query(
        'SELECT id FROM class_sessions WHERE class_id=$1 ORDER BY id',
        [classId],
      );
      const sessionId = sessions[0]?.id ?? '';
      return { order, classId, sessionId, mentor, student };
    }
    async function create() {
      const s = await setup();
      const result = await boards.create(s.mentor, s.sessionId, randomUUID(), {});
      return { ...s, board: result.board };
    }
    async function send(s: Awaited<ReturnType<typeof create>>, doc: Y.Doc) {
      return boards.update(
        s.mentor,
        s.board.id,
        s.board.epoch,
        randomUUID(),
        Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
      );
    }
    it('GET is side effect free; create is unique, replayable and body-bound', async () => {
      const s = await setup();
      expect((await boards.context(s.mentor, s.sessionId)).board).toBeNull();
      expect(
        await db.query('SELECT 1 FROM whiteboards WHERE session_id=$1', [s.sessionId]),
      ).toHaveLength(0);
      const key = randomUUID(),
        first = await boards.create(s.mentor, s.sessionId, key, { title: 'Bảng chung' });
      expect(
        (await boards.create(s.mentor, s.sessionId, key, { title: 'Bảng chung' })).board.id,
      ).toBe(first.board.id);
      await expect(
        boards.create(s.mentor, s.sessionId, key, { title: 'Khác' }),
      ).rejects.toMatchObject({ status: 409 });
      const results = await Promise.allSettled([
        boards.create(s.mentor, s.sessionId, randomUUID(), {}),
        boards.create(s.mentor, s.sessionId, randomUUID(), {}),
      ]);
      expect(results.every((r) => r.status === 'rejected')).toBe(true);
    });
    it('denies CASH preview, unrelated students/mentors, cancelled sessions and revoked auth', async () => {
      const s = await setup(false),
        b = await boards.create(s.mentor, s.sessionId, randomUUID(), {});
      await expect(boards.get(s.student, b.board.id)).rejects.toMatchObject({ status: 403 });
      const other = await actor((await f.user(UserRole.MENTOR)).id, UserRole.MENTOR);
      await expect(boards.sync(other, b.board.id)).rejects.toMatchObject({ status: 403 });
      await db.query('UPDATE auth_sessions SET revoked_at=now() WHERE id=$1', [s.mentor.sessionId]);
      await expect(boards.sync(s.mentor, b.board.id)).rejects.toMatchObject({ status: 401 });
    });
    it('rejects read-only updates before decoding and validates candidate schema without corrupting persisted state', async () => {
      const s = await create(),
        doc = new Y.Doc();
      sticky(doc);
      const binary = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
      await expect(
        boards.update(s.student, s.board.id, s.board.epoch, randomUUID(), binary),
      ).rejects.toMatchObject({ status: 403 });
      doc.getMap('unexpected').set('src', 'https://evil.test');
      await expect(send(s, doc)).rejects.toMatchObject({ status: 422 });
      const clean = loadDocument(
        Buffer.from((await boards.sync(s.mentor, s.board.id)).binary, 'base64'),
      );
      expect(projectBoard(clean)).toHaveLength(0);
      doc.destroy();
      clean.destroy();
    });
    it('ACK survives fresh service reads; update replay is idempotent and payload-bound', async () => {
      const s = await create(),
        doc = new Y.Doc();
      sticky(doc);
      const key = randomUUID(),
        binary = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
      const ack = await boards.update(s.mentor, s.board.id, s.board.epoch, key, binary);
      expect(ack.sequence).toBe('1');
      expect(await boards.update(s.mentor, s.board.id, s.board.epoch, key, binary)).toEqual(ack);
      sticky(doc, 'Bài tiếp');
      await expect(
        boards.update(
          s.mentor,
          s.board.id,
          s.board.epoch,
          key,
          Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
        ),
      ).rejects.toMatchObject({ status: 409 });
      const recovered = loadDocument(
        Buffer.from((await boards.sync(s.mentor, s.board.id)).binary, 'base64'),
      );
      expect(projectBoard(recovered)[0]?.text).toBe('Tiếng Việt');
      doc.destroy();
      recovered.destroy();
    });
    it('concurrent independent updates converge and Student loses edit immediately after control/session end', async () => {
      const s = await create();
      await db.query(
        "UPDATE class_sessions SET status='IN_PROGRESS',teaching_mentor_id=$2 WHERE id=$1",
        [s.sessionId, s.mentor.userId],
      );
      await boards.control(s.mentor, s.board.id, randomUUID(), {
        expectedControlVersion: '1',
        mode: 'COLLABORATIVE',
      });
      const a = new Y.Doc(),
        b = new Y.Doc();
      sticky(a, 'Một');
      sticky(b, 'Hai');
      await Promise.all([
        send(s, a),
        boards.update(
          s.student,
          s.board.id,
          s.board.epoch,
          randomUUID(),
          Buffer.from(Y.encodeStateAsUpdate(b)).toString('base64'),
        ),
      ]);
      const synced = loadDocument(
        Buffer.from((await boards.sync(s.student, s.board.id)).binary, 'base64'),
      );
      expect(projectBoard(synced)).toHaveLength(2);
      await db.query("UPDATE class_sessions SET status='COMPLETED',completed_by=$2 WHERE id=$1", [
        s.sessionId,
        s.mentor.userId,
      ]);
      await db.query("UPDATE class_sessions SET status='COMPLETED' WHERE id=$1", [s.sessionId]);
      expect((await boards.sync(s.student, s.board.id)).capabilities.canEdit).toBe(false);
      await expect(
        boards.update(
          s.student,
          s.board.id,
          s.board.epoch,
          randomUUID(),
          Buffer.from(Y.encodeStateAsUpdate(b)).toString('base64'),
        ),
      ).rejects.toMatchObject({ status: 403 });
      const snapshots = await boards.snapshots(s.mentor, s.board.id, { page: 1, pageSize: 20 });
      expect(snapshots.total).toBe(1);
      a.destroy();
      b.destroy();
      synced.destroy();
    });
    it('snapshot/restore fences stale clients and keeps a backup; stale versions do not clear', async () => {
      const s = await create(),
        doc = new Y.Doc();
      sticky(doc);
      await send(s, doc);
      const snap = await boards.snapshot(s.mentor, s.board.id, randomUUID(), s.board.epoch);
      await expect(
        boards.reset(s.mentor, s.board.id, randomUUID(), {
          expectedEpoch: s.board.epoch,
          expectedSequence: '0',
          expectedControlVersion: '1',
        }),
      ).rejects.toMatchObject({ status: 409 });
      const reset = await boards.reset(s.mentor, s.board.id, randomUUID(), {
        expectedEpoch: s.board.epoch,
        expectedSequence: '1',
        expectedControlVersion: '1',
      });
      expect(reset).toMatchObject({ sequence: '0', controlVersion: '2' });
      expect(reset.epoch).not.toBe(s.board.epoch);
      await expect(send(s, doc)).rejects.toMatchObject({ status: 409 });
      const restored = await boards.reset(s.mentor, s.board.id, randomUUID(), {
        snapshotId: snap.id,
        expectedEpoch: reset.epoch,
        expectedSequence: '0',
        expectedControlVersion: '2',
      });
      expect(restored.controlVersion).toBe('3');
      expect((await boards.snapshots(s.mentor, s.board.id, { page: 1, pageSize: 20 })).total).toBe(
        3,
      );
      doc.destroy();
    });
    it('persists schema-v2 circles, rectangles and editable text across snapshots and rendering', async () => {
      const s = await create(),
        doc = new Y.Doc();
      doc.transact(() => {
        for (const type of ['rectangle', 'ellipse', 'text'] as const) {
          const id = randomUUID(),
            shape = new Y.Map<unknown>();
          const fields = {
            id,
            type,
            x: 50,
            y: 50,
            width: 160,
            height: 160,
            color: '#338a85',
            ...(type === 'text'
              ? { text: new Y.Text('Chú thích tiếng Việt'), fontSize: 24 }
              : { fill: 'transparent', strokeWidth: 4 }),
          };
          for (const [k, v] of Object.entries(fields)) shape.set(k, v);
          doc.getMap('shapes').set(id, shape);
        }
      });
      await send(s, doc);
      expect((await boards.sync(s.mentor, s.board.id)).board.schemaVersion).toBe(2);
      const snapshot = await boards.snapshot(s.mentor, s.board.id, randomUUID(), s.board.epoch);
      expect(await boards.preview(s.mentor, s.board.id, snapshot.id)).toMatchObject({
        schemaVersion: 2,
        projection: expect.arrayContaining([
          expect.objectContaining({ type: 'rectangle' }),
          expect.objectContaining({ type: 'ellipse' }),
          expect.objectContaining({ type: 'text', text: 'Chú thích tiếng Việt' }),
        ]),
      });
      const svg = boardSvg(
        projectBoard(doc),
        { x: 0, y: 0, width: 300, height: 300, scale: 1 },
        {},
      );
      expect(svg).toContain('<ellipse');
      expect(svg).toContain('Chú thích');
      doc.getMap<Y.Map<unknown>>('shapes').forEach((shape) => {
        if (shape.get('type') === 'rectangle') shape.set('fill', 'url(https://evil.test)');
      });
      await expect(send(s, doc)).rejects.toMatchObject({ status: 422 });
      doc.destroy();
    });
    it('rechecks cancelled enrollment and active role for every sync', async () => {
      const s = await create();
      await boards.sync(s.student, s.board.id);
      await db.query("UPDATE enrollments SET status='CANCELLED' WHERE student_id=$1", [
        s.student.userId,
      ]);
      await expect(boards.sync(s.student, s.board.id)).rejects.toMatchObject({ status: 403 });
      await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [s.mentor.userId]);
      await expect(boards.sync(s.mentor, s.board.id)).rejects.toMatchObject({ status: 401 });
    });
    it('private PNG upload is pinned, validated, scoped and rendered by background PNG/PDF exports', async () => {
      const s = await create(),
        bytes = await sharp({ create: { width: 80, height: 40, channels: 3, background: 'red' } })
          .png()
          .toBuffer();
      const intent = await media.intent(s.mentor, s.board.id, randomUUID(), {
        filename: 'ảnh.png',
        mimeType: 'image/png',
        sizeBytes: bytes.length,
      });
      await upload(intent.putUrl, 'image/png', bytes);
      await media.complete(s.mentor, s.board.id, intent.id, randomUUID());
      await worker.tick();
      const asset = await media.status(s.mentor, s.board.id, intent.id);
      expect(asset.status).toBe('READY');
      await expect(media.access(s.student, s.board.id, intent.id)).rejects.toMatchObject({
        status: 404,
      });
      const doc = new Y.Doc(),
        shape = new Y.Map<unknown>(),
        shapeId = randomUUID();
      doc.transact(() => {
        for (const [k, v] of Object.entries({
          id: shapeId,
          type: 'image',
          assetId: intent.id,
          x: 10,
          y: 10,
          width: 80,
          height: 40,
          color: '#ffffff',
        }))
          shape.set(k, v);
        doc.getMap('shapes').set(shapeId, shape);
      });
      await send(s, doc);
      expect((await fetch((await media.access(s.student, s.board.id, intent.id)).url)).status).toBe(
        200,
      );
      for (const format of ['PNG', 'PDF'] as const) {
        const job = await media.export(s.mentor, s.board.id, randomUUID(), {
          expectedEpoch: s.board.epoch,
          format,
          scope: 'CONTENT',
        });
        await worker.tick();
        const status = await media.exportStatus(s.mentor, s.board.id, job.id);
        expect(status).toMatchObject({ status: 'COMPLETED' });
        const access = await media.exportStatus(s.mentor, s.board.id, job.id, true);
        if (!('url' in access)) throw new Error('Access missing');
        const output = Buffer.from(await (await fetch(access.url)).arrayBuffer());
        if (format === 'PNG') expect((await sharp(output).metadata()).width).toBeGreaterThan(80);
        else expect((await PDFDocument.load(output)).getPageCount()).toBe(1);
      }
      doc.destroy();
    }, 30000);
    it('PDF selected pages rasterize in a bounded job and return only private image asset IDs', async () => {
      const s = await create(),
        pdf = await PDFDocument.create();
      pdf.addPage([200, 300]);
      pdf.addPage([200, 300]);
      const bytes = Buffer.from(await pdf.save());
      const intent = await media.intent(s.mentor, s.board.id, randomUUID(), {
        filename: 'bài.pdf',
        mimeType: 'application/pdf',
        sizeBytes: bytes.length,
        pages: [2],
      });
      await upload(intent.putUrl, 'application/pdf', bytes);
      await media.complete(s.mentor, s.board.id, intent.id, randomUUID());
      await worker.tick();
      expect(await media.status(s.mentor, s.board.id, intent.id)).toMatchObject({
        status: 'IMPORTED',
        assets: [{ id: expect.any(String), width: expect.any(Number), height: expect.any(Number) }],
      });
    }, 30000);
    it.each(['enrollment', 'logout', 'suspend'] as const)(
      'fences fanout behind an uncommitted %s revoke',
      async (kind) => {
        const s = await create(),
          runner = db.createQueryRunner();
        await runner.connect();
        await runner.startTransaction();
        const sql =
          kind === 'enrollment'
            ? "UPDATE enrollments SET status='CANCELLED' WHERE student_id=$1"
            : kind === 'logout'
              ? 'UPDATE auth_sessions SET revoked_at=now() WHERE id=$1'
              : "UPDATE users SET status='SUSPENDED' WHERE id=$1";
        await runner.query(sql, [kind === 'logout' ? s.student.sessionId : s.student.userId]);
        let delivered = false,
          settled = false;
        const pending = boards
          .sync(s.student, s.board.id, () => {
            delivered = true;
          })
          .then(
            () => {
              settled = true;
              return 'delivered';
            },
            () => {
              settled = true;
              return 'denied';
            },
          );
        try {
          await new Promise((r) => setTimeout(r, 75));
          expect(settled).toBe(false);
          expect(delivered).toBe(false);
          await runner.commitTransaction();
          expect(await pending).toBe('denied');
          expect(delivered).toBe(false);
        } finally {
          if (runner.isTransactionActive) await runner.rollbackTransaction();
          await runner.release();
          await pending;
        }
      },
    );
    it('repeat migrations no-op and reversible additive upgrade preserves older schema', async () => {
      expect(await db.runMigrations()).toHaveLength(0);
      // Exercise down/up only after feature data is removed, in this isolated disposable database.
      await db.query(
        'TRUNCATE whiteboard_exports,whiteboard_assets,whiteboard_snapshots,whiteboard_receipts,whiteboard_updates,whiteboards',
      );
      await rehearseMigration(db, new WhiteboardShapes1793664000001(), 'down');
      await rehearseMigration(db, new Whiteboards1793664000000(), 'down');
      expect(
        await db.query("SELECT 1 FROM information_schema.tables WHERE table_name='whiteboards'"),
      ).toHaveLength(0);
      await rehearseMigration(db, new Whiteboards1793664000000(), 'up');
      await rehearseMigration(db, new WhiteboardShapes1793664000001(), 'up');
      expect(await db.runMigrations()).toHaveLength(0);
    });
  },
);
