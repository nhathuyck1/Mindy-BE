import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

/** Public shared query predicates; all clocks are supplied by the caller after locks. */
export const TIMETABLE_ENROLLMENT_SQL = `(e.status='ACTIVE' OR
  (e.status='PENDING_PAYMENT' AND EXISTS(SELECT 1 FROM order_details d JOIN orders o ON o.id=d.order_id
    WHERE d.id=e.order_detail_id AND o.payment_type='CASH' AND o.status='PENDING' AND o.expires_at > $1)))`;

@Injectable()
export class ScheduleReservationsService {
  async lockStudents(m: EntityManager, ids: readonly string[]): Promise<void> {
    for (const id of [...new Set(ids)].sort())
      await m.query("SELECT pg_advisory_xact_lock(hashtextextended('student-schedule:' || $1,0))", [
        id,
      ]);
  }

  async classStudentIds(m: EntityManager, classId: string): Promise<string[]> {
    const rows: { id: string }[] = await m.query(
      `SELECT student_id AS id FROM enrollments WHERE class_id=$1 AND status IN ('ACTIVE','PENDING_PAYMENT')
       UNION SELECT student_id FROM makeup_placements WHERE target_class_id=$1 AND status='ASSIGNED'`,
      [classId],
    );
    return rows.map((r) => r.id);
  }

  async guestPeak(m: EntityManager, classIds: readonly string[]): Promise<Map<string, number>> {
    const rows: { id: string; seats: string }[] = await m.query(
      `SELECT class_id AS id,max(seats) AS seats FROM (
        SELECT p.target_class_id AS class_id,p.target_session_id,count(*) AS seats
        FROM makeup_placements p JOIN class_sessions s ON s.id=p.target_session_id
        WHERE p.target_class_id=ANY($1::uuid[]) AND p.status='ASSIGNED'
          AND s.status IN ('SCHEDULED','IN_PROGRESS') GROUP BY p.target_class_id,p.target_session_id
      ) x GROUP BY class_id`,
      [classIds],
    );
    return new Map(rows.map((r) => [r.id, Number(r.seats)]));
  }

  async remainingCapacity(m: EntityManager, sessionId: string, now: Date): Promise<number> {
    const rows: { remaining: number }[] = await m.query(
      `SELECT c.max_students - (SELECT count(*)::int FROM enrollments e WHERE e.class_id=c.id
        AND (e.status='ACTIVE' OR (e.status='PENDING_PAYMENT' AND EXISTS(
          SELECT 1 FROM order_details d JOIN orders o ON o.id=d.order_id
          WHERE d.id=e.order_detail_id AND o.status='PENDING' AND o.expires_at>$2))))
        - (SELECT count(*)::int FROM makeup_placements p WHERE p.target_session_id=s.id AND p.status='ASSIGNED')
        AS remaining FROM class_sessions s JOIN class_units u ON u.id=s.class_unit_id
        JOIN classes c ON c.id=u.class_id WHERE s.id=$1`,
      [sessionId, now],
    );
    return rows[0]?.remaining ?? 0;
  }

  async studentConflicts(
    m: EntityManager,
    studentId: string,
    startsAt: Date,
    endsAt: Date,
    excludedSessionIds: readonly string[],
    now: Date,
  ): Promise<{ sessionId: string; startsAt: Date; endsAt: Date }[]> {
    return m.query(
      `SELECT DISTINCT s.id AS "sessionId",s.starts_at AS "startsAt",s.ends_at AS "endsAt"
       FROM class_sessions s JOIN class_units u ON u.id=s.class_unit_id JOIN classes c ON c.id=u.class_id
       WHERE c.status IN ('OPEN','IN_PROGRESS') AND s.status IN ('SCHEDULED','IN_PROGRESS')
         AND s.id<>ALL($5::uuid[]) AND s.starts_at<$4 AND s.ends_at>$3 AND (
           EXISTS(SELECT 1 FROM enrollments e WHERE e.class_id=c.id AND e.student_id=$2 AND ${TIMETABLE_ENROLLMENT_SQL})
           OR EXISTS(SELECT 1 FROM makeup_placements p WHERE p.target_session_id=s.id
             AND p.student_id=$2 AND p.status='ASSIGNED')) ORDER BY s.starts_at,s.id`,
      [now, studentId, startsAt, endsAt, excludedSessionIds],
    );
  }

  async hasEffectiveEnrollment(
    m: EntityManager,
    studentId: string,
    classId: string,
  ): Promise<boolean> {
    const rows: unknown[] = await m.query(
      `SELECT 1 FROM enrollments e WHERE e.student_id=$1 AND e.class_id=$2
        AND (e.status IN ('ACTIVE','COMPLETED') OR (e.status='PENDING_PAYMENT' AND EXISTS(
          SELECT 1 FROM order_details d JOIN orders o ON o.id=d.order_id WHERE d.id=e.order_detail_id
          AND o.status='PENDING' AND o.expires_at>clock_timestamp()))) LIMIT 1`,
      [studentId, classId],
    );
    return rows.length > 0;
  }

