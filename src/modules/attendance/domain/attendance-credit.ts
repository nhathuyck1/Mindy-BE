/** Physical status and credited status deliberately have different lifetimes. */
export const ATTENDANCE_APPLICABILITIES = [
  'ELIGIBLE',
  'NOT_STARTED',
  'NOT_ELIGIBLE',
  'PAYMENT_PENDING',
  'LEGACY_NO_DATA',
  'MAKEUP_PENDING',
  'MAKEUP_CREDITED',
] as const;
export type AttendanceApplicability = (typeof ATTENDANCE_APPLICABILITIES)[number];
export type CreditedStatus = 'PRESENT' | 'ABSENT';
export interface AttendanceCounts {
  readonly present: number;
  readonly absent: number;
  readonly unmarked: number;
  readonly excluded: number;
  readonly makeupPending: number;
}
export function attendanceSummary(counts: AttendanceCounts): AttendanceCounts & {
  finalizedEligibleCount: number;
  rate: number | null;
} {
  const finalizedEligibleCount = counts.present + counts.absent;
  return {
    ...counts,
    finalizedEligibleCount,
    rate:
      finalizedEligibleCount === 0
        ? null
        : Math.round((counts.present / finalizedEligibleCount) * 10000) / 100,
  };
}

/**
 * One set-based policy for history, timetable and both summaries. $1 is class UUID[];
 * $2 is optional student UUID. Resolve the entire chain BEFORE any reporting range.
 * Joining only the leaf prevents canceled ancestors from adding obligations.
 */
export const ATTENDANCE_CREDIT_CTE = `WITH scoped AS (
  SELECT e.id AS enrollment_id,e.student_id,e.class_id,e.status AS enrollment_status,
    e.created_at AS enrollment_created_at,e.enrolled_at,d.payment_type,
    s.id AS session_id,coalesce(s.makeup_root_session_id,s.id) AS root_id,
    s.starts_at,s.ends_at,s.status AS session_status,s.actual_started_at,
    r.status AS physical_status,p.id AS placement_id,p.target_session_id,
    p.status AS placement_status,t.status AS target_status,g.status AS guest_status,
    EXISTS(SELECT 1 FROM student_schedule_conflicts f JOIN class_sessions fs ON fs.id=f.source_session_id
      WHERE f.enrollment_id=e.id AND coalesce(fs.makeup_root_session_id,fs.id)=coalesce(s.makeup_root_session_id,s.id)
        AND f.status IN ('OPEN','MAKEUP_ASSIGNED')) AS conflict_pending
  FROM enrollments e JOIN order_details od ON od.id=e.order_detail_id
  JOIN orders d ON d.id=od.order_id
  JOIN class_sessions s ON s.class_id=e.class_id
  LEFT JOIN attendance_records r ON r.enrollment_id=e.id AND r.session_id=s.id
  LEFT JOIN makeup_placements p ON p.enrollment_id=e.id
    AND p.source_root_session_id=coalesce(s.makeup_root_session_id,s.id) AND p.status<>'CANCELLED'
  LEFT JOIN class_sessions t ON t.id=p.target_session_id
  LEFT JOIN guest_attendance_records g ON g.placement_id=p.id
    AND g.session_id=p.target_session_id AND g.enrollment_id=e.id AND g.student_id=e.student_id
  WHERE e.class_id=ANY($1::uuid[]) AND ($2::uuid IS NULL OR e.student_id=$2)
    AND NOT EXISTS(SELECT 1 FROM class_sessions child WHERE child.makeup_for_session_id=s.id)
), classified AS (
  SELECT scoped.*,
    CASE
      WHEN session_status='CANCELLED' THEN 'NOT_ELIGIBLE'
      WHEN placement_status IN ('ASSIGNED','NEEDS_REASSIGNMENT') OR conflict_pending THEN 'MAKEUP_PENDING'
      WHEN placement_status='COMPLETED' AND target_status='COMPLETED' AND guest_status IN ('PRESENT','ABSENT') THEN 'MAKEUP_CREDITED'
      WHEN placement_status='COMPLETED' THEN 'MAKEUP_PENDING'
      WHEN session_status='COMPLETED' AND physical_status IN ('PRESENT','ABSENT') THEN 'ELIGIBLE'
      WHEN enrollment_status='PENDING_PAYMENT' THEN 'PAYMENT_PENDING'
      WHEN physical_status IS NOT NULL THEN 'ELIGIBLE'
      WHEN enrollment_created_at>coalesce(actual_started_at,starts_at)
        OR (payment_type='PAYOS' AND enrolled_at>coalesce(actual_started_at,starts_at))
        OR (enrolled_at IS NULL AND enrollment_status='CANCELLED') THEN 'NOT_ELIGIBLE'
      WHEN session_status='SCHEDULED' THEN 'NOT_STARTED'
      ELSE 'LEGACY_NO_DATA'
    END AS applicability
  FROM scoped
), ranked AS (
  SELECT classified.*,row_number() OVER(PARTITION BY student_id,root_id ORDER BY
    CASE WHEN applicability='MAKEUP_CREDITED' OR (applicability='ELIGIBLE' AND session_status='COMPLETED'
      AND physical_status IN ('PRESENT','ABSENT')) THEN 0
      WHEN applicability='MAKEUP_PENDING' THEN 1 WHEN physical_status IS NOT NULL THEN 2
      WHEN enrolled_at IS NOT NULL AND enrolled_at<=coalesce(actual_started_at,starts_at) THEN 3
      WHEN enrollment_status IN ('ACTIVE','COMPLETED') THEN 4 ELSE 5 END,
    enrollment_created_at DESC,enrollment_id DESC) AS credit_rank
  FROM classified
), credit AS (
  SELECT ranked.*,
    CASE WHEN credit_rank<>1 THEN NULL
      WHEN applicability='MAKEUP_CREDITED' THEN guest_status::text
      WHEN applicability='ELIGIBLE' AND session_status='COMPLETED'
        AND physical_status IN ('PRESENT','ABSENT') THEN physical_status::text ELSE NULL END AS credited_status
  FROM ranked
)`;

/** Counts only the unique credit owner, even after canceled enrollment / re-enrollment. */
export const ATTENDANCE_COUNTS_SQL = `count(*) FILTER(WHERE credit_rank=1 AND credited_status='PRESENT')::int AS present,
  count(*) FILTER(WHERE credit_rank=1 AND credited_status='ABSENT')::int AS absent,
  count(*) FILTER(WHERE credit_rank=1 AND credited_status IS NULL AND applicability<>'MAKEUP_PENDING'
    AND session_status='IN_PROGRESS' AND physical_status='UNMARKED')::int AS unmarked,
  count(*) FILTER(WHERE credit_rank=1 AND applicability='MAKEUP_PENDING')::int AS "makeupPending",
  count(*) FILTER(WHERE credit_rank=1 AND credited_status IS NULL AND applicability<>'MAKEUP_PENDING'
    AND NOT(session_status='IN_PROGRESS' AND coalesce(physical_status::text,'')='UNMARKED'))::int AS excluded`;
