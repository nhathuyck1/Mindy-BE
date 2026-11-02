import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AssignmentsQuiz1792713600000 } from '../../src/database/migrations/1792713600000-assignments-quiz.js';
import { CodeAssignments1792886400000 } from '../../src/database/migrations/1792886400000-code-assignments.js';
import { AssignmentZip1793577600000 } from '../../src/database/migrations/1793577600000-assignment-zip.js';
import { AssignmentAccessService } from '../../src/modules/assignments/services/assignment-access.service.js';
import { AssignmentFilesService } from '../../src/modules/assignments/services/assignment-files.service.js';
import { AssignmentHistoryService } from '../../src/modules/assignments/services/assignment-history.service.js';
import { AssignmentReportingService } from '../../src/modules/assignments/services/assignment-reporting.service.js';
import { AssignmentsService } from '../../src/modules/assignments/services/assignments.service.js';
import { QuizAttemptsService } from '../../src/modules/assignments/services/quiz-attempts.service.js';
import { ZipAccessService } from '../../src/modules/assignments/services/zip-access.service.js';
import { ZipReceiptsService } from '../../src/modules/assignments/services/zip-receipts.service.js';
import { ZipSubmissionsService } from '../../src/modules/assignments/services/zip-submissions.service.js';
import { validateZip } from '../../src/modules/assignments/validation/zip-validation.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { validateBinary } from '../../src/modules/files/validation/binary-validation.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { fileConfig, storageFixture, upload, zipBuffer } from '../helpers/files-fixture.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase5_zip'))(
  'Assignment ZIP PostgreSQL + private versioned MinIO',
  () => {
    let db: DataSource,
      config: ConfigService,
      remote: Awaited<ReturnType<typeof storageFixture>>,
      f: ReturnType<typeof paymentFixture>,
      assignments: AssignmentsService,
      zip: ZipSubmissionsService,
      files: AssignmentFilesService,
      history: AssignmentHistoryService,
      reporting: AssignmentReportingService;
    beforeAll(async () => {
      db = await paymentDatabase('phase5_zip', {
        migrations: [
          AssignmentsQuiz1792713600000,
          CodeAssignments1792886400000,
          AssignmentZip1793577600000,
        ],
      });
      await rehearseMigration(db, new AssignmentZip1793577600000(), 'down');
      config = fileConfig({ ASSIGNMENT_ZIP_ENABLED: true, ASSIGNMENT_FILE_JOB_ENABLED: false });
      remote = await storageFixture(config);
      f = paymentFixture(db);
      const teaching = new TeachingReadService(
        db,
        f.config,
        f.users,
        new ScheduleReservationsService(),
      );
      const access = new AssignmentAccessService(teaching, f.users, f.enrollments),
        zipAccess = new ZipAccessService(access, config),
        receipts = new ZipReceiptsService();
      // Exercise upgrade over a real graded QUIZ, not just an empty schema.
      const legacy = new AssignmentsService(db, access, f.workspace, f.enrollments),
        legacyQuiz = new QuizAttemptsService(db, access, legacy, teaching, f.enrollments);
      const order = await f.order(),
        classId = order.classIds[0] ?? '',
        detail = await f.read.getDetail(classId),
        sid = detail.units[0]?.sessions[0]?.id ?? '';
      const mentor: AuthenticatedUser = {
          userId: order.mentor.id,
          role: UserRole.MENTOR,
          sessionId: randomUUID(),
        },
        student: AuthenticatedUser = {
          userId: order.student.id,
          role: UserRole.STUDENT,
          sessionId: randomUUID(),
        };
      await db.query(
        "UPDATE enrollments SET status='ACTIVE',enrolled_at=clock_timestamp() WHERE class_id=$1",
        [classId],
      );
      const a = await legacy.create(mentor, sid, {
        purpose: 'TEST',
        type: 'QUIZ',
        title: 'Legacy graded quiz',
        maxScore: '10',
      });
      const authored = await legacy.replaceQuestions(mentor, a.id, {
        expectedRevision: 1,
        questions: [
          {
            prompt: '2 + 2?',
            correctOption: 'A',
            options: (['A', 'B', 'C', 'D'] as const).map((label) => ({ label, text: label })),
          },
        ],
      });
      const published = await legacy.publish(mentor, a.id, authored.revision),
        attempt = await legacyQuiz.start(student, a.id, published.revision, randomUUID());
      const graded = await legacyQuiz.save(
        student,
        attempt.attempt.attemptId,
        {
          expectedVersion: 1,
          answers: attempt.attempt.questions.map((q) => ({
            questionId: q.id,
            selectedOption: 'A',
          })),
        },
        randomUUID(),
        true,
      );
      await rehearseMigration(db, new AssignmentZip1793577600000(), 'up');
      expect((await legacyQuiz.get(student, graded.attemptId, true)).result).toEqual(graded.result);
      assignments = new AssignmentsService(db, access, f.workspace, f.enrollments, config);
      zip = new ZipSubmissionsService(db, zipAccess, receipts);
      files = new AssignmentFilesService(
        db,
        config,
        zipAccess,
        receipts,
        { zip: validateZip },
        remote.storage,
        { validate: validateBinary },
      );
      reporting = new AssignmentReportingService();
      history = new AssignmentHistoryService(db, access, zipAccess, zip, f.workspace, reporting);
    }, 60000);
    afterAll(async () => {
      files?.onApplicationShutdown();
      if (remote) await remote.cleanup();
      if (db?.isInitialized) await db.destroy();
    }, 30000);
    async function setup(publish = true, maxAttempts = 2) {
      const order = await f.order(),
        classId = order.classIds[0] ?? '';
      const detail = await f.read.getDetail(classId),
        sessionId = detail.units[0]?.sessions[0]?.id ?? '';
      const student: AuthenticatedUser = {
          userId: order.student.id,
          role: UserRole.STUDENT,
          sessionId: randomUUID(),
        },
        mentor: AuthenticatedUser = {
          userId: order.mentor.id,
          role: UserRole.MENTOR,
          sessionId: randomUUID(),
        };
      await db.query(
        "UPDATE enrollments SET status='ACTIVE',enrolled_at=clock_timestamp() WHERE class_id=$1",
        [classId],
      );
      let assignment = await assignments.create(mentor, sessionId, {
        purpose: 'HOMEWORK',
        type: 'ZIP',
        title: 'Bài tập ZIP',
        maxScore: '10.00',
        maxAttempts,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      });
      if (publish)
        assignment = await assignments.publish(mentor, assignment.id, assignment.revision);
      return { classId, sessionId, student, mentor, assignment };
    }
    async function ready(
      s: Awaited<ReturnType<typeof setup>>,
      draftId: string,
      version = 1,
      bytes?: Buffer,
    ) {
      const payload =
        bytes ?? (await zipBuffer([['main.ts', Buffer.from('console.log("Bài làm");')]]));
      const input = {
          expectedVersion: version,
          originalFilename: 'solution.zip',
          declaredMimeType: 'application/zip',
          declaredSizeBytes: payload.length,
        },
        key = randomUUID();
      const intent = await files.intent(s.student, draftId, input, false, key);
      expect((await files.intent(s.student, draftId, input, false, key)).fileId).toBe(
        intent.fileId,
      );
      await upload(intent.uploadUrl, 'application/zip', payload);
      await files.complete(s.student, intent.fileId, { expectedVersion: 1 }, randomUUID());
      const job = await files.claim();
      if (!job) throw new Error('Missing file job');
      await files.process(job);
      return { intent, payload, status: await files.status(s.student, intent.fileId) };
    }
    async function submitted(s: Awaited<ReturnType<typeof setup>>) {
      const draft = await zip.draft(
        s.student,
        s.assignment.id,
        { expectedAssignmentRevision: s.assignment.revision },
        randomUUID(),
      );
      const file = await ready(s, draft.id);
      expect(file.status.status).toBe('READY');
      const attached = await zip.attach(
        s.student,
        draft.id,
        { expectedVersion: draft.version, fileId: file.intent.fileId },
        randomUUID(),
      );
      const input = { expectedVersion: attached.version },
        key = randomUUID();
      const result = await zip.submit(s.student, draft.id, input, key);
      return { draft, file, result, input, key };
    }
    it('runs draft/upload/READY/attach/submit without consuming draft attempts, pins bytes and preserves immutable history', async () => {
      const s = await setup(),
        input = { expectedAssignmentRevision: s.assignment.revision };
      const [a, b] = await Promise.all([
        zip.draft(s.student, s.assignment.id, input, randomUUID()),
        zip.draft(s.student, s.assignment.id, input, randomUUID()),
      ]);
      expect(a.id).toBe(b.id);
      expect(a.attemptNumber).toBeNull();
      const file = await ready(s, a.id);
      expect(file.status.status).toBe('READY');
      expect((await zip.get(s.student, a.id)).status).toBe('DRAFT');
      await upload(file.intent.uploadUrl, 'application/zip', Buffer.alloc(file.payload.length, 65));
      const attached = await zip.attach(
        s.student,
        a.id,
        { expectedVersion: 1, fileId: file.intent.fileId },
        randomUUID(),
      );
      const key = randomUUID(),
        body = { expectedVersion: attached.version };
      const results = await Promise.all([
        zip.submit(s.student, a.id, body, key),
        zip.submit(s.student, a.id, body, key),
      ]);
      expect(results.map((r) => r.attemptNumber)).toEqual([1, 1]);
      const download = await files.download(s.student, file.intent.fileId);
      expect(Buffer.from(await (await fetch(download.url)).arrayBuffer())).toEqual(file.payload);
      await expect(zip.submit(s.student, a.id, body, randomUUID())).rejects.toMatchObject({
        response: { code: 'SUBMISSION_ALREADY_SUBMITTED' },
      });
      await expect(
        db.query('UPDATE assignment_zip_submissions SET version=999 WHERE id=$1', [a.id]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        db.query('DELETE FROM assignment_zip_submission_files WHERE submission_id=$1', [a.id]),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(rehearseMigration(db, new AssignmentZip1793577600000(), 'down')).rejects.toThrow(
        'Export ZIP history',
      );
    });
    it('keeps draft grades private, releases immutable revisions and requires reason/stale-release protection', async () => {
      const s = await setup(),
        r = await submitted(s);
      const first = await zip.grade(
        s.mentor,
        r.result.id,
        { expectedVersion: 0, score: '8.50', feedback: 'private draft' },
        randomUUID(),
      );
      expect(first.gradeVersion).toBe(1);
      expect((await zip.get(s.student, r.result.id)).grade).toBeNull();
      await zip.release(
        s.mentor,
        r.result.id,
        { expectedVersion: 1, gradeVersion: 1 },
        randomUUID(),
      );
      expect((await zip.get(s.student, r.result.id)).grade?.score).toBe('8.50');
      await expect(
        zip.grade(
          s.mentor,
          r.result.id,
          { expectedVersion: 1, score: '9', feedback: 'correction' },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 422 });
      const correctionKey = randomUUID(),
        input = {
          expectedVersion: 1,
          score: '9.25',
          feedback: 'corrected',
          reason: 'Rubric correction',
        };
      const [one, two] = await Promise.all([
        zip.grade(s.mentor, r.result.id, input, correctionKey),
        zip.grade(s.mentor, r.result.id, input, correctionKey),
      ]);
      expect(one.grade).toEqual(two.grade);
      expect(one.gradeVersion).toBe(2);
      expect((await zip.get(s.student, r.result.id)).grade?.score).toBe('8.50');
      await expect(
        zip.release(s.mentor, r.result.id, { expectedVersion: 1, gradeVersion: 1 }, randomUUID()),
      ).rejects.toMatchObject({ response: { code: 'GRADE_VERSION_CONFLICT' } });
      await zip.release(
        s.mentor,
        r.result.id,
        { expectedVersion: 2, gradeVersion: 2 },
        randomUUID(),
      );
      expect((await zip.get(s.student, r.result.id)).grade?.score).toBe('9.25');
      expect(
        (await zip.gradeHistory(s.mentor, r.result.id, { page: 1, pageSize: 10 })).items,
      ).toHaveLength(2);
      await expect(
        zip.grade(
          s.mentor,
          r.result.id,
          { expectedVersion: 2, score: '10.01', feedback: 'x', reason: 'x' },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ response: { code: 'INVALID_GRADE_SCORE' } });
      await expect(db.query('UPDATE assignment_zip_grade_revisions SET score=0')).rejects.toThrow(
        'append only',
      );
    });
    it('uses latest submitted attempt for queue/metrics while preserving released old history and terminal ownership', async () => {
      const s = await setup(),
        r = await submitted(s);
      await zip.grade(
        s.mentor,
        r.result.id,
        { expectedVersion: 0, score: '8', feedback: 'good' },
        randomUUID(),
      );
      await zip.release(
        s.mentor,
        r.result.id,
        { expectedVersion: 1, gradeVersion: 1 },
        randomUUID(),
      );
      const draft = await zip.draft(
        s.student,
        s.assignment.id,
        { expectedAssignmentRevision: s.assignment.revision },
        randomUUID(),
      );
      expect(
        (await history.submissions(s.student, s.assignment.id, { page: 1, pageSize: 10 })).items[0],
      ).toMatchObject({ id: r.result.id, grade: { score: '8.00' } });
      const file = await ready(s, draft.id);
      await zip.attach(
        s.student,
        draft.id,
        { expectedVersion: 1, fileId: file.intent.fileId },
        randomUUID(),
      );
      const second = await zip.submit(s.student, draft.id, { expectedVersion: 2 }, randomUUID());
      expect(second.attemptNumber).toBe(2);
      expect(
        (await history.submissions(s.mentor, s.assignment.id, { page: 1, pageSize: 10 })).total,
      ).toBe(1);
      expect(
        (await history.submissions(s.student, s.assignment.id, { page: 1, pageSize: 10 })).total,
      ).toBe(2);
      expect(await history.metrics(s.mentor, s.classId, { page: 1, pageSize: 20 })).toMatchObject({
        submitted: 1,
        ungraded: 1,
        released: 0,
        eligible: 1,
      });
      await expect(
        zip.draft(
          s.student,
          s.assignment.id,
          { expectedAssignmentRevision: s.assignment.revision },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ response: { code: 'ATTEMPT_LIMIT_REACHED' } });
      await db.query("UPDATE enrollments SET status='COMPLETED' WHERE class_id=$1", [s.classId]);
      await assignments.archive(s.mentor, s.assignment.id, {
        expectedRevision: s.assignment.revision,
        reason: 'Closed',
      });
      expect((await zip.get(s.student, r.result.id)).grade?.score).toBe('8.00');
      expect(
        (await history.submissions(s.student, s.assignment.id, { page: 1, pageSize: 10 })).total,
      ).toBe(2);
      expect((await files.download(s.student, r.file.intent.fileId)).url).toContain('X-Amz');
      const other: AuthenticatedUser = {
        userId: (await f.user()).id,
        role: UserRole.STUDENT,
        sessionId: randomUUID(),
      };
      await expect(zip.get(other, r.result.id)).rejects.toMatchObject({ status: 404 });
    });
    it('uploads/binds instruction PDF, snapshots it at submit and keeps it downloadable after archive', async () => {
      const s = await setup(false),
        doc = await PDFDocument.create();
      doc.addPage();
      const bytes = Buffer.from(await doc.save());
      const intent = await files.intent(
        s.mentor,
        s.assignment.id,
        {
          expectedRevision: 1,
          originalFilename: 'Đề.pdf',
          declaredMimeType: 'application/pdf',
          declaredSizeBytes: bytes.length,
        },
        true,
        randomUUID(),
      );
      await upload(intent.uploadUrl, 'application/pdf', bytes);
      await files.complete(s.mentor, intent.fileId, { expectedVersion: 1 }, randomUUID());
      const job = await files.claim();
      if (!job) throw new Error('Missing job');
      await files.process(job);
      expect((await files.status(s.mentor, intent.fileId)).status).toBe('READY');
      const bound = await zip.replaceInstructions(
        s.mentor,
        s.assignment.id,
        { expectedRevision: 1, fileIds: [intent.fileId] },
        randomUUID(),
      );
      s.assignment = await assignments.publish(s.mentor, s.assignment.id, bound.revision);
      expect((await assignments.get(s.student, s.assignment.id)).instructionFiles).toHaveLength(1);
      const r = await submitted(s);
      expect(r.result.snapshot?.instructionFiles[0]?.id).toBe(intent.fileId);
      await assignments.archive(s.mentor, s.assignment.id, {
        expectedRevision: s.assignment.revision,
        reason: 'Finish',
      });
      await db.query("UPDATE enrollments SET status='CANCELLED' WHERE class_id=$1", [s.classId]);
      expect((await files.download(s.student, intent.fileId)).url).toContain('X-Amz');
      await expect(
        db.query('DELETE FROM assignment_instruction_files WHERE assignment_id=$1', [
          s.assignment.id,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    });
    it('rejects invalid ZIP, wrong owner/binding and expired deadlines; extension only increases with reason/revision', async () => {
      const s = await setup(),
        draft = await zip.draft(
          s.student,
          s.assignment.id,
          { expectedAssignmentRevision: s.assignment.revision },
          randomUUID(),
        );
      const invalid = await ready(s, draft.id, 1, Buffer.from('not a ZIP'));
      expect(invalid.status).toMatchObject({ status: 'FAILED', errorCode: 'ZIP_INVALID' });
      await expect(
        zip.attach(
          s.student,
          draft.id,
          { expectedVersion: 1, fileId: invalid.intent.fileId },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ response: { code: 'FILE_NOT_READY' } });
      const other = await setup(),
        otherDraft = await zip.draft(
          other.student,
          other.assignment.id,
          { expectedAssignmentRevision: other.assignment.revision },
          randomUUID(),
        ),
        foreign = await ready(other, otherDraft.id);
      await expect(
        zip.attach(
          s.student,
          draft.id,
          { expectedVersion: 1, fileId: foreign.intent.fileId },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 404 });
      const valid = await ready(s, draft.id);
      await zip.attach(
        s.student,
        draft.id,
        { expectedVersion: 1, fileId: valid.intent.fileId },
        randomUUID(),
      );
      await db.query(
        "UPDATE assignments SET due_at=clock_timestamp()-interval '1 second' WHERE id=$1",
        [s.assignment.id],
      );
      await expect(
        zip.submit(s.student, draft.id, { expectedVersion: 2 }, randomUUID()),
      ).rejects.toMatchObject({ response: { code: 'ASSIGNMENT_DEADLINE_PASSED' } });
      const extension = await zip.extend(
        s.mentor,
        s.assignment.id,
        {
          expectedRevision: s.assignment.revision,
          dueAt: new Date(Date.now() + 3600000).toISOString(),
          maxAttempts: 3,
          reason: 'Extra time',
        },
        randomUUID(),
      );
      expect(extension.revision).toBe(s.assignment.revision + 1);
      await expect(
        zip.extend(
          s.mentor,
          s.assignment.id,
          { expectedRevision: extension.revision, maxAttempts: 1, reason: 'reduce' },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 422 });
      expect(
        (await zip.submit(s.student, draft.id, { expectedVersion: 2 }, randomUUID())).attemptNumber,
      ).toBe(1);
    });
    it('recovers leases/retries and rejects READY after revoke while cleanup protects submitted versions', async () => {
      const s = await setup(),
        draft = await zip.draft(
          s.student,
          s.assignment.id,
          { expectedAssignmentRevision: s.assignment.revision },
          randomUUID(),
        );
      const bytes = await zipBuffer([['x.txt', Buffer.from('x')]]),
        intent = await files.intent(
          s.student,
          draft.id,
          {
            expectedVersion: 1,
            originalFilename: 'a.zip',
            declaredMimeType: 'application/zip',
            declaredSizeBytes: bytes.length,
          },
          false,
          randomUUID(),
        );
      await upload(intent.uploadUrl, 'application/zip', bytes);
      await files.complete(s.student, intent.fileId, { expectedVersion: 1 }, randomUUID());
      const abandoned = await files.claim();
      expect(abandoned).not.toBeNull();
      await db.query(
        "UPDATE assignment_file_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE file_id=$1",
        [intent.fileId],
      );
      const recovered = await files.claim();
      if (!recovered) throw new Error('Missing recovered lease');
      expect(recovered.lease_token).not.toBe(abandoned?.lease_token);
      await upload(intent.uploadUrl, 'application/zip', Buffer.alloc(bytes.length, 65));
      if (abandoned) await files.process(abandoned);
      expect((await files.load(db.manager, intent.fileId)).status).toBe('PROCESSING');
      const copy = remote.storage.copy.bind(remote.storage);
      vi.spyOn(remote.storage, 'copy').mockImplementationOnce(
        async (source, destination, signal) => {
          const version = await copy(source, destination, signal);
          await db.query("UPDATE enrollments SET status='CANCELLED' WHERE class_id=$1", [
            s.classId,
          ]);
          return version;
        },
      );
      await files.process(recovered);
      expect(await files.load(db.manager, intent.fileId)).toMatchObject({
        status: 'FAILED',
        error_code: 'FILE_ACCESS_REVOKED',
      });
      await files.maintenance();
      expect((await zip.get(s.student, draft.id)).status).toBe('VOIDED');
      const keep = await setup(),
        r = await submitted(keep);
      await db.query(
        "UPDATE assignment_files SET created_at=clock_timestamp()-interval '2 days' WHERE id=ANY($1)",
        [[intent.fileId, r.file.intent.fileId]],
      );
      // Dedicated test DB only: simulate historical expiry without waiting 15 minutes.
      await db.transaction(async (m) => {
        await m.query('ALTER TABLE assignment_files DISABLE TRIGGER trg_assignment_file_identity');
        await m.query(
          "UPDATE assignment_files SET intent_expires_at=clock_timestamp()-interval '1 day' WHERE id=$1",
          [intent.fileId],
        );
        await m.query('ALTER TABLE assignment_files ENABLE TRIGGER trg_assignment_file_identity');
      });
      await db.query("INSERT INTO assignment_file_jobs(file_id,kind) VALUES($1,'CLEANUP')", [
        intent.fileId,
      ]);
      const cleanup = await files.claim();
      if (!cleanup) throw new Error('Missing cleanup');
      await files.process(cleanup);
      expect((await files.load(db.manager, intent.fileId)).status).toBe('DELETED');
      const tombstone = await files.load(db.manager, intent.fileId);
      await expect(remote.storage.head(tombstone.bucket, tombstone.staging_key)).rejects.toThrow();
      // Simulate an already issued PUT finishing after cleanup. Tombstones are swept again daily.
      await upload(intent.uploadUrl, 'application/zip', bytes);
      await db.query(
        "UPDATE assignment_file_jobs SET run_after=clock_timestamp()-interval '1 second' WHERE file_id=$1 AND kind='CLEANUP'",
        [intent.fileId],
      );
      await files.maintenance();
      const repeat = await files.claim();
      if (!repeat) throw new Error('Missing tombstone cleanup');
      await files.process(repeat);
      await expect(remote.storage.head(tombstone.bucket, tombstone.staging_key)).rejects.toThrow();
      await files.maintenance();
      expect((await files.load(db.manager, r.file.intent.fileId)).status).toBe('READY');
    });
    it('rolls back submit on audit/receipt failures and accepts the exact retry only after the whole transaction commits', async () => {
      const s = await setup(),
        draft = await zip.draft(
          s.student,
          s.assignment.id,
          { expectedAssignmentRevision: s.assignment.revision },
          randomUUID(),
        ),
        file = await ready(s, draft.id);
      await zip.attach(
        s.student,
        draft.id,
        { expectedVersion: 1, fileId: file.intent.fileId },
        randomUUID(),
      );
      const key = randomUUID(),
        input = { expectedVersion: 2 };
      await db.query(
        `CREATE FUNCTION test_zip_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='SUBMIT' THEN RAISE EXCEPTION 'test zip audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_zip_audit BEFORE INSERT ON assignment_zip_audits FOR EACH ROW EXECUTE FUNCTION test_zip_audit_fail()`,
      );
      try {
        await expect(zip.submit(s.student, draft.id, input, key)).rejects.toThrow(
          'test zip audit failure',
        );
        expect((await zip.get(s.student, draft.id)).status).toBe('DRAFT');
      } finally {
        await db.query(
          'DROP TRIGGER test_zip_audit ON assignment_zip_audits;DROP FUNCTION test_zip_audit_fail()',
        );
      }
      await db.query(
        `CREATE FUNCTION test_zip_receipt_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.route LIKE 'submit:%' THEN RAISE EXCEPTION 'test zip receipt failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER test_zip_receipt BEFORE INSERT ON assignment_zip_receipts FOR EACH ROW EXECUTE FUNCTION test_zip_receipt_fail()`,
      );
      try {
        await expect(zip.submit(s.student, draft.id, input, key)).rejects.toThrow(
          'test zip receipt failure',
        );
        expect((await zip.get(s.student, draft.id)).status).toBe('DRAFT');
      } finally {
        await db.query(
          'DROP TRIGGER test_zip_receipt ON assignment_zip_receipts;DROP FUNCTION test_zip_receipt_fail()',
        );
      }
      expect((await zip.submit(s.student, draft.id, input, key)).attemptNumber).toBe(1);
      const audits = await db.query(
        "SELECT count(*)::int AS count FROM assignment_zip_audits WHERE submission_id=$1 AND action='SUBMIT'",
        [draft.id],
      );
      expect(audits[0].count).toBe(1);
    });
    it('serializes competing submissions and grades without duplicate attempts or stale release', async () => {
      const s = await setup(),
        draft = await zip.draft(
          s.student,
          s.assignment.id,
          { expectedAssignmentRevision: s.assignment.revision },
          randomUUID(),
        ),
        file = await ready(s, draft.id);
      await zip.attach(
        s.student,
        draft.id,
        { expectedVersion: 1, fileId: file.intent.fileId },
        randomUUID(),
      );
      const submissions = await Promise.allSettled([
        zip.submit(s.student, draft.id, { expectedVersion: 2 }, randomUUID()),
        zip.submit(s.student, draft.id, { expectedVersion: 2 }, randomUUID()),
      ]);
      expect(submissions.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const grades = await Promise.allSettled([
        zip.grade(
          s.mentor,
          draft.id,
          { expectedVersion: 0, score: '8', feedback: 'one' },
          randomUUID(),
        ),
        zip.grade(
          s.mentor,
          draft.id,
          { expectedVersion: 0, score: '9', feedback: 'two' },
          randomUUID(),
        ),
      ]);
      expect(grades.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const race = await Promise.allSettled([
        zip.grade(
          s.mentor,
          draft.id,
          { expectedVersion: 1, score: '9.50', feedback: 'correction', reason: 'Rechecked' },
          randomUUID(),
        ),
        zip.release(s.mentor, draft.id, { expectedVersion: 1, gradeVersion: 1 }, randomUUID()),
      ]);
      expect(race[0].status).toBe('fulfilled');
      const mentor = await zip.get(s.mentor, draft.id),
        student = await zip.get(s.student, draft.id);
      expect(mentor.gradeVersion).toBe(2);
      expect(student.grade?.version ?? null).toBe(mentor.releasedVersion);
      expect(
        (await history.metrics(s.mentor, s.classId, { page: 1, pageSize: 10 })).unreleased,
      ).toBe(1);
      await zip.release(s.mentor, draft.id, { expectedVersion: 2, gradeVersion: 2 }, randomUUID());
      expect((await zip.gradeHistory(s.mentor, draft.id, { page: 1, pageSize: 10 })).total).toBe(2);
    });
    it('rechecks cancellation before submit and enforces current substitute scope on grading/download', async () => {
      const s = await setup(),
        draft = await zip.draft(
          s.student,
          s.assignment.id,
          { expectedAssignmentRevision: s.assignment.revision },
          randomUUID(),
        ),
        file = await ready(s, draft.id);
      await zip.attach(
        s.student,
        draft.id,
        { expectedVersion: 1, fileId: file.intent.fileId },
        randomUUID(),
      );
      const runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        await runner.query('SELECT id FROM classes WHERE id=$1 FOR UPDATE', [s.classId]);
        const pending = zip.submit(s.student, draft.id, { expectedVersion: 2 }, randomUUID());
        const denied = expect(pending).rejects.toMatchObject({
          response: { code: expect.stringMatching(/^(ASSIGNMENT_NOT_FOUND|ASSIGNMENT_CLOSED)$/) },
        });
        await runner.query("UPDATE classes SET status='CANCELLED' WHERE id=$1", [s.classId]);
        await runner.commitTransaction();
        await denied;
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
      const live = await setup(),
        r = await submitted(live),
        sub: AuthenticatedUser = {
          userId: (await f.user(UserRole.MENTOR)).id,
          role: UserRole.MENTOR,
          sessionId: randomUUID(),
        };
      await db.query('UPDATE class_sessions SET mentor_override_id=$2 WHERE id=$1', [
        live.sessionId,
        sub.userId,
      ]);
      expect((await zip.get(sub, r.result.id)).id).toBe(r.result.id);
      expect((await files.download(sub, r.file.intent.fileId)).url).toContain('X-Amz');
      await db.query('UPDATE class_sessions SET mentor_override_id=NULL WHERE id=$1', [
        live.sessionId,
      ]);
      await expect(
        zip.grade(
          sub,
          r.result.id,
          { expectedVersion: 0, score: '8', feedback: 'x' },
          randomUUID(),
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(files.download(sub, r.file.intent.fileId)).rejects.toMatchObject({
        status: 404,
      });
      const sign = remote.storage.presignGet.bind(remote.storage);
      vi.spyOn(remote.storage, 'presignGet').mockImplementationOnce(async (...args) => {
        const url = await sign(...args);
        await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [live.student.userId]);
        return url;
      });
      await expect(files.download(live.student, r.file.intent.fileId)).rejects.toMatchObject({
        status: 403,
      });
    });
    it('counts missing only for current eligible students after deadline, and rate limits unused upload intents', async () => {
      const s = await setup();
      expect(
        (await history.roster(s.mentor, s.assignment.id, { page: 1, pageSize: 10 })).items[0],
      ).toMatchObject({ submitted: false, missing: false });
      const draft = await zip.draft(
        s.student,
        s.assignment.id,
        { expectedAssignmentRevision: s.assignment.revision },
        randomUUID(),
      );
      const input = {
        expectedVersion: 1,
        originalFilename: 'x.zip',
        declaredMimeType: 'application/zip',
        declaredSizeBytes: 100,
      };
      for (let i = 0; i < 10; i++)
        await files.intent(s.student, draft.id, input, false, randomUUID());
      await expect(
        files.intent(s.student, draft.id, input, false, randomUUID()),
      ).rejects.toMatchObject({ status: 429 });
      await db.query(
        "UPDATE assignments SET due_at=clock_timestamp()-interval '1 second' WHERE id=$1",
        [s.assignment.id],
      );
      expect(
        (await history.roster(s.mentor, s.assignment.id, { page: 1, pageSize: 10 })).items[0],
      ).toMatchObject({ missing: true });
      expect(await history.metrics(s.mentor, s.classId, { page: 1, pageSize: 10 })).toMatchObject({
        eligible: 1,
        missing: 1,
        submitted: 0,
      });
      await db.query("UPDATE enrollments SET status='COMPLETED' WHERE class_id=$1", [s.classId]);
      expect(await history.metrics(s.mentor, s.classId, { page: 1, pageSize: 10 })).toMatchObject({
        eligible: 0,
        missing: 0,
      });
    });
  },
);
