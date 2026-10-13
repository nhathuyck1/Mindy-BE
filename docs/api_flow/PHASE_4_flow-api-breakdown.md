# Phase 4 — API breakdown cho frontend

**2026-10-13 — toàn bộ contract Phase 4 dưới đây PLANNED, chưa gọi được.**
[Flow](PHASE_4_FLOW.md) ·
[Plan](../implement_phase/phase%204/PHASE_4_ATTENDANCE_OPERATIONS.md) ·
[Progress](../progress/phase%204/PHASE_4_PROGRESS.md).
`GET /api/v1/me/schedule` là API đã có; các field attendance/mentor buổi mới planned.

## 1. Contract chung áp dụng cho từng API bên dưới

- Prefix `/api/v1`; cookie `access_token`, FE dùng session adapter/credentials hiện
  có; không gửi role/studentId/actor/timestamps nội bộ để tự cấp quyền.
- Staff = ACTIVE MANAGER/ADMIN; mentor = ACTIVE MENTOR được phân công hiệu lực
  cho Session. Đọc/ghi kiểm ancestry và quyền hiện hành, không tin canEdit từ FE.
- Response JSON trực tiếp, không `{data}`. GET/PATCH/PUT/action POST trả 200;
  POST tạo makeup trả 201. Private reads dùng `Cache-Control: private, no-store`.
- UUID v4 path/body; invalid path theo ParseUUIDPipe hiện có: 400 HTTP_ERROR;
  invalid query/body: 422 HTTP_ERROR. ISO timestamps phải có offset, server
  giữ UTC và trả timeZone từ APP_TIME_ZONE, asOf từ server.
- List `page` integer >=1 default1, `pageSize` 1–100 default20, sort ổn định.
  `from,to` nếu có: ISO offset, from < to, tối đa93 ngày, filter overlap `[from,to)`;
  không truyền thì mặc định tuần hiện tại theo APP_TIME_ZONE. History/summary
  không có date range mặc định nghĩa toàn bộ Class; summary có range phải gọi
  tường minh và FE ghi nhãn khoảng thống kê.
- Mutations đều required `expectedVersion` integer >=1; Class assignment dùng
  assignmentVersion, các mutation buổi/roster dùng session.version. Required
  header `Idempotency-Key` UUID v4: FE tạo một key cho một ý định, giữ key khi
  retry sau lỗi mạng; thay body/refetch đổi ý định thì tạo key mới.
- Lưu idempotency ledger scope actor + route + key, payload hash + outcome cùng
  transaction với audit. Replay cùng payload trả outcome đã commit, không tăng
  version/audit/deadline lại; khác payload trả409 IDEMPOTENCY_KEY_REUSED. Check
  authentication/assignment hiện hành trước replay, không trả cached quyền cũ.
- `reason`: trimmed string 1–1000 ký tự cho staff mutation; mentor mark/finalize
  không bắt buộc reason. Không nhận trạng thái Session tùy ý bằng PATCH generic.
- Ghi sync trong transaction. Không network/payment/storage call khi giữ lock.

### Shape dùng lại (đề xuất)

SessionView = `{sessionId,classId,classUnitId,title,startsAt,endsAt,status,
actualStartedAt,actualEndedAt,primaryMentor,effectiveMentor,assignmentType,
makeupForSessionId,version,editableUntil,asOf,timeZone,permissions}`.
Mentor = `{id,displayName}`; assignmentType = PRIMARY/SUBSTITUTE.
permissions = `{canStart,canEditAttendance,canFinalize,canReassign,canReschedule}`.
Actual timestamps/editableUntil nullable trước start. effectiveMentor nullable
cho lịch sử legacy chưa xác định người dạy, không giả bằng mentor hiện tại.
makeupForSessionId nullable khi không phải buổi bù.

RosterView = `{session:SessionView,items,page,pageSize,total,totals,
pendingPaymentCount}`. Item = `{attendanceId,enrollmentId,student:{id,displayName},
status,checkedInAt,admittedAt}`. status UNMARKED/PRESENT/ABSENT.
totals = `{present,absent,unmarked,eligible}` tính trên toàn roster, không theo page.
Write trả `{session:SessionView,totals,changedEnrollmentIds}` để refetch các page.

