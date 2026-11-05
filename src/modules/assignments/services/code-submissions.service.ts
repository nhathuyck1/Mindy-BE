import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { UserRole } from '../../users/user-role.enum.js';
import type {
  AssignmentRow,
  CodeLanguageRow,
  CodeProblemRow,
  CodeSubmissionRow,
  CodeSubmissionTestRow,
  CodeTestRow,
} from '../assignment.types.js';
import { buildSource, stdinFor } from '../domain/code-driver.js';
import { type CompareOptions, judgeTest, runnerLimits } from '../domain/code-grading.js';
import { runnerTestId, runStatus } from '../domain/code-judge.js';
import {
  type CodeLanguageKey,
  type CodeSignature,
  describeArgs,
  matchesType,
  parseSignature,
} from '../domain/code-signature.js';
import type { CodeRunInput, CodeSubmitInput, SaveCodeDraftInput } from '../dtos/code-input.dto.js';
import type {
  CodeDraftDto,
  CodeRunResultDto,
  CodeRunTestDto,
  StudentCodeAssignmentDto,
  StudentCodeSubmissionDto,
  StudentCodeSubmissionListDto,
} from '../dtos/code-student.dto.js';
import { AssignmentException } from '../exceptions/assignment.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentAccessService } from './assignment-access.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentsService } from './assignments.service.js';
import {
  CODE_EXECUTOR,
  type CodeExecutionReport,
  type CodeExecutor,
  CodeRunnerBusyError,
  CodeRunnerUnavailableError,
} from './code-executor.service.js';

const MAX_SOURCE_BYTES = 65536;
const POLL_MS = 1500;
const STDERR_CHARS = 2000;
const CONSOLE_CHARS = 4096;
/** Attempt rule (owner 02/11/2026): mentor-voided submissions still count; compile errors and system failures do not. */
const COUNTED = "counts_as_attempt AND status <> 'FAILED'";

interface StudentContext {
  readonly a: AssignmentRow;
  readonly enrollmentId: string;
  readonly problem: CodeProblemRow;
  readonly signature: CodeSignature;
  readonly languages: readonly (CodeLanguageRow & { starter_code: string })[];
  readonly now: Date;
}

export function submissionDto(
  row: CodeSubmissionRow,
  detail?: { tests: CodeSubmissionTestRow[] },
): StudentCodeSubmissionDto {
  const pending = row.status === 'QUEUED' || row.status === 'RUNNING';
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    attemptNumber: row.attempt_number,
    languageKey: row.language_key,
    runtimeVersion: row.runtime_version,
    status: row.status,
    verdict: row.verdict,
    countsAsAttempt: row.counts_as_attempt,
    passedCount: row.passed_count,
    totalCount: row.total_count,
    score: row.score,
    maxScore: row.max_score,
    compileOutput: row.compile_output,
    maxTimeMs: row.max_time_ms,
    maxMemoryKb: row.max_memory_kb,
    submittedAt: row.submitted_at.toISOString(),
    judgedAt: row.judged_at?.toISOString() ?? null,
    voidedReason: row.voided_reason,
    retryAfterMs: pending ? POLL_MS : null,
    ...(detail
      ? {
          sourceCode: row.source_code,
          tests: detail.tests.map((t) =>
            t.visibility === 'SAMPLE'
              ? {
                  position: t.position,
                  visibility: t.visibility,
                  status: t.status,
                  timeMs: t.time_ms ?? 0,
                  memoryKb: t.memory_kb ?? 0,
                  inputArgs: t.input_args ?? [],
                  expected: t.expected,
                  actual: t.actual,
                  console: t.console_excerpt ?? '',
                }
              : {
                  position: t.position,
                  visibility: t.visibility,
                  status: t.status,
                  timeMs: t.time_ms ?? 0,
                  memoryKb: t.memory_kb ?? 0,
                },
          ),
        }
      : {}),
  };
}

