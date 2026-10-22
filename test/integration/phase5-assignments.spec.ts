import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssignmentsQuiz1792713600000 } from '../../src/database/migrations/1792713600000-assignments-quiz.js';
import { AssignmentAccessService } from '../../src/modules/assignments/services/assignment-access.service.js';
import { AssignmentsService } from '../../src/modules/assignments/services/assignments.service.js';
import { QuizAttemptsService } from '../../src/modules/assignments/services/quiz-attempts.service.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { rehearseMigration } from '../helpers/migration-rehearsal.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

const actor = (userId: string, role: UserRole): AuthenticatedUser => ({
  userId,
  role,
  sessionId: randomUUID(),
});
describe.skipIf(!separateTestUrl('phase5'))('Phase 5 assignments PostgreSQL', () => {
  let db: DataSource,
    f: ReturnType<typeof paymentFixture>,
    assignments: AssignmentsService,
    attempts: QuizAttemptsService;
  beforeAll(async () => {
    db = await paymentDatabase('phase5', { migrations: [AssignmentsQuiz1792713600000] });
    await rehearseMigration(db, new AssignmentsQuiz1792713600000(), 'down');
    await rehearseMigration(db, new AssignmentsQuiz1792713600000(), 'up');
    f = paymentFixture(db);
    const teaching = new TeachingReadService(
      db,
      f.config,
      f.users,
      new ScheduleReservationsService(),
    );
    const access = new AssignmentAccessService(teaching, f.users, f.enrollments);
    assignments = new AssignmentsService(db, access, f.workspace, f.enrollments);
    attempts = new QuizAttemptsService(db, access, assignments, teaching, f.enrollments);
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });
  async function setup(minutes: number | null = null) {
    const order = await f.order();
    const classId = order.classIds[0] ?? '';
    const detail = await f.read.getDetail(classId);
    const sessionId = detail.units[0]?.sessions[0]?.id ?? '';
    const mentor = actor(order.mentor.id, UserRole.MENTOR),
      student = actor(order.student.id, UserRole.STUDENT);
    const draft = await assignments.create(mentor, sessionId, {
      purpose: 'TEST',
      type: 'QUIZ',
      title: 'Quiz 40',
      maxScore: '100.00',
      timeLimitMinutes: minutes,
    });
    const authored = await assignments.replaceQuestions(mentor, draft.id, {
      expectedRevision: 1,
      questions: Array.from({ length: 40 }, (_, i) => ({
        prompt: `Question ${i}`,
        correctOption: 'A',
        options: [
          { label: 'A', text: 'one' },
          { label: 'B', text: 'two' },
          { label: 'C', text: 'three' },
          { label: 'D', text: 'four' },
        ],
      })),
    });
    const published = await assignments.publish(mentor, draft.id, authored.revision);
    return { order, classId, sessionId, mentor, student, published };
  }
  async function activate(s: Awaited<ReturnType<typeof setup>>) {
    // Test-only settlement fixture: do not call merchant/payment providers.
    await db.query(
      "UPDATE enrollments SET status='ACTIVE',enrolled_at=clock_timestamp() WHERE student_id=$1 AND class_id=$2",
      [s.student.userId, s.classId],
    );
  }
  it('enforces paid access, hides keys, saves without grading and submits 40/40 with durable retry', async () => {
    const s = await setup();
    await expect(
      attempts.start(s.student, s.published.id, s.published.revision, randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
    await activate(s);
    const metadata = await assignments.get(s.student, s.published.id);
    expect(metadata).not.toHaveProperty('questions');
    const key = randomUUID();
    const [a, b] = await Promise.all([
      attempts.start(s.student, s.published.id, s.published.revision, key),
      attempts.start(s.student, s.published.id, s.published.revision, key),
    ]);
    expect(a.attempt.attemptId).toBe(b.attempt.attemptId);
    expect(a.created).not.toBe(b.created);
    expect(JSON.stringify(a.attempt)).not.toMatch(/correctOption|isCorrect|"score"/);
    const answers = a.attempt.questions.map((q, i) => ({
      questionId: q.id,
      selectedOption: i < 33 ? ('A' as const) : ('B' as const),
    }));
    const save = await attempts.save(
      s.student,
      a.attempt.attemptId,
      { expectedVersion: 1, answers: answers.slice(0, 39) },
      randomUUID(),
    );
    expect(save.version).toBe(2);
    expect(save.result).toBeNull();
    await expect(
      attempts.save(
        s.student,
        a.attempt.attemptId,
        { expectedVersion: 2, answers: answers.slice(0, 39) },
        randomUUID(),
        true,
      ),
    ).rejects.toMatchObject({ status: 422 });
    const input = { expectedVersion: 2, answers };
    const submitKey = randomUUID();
    const [first, retry] = await Promise.all([
      attempts.save(s.student, a.attempt.attemptId, input, submitKey, true),
      attempts.save(s.student, a.attempt.attemptId, input, submitKey, true),
    ]);
    expect(first.result).toEqual(retry.result);
    expect(first.result).toMatchObject({ score: '82.50', correctCount: 33, wrongCount: 7 });
    expect((await attempts.get(s.student, a.attempt.attemptId, true)).result).toEqual(first.result);
    await expect(
      attempts.save(
        s.student,
        a.attempt.attemptId,
        { ...input, expectedVersion: 1 },
        submitKey,
        true,
      ),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    await expect(
      attempts.save(s.student, a.attempt.attemptId, input, randomUUID(), true),
    ).rejects.toMatchObject({ status: 409 });
    await db.query("UPDATE enrollments SET status='COMPLETED' WHERE class_id=$1", [s.classId]);
    expect((await attempts.get(s.student, a.attempt.attemptId, true)).result).toEqual(first.result);
    await expect(
      attempts.get(actor((await f.user()).id, UserRole.STUDENT), a.attempt.attemptId, true),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('resumes the same timer, rejects late payloads and timeout grades only saved answers', async () => {
    const s = await setup(1);
    await activate(s);
    const started = await attempts.start(
      s.student,
      s.published.id,
      s.published.revision,
      randomUUID(),
    );
    const resumed = await attempts.start(
      s.student,
      s.published.id,
      s.published.revision,
      randomUUID(),
    );
    expect(resumed.attempt.expiresAt).toBe(started.attempt.expiresAt);
    const id = started.attempt.attemptId;
    await attempts.save(
      s.student,
      id,
      {
        expectedVersion: 1,
        answers: [{ questionId: started.attempt.questions[0]?.id ?? '', selectedOption: 'A' }],
      },
      randomUUID(),
    );
    await db.query(
      "UPDATE assignment_submissions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [id],
    );
    await db.query(
      'UPDATE assignment_finalization_jobs SET run_after=clock_timestamp() WHERE submission_id=$1',
      [id],
    );
    expect(await attempts.get(s.student, id, true)).toMatchObject({
      status: 'FINALIZING',
      result: null,
    });
    await expect(
      attempts.save(s.student, id, { expectedVersion: 2, answers: [] }, randomUUID(), true),
    ).rejects.toMatchObject({ response: { code: 'ATTEMPT_EXPIRED' } });
    await Promise.all([attempts.finalizeDue(), attempts.finalizeDue()]);
    expect(await attempts.get(s.student, id, true)).toMatchObject({
      status: 'GRADED',
      submissionSource: 'TIMEOUT',
      result: { correctCount: 1, wrongCount: 39, score: '2.50' },
    });
    const count: { count: string }[] = await db.query(
      "SELECT count(*) FROM assignment_audits WHERE submission_id=$1 AND action='TIMEOUT'",
      [id],
    );
    expect(count[0]?.count).toBe('1');
  });
  it('freezes published content and scopes substitute access before pagination', async () => {
    const s = await setup();
    await expect(
      assignments.update(s.mentor, s.published.id, {
        expectedRevision: s.published.revision,
        title: 'changed',
      }),
    ).rejects.toMatchObject({ status: 409 });
    const sub = actor((await f.user(UserRole.MENTOR)).id, UserRole.MENTOR);
    await expect(assignments.get(sub, s.published.id)).rejects.toMatchObject({ status: 403 });
    await db.query('UPDATE class_sessions SET mentor_override_id=$2 WHERE id=$1', [
      s.sessionId,
      sub.userId,
    ]);
    expect((await assignments.list(sub, s.classId, null, { page: 1, pageSize: 20 })).total).toBe(1);
    await db.query('UPDATE class_sessions SET mentor_override_id=NULL WHERE id=$1', [s.sessionId]);
    await expect(assignments.get(sub, s.published.id)).rejects.toMatchObject({ status: 403 });
  });
  it('archive voids active attempts while preserving graded history and immutable audits', async () => {
    const s = await setup(1);
    await activate(s);
    const started = await attempts.start(
      s.student,
      s.published.id,
      s.published.revision,
      randomUUID(),
    );
    await assignments.archive(s.mentor, s.published.id, {
      expectedRevision: s.published.revision,
      reason: 'Replace incorrect question',
    });
    expect(await attempts.get(s.student, started.attempt.attemptId)).toMatchObject({
      status: 'VOIDED',
      questions: [],
      result: null,
    });
    await expect(
      attempts.save(
        s.student,
        started.attempt.attemptId,
        { expectedVersion: 1, answers: [] },
        randomUUID(),
        true,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      db.query('DELETE FROM assignment_audits WHERE assignment_id=$1', [s.published.id]),
    ).rejects.toThrow('append only');
    await expect(rehearseMigration(db, new AssignmentsQuiz1792713600000(), 'down')).rejects.toThrow(
      'Export assignment history',
    );
  });
  it('blocks ZIP publication until storage and manual grading exist', async () => {
    const s = await setup();
    const zip = await assignments.create(s.mentor, s.sessionId, {
      purpose: 'HOMEWORK',
      type: 'ZIP',
      title: 'Source ZIP',
      maxScore: '10',
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    });
    await expect(assignments.publish(s.mentor, zip.id, 1)).rejects.toMatchObject({
      response: { code: 'ZIP_PIPELINE_NOT_IMPLEMENTED' },
    });
  });
  it('rejects duplicate/foreign answers, stale versions and invalid question replacement atomically', async () => {
    const s = await setup();
    await activate(s);
    const started = (
      await attempts.start(s.student, s.published.id, s.published.revision, randomUUID())
    ).attempt;
    const answer = { questionId: started.questions[0]?.id ?? '', selectedOption: 'A' as const };
    for (const answers of [[answer, answer], [{ ...answer, questionId: randomUUID() }]])
      await expect(
        attempts.save(s.student, started.attemptId, { expectedVersion: 1, answers }, randomUUID()),
      ).rejects.toMatchObject({ status: 422 });
    await expect(
      attempts.save(
        s.student,
        started.attemptId,
        { expectedVersion: 2, answers: [] },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'SUBMISSION_VERSION_CONFLICT' } });
    expect((await attempts.get(s.student, started.attemptId)).version).toBe(1);
    const draft = await assignments.create(s.mentor, s.sessionId, {
      purpose: 'TEST',
      type: 'QUIZ',
      title: 'Draft',
      maxScore: '100',
    });
    await expect(
      assignments.replaceQuestions(s.mentor, draft.id, {
        expectedRevision: 1,
        questions: [
          {
            id: randomUUID(),
            prompt: 'Foreign',
            correctOption: 'A',
            options: [
              { label: 'A', text: 'A' },
              { label: 'B', text: 'B' },
              { label: 'C', text: 'C' },
              { label: 'D', text: 'D' },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect((await assignments.get(s.mentor, draft.id)).revision).toBe(1);
  });
  it('rolls back grading, answers and receipt when the audit insert fails', async () => {
    const s = await setup();
    await activate(s);
    const started = (
      await attempts.start(s.student, s.published.id, s.published.revision, randomUUID())
    ).attempt;
    const input = {
        expectedVersion: 1,
        answers: started.questions.map((q) => ({ questionId: q.id, selectedOption: 'A' as const })),
      },
      key = randomUUID();
    await db.query(
      `CREATE FUNCTION test_reject_assignment_submit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='SUBMIT' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$`,
    );
    await db.query(
      'CREATE TRIGGER test_assignment_submit_failure BEFORE INSERT ON assignment_audits FOR EACH ROW EXECUTE FUNCTION test_reject_assignment_submit()',
    );
    try {
      await expect(attempts.save(s.student, started.attemptId, input, key, true)).rejects.toThrow(
        'test audit failure',
      );
      expect(await attempts.get(s.student, started.attemptId)).toMatchObject({
        status: 'IN_PROGRESS',
        version: 1,
        answers: [],
        result: null,
      });
    } finally {
      await db.query('DROP TRIGGER test_assignment_submit_failure ON assignment_audits');
      await db.query('DROP FUNCTION test_reject_assignment_submit()');
    }
    expect(
      (await attempts.save(s.student, started.attemptId, input, key, true)).result?.score,
    ).toBe('100.00');
    await expect(
      db.query('UPDATE assignment_submissions SET result=NULL WHERE id=$1', [started.attemptId]),
    ).rejects.toThrow('immutable');
  });
  it('rechecks cancellation after waiting on the class lock; revoked enrollment timeout is voided', async () => {
    const s = await setup(1);
    await activate(s);
    const started = (
      await attempts.start(s.student, s.published.id, s.published.revision, randomUUID())
    ).attempt;
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.manager.query('SELECT id FROM classes WHERE id=$1 FOR UPDATE', [s.classId]);
      const pending = attempts.save(
        s.student,
        started.attemptId,
        { expectedVersion: 1, answers: [] },
        randomUUID(),
      );
      const denied = expect(pending).rejects.toMatchObject({ status: 409 });
      await runner.manager.query("UPDATE classes SET status='CANCELLED' WHERE id=$1", [s.classId]);
      await runner.commitTransaction();
      await denied;
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      await runner.release();
    }
    await db.query(
      "UPDATE assignment_submissions SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [started.attemptId],
    );
    await db.query(
      'UPDATE assignment_finalization_jobs SET run_after=clock_timestamp() WHERE submission_id=$1',
      [started.attemptId],
    );
    await attempts.finalizeDue();
    expect(await attempts.get(s.student, started.attemptId)).toMatchObject({
      status: 'VOIDED',
      result: null,
      questions: [],
    });
  });
  it('durably voids untimed attempts after enrollment revocation without grading them', async () => {
    const s = await setup();
    await activate(s);
    const started = (
      await attempts.start(s.student, s.published.id, s.published.revision, randomUUID())
    ).attempt;
    expect(started.expiresAt).toBeNull();
    await db.query("UPDATE enrollments SET status='CANCELLED' WHERE class_id=$1", [s.classId]);
    await db.query(
      'UPDATE assignment_finalization_jobs SET run_after=clock_timestamp() WHERE submission_id=$1',
      [started.attemptId],
    );
    await attempts.finalizeDue();
    expect(await attempts.get(s.student, started.attemptId)).toMatchObject({
      status: 'VOIDED',
      result: null,
    });
  });
});
