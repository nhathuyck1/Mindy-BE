import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource } from 'typeorm';
import type { CodeProblemRow, CodeSubmissionRow, CodeTestRow } from '../assignment.types.js';
import { buildSource, stdinFor } from '../domain/code-driver.js';
import { runnerLimits } from '../domain/code-grading.js';
import {
  gradeSubmission,
  type JudgeOutcome,
  judgeRetryDelaySeconds,
  MAX_JUDGE_FAILURES,
  runnerTestId,
} from '../domain/code-judge.js';
import { parseSignature } from '../domain/code-signature.js';
import {
  CODE_EXECUTOR,
  type CodeExecutionReport,
  type CodeExecutor,
  CodeRunnerBusyError,
} from './code-executor.service.js';

/** Realtime hint to the student; payload carries ids/status only (clients refetch the detail). */
export interface CodeSubmissionNotifier {
  submissionUpdated(
    studentId: string,
    event: { submissionId: string; assignmentId: string; status: string },
  ): Promise<void>;
}
export const CODE_SUBMISSION_NOTIFIER = Symbol('CODE_SUBMISSION_NOTIFIER');

export interface JudgeClaim {
  readonly submissionId: string;
  /** Lease token: exact locked_until text (microseconds) written at claim time. */
  readonly lease: string;
}

type Finalization =
  | { readonly kind: 'GRADE'; readonly outcome: JudgeOutcome; readonly runtimeVersion: string }
  | { readonly kind: 'VOID'; readonly reason: string };

/**
 * Durable judging of queued CODE submissions (Phase 7 C3). One job = one runner execution outside any
 * transaction; the result is committed only while this worker still holds the lease.
 */
