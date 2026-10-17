# Phase 4.4 — API integration breakdown

Ngày cập nhật: **2026-10-17**, leave4.4a/approved intervals implemented;4.4b/4.4c giữ source/evidence hiện có. Gate cuối tại Progress4.4.
[Flow](PHASE_4_4_FLOW.md) · [Progress](../progress/phase%204/PHASE_4_4_PROGRESS.md) ·
[Contract dự kiến toàn phase](PHASE_4_flow-api-breakdown.md#10-reschedule-cancel-và-makeup--slice-44a).
Contract leave/approved intervals implemented tại mục19; schedule/history/summary/backlog4.4c đã có.
Contract thực tế 4.4b nằm tại mục6–12 dưới đây.
Contract **implemented 4.4c** nằm tại mục13–18, đối chiếu controllers/DTO/services
và compiled HTTP/PG tests. Gates cuối ở Progress4.4; không suy thành đã deploy/FE.

Handoff readiness16/10: deploy để nghiệm thu server có thể trước4.5;4.5 là gate
integration/release,không thêm nhóm endpoint4.4c mới. Không env/migration4.4c mới,
cần schema4.4b đến1792022400001 và đưa đầy đủ file mới vào commit/image deploy.
FE phải xử lý mentor/rate/deadline nullable và SESSION_MAKEUP. Chưa có server
evidence mới trong lượt giải thích này; Swagger/Postman contract giữ nguyên.

Review PR15 ngày16/10 sau fetch: merge-tree xác nhận6 conflict Markdown giữa
logs Phase4.4 và Materials/CI của dev. Không đổi endpoint/DTO/Swagger/Postman
trong lượt kiểm tra; chưa merge checkout,push hoặc có runtime evidence tích hợp.

## 1. Điều kiện dùng chung và ID handoff

ADMIN hoặc MANAGER ACTIVE; cookie `access_token` từ login hiện hữu. Service
kiểm role/status hiện hành trước mọi replay. Student/Mentor không có quyền
ghi lịch qua ba API dưới. Manager không tự có quyền `/admin/classes`.

FE gọi GET `/api/v1/management/classes/:classId` trước để lấy Session ID,
Class Unit ID và `version`; paging `page` default1, `pageSize` default20/max100
như 4.1. New mutation không có query/pagination. Header bắt buộc
`Idempotency-Key: <UUID v4>` và `Content-Type: application/json`.
Body required `expectedVersion` integer>=1, `reason` string trim1–1000.
Unknown fields/null/sai kiểu bị422. Path UUID sai400; không có Session404.
startsAt/endsAt phải ISO8601 hợp lệ có `Z` hoặc offset; không nhận giờ local
không offset. Body UUID v4, chấp nhận chữ hoa và chuẩn hóa chữ thường.

Retry lỗi mạng giữ nguyên key/body; response replay giữ outcome/asOf ban đầu,
không tăng audit/version hay gia hạn lần nữa. Payload khác cùng key409
`IDEMPOTENCY_KEY_REUSED`; stale version409 `SESSION_VERSION_CONFLICT`:
refetch, cho user xem lịch mới, dùng key mới cho ý định mới. Cả ba response
đều `Cache-Control: private, no-store`; không polling hoặc side effect gửi mail.

## 2. PATCH `/api/v1/management/class-sessions/:sessionId/schedule`

Màn quản lý lịch chọn SCHEDULED Session trong Class DRAFT/OPEN/IN_PROGRESS.
Body `{startsAt,endsAt,reason,expectedVersion}`. start<end, start>server now
sau locks, trong kỳ Class và không overnight; end đúng midnight được coi là
exclusive của ngày dạy trước. DRAFT không chiếm lịch mentor, open kiểm lại.

```json
{"startsAt":"2026-11-03T10:00:00+07:00","endsAt":"2026-11-03T11:00:00+07:00","reason":"Đổi phòng học","expectedVersion":2}
```

200 SessionView; tăng Session.version và Class.assignmentVersion, ghi schedule
audit/receipt atomic. Kiểm overlap Class và mentor hiệu lực, gồm substitute;
không đổi attendance/actual clocks/deadline. Không tự gia hạn endDate ở route này.

SessionView chung cho ba route (response ví dụ an toàn):

```json
{
  "sessionId":"11111111-1111-4111-8111-111111111111",
  "classId":"22222222-2222-4222-8222-222222222222",
  "classUnitId":"33333333-3333-4333-8333-333333333333",
  "title":"Buổi 1","startsAt":"2026-11-03T03:00:00.000Z","endsAt":"2026-11-03T04:00:00.000Z",
  "status":"SCHEDULED",
  "primaryMentor":{"id":"44444444-4444-4444-8444-444444444444","displayName":"Mentor"},
  "effectiveMentor":{"id":"44444444-4444-4444-8444-444444444444","displayName":"Mentor"},
  "assignmentType":"PRIMARY","version":3,
  "actualStartedAt":null,"actualEndedAt":null,"editableUntil":null,
  "makeupForSessionId":null,"makeupRootSessionId":null,
  "asOf":"2026-10-15T10:00:00.000Z","timeZone":"Asia/Ho_Chi_Minh"
}
```

Mentor lịch sử unknown trả effectiveMentor=null, không giả từ primary hiện tại.
Hai ancestry fields được thêm additive vào SessionView của detail/schedule/context
và các API assignment; buổi thường null. Không trả meeting URL trong SessionView.

## 3. POST `/api/v1/management/class-sessions/:sessionId/cancel`

Màn chi tiết Session xác nhận lý do; chỉ SCHEDULED/IN_PROGRESS, Class chưa
COMPLETED (cho phép dọn Session còn mở trong Class đã CANCELLED). Body:

```json
{"reason":"Không thể tổ chức buổi học","expectedVersion":3}
```

200 SessionView status=CANCELLED/version+1. Giữ attendance, actual clocks,
teaching mentor và editableUntil; không tự chốt/ABSENT. Giải phóng interval lịch
mentor; Session này có thể làm source buổi bù khi Class còn OPEN/IN_PROGRESS.
Summary4.4c đã loại buổi hủy khỏi denominator; xem contract implemented mục13–18.

## 4. POST `/api/v1/management/class-sessions/:sessionId/makeups`

Sau cancel/refetch, FE chọn **CANCELLED cuối chuỗi**, lấy Unit/version của nó.
Class OPEN/IN_PROGRESS. Body required classUnitId UUIDv4, title trim1–250,
startsAt/endsAt, reason, expectedVersion; optional mentorId UUIDv4, không null.
Unit phải đúng Unit source, bảo đảm cùng Class/Course Unit. Thời lượng giữ nguyên;
buổi tương lai, không overnight, không trước Class.startDate. Không mentorId
dùng primary hiện tại; muốn giữ mentor source phải gửi explicit mentorId.

```json
{"classUnitId":"33333333-3333-4333-8333-333333333333","title":"Buổi học bù","startsAt":"2026-11-05T10:00:00+07:00","endsAt":"2026-11-05T11:00:00+07:00","reason":"Bù buổi đã hủy","expectedVersion":4}
```

201 `{originalSessionId,originalVersion,classEndDate,session:SessionView}`:

- originalVersion là version mới của source (expectedVersion+1).
- session là ID mới, number mới trong Unit, version1/SCHEDULED, cùng duration,
  room/meeting context; actual clocks/deadline null và chưa có attendance snapshot.
- session.makeupForSessionId=source, makeupRootSessionId=root đầu chuỗi.
- classEndDate là endDate sau gia hạn tự động nếu buổi bù vượt kỳ; audit lưu trước/sau.

Ví dụ envelope: `{"originalSessionId":"11111111-1111-4111-8111-111111111111","originalVersion":5,"classEndDate":"2026-11-05","session":...}`
(session dùng đầy đủ SessionView trên với ID mới và hai ancestry IDs).
Nếu replacement lại hủy, tiếp tục bằng ID/version của replacement; không quay lại
source đầu để tạo nhánh. Transaction rollback toàn bộ khi bất kỳ validation/audit/
receipt thất bại, kể cả đã tính endDate mới.

## 5. Errors, refetch và nghiệm thu

| HTTP/code | FE xử lý |
|---|---|
|401 HTTP_ERROR hoặc auth code hiện hữu|Login lại; suspended cookie có thể401 ngay ở guard, không retry mutation tự động|
|403 SESSION_ASSIGNMENT_REQUIRED hoặc guard forbidden|Dừng thao tác; quyền hiện hành đã đổi, không retry key để vượt quyền|
|404 CLASS_SESSION_NOT_FOUND / CLASS_UNIT_NOT_FOUND|Refetch Class/detail; Unit khác source cũng404|
|422 HTTP_ERROR|Hiển thị field validation; thiếu/sai key, reason, offset, type, null|
|422 SESSION_START_NOT_FUTURE|Chọn giờ tương lai theo server|
|422 MAKEUP_DURATION_MISMATCH|Giữ thời lượng source|
|422 CLASS_SESSION_TIME_RANGE_INVALID / CLASS_SESSION_OVERNIGHT_NOT_ALLOWED / CLASS_SESSION_OUTSIDE_CLASS_PERIOD|Sửa giờ/ngày; schedule không tự gia hạn|
|422 CLASS_MENTOR_NOT_ELIGIBLE|Chọn mentor ACTIVE MENTOR|
|409 SESSION_STATE_CONFLICT / CLASS_NOT_EDITABLE|Refetch trạng thái; không reschedule buổi đã start hoặc cancel COMPLETED|
|409 SESSION_VERSION_CONFLICT / IDEMPOTENCY_KEY_REUSED|Refetch version hoặc giữ đúng body/key ban đầu khi retry|
|409 CLASS_SESSION_OVERLAP / CLASS_MENTOR_SCHEDULE_CONFLICT|Đổi giờ/mentor rồi tạo ý định mới|
|409 MAKEUP_ALREADY_EXISTS|Refetch chuỗi, dùng replacement CANCELLED cuối nếu muốn bù tiếp|

Loading: disable submit, giữ key trong retry lỗi mạng. Sau success refetch Class,
mentor schedule, candidates và context; sau conflict không giả định GET cũ giữ
slot. Lists trống dùng empty state baseline. Không gửi request khi đã mất role.
Baseline đầu 4.4a chưa có leave/guest/student-conflict checks; 4.4b bổ sung guard
placement và conflict projection dưới đây. Không dùng ba route này
để giả lập workflow phê duyệt nghỉ.

Happy path: detail → PATCH schedule → refetch version → cancel → refetch →
makeups → GET detail thấy source CANCELLED và replacement SCHEDULED/endDate mới.
Kiểm thêm stale version, reused key, simultaneous makeup, substitute overlap,
cross-unit, inactive mentor, IN_PROGRESS cancellation giữ điểm danh, COMPLETED
rejection, fault rollback, Manager bị403 ở `/admin`.

API Admin POST `/api/v1/admin/classes/:classId/cancel` giữ body/status200 cũ,
thêm batch Session cancellation với actor từ cookie và audit atomic; COMPLETED/
CANCELLED giữ nguyên. Không refund/release hold. Route Admin chỉ ADMIN.
Deploy cần compiled migration1792022400000 sau migrations hiện có; không env mới.
Source/local evidence xem progress, chưa xác nhận server/FE/browser4.4/4.5.

## 6. Quy ước chung của 4.4b

Các route management dành cho ADMIN/MANAGER ACTIVE, own list dành cho STUDENT
ACTIVE. Cookie `access_token`, `credentials: include`; JSON trực tiếp, không bọc
`data`. Mọi response mới và context/attendance đều `Cache-Control: private, no-store`.
Lists: `page` default 1, `pageSize` default 20/max 100; không chấp nhận query lạ.
Queue/own list không mặc định tuần. Mutation cần UUIDv4 `Idempotency-Key`, body
JSON strict, integer version>=1 và reason trim 1–1000; sai body/key 422, sai path
UUID 400. UUID body chuẩn hóa lowercase. Replay kiểm Staff hiện hành trước khi trả
receipt, giữ key/body cũ khi retry mạng; đổi payload cùng key trả 409
`IDEMPOTENCY_KEY_REUSED`. Ý định mới cần key mới sau refetch.

Prerequisites: compiled migrations qua **1792022400001-cross-class-makeup**, gồm
attendance 4.2/recovery 4.3 và schedule ancestry 4.4a. Không config/dependency mới.
Các gate dưới progress là local PostgreSQL + compiled HTTP, chưa xác nhận VPS/FE.
APP_TIME_ZONE lấy từ cấu hình; timestamps response có offset UTC. GET không giữ suất.

## 7. GET `/api/v1/management/student-schedule-conflicts`

Màn hàng chờ vận hành gọi trước để lấy `conflictId`, `enrollmentId`, source Session
và conflict `version`. Query optional `classId` UUIDv4 theo lớp gốc; `status` là
OPEN/MAKEUP_ASSIGNED/RESOLVED. Không status lấy OPEN + MAKEUP_ASSIGNED của toàn backlog.
Sort `createdAt ASC,id ASC`, count/filter trước phân trang.

200 `{items:[{id,enrollmentId,student:{id,displayName},sourceSession:SessionView,
conflictingIntervals:[{sessionId,startsAt,endsAt}],status,version,
makeupPlacementId,makeupPlacementVersion}],total,page,pageSize,asOf}`.
Hai placement fields null khi chưa có placement hiệu lực. `makeupPlacementVersion`
được bổ sung để Staff hủy placement sau target cancellation mà không cần dùng
Student API. Không trả URL của buổi trùng hoặc mở roster lớp khác cho Mentor.

Ví dụ: `GET /api/v1/management/student-schedule-conflicts?page=1&pageSize=20&status=OPEN`.
Empty = không có backlog trong filter; loading giữ filter, lỗi auth dừng và login lại.
Sau create/cancel/finalize/target cancel refetch queue, candidates và Class detail.
Không polling bắt buộc. Intervals là evidence snapshot; command vẫn kiểm lịch hiện hành.

Conflict tự ghi cùng transaction khi tạo/đổi lịch replacement hoặc checkout CASH/
activation CASH/PayOS phát sinh overlap liên quan replacement. PayOS pending chỉ
giữ sức chứa, không timetable; CASH pending còn hạn được ghi conflict nhưng chưa
được placement trước ACTIVE. Không chặn đăng ký/thanh toán vì overlap này. Không
mở rộng hàng chờ cho mọi overlap đăng ký ngoài replacement. Workflow approve leave
chưa có trong source nên chưa có producer từ leave approval.

## 8. GET `/api/v1/management/student-schedule-conflicts/:conflictId/makeup-candidates`

Staff chọn conflict OPEN, gọi candidates để lấy `targetSessionId` và
`expectedTargetVersion=items[].session.version`. Query page/pageSize và cặp optional
`from`/`to` ISO8601 có Z/offset, positive range<=93 ngày; thiếu một đầu 422.
Mặc định từ server now đến now+93 ngày, startsAt trong `[from,to)` và >now.
200 `{items:[{session:SessionView,remainingCapacity}],total,page,pageSize,asOf}`,
sort startsAt ASC,id ASC. Query range không hợp lệ 422; missing conflict 404
MAKEUP_NOT_FOUND; source pending 422 MAKEUP_NOT_ELIGIBLE; conflict đã assign/resolve
409 MAKEUP_ALREADY_ASSIGNED. Empty: đổi range hoặc giải quyết enrollment/lịch/sức chứa.

Server suy ra student/Course Unit/source từ conflict. Target phải khác Class,
cùng Course Unit, Class OPEN/IN_PROGRESS, SCHEDULED tương lai; không có enrollment
ACTIVE/COMPLETED hoặc pending hold còn hạn của student tại lớp nhận. Không overlap
ACTIVE/CASH pending còn hạn/guest ASSIGNED của student, trừ source obligation đang
được thay thế. Capacity = maxStudents − ACTIVE − mọi hold chưa hết hạn − ASSIGNED
guest của đúng Session. Không mặc nhiên suy ra nội dung tương đương từ Unit.
Approved leave availability còn phụ thuộc phần 4.4a thiếu trong source; candidates
hiện kiểm lịch đã lưu, không được mô tả là đã kiểm approved leave intervals.

## 9. POST `/api/v1/management/student-schedule-conflicts/:conflictId/makeup-placement`

Sau candidates, Staff xem nội dung và xác nhận bằng body sau; tất cả required:

```json
{
  "targetSessionId":"55555555-5555-4555-8555-555555555555",
  "expectedVersion":1,
  "expectedTargetVersion":3,
  "contentMatchConfirmed":true,
  "reason":"Đã đối chiếu nội dung buổi học tương đương"
}
```

201 `{placement:PlacementView,conflictVersion,targetSessionVersion}`. PlacementView:
`{id,conflictId,enrollmentId,sourceClassId,sourceSessionId,sourceRootSessionId,
targetSession:SessionView,status,version,attendanceStatus,creditStatus}`.
`status=ASSIGNED`, version1, attendanceStatus=null và creditStatus=PENDING lúc tạo.
SourceRoot lấy ancestry server. Target Session.version tăng một, conflict version
tăng một/status MAKEUP_ASSIGNED. Không tạo order/payment/enrollment tại lớp nhận.

Một transaction khóa hai Class theo UUID → hai Session theo UUID → student
advisory lock, kiểm lại entitlement/version/state/Unit/content/capacity/timetable,
ghi placement/audit/receipt. FK/trigger/partial unique bảo vệ root/Unit/identity,
nghĩa vụ source và student-target. Concurrent checkout tính peak guest reservation
của từng Session; không bán thêm enrollment nếu bất kỳ buổi nhận bù nào đã đầy.
Toàn bộ rollback khi ghi audit/receipt lỗi. Replay không nhân bản suất hoặc audit.

Sau success refetch queue/target roster/candidates/own placements. GET cũ không giữ
chỗ; 409 phải refetch và cho Staff chọn lại, không tự đổi target hoặc confirmations.

## 10. POST `/api/v1/management/makeup-placements/:placementId/cancel`

Staff lấy id/version từ create outcome hoặc queue `makeupPlacementId/Version`.
Body `{expectedVersion,reason}` như mutation chung, không query. Ví dụ
`{"expectedVersion":2,"reason":"Chuyển sang buổi nhận bù khác"}`.
200 PlacementView status CANCELLED/version+1, creditStatus REVOKED; guest snapshot
và audit giữ nguyên. Trước start giải phóng reservation, target Session.version
tăng một, conflict OPEN/version+1. Sau start cũng không đổi clocks/deadline.
Projection4.4c sử dụng lại source với credit policy mục13–18; không sửa physical history.

Target Session cancel hoặc Class cancel tự chuyển incoming ASSIGNED/COMPLETED
placements sang NEEDS_REASSIGNMENT, conflict OPEN và ghi audit trong cùng transaction,
không tự ABSENT. Staff phải cancel placement cũ có reason trước khi xếp lại; dùng
conflict version và target version mới. Không có auto reassign/notification.
Source có outgoing placement ASSIGNED/NEEDS_REASSIGNMENT bị chặn cancel; lịch của
source/target có placement history hiệu lực bị chặn reschedule/bulk-time. Hoàn thành
lớp gốc bị chặn khi còn ASSIGNED/NEEDS_REASSIGNMENT. Refetch Class/queue sau xử lý.

## 11. GET `/api/v1/me/makeup-placements` và Session context

STUDENT own metadata/history, query page/pageSize, optional status
ASSIGNED/COMPLETED/CANCELLED/NEEDS_REASSIGNMENT. Sort createdAt DESC,id ASC;
200 `{items:[PlacementView],total,page,pageSize,asOf,timeZone}`. Không chấp nhận
studentId; không có URL trong list. Own history vẫn đọc sau enrollment bị hủy/
hoàn thành; không cấp lại class/material entitlement. Empty = chưa có placement
trong filter. creditStatus PENDING khi ASSIGNED/NEEDS_REASSIGNMENT, FINALIZED khi
COMPLETED, REVOKED khi CANCELLED. Đây là trạng thái credit của placement, chưa là
tỷ lệ/summary của lớp. attendanceStatus null trước snapshot, sau đó là physical
UNMARKED/PRESENT/ABSENT, kể cả placement đã hủy.

Student mở đúng `GET /api/v1/class-sessions/:targetSessionId/context` lấy URL:
200 `{session:SessionView,roomName,meetingUrl,accessScope:"SESSION",makeupPlacementId}`.
Chỉ own placement ASSIGNED/COMPLETED, source enrollment ACTIVE và source/target
Class OPEN/IN_PROGRESS; target không CANCELLED. Session terminal không trả meeting
URL như baseline. Sau cancel/entitlement loss trả 403 SESSION_ASSIGNMENT_REQUIRED.
Staff/assigned Mentor giữ context cũ, makeupPlacementId=null. Student không được
đọc context buổi khác chỉ vì cùng lớp nhận; `/me/classes`, roster, materials và CASH
confirmation không mở quyền qua guest. Không cache URL, dừng/revoke màn khi gặp403.

## 12. Attendance/audits additive và lỗi FE

Giữ các route `/api/v1/class-sessions/:sessionId/start`, `/attendance`,
`/attendance/sync-roster`, `/finalize` và guards/version/deadline 4.2–4.3.
Start snapshot guest đã ASSIGNED, source ACTIVE/enrolledAt và placement.createdAt
không sau actualStartedAt. Guest lưu bảng riêng; không nới FK cùng Class của regular.
Roster `items[].entryType=REGULAR|MAKEUP`; MAKEUP có makeupPlacementId, enrollmentId
là source enrollment. Totals và pagination trên union regular+guest, sort
enrollmentId,entryType,attendanceId; totals là physical roster kể cả snapshot đã
thu hồi credit. Không dùng totals này làm tỷ lệ source/receiving Class.

PUT attendance giữ `records` required; thêm optional `guestRecords` max100,
items `{makeupPlacementId UUIDv4,status}`. records max100, cho phép `[]` khi có
guestRecords; tổng hai arrays phải có ít nhất một item, unique từng array.

```json
{"expectedVersion":4,"records":[],"guestRecords":[{"makeupPlacementId":"66666666-6666-4666-8666-666666666666","status":"PRESENT"}]}
```

Staff thêm reason bắt buộc. Hai loại rows/audits và Session.version commit atomic;
response thêm changedMakeupPlacementIds có dữ liệu. No-op không bump version.
Finalize tự ABSENT cho guest UNMARKED của ASSIGNED placement có snapshot, chuyển
COMPLETED/RESOLVED và audit. Không có eligible snapshot thì NEEDS_REASSIGNMENT,
không tạo ABSENT giả. Physical correction sau cancel không khôi phục credit.
Mentor target hiệu lực được ghi; Mentor source không ghi target. Deadline vẫn
00:00 ngày học+2 theo APP_TIME_ZONE, assignment/placement không reset clocks.
Recovery missing rows bằng evidence API 4.3 vẫn chỉ regular, không nhận guest.

GET `/api/v1/management/class-sessions/:sessionId/attendance-audits` thêm optional
`makeupPlacementId`; enrollmentId có thể thuộc source của guest đã snapshot đúng
target. 200 envelope cũ; items thêm `entryType` và nullable makeupPlacementId,
guest recoveryEvidence/recoveryAuditId=null. Staff-only, filter trước count/page.

| HTTP/code | FE xử lý |
|---|---|
|401 auth /403 guard, SESSION_ASSIGNMENT_REQUIRED|Login lại hoặc dừng thao tác/quyền đã thu hồi; replay không vượt quyền|
|404 MAKEUP_NOT_FOUND, CLASS_SESSION_NOT_FOUND|Refetch queue/target; không đoán ID|
|422 HTTP_ERROR|Sửa field/key/reason/content confirmation/range, không retry nguyên payload|
|422 MAKEUP_NOT_ELIGIBLE|Thanh toán ACTIVE nguồn/đối chiếu Unit và khác lớp trước chọn lại|
|409 MAKEUP_VERSION_CONFLICT, SESSION_VERSION_CONFLICT|Refetch conflict/placement/roster/candidates và dùng key mới cho ý định mới|
|409 MAKEUP_ALREADY_ASSIGNED, MAKEUP_STATE_CONFLICT|Refetch queue; cancel placement cũ có reason trước reassign|
|409 MAKEUP_TARGET_UNAVAILABLE, MAKEUP_TARGET_ENROLLED|Chọn target khác/kiểm trạng thái và enrollment hiện hành|
|409 MAKEUP_TARGET_FULL, MAKEUP_STUDENT_CONFLICT|Refetch candidates, chọn lại; không override conflict|
|409 MAKEUP_ATTENDANCE_NOT_ELIGIBLE|Guest ID không thuộc snapshot target; refetch roster, không ghi nhầm enrollment vào records|
|409 SESSION_HAS_MAKEUP_PLACEMENTS, CLASS_HAS_UNRESOLVED_MAKEUPS|Xử lý/cancel placement trước đổi lịch, cancel source hoặc complete Class|
|409 ATTENDANCE_EDIT_WINDOW_EXPIRED|Chuyển Staff correction có reason theo 4.3|
|409 IDEMPOTENCY_KEY_REUSED|Giữ body cũ khi retry mạng; ý định mới dùng key mới|

Loading disable submit, giữ request/key đến khi rõ kết quả. Sau mutation refetch
queue, candidates, Session/roster và own list tương ứng; không tự tạo optimistic
attendance credit trước finalize. Happy path: replacement → CASH checkout/PayOS
activation ghi conflict → queue → candidates → content confirmation → placement →
own context → target start/mark/finalize → own FINALIZED. Kiểm thêm pending payment,
wrong Unit/IDs/role, stale/key replay, suất cuối/checkout/start/cancel races,
no eligible snapshot, mixed-batch rollback, deadline/mentor changes và reassign.
Postman đã bổ sung cùng collection Phase44; gate và rollout xem Progress4.4.

## 13. 4.4c — Quy ước và contract chung

Implemented2026-10-16 theo [plan4.4 mục4](../implement_phase/phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md#4-44c--lịch-student-tổng-hợp-và-hàng-chờ-vận-hành).
Source: AttendanceReportsController/Service, AttendanceProjectionService,
attendance-credit SQL policy và MySchedule DTO/service.20 focused PG cases và3
compiled HTTP cases4.4c pass; guest journey HTTP4.4b được mở rộng để kiểm source
và receiving summaries. Full regression/evidence xem Progress4.4. Không có
schema/config mới; cần migrations4.2–4.4b hiện có trước khi chạy app mới;
không phụ thuộc leave approval để đọc các buổi/placements đã persist.

- Cookie access_token hiện hữu, AccessTokenGuard + RolesGuard và current active
  principal. Student routes chỉ STUDENT self, không nhận studentId/enrollmentId
  query để đổi chủ thể. Management routes chỉ ADMIN/MANAGER; MENTOR dùng roster
  hiện có, không được đọc báo cáo lớp qua routes này.
- Tất cả GET200, read-only, `Cache-Control: private, no-store`; không body,
  expectedVersion, Idempotency-Key hoặc side effect/audit. Một transaction READ
  ONLY/REPEATABLE READ và một asOf cho count/items/summary trong mỗi response.
- Lịch giữ query baseline2.3. Bốn GET mới: optional from/to phải cùng có hoặc
  cùng bỏ, ISO8601 có Z/offset, from<to, tối đa93 ngày. Overlap `[from,to)`;
  không gửi range là toàn history/Class hoặc toàn incomplete backlog. Không
  mặc định tuần hiện tại. Timestamps trả ISO8601, timeZone=APP_TIME_ZONE.
- Lists mới page integer>=1 default1, pageSize1–100 default20; count sau
  ownership/filter/normalization, trước page. Summary Student không có page.
  Không chấp nhận unknown fields/null/invalid enums. Path UUID sai400; query sai422.
- History Item: `{sessionId,enrollmentId,rootSessionId,title,startsAt,
  endsAt,sessionStatus,attendanceStatus,attendanceApplicability,excluded,
  effectiveMentor,assignmentType,makeupForSessionId,makeupRootSessionId,
  makeupPlacementId,creditSessionId,creditedAttendanceStatus}`. Nullable: mentor,
  physical status, placement/ancestry/credit IDs và credited status khi chưa có.
  effectiveMentor là `{id,displayName}` hoặc null; assignmentType PRIMARY/SUBSTITUTE
  theo metadata hiện có, không dùng enum này để bịa người dạy legacy.
- attendanceStatus là **physical** UNMARKED/PRESENT/ABSENT|null; credited status
  chỉ PRESENT/ABSENT|null. ELIGIBLE chưa chắc đã finalized. MAKEUP_CREDITED
  có credit ở source nghĩa vụ nhưng giữ physical source; MAKEUP_PENDING loại
  denominator. Canceled ưu tiên hiển thị Đã hủy/excluded=true. NOT_STARTED,
  NOT_ELIGIBLE, PAYMENT_PENDING, LEGACY_NO_DATA không được hiển thị Vắng.
- Summary fields chung: present, absent, unmarked, excluded, makeupPending,
  finalizedEligibleCount, rate. present/absent chỉ credited finalized;
  denominator=present+absent; rate round2 chữ số hoặc null khi denominator0.
  Các nhóm count theo nghĩa vụ đã normalize, không theo physical history rows.
  Quy tắc root/credit-owner/range và partial recovery xem plan4.4 mục4.2.
- Khi có nhiều enrollment histories, một owner mỗi student/root: finalized
  evidence → pending obligation → physical snapshot → enrolled trước cutoff →
  current ACTIVE/COMPLETED → history còn lại; tie createdAt DESC,id DESC.
  Non-owner không cộng count; history vẫn giữ physical/excluded=true/credit=null.
  Placement COMPLETED thiếu valid target/snapshot giữ pending, không fallback
  credit từ source. Hai summaries aggregate trong SQL trước pagination.

## 14. GET `/api/v1/me/schedule` — extension implemented4.4c

Màn lịch lấy classId từ My Classes hoặc target Class trong own placements;
gọi lại khi đổi range/filter hoặc mở lại màn sau khi lịch/điểm danh thay đổi.
Giữ nguyên from/to **bắt buộc** <=31 ngày, page default1/pageSize default100 max100,
includeCancelled defaulttrue, classId optional UUIDv4. Overlap theo physical
Session; sort startsAt ASC,sessionId ASC. Response envelope items/total/page/
pageSize/from/to/asOf/timeZone và các local dayOfWeek/startTime/endTime giữ nguyên.

Ví dụ request: `GET /api/v1/me/schedule?from=2026-10-18T17:00:00Z&to=2026-10-25T17:00:00Z&page=1&pageSize=100&includeCancelled=true`.
Trên mỗi event giữ session/class/course/unit/enrollment/delivery/room fields;
mentor đổi thành effective mentor nullable theo Session, thêm assignmentType,
attendanceStatus, attendanceApplicability, attendanceExcluded,
creditedAttendanceStatus, makeupForSessionId, makeupRootSessionId,
sourceClassId, sourceSessionId, makeupPlacementId (các link không áp dụng=null).
Đổi mentor thành nullable cần FE null handling; mở enum accessMode là additive
nhưng FE phải thêm nhánh trước khi dùng extension.

Ví dụ phần fields mới của hai event (response vẫn có toàn bộ fields baseline):

```json
[
  {"accessMode":"FULL","mentor":null,"assignmentType":"PRIMARY","attendanceStatus":null,"attendanceApplicability":"LEGACY_NO_DATA","attendanceExcluded":true,"creditedAttendanceStatus":null,"makeupForSessionId":null,"makeupRootSessionId":null,"sourceClassId":null,"sourceSessionId":null,"makeupPlacementId":null},
  {"accessMode":"SESSION_MAKEUP","mentor":{"id":"22222222-2222-4222-8222-222222222222","displayName":"Mentor B"},"assignmentType":"SUBSTITUTE","attendanceStatus":"UNMARKED","attendanceApplicability":"MAKEUP_PENDING","attendanceExcluded":true,"creditedAttendanceStatus":null,"makeupForSessionId":null,"makeupRootSessionId":null,"sourceClassId":"44444444-4444-4444-8444-444444444444","sourceSessionId":"55555555-5555-4555-8555-555555555555","makeupPlacementId":"66666666-6666-4666-8666-666666666666"}
]
```

FULL/CASH_PREVIEW giữ entitlement baseline. CASH_PREVIEW luôn physical/credit
null, PAYMENT_PENDING; PayOS pending/expired hold không vào timetable. Guest
ASSIGNED/COMPLETED chỉ vào current timetable khi có current entitlement như
4.4b context; placement cancel/needs-reassignment hoặc source/target không còn
đủ điều kiện thì bỏ event guest. includeCancelled giữ nghĩa regular baseline,
không khôi phục guest entitlement đã thu hồi. Own placement history vẫn ở API11.

Guest event classId/classUnitId/course/unit/room theo physical target, enrollmentId
theo source; không trả meeting URL. classId filter theo lớp event, cho phép
guest-only Class có own guest hợp lệ; không đòi enrollment ở lớp nhận. Union
regular/guest rồi dedup physical session (regular hợp lệ ưu tiên), filter/count/page.
FULL mở detail; CASH_PREVIEW mở preview; SESSION_MAKEUP dùng sessionId gọi đúng
context API11, không mở receiving Class detail/materials/roster/CASH.

401/403 login hoặc dừng quyền; classId không current access trả403
`SCHEDULE_CLASS_ACCESS_DENIED` như baseline; validation422 sửa query, không retry
mù. Empty=không có sự kiện đủ quyền trong khoảng đã chọn. Loading giữ range;
không poll bắt buộc, không cache meeting URL; context403 thu hồi màn buổi.

## 15. GET `/api/v1/me/classes/:classId/attendance` — implemented4.4c

Student mở tab Điểm danh từ own Class hoặc Class ID lịch sử đã lưu; phải từng
có own enrollment đúng lớp, kể cả COMPLETED/CANCELLED. Guest-only receiving
Class không được cấp Class history. Không yêu cầu current full entitlement.
Query page/pageSize và optional from/to theo mục13; không có includeCancelled,
history luôn giữ buổi hủy. Ví dụ:
`GET /api/v1/me/classes/44444444-4444-4444-8444-444444444444/attendance?page=1&pageSize=20`.

200 `{classId,items:HistoryItem[],total,page,pageSize,asOf,timeZone}`. Sort
startsAt DESC,sessionId DESC,enrollmentId ASC để ổn định khi có nhiều enrollment
histories. HistoryItem theo mục13; regular physical source/replacements của own
Class, creditSessionId trỏ target khi guest credited; không chèn thêm target như
nghĩa vụ thứ hai. Filter ngày history theo physical row, summary theo source
nghĩa vụ nên không cộng các dòng history trên trang để tính rate.

Không trả meeting URL/materials/classmates/contact/payment IDs/evidenceNote
hoặc audit của người khác. Own physical lịch sử không đổi khi credit bị revoke.
Chọn placement link → own placements, không gọi receiving Class detail.
Loading/empty biểu thị chưa có buổi trong scope, không suy ra absent. Refresh
khi đổi tab hoặc sau known correction; không polling mặc định. 401/403 dừng;
404 `ATTENDANCE_HISTORY_NOT_FOUND` cho class không tồn tại/không own,
không tiết lộ lớp người khác; 400 path sai/422 query sai. GET lặp không ghi DB.

## 16. GET `/api/v1/me/classes/:classId/attendance-summary` — implemented4.4c

Gọi cùng tab Điểm danh với cùng Class/range của báo cáo, độc lập history page.
Ownership/metadata-only giống API15. Query chỉ optional from/to như mục13;
không nhận page/pageSize. Ví dụ request suffix `/attendance-summary` không query.

200 ví dụ đầy đủ:

```json
{"classId":"44444444-4444-4444-8444-444444444444","present":3,"absent":1,"unmarked":1,"excluded":2,"makeupPending":1,"finalizedEligibleCount":4,"rate":75,"asOf":"2026-10-16T03:00:00Z","timeZone":"Asia/Ho_Chi_Minh"}
```

Buổi chưa chốt/canceled không successor/legacy no-data/chờ makeup không vào
denominator. Guest COMPLETED hợp lệ thay source đúng một lần; receiving Class
không có guest count. Resolve chain toàn bộ trước range; range theo source
hiệu lực, không theo target guest. Own nhiều enrollment histories phải áp dụng
credit-owner rule cùng management reader; không sum các row history bị trùng.
Correction/revoke có hiệu lực lần GET sau, không sửa physical rows.

Empty scope trả các count0/rate=null; UI ghi Chưa có buổi đã chốt, không hiển thị
0% thay null. Loading không dùng dữ liệu của Class cũ, error không dùng summary
cũ như số liệu mới. Errors/refetch giống API15. Không cache/poll bắt buộc.

## 17. GET `/api/v1/management/classes/:classId/attendance-summary` — implemented4.4c

ADMIN/MANAGER mở báo cáo từ management Class list/detail, lấy classId tại đó.
Query page/pageSize và optional from/to theo mục13, sort student.displayName ASC,
enrollmentId ASC. 200 `{classId,items:[{enrollmentId,student:{id,displayName},
present,absent,unmarked,excluded,makeupPending,finalizedEligibleCount,rate}],
total,page,pageSize,asOf,timeZone}`. Mỗi item theo enrollment thuộc Class,
kể cả enrollment CANCELLED có history; không thêm guest incoming như enrollment.
Các count mỗi item tính toàn scope trước page, dùng cùng credit reader/reducer
với API16. Class chưa có enrollment/history trả items[]/total0.

Ví dụ: `GET /api/v1/management/classes/44444444-4444-4444-8444-444444444444/attendance-summary?page=1&pageSize=20`.
Chọn enrollment/Session → roster/audit Staff hiện có để xem evidence, không sửa
count tại UI. Refresh report sau finalize/correct/recover/cancel/reassign;
không poll mặc định. Loading giữ filter, không dùng count page làm toàn Class.
401/403 dừng;404 `CLASS_NOT_FOUND` theo Classes;400/422 sửa path/query.
GET không ghi DB; không suy từ có report sang quyền admin CRUD.

## 18. GET `/api/v1/management/class-sessions/incomplete` — implemented4.4c

ADMIN/MANAGER mở hàng chờ vận hành. Static route phải được kiểm tra tránh bị
dynamic `:sessionId` bắt nhầm. Query page/pageSize, classId optional UUIDv4,
issue optional OVERDUE_NOT_STARTED/STARTED_NOT_FINALIZED và optional from/to
theo mục13. Không gửi range/issue => **toàn backlog cả hai issue**, không chỉ tuần.
Ví dụ: `GET /api/v1/management/class-sessions/incomplete?page=1&pageSize=20&issue=OVERDUE_NOT_STARTED`.

Điều kiện: Class OPEN/IN_PROGRESS; Session endsAt<=asOf và status SCHEDULED =>
OVERDUE_NOT_STARTED, IN_PROGRESS => STARTED_NOT_FINALIZED. Loại DRAFT/terminal
Class và COMPLETED/CANCELLED Session. Explicit range overlap physical Session;
filter classId không tồn tại trả empty như filter list, không mở thêm detail.
Sort endsAt ASC,sessionId ASC;200 `{items:[{session:SessionView,issue,
deadlineExpired}],total,page,pageSize,asOf,timeZone}`. SessionView dùng safe
metadata4.1 không meeting URL; mọi item dùng cùng response asOf/timeZone.
deadlineExpired = editableUntil<=asOf nếu có; null nếu chưa có stored deadline.
Không suy permission/canStart từ deadlineExpired hoặc endsAt; lấy roster
permissions hiện hành trước mutation. Không tự ABSENT/start/finalize/expire.

FE chọn Session → GET roster → recovery có evidence4.3/finalize/cancel hoặc
assignment theo quyền/state hiện hành. Chưa start ngoài ngày học cần Staff
recovery, không gọi start thường để bỏ qua guard. Sau mutation refetch queue/
roster/reports. Empty=không có issue trong filter, loading giữ bộ lọc;
401/403 login/dừng,400/422 sửa ID/range/issue; không polling bắt buộc.

Happy path4.4c: lịch own→history→summary source; Staff summary đối chiếu
credit→incomplete→roster/recovery/finalize→refetch. Phải kiểm riêng pending CASH,
guest target ngoài range, chain nhiều tầng, no-data, partial recovery, terminal
enrollment, query snapshot và role/ownership theo T44C-01–20. Swagger/Postman
Phase44 có5 GET reads (16–20); source/PG/HTTP evidence tại Progress4.4.
FE/VPS acceptance ở4.5, không dùng local tests thay deployment.
## 19. Mentor leave requests — implementation 2026-10-17

Backend implemented; cần migration `1792195200000-mentor-leave` trước deploy.
Các dòng leave PLANNED/gap trong baseline trước17/10 được thay bằng mục này.
[Flow thực hiện](PHASE_4_4_FLOW.md). Không suy local tests thành VPS/browser4.5.

### Quy ước chung và quyền

- Prefix `/api/v1`; auth cookie `access_token`. Mentor routes chỉ MENTOR đang
  active; management routes chỉ ADMIN/MANAGER active. Service kiểm lại current
  actor trước replay. Mentor chỉ own request, guessed/foreign ID trả404.
- Mọi response là JSON trực tiếp, **không bọc `data`**. Header private/no-store
  cho success. POST preview/slots là read-only200; create201; actions200; GET200.
- Create/approve/reject/withdraw bắt buộc `Idempotency-Key: UUIDv4`. Retry cùng
  actor/route/key/body trả receipt cũ, không tạo audit/replacement thứ hai; đổi
  body cùng key409. Sau409 stale/version dùng refetch và ý định mới/key mới.
- Ngày YYYY-MM-DD thật, range inclusive tối đa93 ngày; tối đa500 sources. Giờ
  ISO8601 có Z/offset. APP_TIME_ZONE xác định period và notice, không timezone máy FE.
  Body parser chung64KiB vẫn áp dụng, có thể phải chia nhỏ hơn500 sources theo
  độ dài mappings/reason; không dùng giới hạn256KiB riêng của attendance.
- Page/pageSize mặc định1/20, tối đa100; lists không mặc định tuần. UUID paths
  được parse; body/query strict, không nhận field ngoài contract, null thay
  optional hoặc version dạng string. `reason` trim,1–1000 ký tự.
- Read snapshot REPEATABLE READ/READ ONLY. GET chỉ project EXPIRED; command
  gặp pending quá expiresAt ghi EXPIRED+audit và commit rồi trả409. Không auto approve.

### API và thứ tự FE

| Method/route | Input và thời điểm FE gọi | Output |
|---|---|---|
| POST `/mentor/leave-requests/preview` | `{fromDate,toDate,period}` khi chọn form | `{affectedSessions:TeachingSessionDto[],sourceVersions:[{sessionId,version}],noticeEligible,noticeDeadline:ISO|null,asOf,timeZone}`. Empty không tạo đơn; noticeDeadline exclusive midnight ngay trước ngày affected sớm nhất. |
| POST `/mentor/leave-requests/makeup-slots` | `{sourceSessionId,targetDate,targetPeriod}`; targetPeriod MORNING/AFTERNOON/EVENING | `{slots:[{startsAt,endsAt}],sessionVersion,asOf,timeZone}`; step15 phút, giữ duration, tránh class/mentor/approved leave/student ACTIVE/live CASH/guest. Empty chọn ngày khác. Không giữ slot. API chưa nhận range nghỉ; create/approve kiểm thêm target nằm ngoài toàn range/period nghỉ. |
| POST `/mentor/leave-requests` | Body mẫu bên dưới; sourceVersions lấy nguyên preview | `LeaveRequestDto`, PENDING/version1. Requery toàn affected set, không chấp nhận subset/duplicate IDs. Không đổi source hoặc giữ slot; source đang có placement trả409. |
| GET `/mentor/leave-requests` | `page,pageSize,status?` | `LeaveRequestPageDto`; own, submittedAt DESC/id DESC. |
| GET `/mentor/leave-requests/:requestId` | `page,pageSize` phân trang items | `LeaveRequestDto`, current studentConflictCount, không student IDs/conflicting sessions của người khác. |
| POST `/mentor/leave-requests/:requestId/withdraw` | `{expectedVersion,reason}` từ own pending detail | `LeaveRequestDto` WITHDRAWN; không đổi lịch. |
| GET `/management/mentor-leave-requests` | `page,pageSize,status?,mentorId?` | `LeaveRequestPageDto`; toàn backlog nếu không filter. |
| GET `/management/mentor-leave-requests/:requestId` | `page,pageSize` | `ManagementLeaveDetailDto`: request + `sourcesCurrent`, current `studentConflictCount`, `studentConflicts:[{sourceSessionId,studentId,conflictingSessionId}]` phân trang cùng page/pageSize. Preview không giữ lịch. |
| POST `/management/mentor-leave-requests/:requestId/approve` | `{expectedVersion,reason,acknowledgeStudentConflicts:boolean}` bắt buộc; Manager xem detail trước | `{request:LeaveRequestDto,replacements:TeachingSessionDto[],classExtensions,studentConflictCount}`. Tối đa500 replacements theo source cap. |
| POST `/management/mentor-leave-requests/:requestId/reject` | `{expectedVersion,reason}` | `LeaveRequestDto` REJECTED, không đổi lịch. |

Statuses: PENDING, APPROVED, REJECTED, WITHDRAWN, EXPIRED. Chỉ PENDING được action;
approve/reject là staff, withdraw là own mentor. Không có action sửa đơn; stale
thì withdraw và preview/create mới. Không withdraw đơn đã APPROVED; xử lý lịch
qua session operations đã có và giữ approved leave history.

Create FULL_DAY mẫu (IDs giả; thay bằng preview hiện hành):

```json
{
  "fromDate": "2026-11-06",
  "toDate": "2026-11-06",
  "period": "FULL_DAY",
  "reason": "Personal leave",
  "sourceVersions": [{"sessionId":"11111111-1111-4111-8111-111111111111","version":2}],
  "dayMappings": [{"sourceDate":"2026-11-06","targetDate":"2026-11-08"}]
}
```

FULL_DAY chỉ nhận dayMappings: mỗi affected source date đúng một mapping, giữ
clock/thời lượng và mentor xin nghỉ. MORNING/AFTERNOON/EVENING chỉ nhận
sessionMappings (không gửi dayMappings): mỗi source đúng một
`{sourceSessionId,targetDate,targetPeriod,startsAt,endsAt}`; targetPeriod là một
trong ba buổi, giữ duration và toàn slot trong period, không overnight. Target
phải tương lai, không trước Class.startDate hoặc giao khoảng nghỉ đang xin/
đã duyệt. Class.endDate tự gia hạn khi approve, không cần FE PATCH lớp trước.

`LeaveRequestDto`:

```text
{id,mentorId,fromDate,toDate,period,reason,status,version,
 submittedAt,expiresAt,itemCount,items,page,pageSize,
 studentConflictCount,classExtensions,review,asOf,timeZone}
items=[{sourceSessionId,classId,sourceVersion,sourceStartsAt,sourceEndsAt,
        startsAt,endsAt,replacementSessionId:UUID|null}]
classExtensions=[{classId,endDate:YYYY-MM-DD}]
review=null|{reviewerId,reason,reviewedAt}
LeaveRequestPageDto={items:LeaveRequestDto[],total,page,pageSize,asOf}
```

List summaries trả `items:[]` ở mỗi request, itemCount là tổng thật. Create và
approve trả100 items đầu, GET detail có thể page tiếp; reject/withdraw trả summary.
studentConflictCount null ở list/create/action request; own/staff detail có số
current thật; approve có số count ở envelope ngoài. classExtensions liệt kê endDate
dự kiến của mọi affected class (max current endDate và target date), không chỉ lớp
thực sự tăng ngày. `expiresAt`=startsAt source sớm nhất. `review` ở terminal
withdraw/expired cũng ghi actor command, không nhất thiết là reviewer staff.

### Side effects, races và lỗi FE phải xử lý

Approval khóa request/Class/Session/mentor/student, requery toàn affected set
và kiểm lại version/current mentor/active role/placements/timetable. FULL_DAY
có student conflicts cần acknowledge=true; nghỉ buổi luôn chặn student conflict.
APPROVED + cancel sources + replacements + extend endDate + approved intervals
+ student conflict queue + schedule/leave audits + receipt cùng transaction.
Lỗi bất kỳ bước nào rollback toàn bộ; không attendance backfill/copy ABSENT,
không đổi payment/enrollment/material entitlement, không email/notification.

| Status/code | FE xử lý |
|---|---|
|401|Đăng nhập lại.|
|403 `LEAVE_FORBIDDEN` hoặc role guard|Dừng action, tải lại quyền/tài khoản.|
|404 `LEAVE_NOT_FOUND`, `LEAVE_SOURCE_NOT_FOUND`|Không lộ own request của mentor khác; quay danh sách/refetch nguồn. Class/session lookup cũng có404 hiện hữu.|
|422 `LEAVE_RANGE_INVALID`, `LEAVE_TOO_MANY_SESSIONS`|Sửa/chia nhỏ khoảng ngày.|
|422 `LEAVE_NOTICE_TOO_SHORT`|Chọn affected dates cách ngày gửi ít nhất hai ngày lịch.|
|422 `LEAVE_MAPPING_INVALID`, `LEAVE_TARGET_INVALID`|Sửa mapping/period/duration/giờ. DTO invalid trả422 hiện hữu.|
|422 `LEAVE_KEY_INVALID`|Gửi UUIDv4 key cho ý định mới.|
|409 `LEAVE_REQUEST_STALE`|Refetch; withdraw pending cũ và tạo request từ preview mới. Không auto retry approve.|
|409 `LEAVE_VERSION_CONFLICT`|Refetch request/version, người dùng quyết định lại.|
|409 `LEAVE_REQUEST_EXPIRED`, `LEAVE_STATE_CONFLICT`|Refetch, ngừng approve/reject/withdraw pending cũ.|
|409 `LEAVE_TARGET_CONFLICT`, `LEAVE_STUDENT_CONFLICT`|Chọn lịch bù khác; PENDING không giữ slot nên có thể lỗi mới lúc approve.|
|409 `LEAVE_STUDENT_CONFLICT_ACK_REQUIRED`|Manager xem current conflicts và xác nhận rõ trước action mới; không tự bật cờ.|
|409 `SESSION_HAS_MAKEUP_PLACEMENTS`|Quản lý xử lý placement trước rồi preview lại.|
|409 `LEAVE_MENTOR_INACTIVE`|Xử lý phân công/tài khoản trước, không auto approve.|
|409 `IDEMPOTENCY_KEY_REUSED`|Không đổi body trên cùng key.|
|409 `CLASS_MENTOR_SCHEDULE_CONFLICT`|Writer hiện hữu chặn cả approved leave; candidate basis mới là TEACHING_SCHEDULE_AND_APPROVED_LEAVE.|

Loading: khóa nút action trong khi request; lỗi mạng retry cùng key/body. Preview
empty hiển thị không có buổi phù hợp. Sau create/withdraw/reject refetch lists/
detail. Sau approve refetch class detail/endDate, mentor schedule, student schedule,
incomplete/conflict queues và candidates. Không polling mutation; GET chỉ metadata,
expiresAt là mốc FE hiển thị hết hạn. Candidate/create guest placement kiểm approved
leave, tạo placement trả MAKEUP_TARGET_UNAVAILABLE khi mentor target nghỉ.

Rollback: migration additive không sửa deployed migrations; down chỉ cho schema
chưa có leave history. Có history thì rollback ứng dụng, giữ schema/dữ liệu; dùng
4.5 để nghiệm thu server/browser/release. Rate-limit/metrics/i18n riêng giữ giới
hạn baseline, không tự nhận đã triển khai chúng.
