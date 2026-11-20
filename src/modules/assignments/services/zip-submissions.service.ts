import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource, type EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { UserRole } from '../../users/user-role.enum.js';
import type { AssignmentRow } from '../assignment.types.js';
import type {
  ExtendAssignmentInput,
  InstructionFilesInput,
  ZipDraftInput,
  ZipFileInput,
  ZipGradeInput,
  ZipReleaseInput,
  ZipVersionInput,
} from '../dtos/zip-input.dto.js';
import { AssignmentException } from '../exceptions/assignment.exceptions.js';
import type {
  AssignmentFileRow,
  GradeRevision,
  InstructionFile,
  ZipRow,
  ZipView,
} from '../zip.types.js';
import { writeAssignmentAudit } from './assignment-audit.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ZipAccessService } from './zip-access.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ZipReceiptsService } from './zip-receipts.service.js';

@Injectable()
export class ZipSubmissionsService {
  constructor(
    private readonly db: DataSource,
    private readonly access: ZipAccessService,
    private readonly receipts: ZipReceiptsService,
  ) {}

  async instructions(m: EntityManager, assignmentId: string): Promise<InstructionFile[]> {
    return m.query(
      `SELECT f.id,f.original_name AS "originalFilename",f.declared_mime_type AS "mimeType",f.declared_size_bytes AS "sizeBytes",i.position
      FROM assignment_instruction_files i JOIN assignment_files f ON f.id=i.file_id WHERE i.assignment_id=$1 ORDER BY i.position`,
      [assignmentId],
    );
  }
  async audit(
    m: EntityManager,
    assignmentId: string,
    actorId: string | null,
    action: string,
    version: number,
    submissionId: string | null = null,
    gradeId: string | null = null,
    reason: string | null = null,
  ): Promise<void> {
    await writeAssignmentAudit(
      m,
      'assignment_zip_audits',
      assignmentId,
      actorId,
      action,
      version,
      reason,
      submissionId,
      gradeId,
    );
  }
  async replaceInstructions(
    actor: AuthenticatedUser,
    id: string,
    input: InstructionFilesInput,
    key?: string,
  ): Promise<{ revision: number; instructionFiles: InstructionFile[] }> {
    const receiptKey = this.receipts.key(key);
    this.access.enabled();
    return this.db.transaction(async (m) => {
      const a = await this.access.assignment(m, actor, id, true);
      this.mentor(actor);
      const route = `instructions:${a.id}`;
      const replay = await this.receipts.replay<{
        revision: number;
        instructionFiles: InstructionFile[];
      }>(m, actor.userId, route, receiptKey, input);
      if (replay) return replay;
      this.revision(a, input.expectedRevision);
      if (a.status !== 'DRAFT') throw new AssignmentException(409, 'ASSIGNMENT_CONTENT_FROZEN');
      const ids = input.fileIds.map((v) => v.toLowerCase());
      if (new Set(ids).size !== ids.length)
        throw new AssignmentException(422, 'FILE_SCOPE_MISMATCH');
      for (const fileId of ids) {
        const rows: AssignmentFileRow[] = await m.query(
          'SELECT * FROM assignment_files WHERE id=$1 FOR UPDATE',
          [fileId],
        );
        const f = rows[0];
        if (
          !f ||
          f.assignment_id !== a.id ||
          f.owner_user_id !== actor.userId ||
          f.purpose !== 'INSTRUCTION'
        )
          throw new AssignmentException(404, 'FILE_SCOPE_MISMATCH');
        if (f.status !== 'READY') throw new AssignmentException(409, 'FILE_NOT_READY');
      }
      await m.query('DELETE FROM assignment_instruction_files WHERE assignment_id=$1', [a.id]);
      for (const [i, fileId] of ids.entries())
        await m.query(
          'INSERT INTO assignment_instruction_files(assignment_id,file_id,position) VALUES($1,$2,$3)',
          [a.id, fileId, i + 1],
        );
      await m.query(
        'UPDATE assignments SET revision=revision+1,updated_at=clock_timestamp() WHERE id=$1',
        [a.id],
      );
      const outcome = {
        revision: a.revision + 1,
        instructionFiles: await this.instructions(m, a.id),
      };
      await this.audit(m, a.id, actor.userId, 'INSTRUCTIONS', outcome.revision);
      await this.receipts.save(m, actor.userId, route, receiptKey, input, outcome);
      return outcome;
    });
  }
  async extend(
    actor: AuthenticatedUser,
    id: string,
    input: ExtendAssignmentInput,
    key?: string,
  ): Promise<{ revision: number; dueAt: string; maxAttempts: number }> {
    const receiptKey = this.receipts.key(key);
    this.access.enabled();
    return this.db.transaction(async (m) => {
      const a = await this.access.assignment(m, actor, id, true);
      this.mentor(actor);
      const route = `extend:${a.id}`;
      const replay = await this.receipts.replay<{
        revision: number;
        dueAt: string;
        maxAttempts: number;
      }>(m, actor.userId, route, receiptKey, input);
      if (replay) return replay;
      this.revision(a, input.expectedRevision);
      if (a.type !== 'ZIP' || a.status !== 'PUBLISHED' || !a.due_at)
        throw new AssignmentException(409, 'ASSIGNMENT_STATE_CONFLICT');
      const due = input.dueAt ? new Date(input.dueAt) : a.due_at;
      const attempts = input.maxAttempts ?? a.max_attempts;
      if (
        due < a.due_at ||
        attempts < a.max_attempts ||
        (due.getTime() === a.due_at.getTime() && attempts === a.max_attempts)
      )
        throw new AssignmentException(422, 'INVALID_ASSIGNMENT_CONFIG');
      await m.query(
        'UPDATE assignments SET due_at=$2,max_attempts=$3,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1',
        [a.id, due, attempts],
      );
      await this.audit(m, a.id, actor.userId, 'EXTEND', a.revision + 1, null, null, input.reason);
      const outcome = { revision: a.revision + 1, dueAt: due.toISOString(), maxAttempts: attempts };
      await this.receipts.save(m, actor.userId, route, receiptKey, input, outcome);
      return outcome;
    });
  }
  async draft(
    actor: AuthenticatedUser,
    id: string,
    input: ZipDraftInput,
    key?: string,
  ): Promise<ZipView> {
    const receiptKey = this.receipts.key(key);
    return this.db.transaction(async (m) => {
      const { assignment: a, enrollmentId } = await this.access.work(m, actor, id);
      const route = `draft:${a.id}`;
      const replay = await this.receipts.replay<ZipView>(m, actor.userId, route, receiptKey, input);
      if (replay) return replay;
      this.revision(a, input.expectedAssignmentRevision);
      const rows: ZipRow[] = await m.query(
        "SELECT * FROM assignment_zip_submissions WHERE assignment_id=$1 AND student_id=$2 AND status='DRAFT' FOR UPDATE",
        [a.id, actor.userId],
      );
      let row = rows[0];
      if (!row) {
        await this.attemptLimit(m, a, actor.userId);
        const inserted: ZipRow[] = await m.query(
          'INSERT INTO assignment_zip_submissions(assignment_id,student_id,enrollment_id) VALUES($1,$2,$3) RETURNING *',
          [a.id, actor.userId, enrollmentId],
        );
        row = inserted[0];
        if (!row) throw new Error('ZIP_DRAFT_INVARIANT');
        await this.audit(m, a.id, actor.userId, 'DRAFT', row.version, row.id);
      }
      const outcome = await this.view(m, row, actor);
      await this.receipts.save(m, actor.userId, route, receiptKey, input, outcome);
      return outcome;
    });
  }
  async get(actor: AuthenticatedUser, id: string): Promise<ZipView> {
    return this.db.transaction('REPEATABLE READ', async (m) =>
      this.view(m, await this.access.submission(m, actor, id), actor),
    );
  }
  async attach(
    actor: AuthenticatedUser,
    id: string,
    input: ZipFileInput,
    key?: string,
  ): Promise<ZipView> {
    const receiptKey = this.receipts.key(key);
    return this.db.transaction(async (m) => {
      const s = await this.access.submission(m, actor, id, true);
      const route = `attach:${s.id}`;
      const replay = await this.receipts.replay<ZipView>(m, actor.userId, route, receiptKey, input);
      if (replay) return replay;
      this.open(s, input.expectedVersion);
      const files: AssignmentFileRow[] = await m.query(
        'SELECT * FROM assignment_files WHERE id=$1 FOR UPDATE',
        [input.fileId],
      );
      const f = files[0];
      if (
        !f ||
        f.assignment_id !== s.assignment_id ||
        f.zip_submission_id !== s.id ||
        f.owner_user_id !== actor.userId ||
        f.purpose !== 'SUBMISSION'
      )
        throw new AssignmentException(404, 'FILE_SCOPE_MISMATCH');
      if (f.status !== 'READY' || !f.object_version_id)
        throw new AssignmentException(409, 'FILE_NOT_READY');
      await m.query(
        'UPDATE assignment_zip_submissions SET file_id=$2,object_version_id=$3,version=version+1,updated_at=clock_timestamp() WHERE id=$1',
        [s.id, f.id, f.object_version_id],
      );
      await this.audit(m, s.assignment_id, actor.userId, 'ATTACH', s.version + 1, s.id);
      const outcome = await this.view(m, { ...s, version: s.version + 1 }, actor);
      await this.receipts.save(m, actor.userId, route, receiptKey, input, outcome);
      return outcome;
    });
  }
  async submit(
    actor: AuthenticatedUser,
    id: string,
    input: ZipVersionInput,
    key?: string,
  ): Promise<ZipView> {
    const receiptKey = this.receipts.key(key);
    return this.db.transaction(async (m) => {
      // A committed submission may replay after the deadline/revocation/feature rollback.
      const initial = await this.access.submission(m, actor, id);
      if (initial.status === 'SUBMITTED') {
        const replay = await this.receipts.replay<ZipView>(
          m,
          actor.userId,
          `submit:${initial.id}`,
          receiptKey,
          input,
        );
        if (replay) return replay;
        throw new AssignmentException(409, 'SUBMISSION_ALREADY_SUBMITTED');
      }
      const s = await this.access.submission(m, actor, id, true);
      const route = `submit:${s.id}`;
      const replay = await this.receipts.replay<ZipView>(m, actor.userId, route, receiptKey, input);
      if (replay) return replay;
      this.open(s, input.expectedVersion);
      const { assignment: a } = await this.access.work(m, actor, s.assignment_id);
      const attempt = await this.attemptLimit(m, a, actor.userId);
      const files: AssignmentFileRow[] = await m.query(
        `SELECT f.* FROM assignment_zip_submissions b JOIN assignment_files f ON f.id=b.file_id
        WHERE b.id=$1 AND f.status='READY' AND b.object_version_id=f.object_version_id FOR UPDATE OF f`,
        [s.id],
      );
      if (files.length !== 1) throw new AssignmentException(409, 'FILE_NOT_READY');
      const instructionFiles = await this.instructions(m, a.id);
      const snapshot = {
        title: a.title,
        description: a.description,
        maxScore: a.max_score,
        dueAt: a.due_at?.toISOString(),
        instructionFiles,
      };
      await m.query(
        `INSERT INTO assignment_zip_instruction_snapshots(submission_id,file_id,object_version_id,position)
        SELECT $1,f.id,f.object_version_id,i.position FROM assignment_instruction_files i JOIN assignment_files f ON f.id=i.file_id WHERE i.assignment_id=$2`,
        [s.id, a.id],
      );
      // Check DB time in the final write as well: upload/validation/lock waits never reserve a deadline.
      const submitted: ZipRow[] = await m.query(
        `WITH updated AS (UPDATE assignment_zip_submissions SET status='SUBMITTED',attempt_number=$2,version=version+1,
        assignment_revision=$3,assignment_snapshot=$4,submitted_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE id=$1 AND clock_timestamp()<$5::timestamptz RETURNING *) SELECT * FROM updated`,
        [s.id, attempt, a.revision, JSON.stringify(snapshot), a.due_at],
      );
      if (!submitted[0]) throw new AssignmentException(409, 'ASSIGNMENT_DEADLINE_PASSED');
      await this.audit(m, a.id, actor.userId, 'SUBMIT', submitted[0].version, s.id);
      const outcome = await this.view(m, submitted[0], actor);
      await this.receipts.save(m, actor.userId, route, receiptKey, input, outcome);
      return outcome;
    });
  }
  async grade(
    actor: AuthenticatedUser,
    id: string,
    input: ZipGradeInput,
    key?: string,
  ): Promise<ZipView> {
    const receiptKey = this.receipts.key(key);
    this.access.enabled();
    this.mentor(actor);
    return this.db.transaction(async (m) => {
      const s = await this.access.submission(m, actor, id, true, true);
      const route = `grade:${s.id}`;
      const replay = await this.receipts.replay<ZipView>(m, actor.userId, route, receiptKey, input);
      if (replay) return replay;
      const grades: { id: string; current_version: number }[] = await m.query(
        'SELECT grade_id AS id,current_version FROM assignment_zip_submissions WHERE id=$1 FOR UPDATE',
        [s.id],
      );
      const g = grades[0];
      if (!g) throw new Error('ZIP_GRADE_INVARIANT');
      if (g.current_version !== input.expectedVersion)
        throw new AssignmentException(409, 'GRADE_VERSION_CONFLICT');
      if (g.current_version > 0 && !input.reason?.trim())
        throw new AssignmentException(422, 'GRADE_CORRECTION_REASON_REQUIRED');
      if (this.cents(input.score) > this.cents(s.assignment_snapshot?.maxScore ?? '0'))
        throw new AssignmentException(422, 'INVALID_GRADE_SCORE');
      const version = g.current_version + 1;
      await m.query(
        'INSERT INTO assignment_zip_grade_revisions(grade_id,version,score,feedback,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6)',
        [g.id, version, input.score, input.feedback, actor.userId, input.reason ?? null],
      );
      await m.query('UPDATE assignment_zip_submissions SET current_version=$2 WHERE grade_id=$1', [
        g.id,
        version,
      ]);
      await this.audit(
        m,
        s.assignment_id,
        actor.userId,
        'GRADE',
        version,
        s.id,
        g.id,
        input.reason ?? null,
      );
      const outcome = await this.view(m, s, actor);
      await this.receipts.save(m, actor.userId, route, receiptKey, input, outcome);
      return outcome;
    });
  }
  async release(
    actor: AuthenticatedUser,
    id: string,
    input: ZipReleaseInput,
    key?: string,
  ): Promise<ZipView> {
    const receiptKey = this.receipts.key(key);
    this.access.enabled();
    this.mentor(actor);
    return this.db.transaction(async (m) => {
      const s = await this.access.submission(m, actor, id, true, true);
      const route = `release:${s.id}`;
      const replay = await this.receipts.replay<ZipView>(m, actor.userId, route, receiptKey, input);
      if (replay) return replay;
      const grades: { id: string; current_version: number; released_version: number | null }[] =
        await m.query(
          'SELECT grade_id AS id,current_version,released_version FROM assignment_zip_submissions WHERE id=$1 FOR UPDATE',
          [s.id],
        );
      const g = grades[0];
      if (
        !g ||
        g.current_version !== input.expectedVersion ||
        input.gradeVersion !== g.current_version ||
        g.released_version === g.current_version
      )
        throw new AssignmentException(409, 'GRADE_VERSION_CONFLICT');
      await m.query('UPDATE assignment_zip_submissions SET released_version=$2 WHERE grade_id=$1', [
        g.id,
        input.gradeVersion,
      ]);
      await this.audit(m, s.assignment_id, actor.userId, 'RELEASE', g.current_version, s.id, g.id);
      const outcome = await this.view(m, s, actor);
      await this.receipts.save(m, actor.userId, route, receiptKey, input, outcome);
      return outcome;
    });
  }
  async gradeHistory(
    actor: AuthenticatedUser,
    id: string,
    page: { page: number; pageSize: number },
  ) {
    this.mentor(actor);
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const s = await this.access.submission(m, actor, id);
      const counts: { total: number }[] = await m.query(
        'SELECT count(*)::int AS total FROM assignment_zip_grade_revisions r JOIN assignment_zip_submissions g ON g.grade_id=r.grade_id WHERE g.id=$1',
        [s.id],
      );
      const items: GradeRevision[] = await m.query(
        `SELECT r.version,r.score,r.feedback,r.actor_id AS "actorId",r.reason,r.created_at AS "createdAt"
        FROM assignment_zip_grade_revisions r JOIN assignment_zip_submissions g ON g.grade_id=r.grade_id WHERE g.id=$1 ORDER BY r.version DESC LIMIT $2 OFFSET $3`,
        [s.id, page.pageSize, (page.page - 1) * page.pageSize],
      );
      const audits = await m.query(
        `SELECT data->>'action' AS action,(data->>'version')::integer AS version,actor_id AS "actorId",data->>'reason' AS reason,occurred_at AS "createdAt" FROM audit_events
        WHERE source='assignment_zip_audits' AND (data->>'submission_id')::uuid=$1 AND data->>'action' IN ('GRADE','RELEASE') ORDER BY occurred_at DESC,id LIMIT $2 OFFSET $3`,
        [s.id, page.pageSize, (page.page - 1) * page.pageSize],
      );
      const auditCount: { total: number }[] = await m.query(
        "SELECT count(*)::int AS total FROM audit_events WHERE source='assignment_zip_audits' AND (data->>'submission_id')::uuid=$1 AND data->>'action' IN ('GRADE','RELEASE')",
        [s.id],
      );
      return {
        items,
        total: counts[0]?.total ?? 0,
        audits,
        totalAudits: auditCount[0]?.total ?? 0,
        ...page,
      };
    });
  }
  async view(m: EntityManager, s: ZipRow, actor: AuthenticatedUser): Promise<ZipView> {
    const files: NonNullable<ZipView['file']>[] = await m.query(
      `SELECT f.id,f.original_name AS "originalFilename",f.declared_mime_type AS "mimeType",f.declared_size_bytes AS "sizeBytes"
      FROM assignment_zip_submissions b JOIN assignment_files f ON f.id=b.file_id WHERE b.id=$1`,
      [s.id],
    );
    const mentor = actor.role === UserRole.MENTOR;
    const grades: {
      current_version: number;
      released_version: number | null;
      version: number | null;
      score: string;
      feedback: string;
    }[] = await m.query(
      `SELECT g.current_version,g.released_version,r.version,r.score,r.feedback
      FROM assignment_zip_submissions g LEFT JOIN assignment_zip_grade_revisions r ON r.grade_id=g.grade_id AND r.version=${mentor ? 'g.current_version' : 'g.released_version'} WHERE g.id=$1`,
      [s.id],
    );
    const g = grades[0];
    return {
      type: 'ZIP',
      id: s.id,
      assignmentId: s.assignment_id,
      studentId: s.student_id,
      status: s.status,
      version: s.version,
      attemptNumber: s.attempt_number,
      submittedAt: s.submitted_at,
      snapshot: s.assignment_snapshot,
      file: files[0] ?? null,
      grade: g?.version ? { version: g.version, score: g.score, feedback: g.feedback } : null,
      ...(mentor
        ? { gradeVersion: g?.current_version ?? 0, releasedVersion: g?.released_version ?? null }
        : {}),
    };
  }
  private open(s: ZipRow, version: number): void {
    if (s.status !== 'DRAFT') throw new AssignmentException(409, 'SUBMISSION_ALREADY_SUBMITTED');
    if (s.version !== version) throw new AssignmentException(409, 'SUBMISSION_VERSION_CONFLICT');
  }
  private revision(a: AssignmentRow, version: number): void {
    if (a.revision !== version) throw new AssignmentException(409, 'ASSIGNMENT_VERSION_CONFLICT');
  }
  private mentor(actor: AuthenticatedUser): void {
    if (actor.role !== UserRole.MENTOR) throw new AssignmentException(404, 'SUBMISSION_NOT_FOUND');
  }
  private cents(value: string): number {
    const [whole, fraction = ''] = value.split('.');
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  }
  private async attemptLimit(
    m: EntityManager,
    a: AssignmentRow,
    studentId: string,
  ): Promise<number> {
    const rows: { next: number }[] = await m.query(
      "SELECT COALESCE(max(attempt_number),0)+1 AS next FROM assignment_zip_submissions WHERE assignment_id=$1 AND student_id=$2 AND status='SUBMITTED'",
      [a.id, studentId],
    );
    const next = rows[0]?.next ?? 1;
    if (next > a.max_attempts) throw new AssignmentException(409, 'ATTEMPT_LIMIT_REACHED');
    return next;
  }
}
