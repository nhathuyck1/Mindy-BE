import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssignmentsQuiz1792713600000 } from '../../src/database/migrations/1792713600000-assignments-quiz.js';
import { CodeAssignments1792886400000 } from '../../src/database/migrations/1792886400000-code-assignments.js';
import {
  codeServices,
  FakeCodeExecutor,
  publishedTwoSum,
  twoSum,
} from '../helpers/code-assignment-fixture.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase7r'))('Phase 7 CODE mentor review PostgreSQL', () => {
  let db: DataSource, f: ReturnType<typeof paymentFixture>, s: ReturnType<typeof codeServices>;
  const executor = new FakeCodeExecutor();
  beforeAll(async () => {
    db = await paymentDatabase('phase7r', {
      migrations: [AssignmentsQuiz1792713600000, CodeAssignments1792886400000],
    });
    f = paymentFixture(db);
    s = codeServices(db, f, executor);
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  const submit = (p: Awaited<ReturnType<typeof publishedTwoSum>>, code: string) =>
    s.submissions.submit(
      p.student,
      p.a.id,
      { languageKey: 'javascript', sourceCode: code },
      randomUUID(),
    );

  it('summarises the class and exposes full submission detail to the mentor', async () => {
    const p = await publishedTwoSum(db, f, s, executor);
    let summary = await s.review.summary(p.mentor, p.a.id, { page: 1, pageSize: 20 });
    expect(summary.totals).toMatchObject({
      students: 1,
      submitted: 0,
      notSubmitted: 1,
      accepted: 0,
    });
    executor.answer = (args) => (JSON.stringify(args) === '[[3,2,4],6]' ? [0, 0] : twoSum(args));
    const first = await submit(p, 'partial');
    await s.drain();
    executor.answer = twoSum;
    const second = await submit(p, 'accepted');
    await s.drain();
    summary = await s.review.summary(p.mentor, p.a.id, { page: 1, pageSize: 20 });
    expect(summary.totals).toMatchObject({
      students: 1,
      submitted: 1,
      accepted: 1,
      averageBestScore: '10.00',
    });
    expect(summary.items[0]).toMatchObject({
      studentId: p.student.userId,
      submissionCount: 2,
      attemptsUsed: 2,
      bestScore: '10.00',
      bestSubmissionId: second.submission.id,
      latestVerdict: 'ACCEPTED',
    });
    const page = await s.review.submissions(p.mentor, p.a.id, { page: 1, pageSize: 20 });
    expect(page.items.map((i) => i.attemptNumber)).toEqual([2, 1]);
    const detail = await s.review.submission(p.mentor, first.submission.id);
    expect(detail.sourceCode).toBe('partial');
    expect(detail.mentorTests[1]).toEqual({
      position: 2,
      visibility: 'HIDDEN',
      weight: 3,
      status: 'WRONG_ANSWER',
      timeMs: 4,
      memoryKb: 2048,
      inputArgs: [[3, 2, 4], 6],
      expected: [1, 2],
    });
  });

  it('rejudges only FAILED submissions', async () => {
    const p = await publishedTwoSum(db, f, s, executor);
    executor.mode = 'down';
    const failed = await submit(p, 'x');
    for (let i = 0; i < 5; i++) {
      await db.query(
        'UPDATE code_judge_jobs SET run_after=clock_timestamp() WHERE submission_id=$1',
        [failed.submission.id],
      );
      await s.drain();
    }
    const detail = await s.review.submission(p.mentor, failed.submission.id);
    expect(detail).toMatchObject({
      status: 'FAILED',
      lastError: expect.stringContaining('CODE_RUNNER_UNAVAILABLE'),
    });
    executor.mode = 'ok';
    expect((await s.review.rejudge(p.mentor, failed.submission.id)).status).toBe('QUEUED');
    await s.drain();
    const graded = await s.review.submission(p.mentor, failed.submission.id);
    expect(graded).toMatchObject({ status: 'GRADED', verdict: 'ACCEPTED' });
    await expect(s.review.rejudge(p.mentor, failed.submission.id)).rejects.toMatchObject({
      response: { code: 'CODE_REJUDGE_NOT_ALLOWED' },
    });
    const audits: { action: string }[] = await db.query(
      'SELECT action FROM assignment_audits WHERE assignment_id=$1 ORDER BY created_at',
      [p.a.id],
    );
    expect(audits.map((x) => x.action)).toContain('CODE_REJUDGE');
  });

  it('voids with a reason: excluded from the best score, still counted, visible to the student', async () => {
    const p = await publishedTwoSum(db, f, s, executor, 2);
    const copied = await submit(p, 'copied');
    await s.drain();
    const voided = await s.review.void(p.mentor, copied.submission.id, 'Chép bài của bạn khác');
    expect(voided).toMatchObject({ status: 'VOIDED', voidedReason: 'Chép bài của bạn khác' });
    await expect(s.review.void(p.mentor, copied.submission.id, 'again')).rejects.toMatchObject({
      response: { code: 'CODE_SUBMISSION_ALREADY_VOIDED' },
    });
    const view = await s.submissions.view(p.student, p.a.id);
    expect(view).toMatchObject({ attemptsUsed: 1, bestScore: null });
    expect(await s.submissions.detail(p.student, copied.submission.id)).toMatchObject({
      status: 'VOIDED',
      voidedReason: 'Chép bài của bạn khác',
    });
    expect(s.pushed).toContain(`${copied.submission.id}:VOIDED`);
    const summary = await s.review.summary(p.mentor, p.a.id, { page: 1, pageSize: 20 });
    expect(summary.items[0]).toMatchObject({ attemptsUsed: 1, bestScore: null });
  });

  it('keeps review mentor-scoped', async () => {
    const p1 = await publishedTwoSum(db, f, s, executor);
    const p2 = await publishedTwoSum(db, f, s, executor);
    await submit(p1, 'same solution');
    await s.drain();
    await expect(
      s.review.summary(p2.mentor, p1.a.id, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      s.review.summary(p1.student, p1.a.id, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({
      status: 403,
    });
    const items = (await s.review.submissions(p1.mentor, p1.a.id, { page: 1, pageSize: 20 })).items;
    expect(items[0]?.duplicateOfOtherStudent).toBe(false);
  });
});
