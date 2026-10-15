# Phase 4.3 — API breakdown correction, recovery và audit history

**2026-10-13 — IMPLEMENTED contract4.3; focused PostgreSQL/built-app HTTP verified local.**
Deploy migration1791849600003 sau prerequisites4.1/4.2/calendar trước khi bật code
trên server. Chưa có VPS/browser evidence; full gates xem Progress4.3.
[Plan](../implement_phase/phase%204/PHASE_4_3_ATTENDANCE_CORRECTIONS_HISTORY.md) ·
[Progress](../progress/phase%204/PHASE_4_3_PROGRESS.md) ·
[Flow](PHASE_4_3_FLOW.md) · [Actual4.2](PHASE_4_2_flow-api-breakdown.md).

## 1. Boundary chung và shared response

- Prefix `/api/v1`; cookie access_token, credentials theo session adapter hiện có.
  Staff = ACTIVE MANAGER/ADMIN. Mentor phải ACTIVE/current role và teaching mentor
  hiệu lực của Session. Actor/status/assignment kiểm server, kể cả receipt replay.
- Success JSON trực tiếp, không `{data}`; reads/PUT/action POST200. Private
  responses `Cache-Control: private, no-store`. Error envelope hiện có
  `{statusCode,code,message,details?,requestId?}`; x-request-id dùng trace.
- Path UUID theo ParseUUIDPipe400 HTTP_ERROR; body UUIDv4/query/body422. Lists
  page integer>=1 default1/pageSize1–100 default20, không nhận unknown fields.
  Timestamp ISO có timezone, stored UTC; UI hiển thị theo session.timeZone.
- Mutations required Idempotency-Key UUIDv4 + expectedVersion integer>=1 từ GET
  roster mới nhất. Staff required reason trim1–1000; Mentor reason optional cùng
  limit. Payload hash normalize/sort IDs như4.2; actor/route/key scope riêng.
- Network retry giữ key/body. Replay outcome cũ có thể stale asOf/permissions,
  refetch; same key khác payload409. Request mới version stale409; không auto
  đổi version/retry. Current auth trước replay; expired deadline chặn new write,
  không làm duplicate receipt cũ thành write mới.
- Error codes mục6 đã đối chiếu exceptions/runtime tests. No guest/placement hoặc Student APIs4.3.

SessionView giữ TeachingSessionDto4.2: sessionId/classId/classUnitId/title,
startsAt/endsAt/status, primaryMentor/effectiveMentor nullable, assignmentType,
version/actualStartedAt/actualEndedAt/editableUntil/asOf/timeZone/permissions.
Legacy effectiveMentor null không tự lấy primary hiện tại làm người dạy cũ.

Permissions additive đã triển khai:
`{canStart,canEditAttendance,canFinalize,canSyncRoster,canRecover,canViewAttendanceAudits}`.
Edit mở theo matrix4.3; Finalize chỉ IN_PROGRESS. Recover true chỉ Staff với
Session SCHEDULED/COMPLETED và Class không DRAFT; đây là hint, body/evidence vẫn
validate. Audit true chỉ Staff; Student không được đọc roster.

WriteView giữ shape4.2:
`{session:SessionView,totals:{present,absent,unmarked,eligible},changedEnrollmentIds,
changedMakeupPlacementIds:[]}`. Totals đếm toàn snapshot vật lý, không phải tỷ lệ
Student hoặc số trên page. Canceled row còn trong totals để quản lý lịch sử;
không suy ra canceled Session góp denominator4.4c.

Ví dụ response đầy đủ cho PUT (IDs/dữ liệu giả):

