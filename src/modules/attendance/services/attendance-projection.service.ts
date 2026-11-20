import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { EFFECTIVE_MENTOR_SQL } from '../../classes/domain/effective-mentor.js';
import type { ClassStatus } from '../../classes/enums/class-status.enum.js';
import type { DeliveryMode } from '../../classes/enums/delivery-mode.enum.js';
import type { SessionStatus } from '../../classes/enums/session-status.enum.js';
import {
  ATTENDANCE_COUNTS_SQL,
  ATTENDANCE_CREDIT_CTE,
  type AttendanceApplicability,
  type AttendanceCounts,
  type CreditedStatus,
} from '../domain/attendance-credit.js';
import type { AttendanceHistoryItemDto } from '../dtos/attendance-report.dto.js';
import type { AttendanceStatus } from '../enums/attendance-status.enum.js';

export interface AttendanceRange {
  readonly from?: Date;
  readonly to?: Date;
}
export interface TimetableQuery {
  readonly from: Date;
  readonly to: Date;
  readonly page: number;
  readonly pageSize: number;
  readonly classId?: string;
  readonly includeCancelled: boolean;
}
export interface AttendanceTimetableEvent {
  readonly sessionId: string;
  readonly sessionNumber: number;
  readonly sessionTitle: string;
  readonly sessionStatus: SessionStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly roomName: string | null;
  readonly classId: string;
  readonly classCode: string;
  readonly className: string;
  readonly classStatus: ClassStatus;
  readonly courseId: string;
  readonly courseTitle: string;
  readonly classUnitId: string;
  readonly unitTitle: string;
  readonly deliveryMode: DeliveryMode;
  readonly mentorId: string | null;
  readonly mentorName: string | null;
  readonly enrollmentId: string;
  readonly accessMode: 'FULL' | 'CASH_PREVIEW' | 'SESSION_MAKEUP';
  readonly assignmentType: 'PRIMARY' | 'SUBSTITUTE';
  readonly attendanceStatus: AttendanceStatus | null;
  readonly attendanceApplicability: AttendanceApplicability;
  readonly attendanceExcluded: boolean;
  readonly creditedAttendanceStatus: CreditedStatus | null;
  readonly makeupForSessionId: string | null;
  readonly makeupRootSessionId: string | null;
  readonly sourceClassId: string | null;
  readonly sourceSessionId: string | null;
  readonly makeupPlacementId: string | null;
}
type CreditRow = {
  enrollmentId: string;
  sessionId: string;
  rootId: string;
  applicability: AttendanceApplicability;
  creditedStatus: CreditedStatus | null;
  creditRank: string;
};
type TimetableRow = Omit<
  AttendanceTimetableEvent,
  'attendanceStatus' | 'attendanceApplicability' | 'attendanceExcluded' | 'creditedAttendanceStatus'
> & {
  physicalStatus: AttendanceStatus | null;
  sourceScopeClassId: string;
  sourceRootId: string;
};

const REGULAR_ACCESS = `(e.status='ACTIVE' OR (e.status='PENDING_PAYMENT' AND o.payment_type='CASH'
  AND o.status='PENDING' AND o.expires_at>$2)) AND c.status<>'CANCELLED'`;
const GUEST_ACCESS = `p.student_id=$1 AND p.status IN ('ASSIGNED','COMPLETED') AND e.status='ACTIVE'
  AND source.status IN ('OPEN','IN_PROGRESS') AND c.status IN ('OPEN','IN_PROGRESS') AND s.status<>'CANCELLED'`;
const EVENT_FIELDS = `s.id AS "sessionId",s.session_number AS "sessionNumber",s.title AS "sessionTitle",
  s.status AS "sessionStatus",s.starts_at AS "startsAt",s.ends_at AS "endsAt",s.room_name AS "roomName",
  c.id AS "classId",c.code AS "classCode",c.name AS "className",c.status AS "classStatus",
  c.course_id AS "courseId",course.title AS "courseTitle",u.id AS "classUnitId",cu.title AS "unitTitle",
  c.delivery_mode AS "deliveryMode",${EFFECTIVE_MENTOR_SQL} AS "mentorId",mentor.display_name AS "mentorName",
  CASE WHEN s.mentor_override_id IS NULL THEN 'PRIMARY' ELSE 'SUBSTITUTE' END AS "assignmentType",
  s.makeup_for_session_id AS "makeupForSessionId",s.makeup_root_session_id AS "makeupRootSessionId"`;
