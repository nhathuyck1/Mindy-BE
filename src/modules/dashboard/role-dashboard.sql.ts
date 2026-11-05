// $1 period start, $2 as-of, $3 center timezone. Order totals never join details in summary.
export const MANAGER_DASHBOARD_SQL = `
WITH paid AS (SELECT * FROM orders WHERE status='PAID' AND paid_at >= $1 AND paid_at <= $2),
pending AS (SELECT * FROM orders WHERE status='PENDING' AND expires_at>$2),
details AS (SELECT d.*,c.course_id FROM order_details d JOIN paid o ON o.id=d.order_id JOIN classes c ON c.id=d.class_id),
methods AS (SELECT payment_type::text AS id,payment_type::text AS name,sum(total_amount)::text AS amount,count(*)::int AS orders FROM paid GROUP BY payment_type),
course_totals AS (SELECT course_id::text AS id, min(course_title_snapshot) AS name,sum(total_amount)::text AS amount,count(DISTINCT order_id)::int AS orders FROM details GROUP BY course_id),
class_totals AS (SELECT class_id::text AS id,min(class_name_snapshot) AS name,sum(total_amount)::text AS amount,count(DISTINCT order_id)::int AS orders FROM details GROUP BY class_id),
daily AS (SELECT (paid_at AT TIME ZONE $3)::date AS date,sum(total_amount) AS amount,count(*)::int AS orders FROM paid GROUP BY 1),
trend AS (SELECT to_char(day,'YYYY-MM-DD') AS date,coalesce(d.amount,0)::text AS amount,coalesce(d.orders,0) AS orders
  FROM generate_series(($1::timestamptz AT TIME ZONE $3)::date,($2::timestamptz AT TIME ZONE $3)::date,interval '1 day') day LEFT JOIN daily d ON d.date=day::date),
alerts AS (SELECT c.id AS "classId",c.name AS "className",d.scheduled_start_at AS "scheduledStartAt",d.active_student_count AS "activeStudentCount",greatest(3-d.active_student_count,0) AS "missingStudents"
 FROM class_opening_decisions d JOIN classes c ON c.id=d.class_id WHERE d.outcome='BLOCKED' AND c.status='OPEN'
 AND d.scheduled_start_at=(SELECT min(s.starts_at) FROM class_sessions s JOIN class_units u ON u.id=s.class_unit_id WHERE u.class_id=c.id AND s.status<>'CANCELLED') ORDER BY d.scheduled_start_at,c.id LIMIT 100),
review AS (SELECT p.order_id AS "orderId",max(p.amount)::text AS amount,'PAYMENT_REQUIRES_REVIEW' AS reason FROM payment_transactions p WHERE p.status='REQUIRES_REVIEW' GROUP BY p.order_id ORDER BY p.order_id LIMIT 100)
SELECT json_build_object('collectedAmount',(SELECT coalesce(sum(total_amount),0)::text FROM paid),'paidOrders',(SELECT count(*)::int FROM paid),
 'pendingAmount',(SELECT coalesce(sum(total_amount),0)::text FROM pending),'pendingOrders',(SELECT count(*)::int FROM pending)) AS summary,
 coalesce((SELECT json_agg(x ORDER BY id) FROM methods x),'[]') AS "paymentMethods",
 coalesce((SELECT json_agg(x ORDER BY date) FROM trend x),'[]') AS trend,
 coalesce((SELECT json_agg(x ORDER BY id) FROM course_totals x),'[]') AS courses,
 coalesce((SELECT json_agg(x ORDER BY id) FROM class_totals x),'[]') AS classes,
 coalesce((SELECT json_agg(x) FROM review x),'[]') AS reconciliation,
 coalesce((SELECT json_agg(x) FROM alerts x),'[]') AS "openingAlerts"`;

// Mentor ID is always session-derived. Historical attribution never follows current class mentor.
export const MENTOR_DASHBOARD_SQL = `
WITH scoped AS (SELECT s.*,c.mentor_id,c.id AS scope_class_id FROM class_sessions s JOIN class_units u ON u.id=s.class_unit_id JOIN classes c ON c.id=u.class_id
 WHERE CASE WHEN s.status='SCHEDULED' THEN coalesce(s.mentor_override_id,c.mentor_id) ELSE s.teaching_mentor_id END=$1),
period AS (SELECT * FROM scoped WHERE starts_at>=$2 AND starts_at<=$3),
students AS (SELECT DISTINCT e.student_id FROM enrollments e WHERE e.status='ACTIVE' AND EXISTS(SELECT 1 FROM scoped s WHERE s.scope_class_id=e.class_id)
 UNION SELECT p.student_id FROM makeup_placements p JOIN scoped s ON s.id=p.target_session_id WHERE p.status='ASSIGNED'),
upcoming AS (SELECT id AS "sessionId",scope_class_id AS "classId",title,starts_at AS "startsAt",ends_at AS "endsAt" FROM scoped WHERE status='SCHEDULED' AND starts_at>$3 ORDER BY starts_at,id LIMIT 20),
leaves AS (SELECT CASE WHEN status='PENDING' AND expires_at<=$3 THEN 'EXPIRED' ELSE status END AS status,count(*)::int AS count FROM mentor_leave_requests WHERE mentor_id=$1 AND submitted_at>=$2 AND submitted_at<=$3 GROUP BY 1)
SELECT json_build_object('primaryClasses',(SELECT count(*)::int FROM classes WHERE mentor_id=$1),
 'students',(SELECT count(*)::int FROM students),'assignedSessions',(SELECT count(*)::int FROM period),
 'substituteSessions',(SELECT count(*)::int FROM period WHERE mentor_override_id=$1),
 'completedSessions',(SELECT count(*)::int FROM period WHERE status='COMPLETED'),
 'actualTeachingHours',(SELECT coalesce(sum(greatest(extract(epoch FROM(actual_ended_at-actual_started_at)),0))/3600,0)::float8 FROM period WHERE status='COMPLETED' AND actual_started_at IS NOT NULL AND actual_ended_at IS NOT NULL)) AS summary,
 coalesce((SELECT json_agg(x ORDER BY "startsAt","sessionId") FROM upcoming x),'[]') AS upcoming,
 coalesce((SELECT json_agg(x ORDER BY status) FROM leaves x),'[]') AS "leaveRequests"`;
