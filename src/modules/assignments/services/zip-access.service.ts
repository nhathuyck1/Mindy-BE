import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
import { UserRole } from '../../users/user-role.enum.js';
import type { AssignmentRow } from '../assignment.types.js';
import { AssignmentException } from '../exceptions/assignment.exceptions.js';
import type { ZipRow } from '../zip.types.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentAccessService } from './assignment-access.service.js';

@Injectable()
export class ZipAccessService {
  constructor(
    private readonly access: AssignmentAccessService,
    private readonly config: ConfigService,
  ) {}
  enabled(): void {
    if (!this.config.get<boolean>('ASSIGNMENT_ZIP_ENABLED', false))
      throw new AssignmentException(503, 'ASSIGNMENT_ZIP_DISABLED');
  }
  async actor(m: EntityManager, actor: AuthenticatedUser): Promise<void> {
    await this.access.actor(m, actor);
  }
  async assignment(
    m: EntityManager,
    actor: AuthenticatedUser,
    id: string,
    write = false,
    history = false,
  ): Promise<AssignmentRow> {
    const initial: AssignmentRow[] = await m.query(
      'SELECT * FROM assignments WHERE id=$1 AND deleted_at IS NULL',
      [id],
    );
    const row = initial[0];
    if (!row) throw new AssignmentException(404, 'ASSIGNMENT_NOT_FOUND');
    try {
      await this.access.session(m, actor, row.session_id, write, history);
    } catch (e) {
      if (e instanceof AssignmentException && e.getStatus() === 403)
        throw new AssignmentException(404, 'ASSIGNMENT_NOT_FOUND');
      throw e;
    }
    const rows: AssignmentRow[] = write
      ? await m.query('SELECT * FROM assignments WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [
          id,
        ])
      : initial;
    const current = rows[0];
    if (!current || (actor.role === UserRole.STUDENT && current.status !== 'PUBLISHED'))
      throw new AssignmentException(404, 'ASSIGNMENT_NOT_FOUND');
    return current;
  }
  async work(
    m: EntityManager,
    actor: AuthenticatedUser,
    id: string,
  ): Promise<{ assignment: AssignmentRow; enrollmentId: string }> {
    this.enabled();
    if (actor.role !== UserRole.STUDENT) throw new AssignmentException(404, 'ASSIGNMENT_NOT_FOUND');
    const assignment = await this.assignment(m, actor, id, true);
    if (assignment.type !== 'ZIP') throw new AssignmentException(422, 'ASSIGNMENT_TYPE_MISMATCH');
    const clock: { open: boolean }[] = await m.query(
      'SELECT clock_timestamp()<$1::timestamptz AS open',
      [assignment.due_at],
    );
    if (!clock[0]?.open) throw new AssignmentException(409, 'ASSIGNMENT_DEADLINE_PASSED');
    const enrollmentId = await this.access.session(m, actor, assignment.session_id, true);
    if (!enrollmentId) throw new AssignmentException(404, 'ASSIGNMENT_NOT_FOUND');
    return { assignment, enrollmentId };
  }
  async submission(
    m: EntityManager,
    actor: AuthenticatedUser,
    id: string,
    write = false,
    grading = false,
  ): Promise<ZipRow> {
    const initial: ZipRow[] = await m.query(
      'SELECT * FROM assignment_zip_submissions WHERE id=$1',
      [id],
    );
    const row = initial[0];
    if (!row) throw new AssignmentException(404, 'SUBMISSION_NOT_FOUND');
    if (actor.role === UserRole.STUDENT) {
      await this.access.actor(m, actor, write);
      if (row.student_id !== actor.userId)
        throw new AssignmentException(404, 'SUBMISSION_NOT_FOUND');
      if (write || row.status === 'DRAFT') {
        if (write) await this.work(m, actor, row.assignment_id);
        else await this.assignment(m, actor, row.assignment_id);
      }
    } else {
      await this.assignment(m, actor, row.assignment_id, write, grading);
      if (row.status !== 'SUBMITTED') throw new AssignmentException(404, 'SUBMISSION_NOT_FOUND');
    }
    const rows: ZipRow[] = write
      ? await m.query('SELECT * FROM assignment_zip_submissions WHERE id=$1 FOR UPDATE', [id])
      : initial;
    if (!rows[0]) throw new AssignmentException(404, 'SUBMISSION_NOT_FOUND');
    return rows[0];
  }
}
