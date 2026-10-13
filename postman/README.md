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
to live orders. For deployment, see [payOS runbook](../docs/implement_phase/phase2/PAYOS_PHASE_2_2_DEPLOYMENT.md).

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
HTTP3.3 đã implement và kiểm chứng local; VPS acceptance còn pending. Do not send API cookies to signed storage URLs.
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

## Phase 3.3.3 review/publication

Import [Phase33 collection](Mindy-Materials-Phase33.postman_collection.json), set origin
matching CORS_ORIGINS. Mentor create→submit, login Manager again→pending review queue
→detail→reject or approve. Reject→login Mentor→EDIT→submit→login Manager→approve.
Use expected_revision from the latest detail; on409 refetch and explicitly decide
again. Approve publishes, unpublish retains approval; approve retry does not republish.
Publish/unpublish retries retain timestamps and produce no duplicate audit. Requires
migrations through1791853200000; local verification only, VPS acceptance pending.
Release3.3.4 is now available locally; binary preview remains a later slice.

## Phase 3.3.4 Class Unit release

Phase33 collection adds Admin login and six Admin/Mentor release examples.
Set admin_email/admin_password, class_id and class_unit_id; log in with the role
matching the route (cookie jar replaces the previous identity). Mentor IDs come
from the Unit picker; Admin IDs from class detail. Requires migration1791856800000.
OPEN + future unlockAt waits for server time; LOCKED always blocks. Omit unlockAt
to retain, null to clear. Retry equal values keeps timestamps/audit. On409 or lost
response, refetch and choose again; no expectedRevision or automatic replay.
Local checks and VPS acceptance are tracked separately in Phase3.3 progress.

## Phase 3.3.5 acceptance/handoff

Run the metadata journey with separate ARTICLE text-only, ARTICLE PNG inline + PDF
attachment, FILE PDF and VIDEO MP4 fixtures. Files Phase32 supplies upload/complete/
status; Phase33 supplies context/create/submit/reject/edit/approve/publication and
release. Switch role by logging in again; read IDs/revisions from actual responses.
Postman numeric expected_revision templates are substituted before sending JSON.
Local HTTP checks compare all Phase33 method/routes to Swagger and all source
migration IDs to the built-app database. No new routes or schema in3.3.5.
[VPS cases, evidence table and3.4 handoff](../docs/api_flow/PHASE_3_3_flow-api-breakdown.md#10-phase-335--acceptance-và-handoff-34-2026-10-14).
VPS results and user sign-off remain pending; staff binary preview and Student
ARTICLE/inline/attachment URLs remain3.4 work.