### Error/UI chung

| HTTP/code đề xuất | FE xử lý |
|---|---|
| 401 HTTP_ERROR/auth mapping hiện có | Refresh theo adapter; hết session chuyển login |
| 403 SESSION_ASSIGNMENT_REQUIRED / role mapping hiện có | Dừng retry, refetch context, khóa thao tác |
| 404 CLASS_NOT_FOUND / CLASS_SESSION_NOT_FOUND / ATTENDANCE_NOT_FOUND | Sai ID/ancestry/không thuộc mình: thông báo và quay danh sách |
| 409 SESSION_VERSION_CONFLICT / CLASS_ASSIGNMENT_VERSION_CONFLICT | Refetch roster/session/candidates, cho user kiểm tra lại, không tự ghi đè |
| 409 CLASS_MENTOR_SCHEDULE_CONFLICT | Giữ lý do, refresh candidates, chọn mentor khác |
| 409 SESSION_STATE_CONFLICT / ATTENDANCE_EDIT_WINDOW_EXPIRED | Refetch context, dừng thao tác; đề nghị Manager xử lý |
| 409 IDEMPOTENCY_KEY_REUSED | Không retry cùng key/body khác; sửa logic FE |
| 422 MENTOR_NOT_ELIGIBLE / ATTENDANCE_ENROLLMENT_NOT_ELIGIBLE / HTTP_ERROR | Field validation/không thuộc roster, không retry tự động |
| 503 dependency unavailable nếu mapping hạ tầng có | Retry hữu hạn với cùng idempotency key sau lỗi mạng/tạm thời |

Code mới ở bảng là **tên dự kiến**; khi implementation phải đối chiếu AppHttpException,
DTO/guard/error filter và test. Envelope theo dự án:
`{statusCode,code,message,details?,requestId?}`; không coi code mới đã tồn tại.

Mọi list có loading/empty/error/success; mutation disable nút đang gửi, không
optimistically chốt ABSENT trước response. Refetch cache lịch/roster/context/
summary có liên quan sau commit. Poll roster đang IN_PROGRESS mỗi30s khi trang
visible, dừng khi rời trang/COMPLETED/CANCELLED/401/403; canEdit=false dừng UI ghi,
không chỉ dựa trên đồng hồ client. History/summary/candidates không polling.

## 2. Management Class discovery — slice 4.1

### GET `/api/v1/management/classes`

Staff; màn hình quản lý lịch lấy classId. Query page/pageSize và optional
status DRAFT/OPEN/IN_PROGRESS/COMPLETED/CANCELLED. Không body/header idempotency.
Ví dụ `?status=IN_PROGRESS&page=1&pageSize=20`.
200 `{items:[{id,code,name,status,primaryMentor,assignmentVersion}],page,pageSize,total}`.
Sort startDate DESC,id ASC; read-only, không mở create/catalog CRUD cho Manager.
Empty hiển thị chưa có lớp; chọn item → GET detail. Errors chung401/403/422.

### GET `/api/v1/management/classes/:classId`

Staff; classId từ list, UUID required. Query Session page/pageSize (default20)
để không trả toàn lịch lớp lớn; không body. 200
`{class:{id,code,name,status,primaryMentor,assignmentVersion},sessions:{items:[SessionView],page,pageSize,total}}`.
Chọn Session → candidates/roster. Read-only; errors401/403/404/422.

## 3. Available mentors — slice 4.1

### GET `/api/v1/management/class-sessions/:sessionId/available-mentors`

Staff; chỉ SCHEDULED/IN_PROGRESS. sessionId từ management detail, query
page/pageSize + optional `search` trimmed <=100 ký tự; không body.
Ví dụ `?search=An&page=1&pageSize=20`.
200 ví dụ (IDs minh họa):

```json
{"sessionId":"11111111-1111-4111-8111-111111111111","sessionVersion":3,"checkedFrom":"2026-10-13T12:00:00.000Z","checkedTo":"2026-10-13T14:00:00.000Z","asOf":"2026-10-13T11:30:00.000Z","timeZone":"Asia/Ho_Chi_Minh","availabilityBasis":"TEACHING_SCHEDULE_ONLY","items":[{"id":"22222222-2222-4222-8222-222222222222","displayName":"Mentor An","isCurrent":false}],"page":1,"pageSize":20,"total":1}
```

