import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager } from 'typeorm';
import { isUniqueViolation } from '../../../common/database/postgres-error.js';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { UserRole } from '../../users/user-role.enum.js';
import type { AssignmentRow, CodeSubmissionRow } from '../assignment.types.js';
import type { CodeReviewQueryDto } from '../dtos/code-input.dto.js';
import type {
  CodeSummaryDto,
  MentorCodeSubmissionDetailDto,
  MentorCodeSubmissionDto,
  MentorCodeSubmissionPageDto,
} from '../dtos/code-review.dto.js';
import { AssignmentException } from '../exceptions/assignment.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentsService } from './assignments.service.js';
import { CODE_SUBMISSION_NOTIFIER, type CodeSubmissionNotifier } from './code-judge.service.js';
import { submissionDto } from './code-submissions.service.js';

type MentorRow = CodeSubmissionRow & { display_name: string; duplicate: boolean };

/** Shared roster/stat CTE: ACTIVE students of the class plus anyone who already submitted. */
const SUMMARY_CTE = `WITH cls AS (
    SELECT s.class_id FROM assignments a JOIN class_sessions s ON s.id = a.session_id WHERE a.id = $1),
  students AS (
    SELECT e.student_id FROM enrollments e JOIN cls ON e.class_id = cls.class_id WHERE e.status = 'ACTIVE'
    UNION SELECT cs.student_id FROM code_submissions cs WHERE cs.assignment_id = $1),
  enr AS (
    SELECT DISTINCT ON (e.student_id) e.student_id, e.status FROM enrollments e JOIN cls ON e.class_id = cls.class_id
    ORDER BY e.student_id, (e.status = 'ACTIVE') DESC, e.created_at DESC),
  stats AS (
    SELECT student_id, count(*)::int AS submission_count,
      count(*) FILTER (WHERE counts_as_attempt AND status <> 'FAILED')::int AS attempts_used,
      count(*) FILTER (WHERE status = 'FAILED')::int AS failed_count
    FROM code_submissions WHERE assignment_id = $1 GROUP BY student_id),
  latest AS (
    SELECT DISTINCT ON (student_id) student_id, status, verdict, submitted_at
    FROM code_submissions WHERE assignment_id = $1 ORDER BY student_id, attempt_number DESC),
  roster AS (
    SELECT st.student_id, u.display_name, enr.status AS enrollment_status,
      coalesce(stats.submission_count, 0) AS submission_count, coalesce(stats.attempts_used, 0) AS attempts_used,
      coalesce(stats.failed_count, 0) AS failed_count, best.score AS best_score, best.submission_id AS best_submission_id,
      best.verdict AS best_verdict, latest.status AS latest_status, latest.verdict AS latest_verdict,
      latest.submitted_at AS latest_submitted_at
    FROM students st JOIN users u ON u.id = st.student_id
    LEFT JOIN enr ON enr.student_id = st.student_id
    LEFT JOIN stats ON stats.student_id = st.student_id
    LEFT JOIN code_assignment_scores best ON best.assignment_id = $1 AND best.student_id = st.student_id
    LEFT JOIN latest ON latest.student_id = st.student_id)`;

/** Mentor review of CODE submissions (Phase 7 slice C4). Scope = Phase 5 session access. */
@Injectable()
export class CodeReviewService {
  constructor(
    private readonly db: DataSource,
    private readonly assignments: AssignmentsService,
    @Inject(CODE_SUBMISSION_NOTIFIER) private readonly notifier: CodeSubmissionNotifier,
  ) {}

