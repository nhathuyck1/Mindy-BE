# Dashboard — 03/11/2026

Implemented on `codex/dashboard`, branched from `origin/dev`. See
[API breakdown](DASHBOARD_flow-api-breakdown.md).

## Flow and business definitions

1. Authenticate with the existing HttpOnly session cookie and active-account guard.
2. Admin opens `/admin`, Manager `/manager`, Mentor `/mentor/dashboard`.
3. FE calls the matching role endpoint with a 30/90/365 calendar-day range (default 90).
4. A single parameterized PostgreSQL statement aggregates a consistent snapshot.
5. Show current course/class totals, confirmed registrations and distinct students in
   the selected period, daily trend, current class statuses and top ten rankings.
6. Staff compare courses by registrations and mentors by distinct students. Mentor
   compares own courses and classes; other mentor rankings are never returned.

Confirmed registration means an existing enrollment currently ACTIVE or COMPLETED,
with `enrolled_at` in `[from,to)`. Pending payment, cancelled enrollment, null confirmation
date and future confirmations are excluded. Count registrations per enrollment;
count students DISTINCT across the selected scope, including across classes/courses.
No sum of per-course or per-mentor student counts is used for the global total.

Period starts at midnight Vietnam time, `days - 1` days before today; ends at the
request instant. Missing dates have explicit zero counts. Classes/course totals and
statuses describe the current inventory, not only classes created in the period.
Assignment uses the current primary `classes.mentor_id`; substitute/session assignments
are intentionally excluded. Historical mentor reassignment changes attribution.

Read-only: no schema changes, payment transitions, enrollments or external messages.
Limits: top ten per ranking, at most 365 daily points, fixed role scope. No student
names, emails, IDs, order details or credentials appear in responses. Sort ties use ID.

## Verification

- Unit coverage: Vietnam calendar boundaries, filter bounds, role matrix and actor-derived scope.
- PostgreSQL integration uses a dedicated `_test` database and transaction-local isolated
  schema, rolling fixtures back. Covers confirmed/pending/cancelled, inclusive lower and
  exclusive upper boundaries, distinct students across classes, mentor isolation and zeros.
- FE proxy tests cover access-cookie forwarding, private/no-store, strict query filters,
  duplicate/unknown/scope-changing query rejection and wrong-role response rejection.
- Browser tests use mocked API responses; deployment and production account acceptance
  remain separate from local checks. Final command results are recorded in Progress.md.

Rollback: remove DashboardModule and FE dashboard mounts; there are no migrations to revert.

## Local FE + API acceptance — 03/11/2026

Started existing local PostgreSQL; applied 26 pending migrations (36 total), preserving
existing catalog, classes and 44 enrollments. Started BE on localhost:3000 with mail,
provider and background jobs disabled for this inspection; FE on localhost:3003 now
uses this local upstream through its existing same-origin proxy.

Added one local Manager test account because the development DB had none; existing
Admin and Mentor demo accounts were used without resetting their passwords or assignments.
No new enrollment, mock payment, external email or production API was used.

Independently queried PostgreSQL and compared real authenticated endpoints for all
three roles at 30/90/365 days: registration/student/class totals and daily sums match.
Admin/Manager have 6 courses, 7 classes, 44 registrations and 44 distinct students;
frontend Mentor has 4 courses/classes and 20 registrations/students. Mentor center-wide
endpoint request correctly returns 403. FE live browser checks compare cards to API
and render the new Recharts area/donut/two bar charts on desktop and 320px.