Kiểm ACTIVE MENTOR và toàn lịch effective assignment, loại target Session;
không đảm bảo qualification/leave/đã nhận lời. Với IN_PROGRESS kiểm thời gian
còn lại và buổi đang dạy của candidate như plan. Không side effect/giữ slot.
FE hiển thị “Không trùng lịch dạy”, empty không có ứng viên; chọn → PATCH mentor.
Errors401/403/404/422,409 SESSION_STATE_CONFLICT; không tự retry state conflict.

### GET `/api/v1/management/classes/:classId/available-mentors`

Staff; Class DRAFT/OPEN/IN_PROGRESS, classId từ detail. Query giống API trên.
200 `{classId,assignmentVersion,affectedSessionCount,asOf,timeZone,
availabilityBasis:"TEACHING_SCHEDULE_ONLY",items:[{id,displayName,isCurrent}],page,pageSize,total}`.
Kiểm toàn SCHEDULED chưa override sẽ đổi khi thay mentor chính; affected count0
trả ACTIVE mentors cùng thông báo không có buổi lịch chịu ảnh hưởng.
Sort displayName ASC,id ASC cho cả hai candidate queries. Read-only;
FE chọn → PATCH Class mentor; errors401/403/404/422/409 state như trên.

## 4. Assignment commands — slice 4.1

### PATCH `/api/v1/management/class-sessions/:sessionId/mentor`

Staff; SCHEDULED/IN_PROGRESS; sessionId + version từ detail/candidate/roster.
Body `{mentorId:UUID|null,reason:string,expectedVersion:integer}`; null gỡ
override và trở về primary hiện tại, vẫn revalidate lịch. Ví dụ
`{"mentorId":"22222222-2222-4222-8222-222222222222","reason":"Mentor chính bận đột xuất","expectedVersion":3}`.
Header Idempotency-Key required. 200 SessionView version4.
Atomic assignment/audit/version; trong IN_PROGRESS cập nhật teachingMentorId,
giữ actualStartedAt/startedBy/editableUntil. Không tăng quyền Materials/Payments.
FE refetch detail/roster/lịch/candidates; mentor cũ refetch thấy403 write.
Errors chung +409 schedule/version/state +422 mentor not eligible.

### PATCH `/api/v1/management/classes/:classId/mentor`

Staff; Class DRAFT/OPEN/IN_PROGRESS. Body `{mentorId:UUID,reason,expectedVersion}`,
version là assignmentVersion từ Class, không nullable mentorId.
Ví dụ `{"mentorId":"22222222-2222-4222-8222-222222222222","reason":"Thay mentor phụ trách lớp","expectedVersion":2}`.
200 `{classId,primaryMentor,assignmentVersion:3,affectedSessionCount,asOf}`.
Atomic đổi mentor Class + audit + tăng version các SCHEDULED bị ảnh hưởng để
candidate/Session mutation cũ bị stale; override/started snapshots giữ nguyên.
Recheck tất cả affected sessions dưới mentor locks; FE refetch Class/lịch/candidates.
Errors401/403/404/422,409 assignment version/state/schedule conflict.

## 5. Lịch mentor và roster — slices 4.1–4.2

### GET `/api/v1/mentor/schedule`

MENTOR; self từ cookie, không query mentorId. Query from/to/page/pageSize và
optional classId UUID; mặc định tuần hiện tại. 200
`{items:[SessionView],page,pageSize,total,from,to,timeZone,asOf}`.
Chỉ Session mentor đang được giao, gồm PRIMARY/SUBSTITUTE; sort startsAt ASC,id ASC.
Lịch đã dạy lấy snapshot, không claim buổi cũ theo primary mới. Read-only;
chọn Session → roster. Empty không có buổi, errors401/403/422.

### GET `/api/v1/class-sessions/:sessionId/attendance`