```json
{
  "session": {
    "sessionId": "11111111-1111-4111-8111-111111111111",
    "classId": "22222222-2222-4222-8222-222222222222",
    "classUnitId": "33333333-3333-4333-8333-333333333333",
    "title": "Buổi 1",
    "startsAt": "2026-10-13T12:00:00Z",
    "endsAt": "2026-10-13T14:00:00Z",
    "status": "COMPLETED",
    "primaryMentor": {"id": "44444444-4444-4444-8444-444444444444", "displayName": "Mentor A"},
    "effectiveMentor": {"id": "44444444-4444-4444-8444-444444444444", "displayName": "Mentor A"},
    "assignmentType": "PRIMARY",
    "version": 8,
    "actualStartedAt": "2026-10-13T12:02:00Z",
    "actualEndedAt": "2026-10-13T14:01:00Z",
    "editableUntil": "2026-10-14T17:00:00Z",
    "asOf": "2026-10-14T02:00:00Z",
    "timeZone": "Asia/Bangkok",
    "permissions": {
      "canStart": false, "canEditAttendance": true, "canFinalize": false,
      "canSyncRoster": true, "canRecover": true, "canViewAttendanceAudits": true
    }
  },
  "totals": {"present": 1, "absent": 0, "unmarked": 0, "eligible": 1},
  "changedEnrollmentIds": ["55555555-5555-4555-8555-555555555555"],
  "changedMakeupPlacementIds": []
}
```

Đây là Staff view; Mentor không canRecover/canViewAttendanceAudits và không
sync COMPLETED. Thứ Ba13/10 local →00:00 thứ Năm15/10 =14/10T17:00Z. Clock UI
không quyết định quyền; backend recheck sau lock. No-op changed IDs=[]/version cũ.

## 2. GET `/api/v1/class-sessions/:sessionId/attendance`

**Existing4.2, additive permissions4.3 implemented.** Effective Mentor hoặc Staff,
object-level Session assignment; Class terminal vẫn cho authorized lịch sử read.
Màn hình attendance/correction/recovery gọi trước mutation; sessionId lấy từ
management/schedule/context4.1. Query `page=1&pageSize=20` mặc định, max100.
Không body/key; example:
`GET /api/v1/class-sessions/11111111-1111-4111-8111-111111111111/attendance?page=1&pageSize=20`.

200 `{session:SessionView,totals,items:[{attendanceId,enrollmentId,entryType:
"REGULAR",makeupPlacementId:null,student:{id,displayName},status,checkedInAt,
admittedAt}],page,pageSize,total,pendingPaymentCount}`; shape/null semantics4.2.
Ví dụ một item:

```json
{
  "attendanceId": "66666666-6666-4666-8666-666666666666",
  "enrollmentId": "55555555-5555-4555-8555-555555555555",
  "entryType": "REGULAR", "makeupPlacementId": null,
  "student": {"id": "77777777-7777-4777-8777-777777777777", "displayName": "Student A"},
  "status": "ABSENT", "checkedInAt": null, "admittedAt": "2026-10-13T12:02:00Z"
}
```

GET không snapshot/admit/backfill. Empty items/total0 là no roster data, không
ABSENT; pendingPaymentCount chỉ pending CASH còn hạn như4.2. Loading skeleton,
empty message về dữ liệu, error401/403 dừng/thoát session,404 resource unavailable,
400/422 sửa IDs/query. Refetch sau write/replay/reassignment; dùng pagination
riêng và totals toàn roster. Giữ polling4.2 nếu IN_PROGRESS/visible, dừng khi
COMPLETED/CANCELLED/rời trang/401/403. Correction/history không cần polling.

## 3. PUT `/api/v1/class-sessions/:sessionId/attendance`

**IN_PROGRESS existing4.2; closed-state correction IMPLEMENTED4.3.** Mentor hiệu lực
trước editableUntil; Staff reason, không deadline. Class COMPLETED cho Mentor
correction trong hạn; Class CANCELLED hoặc Session CANCELLED đã start chỉ Staff.
Không actualStartedAt thì409; không sửa row không có snapshot.

FE lấy enrollmentId từ GET roster, session version từ GET/outcome; gửi changed
rows, không replace roster hoặc các page chưa load. Required header key UUIDv4;
body expectedVersion>=1, records1–100/unique enrollmentId UUIDv4/status enum.
IN_PROGRESS UNMARKED/PRESENT/ABSENT; COMPLETED/CANCELLED PRESENT/ABSENT only,
UNMARKED422. Optional reason Mentor, required Staff; unknown actor/checkedInAt/
guest/clocks fields422. Example Staff correction:

```json
{
  "expectedVersion": 7,
  "reason": "Đối chiếu danh sách buổi học, học viên có mặt",
  "records": [{"enrollmentId": "55555555-5555-4555-8555-555555555555", "status": "PRESENT"}]
}
```