/** Student side of CODE assignments (Phase 7 slice C3). Runner calls never run inside a transaction. */
@Injectable()
export class CodeSubmissionsService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly assignments: AssignmentsService,
    private readonly access: AssignmentAccessService,
    @Inject(CODE_EXECUTOR) private readonly executor: CodeExecutor,
  ) {}

  async view(actor: AuthenticatedUser, id: string): Promise<StudentCodeAssignmentDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const c = await this.context(m, actor, id);
      const samples: CodeTestRow[] = await m.query(
        "SELECT * FROM code_test_cases WHERE assignment_id=$1 AND visibility='SAMPLE' ORDER BY position",
        [id],
      );
      const hidden: { n: number }[] = await m.query(
        "SELECT count(*)::int AS n FROM code_test_cases WHERE assignment_id=$1 AND visibility='HIDDEN'",
        [id],
      );
      const used = await this.attemptsUsed(m, id, actor.userId);
      const best: { submission_id: string; score: string }[] = await m.query(
        'SELECT submission_id,score FROM code_assignment_scores WHERE assignment_id=$1 AND student_id=$2',
        [id, actor.userId],
      );
      const inflight: { id: string }[] = await m.query(
        "SELECT id FROM code_submissions WHERE assignment_id=$1 AND student_id=$2 AND status IN ('QUEUED','RUNNING')",
        [id, actor.userId],
      );
      const dueAt = c.a.due_at;
      if (!dueAt) throw new Error('CODE_DUE_AT_INVARIANT');
      const deadlinePassed = c.now >= dueAt;
      const remaining = Math.max(0, c.a.max_attempts - used);
      return {
        assignmentId: c.a.id,
        sessionId: c.a.session_id,
        title: c.a.title,
        description: c.a.description,
        purpose: c.a.purpose,
        status: c.a.status,
        maxScore: c.a.max_score,
        dueAt: dueAt.toISOString(),
        serverNow: c.now.toISOString(),
        deadlinePassed,
        maxAttempts: c.a.max_attempts,
        attemptsUsed: used,
        attemptsRemaining: remaining,
        bestScore: best[0]?.score ?? null,
        bestSubmissionId: best[0]?.submission_id ?? null,
        inFlightSubmissionId: inflight[0]?.id ?? null,
        canSubmit:
          !deadlinePassed && remaining > 0 && !inflight.length && c.a.status === 'PUBLISHED',
        problem: {
          statementMd: c.problem.statement_md,
          constraintsMd: c.problem.constraints_md,
          difficulty: c.problem.difficulty,
          signature: c.signature,
          compareMode: c.problem.compare_mode,
          scoringMode: c.problem.scoring_mode,
          cpuTimeLimitMs: c.problem.cpu_time_limit_ms,
          memoryLimitMb: c.problem.memory_limit_mb,
        },
        languages: c.languages.map((l) => ({
          key: l.key,
          displayName: l.display_name,
          runtimeVersion: l.runtime_version,
          editorMode: l.editor_mode,
          starterCode: l.starter_code,
        })),
        samples: samples.map((t) => ({
          position: t.position,
          inputArgs: t.input_args,
          expected: t.expected,
          display: describeArgs(c.signature, t.input_args),
          explanationMd: t.explanation_md,
        })),
        hiddenTestCount: hidden[0]?.n ?? 0,
      };
    });
  }

  async draft(
    actor: AuthenticatedUser,
    id: string,
    language: CodeLanguageKey,
  ): Promise<CodeDraftDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const c = await this.context(m, actor, id);
      const lang = this.language(c, language);
      const rows: { source_code: string; version: number; updated_at: Date }[] = await m.query(
        'SELECT source_code,version,updated_at FROM code_drafts WHERE assignment_id=$1 AND student_id=$2 AND language_key=$3',
        [id, actor.userId, language],
      );
      const row = rows[0];
      return row
        ? {
            languageKey: language,
            sourceCode: row.source_code,
            version: row.version,
            updatedAt: row.updated_at.toISOString(),
          }
        : { languageKey: language, sourceCode: lang.starter_code, version: 0, updatedAt: null };
    });
  }

  async saveDraft(
    actor: AuthenticatedUser,
    id: string,
    language: CodeLanguageKey,
    input: SaveCodeDraftInput,
  ): Promise<CodeDraftDto> {
    if (Buffer.byteLength(input.sourceCode, 'utf8') > MAX_SOURCE_BYTES)
      throw new AssignmentException(422, 'CODE_SOURCE_TOO_LARGE');
    return this.db.transaction(async (m) => {
      const c = await this.context(m, actor, id, true);
      if (c.a.status !== 'PUBLISHED') throw new AssignmentException(409, 'ASSIGNMENT_CLOSED');
      this.language(c, language);
      const rows: { version: number; updated_at: Date }[] =
        input.expectedVersion === 0
          ? await m.query(
              `INSERT INTO code_drafts(assignment_id,student_id,language_key,source_code) VALUES($1,$2,$3,$4)
              ON CONFLICT DO NOTHING RETURNING version,updated_at`,
              [id, actor.userId, language, input.sourceCode],
            )
          : // PostgreSQL UPDATE returns [rows, affectedCount], unlike INSERT.
            (
              await m.query<[{ version: number; updated_at: Date }[], number]>(
                `UPDATE code_drafts SET source_code=$5,version=version+1,updated_at=clock_timestamp()
              WHERE assignment_id=$1 AND student_id=$2 AND language_key=$3 AND version=$4 RETURNING version,updated_at`,
                [id, actor.userId, language, input.expectedVersion, input.sourceCode],
              )
            )[0];
      const row = rows[0];
      if (!row) throw new AssignmentException(409, 'CODE_DRAFT_VERSION_CONFLICT');
      return {
        languageKey: language,
        sourceCode: input.sourceCode,
        version: row.version,
        updatedAt: row.updated_at.toISOString(),
      };
    });
  }

  /** "Chạy thử": sample tests or one custom input. Not stored, never graded, rate limited. */
  async run(actor: AuthenticatedUser, id: string, input: CodeRunInput): Promise<CodeRunResultDto> {
    if (Buffer.byteLength(input.sourceCode, 'utf8') > MAX_SOURCE_BYTES)
      throw new AssignmentException(422, 'CODE_SOURCE_TOO_LARGE');
    const plan = await this.db.transaction(async (m) => {
      const c = await this.context(m, actor, id, true);
      this.open(c);
      const lang = this.language(c, input.languageKey);
      if (input.customArgs !== undefined) this.assertArgs(c.signature, input.customArgs);
      const samples: CodeTestRow[] =
        input.customArgs === undefined
          ? await m.query(
              "SELECT * FROM code_test_cases WHERE assignment_id=$1 AND visibility='SAMPLE' ORDER BY position",
              [id],
            )
          : [];
      await this.rateLimit(m, actor.userId);
      const runs: { id: string }[] = await m.query(
        "INSERT INTO code_runs(student_id,assignment_id,language_key,kind,outcome) VALUES($1,$2,$3,$4,'STARTED') RETURNING id",
        [
          actor.userId,
          id,
          input.languageKey,
          input.customArgs === undefined ? 'SAMPLES' : 'CUSTOM',
        ],
      );
      return { c, lang, samples, runId: runs[0]?.id ?? '' };
    });

    const nonce = randomBytes(12).toString('hex');
    const cases =
      input.customArgs === undefined
        ? plan.samples.map((t) => ({
            kind: 'SAMPLE' as const,
            id: runnerTestId(t.position),
            position: t.position,
            args: t.input_args,
            expected: t.expected,
          }))
        : [
            {
              kind: 'CUSTOM' as const,
              id: 'c1',
              position: null,
              args: input.customArgs,
              expected: undefined,
            },
          ];
    const started = Date.now();
    let report: CodeExecutionReport;
    try {
      report = await this.executor.execute({
        executionId: randomUUID(),
        language: input.languageKey,
        priority: 'interactive',
        source: buildSource(input.languageKey, plan.c.signature, input.sourceCode, nonce),
        limits: runnerLimits({
          cpuTimeLimitMs: plan.c.problem.cpu_time_limit_ms,
          memoryLimitMb: plan.c.problem.memory_limit_mb,
          timeMultiplier: Number(plan.lang.time_multiplier),
        }),
        tests: cases.map((t) => ({ id: t.id, stdin: stdinFor(t.args) })),
      });
    } catch (error) {
      await this.finishRun(plan.runId, 'RUNNER_ERROR', Date.now() - started);
      if (error instanceof CodeRunnerBusyError)
        throw new AssignmentException(429, 'CODE_RUNNER_BUSY', {
          retryAfterSeconds: error.retryAfterSeconds,
        });
      if (error instanceof CodeRunnerUnavailableError)
        throw new AssignmentException(503, 'CODE_RUNNER_UNAVAILABLE');
      throw error;
    }
    await this.finishRun(
      plan.runId,
      report.compile.status === 'ERROR' ? 'COMPILE_ERROR' : 'COMPLETED',
      Date.now() - started,
    );
    const compiled = report.compile.status === 'OK' || report.compile.status === 'SKIPPED';
    const compare = this.compare(plan.c.problem);
    const tests: CodeRunTestDto[] = compiled
      ? cases.map((t) => {
          const r = report.tests.find((x) => x.id === t.id);
          if (!r) throw new AssignmentException(503, 'CODE_RUNNER_UNAVAILABLE');
          const outcome = judgeTest(r, t.expected, nonce, compare);
          return {
            kind: t.kind,
            position: t.position,
            display: describeArgs(plan.c.signature, t.args),
            ...(t.kind === 'SAMPLE' ? { expected: t.expected } : {}),
            actual: outcome.hasResult ? outcome.actual : null,
            status: runStatus(t.kind, outcome.verdict, outcome.hasResult),
            console: outcome.console.slice(0, CONSOLE_CHARS),
            stderr: r.stderr.slice(0, STDERR_CHARS),
            timeMs: r.timeMs,
            memoryKb: r.memoryKb,
          };
        })
      : [];
    return {
      compileStatus: compiled ? 'OK' : report.compile.status,
      compileOutput: report.compile.output.slice(0, 8192),
      runtimeVersion: report.runtimeVersion,
      tests,
    };
  }

  /** "Nộp bài": queue a durable judge job. Retrying the same Idempotency-Key returns the same submission. */
  async submit(
    actor: AuthenticatedUser,
    id: string,
    input: CodeSubmitInput,
    key?: string,
  ): Promise<{ created: boolean; submission: StudentCodeSubmissionDto }> {
    this.student(actor);
    if (!key || !isUUID(key, '4')) throw new AssignmentException(422, 'IDEMPOTENCY_KEY_REQUIRED');
    if (Buffer.byteLength(input.sourceCode, 'utf8') > MAX_SOURCE_BYTES)
      throw new AssignmentException(422, 'CODE_SOURCE_TOO_LARGE');
    const sha = createHash('sha256').update(input.sourceCode, 'utf8').digest('hex');
    const fingerprint = { languageKey: input.languageKey, sha };
    const requestHash = createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
    const route = `code-submit:${id}`;
    return this.db.transaction(async (m) => {
      const c = await this.context(m, actor, id, true);
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `assignment:${actor.userId}:${route}:${key.toLowerCase()}`,
      ]);
      const receipts: { request_hash: string; resource_id: string }[] = await m.query(
        "SELECT payload_hash AS request_hash,outcome->>'resourceId' AS resource_id FROM mutation_receipts WHERE namespace='assignment_quiz' AND actor_id=$1 AND route=$2 AND key=$3",
        [actor.userId, route, key],
      );
      const receipt = receipts[0];
      if (receipt) {
        if (receipt.request_hash !== requestHash)
          throw new AssignmentException(409, 'IDEMPOTENCY_KEY_REUSED');
        return {
          created: false,
          submission: submissionDto(await this.own(m, actor, receipt.resource_id)),
        };
      }
      this.open(c);
      this.language(c, input.languageKey);
      // Serialises attempt numbering and limits per student and assignment.
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `code-attempt:${id}:${actor.userId}`,
      ]);
      const inflight: { id: string }[] = await m.query(
        "SELECT id FROM code_submissions WHERE assignment_id=$1 AND student_id=$2 AND status IN ('QUEUED','RUNNING')",
        [id, actor.userId],
      );
      if (inflight[0])
        throw new AssignmentException(409, 'CODE_SUBMISSION_IN_FLIGHT', {
          submissionId: inflight[0].id,
        });
      if ((await this.attemptsUsed(m, id, actor.userId)) >= c.a.max_attempts)
        throw new AssignmentException(409, 'CODE_ATTEMPTS_EXHAUSTED');
      const rows: CodeSubmissionRow[] = await m.query(
        `INSERT INTO code_submissions(assignment_id,student_id,enrollment_id,attempt_number,assignment_revision,language_key,source_code,source_sha256,max_score)
        VALUES($1,$2,$3,(SELECT coalesce(max(attempt_number),0)+1 FROM code_submissions WHERE assignment_id=$1 AND student_id=$2),$4,$5,$6,$7,$8)
        RETURNING *`,
        [
          id,
          actor.userId,
          c.enrollmentId,
          c.a.revision,
          input.languageKey,
          input.sourceCode,
          sha,
          c.a.max_score,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error('CODE_SUBMISSION_INSERT_INVARIANT');
      await m.query('INSERT INTO code_judge_jobs(submission_id) VALUES($1)', [row.id]);
      await m.query(
        "INSERT INTO mutation_receipts(namespace,actor_id,route,key,payload_hash,outcome) VALUES('assignment_quiz',$1,$2,$3,$4,jsonb_build_object('resourceId',$5::uuid))",
        [actor.userId, route, key, requestHash, row.id],
      );
      return { created: true, submission: submissionDto(row) };
    });
  }

  /** Own history stays readable after archive or enrollment end (ownership + active account only). */
  async list(actor: AuthenticatedUser, id: string): Promise<StudentCodeSubmissionListDto> {
    this.student(actor);
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await this.access.actor(m, actor);
      const rows: CodeSubmissionRow[] = await m.query(
        'SELECT * FROM code_submissions WHERE assignment_id=$1 AND student_id=$2 ORDER BY attempt_number DESC',
        [id, actor.userId],
      );
      return { items: rows.map((r) => submissionDto(r)) };
    });
  }

  async detail(actor: AuthenticatedUser, submissionId: string): Promise<StudentCodeSubmissionDto> {
    this.student(actor);
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await this.access.actor(m, actor);
      const row = await this.own(m, actor, submissionId);
      const tests: CodeSubmissionTestRow[] = await m.query(
        `SELECT st.test_case_id,st.position,st.visibility,st.status,st.time_ms,st.memory_kb,st.actual,st.console_excerpt,
          CASE WHEN st.visibility='SAMPLE' THEN tc.input_args END AS input_args,
          CASE WHEN st.visibility='SAMPLE' THEN tc.expected END AS expected
        FROM code_submission_tests st JOIN code_test_cases tc ON tc.id=st.test_case_id
        WHERE st.submission_id=$1 ORDER BY st.position`,
        [row.id],
      );
      return submissionDto(row, { tests });
    });
  }

  private async context(
    m: EntityManager,
    actor: AuthenticatedUser,
    id: string,
    write = false,
  ): Promise<StudentContext> {
    this.student(actor);
    const a = await this.assignments.authorized(m, actor, id, write);
    if (a.type !== 'CODE') throw new AssignmentException(422, 'ASSIGNMENT_TYPE_MISMATCH');
    const enrollmentId = await this.access.session(m, actor, a.session_id, write);
    if (!enrollmentId) throw new AssignmentException(404, 'ASSIGNMENT_NOT_FOUND');
    const problems: CodeProblemRow[] = await m.query(
      'SELECT * FROM code_problems WHERE assignment_id=$1',
      [id],
    );
    const problem = problems[0];
    if (!problem) throw new Error('CODE_PROBLEM_INVARIANT');
    const languages: (CodeLanguageRow & { starter_code: string })[] = await m.query(
      `SELECT l.*,pl.starter_code FROM code_problem_languages pl JOIN code_languages l ON l.key=pl.language_key
      WHERE pl.assignment_id=$1 AND l.enabled ORDER BY l.key DESC`,
      [id],
    );
    return {
      a,
      enrollmentId,
      problem,
      signature: parseSignature(problem.signature),
      languages,
      now: await this.assignments.now(m),
    };
  }

  private open(c: StudentContext): void {
    if (c.a.status !== 'PUBLISHED') throw new AssignmentException(409, 'ASSIGNMENT_CLOSED');
    if (!c.a.due_at || c.now >= c.a.due_at)
      throw new AssignmentException(409, 'ASSIGNMENT_DEADLINE_PASSED');
  }

  private language(
    c: StudentContext,
    key: CodeLanguageKey,
  ): CodeLanguageRow & { starter_code: string } {
    const lang = c.languages.find((l) => l.key === key);
    if (!lang) throw new AssignmentException(422, 'CODE_LANGUAGE_NOT_ALLOWED');
    return lang;
  }

  private assertArgs(signature: CodeSignature, args: unknown[]): void {
    if (
      args.length !== signature.params.length ||
      signature.params.some((p, i) => !matchesType(p.type, args[i])) ||
      Buffer.byteLength(JSON.stringify(args), 'utf8') > 65536
    )
      throw new AssignmentException(422, 'CODE_CUSTOM_INPUT_INVALID');
  }

  private compare(problem: CodeProblemRow): CompareOptions {
    return {
      mode: problem.compare_mode,
      ...(problem.float_epsilon === null ? {} : { epsilon: Number(problem.float_epsilon) }),
    };
  }

  private async rateLimit(m: EntityManager, studentId: string): Promise<void> {
    await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `code-run:${studentId}`,
    ]);
    const rows: { minute: number; day: number; oldest_minute: Date | null }[] = await m.query(
      `SELECT count(*) FILTER (WHERE created_at > clock_timestamp() - interval '1 minute')::int AS minute,
        count(*)::int AS day,
        min(created_at) FILTER (WHERE created_at > clock_timestamp() - interval '1 minute') AS oldest_minute
      FROM code_runs WHERE student_id=$1 AND created_at > clock_timestamp() - interval '1 day'`,
      [studentId],
    );
    const r = rows[0];
    const perMinute = this.config.getOrThrow<number>('CODE_RUN_PER_MINUTE');
    const perDay = this.config.getOrThrow<number>('CODE_RUN_PER_DAY');
    if (r && r.day >= perDay)
      throw new AssignmentException(429, 'CODE_RUN_RATE_LIMITED', { scope: 'DAY' });
    if (r && r.minute >= perMinute) {
      const waitMs = r.oldest_minute ? r.oldest_minute.getTime() + 60_000 - Date.now() : 60_000;
      throw new AssignmentException(429, 'CODE_RUN_RATE_LIMITED', {
        scope: 'MINUTE',
        retryAfterSeconds: Math.min(60, Math.max(1, Math.ceil(waitMs / 1000))),
      });
    }
  }

  private async finishRun(runId: string, outcome: string, durationMs: number): Promise<void> {
    try {
      await this.db.query('UPDATE code_runs SET outcome=$2,duration_ms=$3 WHERE id=$1', [
        runId,
        outcome,
        Math.max(0, Math.round(durationMs)),
      ]);
    } catch {
      // Audit metadata only; the run result is still returned.
    }
  }

  private async attemptsUsed(m: EntityManager, id: string, studentId: string): Promise<number> {
    const rows: { n: number }[] = await m.query(
      `SELECT count(*)::int AS n FROM code_submissions WHERE assignment_id=$1 AND student_id=$2 AND ${COUNTED}`,
      [id, studentId],
    );
    return rows[0]?.n ?? 0;
  }

  private async own(
    m: EntityManager,
    actor: AuthenticatedUser,
    submissionId: string,
  ): Promise<CodeSubmissionRow> {
    const rows: CodeSubmissionRow[] = await m.query(
      'SELECT * FROM code_submissions WHERE id=$1 AND student_id=$2',
      [submissionId, actor.userId],
    );
    const row = rows[0];
    if (!row) throw new AssignmentException(404, 'CODE_SUBMISSION_NOT_FOUND');
    return row;
  }

  private student(actor: AuthenticatedUser): void {
    if (actor.role !== UserRole.STUDENT)
      throw new AssignmentException(403, 'SUBMISSION_ACCESS_DENIED');
  }
}
