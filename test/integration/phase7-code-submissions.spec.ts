import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RESULT_PREFIX } from '../../src/modules/assignments/domain/code-driver.js';
import { AssignmentAccessService } from '../../src/modules/assignments/services/assignment-access.service.js';
import { AssignmentsService } from '../../src/modules/assignments/services/assignments.service.js';
import { CodeAuthoringService } from '../../src/modules/assignments/services/code-authoring.service.js';
import {
  type CodeExecutionReport,
  type CodeExecutionRequest,
  type CodeExecutor,
  CodeRunnerBusyError,
  CodeRunnerUnavailableError,
} from '../../src/modules/assignments/services/code-executor.service.js';
import { CodeJudgeService } from '../../src/modules/assignments/services/code-judge.service.js';
import { CodeSubmissionsService } from '../../src/modules/assignments/services/code-submissions.service.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import { ASSIGNMENT_MIGRATIONS } from '../helpers/assignment-migrations.js';
import { paymentDatabase, paymentFixture, separateTestUrl } from '../helpers/payment-fixture.js';

const actor = (userId: string, role: UserRole): AuthenticatedUser => ({
  userId,
  role,
  sessionId: randomUUID(),
});

type Mode = 'ok' | 'compile' | 'busy' | 'down';
class FakeExecutor implements CodeExecutor {
  mode: Mode = 'ok';
  answer: (args: unknown[]) => unknown = () => null;
  async execute(request: CodeExecutionRequest): Promise<CodeExecutionReport> {
    if (this.mode === 'busy') throw new CodeRunnerBusyError(1);
    if (this.mode === 'down') throw new CodeRunnerUnavailableError('status 503');
    if (this.mode === 'compile')
      return {
        runtimeVersion: 'fake',
        compile: { status: 'ERROR', output: 'Main.java:1: error' },
        tests: [],
      };
    const nonce = /MINDY:([a-f0-9]{16,64}):/.exec(request.source)?.[1] ?? '';
    return {
      runtimeVersion: 'fake',
      compile: { status: 'OK', output: '' },
      tests: request.tests.map((t) => ({
        id: t.id,
        status: 'OK' as const,
        stdout: `debug\n${RESULT_PREFIX}${nonce}:${JSON.stringify(this.answer(JSON.parse(t.stdin)))}\n`,
        stderr: '',
        timeMs: 4,
        memoryKb: 2048,
      })),
    };
  }
}

const twoSum = (args: unknown[]) => {
  const [nums, target] = args as [number[], number];
  for (let i = 0; i < nums.length; i++)
    for (let j = i + 1; j < nums.length; j++) if (nums[i]! + nums[j]! === target) return [i, j];
  return [];
};
const settings: Record<string, unknown> = {
  CODE_RUN_PER_MINUTE: 3,
  CODE_RUN_PER_DAY: 300,
  CODE_RUNNER_TIMEOUT_MS: 60000,
};
const config = { getOrThrow: (key: string) => settings[key] } as unknown as ConfigService;