  async hasUnresolved(m: EntityManager, classId: string): Promise<boolean> {
    const rows: unknown[] = await m.query(
      `SELECT 1 FROM makeup_placements WHERE source_class_id=$1
        AND status IN ('ASSIGNED','NEEDS_REASSIGNMENT') LIMIT 1`,
      [classId],
    );
    return rows.length > 0;
  }

  async hasSessionPlacements(m: EntityManager, ids: readonly string[]): Promise<boolean> {
    const rows: unknown[] = await m.query(
      `SELECT 1 FROM makeup_placements WHERE (source_session_id=ANY($1::uuid[]) OR target_session_id=ANY($1::uuid[]))
        AND status <> 'CANCELLED' LIMIT 1`,
      [ids],
    );
    return rows.length > 0;
  }

  async hasOutgoingUnresolved(m: EntityManager, sessionId: string): Promise<boolean> {
    const rows: unknown[] = await m.query(
      `SELECT 1 FROM makeup_placements WHERE source_session_id=$1
      AND status IN ('ASSIGNED','NEEDS_REASSIGNMENT') LIMIT 1`,
      [sessionId],
    );
    return rows.length > 0;
  }

  async guestContext(
    m: EntityManager,
    sessionId: string,
    studentId: string,
  ): Promise<string | null> {
    const rows: { id: string }[] = await m.query(
      `SELECT p.id FROM makeup_placements p JOIN enrollments e ON e.id=p.enrollment_id
       JOIN classes source ON source.id=p.source_class_id JOIN classes target ON target.id=p.target_class_id
       JOIN class_sessions s ON s.id=p.target_session_id
       WHERE p.student_id=$1 AND p.target_session_id=$2 AND p.status IN ('ASSIGNED','COMPLETED')
         AND e.status='ACTIVE' AND source.status IN ('OPEN','IN_PROGRESS')
         AND target.status IN ('OPEN','IN_PROGRESS') AND s.status<>'CANCELLED' LIMIT 1`,
      [studentId, sessionId],
    );
    return rows[0]?.id ?? null;
  }

  /** Record only replacement-related conflicts. Registration/settlement always continues. */
  async recordMakeupConflicts(
    m: EntityManager,
    studentIds: readonly string[],
    now: Date,
  ): Promise<void> {
    await m.query(
      `INSERT INTO student_schedule_conflicts(enrollment_id,source_session_id,conflicting_intervals)
       SELECT e.id,s.id,jsonb_agg(DISTINCT jsonb_build_object('sessionId',other.id,'startsAt',other.starts_at,'endsAt',other.ends_at))
       FROM enrollments e JOIN classes c ON c.id=e.class_id JOIN class_units u ON u.class_id=c.id
       JOIN class_sessions s ON s.class_unit_id=u.id
       JOIN class_sessions other ON other.id<>s.id AND other.starts_at<s.ends_at AND other.ends_at>s.starts_at
       JOIN class_units ou ON ou.id=other.class_unit_id JOIN classes oc ON oc.id=ou.class_id
       WHERE e.student_id=ANY($2::uuid[]) AND ${TIMETABLE_ENROLLMENT_SQL}
         AND s.makeup_for_session_id IS NOT NULL AND s.status='SCHEDULED'
         AND c.status IN ('OPEN','IN_PROGRESS') AND oc.status IN ('OPEN','IN_PROGRESS')
         AND other.status IN ('SCHEDULED','IN_PROGRESS') AND (
           EXISTS(SELECT 1 FROM enrollments oe WHERE oe.student_id=e.student_id AND oe.class_id=oc.id
             AND (oe.status='ACTIVE' OR (oe.status='PENDING_PAYMENT' AND EXISTS(
               SELECT 1 FROM order_details d JOIN orders o ON o.id=d.order_id WHERE d.id=oe.order_detail_id
                 AND o.status='PENDING' AND o.payment_type='CASH' AND o.expires_at>$1))))
           OR EXISTS(SELECT 1 FROM makeup_placements p WHERE p.student_id=e.student_id AND p.target_session_id=other.id AND p.status='ASSIGNED'))
       GROUP BY e.id,s.id
       ON CONFLICT(enrollment_id,source_session_id) DO UPDATE SET
         conflicting_intervals=EXCLUDED.conflicting_intervals,updated_at=now(),version=student_schedule_conflicts.version+1
       WHERE student_schedule_conflicts.status='OPEN'
         AND student_schedule_conflicts.conflicting_intervals IS DISTINCT FROM EXCLUDED.conflicting_intervals`,
      [now, studentIds],
    );
  }
}
