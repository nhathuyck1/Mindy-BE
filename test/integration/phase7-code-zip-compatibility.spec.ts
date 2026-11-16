import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssignmentReportingService } from '../../src/modules/assignments/services/assignment-reporting.service.js';
import { ASSIGNMENT_MIGRATIONS } from '../helpers/assignment-migrations.js';
import {
  codeServices,
  FakeCodeExecutor,
  publishedTwoSum,
} from '../helpers/code-assignment-fixture.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

describe.skipIf(!separateTestUrl('phase7_compat'))('QUIZ, ZIP and CODE compatibility', () => {
  let db: DataSource, f: ReturnType<typeof paymentFixture>, s: ReturnType<typeof codeServices>;
  const executor = new FakeCodeExecutor();
  const config = new ConfigService({ ASSIGNMENT_ZIP_ENABLED: true, MINIO_ENABLED: true });
  const reporting = new AssignmentReportingService();
  beforeAll(async () => {
    db = await paymentDatabase('phase7_compat', {
      migrations: ASSIGNMENT_MIGRATIONS,
    });
    f = paymentFixture(db);
    s = codeServices(db, f, executor, config);
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  it('preserves ZIP feature/storage gates and QUIZ questions while publishing validated CODE', async () => {
    const p = await publishedTwoSum(db, f, s, executor);
    expect(p.a.status).toBe('PUBLISHED');
    const input = { purpose: 'HOMEWORK' as const, maxScore: '10.00', dueAt: p.a.dueAt };
    const zip = await s.assignments.create(p.mentor, p.a.sessionId, {
      ...input,
      type: 'ZIP',
      title: 'ZIP alongside CODE',
    });
    config.set('ASSIGNMENT_ZIP_ENABLED', false);
    await expect(s.assignments.publish(p.mentor, zip.id, zip.revision)).rejects.toMatchObject({
      response: { code: 'ASSIGNMENT_ZIP_DISABLED' },
    });
    config.set('ASSIGNMENT_ZIP_ENABLED', true);
    config.set('MINIO_ENABLED', false);
    await expect(s.assignments.publish(p.mentor, zip.id, zip.revision)).rejects.toMatchObject({
      response: { code: 'ASSIGNMENT_STORAGE_UNAVAILABLE' },
    });
    config.set('MINIO_ENABLED', true);
    expect((await s.assignments.publish(p.mentor, zip.id, zip.revision)).status).toBe('PUBLISHED');
    const quiz = await s.assignments.create(p.mentor, p.a.sessionId, {
      ...input,
      type: 'QUIZ',
      title: 'QUIZ still requires questions',
    });
    await expect(s.assignments.publish(p.mentor, quiz.id, quiz.revision)).rejects.toMatchObject({
      response: { code: 'QUIZ_QUESTIONS_REQUIRED' },
    });
    const code = await s.assignments.create(p.mentor, p.a.sessionId, {
      ...input,
      type: 'CODE',
      title: 'CODE still requires validated content',
    });
    await expect(s.assignments.publish(p.mentor, code.id, code.revision)).rejects.toMatchObject({
      status: 422,
    });
  });

  it('counts CODE once per student, retains earlier grades during retries, and excludes voided results', async () => {
    const p = await publishedTwoSum(db, f, s, executor);
    const counts = () =>
      reporting.counts(db.manager, p.classId, null, null, null, { type: 'CODE' });
    expect(await counts()).toMatchObject({ assignments: 1, eligible: 1, submitted: 0 });
    const first = await s.submissions.submit(
      p.student,
      p.a.id,
      { languageKey: 'javascript', sourceCode: 'first' },
      randomUUID(),
    );
    expect(await counts()).toMatchObject({ submitted: 1, ungraded: 1, released: 0 });
    await s.drain();
    expect(await counts()).toMatchObject({ submitted: 1, ungraded: 0, released: 1 });
    const second = await s.submissions.submit(
      p.student,
      p.a.id,
      { languageKey: 'javascript', sourceCode: 'second' },
      randomUUID(),
    );
    expect(await counts()).toMatchObject({ submitted: 1, ungraded: 0, released: 1 });
    await s.drain();
    await s.review.void(p.mentor, first.submission.id, 'Duplicate solution');
    expect(await counts()).toMatchObject({ submitted: 1, released: 1 });
    await s.review.void(p.mentor, second.submission.id, 'Duplicate solution');
    expect(await counts()).toMatchObject({ submitted: 0, ungraded: 0, released: 0 });
  });

  it('does not mark submitted CODE missing after deadline and archives its queued work', async () => {
    const p = await publishedTwoSum(db, f, s, executor);
    const pending = await s.submissions.submit(
      p.student,
      p.a.id,
      { languageKey: 'javascript', sourceCode: 'queued' },
      randomUUID(),
    );
    await db.query(
      "UPDATE assignments SET due_at=clock_timestamp()-interval '1 second' WHERE id=$1",
      [p.a.id],
    );
    expect(await reporting.counts(db.manager, p.classId)).toMatchObject({
      missing: 0,
      submitted: 1,
    });
    await s.assignments.archive(p.mentor, p.a.id, {
      expectedRevision: p.a.revision,
      reason: 'End of assignment',
    });
    expect(await s.submissions.detail(p.student, pending.submission.id)).toMatchObject({
      status: 'VOIDED',
      voidedReason: 'ASSIGNMENT_ARCHIVED',
    });
    const [job] = await db.query(
      'SELECT completed_at FROM code_judge_jobs WHERE submission_id=$1',
      [pending.submission.id],
    );
    expect(job.completed_at).toBeInstanceOf(Date);
    expect(await reporting.counts(db.manager, p.classId)).toMatchObject({
      assignments: 1,
      eligible: 0,
      missing: 0,
      submitted: 0,
    });
  });
});