describe.skipIf(!separateTestUrl('phase7s'))('Phase 7 CODE submissions PostgreSQL', () => {
  let db: DataSource,
    f: ReturnType<typeof paymentFixture>,
    assignments: AssignmentsService,
    authoring: CodeAuthoringService,
    code: CodeSubmissionsService,
    judge: CodeJudgeService;
  const executor = new FakeExecutor();
  const pushed: string[] = [];
  beforeAll(async () => {
    db = await paymentDatabase('phase7s', {
      migrations: ASSIGNMENT_MIGRATIONS,
    });
    f = paymentFixture(db);
    const teaching = new TeachingReadService(
      db,
      f.config,
      f.users,
      new ScheduleReservationsService(),
    );
    const access = new AssignmentAccessService(teaching, f.users, f.enrollments);
    assignments = new AssignmentsService(db, access, f.workspace, f.enrollments);
    authoring = new CodeAuthoringService(db, assignments, executor);
    code = new CodeSubmissionsService(db, config, assignments, access, executor);
    judge = new CodeJudgeService(db, config, executor, {
      submissionUpdated: async (_student, e) => {
        pushed.push(`${e.submissionId}:${e.status}`);
      },
    });
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  /** Published, validated Two Sum with 1 SAMPLE + 1 HIDDEN (weight 3), maxScore 10, 3 attempts. */
  async function published(maxAttempts = 3) {
    const order = await f.order();
    const classId = order.classIds[0] ?? '';
    const sessionId = (await f.read.getDetail(classId)).units[0]?.sessions[0]?.id ?? '';
    const mentor = actor(order.mentor.id, UserRole.MENTOR);
    const student = actor(order.student.id, UserRole.STUDENT);
    const created = await assignments.create(mentor, sessionId, {
      purpose: 'HOMEWORK',
      type: 'CODE',
      title: 'Two Sum',
      maxScore: '10.00',
      maxAttempts,
      dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    let r = await authoring.upsertProblem(mentor, created.id, {
      expectedRevision: created.revision,
      statementMd: 'Two Sum',
      signature: {
        functionName: 'twoSum',
        params: [
          { name: 'nums', type: 'int[]' },
          { name: 'target', type: 'int' },
        ],
        returnType: 'int[]',
      },
      compareMode: 'EXACT',
      scoringMode: 'PER_TEST',
      cpuTimeLimitMs: 2000,
      memoryLimitMb: 256,
    });
    r = await authoring.replaceLanguages(mentor, created.id, {
      expectedRevision: r.assignment.revision,
      languages: [{ languageKey: 'javascript' }],
    });
    r = await authoring.upsertTest(mentor, created.id, 1, {
      expectedRevision: r.assignment.revision,
      visibility: 'SAMPLE',
      inputArgs: [[2, 7, 11, 15], 9],
      expected: [0, 1],
    });
    r = await authoring.upsertTest(mentor, created.id, 2, {
      expectedRevision: r.assignment.revision,
      visibility: 'HIDDEN',
      inputArgs: [[3, 2, 4], 6],
      expected: [1, 2],
      weight: 3,
    });
    r = await authoring.upsertReference(mentor, created.id, 'javascript', {
      expectedRevision: r.assignment.revision,
      sourceCode: 'function twoSum(n, t) { return []; }',
    });
    executor.mode = 'ok';
    executor.answer = twoSum;
    await authoring.validate(mentor, created.id, r.assignment.revision);
    const a = await assignments.publish(mentor, created.id, r.assignment.revision);
    // Test-only settlement fixture: do not call merchant/payment providers.
    await db.query(
      "UPDATE enrollments SET status='ACTIVE',enrolled_at=clock_timestamp() WHERE student_id=$1 AND class_id=$2",
      [student.userId, classId],
    );
    await db.query('DELETE FROM code_runs');
    return { a, mentor, student, classId };
  }

  async function drain(): Promise<void> {
    for (let claim = await judge.claim(); claim; claim = await judge.claim())
      await judge.process(claim);
  }

  it('shows only sample tests and keeps drafts with optimistic versions', async () => {
    const s = await published();
    const view = await code.view(s.student, s.a.id);
    expect(view).toMatchObject({
      hiddenTestCount: 1,
      attemptsUsed: 0,
      attemptsRemaining: 3,
      canSubmit: true,
      bestScore: null,
    });
    expect(view.samples).toEqual([
      {
        position: 1,
        inputArgs: [[2, 7, 11, 15], 9],
        expected: [0, 1],
        display: 'nums = [2,7,11,15], target = 9',
        explanationMd: null,
      },
    ]);
    expect(JSON.stringify(view)).not.toContain('[3,2,4]');
    expect(await code.draft(s.student, s.a.id, 'javascript')).toMatchObject({ version: 0 });
    const v1 = await code.saveDraft(s.student, s.a.id, 'javascript', {
      sourceCode: 'a',
      expectedVersion: 0,
    });
    expect(v1.version).toBe(1);
    await expect(
      code.saveDraft(s.student, s.a.id, 'javascript', { sourceCode: 'b', expectedVersion: 0 }),
    ).rejects.toMatchObject({ response: { code: 'CODE_DRAFT_VERSION_CONFLICT' } });
    expect(
      (
        await code.saveDraft(s.student, s.a.id, 'javascript', {
          sourceCode: 'c',
          expectedVersion: 1,
        })
      ).version,
    ).toBe(2);
    await expect(code.draft(s.student, s.a.id, 'java21')).rejects.toMatchObject({
      response: { code: 'CODE_LANGUAGE_NOT_ALLOWED' },
    });
  });

  it('runs samples or a custom input with a per-student rate limit', async () => {
    const s = await published();
    const samples = await code.run(s.student, s.a.id, {
      languageKey: 'javascript',
      sourceCode: 'x',
    });
    expect(samples.tests).toEqual([
      expect.objectContaining({
        kind: 'SAMPLE',
        position: 1,
        status: 'PASSED',
        actual: [0, 1],
        console: 'debug',
      }),
    ]);
    const custom = await code.run(s.student, s.a.id, {
      languageKey: 'javascript',
      sourceCode: 'x',
      customArgs: [[1, 4], 5],
    });
    expect(custom.tests).toEqual([
      expect.objectContaining({ kind: 'CUSTOM', status: 'COMPLETED', actual: [0, 1] }),
    ]);
    expect(custom.tests[0]).not.toHaveProperty('expected');
    await expect(
      code.run(s.student, s.a.id, {
        languageKey: 'javascript',
        sourceCode: 'x',
        customArgs: [['1'], 5],
      }),
    ).rejects.toMatchObject({ response: { code: 'CODE_CUSTOM_INPUT_INVALID' } });
    await code.run(s.student, s.a.id, { languageKey: 'javascript', sourceCode: 'x' });
    await expect(
      code.run(s.student, s.a.id, { languageKey: 'javascript', sourceCode: 'x' }),
    ).rejects.toMatchObject({
      status: 429,
      response: { code: 'CODE_RUN_RATE_LIMITED' },
    });
  });

  it('submits idempotently, judges in the worker and hides hidden test data', async () => {
    const s = await published();
    await expect(
      code.submit(s.student, s.a.id, { languageKey: 'javascript', sourceCode: 'x' }),
    ).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_KEY_REQUIRED' },
    });
    const key = randomUUID();
    const first = await code.submit(
      s.student,
      s.a.id,
      { languageKey: 'javascript', sourceCode: 'x' },
      key,
    );
    const again = await code.submit(
      s.student,
      s.a.id,
      { languageKey: 'javascript', sourceCode: 'x' },
      key,
    );
    expect(first.created).toBe(true);
    expect(again).toMatchObject({ created: false, submission: { id: first.submission.id } });
    expect(first.submission).toMatchObject({
      status: 'QUEUED',
      attemptNumber: 1,
      retryAfterMs: 1500,
    });
    await expect(
      code.submit(s.student, s.a.id, { languageKey: 'javascript', sourceCode: 'y' }, key),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    await expect(
      code.submit(s.student, s.a.id, { languageKey: 'javascript', sourceCode: 'y' }, randomUUID()),
    ).rejects.toMatchObject({ response: { code: 'CODE_SUBMISSION_IN_FLIGHT' } });

    executor.answer = (args) => (JSON.stringify(args) === '[[3,2,4],6]' ? [9, 9] : twoSum(args));
    await drain();
    const detail = await code.detail(s.student, first.submission.id);
    expect(detail).toMatchObject({
      status: 'GRADED',
      verdict: 'PARTIAL',
      score: '2.50',
      passedCount: 1,
      totalCount: 2,
    });
    expect(detail.tests?.[0]).toMatchObject({
      visibility: 'SAMPLE',
      status: 'PASSED',
      actual: [0, 1],
      console: 'debug',
    });
    expect(detail.tests?.[1]).toEqual({
      position: 2,
      visibility: 'HIDDEN',
      status: 'WRONG_ANSWER',
      timeMs: 4,
      memoryKb: 2048,
    });
    expect(pushed).toContain(`${first.submission.id}:GRADED`);

    executor.answer = twoSum;
    const second = await code.submit(
      s.student,
      s.a.id,
      { languageKey: 'javascript', sourceCode: 'z' },
      randomUUID(),
    );
    await drain();
    expect(await code.detail(s.student, second.submission.id)).toMatchObject({
      verdict: 'ACCEPTED',
      score: '10.00',
    });
    expect(await code.view(s.student, s.a.id)).toMatchObject({
      attemptsUsed: 2,
      bestScore: '10.00',
      bestSubmissionId: second.submission.id,
    });
  });

  it('does not count compile errors or system failures, counts voided submissions, and enforces the limit', async () => {
    const s = await published(2);
    executor.mode = 'compile';
    const ce = await code.submit(
      s.student,
      s.a.id,
      { languageKey: 'javascript', sourceCode: 'bad(' },
      randomUUID(),
    );
    await drain();
    expect(await code.detail(s.student, ce.submission.id)).toMatchObject({
      verdict: 'COMPILE_ERROR',
      countsAsAttempt: false,
      score: '0.00',
      compileOutput: 'Main.java:1: error',
    });

    executor.mode = 'busy';
    const busy = await code.submit(
      s.student,
      s.a.id,
      { languageKey: 'javascript', sourceCode: 'b' },
      randomUUID(),
    );
    await drain();
    expect(await code.detail(s.student, busy.submission.id)).toMatchObject({ status: 'QUEUED' });
    const [job] = await db.query('SELECT attempts FROM code_judge_jobs WHERE submission_id=$1', [
      busy.submission.id,
    ]);
    expect(job.attempts).toBe(0);

    executor.mode = 'down';
    for (let i = 0; i < 5; i++) {
      await db.query(
        'UPDATE code_judge_jobs SET run_after=clock_timestamp() WHERE submission_id=$1',
        [busy.submission.id],
      );
      await drain();
    }
    expect(await code.detail(s.student, busy.submission.id)).toMatchObject({ status: 'FAILED' });
    expect((await code.view(s.student, s.a.id)).attemptsUsed).toBe(0);

    executor.mode = 'ok';
    const voided = await code.submit(
      s.student,
      s.a.id,
      { languageKey: 'javascript', sourceCode: 'v' },
      randomUUID(),
    );
    await drain();
    await db.query(
      "UPDATE code_submissions SET status='VOIDED',voided_reason='Chép bài' WHERE id=$1",
      [voided.submission.id],
    );
    expect((await code.view(s.student, s.a.id)).attemptsUsed).toBe(1);
    await code.submit(
      s.student,
      s.a.id,
      { languageKey: 'javascript', sourceCode: 'w' },
      randomUUID(),
    );
    await drain();
    await expect(
      code.submit(
        s.student,
        s.a.id,
        { languageKey: 'javascript', sourceCode: 'last' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'CODE_ATTEMPTS_EXHAUSTED' } });
    expect((await code.view(s.student, s.a.id)).bestScore).toBe('10.00');
  });

  it('rejects late submissions and voids queued work on archive while history stays readable', async () => {
    const s = await published();
    const queued = await code.submit(
      s.student,
      s.a.id,
      { languageKey: 'javascript', sourceCode: 'q' },
      randomUUID(),
    );
    const archived = await assignments.archive(s.mentor, s.a.id, {
      expectedRevision: s.a.revision,
      reason: 'đóng',
    });
    expect(archived.status).toBe('ARCHIVED');
    await drain();
    expect(await code.detail(s.student, queued.submission.id)).toMatchObject({
      status: 'VOIDED',
      voidedReason: 'ASSIGNMENT_ARCHIVED',
    });
    expect((await code.list(s.student, s.a.id)).items).toHaveLength(1);

    const late = await published();
    await db.query(
      "UPDATE assignments SET due_at=clock_timestamp() - interval '1 minute' WHERE id=$1",
      [late.a.id],
    );
    await expect(
      code.submit(
        late.student,
        late.a.id,
        { languageKey: 'javascript', sourceCode: 'x' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ response: { code: 'ASSIGNMENT_DEADLINE_PASSED' } });
    await expect(
      code.run(late.student, late.a.id, { languageKey: 'javascript', sourceCode: 'x' }),
    ).rejects.toMatchObject({
      response: { code: 'ASSIGNMENT_DEADLINE_PASSED' },
    });
  });

  it('keeps submissions private to their owner', async () => {
    const s = await published();
    const mine = await code.submit(
      s.student,
      s.a.id,
      { languageKey: 'javascript', sourceCode: 'm' },
      randomUUID(),
    );
    const other = await published();
    await expect(code.detail(other.student, mine.submission.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(code.view(other.student, s.a.id)).rejects.toMatchObject({ status: 404 });
  });
});
