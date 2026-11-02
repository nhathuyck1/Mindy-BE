import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { DataSource } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/auth.types.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { MentorWorkspaceService } from '../../classes/services/mentor-workspace.service.js';
import { UserRole } from '../../users/user-role.enum.js';
import type { AssignmentQueryDto } from '../dtos/assignment-input.dto.js';
import type { SubmissionQuery } from '../dtos/zip-input.dto.js';
import { AssignmentException } from '../exceptions/assignment.exceptions.js';
import type { ZipRow } from '../zip.types.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentAccessService } from './assignment-access.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { AssignmentReportingService } from './assignment-reporting.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ZipAccessService } from './zip-access.service.js';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ZipSubmissionsService } from './zip-submissions.service.js';

@Injectable()
export class AssignmentHistoryService {
  constructor(
    private readonly db: DataSource,
    private readonly access: AssignmentAccessService,
    private readonly zipAccess: ZipAccessService,
    private readonly zip: ZipSubmissionsService,
    private readonly workspace: MentorWorkspaceService,
    private readonly reporting: AssignmentReportingService,
  ) {}
  async submissions(actor: AuthenticatedUser, id: string, query: SubmissionQuery) {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await this.access.actor(m, actor);
      if (
        actor.role === UserRole.STUDENT &&
        query.status &&
        !['SUBMITTED', 'RELEASED'].includes(query.status)
      )
        throw new AssignmentException(422, 'INVALID_SUBMISSION_FILTER');
      if (actor.role === UserRole.MENTOR) await this.zipAccess.assignment(m, actor, id);
      else {
        const history = await m.query(
          `SELECT 1 FROM assignment_zip_submissions WHERE assignment_id=$1 AND student_id=$2 AND status='SUBMITTED'
          UNION ALL SELECT 1 FROM assignment_submissions WHERE assignment_id=$1 AND student_id=$2 AND status='GRADED' LIMIT 1`,
          [id, actor.userId],
        );
        if (!history.length) await this.zipAccess.assignment(m, actor, id);
      }
      const student = actor.role === UserRole.STUDENT ? actor.userId : (query.studentId ?? null);
      const from = `FROM (SELECT 'ZIP'::text AS type,z.id,z.student_id,z.attempt_number,z.submitted_at,
          ${actor.role === UserRole.MENTOR ? "CASE WHEN g.released_version IS NOT NULL THEN 'RELEASED' WHEN COALESCE(g.current_version,0)>0 THEN 'GRADED' ELSE 'UNGRADED' END" : "CASE WHEN g.released_version IS NOT NULL THEN 'RELEASED' ELSE 'SUBMITTED' END"} AS status,
          row_number() OVER(PARTITION BY z.student_id ORDER BY z.attempt_number DESC) AS rank,
          COALESCE(g.current_version,0)>COALESCE(g.released_version,0) AS pending_release,COALESCE(g.current_version,0)>0 AS graded
          FROM assignment_zip_submissions z LEFT JOIN assignment_zip_grades g ON g.submission_id=z.id WHERE z.assignment_id=$1 AND z.status='SUBMITTED'
          UNION ALL SELECT 'QUIZ',q.id,q.student_id,q.attempt_number,q.submitted_at,'RELEASED',1,false,true FROM assignment_submissions q WHERE q.assignment_id=$1 AND q.status='GRADED') t
        WHERE ($2::uuid IS NULL OR t.student_id=$2) AND ($3::boolean OR rank=1) AND ($4::integer IS NULL OR attempt_number=$4)
        AND ($5::text IS NULL OR $5='SUBMITTED' OR status=$5 OR ($5='UNRELEASED' AND pending_release) OR ($5='GRADED' AND graded))`;
      const params = [
        id,
        student,
        actor.role === UserRole.STUDENT || query.history === 'true',
        query.attemptNumber ?? null,
        query.status ?? null,
      ];
      const count: { total: number }[] = await m.query(
        `SELECT count(*)::int AS total ${from}`,
        params,
      );
      const rows: {
        type: 'ZIP' | 'QUIZ';
        id: string;
        student_id: string;
        attempt_number: number;
        submitted_at: Date;
        status: string;
      }[] = await m.query(`SELECT * ${from} ORDER BY submitted_at DESC,id LIMIT $6 OFFSET $7`, [
        ...params,
        query.pageSize,
        (query.page - 1) * query.pageSize,
      ]);
      const items = [];
      for (const row of rows) {
        if (row.type === 'ZIP') {
          const submissions: ZipRow[] = await m.query(
            'SELECT * FROM assignment_zip_submissions WHERE id=$1',
            [row.id],
          );
          if (submissions[0]) items.push(await this.zip.view(m, submissions[0], actor));
        } else {
          const results: { result: unknown }[] = await m.query(
            'SELECT result FROM assignment_submissions WHERE id=$1',
            [row.id],
          );
          items.push({
            type: 'QUIZ',
            id: row.id,
            assignmentId: id,
            studentId: row.student_id,
            attemptNumber: row.attempt_number,
            submittedAt: row.submitted_at,
            status: 'GRADED',
            result: results[0]?.result ?? null,
            instructionFiles: await this.zip.instructions(m, id),
          });
        }
      }
      return { items, total: count[0]?.total ?? 0, page: query.page, pageSize: query.pageSize };
    });
  }
  async roster(actor: AuthenticatedUser, id: string, query: SubmissionQuery) {
    if (actor.role !== UserRole.MENTOR) throw new AssignmentException(404, 'ASSIGNMENT_NOT_FOUND');
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const a = await this.zipAccess.assignment(m, actor, id);
      const from = `FROM enrollments e JOIN users u ON u.id=e.student_id JOIN class_sessions s ON s.class_id=e.class_id JOIN classes c ON c.id=e.class_id
        LEFT JOIN LATERAL(SELECT z.id,g.current_version,g.released_version FROM assignment_zip_submissions z LEFT JOIN assignment_zip_grades g ON g.submission_id=z.id
          WHERE z.assignment_id=$1 AND z.student_id=e.student_id AND z.status='SUBMITTED' ORDER BY z.attempt_number DESC LIMIT 1) z ON true
        LEFT JOIN assignment_submissions q ON q.assignment_id=$1 AND q.student_id=e.student_id AND q.status='GRADED'
        WHERE s.id=$2 AND e.status='ACTIVE' AND u.status='ACTIVE' AND u.role='STUDENT' AND c.status IN ('OPEN','IN_PROGRESS') AND s.status<>'CANCELLED'
        AND ($3::uuid IS NULL OR e.student_id=$3)`;
      const params = [a.id, a.session_id, query.studentId ?? null];
      const count: { total: number }[] = await m.query(
        `SELECT count(*)::int AS total ${from}`,
        params,
      );
      const rows = await m.query(
        `SELECT e.student_id AS "studentId",e.id AS "enrollmentId",u.display_name AS "displayName",
        COALESCE(z.id,q.id) AS "submissionId",(z.id IS NOT NULL OR q.id IS NOT NULL) AS submitted,
        (q.id IS NOT NULL OR COALESCE(z.current_version,0)>0) AS graded,(q.id IS NOT NULL OR z.released_version IS NOT NULL) AS released,
        COALESCE(($6::text='PUBLISHED' AND $7::timestamptz<=clock_timestamp() AND z.id IS NULL AND q.id IS NULL),false) AS missing
        ${from} ORDER BY u.display_name,e.id LIMIT $4 OFFSET $5`,
        [...params, query.pageSize, (query.page - 1) * query.pageSize, a.status, a.due_at],
      );
      return {
        items: rows,
        total: count[0]?.total ?? 0,
        page: query.page,
        pageSize: query.pageSize,
        denominator: 'CURRENT_ACTIVE_ENTITLEMENTS' as const,
      };
    });
  }
  async metrics(actor: AuthenticatedUser, id: string, query: AssignmentQueryDto) {
    return this.db.transaction('REPEATABLE READ', async (m) => {
      await this.access.actor(m, actor);
      const scope = await this.workspace.scope(m, actor, id);
      let sessions: string[] | null = null;
      if (scope.accessScope === 'SESSION')
        sessions = (await this.workspace.sessionsQuery(m, actor, scope).getMany()).map((s) => s.id);
      if (query.sessionId) {
        await this.access.session(m, actor, query.sessionId);
        const scoped = await this.workspace
          .sessionsQuery(m, actor, scope)
          .andWhere('s.id=:sid', { sid: query.sessionId })
          .getMany();
        sessions = scoped.map((s) => s.id);
      }
      return {
        ...(await this.reporting.counts(m, id, sessions, null, null, query)),
        denominator: 'CURRENT_ACTIVE_ASSIGNMENT_STUDENT_PAIRS',
        historyIncludesTerminalEnrollments: true,
        missingIsHistorical: false,
      };
    });
  }
}