200 WriteView theo mục1. Atomic batch: PRESENT mới checkedInAt=server now,
ABSENT null; actor server, CORRECT audit khi closed state, MARK khi IN_PROGRESS.
No-op không refresh timestamp/audit/version. Giữ Session/Class status, actual
clocks/deadline; không activate enrollment/đổi người dạy. New change tăng version
một lần, audit+receipt commit cùng. Repeated/concurrent theo mục1, stale409.

UI chờ response trước đổi kết quả; disable submit đang gửi. Staff nhập reason,
Mentor hết hạn khóa correction/chuyển Staff. Batch sai một row422 rollback toàn
bộ, highlight affected row và GET lại khi roster đổi. Refetch roster và audit
nếu Staff đang xem; không giả định Student summary endpoint đã có4.4c. Trường
hợp thường: ABSENT→PRESENT sau chốt. Lỗi quan trọng: late deadline409, unknown
row422, CANCELLED Mentor409, changed assignment403. Xem error table mục6.

## 4. GET `/api/v1/management/class-sessions/:sessionId/attendance-audits`

**NEW, IMPLEMENTED4.3.** Staff ACTIVE only; Mentor/Student403 kể cả dạy thay.
Màn hình History mở từ roster hoặc management Session detail, dùng sessionId
cũ và optional enrollmentId từ row. Không body/key; query page>=1 default1,
pageSize1–100 default20, optional enrollmentId UUIDv4. Nếu filter enrollment
khác Class422; cùng Class chưa có audit trả empty, Session missing404.

Example:
`GET /api/v1/management/class-sessions/11111111-1111-4111-8111-111111111111/attendance-audits?page=1&pageSize=20&enrollmentId=55555555-5555-4555-8555-555555555555`.

Response200 (JSON trực tiếp):

```json
{
  "items": [{
    "id": "88888888-8888-4888-8888-888888888888",
    "attendanceId": "66666666-6666-4666-8666-666666666666",
    "enrollmentId": "55555555-5555-4555-8555-555555555555",
    "actor": {"id": "99999999-9999-4999-8999-999999999999", "displayName": "Manager A"},
    "oldStatus": "ABSENT", "newStatus": "PRESENT",
    "reason": "Đối chiếu danh sách buổi học, học viên có mặt",
    "occurredAt": "2026-10-14T02:00:00Z", "action": "CORRECT", "version": 8,
    "recoveryAuditId": null, "recoveryEvidence": null
  }],
  "page": 1, "pageSize": 20, "total": 1
}
```

Action ADMIT/MARK/FINALIZE/CORRECT/RECOVER; oldStatus nullable admission/recovery;
reason nullable historical Mentor writes; actor.displayName nullable if unknown
name, actor.id giữ FK. Sort occurredAt DESC,id DESC; consistent snapshot total.
Recovery entries recoveryAuditId UUID, recoveryEvidence object:
`{evidenceNote,admissionBasis,paidAt,oldSessionStatus,newSessionStatus,
oldActualStartedAt,newActualStartedAt,oldActualEndedAt,newActualEndedAt}`.
Old clocks nullable legacy; new clocks UTC. Evidence chỉ Staff, không raw
payment payload/token hoặc receipt hash. Payment references giữ nội bộ audit
items, không trả Student. Reader và safe DTO đã triển khai theo recovery schema4.3.

Read-only/private,no-store; không audit cho việc đọc. Empty: chưa có lịch sử
trong filter. Loading spinner/history skeleton; error401/403 dừng/ẩn history,
422 sửa filter,404 unavailable. Không polling; refetch page1 sau correction/
recover, giữ filter. Pagination theo snapshot mỗi request; có writes mới có thể
dịch page, dùng refresh về page1 thay vì giả định offset history bất biến.

## 5. POST `/api/v1/management/class-sessions/:sessionId/attendance/recover`

**NEW, IMPLEMENTED4.3.** Staff ACTIVE only, explicit confirmation/evidence reason.
SCHEDULED thực tế đã học hoặc COMPLETED thiếu dữ liệu, kể cả Class terminal;
Class DRAFT reject. IN_PROGRESS dùng finalize4.2; Session CANCELLED không recover.
Không cần mentor đang active hôm nay để chứng minh buổi đã diễn ra trong quá khứ.

