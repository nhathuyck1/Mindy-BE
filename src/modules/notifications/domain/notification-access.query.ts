/** Shared batch predicate for fanout, inbox, counts, read state and socket projections. */
export const NOTIFICATION_ACCESS_QUERY = `WITH candidates AS (
  SELECT * FROM jsonb_to_recordset($3::jsonb) AS r(id uuid,resource_id uuid,resource_kind text,type text,revision text,relation_keys text[])
)
SELECT r.id, (COALESCE(cardinality(r.relation_keys),0)=0 OR notification_relation_keys($1,r.resource_id,r.resource_kind) && r.relation_keys)
  AND CASE r.resource_kind
  WHEN 'SESSION' THEN EXISTS(SELECT 1 FROM notification_session_recipients(r.resource_id) x
    JOIN class_sessions s ON s.id=r.resource_id WHERE x.user_id=$1 AND s.status<>'CANCELLED'
    AND (r.type<>'SESSION_STARTING_SOON' OR (s.status='SCHEDULED' AND s.notification_schedule_revision::text=r.revision
      AND s.starts_at>clock_timestamp() AND s.starts_at<=clock_timestamp()+interval '30 minutes')))
  WHEN 'CLASS' THEN EXISTS(SELECT 1 FROM classes c WHERE c.id=r.resource_id AND c.status<>'CANCELLED'
    AND (c.mentor_id=$1 OR EXISTS(SELECT 1 FROM enrollments e WHERE e.class_id=c.id AND e.student_id=$1 AND e.status='ACTIVE')))
  WHEN 'ORDER' THEN EXISTS(SELECT 1 FROM orders o WHERE o.id=r.resource_id AND o.student_id=$1
    AND (r.type<>'ORDER_EXPIRING' OR (o.status='PENDING' AND o.expires_at>clock_timestamp()
      AND o.expires_at<=clock_timestamp()+interval '24 hours' AND o.notification_expiry_revision::text=r.revision)))
  WHEN 'LEAVE' THEN EXISTS(SELECT 1 FROM mentor_leave_requests l WHERE l.id=r.resource_id
    AND (l.mentor_id=$1 OR ($2 IN ('ADMIN','MANAGER') AND l.status='PENDING')))
  WHEN 'MAKEUP' THEN EXISTS(SELECT 1 FROM makeup_placements p JOIN enrollments e ON e.id=p.enrollment_id
    JOIN classes src ON src.id=p.source_class_id JOIN classes dst ON dst.id=p.target_class_id
    WHERE p.id=r.resource_id AND p.status IN ('ASSIGNED','COMPLETED') AND e.status='ACTIVE'
    AND src.status IN ('OPEN','IN_PROGRESS') AND dst.status IN ('OPEN','IN_PROGRESS')
    AND (p.student_id=$1 OR EXISTS(SELECT 1 FROM notification_session_recipients(p.target_session_id) x WHERE x.user_id=$1 AND x.role='MENTOR')))
  WHEN 'ASSIGNMENT' THEN EXISTS(SELECT 1 FROM assignments a JOIN notification_assignment_recipients(a.id) x ON x.user_id=$1
    WHERE a.id=r.resource_id AND a.status='PUBLISHED' AND a.deleted_at IS NULL
    AND (r.type<>'ASSIGNMENT_DUE_SOON' OR (a.due_at>clock_timestamp() AND a.due_at<=clock_timestamp()+interval '24 hours'
      AND a.notification_deadline_revision::text=r.revision AND NOT EXISTS(SELECT 1 FROM assignment_zip_submissions z WHERE z.assignment_id=a.id AND z.student_id=$1 AND z.status='SUBMITTED')
      AND NOT EXISTS(SELECT 1 FROM assignment_submissions z WHERE z.assignment_id=a.id AND z.student_id=$1 AND z.status='GRADED')
      AND NOT EXISTS(SELECT 1 FROM code_submissions z WHERE z.assignment_id=a.id AND z.student_id=$1 AND z.status<>'VOIDED' AND z.counts_as_attempt))))
  WHEN 'SUBMISSION' THEN $4::boolean AND EXISTS(SELECT 1 FROM assignment_zip_submissions z
    WHERE z.id=r.resource_id AND z.status='SUBMITTED' AND
    ((r.type='ASSIGNMENT_GRADE_RELEASED' AND z.student_id=$1 AND z.released_version IS NOT NULL)
      OR (r.type='ZIP_SUBMISSION_REVIEW_REQUIRED' AND z.current_version=0 AND EXISTS(
        SELECT 1 FROM notification_assignment_mentors(z.assignment_id) x WHERE x.user_id=$1))))
  WHEN 'MATERIAL' THEN EXISTS(SELECT 1 FROM materials m WHERE m.id=r.resource_id AND m.created_by=$1 AND m.deleted_at IS NULL)
  ELSE false END AS available FROM candidates r`;