Effective MENTOR hoặc Staff; sessionId từ lịch/detail. Query page/pageSize.
200 RosterView; trước start items rỗng, permissions.canStart cho phép bắt đầu,
totals.eligible0, pendingPaymentCount có thể >0, không gọi là roster đã snapshot.
Read-only; không tự tạo row/activate cash. Không trả email/phone/order totals
cho substitute. FE gọi trước start/mark/finalize, version lấy từ session.version.
Errors401/403 assignment/404/422; poll chung khi IN_PROGRESS.

## 6. Start và roster admission — slice 4.2

### POST `/api/v1/class-sessions/:sessionId/start`

Effective MENTOR hoặc Staff; Class OPEN/IN_PROGRESS và Session SCHEDULED.
Body `{expectedVersion,reason?,actualStartedAt?}`. Mentor chỉ expectedVersion;
Staff recovery được actualStartedAt ISO <=asOf và bắt buộc reason; start bình
thường dùng server now. Ví dụ `{"expectedVersion":4}`.
Idempotency-Key required; 200 WriteView Session IN_PROGRESS với actualStartedAt,
editableUntil và version5. Snapshot ACTIVE cùng Class tồn tại trước actual start;
Class OPEN → IN_PROGRESS cùng transaction. Start không tự tick/vắng.
Replay không reset roster/clock. FE refetch roster toàn bộ; errors chung +409
state/version,422 recovery timestamp; quyền mentor kiểm trước replay.

### POST `/api/v1/class-sessions/:sessionId/attendance/sync-roster`

Effective MENTOR trong deadline, Session IN_PROGRESS; Staff IN_PROGRESS hoặc
COMPLETED đã start. Body `{expectedVersion,reason?}`; Staff required reason.
Ví dụ `{"expectedVersion":5}`. Server admit ACTIVE đã tạo trước start, chưa có
row; không nhận student IDs tùy ý. Sau chốt chỉ Staff và row mới bắt đầu ABSENT
với audit, Staff sửa PRESENT bằng API sau nếu có chứng cứ. Response200 WriteView
với changedEnrollmentIds; no eligible additions → no-op, giữ version.
FE gọi sau cash activation đã commit → refetch roster. Không tự confirm tiền.
Errors401/403/404/422,409 deadline/version/state.

## 7. Đánh dấu và chốt — slices 4.2–4.3

### PUT `/api/v1/class-sessions/:sessionId/attendance`

Effective MENTOR (now<editableUntil) hoặc Staff (không deadline); Session đã
start, IN_PROGRESS/COMPLETED. Staff có thể sửa Session CANCELLED đã start;
không thay canceled exclusion. Body `{expectedVersion,reason?,records:[
{enrollmentId:UUID,status:UNMARKED|PRESENT|ABSENT}]}`; records1–100, unique IDs,
không nhận row ngoài snapshot. Staff reason required. UNMARKED chỉ IN_PROGRESS.
Ví dụ `{"expectedVersion":6,"records":[{"enrollmentId":"33333333-3333-4333-8333-333333333333","status":"PRESENT"}]}`.
200 WriteView; atomic cả batch hoặc rollback, update checkedInAt/audit/version.
Payload chỉ các hàng thay đổi, không thay các page chưa load; chọn tất cả giới
hạn rõ page và gửi batches nối tiếp theo version mới. Nếu bất kỳ row sai ancestry
hoặc eligibility, không commit một phần. FE refetch roster/Student schedule/summary.
Errors401/403/404/422 eligibility,409 version/deadline/state/idempotency.

### POST `/api/v1/class-sessions/:sessionId/finalize`

Effective MENTOR trong deadline hoặc Staff; Session IN_PROGRESS. Body
`{expectedVersion,reason?,actualEndedAt?}`; actualEndedAt chỉ Staff recovery,
ISO actualStartedAt<actualEndedAt<=asOf; Staff required reason.
Ví dụ `{"expectedVersion":7}`. Required Idempotency-Key.
200 WriteView với COMPLETED, actualEndedAt, totals absent đã tính UNMARKED.
Atomic update tất cả roster còn UNMARKED → ABSENT + audits + lifecycle/version.
FE preview dựa totals toàn roster trước gọi; conflict refetch/reconfirm.
Replay cùng key trả outcome, không nhân audit; không tự finalize lúc hết giờ.
Errors401/403/404/422,409 version/deadline/state.

### GET `/api/v1/management/class-sessions/:sessionId/attendance-audits`