FE lấy sessionId/version từ management4.1/GET roster; đọc roster/audit trước,
nhập roster theo evidence enrollment của đúng Class. Chưa có lookup mới cho
historical enrollment IDs trong4.3: Staff lấy IDs từ dữ liệu vận hành đã có/
chứng cứ được đối chiếu; Student self/foreign enrollment không được tự chọn.
Giao diện tìm kiếm enrollment lịch sử là follow-up nếu cần, không claim route mới.

Required key UUIDv4, body:

| Field | Validation runtime |
|---|---|
| expectedVersion | Integer>=1 của Session |
| reason | String trim1–1000, Staff required |
| evidenceNote | String trim1–2000; chứng cứ buổi/roster và xác nhận CASH late nếu có |
| actualStartedAt/actualEndedAt | ISO timezone required; start<end<=server now, cùng teaching day theo APP_TIME_ZONE |
| records | Array1–1000, unique enrollmentId; phần roster có chứng cứ được Staff xác nhận |
| records[].enrollmentId | UUIDv4 same-Class, createdAt<=actualStartedAt |
| records[].status | PRESENT hoặc ABSENT explicit |
| records[].admissionBasis | PAID_BEFORE_START hoặc CASH_LATE_ADMISSION required, enum |

Parser route này256KiB, routes khác64KiB; >limit413, >1000 rows422. FE
phải kiểm cả serialized byte size và số rows, không chia request recovery đầy đủ
thành batches vô tình làm partial roster thành đầy đủ. Các limit đã test trên built app, gồm đúng256KiB,256KiB+1 và1000/1001 rows. Không upload files trong request này.

```json
{
  "expectedVersion": 3,
  "reason": "Phục hồi buổi đã dạy nhưng chưa ghi điểm danh",
  "evidenceNote": "Đối chiếu sổ lớp ngày 10/10 và thanh toán đã xác minh; đây là toàn bộ phần roster có chứng cứ",
  "actualStartedAt": "2026-10-10T12:00:00Z",
  "actualEndedAt": "2026-10-10T14:00:00Z",
  "records": [{
    "enrollmentId": "55555555-5555-4555-8555-555555555555",
    "status": "PRESENT", "admissionBasis": "PAID_BEFORE_START"
  }]
}
```

200 WriteView theo mục1, COMPLETED/version4/totals/changedEnrollmentIds. Unknown
legacy teaching mentor effectiveMentor null; deadline=00:00 ngày startsAt+2 theo
APP_TIME_ZONE, có thể đã hết. Staff vẫn canEdit=true, Mentor không thêm quyền.
admittedAt/checkedInAt PRESENT là server recovery time, không giờ đến lịch sử.

PAID_BEFORE_START: verified paidAt<=start, exact enrollment/order detail linkage
và evidence nghĩa vụ. CASH_LATE_ADMISSION: pre-start hold, CASH đã paid và Staff
xác nhận admission trong evidenceNote. COMPLETED/CANCELLED enrollment lịch sử
được xét; pending/unpaid/late PayOS/post-start hold422. Chỉ createdAt/enrolledAt/
ACTIVE hôm nay không chứng minh roster. Evidence note không vượt payment guard.

Insert-only: existing row409 rollback toàn request, dùng correction PUT riêng.
Missing evidence422 giữ no-data; không tự ABSENT cho omissions. Giữ actual clocks
đã có, mismatch409; clocks null bổ sung từ evidence. Giữ historical actors/mentor
đã biết, unknown null. SCHEDULED→COMPLETED atomic, legacy không reopen, Class status
không đổi; recovery audit/evidence/rows/version/receipt cùng commit. Không payment
settlement/network/activation/material entitlement hoặc mentor slot mới.

UI loading/disable confirm; explicit preview clocks/roster/reason/basis. Success
refetch roster/audit/management Session list. Network retry cùng key/body; version/
row/clock409 refetch, đối chiếu evidence rồi user xác nhận lại; unpaid422 cần giải
quyết đúng workflow payment trước, không tự gọi confirm cash trong recovery. Empty
evidence không submit, no-data vẫn hiển thị thiếu dữ liệu; không tự suy ra vắng.

## 6. Errors và FE handling

Envelope ví dụ409 hiện có:
`{"statusCode":409,"code":"SESSION_VERSION_CONFLICT","message":"Refetch the roster before writing","requestId":"sample-trace"}`.

