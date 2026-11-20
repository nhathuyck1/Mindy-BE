// A single statement provides a consistent snapshot without loading private student records.
// $1 = authenticated mentor ID or null for staff, $2 = lower bound, $3 = upper bound.
export const DASHBOARD_SQL = `
WITH scoped_classes AS (
  SELECT id, course_id, mentor_id, name, status FROM classes
  WHERE ($1::uuid IS NULL OR mentor_id = $1::uuid)
), registrations AS (
  SELECT e.id, e.student_id, e.class_id, e.enrolled_at
  FROM enrollments e JOIN scoped_classes c ON c.id = e.class_id
  WHERE e.status IN ('ACTIVE', 'COMPLETED')
    AND e.enrolled_at >= $2::timestamptz AND e.enrolled_at < $3::timestamptz
), course_ranks AS (
  SELECT co.id, co.title AS name, count(r.id)::int AS registrations,
    count(DISTINCT r.student_id)::int AS students, count(DISTINCT c.id)::int AS classes
  FROM courses co LEFT JOIN scoped_classes c ON c.course_id = co.id
  LEFT JOIN registrations r ON r.class_id = c.id
  WHERE ($1::uuid IS NULL OR c.id IS NOT NULL)
  GROUP BY co.id, co.title ORDER BY registrations DESC, co.id LIMIT 10
), mentor_ranks AS (
  SELECT u.id, u.display_name AS name, count(r.id)::int AS registrations,
    count(DISTINCT r.student_id)::int AS students, count(DISTINCT c.id)::int AS classes
  FROM users u LEFT JOIN scoped_classes c ON c.mentor_id = u.id
  LEFT JOIN registrations r ON r.class_id = c.id
  WHERE u.role = 'MENTOR' AND $1::uuid IS NULL
  GROUP BY u.id, u.display_name ORDER BY students DESC, registrations DESC, u.id LIMIT 10
), class_ranks AS (
  SELECT c.id, c.name, count(r.id)::int AS registrations,
    count(DISTINCT r.student_id)::int AS students, 1 AS classes
  FROM scoped_classes c LEFT JOIN registrations r ON r.class_id = c.id
  GROUP BY c.id, c.name ORDER BY registrations DESC, c.id LIMIT 10
), daily AS (
  SELECT (enrolled_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS day,
    count(*)::int AS registrations FROM registrations GROUP BY day
), trend AS (
  SELECT to_char(d.day, 'YYYY-MM-DD') AS date, coalesce(r.registrations, 0) AS registrations
  FROM generate_series(
    ($2::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    ($3::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    interval '1 day'
  ) d(day) LEFT JOIN daily r ON r.day = d.day::date ORDER BY d.day
), statuses AS (
  SELECT status::text AS status, count(*)::int AS count FROM scoped_classes GROUP BY status
)
SELECT json_build_object(
  'courses', CASE WHEN $1::uuid IS NULL THEN (SELECT count(*)::int FROM courses)
    ELSE (SELECT count(DISTINCT course_id)::int FROM scoped_classes) END,
  'classes', (SELECT count(*)::int FROM scoped_classes),
  'openClasses', (SELECT count(*)::int FROM scoped_classes WHERE status = 'OPEN'),
  'activeClasses', (SELECT count(*)::int FROM scoped_classes WHERE status = 'IN_PROGRESS'),
  'registrations', (SELECT count(*)::int FROM registrations),
  'students', (SELECT count(DISTINCT student_id)::int FROM registrations)
) AS summary,
coalesce((SELECT json_agg(x ORDER BY x.registrations DESC, x.id) FROM course_ranks x), '[]') AS courses,
coalesce((SELECT json_agg(x ORDER BY x.students DESC, x.registrations DESC, x.id) FROM mentor_ranks x), '[]') AS mentors,
coalesce((SELECT json_agg(x ORDER BY x.registrations DESC, x.id) FROM class_ranks x), '[]') AS classes,
coalesce((SELECT json_agg(x ORDER BY x.date) FROM trend x), '[]') AS trend,
coalesce((SELECT json_agg(x ORDER BY x.status) FROM statuses x), '[]') AS "classStatuses"
`;
