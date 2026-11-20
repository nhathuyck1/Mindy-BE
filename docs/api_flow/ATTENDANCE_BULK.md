# Bulk attendance for the entire session roster

`PUT /api/v1/class-sessions/:sessionId/attendance/bulk`

Uses the same authenticated Admin, Manager or assigned Mentor permissions and edit
window as `PUT /class-sessions/:sessionId/attendance`.

Required header: `Idempotency-Key: <UUID v4>`.

```json
{
  "expectedVersion": 2,
  "checked": true
}
```

- `expectedVersion`: the session version from the latest roster or mutation response.
- `checked: true`: set every existing roster record to `PRESENT`.
- `checked: false`: set every existing roster record to `ABSENT`, clearing check-in timestamps.
- `reason`: optional for Mentor; required for Admin and Manager, as in other attendance mutations.

The command applies across **all pages**, including regular and makeup/guest records.
It updates the existing snapshot only; it does not start the session, admit new
students, finalize the session, or create records for pending payments.
An empty roster succeeds without changing the session version.
Unchanged records retain their timestamps and produce no new audit entries.

The response is the existing `AttendanceWriteDto`: `session`, `totals`,
`changedEnrollmentIds` and `changedMakeupPlacementIds`. A successful change
increments the shared session version once, with individual audit entries, in one
transaction. All updates roll back if any part fails.

FE should use the returned `session.version` for the next mutation and refresh the
visible roster. Reuse the same idempotency key and identical body for network retries;
use a new key for each new user action. On `SESSION_VERSION_CONFLICT`, reload the
roster before retrying. Reusing a key with a different body returns
`IDEMPOTENCY_KEY_REUSED`.

For a subset (for example, only the current page), keep using the existing
`PUT /api/v1/class-sessions/:sessionId/attendance` with `records` and/or
`guestRecords`. To reset to `UNMARKED` during an in-progress session, use that
existing endpoint; unchecked in the bulk endpoint explicitly means `ABSENT`.