  async summary(
    actor: AuthenticatedUser,
    id: string,
    query: CodeReviewQueryDto,
  ): Promise<CodeSummaryDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const a = await this.mentorAssignment(m, actor, id);
      const filter = query.studentId ? 'WHERE student_id = $2' : 'WHERE $2::uuid IS NULL';
      const params = [id, query.studentId ?? null];
      const totals: {
        students: number;
        submitted: number;
        accepted: number;
        failed: number;
        average: string | null;
      }[] = await m.query(
        `${SUMMARY_CTE} SELECT count(*)::int AS students,
          count(*) FILTER (WHERE submission_count > 0)::int AS submitted,
          count(*) FILTER (WHERE best_verdict = 'ACCEPTED')::int AS accepted,
          coalesce(sum(failed_count), 0)::int AS failed,
          round(avg(best_score), 2)::text AS average
        FROM roster ${filter}`,
        params,
      );
      const rows: {
        student_id: string;
        display_name: string;
        enrollment_status: string | null;
        submission_count: number;
        attempts_used: number;
        failed_count: number;
        best_score: string | null;
        best_submission_id: string | null;
        latest_status: string | null;
        latest_verdict: string | null;
        latest_submitted_at: Date | null;
      }[] = await m.query(
        `${SUMMARY_CTE} SELECT * FROM roster ${filter} ORDER BY display_name, student_id LIMIT $3 OFFSET $4`,
        [...params, query.pageSize, (query.page - 1) * query.pageSize],
      );
      const t = totals[0] ?? { students: 0, submitted: 0, accepted: 0, failed: 0, average: null };
      return {
        assignmentId: a.id,
        maxScore: a.max_score,
        maxAttempts: a.max_attempts,
        dueAt: a.due_at?.toISOString() ?? null,
        totals: {
          students: t.students,
          submitted: t.submitted,
          notSubmitted: t.students - t.submitted,
          accepted: t.accepted,
          failed: t.failed,
          averageBestScore: t.average,
        },
        items: rows.map((r) => ({
          studentId: r.student_id,
          displayName: r.display_name,
          enrollmentStatus: r.enrollment_status,
          submissionCount: r.submission_count,
          attemptsUsed: r.attempts_used,
          bestScore: r.best_score,
          bestSubmissionId: r.best_submission_id,
          latestStatus: r.latest_status,
          latestVerdict: r.latest_verdict,
          latestSubmittedAt: r.latest_submitted_at?.toISOString() ?? null,
          failedCount: r.failed_count,
        })),
        total: t.students,
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  async submissions(
    actor: AuthenticatedUser,
    id: string,
    query: CodeReviewQueryDto,
  ): Promise<MentorCodeSubmissionPageDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await this.mentorAssignment(m, actor, id);
      const params = [id, query.studentId ?? null];
      const count: { n: number }[] = await m.query(
        'SELECT count(*)::int AS n FROM code_submissions WHERE assignment_id=$1 AND ($2::uuid IS NULL OR student_id=$2)',
        params,
      );
      const rows: MentorRow[] = await m.query(
        `${this.select()} WHERE s.assignment_id=$1 AND ($2::uuid IS NULL OR s.student_id=$2)
        ORDER BY s.submitted_at DESC, s.id LIMIT $3 OFFSET $4`,
        [...params, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        items: rows.map((r) => this.mentorDto(r)),
        total: count[0]?.n ?? 0,
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  async submission(
    actor: AuthenticatedUser,
    submissionId: string,
  ): Promise<MentorCodeSubmissionDetailDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const row = await this.load(m, submissionId);
      await this.mentorAssignment(m, actor, row.assignment_id);
      const tests: {
        position: number;
        visibility: 'SAMPLE' | 'HIDDEN';
        weight: number;
        status: string;
        time_ms: number | null;
        memory_kb: number | null;
        input_args: unknown[];
        expected: unknown;
        actual: unknown;
        console_excerpt: string | null;
      }[] = await m.query(
        `SELECT st.position,st.visibility,st.weight,st.status,st.time_ms,st.memory_kb,tc.input_args,tc.expected,st.actual,st.console_excerpt
        FROM code_submission_tests st JOIN code_test_cases tc ON tc.id=st.test_case_id WHERE st.submission_id=$1 ORDER BY st.position`,
        [submissionId],
      );
      const job: { last_error: string | null }[] = await m.query(
        'SELECT last_error FROM code_judge_jobs WHERE submission_id=$1',
        [submissionId],
      );
      return {
        ...this.mentorDto(row),
        sourceCode: row.source_code,
        mentorTests: tests.map((t) => ({
          position: t.position,
          visibility: t.visibility,
          weight: t.weight,
          status: t.status,
          timeMs: t.time_ms ?? 0,
          memoryKb: t.memory_kb ?? 0,
          inputArgs: t.input_args,
          expected: t.expected,
          ...(t.visibility === 'SAMPLE'
            ? { actual: t.actual, console: t.console_excerpt ?? '' }
            : {}),
        })),
        lastError: row.status === 'FAILED' ? (job[0]?.last_error ?? null) : null,
      };
    });
  }