Staff; sessionId từ roster, query page/pageSize + optional enrollmentId UUID.
200 `{items:[{id,attendanceId,enrollmentId,actor:{id,displayName},oldStatus,
newStatus,reason,occurredAt,action}],page,pageSize,total}`; oldStatus nullable
khi admission; reason nullable cho thao tác mentor; sort occurredAt DESC,id DESC.
Không trả audit cho Student/substitute. Read-only; empty chưa có chỉnh sửa.
FE mở lịch sử, không polling; errors401/403/404/422.

## 8. Student history và lịch — slice 4.4

### GET `/api/v1/me/schedule` — mở rộng additive API hiện hữu

STUDENT self; giữ toàn bộ validation/filter/envelope/entitlement của Phase2.3,
không thay bằng defaults contract chung nếu baseline khác. API/field hiện hữu:
[breakdown2.3](PHASE_2_3_flow-api-breakdown.md). Thêm trên từng event:
`attendanceStatus:null|UNMARKED|PRESENT|ABSENT`,
`attendanceApplicability:ELIGIBLE|NOT_STARTED|NOT_ELIGIBLE|PAYMENT_PENDING|LEGACY_NO_DATA`,
`attendanceExcluded:boolean`, `assignmentType`, mentor theo buổi (legacy nullable).
Ví dụ chưa start `{sessionStatus:"SCHEDULED",attendanceStatus:null,
attendanceApplicability:"NOT_STARTED",attendanceExcluded:false}`.
Không attendance của người khác; CASH_PREVIEW chỉ PAYMENT_PENDING/null;
canceled ưu tiên nhãn Đã hủy. Read-only, không URL/roster. Sau edit refresh
lịch khi Student mở lại; errors/empty theo Phase2.3, không mở quyền enrollment cũ.

### GET `/api/v1/me/classes/:classId/attendance`

STUDENT từng có own enrollment thuộc Class; classId từ My Classes hoặc own
history context đã lưu. Query page/pageSize, optional from/to phải gửi cả cặp.
200 `{classId,items:[{sessionId,title,startsAt,endsAt,sessionStatus,
attendanceStatus,attendanceApplicability,excluded,effectiveMentor}],page,pageSize,total,asOf,timeZone}`.
Sort startsAt DESC,id DESC; read-only own metadata kể cả enrollment COMPLETED/
CANCELLED. Không trả meeting/materials/classmates. Empty chưa có buổi; 404 khi
chưa từng thuộc Class, errors401/403/422. Không poll, refresh sau đổi tab.

### GET `/api/v1/me/classes/:classId/attendance-summary`

STUDENT ownership giống history, optional from/to cùng cặp; không page params.
200 `{classId,present,absent,unmarked,excluded,finalizedEligibleCount,rate,
asOf,timeZone}`; rate number0–100 làm tròn2 chữ số hoặc null khi denominator0.
Count phân biệt chưa chốt/legacy/hủy; không cộng UNMARKED vào absent. Ví dụ
`{"classId":"44444444-4444-4444-8444-444444444444","present":3,"absent":1,"unmarked":2,"excluded":1,"finalizedEligibleCount":4,"rate":75,"asOf":"2026-10-13T14:00:00Z","timeZone":"Asia/Ho_Chi_Minh"}`.
Read-only; empty denominator hiển thị chưa có buổi đã chốt. Errors401/403/404/422.

## 9. Management operations — slice 4.4

### GET `/api/v1/management/classes/:classId/attendance-summary`

Staff; classId từ management Class. Query page/pageSize, optional from/to cùng
cặp; 200 `{classId,items:[{enrollmentId,student:{id,displayName},present,absent,
unmarked,excluded,finalizedEligibleCount,rate}],page,pageSize,total,asOf,timeZone}`.
Giữ historical snapshots kể cả enrollment rời lớp; sort student.displayName ASC,
enrollmentId ASC. Read-only, formula như own summary; chọn Session → roster.
Empty chưa có roster lịch sử; errors401/403/404/422, không polling.

### GET `/api/v1/management/class-sessions/incomplete`

