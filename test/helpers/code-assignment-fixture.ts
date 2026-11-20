import { randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';
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
import {
  CodeJudgeService,
  type CodeSubmissionNotifier,
} from '../../src/modules/assignments/services/code-judge.service.js';
import { CodeReviewService } from '../../src/modules/assignments/services/code-review.service.js';
import { CodeSubmissionsService } from '../../src/modules/assignments/services/code-submissions.service.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';
import { TeachingReadService } from '../../src/modules/classes/services/teaching-read.service.js';
import { ScheduleReservationsService } from '../../src/modules/schedule-reservations/schedule-reservations.service.js';
import { UserRole } from '../../src/modules/users/user-role.enum.js';
import type { paymentFixture } from './payment-fixture.js';

/** Test-only runner: answers with `answer(args)` tagged with the driver nonce. No Docker or network. */
export class FakeCodeExecutor implements CodeExecutor {
  mode: 'ok' | 'compile' | 'busy' | 'down' = 'ok';
  answer: (args: unknown[]) => unknown = twoSum;
  async execute(request: CodeExecutionRequest): Promise<CodeExecutionReport> {
    if (this.mode === 'busy') throw new CodeRunnerBusyError(1);
    if (this.mode === 'down') throw new CodeRunnerUnavailableError('status 503');
    if (this.mode === 'compile')
      return { runtimeVersion: 'fake', compile: { status: 'ERROR', output: 'error' }, tests: [] };
    const nonce = /MINDY:([a-f0-9]{16,64}):/.exec(request.source)?.[1] ?? '';
    return {
      runtimeVersion: 'fake',
      compile: { status: 'OK', output: '' },
      tests: request.tests.map((t) => ({
        id: t.id,
        status: 'OK' as const,
        stdout: `\n${RESULT_PREFIX}${nonce}:${JSON.stringify(this.answer(JSON.parse(t.stdin)))}\n`,
        stderr: '',
        timeMs: 4,
        memoryKb: 2048,
      })),
    };
  }
}

export function twoSum(args: unknown[]): number[] {
  const [nums, target] = args as [number[], number];
  for (let i = 0; i < nums.length; i++)
    for (let j = i + 1; j < nums.length; j++) if (nums[i]! + nums[j]! === target) return [i, j];
  return [];
}

export const codeActor = (userId: string, role: UserRole): AuthenticatedUser => ({
  userId,
  role,
  sessionId: randomUUID(),
});

export function codeServices(
  db: DataSource,
  f: ReturnType<typeof paymentFixture>,
  executor: CodeExecutor,
  assignmentConfig?: ConfigService,
) {
  const settings: Record<string, unknown> = {
    CODE_RUN_PER_MINUTE: 30,
    CODE_RUN_PER_DAY: 300,
    CODE_RUNNER_TIMEOUT_MS: 60000,
  };
  const config = { getOrThrow: (key: string) => settings[key] } as unknown as ConfigService;
  const pushed: string[] = [];
  const notifier: CodeSubmissionNotifier = {
    submissionUpdated: async (_student, e) => {
      pushed.push(`${e.submissionId}:${e.status}`);
    },
  };
  const teaching = new TeachingReadService(
    db,
    f.config,
    f.users,
    new ScheduleReservationsService(),
  );
  const access = new AssignmentAccessService(teaching, f.users, f.enrollments);
  const assignments = new AssignmentsService(
    db,
    access,
    f.workspace,
    f.enrollments,
    assignmentConfig,
  );
  const judge = new CodeJudgeService(db, config, executor, notifier);
  return {
    assignments,
    authoring: new CodeAuthoringService(db, assignments, executor),
    submissions: new CodeSubmissionsService(db, config, assignments, access, executor),
    review: new CodeReviewService(db, assignments, notifier),
    judge,
    pushed,
    async drain(): Promise<void> {
      for (let claim = await judge.claim(); claim; claim = await judge.claim())
        await judge.process(claim);
    },
  };
}

/** Published, validated Two Sum (1 SAMPLE + 1 HIDDEN weight 3, max 10.00) with an ACTIVE student. */
export async function publishedTwoSum(
  db: DataSource,
  f: ReturnType<typeof paymentFixture>,
  s: ReturnType<typeof codeServices>,
  executor: FakeCodeExecutor,
  maxAttempts = 5,
) {
  const order = await f.order();
  const classId = order.classIds[0] ?? '';
  const sessionId = (await f.read.getDetail(classId)).units[0]?.sessions[0]?.id ?? '';
  const mentor = codeActor(order.mentor.id, UserRole.MENTOR);
  const student = codeActor(order.student.id, UserRole.STUDENT);
  const created = await s.assignments.create(mentor, sessionId, {
    purpose: 'HOMEWORK',
    type: 'CODE',
    title: 'Two Sum',
    maxScore: '10.00',
    maxAttempts,
    dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  });
  let r = await s.authoring.upsertProblem(mentor, created.id, {
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
  r = await s.authoring.replaceLanguages(mentor, created.id, {
    expectedRevision: r.assignment.revision,
    languages: [{ languageKey: 'javascript' }],
  });
  r = await s.authoring.upsertTest(mentor, created.id, 1, {
    expectedRevision: r.assignment.revision,
    visibility: 'SAMPLE',
    inputArgs: [[2, 7, 11, 15], 9],
    expected: [0, 1],
  });
  r = await s.authoring.upsertTest(mentor, created.id, 2, {
    expectedRevision: r.assignment.revision,
    visibility: 'HIDDEN',
    inputArgs: [[3, 2, 4], 6],
    expected: [1, 2],
    weight: 3,
  });
  r = await s.authoring.upsertReference(mentor, created.id, 'javascript', {
    expectedRevision: r.assignment.revision,
    sourceCode: 'function twoSum(n, t) { return []; }',
  });
  executor.mode = 'ok';
  executor.answer = twoSum;
  await s.authoring.validate(mentor, created.id, r.assignment.revision);
  const a = await s.assignments.publish(mentor, created.id, r.assignment.revision);
  // Test-only settlement fixture: do not call merchant/payment providers.
  await db.query(
    "UPDATE enrollments SET status='ACTIVE',enrolled_at=clock_timestamp() WHERE student_id=$1 AND class_id=$2",
    [student.userId, classId],
  );
  return { a, mentor, student, classId };
}