  /** Re-queues a submission that failed for infrastructure reasons. Never re-grades a GRADED one. */
  async rejudge(actor: AuthenticatedUser, submissionId: string): Promise<MentorCodeSubmissionDto> {
    const row = await this.db.transaction(async (m) => {
      const s = await this.load(m, submissionId, true);
      const a = await this.mentorAssignment(m, actor, s.assignment_id, true);
      if (a.status !== 'PUBLISHED') throw new AssignmentException(409, 'ASSIGNMENT_CLOSED');
      if (s.status !== 'FAILED')
        throw new AssignmentException(409, 'CODE_REJUDGE_NOT_ALLOWED', { status: s.status });
      try {
        await m.query('SAVEPOINT code_rejudge');
        await m.query(
          "UPDATE code_submissions SET status='QUEUED',version=version+1,updated_at=clock_timestamp() WHERE id=$1",
          [s.id],
        );
      } catch (error) {
        if (!isUniqueViolation(error, 'uq_code_submission_inflight')) throw error;
        await m.query('ROLLBACK TO SAVEPOINT code_rejudge');
        throw new AssignmentException(409, 'CODE_SUBMISSION_IN_FLIGHT');
      }
      await m.query(
        `UPDATE code_judge_jobs SET attempts=0,last_error=NULL,locked_until=NULL,completed_at=NULL,
          run_after=clock_timestamp(),updated_at=clock_timestamp() WHERE submission_id=$1`,
        [s.id],
      );
      await this.assignments.audit(m, a, actor.userId, 'CODE_REJUDGE', `submission ${s.id}`);
      return this.load(m, s.id);
    });
    await this.push(row);
    return this.mentorDto(row);
  }

  /** Voids a submission (e.g. plagiarism). It leaves the best score but still counts as an attempt. */
  async void(
    actor: AuthenticatedUser,
    submissionId: string,
    reason: string,
  ): Promise<MentorCodeSubmissionDto> {
    const row = await this.db.transaction(async (m) => {
      const s = await this.load(m, submissionId, true);
      const a = await this.mentorAssignment(m, actor, s.assignment_id, true);
      if (s.status === 'VOIDED')
        throw new AssignmentException(409, 'CODE_SUBMISSION_ALREADY_VOIDED');
      await m.query(
        "UPDATE code_submissions SET status='VOIDED',voided_reason=$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1",
        [s.id, reason],
      );
      await m.query(
        'UPDATE code_judge_jobs SET completed_at=coalesce(completed_at,clock_timestamp()),updated_at=clock_timestamp() WHERE submission_id=$1',
        [s.id],
      );
      await this.assignments.audit(
        m,
        a,
        actor.userId,
        'CODE_VOID',
        `submission ${s.id}: ${reason}`.slice(0, 2000),
      );
      return this.load(m, s.id);
    });
    await this.push(row);
    return this.mentorDto(row);
  }

  private async mentorAssignment(
    m: EntityManager,
    actor: AuthenticatedUser,
    id: string,
    write = false,
  ): Promise<AssignmentRow> {
    if (actor.role !== UserRole.MENTOR)
      throw new AssignmentException(403, 'ASSIGNMENT_SCOPE_REQUIRED');
    // Review stays available for archived assignments and completed classes (read path).
    const a = await this.assignments.authorized(m, actor, id, false);
    if (a.type !== 'CODE') throw new AssignmentException(422, 'ASSIGNMENT_TYPE_MISMATCH');
    return write ? this.assignments.row(m, id, true) : a;
  }

  private select(): string {
    return `SELECT s.*, u.display_name, EXISTS(
        SELECT 1 FROM code_submissions o WHERE o.assignment_id=s.assignment_id AND o.source_sha256=s.source_sha256
          AND o.student_id<>s.student_id) AS duplicate
      FROM code_submissions s JOIN users u ON u.id=s.student_id`;
  }

  private async load(m: EntityManager, id: string, lock = false): Promise<MentorRow> {
    const rows: MentorRow[] = await m.query(
      `${this.select()} WHERE s.id=$1 ${lock ? 'FOR UPDATE OF s' : ''}`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new AssignmentException(404, 'CODE_SUBMISSION_NOT_FOUND');
    return row;
  }

  private mentorDto(row: MentorRow): MentorCodeSubmissionDto {
    return {
      ...submissionDto(row),
      studentId: row.student_id,
      displayName: row.display_name,
      duplicateOfOtherStudent: row.duplicate,
    };
  }

  private async push(row: CodeSubmissionRow): Promise<void> {
    try {
      await this.notifier.submissionUpdated(row.student_id, {
        submissionId: row.id,
        assignmentId: row.assignment_id,
        status: row.status,
      });
    } catch {
      // best effort
    }
  }
}
