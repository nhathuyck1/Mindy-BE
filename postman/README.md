# Mindy Postman checks

Increment cuối Phase 2 thêm folder CASH và lookup return URL. Link response lưu
`provider_order_code`; request result dùng mã này, không dùng mã Mindy `MD...`.
CASH: login student → add class → checkout CASH → preview → login mentor snapshot
→ list assigned classes → list students in `class_id` filtered `CASH/PENDING`
→ use the row's `orderId` and **full `orderTotalAmount`** to confirm → login
student → đọc own order/full class. One cash order can cover multiple classes;
mentor confirms the full order once. Mentor confirm ghi nhận tiền thật đã thu;
chỉ chạy sau khi đã thu đủ tiền.
Contract và backlog ngoài Phase 2: [FE contract](../docs/PHASE_2_FE_CONTRACT.md).

Phase 2.2 adds `03 — Phase 2.2 payOS (manual live payment)`. Set collection variables
`student_email`, `student_password`, `class_id`; login student, add class, checkout,
create/reuse link, then **manually** pay via the checkout URL. Checkout/link requests
save `order_id`/`payment_id`. Read own order/class after the provider webhook commits.
Login ADMIN before review/reconcile requests. Do not post synthetic paid callbacks
to live orders. For deployment, see [payOS runbook](../docs/PAYOS_PHASE_2_2_DEPLOYMENT.md).

Phase 2.3 adds `05 — Phase 2.3 My Classes + schedule`. Login student, list My Classes
(the first row saves `class_id`), then open `/me/classes/{{class_id}}` when `accessMode`
is `FULL` or `/preview` when it is `CASH_PREVIEW`; `NONE` rows are summary/history only.
Set `schedule_from`/`schedule_to` to an ISO range with `Z` or an offset, at most 31 days.
Contract: [Phase 2.3 FE contract](../docs/PHASE_2_3_FE_CONTRACT.md).

## Import

Phase3.4: import `Mindy-Materials-Phase34.postman_collection.json`, login STUDENT,
choose FULL class from My Classes and `units[].id` from class detail, then call
list/detail/download. FILE/VIDEO read slice is local verified, not yet deployed.
Approved Material rows/released units are prerequisites; authoring/review/release
HTTP3.3 is still planned. Do not send API cookies to signed storage URLs.
See [Student Material contract](../docs/api_flow/PHASE_3_4_flow-api-breakdown.md).

Import both files into Postman:

- `Mindy-BE.postman_collection.json`
- `Mindy-Local.postman_environment.json`

For Phase 3.2 also import `Mindy-Files-Phase32.postman_collection.json`.
It contains `04 — Phase 3.2 Files`: login an existing Manager, set Course Unit,
filename/MIME/exact bytes, create intent, manually select the binary for PUT,
complete and poll. For Mentor add matching `classId`/`classUnitId` and log in
with the Mentor account. Keep API cookies away from storage PUT and clear signed
URLs after testing. See [Files runbook](../docs/PHASE_3_2_FILES_RUNBOOK.md).

Select the **Mindy Local** environment and set `admin_password` to the same value as
`SEED_ADMIN_PASSWORD` in the local `.env` file.

## Cookie authentication

Postman manages `access_token` and `refresh_token` in its cookie jar automatically.
Do not copy either token into an Authorization header or an environment variable.

After **Login admin**, open **Cookies** for `localhost` to inspect the cookie names.
The cookies are `HttpOnly`, so scripts cannot read their values. The refresh cookie is
restricted to `/api/v1/auth/refresh`; that is expected.

If login succeeds but an authenticated request returns `401`, delete old cookies for
`localhost` in Postman and run **Login admin** again.

## Suggested order

1. Run both requests in `00 — Health`.
2. Run `Login admin`, `Current user`, and `Refresh cookies`.
3. Run the requests in `02 — Admin users` from top to bottom.
4. Run `Logout current session`, then `Me after logout — expect 401`.
5. To test `Logout all sessions`, log in again before running it.

The collection creates a unique student email on each run and stores the returned ID
as a collection variable for the following get/suspend/reactivate requests.

## Phase 4.1 — Teaching assignments

Import Mindy-Teaching-Phase41.postman_collection.json; migrate first. Login as
Manager/Admin, read versions/candidates, assign using UUID v4 Idempotency-Key,
then login as assigned Mentor for schedule/context. Retry keeps key/body; changed
intent uses a new key after refetch. Substitute has one-session context, no cash
or material authoring. Start/attendance/leave/makeup are later slices. Legacy admin
Class mentor PATCH now requires reason/version/key and a separate request from
other class fields. See Phase4 API breakdown §14.

## Phase 4.2 — Session attendance

Import `Mindy-Attendance-Phase42.postman_collection.json` after migration
`1791849600001-session-attendance`. Login using the existing auth collection and
cookie jar as the effective teaching Mentor or Manager/Admin. Set baseUrl including
`/api/v1`, sessionId, sessionVersion and a UUID v4 idempotencyKey for each new intent.
GET roster stores sessionVersion/enrollmentId. Mutations store nextSessionVersion;
before the next action copy it to sessionVersion and create a new key. Network
retries keep the original input version/body/key. Staff add a trimmed reason to
every mutation. Recovery clocks must have an offset and satisfy start<end<=now;
regular Mentor start must be on a scheduled local calendar day.

Sequence: roster → start → roster → mark/unmark → confirm totals → finalize.
CASH pending: Order snapshot mentor confirms first, then teaching mentor syncs
the roster. Post-finalization corrections, audit browsing and legacy recovery are
4.3; guest/student projections/leave are later slices. Actual FE contract/errors
and scope are in Phase4 API breakdown §15; no VPS deployment evidence yet.

## Phase 4.3 — Corrections, Staff history and evidence recovery

Import [Mindy-Attendance-Phase43.postman_collection.json](Mindy-Attendance-Phase43.postman_collection.json)
after migration1791849600003 (and4.1/4.2/calendar prerequisites). Cookie jar login
as current Mentor for correction, ACTIVE Manager/Admin for history/recovery.
GET roster sets sessionVersion; every new mutation intent needs a UUIDv4 key.
Keep version/body/key for retries; copy nextSessionVersion only for the next intent.
Staff reason is required. Closed states accept PRESENT/ABSENT; no-op preserves version.

Recovery uses only missing rows with verified historical payment and classroom
roster evidence: PAID_BEFORE_START or CASH_LATE_ADMISSION. Set actual clocks with
timezone,evidenceNote,admissionBasis; known clocks must match. Recover1000 rows
max/256KiB,other routes64KiB. Existing row409 uses separate correction.
No known actors/clocks are overwritten;unknown historical actors remain null.
Sequence: roster + Staff history → correction/recovery → refetch both.
[API contract](../docs/api_flow/PHASE_4_3_flow-api-breakdown.md) and
[local evidence/rollout](../docs/progress/phase%204/PHASE_4_3_PROGRESS.md).
Deployment/browser smoke is4.5; no server enablement is implied by this collection.