const EVENT_METADATA = `JOIN class_units u ON u.id=s.class_unit_id JOIN classes c ON c.id=u.class_id
  JOIN courses course ON course.id=c.course_id JOIN course_units cu ON cu.id=u.course_unit_id
  LEFT JOIN users mentor ON mentor.id=${EFFECTIVE_MENTOR_SQL}`;
const TIMETABLE_CTE = `WITH events AS (
  SELECT ${EVENT_FIELDS},e.id AS "enrollmentId",CASE WHEN e.status='ACTIVE' THEN 'FULL' ELSE 'CASH_PREVIEW' END AS "accessMode",
    NULL::uuid AS "sourceClassId",NULL::uuid AS "sourceSessionId",NULL::uuid AS "makeupPlacementId",
    e.class_id AS "sourceScopeClassId",coalesce(s.makeup_root_session_id,s.id) AS "sourceRootId",r.status AS "physicalStatus",0 AS priority
  FROM enrollments e JOIN order_details od ON od.id=e.order_detail_id AND od.class_id=e.class_id
  JOIN orders o ON o.id=od.order_id AND o.student_id=e.student_id
  JOIN class_sessions s ON s.class_id=e.class_id ${EVENT_METADATA}
  LEFT JOIN attendance_records r ON r.enrollment_id=e.id AND r.session_id=s.id
  WHERE e.student_id=$1 AND ${REGULAR_ACCESS}
  UNION ALL
  SELECT ${EVENT_FIELDS},p.enrollment_id,'SESSION_MAKEUP',p.source_class_id,p.source_session_id,p.id,
    p.source_class_id,p.source_root_session_id,g.status,1
  FROM makeup_placements p JOIN enrollments e ON e.id=p.enrollment_id
  JOIN classes source ON source.id=p.source_class_id JOIN class_sessions s ON s.id=p.target_session_id ${EVENT_METADATA}
  LEFT JOIN guest_attendance_records g ON g.placement_id=p.id
  WHERE ${GUEST_ACCESS}
), deduplicated AS (
  SELECT events.*,row_number() OVER(PARTITION BY "sessionId" ORDER BY priority,"enrollmentId") AS event_rank FROM events
), filtered AS (
  SELECT * FROM deduplicated WHERE event_rank=1 AND "startsAt"<$4 AND "endsAt">$3
    AND ($5::uuid IS NULL OR "classId"=$5) AND ($6::boolean OR "sessionStatus"<>'CANCELLED')
)`;

/** Public read provider. Caller supplies the read-only snapshot; no commands or locks. */
@Injectable()
export class AttendanceProjectionService {
  async canViewScheduleClass(
    m: EntityManager,
    studentId: string,
    classId: string,
    now: Date,
  ): Promise<boolean> {
    const rows: { allowed: boolean }[] = await m.query(
      `SELECT
      EXISTS(SELECT 1 FROM enrollments e JOIN classes c ON c.id=e.class_id
        JOIN order_details od ON od.id=e.order_detail_id AND od.class_id=c.id
        JOIN orders o ON o.id=od.order_id AND o.student_id=e.student_id
        WHERE e.student_id=$1 AND c.id=$3 AND ${REGULAR_ACCESS})
      OR EXISTS(SELECT 1 FROM makeup_placements p JOIN enrollments e ON e.id=p.enrollment_id
        JOIN classes source ON source.id=p.source_class_id JOIN classes c ON c.id=p.target_class_id
        JOIN class_sessions s ON s.id=p.target_session_id WHERE c.id=$3 AND ${GUEST_ACCESS}) AS allowed`,
      [studentId, now, classId],
    );
    return rows[0]?.allowed ?? false;
  }

