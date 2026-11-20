# Dashboard API breakdown — 03/11/2026

> Current contract — 2026-11-06: Admin keeps enrollment analytics below.
> Manager returns collected/pending revenue and opening alerts; Mentor returns
> teaching workload, upcoming sessions and leave requests, including session overrides.
> See [current role dashboard contract](PHASE_BE_CHANGE_flow-api-breakdown.md).
> The shared enrollment response described below is the earlier contract for Manager/Mentor.

Implemented source contract; see [flow](DASHBOARD_FLOW.md). Local implementation does
not imply the endpoints have been deployed on the configured FE upstream.

## Endpoints

| Method and full route | Required active role | Scope / FE consumer |
| --- | --- | --- |
| GET `/api/v1/admin/dashboard` | ADMIN | All center data; `/admin` |
| GET `/api/v1/manager/dashboard` | MANAGER | All center data; `/manager` and Manager using `/admin` |
| GET `/api/v1/mentor/dashboard` | MENTOR | Current primary classes of authenticated user; `/mentor/dashboard` |

All three require `Cookie: access_token=<HttpOnly session cookie>`; browser calls the
same-origin `/api/v1` proxy, which forwards only that cookie. No path parameters, request
body, idempotency header or client-supplied user/mentor identifier. The backend guard
checks session validity and active user before authorization; wrong role is forbidden.

Query: optional `days`, integer enum `30 | 90 | 365`, default `90`. Unknown keys are
rejected by global validation and the FE proxy. Proxy rejects duplicate keys before
forwarding. Example: `GET /api/v1/mentor/dashboard?days=30`.

## Response: HTTP 200, direct JSON DTO

```json
{
  "scope": "MENTOR",
  "timeZone": "Asia/Ho_Chi_Minh",
  "generatedAt": "2026-11-03T10:00:00.000Z",
  "from": "2026-10-04T17:00:00.000Z",
  "to": "2026-11-03T10:00:00.000Z",
  "summary": { "courses": 1, "classes": 2, "openClasses": 1, "activeClasses": 1, "registrations": 2, "students": 1 },
  "courses": [{ "id": "11111111-1111-4111-8111-111111111111", "name": "Example course", "registrations": 2, "students": 1, "classes": 2 }],
  "mentors": [],
  "classes": [{ "id": "22222222-2222-4222-8222-222222222222", "name": "Example class", "registrations": 1, "students": 1, "classes": 1 }],
  "trend": [{ "date": "2026-11-03", "registrations": 2 }],
  "classStatuses": [{ "status": "OPEN", "count": 1 }, { "status": "IN_PROGRESS", "count": 1 }]
}
```

Example ranking/trend arrays above are abbreviated; full responses include all period
dates and up to ten ranking rows. All counts are nonnegative integers, all arrays are
present (possibly empty), timestamps are ISO UTC and `trend.date` is a Vietnam calendar
date. No field is nullable. `scope` matches the authenticated role, checked again by FE.

- `summary.courses/classes`: current catalog/class inventory within scope.
- `summary.openClasses/activeClasses`: current OPEN/IN_PROGRESS classes.
- `summary.registrations/students`: period confirmed enrollments / distinct students.
- `courses`: top ten by registrations descending, ID ascending on ties.
- `mentors`: staff only, top ten by students descending, registrations descending, ID
  ascending. Includes zero-student mentors when there are fewer than ten populated rows.
- `classes`: top ten scoped classes by registrations descending, ID ascending.
- Ranking `classes` counts DISTINCT classes; joining enrollments never inflates it.
- `trend`: ascending daily counts, zero-filled including today.
- `classStatuses`: current classes grouped by DRAFT/OPEN/IN_PROGRESS/COMPLETED/CANCELLED;
  absent statuses mean zero, not an error.

## Errors and UI behavior

- 401 `AUTHENTICATION_REQUIRED`: existing FE session recovery; expired sessions use
  the central login flow. Never expose cookies in JSON or Web Storage.
- 403 `INSUFFICIENT_ROLE`: do not retry; user needs the correct role. Mentor cannot
  request center scope by changing query or endpoint.
- 422 `HTTP_ERROR` from global validation: invalid days or unknown parameter; FE
  proxy uses `INVALID_QUERY` for malformed/duplicate filters.
- 503 `DASHBOARD_SCHEMA_NOT_READY`: required domain migrations absent; show retry,
  operator applies existing migrations. No data substitution with zeros.
- 500 dependency errors: standard global error envelope, no SQL details to client.
- Proxy 502: invalid upstream JSON/schema or role mismatch; show retry.

Response uses `Cache-Control: private, no-store`; proxy adds `Vary: Cookie`. TanStack
Query memory cache is keyed by authenticated user, audience and days, stale after 60s.
Initial/filter loads show loading; network errors show retry and hide stale statistics;
empty successful data shows real zeros. No polling or writes; manual refresh and normal
query focus/reconnect behavior apply. Existing Manager approval/material worklists and
Mentor schedule remain available. Requires existing catalog/class/enrollment migrations;
no new dependency, configuration or migration is added by DashboardModule.