Staff; query from/to/page/pageSize, optional classId UUID, issue enum
OVERDUE_NOT_STARTED/STARTED_NOT_FINALIZED. 200
`{items:[{session:SessionView,issue,deadlineExpired}],page,pageSize,total,asOf,timeZone}`.
Sort endsAt ASC,id ASC; read-only, không tự sửa lịch/trạng thái/ABSENT. FE
chọn → roster → start recovery/finalize hoặc cancel/reassign; empty mọi buổi
đã xử lý, errors401/403/422; refresh sau recovery, không polling mặc định.

## 10. Reschedule, cancel và makeup — slice 4.4

### PATCH `/api/v1/management/class-sessions/:sessionId/schedule`

Staff, chỉ SCHEDULED, Class DRAFT/OPEN/IN_PROGRESS. Body
`{startsAt:ISO,endsAt:ISO,reason,expectedVersion}`; start<end, trong Class period.
Ví dụ `{"startsAt":"2026-10-15T12:00:00Z","endsAt":"2026-10-15T14:00:00Z","reason":"Đổi lịch buổi học","expectedVersion":2}`.
200 SessionView; atomic effective mentor conflict check/audit/version.
Không reset attendance/start vì chưa start; không tự gửi mail. FE refresh lịch/
candidates; errors401/403/404/422 thời gian,409 state/version/schedule overlap.

### POST `/api/v1/management/class-sessions/:sessionId/cancel`

Staff; SCHEDULED/IN_PROGRESS, Class chưa CANCELLED hoặc đã hủy cần dọn Session.
Body `{reason,expectedVersion}`, ví dụ `{"reason":"Không thể tổ chức buổi học","expectedVersion":3}`.
200 SessionView CANCELLED; audit/version, giữ attendance nếu đã start, loại
mẫu số và giải phóng lịch mentor. Không sửa COMPLETED thành CANCELLED tùy ý.
FE refresh lịch/summary/candidates; errors401/403/404/422/409 state/version.

### POST `/api/v1/management/class-sessions/:sessionId/makeups`

Staff; original CANCELLED, Class OPEN/IN_PROGRESS. Body
`{classUnitId:UUID,title:string1–250,startsAt:ISO,endsAt:ISO,mentorId?:UUID,
reason,expectedVersion}`; Unit cùng Class, giờ hợp lệ trong Class period;
mentorId nếu có là override, không có dùng primary. expectedVersion của original.
Ví dụ `{"classUnitId":"55555555-5555-4555-8555-555555555555","title":"Buổi học bù","startsAt":"2026-10-17T12:00:00Z","endsAt":"2026-10-17T14:00:00Z","reason":"Bù buổi đã hủy","expectedVersion":4}`.
201 `{originalSessionId,originalVersion,session:SessionView}`; replacement có
makeupForSessionId, SCHEDULED, chưa roster. Atomic tạo/audit/unique active
replacement + conflict check; original tăng version. FE refetch detail/lịch.
Errors401/403/404 ancestry/422,409 MAKEUP_ALREADY_EXISTS/state/version/schedule.
Không auto mail hoặc copy ABSENT từ original sang replacement.

## 11. Prerequisites và FE happy path nghiệm thu

1. Phase2.3/auth/MANAGER migration có trên môi trường; Phase4.1/4.2 migrations
   và controllers phải deploy trước khi FE gọi contract mới.
2. Manager list/detail → candidates → assignment → mentor schedule.
3. Mentor roster → start → mark/unmark → preview toàn bộ totals → finalize.
4. Student timetable/history/summary thấy kết quả của mình.
5. Manager chỉnh ngoài24h bằng PUT có reason → audit và summary cập nhật.
6. Các nhánh bắt buộc: GET candidate rồi slot bị chiếm (409); đổi mentor giữa
   buổi (mentor cũ403); stale roster (409); deadline hết (409); cash activation
   rồi sync; thiếu điểm danh giữ chưa chốt; hủy/bù không đếm đôi; legacy không
   auto vắng; enrollment cũ không mở materials.

Tất cả là acceptance dự kiến, chưa evidence pass. Không dùng MinIO/material
authoring làm prerequisite cho điểm danh; material context dành cho substitute
cần handoff riêng với Phase3. API cash confirm/mentor class payment roster hiện
hữu giữ quyền snapshot, không dùng làm Session attendance roster.