  async timetable(
    m: EntityManager,
    studentId: string,
    query: TimetableQuery,
    now: Date,
  ): Promise<{
    items: AttendanceTimetableEvent[];
    total: number;
  }> {
    const params = [
      studentId,
      now,
      query.from,
      query.to,
      query.classId ?? null,
      query.includeCancelled,
    ];
    const counts: { total: number }[] = await m.query(
      `${TIMETABLE_CTE} SELECT count(*)::int AS total FROM filtered`,
      params,
    );
    const rows: TimetableRow[] = await m.query(
      `${TIMETABLE_CTE}
      SELECT * FROM filtered ORDER BY "startsAt","sessionId" LIMIT $7 OFFSET $8`,
      [...params, query.pageSize, (query.page - 1) * query.pageSize],
    );
    const credits: CreditRow[] = rows.length
      ? await m.query(
          `${ATTENDANCE_CREDIT_CTE}
      SELECT enrollment_id AS "enrollmentId",session_id AS "sessionId",root_id AS "rootId",applicability,
        credited_status AS "creditedStatus",credit_rank AS "creditRank" FROM credit WHERE root_id=ANY($3::uuid[])`,
          [
            [...new Set(rows.map((r) => r.sourceScopeClassId))],
            studentId,
            [...new Set(rows.map((r) => r.sourceRootId))],
          ],
        )
      : [];
    const byObligation = new Map(credits.map((r) => [`${r.enrollmentId}:${r.rootId}`, r]));
    return {
      total: counts[0]?.total ?? 0,
      items: rows.map((row) => {
        const credit = byObligation.get(`${row.enrollmentId}:${row.sourceRootId}`);
        const preview = row.accessMode === 'CASH_PREVIEW';
        const owner = credit?.creditRank === '1';
        const effective =
          row.accessMode === 'SESSION_MAKEUP' || credit?.sessionId === row.sessionId;
        const credited = !preview && owner && effective ? (credit?.creditedStatus ?? null) : null;
        // Explicit mapping prevents internal scope, ranks and SQL evidence from leaking into GET.
        return {
          sessionId: row.sessionId,
          sessionNumber: row.sessionNumber,
          sessionTitle: row.sessionTitle,
          sessionStatus: row.sessionStatus,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          roomName: row.roomName,
          classId: row.classId,
          classCode: row.classCode,
          className: row.className,
          classStatus: row.classStatus,
          courseId: row.courseId,
          courseTitle: row.courseTitle,
          classUnitId: row.classUnitId,
          unitTitle: row.unitTitle,
          deliveryMode: row.deliveryMode,
          mentorId: row.mentorId,
          mentorName: row.mentorName,
          enrollmentId: row.enrollmentId,
          accessMode: row.accessMode,
          assignmentType: row.assignmentType,
          makeupForSessionId: row.makeupForSessionId,
          makeupRootSessionId: row.makeupRootSessionId,
          sourceClassId: row.sourceClassId,
          sourceSessionId: row.sourceSessionId,
          makeupPlacementId: row.makeupPlacementId,
          attendanceStatus: preview ? null : row.physicalStatus,
          creditedAttendanceStatus: credited,
          attendanceApplicability: preview
            ? 'PAYMENT_PENDING'
            : owner && effective
              ? (credit?.applicability ?? 'LEGACY_NO_DATA')
              : 'NOT_ELIGIBLE',
          attendanceExcluded: credited === null,
        };
      }),
    };
  }

  async summary(
    m: EntityManager,
    classId: string,
    studentId: string,
    range: AttendanceRange,
  ): Promise<AttendanceCounts> {
    const rows: AttendanceCounts[] = await m.query(
      `${ATTENDANCE_CREDIT_CTE}
      SELECT ${ATTENDANCE_COUNTS_SQL} FROM credit
      WHERE ($3::timestamptz IS NULL OR (starts_at<$4 AND ends_at>$3))`,
      [[classId], studentId, range.from ?? null, range.to ?? null],
    );
    return rows[0] ?? { present: 0, absent: 0, unmarked: 0, excluded: 0, makeupPending: 0 };
  }

