import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { TeachingReadService } from '../../classes/services/teaching-read.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import { UserRole } from '../../users/user-role.enum.js';
import type { AssignmentRow, SubmissionRow } from '../assignment.types.js';
import { gradeQuiz, quizExpiry, validateAnswers } from '../domain/quiz.js';
import { QuizAttemptDto } from '../dtos/assignment.dto.js';
import type { SaveAnswersInput } from '../dtos/assignment-input.dto.js';
import { AssignmentException } from '../exceptions/assignment.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentAccessService } from './assignment-access.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentsService } from './assignments.service.js';

@Injectable()
export class QuizAttemptsService {
  constructor(
    private readonly db: DataSource,
    private readonly access: AssignmentAccessService,
    private readonly assignments: AssignmentsService,
    private readonly teaching: TeachingReadService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async start(
    actor: AuthenticatedUser,
    id: string,
    revision: number,
    key?: string,
  ): Promise<{ created: boolean; attempt: QuizAttemptDto }> {
    this.student(actor);
    this.key(key);
    return this.db.transaction(async (m) => {
      const a = await this.assignments.authorized(m, actor, id, true);
      const enrollmentId = await this.access.session(m, actor, a.session_id, true);
      if (!enrollmentId) throw new AssignmentException(404, 'ASSIGNMENT_NOT_FOUND');
      if (a.type !== 'QUIZ') throw new AssignmentException(422, 'ASSIGNMENT_TYPE_MISMATCH');
      const route = `start:${id}`;
      const replay = await this.receipt(m, actor, route, key, { revision });
      const rows: SubmissionRow[] = await m.query(
        'SELECT * FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2 FOR UPDATE',
        [id, actor.userId],
      );
      const existing = rows[0];
      const now = await this.assignments.now(m);
      if (replay) {
        if (!existing || existing.id !== replay) throw new Error('ASSIGNMENT_RECEIPT_INVARIANT');
        return { created: false, attempt: new QuizAttemptDto(existing, now) };
      }
      if (existing) {
        if (existing.status !== 'IN_PROGRESS')
          throw new AssignmentException(409, 'QUIZ_ALREADY_STARTED', { resultId: existing.id });
        await this.saveReceipt(m, actor, route, key, { revision }, existing.id);
        return { created: false, attempt: new QuizAttemptDto(existing, now) };
      }
      if (a.revision !== revision)
        throw new AssignmentException(409, 'ASSIGNMENT_VERSION_CONFLICT');
      if (a.due_at && now >= a.due_at)
        throw new AssignmentException(409, 'ASSIGNMENT_DEADLINE_PASSED');
      const questions = await this.assignments.questions(m, id);
      const expires = quizExpiry(now, a.time_limit_minutes, a.due_at);
      const inserted: SubmissionRow[] = await m.query(
        `INSERT INTO assignment_submissions(assignment_id,student_id,enrollment_id,assignment_revision,status,started_at,expires_at,assignment_snapshot)
        VALUES($1,$2,$3,$4,'IN_PROGRESS',$5,$6,$7) RETURNING *`,
        [
          id,
          actor.userId,
          enrollmentId,
          a.revision,
          now,
          expires,
          JSON.stringify({ title: a.title, maxScore: a.max_score, questions }),
        ],
      );
      const row = inserted[0];
      if (!row) throw new Error('QUIZ_START_INVARIANT');
      // Untimed attempts also need durable cancellation/enrollment-revocation cleanup.
      await m.query(
        "INSERT INTO assignment_finalization_jobs(submission_id,run_after) VALUES($1,LEAST($2::timestamptz,clock_timestamp()+interval '30 seconds'))",
        [row.id, expires],
      );
      await this.assignments.audit(m, a, actor.userId, 'START', null, row.id, row.version);
      await this.saveReceipt(m, actor, route, key, { revision }, row.id);
      return { created: true, attempt: new QuizAttemptDto(row, now) };
    });
  }

  async get(actor: AuthenticatedUser, id: string, result = false): Promise<QuizAttemptDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await this.access.actor(m, actor);
      const s = await this.row(m, id);
      if (actor.role === UserRole.STUDENT) {
        if (s.student_id !== actor.userId)
          throw new AssignmentException(404, 'SUBMISSION_NOT_FOUND');
        // Submitted history survives enrollment completion/cancellation and assignment archive.
        if (s.status === 'IN_PROGRESS') {
          const a = await this.assignments.authorized(m, actor, s.assignment_id);
          if (a.status !== 'PUBLISHED') throw new AssignmentException(404, 'SUBMISSION_NOT_FOUND');
        }
      } else {
        const a = await this.assignments.authorized(m, actor, s.assignment_id);
        if (a.status === 'DRAFT' || s.status !== 'GRADED')
          throw new AssignmentException(404, 'SUBMISSION_NOT_FOUND');
      }
      if (
        result &&
        s.status !== 'GRADED' &&
        !(
          s.status === 'IN_PROGRESS' &&
          s.expires_at &&
          s.expires_at <= (await this.assignments.now(m))
        )
      )
        throw new AssignmentException(409, 'RESULT_NOT_AVAILABLE');
      return new QuizAttemptDto(s, await this.assignments.now(m), result);
    });
  }

  async save(
    actor: AuthenticatedUser,
    id: string,
    input: SaveAnswersInput,
    key?: string,
    submit = false,
  ): Promise<QuizAttemptDto> {
    this.student(actor);
    this.key(key);
    return this.db.transaction(async (m) => {
      const initial = await this.row(m, id);
      if (initial.student_id !== actor.userId)
        throw new AssignmentException(404, 'SUBMISSION_NOT_FOUND');
      const a = await this.assignments.authorized(m, actor, initial.assignment_id, true);
      const s = await this.row(m, id, true);
      const route = `${submit ? 'submit' : 'answers'}:${id}`;
      const replay = await this.receipt(m, actor, route, key, input);
      const now = await this.assignments.now(m);
      if (replay) {
        if (submit && s.status === 'GRADED') return new QuizAttemptDto(s, now, true);
        // Replaying a save never overwrites newer answers and cannot revive an expired attempt.
        if (!submit && s.status === 'IN_PROGRESS' && (!s.expires_at || now < s.expires_at))
          return new QuizAttemptDto(s, now);
      }
      if (s.status !== 'IN_PROGRESS')
        throw new AssignmentException(409, 'SUBMISSION_ALREADY_FINALIZED', { resultId: s.id });
      if (s.expires_at && now >= s.expires_at)
        throw new AssignmentException(409, 'ATTEMPT_EXPIRED', {
          resultUrl: `/api/v1/me/assignment-submissions/${id}/result`,
        });
      if (s.version !== input.expectedVersion)
        throw new AssignmentException(409, 'SUBMISSION_VERSION_CONFLICT');
      validateAnswers(s.assignment_snapshot.questions, input.answers, submit);
      s.answers = input.answers;
      if (submit) await this.finalize(m, a, s, now, 'MANUAL', actor.userId);
      else {
        await m.query(
          'UPDATE assignment_submissions SET answers=$2,version=version+1,updated_at=clock_timestamp() WHERE id=$1',
          [id, JSON.stringify(s.answers)],
        );
        await this.assignments.audit(m, a, actor.userId, 'SAVE_ANSWERS', null, id, s.version + 1);
      }
      await this.saveReceipt(m, actor, route, key, input, id);
      return new QuizAttemptDto(await this.row(m, id), now, submit);
    });
  }

  /** Durable jobs live in PostgreSQL. Never hold a job lock before Class -> Session -> Assignment -> Submission. */
  async finalizeDue(limit = 20): Promise<number> {
    const jobs: { submission_id: string }[] = await this.db.query(
      `SELECT submission_id FROM assignment_finalization_jobs
      WHERE completed_at IS NULL AND run_after<=clock_timestamp() ORDER BY run_after,submission_id LIMIT $1`,
      [limit],
    );
    let completed = 0;
    for (const job of jobs) {
      try {
        await this.db.transaction(async (m) => {
          const initial = await this.row(m, job.submission_id);
          const a0 = await this.assignments.row(m, initial.assignment_id);
          const { session, classEntity } = await this.teaching.loadSession(m, a0.session_id, true);
          const a = await this.assignments.row(m, a0.id, true);
          const s = await this.row(m, initial.id, true);
          const enrollment = await this.enrollments
            .managementQuery(m)
            .where('e.id=:id', { id: s.enrollment_id })
            .setLock('pessimistic_read')
            .getOne();
          const now = await this.assignments.now(m);
          if (s.status === 'IN_PROGRESS') {
            if (
              a.status !== 'PUBLISHED' ||
              classEntity.status === 'CANCELLED' ||
              session.status === 'CANCELLED' ||
              enrollment?.status !== 'ACTIVE'
            ) {
              await m.query(
                "UPDATE assignment_submissions SET status='VOIDED',version=version+1,updated_at=clock_timestamp() WHERE id=$1",
                [s.id],
              );
              await this.assignments.audit(m, a, null, 'VOID', null, s.id, s.version + 1);
            } else if (s.expires_at && now >= s.expires_at) {
              await this.finalize(m, a, s, now, 'TIMEOUT', null);
            } else {
              await m.query(
                "UPDATE assignment_finalization_jobs SET run_after=LEAST($2::timestamptz,clock_timestamp()+interval '30 seconds'),updated_at=clock_timestamp() WHERE submission_id=$1",
                [s.id, s.expires_at],
              );
              return;
            }
          }
          await m.query(
            'UPDATE assignment_finalization_jobs SET completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE submission_id=$1',
            [s.id],
          );
        });
        completed++;
      } catch {
        // No answers, keys, storage paths or raw exception messages in worker logs.
        await this.db.query(
          `UPDATE assignment_finalization_jobs SET failures=failures+1,
          run_after=clock_timestamp()+LEAST(300,POWER(2,LEAST(failures+1,8))) * interval '1 second',updated_at=clock_timestamp()
          WHERE submission_id=$1 AND completed_at IS NULL`,
          [job.submission_id],
        );
      }
    }
    return completed;
  }

  private async finalize(
    m: EntityManager,
    a: AssignmentRow,
    s: SubmissionRow,
    now: Date,
    source: 'MANUAL' | 'TIMEOUT',
    actorId: string | null,
  ): Promise<void> {
    const keyed = await this.assignments.questionsWithKeys(m, a.id);
    const result = gradeQuiz(
      s.assignment_snapshot.questions,
      s.answers,
      new Map(keyed.map((q) => [q.id, q.correctOption])),
      s.assignment_snapshot.maxScore,
    );
    await m.query(
      `UPDATE assignment_submissions SET status='GRADED',version=version+1,answers=$2,result=$3,submitted_at=$4,submission_source=$5,updated_at=clock_timestamp() WHERE id=$1`,
      [s.id, JSON.stringify(s.answers), JSON.stringify(result), now, source],
    );
    await m.query(
      'UPDATE assignment_finalization_jobs SET completed_at=clock_timestamp() WHERE submission_id=$1',
      [s.id],
    );
    await this.assignments.audit(
      m,
      a,
      actorId,
      source === 'MANUAL' ? 'SUBMIT' : 'TIMEOUT',
      null,
      s.id,
      s.version + 1,
    );
  }
  private async row(m: EntityManager, id: string, lock = false): Promise<SubmissionRow> {
    const rows: SubmissionRow[] = await m.query(
      `SELECT * FROM assignment_submissions WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new AssignmentException(404, 'SUBMISSION_NOT_FOUND');
    return row;
  }
  private student(actor: AuthenticatedUser): void {
    if (actor.role !== UserRole.STUDENT)
      throw new AssignmentException(403, 'SUBMISSION_ACCESS_DENIED');
  }
  private key(key: string | undefined): asserts key is string {
    if (!key || !isUUID(key, '4')) throw new AssignmentException(422, 'IDEMPOTENCY_KEY_REQUIRED');
  }
  private hash(input: unknown): string {
    return createHash('sha256').update(JSON.stringify(input)).digest('hex');
  }
  private async receipt(
    m: EntityManager,
    actor: AuthenticatedUser,
    route: string,
    key: string,
    input: unknown,
  ): Promise<string | null> {
    await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `assignment:${actor.userId}:${route}:${key.toLowerCase()}`,
    ]);
    const rows: { request_hash: string; resource_id: string }[] = await m.query(
      'SELECT request_hash,resource_id FROM assignment_receipts WHERE actor_id=$1 AND route=$2 AND idempotency_key=$3',
      [actor.userId, route, key],
    );
    const receipt = rows[0];
    if (receipt && receipt.request_hash !== this.hash(input))
      throw new AssignmentException(409, 'IDEMPOTENCY_KEY_REUSED');
    return receipt?.resource_id ?? null;
  }
  private async saveReceipt(
    m: EntityManager,
    actor: AuthenticatedUser,
    route: string,
    key: string,
    input: unknown,
    id: string,
  ): Promise<void> {
    await m.query(
      'INSERT INTO assignment_receipts(actor_id,route,idempotency_key,request_hash,resource_id) VALUES($1,$2,$3,$4,$5)',
      [actor.userId, route, key, this.hash(input), id],
    );
  }
}
