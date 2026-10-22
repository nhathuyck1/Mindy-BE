# Mindy Postman checks

Phase4.4 leave17/10: trong `Mindy-Session-Operations-Phase44.postman_collection.json`
có folder21 với preview/slots/create/own list/detail/withdraw và staff list/detail/
approve/reject. Cần migration1792195200000. Đổi cookie actor theo từng request;
FULL_DAY mẫu một sourceDate, range nhiều ngày phải bổ sung đủ dayMappings.
Chọn sourceVersions từ preview, review current conflicts trước approve; cờ
acknowledgeStudentConflicts mặc địnhfalse, không tự bật. Key action được tạo khi
trống: retry giữ key/body, ý định mới xóa key tương ứng để tạo lại. Withdraw/reject/
approve là lựa chọn thay thế, không chạy cả collection mù. API và rollback:
[contract4.4 mục19](../docs/api_flow/PHASE_4_4_flow-api-breakdown.md#19-mentor-leave-requests--implementation-2026-10-17).

Cập nhật CASH 2026-10-16: collection BE dùng manager_email/manager_password,
manager/classes → class students → manager/cash-orders/:orderId/confirm.
Manager không cần gán lớp; mentor không còn quyền thu/xác nhận tiền mặt.

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

Phase3.3 (2026-10-16): import `Mindy-Materials-Phase33.postman_collection.json`.
Đổi actor login trước mỗi nhóm thao tác; chọn unit/session từ context, upload READY
bằng collection Files3.2, tạo ARTICLE/FILE/VIDEO, mentor submit, manager xem
detail/preview đúng revision rồi reject/approve; mentor/admin release unit,
student đọc HTML/tải primary hoặc attachment. Body expectedRevision mẫu là1:
đổi theo revision đã thực sự xem, không auto approve sau409. Đặt Origin trùng
CORS_ORIGINS. Không chạy toàn bộ alternatives như một runner liên tục.
Đã kiểm backend local; chưa deploy/VPS/FE. Contract đầy đủ:
[breakdown3.3](../docs/api_flow/PHASE_3_3_flow-api-breakdown.md).

Phase3.4: import `Mindy-Materials-Phase34.postman_collection.json`, login STUDENT,
choose FULL class from My Classes and `units[].id` from class detail, then call
list/detail/download. ARTICLE inline images/attachments use
`POST .../files/{{file_id}}/access` (Origin header, body `{}`); Phase33 collection has
Manager/Mentor preview with `preview_file_id`. Local verified 2026-10-14, not yet deployed.
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

## Phase 4.4a — Session operations (initial slice)

Import [Mindy-Session-Operations-Phase44.postman_collection.json](Mindy-Session-Operations-Phase44.postman_collection.json)
after migration1792022400000. Use existing login/cookie jar as ACTIVE ADMIN/MANAGER.
Read Class timetable, set sessionId/classUnitId/sessionVersion, choose valid future
dates, and provide a UUIDv4 idempotencyKey for each new intent. Copy nextSessionVersion
only before the next action and use a new key; network retries keep original body/key/version.
Sequence: reschedule → cancel → makeup → refetch Class schedule. Makeup preserves
duration and uses the latest CANCELLED leaf in the same Unit; replacementSessionId
is saved for a later chain continuation. Class endDate auto extension is atomic.
Baseline4.4a chỉ gồm [the three implemented Session APIs](../docs/api_flow/PHASE_4_4_flow-api-breakdown.md).

## Phase4.4b — Cross-class makeup

Collection Phase44 đã thêm 11 requests: Staff queue/candidates/assign/cancel,
Student own/context, target Mentor roster/start/mark/finalize và Staff guest audits.
Cần compiled migration1792022400001 và attendance prerequisites. Dùng cookie đúng
actor; chọn conflictId/targetSessionId, GET lấy versions. Mỗi ý định ghi cần UUIDv4
idempotencyKey mới, retry giữ key/body. Copy nextTargetSessionVersion sang
targetSessionVersion chỉ cho ý định mới, hoặc refetch roster. Staff cancel dùng
placementVersion hiện hành từ queue; sau target cancel phải cancel placement cũ
có reason trước reassign. Trước start guest context không cấp class/material access.
Student own FINALIZED là placement metadata; schedule/summary4.4c và leave/approved
intervals vẫn pending. Xem [contract4.4](../docs/api_flow/PHASE_4_4_flow-api-breakdown.md).

### Hợp nhất stash — 2026-10-16

Giữ POST files/access và thêm GET preview/assets có expectedRevision trong cả
hai collection3.3/3.4. Manager catalogue và Mentor unit detail dùng chung các
route dev; chỉ một controller cho mỗi release route. Không chạy hai migrations
local1792108800000/1 vì schema đã có trong catalog dev. Contract/evidence hiện
hành tại docs/api_flow/PHASE_3_3_flow-api-breakdown.md và Progress.md.

Phase2.4: folder `Phase 2.4 Manager operations` trong Mindy-BE có16 GET
class/contact/HR/orders/payments; dùng cookie manager và điền UUID/range. Phase33
thêm folder `Manager plain text authoring`, contentText thay contentHtml cho ARTICLE;
PDF/MP4/TXT/MP3 tiếp tục upload qua collection Phase32 rồi tạo FILE/VIDEO.
Chưa xác minh VPS/browser; không gọi provider/reconcile qua các GET manager.

Word DOCX: folder Phase33 `Word DOCX upload and approval` dùng file_id của Word
READY sau upload Phase32; tạo FILE rồi approve đúng expected_revision. DOCX25MiB,
MIME Office Word chuẩn, kind DOCUMENT; .doc legacy và Word-to-PDF chưa hỗ trợ.