  async history(
    m: EntityManager,
    classId: string,
    studentId: string,
    range: AttendanceRange,
    page: { page: number; pageSize: number },
  ): Promise<{ items: AttendanceHistoryItemDto[]; total: number }> {
    const params = [[classId], studentId, range.from ?? null, range.to ?? null];
    const from = `FROM enrollments e JOIN class_sessions s ON s.class_id=e.class_id
      JOIN classes c ON c.id=e.class_id
      LEFT JOIN users mentor ON mentor.id=${EFFECTIVE_MENTOR_SQL}
      LEFT JOIN attendance_records r ON r.enrollment_id=e.id AND r.session_id=s.id
      JOIN credit z ON z.enrollment_id=e.id AND z.root_id=coalesce(s.makeup_root_session_id,s.id)
      WHERE e.class_id=ANY($1::uuid[]) AND e.student_id=$2
        AND ($3::timestamptz IS NULL OR (s.starts_at<$4 AND s.ends_at>$3))`;
    const counts: { total: number }[] = await m.query(
      `${ATTENDANCE_CREDIT_CTE} SELECT count(*)::int AS total ${from}`,
      params,
    );
    const rows: (AttendanceHistoryItemDto & {
      mentorId: string | null;
      mentorName: string | null;
    })[] = await m.query(
      `${ATTENDANCE_CREDIT_CTE}
      SELECT s.id AS "sessionId",e.id AS "enrollmentId",z.root_id AS "rootSessionId",s.title,
        s.starts_at AS "startsAt",s.ends_at AS "endsAt",s.status AS "sessionStatus",r.status AS "attendanceStatus",
        CASE WHEN s.id=z.session_id AND z.credit_rank=1 THEN z.applicability ELSE 'NOT_ELIGIBLE' END AS "attendanceApplicability",
        NOT(s.id=z.session_id AND z.credited_status IS NOT NULL) AS excluded,
        ${EFFECTIVE_MENTOR_SQL} AS "mentorId",mentor.display_name AS "mentorName",
        CASE WHEN s.mentor_override_id IS NULL THEN 'PRIMARY' ELSE 'SUBSTITUTE' END AS "assignmentType",
        s.makeup_for_session_id AS "makeupForSessionId",s.makeup_root_session_id AS "makeupRootSessionId",
        z.placement_id AS "makeupPlacementId",
        CASE WHEN s.id=z.session_id AND z.credited_status IS NOT NULL
          THEN CASE WHEN z.applicability='MAKEUP_CREDITED' THEN z.target_session_id ELSE s.id END ELSE NULL END AS "creditSessionId",
        CASE WHEN s.id=z.session_id THEN z.credited_status ELSE NULL END AS "creditedAttendanceStatus"
      ${from} ORDER BY s.starts_at DESC,s.id DESC,e.id LIMIT $5 OFFSET $6`,
      [...params, page.pageSize, (page.page - 1) * page.pageSize],
    );
    return {
      total: counts[0]?.total ?? 0,
      items: rows.map(({ mentorId, mentorName, ...row }) => ({
        ...row,
        effectiveMentor: mentorId ? { id: mentorId, displayName: mentorName } : null,
      })),
    };
  }

  async classSummary(
    m: EntityManager,
    classId: string,
    range: AttendanceRange,
    page: { page: number; pageSize: number },
  ): Promise<{
    items: (AttendanceCounts & {
      enrollmentId: string;
      student: { id: string; displayName: string };
    })[];
    total: number;
  }> {
    const counts: { total: number }[] = await m.query(
      'SELECT count(*)::int AS total FROM enrollments WHERE class_id=$1',
      [classId],
    );
    const rows: (AttendanceCounts & {
      enrollmentId: string;
      studentId: string;
      displayName: string;
    })[] = await m.query(
      `${ATTENDANCE_CREDIT_CTE},
      totals AS (SELECT enrollment_id,${ATTENDANCE_COUNTS_SQL} FROM credit
        WHERE ($3::timestamptz IS NULL OR (starts_at<$4 AND ends_at>$3)) GROUP BY enrollment_id)
      SELECT e.id AS "enrollmentId",e.student_id AS "studentId",u.display_name AS "displayName",
        coalesce(t.present,0) AS present,coalesce(t.absent,0) AS absent,coalesce(t.unmarked,0) AS unmarked,
        coalesce(t.excluded,0) AS excluded,coalesce(t."makeupPending",0) AS "makeupPending"
      FROM enrollments e JOIN users u ON u.id=e.student_id LEFT JOIN totals t ON t.enrollment_id=e.id
      WHERE e.class_id=ANY($1::uuid[]) ORDER BY u.display_name,e.id LIMIT $5 OFFSET $6`,
      [
        [classId],
        null,
        range.from ?? null,
        range.to ?? null,
        page.pageSize,
        (page.page - 1) * page.pageSize,
      ],
    );
    return {
      total: counts[0]?.total ?? 0,
      items: rows.map(({ studentId, displayName, ...row }) => ({
        ...row,
        student: { id: studentId, displayName },
      })),
    };
  }
}
