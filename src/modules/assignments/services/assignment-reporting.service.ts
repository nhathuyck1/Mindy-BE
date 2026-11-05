import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

export interface AssignmentCounts {
  assignments: number;
  eligible: number;
  submitted: number;
  missing: number;
  ungraded: number;
  unreleased: number;
  released: number;
}
/** Public read participant. Caller supplies a class/session scope authorized in the same snapshot. */
@Injectable()
export class AssignmentReportingService {
  async counts(
    m: EntityManager,
    classId: string,
    sessions: string[] | null = null,
    unitId: string | null = null,
    studentId: string | null = null,
    filters: { type?: string; purpose?: string } = {},
  ): Promise<AssignmentCounts> {
    const rows: AssignmentCounts[] = await m.query(
      `WITH scoped AS (
      SELECT a.*,c.status AS class_status,s.status AS session_status FROM assignments a JOIN class_sessions s ON s.id=a.session_id JOIN classes c ON c.id=s.class_id
      WHERE s.class_id=$1 AND a.deleted_at IS NULL AND a.status IN ('PUBLISHED','ARCHIVED') AND ($2::uuid[] IS NULL OR s.id=ANY($2))
      AND ($3::uuid IS NULL OR s.class_unit_id=$3) AND ($5::text IS NULL OR a.type=$5) AND ($6::text IS NULL OR a.purpose=$6)),
      latest AS (
        SELECT DISTINCT ON(z.assignment_id,z.student_id) z.assignment_id,z.student_id,z.current_version,z.released_version
        FROM assignment_zip_submissions z JOIN scoped a ON a.id=z.assignment_id
        WHERE z.status='SUBMITTED' AND ($4::uuid IS NULL OR z.student_id=$4) ORDER BY z.assignment_id,z.student_id,z.attempt_number DESC),
      submitted AS (SELECT assignment_id,student_id,true AS graded,true AS released,false AS pending_release FROM assignment_submissions q WHERE q.status='GRADED' AND ($4::uuid IS NULL OR q.student_id=$4)
        UNION ALL SELECT assignment_id,student_id,COALESCE(current_version,0)>0,released_version IS NOT NULL,COALESCE(current_version,0)>COALESCE(released_version,0) FROM latest),
      eligible AS (SELECT a.id AS assignment_id,e.student_id,a.due_at FROM scoped a JOIN enrollments e ON e.class_id=$1 JOIN users u ON u.id=e.student_id
        WHERE a.status='PUBLISHED' AND a.class_status IN ('OPEN','IN_PROGRESS') AND a.session_status<>'CANCELLED'
        AND e.status='ACTIVE' AND u.status='ACTIVE' AND u.role='STUDENT' AND ($4::uuid IS NULL OR e.student_id=$4))
      SELECT (SELECT count(*)::int FROM scoped) AS assignments,(SELECT count(*)::int FROM eligible) AS eligible,
        count(*)::int AS submitted,count(*) FILTER(WHERE NOT graded)::int AS ungraded,
        count(*) FILTER(WHERE pending_release)::int AS unreleased,count(*) FILTER(WHERE released)::int AS released,
        (SELECT count(*)::int FROM eligible e WHERE e.due_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM submitted s WHERE s.assignment_id=e.assignment_id AND s.student_id=e.student_id)) AS missing
      FROM submitted s JOIN scoped a ON a.id=s.assignment_id`,
      [classId, sessions, unitId, studentId, filters.type ?? null, filters.purpose ?? null],
    );
    return (
      rows[0] ?? {
        assignments: 0,
        eligible: 0,
        submitted: 0,
        missing: 0,
        ungraded: 0,
        unreleased: 0,
        released: 0,
      }
    );
  }
}
