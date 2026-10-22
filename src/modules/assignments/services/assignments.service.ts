import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MentorWorkspaceService } from '../../classes/services/mentor-workspace.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { EnrollmentsService } from '../../enrollments/services/enrollments.service.js';
import { UserRole } from '../../users/user-role.enum.js';
import type { AssignmentRow } from '../assignment.types.js';
import type { OptionLabel, QuizQuestion } from '../domain/quiz.js';
import { AssignmentDto, type AssignmentPageDto } from '../dtos/assignment.dto.js';
import type {
  ArchiveAssignmentInput,
  AssignmentQueryDto,
  CreateAssignmentInput,
  ReplaceQuestionsInput,
  UpdateAssignmentInput,
} from '../dtos/assignment-input.dto.js';
import { AssignmentException } from '../exceptions/assignment.exceptions.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentAccessService } from './assignment-access.service.js';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly db: DataSource,
    private readonly access: AssignmentAccessService,
    private readonly workspace: MentorWorkspaceService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async create(
    actor: AuthenticatedUser,
    sessionId: string,
    input: CreateAssignmentInput,
  ): Promise<AssignmentDto> {
    return this.db.transaction(async (m) => {
      await this.access.session(m, actor, sessionId, true);
      if (actor.role !== UserRole.MENTOR)
        throw new AssignmentException(403, 'ASSIGNMENT_SCOPE_REQUIRED');
      if (
        Number(input.maxScore) <= 0 ||
        (input.type === 'QUIZ' && (input.maxAttempts ?? 1) !== 1) ||
        (input.type === 'ZIP' && (!input.dueAt || input.timeLimitMinutes != null))
      )
        throw new AssignmentException(422, 'INVALID_ASSIGNMENT_CONFIG');
      const rows: AssignmentRow[] = await m.query(
        `INSERT INTO assignments(session_id,purpose,type,title,description,max_score,due_at,time_limit_minutes,max_attempts,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          sessionId,
          input.purpose,
          input.type,
          input.title,
          input.description ?? '',
          input.maxScore,
          input.dueAt ?? null,
          input.timeLimitMinutes ?? null,
          input.maxAttempts ?? 1,
          actor.userId,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error('ASSIGNMENT_INSERT_INVARIANT');
      await this.audit(m, row, actor.userId, 'CREATE');
      return new AssignmentDto(row);
    });
  }

  async get(actor: AuthenticatedUser, id: string): Promise<AssignmentDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const a = await this.authorized(m, actor, id);
      return new AssignmentDto(
        a,
        actor.role === UserRole.MENTOR ? await this.questionsWithKeys(m, id) : undefined,
      );
    });
  }

  async list(
    actor: AuthenticatedUser,
    classId: string | null,
    sessionId: string | null,
    query: AssignmentQueryDto,
  ): Promise<AssignmentPageDto> {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await this.access.actor(m, actor);
      let allowed: string[] | null = null;
      if (sessionId) await this.access.session(m, actor, sessionId);
      else if (classId && actor.role === UserRole.MENTOR) {
        const scope = await this.workspace.scope(m, actor, classId);
        if (scope.accessScope === 'SESSION')
          allowed = (await this.workspace.sessionsQuery(m, actor, scope).getMany()).map(
            (s) => s.id,
          );
      } else if (!classId || !(await this.enrollments.hasActiveAccess(actor.userId, classId, m)))
        throw new AssignmentException(404, 'ASSIGNMENT_NOT_FOUND');
      const params: unknown[] = [
        sessionId,
        classId,
        allowed,
        query.type ?? null,
        query.purpose ?? null,
        query.sessionId ?? null,
        query.status ?? null,
      ];
      const where = `FROM assignments a JOIN class_sessions s ON s.id=a.session_id JOIN classes c ON c.id=s.class_id
        WHERE a.deleted_at IS NULL AND ($1::uuid IS NULL OR a.session_id=$1)
        AND ($2::uuid IS NULL OR s.class_id=$2) AND ($3::uuid[] IS NULL OR s.id=ANY($3))
        AND ($4::text IS NULL OR a.type=$4) AND ($5::text IS NULL OR a.purpose=$5)
        AND ($6::uuid IS NULL OR s.id=$6) AND ($7::text IS NULL OR a.status=$7)
        ${actor.role === UserRole.STUDENT ? "AND a.status='PUBLISHED' AND c.status<>'CANCELLED' AND s.status<>'CANCELLED'" : ''}`;
      const count: { total: string }[] = await m.query(`SELECT count(*) AS total ${where}`, params);
      const rows: AssignmentRow[] = await m.query(
        `SELECT a.* ${where} ORDER BY a.created_at DESC,a.id ASC LIMIT $8 OFFSET $9`,
        [...params, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        items: rows.map((r) => new AssignmentDto(r)),
        total: Number(count[0]?.total ?? 0),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateAssignmentInput,
  ): Promise<AssignmentDto> {
    return this.db.transaction(async (m) => {
      const a = await this.draft(m, actor, id, input.expectedRevision);
      if (a.type === 'ZIP' && (input.dueAt === null || input.timeLimitMinutes != null))
        throw new AssignmentException(422, 'INVALID_ASSIGNMENT_CONFIG');
      await m.query(
        `UPDATE assignments SET title=$2,description=$3,due_at=$4,time_limit_minutes=$5,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1`,
        [
          id,
          input.title ?? a.title,
          input.description ?? a.description,
          input.dueAt === undefined ? a.due_at : input.dueAt,
          input.timeLimitMinutes === undefined ? a.time_limit_minutes : input.timeLimitMinutes,
        ],
      );
      return this.changed(m, a, actor.userId, 'EDIT');
    });
  }

  async replaceQuestions(
    actor: AuthenticatedUser,
    id: string,
    input: ReplaceQuestionsInput,
  ): Promise<AssignmentDto> {
    return this.db.transaction(async (m) => {
      const a = await this.draft(m, actor, id, input.expectedRevision);
      if (a.type !== 'QUIZ') throw new AssignmentException(422, 'ASSIGNMENT_TYPE_MISMATCH');
      const old = new Set((await this.questions(m, id)).map((q) => q.id));
      const supplied = input.questions.flatMap((q) => (q.id ? [q.id] : []));
      if (
        new Set(supplied).size !== supplied.length ||
        supplied.some((qid) => !old.has(qid)) ||
        input.questions.some((q) => new Set(q.options.map((o) => o.label)).size !== 4)
      )
        throw new AssignmentException(422, 'INVALID_QUIZ_QUESTIONS');
      await m.query(
        'DELETE FROM assignment_answer_keys WHERE question_id IN (SELECT id FROM assignment_questions WHERE assignment_id=$1)',
        [id],
      );
      await m.query(
        'DELETE FROM assignment_question_options WHERE question_id IN (SELECT id FROM assignment_questions WHERE assignment_id=$1)',
        [id],
      );
      await m.query('DELETE FROM assignment_questions WHERE assignment_id=$1', [id]);
      for (const [index, q] of input.questions.entries()) {
        const qid = q.id ?? randomUUID();
        await m.query(
          'INSERT INTO assignment_questions(id,assignment_id,position,prompt) VALUES($1,$2,$3,$4)',
          [qid, id, index + 1, q.prompt],
        );
        for (const o of q.options)
          await m.query(
            'INSERT INTO assignment_question_options(question_id,label,text) VALUES($1,$2,$3)',
            [qid, o.label, o.text],
          );
        await m.query(
          'INSERT INTO assignment_answer_keys(question_id,correct_option) VALUES($1,$2)',
          [qid, q.correctOption],
        );
      }
      await m.query(
        'UPDATE assignments SET revision=revision+1,updated_at=clock_timestamp() WHERE id=$1',
        [id],
      );
      const result = await this.changed(m, a, actor.userId, 'QUESTIONS');
      return new AssignmentDto(await this.row(m, result.id), await this.questionsWithKeys(m, id));
    });
  }

  async publish(actor: AuthenticatedUser, id: string, revision: number): Promise<AssignmentDto> {
    return this.db.transaction(async (m) => {
      const a = await this.draft(m, actor, id, revision);
      // ZIP remains draft-only until its isolated upload and grading slices are available.
      if (a.type === 'ZIP') throw new AssignmentException(409, 'ZIP_PIPELINE_NOT_IMPLEMENTED');
      const questions = await this.questionsWithKeys(m, id);
      if (!questions.length || questions.some((q) => q.options.length !== 4))
        throw new AssignmentException(422, 'QUIZ_QUESTIONS_REQUIRED');
      const now = await this.now(m);
      if (a.due_at && a.due_at <= now)
        throw new AssignmentException(422, 'INVALID_ASSIGNMENT_DEADLINE');
      await m.query(
        "UPDATE assignments SET status='PUBLISHED',revision=revision+1,published_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1",
        [id],
      );
      return this.changed(m, a, actor.userId, 'PUBLISH');
    });
  }

  async archive(
    actor: AuthenticatedUser,
    id: string,
    input: ArchiveAssignmentInput,
  ): Promise<AssignmentDto> {
    return this.db.transaction(async (m) => {
      const a = await this.authorized(m, actor, id, true);
      if (actor.role !== UserRole.MENTOR)
        throw new AssignmentException(403, 'ASSIGNMENT_SCOPE_REQUIRED');
      this.revision(a, input.expectedRevision);
      if (a.status !== 'PUBLISHED') throw new AssignmentException(409, 'ASSIGNMENT_STATE_CONFLICT');
      await m.query(
        "UPDATE assignments SET status='ARCHIVED',revision=revision+1,updated_at=clock_timestamp() WHERE id=$1",
        [id],
      );
      await m.query(
        "UPDATE assignment_submissions SET status='VOIDED',version=version+1,updated_at=clock_timestamp() WHERE assignment_id=$1 AND status='IN_PROGRESS'",
        [id],
      );
      await m.query(
        'UPDATE assignment_finalization_jobs SET completed_at=clock_timestamp() WHERE submission_id IN (SELECT id FROM assignment_submissions WHERE assignment_id=$1) AND completed_at IS NULL',
        [id],
      );
      return this.changed(m, a, actor.userId, 'ARCHIVE', input.reason);
    });
  }

  async remove(actor: AuthenticatedUser, id: string, revision: number): Promise<void> {
    await this.db.transaction(async (m) => {
      const a = await this.draft(m, actor, id, revision);
      await m.query(
        'UPDATE assignments SET deleted_at=clock_timestamp(),revision=revision+1 WHERE id=$1',
        [id],
      );
      await this.audit(m, { ...a, revision: a.revision + 1 }, actor.userId, 'DELETE');
    });
  }

  async row(m: EntityManager, id: string, lock = false): Promise<AssignmentRow> {
    const rows: AssignmentRow[] = await m.query(
      `SELECT * FROM assignments WHERE id=$1 AND deleted_at IS NULL ${lock ? 'FOR UPDATE' : ''}`,
      [id],
    );
    const a = rows[0];
    if (!a) throw new AssignmentException(404, 'ASSIGNMENT_NOT_FOUND');
    return a;
  }
  async authorized(
    m: EntityManager,
    actor: AuthenticatedUser,
    id: string,
    write = false,
  ): Promise<AssignmentRow> {
    const initial = await this.row(m, id);
    await this.access.session(m, actor, initial.session_id, write);
    const a = write ? await this.row(m, id, true) : initial;
    if (actor.role === UserRole.STUDENT && a.status !== 'PUBLISHED')
      throw new AssignmentException(404, 'ASSIGNMENT_NOT_FOUND');
    return a;
  }
  async questions(m: EntityManager, id: string): Promise<QuizQuestion[]> {
    return m.query(
      `SELECT q.id,q.position,q.prompt,jsonb_agg(jsonb_build_object('label',o.label,'text',o.text) ORDER BY o.label) AS options
      FROM assignment_questions q JOIN assignment_question_options o ON o.question_id=q.id WHERE q.assignment_id=$1 GROUP BY q.id ORDER BY q.position`,
      [id],
    );
  }
  async questionsWithKeys(
    m: EntityManager,
    id: string,
  ): Promise<(QuizQuestion & { correctOption: OptionLabel })[]> {
    const questions = await this.questions(m, id);
    const keys: { question_id: string; correct_option: OptionLabel }[] = await m.query(
      'SELECT k.* FROM assignment_answer_keys k JOIN assignment_questions q ON q.id=k.question_id WHERE q.assignment_id=$1',
      [id],
    );
    return questions.map((q) => {
      const key = keys.find((k) => k.question_id === q.id);
      if (!key) throw new Error('QUIZ_KEY_INVARIANT');
      return { ...q, correctOption: key.correct_option };
    });
  }
  async now(m: EntityManager): Promise<Date> {
    const rows: { now: Date }[] = await m.query('SELECT clock_timestamp() AS now');
    const now = rows[0]?.now;
    if (!now) throw new Error('DATABASE_CLOCK_INVARIANT');
    return now;
  }
  async audit(
    m: EntityManager,
    a: AssignmentRow,
    actorId: string | null,
    action: string,
    reason: string | null = null,
    submissionId: string | null = null,
    version = a.revision,
  ): Promise<void> {
    await m.query(
      'INSERT INTO assignment_audits(assignment_id,submission_id,actor_id,action,version,reason) VALUES($1,$2,$3,$4,$5,$6)',
      [a.id, submissionId, actorId, action, version, reason],
    );
  }
  private revision(a: AssignmentRow, revision: number): void {
    if (a.revision !== revision) throw new AssignmentException(409, 'ASSIGNMENT_VERSION_CONFLICT');
  }
  private async draft(
    m: EntityManager,
    actor: AuthenticatedUser,
    id: string,
    revision: number,
  ): Promise<AssignmentRow> {
    const a = await this.authorized(m, actor, id, true);
    if (actor.role !== UserRole.MENTOR)
      throw new AssignmentException(403, 'ASSIGNMENT_SCOPE_REQUIRED');
    this.revision(a, revision);
    if (a.status !== 'DRAFT') throw new AssignmentException(409, 'ASSIGNMENT_CONTENT_FROZEN');
    return a;
  }
  private async changed(
    m: EntityManager,
    a: AssignmentRow,
    actorId: string,
    action: string,
    reason: string | null = null,
  ): Promise<AssignmentDto> {
    const row = await this.row(m, a.id);
    await this.audit(m, row, actorId, action, reason);
    return new AssignmentDto(row);
  }
}