@Injectable()
export class CodeJudgeService {
  private readonly logger = new Logger(CodeJudgeService.name);

  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    @Inject(CODE_EXECUTOR) private readonly executor: CodeExecutor,
    @Inject(CODE_SUBMISSION_NOTIFIER) private readonly notifier: CodeSubmissionNotifier,
  ) {}

  private leaseSeconds(): number {
    return Math.ceil(this.config.getOrThrow<number>('CODE_RUNNER_TIMEOUT_MS') / 1000) + 60;
  }

  async claim(): Promise<JudgeClaim | null> {
    return this.db.transaction(async (m) => {
      // TypeORM returns [rows, affectedCount] for PostgreSQL UPDATE queries.
      const [rows]: [{ submission_id: string; lease: string }[], number] = await m.query(
        `UPDATE code_judge_jobs SET locked_until=clock_timestamp() + make_interval(secs => $1), updated_at=clock_timestamp()
        WHERE submission_id = (
          SELECT submission_id FROM code_judge_jobs
          WHERE completed_at IS NULL AND run_after <= clock_timestamp()
            AND (locked_until IS NULL OR locked_until < clock_timestamp())
          ORDER BY run_after, submission_id FOR UPDATE SKIP LOCKED LIMIT 1)
        RETURNING submission_id, locked_until::text AS lease`,
        [this.leaseSeconds()],
      );
      const job = rows[0];
      if (!job) return null;
      const [moved]: [{ id: string }[], number] = await m.query(
        "UPDATE code_submissions SET status='RUNNING',version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND status IN ('QUEUED','RUNNING') RETURNING id",
        [job.submission_id],
      );
      if (!moved.length) {
        // Voided or finalized elsewhere: the job has nothing left to do.
        await m.query(
          'UPDATE code_judge_jobs SET completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE submission_id=$1',
          [job.submission_id],
        );
        return null;
      }
      return { submissionId: job.submission_id, lease: job.lease };
    });
  }

  /** Processes one claimed job to completion or reschedule. Never throws for runner/infra problems. */
  async process(claim: JudgeClaim): Promise<void> {
    const plan = await this.db.transaction('REPEATABLE READ', async (m) => {
      const submissions: CodeSubmissionRow[] = await m.query(
        'SELECT * FROM code_submissions WHERE id=$1',
        [claim.submissionId],
      );
      const submission = submissions[0];
      if (!submission) throw new Error('CODE_SUBMISSION_INVARIANT');
      const problems: CodeProblemRow[] = await m.query(
        'SELECT * FROM code_problems WHERE assignment_id=$1',
        [submission.assignment_id],
      );
      const tests: CodeTestRow[] = await m.query(
        'SELECT * FROM code_test_cases WHERE assignment_id=$1 ORDER BY position',
        [submission.assignment_id],
      );
      const multiplier: { time_multiplier: string }[] = await m.query(
        'SELECT time_multiplier FROM code_languages WHERE key=$1',
        [submission.language_key],
      );
      const problem = problems[0];
      if (!problem || !tests.length) throw new Error('CODE_PROBLEM_INVARIANT');
      return {
        submission,
        problem,
        tests,
        multiplier: Number(multiplier[0]?.time_multiplier ?? 1),
      };
    });

    const nonce = randomBytes(12).toString('hex');
    const signature = parseSignature(plan.problem.signature);
    let report: CodeExecutionReport;
    try {
      report = await this.executor.execute({
        executionId: randomUUID(),
        language: plan.submission.language_key,
        priority: 'batch',
        source: buildSource(
          plan.submission.language_key,
          signature,
          plan.submission.source_code,
          nonce,
        ),
        limits: runnerLimits({
          cpuTimeLimitMs: plan.problem.cpu_time_limit_ms,
          memoryLimitMb: plan.problem.memory_limit_mb,
          timeMultiplier: plan.multiplier,
        }),
        tests: plan.tests.map((t) => ({
          id: runnerTestId(t.position),
          stdin: stdinFor(t.input_args),
        })),
      });
    } catch (error) {
      await this.reschedule(claim, error);
      return;
    }

    const outcome = gradeSubmission({
      report,
      tests: plan.tests.map((t) => ({
        id: t.id,
        position: t.position,
        visibility: t.visibility,
        weight: t.weight,
        expected: t.expected,
      })),
      nonce,
      compare: {
        mode: plan.problem.compare_mode,
        ...(plan.problem.float_epsilon === null
          ? {}
          : { epsilon: Number(plan.problem.float_epsilon) }),
      },
      scoringMode: plan.problem.scoring_mode,
      maxScore: plan.submission.max_score,
    });
    const status = await this.finalize(claim, {
      kind: 'GRADE',
      outcome,
      runtimeVersion: report.runtimeVersion,
    });
    if (status) await this.notify(plan.submission, status);
  }

  /** Commits a grade or void only if this worker still owns the lease. Returns the final status. */
  private async finalize(claim: JudgeClaim, result: Finalization): Promise<string | null> {
    return this.db.transaction(async (m) => {
      const jobs: { submission_id: string }[] = await m.query(
        'SELECT submission_id FROM code_judge_jobs WHERE submission_id=$1 AND locked_until=$2::timestamptz AND completed_at IS NULL FOR UPDATE',
        [claim.submissionId, claim.lease],
      );
      if (!jobs.length) return null; // lease lost: another worker owns (or finished) this job
      const rows: (CodeSubmissionRow & { assignment_status: string; enrollment_status: string })[] =
        await m.query(
          `SELECT s.*, a.status AS assignment_status, e.status AS enrollment_status
        FROM code_submissions s JOIN assignments a ON a.id=s.assignment_id JOIN enrollments e ON e.id=s.enrollment_id
        WHERE s.id=$1 FOR UPDATE OF s`,
          [claim.submissionId],
        );
      const s = rows[0];
      const complete = () =>
        m.query(
          'UPDATE code_judge_jobs SET completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE submission_id=$1',
          [claim.submissionId],
        );
      if (!s || s.status !== 'RUNNING') {
        await complete();
        return null;
      }
      // Deadline is not re-checked: the submission was accepted before it. Revision is not compared:
      // published content is frozen by trigger; only deadline/attempts may have been extended.
      const voidReason =
        result.kind === 'VOID'
          ? result.reason
          : s.assignment_status === 'ARCHIVED'
            ? 'ASSIGNMENT_ARCHIVED'
            : s.enrollment_status !== 'ACTIVE'
              ? 'ENROLLMENT_INACTIVE'
              : null;
      if (voidReason) {
        await m.query(
          "UPDATE code_submissions SET status='VOIDED',voided_reason=$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1",
          [s.id, voidReason],
        );
        await complete();
        return 'VOIDED';
      }
      if (result.kind !== 'GRADE') throw new Error('CODE_FINALIZE_INVARIANT');
      const o = result.outcome;
      if (o.kind === 'COMPILE_ERROR') {
        await m.query(
          `UPDATE code_submissions SET status='GRADED',verdict='COMPILE_ERROR',counts_as_attempt=false,score=0,passed_count=0,
            total_count=$2,compile_output=$3,runtime_version=$4,judged_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
          WHERE id=$1`,
          [s.id, o.total, o.compileOutput, result.runtimeVersion],
        );
      } else {
        for (const t of o.tests)
          await m.query(
            `INSERT INTO code_submission_tests(submission_id,test_case_id,position,visibility,weight,status,time_ms,memory_kb,actual,console_excerpt)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
            [
              s.id,
              t.testCaseId,
              t.position,
              t.visibility,
              t.weight,
              t.status,
              t.timeMs,
              t.memoryKb,
              t.visibility === 'SAMPLE' && t.actual !== null ? JSON.stringify(t.actual) : null,
              t.consoleExcerpt,
            ],
          );
        await m.query(
          `UPDATE code_submissions SET status='GRADED',verdict=$2,score=$3,passed_count=$4,total_count=$5,compile_output=$6,
            max_time_ms=$7,max_memory_kb=$8,runtime_version=$9,judged_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
          WHERE id=$1`,
          [
            s.id,
            o.verdict,
            o.score,
            o.passed,
            o.total,
            o.compileOutput || null,
            o.maxTimeMs,
            o.maxMemoryKb,
            result.runtimeVersion,
          ],
        );
      }
      await complete();
      return 'GRADED';
    });
  }

  /** Busy = back-pressure (no failure counted). Anything else = infrastructure failure with back-off. */
  private async reschedule(claim: JudgeClaim, error: unknown): Promise<void> {
    const busy = error instanceof CodeRunnerBusyError;
    const reason = busy
      ? 'CODE_RUNNER_BUSY'
      : error instanceof Error
        ? error.message.slice(0, 500)
        : 'UNKNOWN';
    const failed = await this.db.transaction(async (m) => {
      const jobs: { attempts: number }[] = await m.query(
        'SELECT attempts FROM code_judge_jobs WHERE submission_id=$1 AND locked_until=$2::timestamptz AND completed_at IS NULL FOR UPDATE',
        [claim.submissionId, claim.lease],
      );
      const job = jobs[0];
      if (!job) return false;
      const attempts = busy ? job.attempts : job.attempts + 1;
      if (!busy && attempts >= MAX_JUDGE_FAILURES) {
        await m.query(
          "UPDATE code_submissions SET status='FAILED',version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND status='RUNNING'",
          [claim.submissionId],
        );
        await m.query(
          'UPDATE code_judge_jobs SET attempts=$2,last_error=$3,completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE submission_id=$1',
          [claim.submissionId, attempts, reason],
        );
        return true;
      }
      const delay = busy
        ? (error as CodeRunnerBusyError).retryAfterSeconds
        : judgeRetryDelaySeconds(attempts);
      await m.query(
        "UPDATE code_submissions SET status='QUEUED',version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND status='RUNNING'",
        [claim.submissionId],
      );
      await m.query(
        `UPDATE code_judge_jobs SET attempts=$2,last_error=$3,locked_until=NULL,
          run_after=clock_timestamp() + make_interval(secs => $4),updated_at=clock_timestamp() WHERE submission_id=$1`,
        [claim.submissionId, attempts, reason, delay],
      );
      return false;
    });
    if (!busy)
      this.logger.warn(`Code judge infrastructure failure for ${claim.submissionId}: ${reason}`);
    if (failed) {
      const rows: CodeSubmissionRow[] = await this.db.query(
        'SELECT * FROM code_submissions WHERE id=$1',
        [claim.submissionId],
      );
      if (rows[0]) await this.notify(rows[0], 'FAILED');
    }
  }

  private async notify(s: CodeSubmissionRow, status: string): Promise<void> {
    try {
      await this.notifier.submissionUpdated(s.student_id, {
        submissionId: s.id,
        assignmentId: s.assignment_id,
        status,
      });
    } catch {
      // Realtime is best effort; clients poll GET /me/code-submissions/:id.
    }
  }
}
