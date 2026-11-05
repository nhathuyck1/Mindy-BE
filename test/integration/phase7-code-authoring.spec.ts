import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AssignmentsQuiz1792713600000 } from '../../src/database/migrations/1792713600000-assignments-quiz.js';
import { CodeAssignments1792886400000 } from '../../src/database/migrations/1792886400000-code-assignments.js';
import { RESULT_PREFIX } from '../../src/modules/assignments/domain/code-driver.js';
import { AssignmentAccessService } from '../../src/modules/assignments/services/assignment-access.service.js';
import { AssignmentsService } from '../../src/modules/assignments/services/assignments.service.js';
import { CodeAuthoringService } from '../../src/modules/assignments/services/code-authoring.service.js';
import {
  type CodeExecutionReport,
  type CodeExecutionRequest,
  type CodeExecutor,
  CodeRunnerBusyError,
} from '../../src/modules/assignments/services/code-executor.service.js';
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

/**
 * Fake runner: answers each test with `answer(args)` tagged with the nonce found in the generated
 * driver source, exactly like the real driver prints it. No Docker or network involved.
 */
class FakeExecutor implements CodeExecutor {
  answer: (args: unknown[]) => unknown = () => null;
  busy = false;
  requests: CodeExecutionRequest[] = [];
  async execute(request: CodeExecutionRequest): Promise<CodeExecutionReport> {
    this.requests.push(request);
    if (this.busy) throw new CodeRunnerBusyError(3);
    const nonce = /MINDY:([a-f0-9]{16,64}):/.exec(request.source)?.[1] ?? '';
    return {
      runtimeVersion: 'fake',
      compile: { status: 'OK', output: '' },
      tests: request.tests.map((t) => ({
        id: t.id,
        status: 'OK' as const,
        stdout: `\n${RESULT_PREFIX}${nonce}:${JSON.stringify(this.answer(JSON.parse(t.stdin)))}\n`,
        stderr: '',
        timeMs: 3,
        memoryKb: 1000,
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

describe.skipIf(!separateTestUrl('phase7'))('Phase 7 CODE authoring PostgreSQL', () => {
  let db: DataSource,
    f: ReturnType<typeof paymentFixture>,
    assignments: AssignmentsService,
    code: CodeAuthoringService;
  const executor = new FakeExecutor();
  beforeAll(async () => {
    db = await paymentDatabase('phase7', {
      migrations: [AssignmentsQuiz1792713600000, CodeAssignments1792886400000],
    });
    await rehearseMigration(db, new CodeAssignments1792886400000(), 'down');
    await rehearseMigration(db, new CodeAssignments1792886400000(), 'up');
    f = paymentFixture(db);
    const teaching = new TeachingReadService(
      db,
      f.config,
      f.users,
      new ScheduleReservationsService(),
    );
    const access = new AssignmentAccessService(teaching, f.users, f.enrollments);
    assignments = new AssignmentsService(db, access, f.workspace, f.enrollments);
    code = new CodeAuthoringService(db, assignments, executor);
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  async function draft() {
    const order = await f.order();
    const classId = order.classIds[0] ?? '';
    const detail = await f.read.getDetail(classId);
    const sessionId = detail.units[0]?.sessions[0]?.id ?? '';
    const mentor = actor(order.mentor.id, UserRole.MENTOR);
    const student = actor(order.student.id, UserRole.STUDENT);
    const created = await assignments.create(mentor, sessionId, {
      purpose: 'HOMEWORK',
      type: 'CODE',
      title: 'Two Sum',
      maxScore: '10.00',
      dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    return { mentor, student, created };
  }

  async function author(s: Awaited<ReturnType<typeof draft>>) {
    let r = await code.upsertProblem(s.mentor, s.created.id, {
      expectedRevision: s.created.revision,
      statementMd: 'Return indices of two numbers adding up to target.',
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
    r = await code.replaceLanguages(s.mentor, s.created.id, {
      expectedRevision: r.assignment.revision,
      languages: [{ languageKey: 'javascript' }, { languageKey: 'java21' }],
    });
    r = await code.upsertTest(s.mentor, s.created.id, 1, {
      expectedRevision: r.assignment.revision,
      visibility: 'SAMPLE',
      inputArgs: [[2, 7, 11, 15], 9],
      expected: [0, 1],
      explanationMd: 'nums[0] + nums[1] = 9',
    });
    r = await code.upsertTest(s.mentor, s.created.id, 2, {
      expectedRevision: r.assignment.revision,
      visibility: 'HIDDEN',
      inputArgs: [[3, 2, 4], 6],
      expected: [1, 2],
      weight: 3,
    });
    return code.upsertReference(s.mentor, s.created.id, 'javascript', {
      expectedRevision: r.assignment.revision,
      sourceCode: 'function twoSum(nums, target) { return [0, 1]; }',
    });
  }

  it('creates CODE drafts with a deadline and 10 attempts by default', async () => {
    const s = await draft();
    expect(s.created).toMatchObject({
      type: 'CODE',
      maxAttempts: 10,
      status: 'DRAFT',
      revision: 1,
    });
    const order = await f.order();
    const sessionId =
      (await f.read.getDetail(order.classIds[0] ?? '')).units[0]?.sessions[0]?.id ?? '';
    const mentor = actor(order.mentor.id, UserRole.MENTOR);
    await expect(
      assignments.create(mentor, sessionId, {
        purpose: 'HOMEWORK',
        type: 'CODE',
        title: 'x',
        maxScore: '1',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_ASSIGNMENT_CONFIG' } });
    await expect(
      assignments.create(mentor, sessionId, {
        purpose: 'HOMEWORK',
        type: 'ZIP',
        title: 'x',
        maxScore: '1',
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        maxAttempts: 11,
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_ASSIGNMENT_CONFIG' } });
  });

  it('authors, validates with the reference solution and publishes', async () => {
    const s = await draft();
    await expect(assignments.publish(s.mentor, s.created.id, 1)).rejects.toMatchObject({
      response: { code: 'CODE_PROBLEM_REQUIRED' },
    });
    const authored = await author(s);
    expect(authored.languages.map((l) => l.languageKey)).toEqual(['javascript', 'java21']);
    expect(authored.languages[0]?.starterCode).toContain('function twoSum(nums, target)');
    expect(authored.languages[1]?.starterCode).toContain(
      'public int[] twoSum(int[] nums, int target)',
    );
    expect(authored.tests.map((t) => [t.position, t.visibility, t.weight])).toEqual([
      [1, 'SAMPLE', 1],
      [2, 'HIDDEN', 3],
    ]);
    expect(authored.publishBlockers).toEqual(['CODE_REFERENCE_NOT_VALIDATED']);

    executor.answer = () => [0, 1]; // wrong for the hidden test
    const failed = await code.validate(s.mentor, s.created.id, authored.assignment.revision);
    expect(failed.validated).toBe(false);
    expect(failed.results[0]?.tests.map((t) => t.verdict)).toEqual(['PASSED', 'WRONG_ANSWER']);
    await expect(
      assignments.publish(s.mentor, s.created.id, authored.assignment.revision),
    ).rejects.toMatchObject({ status: 409, response: { code: 'CODE_REFERENCE_NOT_VALIDATED' } });

    executor.answer = twoSum;
    const ok = await code.validate(s.mentor, s.created.id, authored.assignment.revision);
    expect(ok).toMatchObject({ validated: true, revision: authored.assignment.revision });
    const request = executor.requests.at(-1);
    expect(request?.tests.map((t) => t.stdin)).toEqual(['[[2,7,11,15],9]\n', '[[3,2,4],6]\n']);
    expect(request?.limits).toMatchObject({ cpuTimeMs: 2000, memoryMb: 256 });
    expect((await code.get(s.mentor, s.created.id)).publishBlockers).toEqual([]);

    const published = await assignments.publish(
      s.mentor,
      s.created.id,
      authored.assignment.revision,
    );
    expect(published.status).toBe('PUBLISHED');
    await expect(
      code.upsertTest(s.mentor, s.created.id, 3, {
        expectedRevision: published.revision,
        visibility: 'HIDDEN',
        inputArgs: [[1, 1], 2],
        expected: [0, 1],
      }),
    ).rejects.toMatchObject({ response: { code: 'ASSIGNMENT_CONTENT_FROZEN' } });
  });

  it('lets the mentor run demo code on samples and custom input after publishing, storing nothing', async () => {
    const s = await draft();
    const authored = await author(s);
    executor.answer = twoSum;
    await code.validate(s.mentor, s.created.id, authored.assignment.revision);
    await assignments.publish(s.mentor, s.created.id, authored.assignment.revision);
    const before = await db.query('SELECT count(*)::int AS n FROM code_runs');

    const samples = await code.mentorRun(s.mentor, s.created.id, {
      languageKey: 'javascript',
      sourceCode: 'function twoSum(nums, target) { return [0, 1]; }',
    });
    expect(samples.compileStatus).toBe('OK');
    expect(samples.tests).toEqual([
      expect.objectContaining({ kind: 'SAMPLE', position: 1, status: 'PASSED', actual: [0, 1] }),
    ]);
    expect(executor.requests.at(-1)?.priority).toBe('interactive');

    executor.answer = () => [9, 9];
    const wrong = await code.mentorRun(s.mentor, s.created.id, {
      languageKey: 'java21',
      sourceCode: 'class Solution {}',
    });
    expect(wrong.tests[0]?.status).toBe('WRONG_ANSWER');

    executor.answer = twoSum;
    const custom = await code.mentorRun(s.mentor, s.created.id, {
      languageKey: 'javascript',
      sourceCode: 'function twoSum() {}',
      customArgs: [[1, 5], 6],
    });
    expect(custom.tests).toEqual([
      expect.objectContaining({
        kind: 'CUSTOM',
        position: null,
        status: 'COMPLETED',
        actual: [0, 1],
      }),
    ]);
    await expect(
      code.mentorRun(s.mentor, s.created.id, {
        languageKey: 'javascript',
        sourceCode: 'x',
        customArgs: ['not an array', 6],
      }),
    ).rejects.toMatchObject({ status: 422, response: { code: 'CODE_CUSTOM_INPUT_INVALID' } });
    await expect(
      code.mentorRun(s.student, s.created.id, { languageKey: 'javascript', sourceCode: 'x' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await db.query('SELECT count(*)::int AS n FROM code_runs')).toEqual(before);
  });

  it('any edit after validation requires validating again', async () => {
    const s = await draft();
    const authored = await author(s);
    executor.answer = twoSum;
    await code.validate(s.mentor, s.created.id, authored.assignment.revision);
    const edited = await code.upsertTest(s.mentor, s.created.id, 2, {
      expectedRevision: authored.assignment.revision,
      visibility: 'HIDDEN',
      inputArgs: [[3, 3], 6],
      expected: [0, 1],
    });
    expect(edited.publishBlockers).toEqual(['CODE_REFERENCE_NOT_VALIDATED']);
  });

  it('rejects mistyped tests, signature changes that break tests and stale revisions', async () => {
    const s = await draft();
    const authored = await author(s);
    await expect(
      code.upsertTest(s.mentor, s.created.id, 3, {
        expectedRevision: authored.assignment.revision,
        visibility: 'HIDDEN',
        inputArgs: [['2', 7], 9],
        expected: [0, 1],
      }),
    ).rejects.toMatchObject({ response: { code: 'CODE_TEST_TYPE_MISMATCH' } });
    await expect(
      code.upsertProblem(s.mentor, s.created.id, {
        expectedRevision: authored.assignment.revision,
        statementMd: 'x',
        signature: {
          functionName: 'twoSum',
          params: [{ name: 's', type: 'string' }],
          returnType: 'int',
        },
        compareMode: 'EXACT',
        scoringMode: 'PER_TEST',
        cpuTimeLimitMs: 1000,
        memoryLimitMb: 128,
      }),
    ).rejects.toMatchObject({ response: { code: 'CODE_TEST_TYPE_MISMATCH' } });
    await expect(
      code.upsertTest(s.mentor, s.created.id, 3, {
        expectedRevision: 1,
        visibility: 'SAMPLE',
        inputArgs: [[1, 2], 3],
        expected: [0, 1],
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      code.upsertTest(s.mentor, s.created.id, 2, {
        expectedRevision: authored.assignment.revision,
        visibility: 'HIDDEN',
        inputArgs: [[1, 2], 3],
        expected: [0, 1],
        explanationMd: 'leaks the answer',
      }),
    ).rejects.toMatchObject({ response: { code: 'CODE_TEST_EXPLANATION_SAMPLE_ONLY' } });
  });

  it('maps runner saturation to 429 without touching validation state', async () => {
    const s = await draft();
    const authored = await author(s);
    executor.busy = true;
    try {
      await expect(
        code.validate(s.mentor, s.created.id, authored.assignment.revision),
      ).rejects.toMatchObject({
        status: 429,
        response: { code: 'CODE_RUNNER_BUSY' },
      });
    } finally {
      executor.busy = false;
    }
    expect((await code.get(s.mentor, s.created.id)).validatedRevision).toBeNull();
  });

  it('extends a published deadline and attempts only forward, and hides authoring from students', async () => {
    const s = await draft();
    const authored = await author(s);
    executor.answer = twoSum;
    await code.validate(s.mentor, s.created.id, authored.assignment.revision);
    const published = await assignments.publish(
      s.mentor,
      s.created.id,
      authored.assignment.revision,
    );
    await expect(
      code.extend(s.mentor, s.created.id, {
        expectedRevision: published.revision,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        reason: 'earlier',
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_ASSIGNMENT_DEADLINE' } });
    await expect(
      code.extend(s.mentor, s.created.id, {
        expectedRevision: published.revision,
        maxAttempts: 5,
        reason: 'less',
      }),
    ).rejects.toMatchObject({ response: { code: 'CODE_ATTEMPTS_DECREASE_FORBIDDEN' } });
    const extended = await code.extend(s.mentor, s.created.id, {
      expectedRevision: published.revision,
      dueAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      maxAttempts: 20,
      reason: 'Lớp cần thêm thời gian',
    });
    expect(extended).toMatchObject({ maxAttempts: 20, revision: published.revision + 1 });
    await expect(code.get(s.student, s.created.id)).rejects.toMatchObject({ status: 404 });
  });
  it('generates expected outputs from the reference, saves the table in one revision and validates', async () => {
    const s = await draft();
    const authored = await author(s);
    const inputs = [
      [[2, 7, 11, 15], 9],
      [[3, 2, 4], 6],
      [[1, 5], 6],
    ];
    executor.answer = twoSum;
    const generated = await code.generateOutputs(s.mentor, s.created.id, {
      languageKey: 'javascript',
      sourceCode: 'function twoSum(nums, target) { return []; }',
      inputs,
    });
    expect(generated.compileStatus).toBe('OK');
    expect(generated.outputs.map((o) => [o.status, o.expected])).toEqual([
      ['OK', [0, 1]],
      ['OK', [1, 2]],
      ['OK', [0, 1]],
    ]);
    expect(executor.requests.at(-1)?.priority).toBe('interactive');
    expect(executor.requests.at(-1)?.tests.map((t) => t.id)).toEqual(['g1', 'g2', 'g3']);
    // Preview only: nothing stored, revision unchanged.
    expect((await code.get(s.mentor, s.created.id)).assignment.revision).toBe(
      authored.assignment.revision,
    );

    executor.answer = () => 'not an int[]';
    const invalid = await code.generateOutputs(s.mentor, s.created.id, {
      languageKey: 'javascript',
      sourceCode: 'x',
      inputs: [[[1, 2], 3]],
    });
    expect(invalid.outputs[0]).toMatchObject({ status: 'INVALID_RETURN', expected: null });
    await expect(
      code.generateOutputs(s.mentor, s.created.id, {
        languageKey: 'javascript',
        sourceCode: 'x',
        inputs: [
          [[1, 2], 3],
          [['a'], 1],
        ],
      }),
    ).rejects.toMatchObject({
      response: { code: 'CODE_TEST_TYPE_MISMATCH', details: [{ position: 2 }] },
    });

    executor.answer = twoSum;
    const saved = await code.replaceTests(s.mentor, s.created.id, {
      expectedRevision: authored.assignment.revision,
      tests: generated.outputs.map((o, index) => ({
        visibility: index === 0 ? ('SAMPLE' as const) : ('HIDDEN' as const),
        inputArgs: inputs[index] ?? [],
        expected: o.expected,
      })),
    });
    expect(saved.tests.map((t) => [t.position, t.visibility])).toEqual([
      [1, 'SAMPLE'],
      [2, 'HIDDEN'],
      [3, 'HIDDEN'],
    ]);
    expect(saved.assignment.revision).toBe(authored.assignment.revision + 1);
    await expect(
      code.replaceTests(s.mentor, s.created.id, {
        expectedRevision: saved.assignment.revision,
        tests: [
          { visibility: 'SAMPLE', inputArgs: [[1, 2], 3], expected: [0, 1] },
          { visibility: 'HIDDEN', inputArgs: [[1, 2], 3], expected: 'x' },
        ],
      }),
    ).rejects.toMatchObject({
      response: { code: 'CODE_TEST_TYPE_MISMATCH', details: [{ position: 2 }] },
    });
    // Java is enabled but only the JavaScript reference exists: one reference is enough (D11).
    const ok = await code.validate(s.mentor, s.created.id, saved.assignment.revision);
    expect(ok.validated).toBe(true);
    expect((await code.get(s.mentor, s.created.id)).publishBlockers).toEqual([]);
  });

  it('lists own CODE problems and imports one into another draft without copying validation', async () => {
    const source = await draft();
    await author(source);
    const library = await code.library(source.mentor, { page: 1, pageSize: 20, q: 'Two' });
    const item = library.items.find((i) => i.assignmentId === source.created.id);
    expect(item).toMatchObject({ testCount: 2, languages: ['java21', 'javascript'] });
    expect(library.total).toBeGreaterThanOrEqual(1);
    expect(
      (await code.library(source.mentor, { page: 1, pageSize: 20, q: '100%_none' })).items,
    ).toEqual([]);

    const target = await assignments.create(source.mentor, source.created.sessionId, {
      purpose: 'HOMEWORK',
      type: 'CODE',
      title: 'Copy',
      maxScore: '10.00',
      dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    const imported = await code.importProblem(source.mentor, target.id, {
      expectedRevision: target.revision,
      sourceAssignmentId: source.created.id,
    });
    expect(imported.problem?.signature.functionName).toBe('twoSum');
    expect(imported.languages.map((l) => l.languageKey)).toEqual(['javascript', 'java21']);
    expect(imported.tests.map((t) => [t.position, t.visibility, t.weight])).toEqual([
      [1, 'SAMPLE', 1],
      [2, 'HIDDEN', 3],
    ]);
    expect(imported.references.map((r) => [r.languageKey, r.validatedAt])).toEqual([
      ['javascript', null],
    ]);
    expect(imported.validatedRevision).toBeNull();
    expect(imported.publishBlockers).toEqual(['CODE_REFERENCE_NOT_VALIDATED']);
    await expect(
      code.importProblem(source.mentor, target.id, {
        expectedRevision: imported.assignment.revision,
        sourceAssignmentId: target.id,
      }),
    ).rejects.toMatchObject({ response: { code: 'CODE_IMPORT_SELF' } });

    const other = await draft();
    await expect(
      code.importProblem(other.mentor, other.created.id, {
        expectedRevision: other.created.revision,
        sourceAssignmentId: source.created.id,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await code.library(other.mentor, { page: 1, pageSize: 20 })).items.some(
        (i) => i.assignmentId === source.created.id,
      ),
    ).toBe(false);
  });
});
