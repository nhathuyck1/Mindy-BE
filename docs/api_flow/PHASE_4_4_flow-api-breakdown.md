# Phase 4.4 — API integration breakdown

Ngày cập nhật: **2026-10-15**, Session operations 4.4a và học bù lớp khác 4.4b có source.
[Flow](PHASE_4_4_FLOW.md) · [Progress](../progress/phase%204/PHASE_4_4_PROGRESS.md) ·
[Contract dự kiến toàn phase](PHASE_4_flow-api-breakdown.md#10-reschedule-cancel-và-makeup--slice-44a).
Leave/approved intervals và Student schedule/history/summary 4.4c vẫn **PLANNED**.
Contract thực tế 4.4b nằm tại mục 6–12 dưới đây; không suy ra workflow leave đã có.

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
Hiệu ứng loại mẫu số Student sẽ có khi triển khai summary4.4c, chưa có API rate.

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
Kết quả source sẽ do projection 4.4c sử dụng lại; chưa có summary API trong 4.4b.

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