| Status/code | Phạm vi | FE xử lý |
|---|---|---|
|401 HTTP_ERROR | All routes, cookie expired | Session flow đăng nhập, dừng retry/poll |
|403 SESSION_ASSIGNMENT_REQUIRED hoặc HTTP_ERROR | Role/resource/ACTIVE guard; code tùy boundary hiện hữu | Thu hồi UI action/history, refetch context; không retry |
|400 HTTP_ERROR / INVALID_JSON_BODY | Invalid path/malformed JSON | Sửa input/request |
|404 CLASS_SESSION_NOT_FOUND | Missing Session | Rời detail hoặc refresh list |
|422 HTTP_ERROR | DTO/key/reason/nested/status closed/filter invalid | Field error; UNMARKED closed phải đổi PRESENT/ABSENT |
|422 ATTENDANCE_ENROLLMENT_NOT_ELIGIBLE | Wrong snapshot/ancestry/cutoff | Refetch roster; không partial retry batch |
|409 SESSION_VERSION_CONFLICT / IDEMPOTENCY_KEY_REUSED | Mutations | Refetch/reconfirm; retry ý định mới bằng key mới |
|409 SESSION_STATE_CONFLICT | Never-started correction hoặc invalid recovery state | Refetch; chọn start/finalize/correction đúng workflow |
|409 ATTENDANCE_EDIT_WINDOW_EXPIRED | Mentor new correction hết calendar deadline | Khóa sửa, chuyển Staff có reason |
|422 CLASS_SESSION_OVERNIGHT_NOT_ALLOWED | Recovery clocks overnight | Sửa evidence clocks; không tự đổi lịch |
|422 ATTENDANCE_RECOVERY_EVIDENCE_INVALID (implemented) | Payment/basis/history evidence thiếu/sai | Đối chiếu chứng cứ, giữ no-data |
|409 ATTENDANCE_RECOVERY_RECORD_EXISTS (implemented) | Recovery insert-only conflict | GET roster, correction row đã có riêng |
|409 ATTENDANCE_RECOVERY_CLOCK_CONFLICT (implemented) | Body khác clocks đã lưu | Hiển thị clocks hiện tại; recover không sửa clocks |
|413 INVALID_JSON_BODY | Body quá parser limit | Giảm payload theo contract; không retry nguyên body |
|500 INTERNAL_SERVER_ERROR | Unexpected infrastructure failure | Trace requestId; retry có giới hạn/key cũ sau xác định tạm thời |

403 tại RolesGuard là HTTP_ERROR; object-level/current actor403 là
SESSION_ASSIGNMENT_REQUIRED. Các3 recovery codes có source AppHttpException.

## 7. Handoff và ghi chép công việc

Backend handoff: migration/providers/commands, parser256KiB, Swagger safe DTO/errors
và [Postman4.3](../../postman/Mindy-Attendance-Phase43.postman_collection.json) đã có.
Cookie HTTP role journeys và PostgreSQL races/fault/legacy evidence đã kiểm local;
full check/test:http tại Progress4.3. Calendar baseline4.2 phải có trước;
APP_TIME_ZONE đúng môi trường. Server enable/browser nghiệm thu vẫn4.5.

2026-10-13: viết detailed API proposed4.3 và đối chiếu boundary/controller/DTO/
service/audit/parser4.2. Contract chung Phase4 tham chiếu plan này cho correction/
recovery history; admissionBasis/evidence shape/parser limits được ghi
rõ. Chỉ Markdown/source review, chưa runtime/migration/FE/deploy4.3.

2026-10-13 implementation: API trên đã có controller/DTO/service/migration và
focused assertions, gồm1000 evidenced rows trên built app và parser byte boundary.
Correction audit CORRECT, recovery RECOVER có evidence summary; payment references
vẫn nội bộ. Staff reason required, replay giữ key/body/version; permissions là hint.
Không API Student/guest/cancel/leave mới; không FE/server deployment trong task.

Nghiệm thu local cuối lượt2026-10-13:pnpm check PASS397/397 tests/39 suites và
pnpm test:http PASS39/39 tests/5 suites,0 skip. Recovery reason bắt buộc tại DTO/
service/Swagger;byte/rows/parser/role/migration/race/fault gates có assertions.
Handoff Postman/docs đã đồng bộ;không deploy/FE/browser/live-payment mới.
