# Phase 4 — API breakdown cho frontend

> Implementation17/10: nhóm leave API mục11 đã có backend. Contract thực tế,
> response fields, lỗi và FE sequence ở [API4.4 mục19](PHASE_4_4_flow-api-breakdown.md#19-mentor-leave-requests--implementation-2026-10-17).
> Candidate basis đổi thành TEACHING_SCHEDULE_AND_APPROVED_LEAVE; các ghi chú
> TEACHING_SCHEDULE_ONLY/leave planned bên dưới là baseline lịch sử.

**Sửa CI16/10/2026:** fixture release bổ sung compatibility bridges, test rollback
nhắm migration đích; không thay đổi endpoint, payload, quyền hoặc tích hợp FE.
[Evidence local và giới hạn](../progress/Progress.md#2026-10-16--sửa-ci-constraint-sau-merge-phase4materials).

**Implementation2026-10-16:** schedule projection và Student history/summary,
management summary/incomplete4.4c đã có source/Swagger/Postman/focused PG20/
compiled HTTP3; [contract hiện hành mục13–18](PHASE_4_4_flow-api-breakdown.md#13-44c--quy-ước-và-contract-chung).
Các mô tả4.4c PLANNED trong log trước là lịch sử; leave/approved intervals
vẫn source gap riêng. Full gates ở Progress4.4, không suy local thành FE/deploy.

**2026-10-16:** user xác nhận4.4b đã xong;4.4c đang PLANNING với22 AC/20
scenarios/C1–C5. Contract hiện hành4.4b ở [API4.4 mục6–12](PHASE_4_4_flow-api-breakdown.md#6-quy-ước-chung-của-44b);
contract **dự kiến4.4c** đầy đủ ở [API4.4 mục13–18](PHASE_4_4_flow-api-breakdown.md#13-44c--quy-ước-và-contract-chung).
Phần lịch/history/summary mục8–9 dưới là thiết kế baseline, được chi tiết hóa
bởi revision16/10: physical-vs-credit, root/range, null mentor, excluded semantics,
deadlineExpired nullable và auth/ownership. Không ghi extension/4 GET mới là
implemented. Leave/approved intervals vẫn gap source riêng; log cũ giữ lịch sử.

**2026-10-15 — slice đầu4.4a có source:** ba route management Session ở mục10
(schedule/cancel/makeups), Class cancellation batch và SessionView ancestry.
Contract implemented hiện hành ở [API4.4](PHASE_4_4_flow-api-breakdown.md),
evidence ở [progress4.4](../progress/phase%204/PHASE_4_4_PROGRESS.md).
Tại lượt slice đầu này, mục11–12 và Student projections/history/summary/queues
còn PLANNED; core4.4b đã có sau đó, xem revision hiện hành phía trên.

**2026-10-14 — API4.1–4.3 đã implement; API4.4–4.5 vẫn PLANNED; chưa xác nhận deploy.**
[Bảng toàn bộ 17 API mới và flow gọi nối tiếp của hai commit](PHASE_4_API_SUMMARY.md).
[Flow](PHASE_4_FLOW.md) ·
[Plan](../implement_phase/phase%204/PHASE_4_ATTENDANCE_OPERATIONS.md) ·
[Progress](../progress/phase%204/PHASE_4_PROGRESS.md).

Entry point riêng sau review2026-10-13:
[API4.1](PHASE_4_1_flow-api-breakdown.md) /
[API4.2](PHASE_4_2_flow-api-breakdown.md), cùng
[Plan4.1](../implement_phase/phase%204/PHASE_4_1_MENTOR_SUBSTITUTION.md) /
[Plan4.2](../implement_phase/phase%204/PHASE_4_2_SESSION_ATTENDANCE.md).
Continuation4.3 has [detailed implemented API](PHASE_4_3_flow-api-breakdown.md),
[flow](PHASE_4_3_FLOW.md),
[plan](../implement_phase/phase%204/PHASE_4_3_ATTENDANCE_CORRECTIONS_HISTORY.md) and
[progress](../progress/phase%204/PHASE_4_3_PROGRESS.md). Correction/audit/recovery
đã implement trong commit `246abf4`; contract riêng mô tả admissionBasis,
recovery audit và route-specific256KiB parser limit đã có source/tests.
Contract actual giữ ở mục14–15; local test totals là evidence lịch sử, chưa
chứng minh toàn edge/mixed-writer/Staff HTTP matrix hoặc server release.
`GET /api/v1/me/schedule` là API đã có; regular attendance/mentor buổi có4.1–4.2
local evidence; correction/recovery4.3 đã có; guest/Student attendance projections planned.
Revision này ghi quyết định user về nghỉ trước hai ngày lịch có duyệt, bù theo
buổi/ngày và học bù lớp khác cùng Course Unit. Contract thực tế4.1 xem mục14;
Contract baseline4.2 xem mục15; contract hiện hành correction sau chốt,
legacy recovery và audit browsing xem API4.3. Guest vẫn planned.
Mục1–13 chứa thiết kế toàn Phase4, gồm shape/route dự kiến; không coi mọi route
trong đó đã implement. Danh sách hiện có và flow tích hợp xem file summary ở trên.

**Rule deadline mới:** ngày học từ Session.startsAt theo APP_TIME_ZONE; Mentor
được mark/sync/finalize đến hết ngày hôm sau (`now < 00:00 ngày học+2`). Ví dụ
thứ Ba→00:00 thứ Năm. Không overnight, không cộng24h từ actualStartedAt.
Migration1791849600002 cập nhật clocks cũ/tăng version nếu thay đổi; API dùng cùng
APP_TIME_ZONE với migration. GET refetch sau replay/migration để lấy hạn hiện tại.

**Hiện hành15/10:** Guest roster/PUT/finalize/context/audits và placements đã có
core4.4b; mọi ghi chú guest PLANNED trong baseline4.1–4.3 dưới đây là lịch sử.
Tích hợp mới dùng [contract4.4 mục6–12](PHASE_4_4_flow-api-breakdown.md).
Approved leave và Student schedule/history/summary4.4c vẫn chưa có.

## 1. Contract chung áp dụng cho từng API bên dưới

- Prefix `/api/v1`; cookie `access_token`, FE dùng session adapter/credentials hiện
  có; không gửi role/studentId/actor/timestamps nội bộ để tự cấp quyền.
- Staff = ACTIVE MANAGER/ADMIN; mentor = ACTIVE MENTOR được phân công hiệu lực
  cho Session. Đọc/ghi kiểm ancestry và quyền hiện hành, không tin canEdit từ FE.
- Response JSON trực tiếp, không `{data}`. GET/PATCH/PUT/action POST trả 200;
  POST tạo makeup/request/placement trả 201. POST preview/slot không mutation
  trả 200 và không cần Idempotency-Key. Private reads dùng `Cache-Control: private, no-store`.
- UUID v4 path/body; invalid path theo ParseUUIDPipe hiện có: 400 HTTP_ERROR;
  invalid query/body: 422 HTTP_ERROR. ISO timestamps phải có offset, server
  giữ UTC và trả timeZone từ APP_TIME_ZONE, asOf từ server.
- List `page` integer >=1 default1, `pageSize` 1–100 default20, sort ổn định.
  `from,to` nếu có: ISO offset, from < to, tối đa93 ngày, filter overlap `[from,to)`;
  không truyền thì mặc định tuần hiện tại theo APP_TIME_ZONE. History/summary
  không có date range mặc định nghĩa toàn bộ Class; summary có range phải gọi
  tường minh và FE ghi nhãn khoảng thống kê. Incomplete/conflict/makeup queues
  mặc định toàn bộ backlog; leave request lists không lọc tuần mặc định.
- Mutations của resource đã có required `expectedVersion` integer >=1; Class dùng
  assignmentVersion, buổi/roster dùng session.version, request/placement dùng version
  của resource. Tạo request/placement dùng sourceVersions/expectedTargetVersion
  từ preview thay vì version của resource chưa tồn tại. Required
  header `Idempotency-Key` UUID v4: FE tạo một key cho một ý định, giữ key khi
  retry sau lỗi mạng; thay body/refetch đổi ý định thì tạo key mới.
- Lưu idempotency ledger scope actor + route + key, payload hash + outcome cùng
  transaction với audit. Replay cùng payload trả outcome đã commit, không tăng
  version/audit/deadline lại; khác payload trả409 IDEMPOTENCY_KEY_REUSED. Check
  authentication/assignment hiện hành trước replay, không trả cached quyền cũ.
- `reason`: trimmed string 1–1000 ký tự cho staff mutation; mentor mark/finalize
  không bắt buộc reason; mentor gửi request nghỉ phải có reason. Không nhận trạng
  thái Session tùy ý bằng PATCH generic.
- Ghi sync trong transaction. Không network/payment/storage call khi giữ lock.

### Shape dùng lại (đề xuất)

SessionView = `{sessionId,classId,classUnitId,title,startsAt,endsAt,status,
actualStartedAt,actualEndedAt,primaryMentor,effectiveMentor,assignmentType,
makeupForSessionId,makeupRootSessionId,version,editableUntil,asOf,timeZone,permissions}`.
Mentor = `{id,displayName}`; assignmentType = PRIMARY/SUBSTITUTE.
permissions = `{canStart,canEditAttendance,canFinalize,canReassign,canReschedule}`.
Actual timestamps/editableUntil nullable trước start. effectiveMentor nullable
cho lịch sử legacy chưa xác định người dạy, không giả bằng mentor hiện tại.
makeupForSessionId nullable khi không phải buổi bù.

RosterView = `{session:SessionView,items,page,pageSize,total,totals,
pendingPaymentCount}`. Item = `{attendanceId,enrollmentId,entryType,
makeupPlacementId,student:{id,displayName},status,checkedInAt,admittedAt}`.
entryType REGULAR/MAKEUP; makeupPlacementId null cho REGULAR. enrollmentId của
MAKEUP là enrollment lớp gốc, không được dùng để ghi vào attendance_records của
target Class. status UNMARKED/PRESENT/ABSENT.
totals = `{present,absent,unmarked,eligible}` tính trên toàn roster, không theo page.
Write trả `{session:SessionView,totals,changedEnrollmentIds,changedMakeupPlacementIds}`.
Guest nằm trong totals toàn roster nhưng không tạo enrollment/order ở lớp nhận.

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
| 409 ATTENDANCE_START_DAY_CLOSED / LEAVE_REQUEST_STALE / LEAVE_REQUEST_EXPIRED | Refetch; hết ngày chuyển recovery, request stale cần lập lại lịch bù |
| 409 STUDENT_SCHEDULE_CONFLICT / MAKEUP_CAPACITY_CONFLICT | Slot theo buổi phải chọn lại; target lớp nhận bù phải còn chỗ và không trùng |
| 422 LEAVE_NOTICE_TOO_SHORT / MAKEUP_CONTENT_MISMATCH | Báo nghỉ trước hai ngày lịch; học bù phải cùng Course Unit và xác nhận nội dung |
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

availabilityBasis ở ví dụ là baseline 4.1; sau 4.4a trả
`TEACHING_SCHEDULE_AND_APPROVED_LEAVE` và loại mentor giao khoảng nghỉ APPROVED.
Kiểm ACTIVE MENTOR và toàn lịch effective assignment, loại target Session;
qualification/availability tự khai và việc đã nhận lời vẫn chưa được bảo đảm.
Với IN_PROGRESS chỉ kiểm phần interval dự kiến còn lại như plan; qua endsAt
không chiếm slot vô hạn. Không side effect/giữ slot.
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
chọn Session → context/roster. Empty không có buổi, errors401/403/422.

### GET `/api/v1/class-sessions/:sessionId/context`

Effective MENTOR, Staff hoặc STUDENT có guest placement chính thức của đúng
Session và enrollment gốc ACTIVE. 200 `{session:SessionView,roomName,meetingUrl,
makeupPlacementId?,accessScope:"SESSION"}`. meetingUrl ưu tiên Session rồi Class;
COMPLETED/CANCELLED trả null. Không có materials, classmates, payment/leave reason.
Quyền đọc theo assignment/placement hiện hành; không dùng Admin/student class
detail để cấp nguyên lớp cho substitute/guest. Private no-store; errors401/403/404.

### GET `/api/v1/class-sessions/:sessionId/attendance`

**Implemented4.2 cho regular roster, contract chính xác xem mục15. Guest planned4.4b.**

Effective MENTOR hoặc Staff; sessionId từ lịch/detail. Query page/pageSize.
200 RosterView; trước start items rỗng, permissions.canStart cho phép bắt đầu,
totals.eligible0, pendingPaymentCount có thể >0, không gọi là roster đã snapshot.
Read-only; không tự tạo row/activate cash. Không trả email/phone/order totals
cho substitute. FE gọi trước start/mark/finalize, version lấy từ session.version.
Errors401/403 assignment/404/422; poll chung khi IN_PROGRESS.

## 6. Start và roster admission — slice 4.2

**Implemented4.2 cho regular enrollment; khác biệt/giới hạn thực tế xem mục15.**

### POST `/api/v1/class-sessions/:sessionId/start`

Effective MENTOR hoặc Staff; Class OPEN/IN_PROGRESS và Session SCHEDULED.
Body `{expectedVersion,reason?,actualStartedAt?}`. Mentor chỉ expectedVersion;
Staff recovery được actualStartedAt ISO <=asOf và bắt buộc reason; start bình
thường dùng server now. Ví dụ `{"expectedVersion":4}`.
Mentor được mở bất kỳ giờ nào trong ngày có giao lịch [startsAt,endsAt) theo
APP_TIME_ZONE, kể cả mở cuối buổi; không overnight. Ngoài ngày trả409
ATTENDANCE_START_DAY_CLOSED, chỉ Staff recovery. actualStartedAt thường là thời
điểm mở điểm danh, không suy ra giờ bắt đầu dạy. Deadline hết ngày học kế tiếp không đổi khi retry.
Idempotency-Key required; 200 WriteView Session IN_PROGRESS với actualStartedAt,
editableUntil và version5. Snapshot ACTIVE cùng Class tồn tại trước actual start;
Class OPEN → IN_PROGRESS cùng transaction; snapshot cả guest ASSIGNED đủ điều
kiện theo placement bằng bảng guest riêng. Start không tự tick/vắng.
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

Detailed correction/history/evidence recovery rules and examples:
[API4.3 implemented](PHASE_4_3_flow-api-breakdown.md). The regular-only4.3 matrix
and evidence validations there refine this broad Phase4 design; guest entries
below remain4.4b, Student projections remain4.4c. Focused4.3 runtime evidence tại Progress4.3.

**4.2 đã có mark/unmark trong IN_PROGRESS và finalize. Correction sau chốt,
audit GET và `/attendance/recover` đã implement4.3;guest vẫn PLANNED4.4b; xem contract4.3 trước khi tích hợp.**

### PUT `/api/v1/class-sessions/:sessionId/attendance`

Effective MENTOR (now<editableUntil) hoặc Staff (không deadline); Session đã
start, IN_PROGRESS/COMPLETED. Staff có thể sửa Session CANCELLED đã start;
không thay canceled exclusion. Body `{expectedVersion,reason?,records:[
{enrollmentId:UUID,status:UNMARKED|PRESENT|ABSENT}]}`;records1–100,unique enrollment IDs,
không nhận row ngoài snapshot. makeupPlacementId/guest là planned4.4b,không nhận
trong runtime4.3. Staff reason
required. UNMARKED chỉ IN_PROGRESS.
Ví dụ `{"expectedVersion":6,"records":[{"enrollmentId":"33333333-3333-4333-8333-333333333333","status":"PRESENT"}]}`.
200 WriteView; atomic cả batch hoặc rollback, update checkedInAt/audit/version.
Payload chỉ các hàng thay đổi, không thay các page chưa load; chọn tất cả giới
hạn rõ page và gửi batches nối tiếp theo version mới. Nếu bất kỳ row sai ancestry
hoặc eligibility, không commit một phần. FE refetch roster/audit;Student schedule/summary attendance projections còn4.4c.
Errors401/403/404/422 eligibility,409 version/deadline/state/idempotency.

### POST `/api/v1/class-sessions/:sessionId/finalize`

Effective MENTOR trong deadline hoặc Staff; Session IN_PROGRESS. Body
`{expectedVersion,reason?,actualEndedAt?}`; actualEndedAt chỉ Staff recovery,
ISO actualStartedAt<actualEndedAt<=asOf; Staff required reason.
Ví dụ `{"expectedVersion":7}`. Required Idempotency-Key.
200 WriteView với COMPLETED, actualEndedAt, totals absent đã tính UNMARKED.
Atomic update regular roster UNMARKED → ABSENT + audits + lifecycle/version.
Guest result/placement/credit projection là planned4.4b,chưa có runtime.
FE preview dựa totals toàn roster trước gọi; conflict refetch/reconfirm.
Replay cùng key trả outcome, không nhân audit; không tự finalize lúc hết giờ.
Errors401/403/404/422,409 version/deadline/state.

### GET `/api/v1/management/class-sessions/:sessionId/attendance-audits`

Staff; sessionId từ roster, query page/pageSize + optional enrollmentId UUID.
200 `{items:[{id,attendanceId,enrollmentId,actor:{id,displayName},oldStatus,
newStatus,reason,occurredAt,action,version,recoveryAuditId,recoveryEvidence}],page,pageSize,total}`; oldStatus nullable
khi admission; reason nullable cho thao tác mentor; sort occurredAt DESC,id DESC.
Không trả audit cho Student/substitute. Read-only; empty chưa có chỉnh sửa.
FE mở lịch sử, không polling; errors401/403/404/422.

### POST `/api/v1/management/class-sessions/:sessionId/attendance/recover`

Staff; dùng cho SCHEDULED quên thao tác hoặc legacy COMPLETED thiếu dữ liệu,
kể cả Class đã terminal. Body `{expectedVersion,reason,evidenceNote,
actualStartedAt,actualEndedAt,records:[{enrollmentId,status:PRESENT|ABSENT,admissionBasis}]}`.
Contract riêng4.3 bổ sung required records[].admissionBasis:
PAID_BEFORE_START hoặc CASH_LATE_ADMISSION; reason trim1–1000/evidenceNote1–2000.
Route parser256KiB đã verified nhận1000 evidenced rows trên built app;global64KiB giữ cho routes khác.
Records roster đầy đủ có chứng cứ, unique, 1–1000; không ghi đè row đã tồn tại.
Kiểm enrollment cùng Class, createdAt <= actualStartedAt, chứng cứ thanh toán/
activation/admission; không dùng ACTIVE hiện tại để suy ra roster quá khứ.
Enrollment COMPLETED/CANCELLED từng trả tiền hợp lệ vẫn được phục hồi metadata.
start < end <= now; giữ mentor/startedBy đã biết, legacy unknown vẫn nullable.
SCHEDULED phục hồi tới COMPLETED; legacy giữ COMPLETED, không reopen/reset clock.
200 WriteView với audit/version; thiếu chứng cứ trả422, không tự ABSENT; existing
record dùng correction API. Idempotency-Key required. Recovery không tự đánh dấu full coverage hoặc suy ra ABSENT cho omissions;denominator là4.4c.

## 8. Student history và lịch — slice 4.4c

### GET `/api/v1/me/schedule` — mở rộng additive API hiện hữu

STUDENT self; giữ toàn bộ validation/filter/envelope/entitlement của Phase2.3,
không thay bằng defaults contract chung nếu baseline khác. API/field hiện hữu:
[breakdown2.3](PHASE_2_3_flow-api-breakdown.md). Thêm trên từng event:
`attendanceStatus:null|UNMARKED|PRESENT|ABSENT`,
`attendanceApplicability:ELIGIBLE|NOT_STARTED|NOT_ELIGIBLE|PAYMENT_PENDING|LEGACY_NO_DATA|MAKEUP_PENDING|MAKEUP_CREDITED`,
`attendanceExcluded:boolean`, `assignmentType`, mentor theo buổi (legacy nullable).
Ví dụ chưa start `{sessionStatus:"SCHEDULED",attendanceStatus:null,
attendanceApplicability:"NOT_STARTED",attendanceExcluded:true}`.
Không attendance của người khác; CASH_PREVIEW chỉ PAYMENT_PENDING/null;
canceled ưu tiên nhãn Đã hủy. Read-only, không URL/roster. Sau edit refresh
lịch khi Student mở lại; errors/empty theo Phase2.3, không mở quyền enrollment cũ.

Guest placement ACTIVE entitlement thêm event target riêng: physical classId/
classUnitId của lớp nhận, enrollmentId/sourceClassId/sourceSessionId của lớp gốc,
makeupPlacementId và `accessMode:"SESSION_MAKEUP"`. Mode mới chỉ mở Session context,
không gọi full Class detail. Filter classId theo lớp event thực tế; kiểm own
placement thay vì đòi enrollment lớp nhận. Không đổi access của các event cũ.
Total/pagination tính trên tập regular+guest đã deduplicate trước phân trang.

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
200 `{classId,present,absent,unmarked,excluded,makeupPending,finalizedEligibleCount,rate,
asOf,timeZone}`; rate number0–100 làm tròn2 chữ số hoặc null khi denominator0.
Count phân biệt chưa chốt/legacy/hủy; không cộng UNMARKED vào absent. Ví dụ
`{"classId":"44444444-4444-4444-8444-444444444444","present":3,"absent":1,"unmarked":2,"excluded":1,"finalizedEligibleCount":4,"rate":75,"asOf":"2026-10-13T14:00:00Z","timeZone":"Asia/Ho_Chi_Minh"}`.
Present/absent chỉ tính nghĩa vụ đã chốt. Placement đã chốt thay kết quả source,
chờ guest chốt làm tăng makeupPending và loại nghĩa vụ khỏi denominator; không
đếm guest thêm vào lớp nhận. Không rewrite attendance vật lý source.
Read-only; empty denominator hiển thị chưa có buổi đã chốt. Errors401/403/404/422.

## 9. Management operations — slice 4.4c

### GET `/api/v1/management/classes/:classId/attendance-summary`

Staff; classId từ management Class. Query page/pageSize, optional from/to cùng
cặp; 200 `{classId,items:[{enrollmentId,student:{id,displayName},present,absent,
unmarked,excluded,makeupPending,finalizedEligibleCount,rate}],page,pageSize,total,asOf,timeZone}`.
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

Không gửi from/to = toàn bộ backlog chưa xử lý, khác default tuần của calendar.
from/to tường minh phải có cả cặp, tối đa93 ngày. Qua endsAt chỉ nhắc xử lý,
không chiếm lịch mentor vô hạn; canStart phụ thuộc ngày hợp lệ/recovery permission.

## 10. Reschedule, cancel và makeup — slice 4.4a

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
reason,expectedVersion}`; Unit cùng Class và Course Unit của source, giờ tương
lai >= Class.startDate; nếu vượt endDate tự gia hạn cùng transaction;
mentorId nếu có là override, không có dùng primary. expectedVersion của original.
Ví dụ `{"classUnitId":"55555555-5555-4555-8555-555555555555","title":"Buổi học bù","startsAt":"2026-10-17T12:00:00Z","endsAt":"2026-10-17T14:00:00Z","reason":"Bù buổi đã hủy","expectedVersion":4}`.
201 `{originalSessionId,originalVersion,classEndDate,session:SessionView}`;
replacement có makeupForSessionId/makeupRootSessionId, SCHEDULED, chưa roster.
Atomic tạo/audit/unique hiệu lực cả root chain + conflict check + endDate audit;
original tăng version. FE refetch detail/lịch. Không tạo hai nhánh cùng root.
Errors401/403/404 ancestry/422,409 MAKEUP_ALREADY_EXISTS/state/version/schedule.
Không auto mail hoặc copy ABSENT từ original sang replacement.

## 11. Request nghỉ và lịch bù — slice 4.4a

### POST `/api/v1/mentor/leave-requests/preview`

MENTOR self, read-only. Body `{fromDate,toDate,period}`; ngày YYYY-MM-DD inclusive,
range <=93 ngày; period MORNING/AFTERNOON/EVENING/FULL_DAY theo plan.
200 `{affectedSessions:[SessionView],sourceVersions,noticeEligible,noticeDeadline,
asOf,timeZone}`. sourceVersions=[{sessionId,version}]; noticeDeadline là timestamp
exclusive tại 00:00 ngày sau ngày cuối được gửi (APP_TIME_ZONE).
Overlap interval nghỉ, deduplicate Session; không có buổi trả
empty. Thứ Tư gửi cho thứ Sáu hợp lệ bất kể giờ; ngày affected start sớm nhất quyết định.

### POST `/api/v1/mentor/leave-requests/makeup-slots`

MENTOR self, read-only. Body `{sourceSessionId,targetDate,targetPeriod}` với period
MORNING/AFTERNOON/EVENING. 200 `{slots:[{startsAt,endsAt}],sessionVersion,asOf,timeZone}`.
Gợi ý mỗi15 phút, giữ duration, toàn slot trong period, tránh mentor/Class/student
ACTIVE/CASH pending còn hạn và guest ASSIGNED. Không giữ slot; empty chọn ngày khác.
Form cho nhập giờ thủ công; submit/approve vẫn qua đúng các conflict validators.

### POST `/api/v1/mentor/leave-requests`

MENTOR self; Body `{fromDate,toDate,period,reason,sourceVersions,
dayMappings?:[{sourceDate,targetDate}],
sessionMappings?:[{sourceSessionId,targetDate,targetPeriod,startsAt,endsAt}]}`.
FULL_DAY chỉ dayMappings, giữ clock và không overnight; nghỉ buổi chỉ sessionMappings,
giữ duration và toàn giờ trong targetPeriod. Server expand/reload toàn affected set;
không nhận subset bỏ buổi. Các target tương lai >= Class.startDate; overflow endDate
được preview để tự gia hạn khi duyệt. Idempotency-Key required.
201 LeaveRequestView PENDING version1, chưa đổi lịch; sourceVersions từ preview
phải khớp. Notice theo submittedAt server và hai ngày lịch, sai trả422
LEAVE_NOTICE_TOO_SHORT; roster/lịch thay đổi trả409 LEAVE_REQUEST_STALE.

### GET `/api/v1/mentor/leave-requests`, GET `/api/v1/mentor/leave-requests/:requestId`

MENTOR chỉ own; list page/pageSize/status optional, không tuần mặc định.
LeaveRequestView = `{id,mentor,fromDate,toDate,period,reason,status,version,
submittedAt,expiresAt,items,studentConflictCount,classExtensions,review,asOf,timeZone}`.
Detail items có source/lịch gốc/lịch bù/version, paginate page/pageSize; list trả
summary không toàn items. Sort submittedAt DESC,id DESC; no-store.

### POST `/api/v1/mentor/leave-requests/:requestId/withdraw`

Own MENTOR; PENDING, body `{expectedVersion,reason}`, Idempotency-Key; 200 request
WITHDRAWN. Không đổi lịch, nghỉ không còn pending. Terminal state trả409.

### GET `/api/v1/management/mentor-leave-requests`, GET `/api/v1/management/mentor-leave-requests/:requestId`

Staff; paginated list/status/mentorId optional. Detail như own view cộng student
conflict details hợp quyền và current preview; preview không đảm bảo approve thành công.

### POST `/api/v1/management/mentor-leave-requests/:requestId/approve`

Staff; PENDING, body `{expectedVersion,reason,acknowledgeStudentConflicts:boolean}`.
Idempotency-Key. Khóa/revalidate versions/tập source, effective mentor và mọi
conflict/placement; approval trước startsAt sớm nhất, quá giờ trả409 EXPIRED.
FULL_DAY có conflicts phải acknowledge=true; nghỉ buổi có student overlap trả409.
200 `{request:LeaveRequestView,replacements:[SessionView],classExtensions,
studentConflictCount}`. Atomic APPROVED/cancel/replacement/auto endDate/approved
leave/student conflicts/audits; stale rollback toàn batch, giữ PENDING cho refetch.
PENDING không giữ lịch bù. Source có guest/placement cần quản lý xử lý trước.

### POST `/api/v1/management/mentor-leave-requests/:requestId/reject`

Staff; PENDING, `{expectedVersion,reason}`, Idempotency-Key; 200 REJECTED, không đổi
lịch. Read chỉ trả trạng thái hiệu lực EXPIRED khi quá hạn, không ghi DB trong GET;
command/expiry worker lưu trạng thái với audit. Không auto approve.
Email/chat/notification không phải side effect của bất kỳ action nghỉ nào.

## 12. Student conflict queue và học bù lớp khác — slice 4.4b

**Cập nhật15/10: core4.4b đã implement/test local.** Contract chính xác, fields
bổ sung/lỗi/phiên bản/permissions xem [API4.4 mục6–12](PHASE_4_4_flow-api-breakdown.md).
Approved-leave availability còn thiếu provider4.4a trong source hiện tại;
Student schedule/history/summary4.4c chưa implement. Thiết kế tổng dưới đây không
được dùng để suy ra đã deploy hoặc candidates đã kiểm approved leave.

### GET `/api/v1/management/student-schedule-conflicts`

Staff; page/pageSize, optional classId/status; mặc định toàn OPEN/MAKEUP_ASSIGNED,
không tuần hiện tại. 200 `{items:[{id,enrollmentId,student,sourceSession,
conflictingIntervals,status,version,makeupPlacementId}],page,pageSize,total,asOf}`.
Mentor thấy conflicts của các buổi mình được giao trong request/detail; không xem
nội dung/roster lớp trùng khác hoặc toàn conflict queue của trung tâm.

### GET `/api/v1/management/student-schedule-conflicts/:conflictId/makeup-candidates`

Staff; page/pageSize và from/to explicit cặp <=93 ngày, mặc định lịch tương lai
trong93 ngày tới. Lấy source Course Unit/student từ server, không UUID content client.
200 `{items:[{session:SessionView,remainingCapacity}],page,pageSize,total,asOf}`.
Target khác Class, cùng Course Unit, SCHEDULED/startsAt>now/Class OPEN hoặc IN_PROGRESS;
tránh lịch student, approved leave mentor, hết chỗ hoặc đã có enrollment ở target.
GET không giữ suất; Manager vẫn xác nhận nội dung vì Unit có nhiều Session.

### POST `/api/v1/management/student-schedule-conflicts/:conflictId/makeup-placement`

Staff; body `{targetSessionId,expectedVersion,expectedTargetVersion,
contentMatchConfirmed:true,reason}`; version của conflict và target từ GET.
Idempotency-Key; 201 `{placement,conflictVersion,targetSessionVersion}`.
Source enrollment ACTIVE và cùng Class với source; target cùng Course Unit, khác
Class, future/SCHEDULED, student không trùng, capacity còn ACTIVE+mọi hold chưa
hết hạn (CASH/PAYOS)+guest; PayOS hold giữ seat dù không có timetable.
Khóa class/session/student, unique hiệu lực source/target; không tạo order/enrollment.
403/404 ownership,422 nội dung/payment,409 version/capacity/conflict; rollback atomic.

### POST `/api/v1/management/makeup-placements/:placementId/cancel`

Staff; `{expectedVersion,reason}` + Idempotency-Key; 200 placement CANCELLED, audit,
giải phóng suất chưa start; guest snapshot đã có giữ lịch sử. Summary quay về source
result nếu đã chốt. Target CANCELLED tự đặt NEEDS_REASSIGNMENT để queue yêu cầu xếp lại;
placement thay thế tạo sau cancel có lý do, không reset giờ của target đã bắt đầu.

### GET `/api/v1/me/makeup-placements`

STUDENT self; page/pageSize, optional status, không tuần mặc định. 200
`{items:[{id,sourceClassId,sourceSessionId,targetSession:SessionView,status,
attendanceStatus,creditStatus}],page,pageSize,total,asOf,timeZone}`.
Own metadata/history kể cả hoàn thành; URL chỉ qua Session context với quyền hiện hành.
Roster target dùng entryType MAKEUP và PUT/finalize ở mục7; mentor target ghi,
source mentor chỉ đọc conflict của mình. Credit tính một lần theo plan; pending/
target cancel không tự ABSENT. Class completion chặn các placement chưa giải quyết.

## 13. Prerequisites và FE happy path nghiệm thu

1. Phase2.3/auth/MANAGER migration có trên môi trường; Phase4.1/4.2 migrations
   và controllers phải deploy trước khi FE gọi contract mới.
2. Manager list/detail → candidates → assignment → mentor schedule.
3. Mentor roster → start → mark/unmark → preview toàn bộ totals → finalize.
4. Student timetable/history/summary thấy kết quả của mình.
5. Manager chỉnh ngoài deadline bằng PUT có reason → audit và summary cập nhật.
6. Các nhánh bắt buộc: GET candidate rồi slot bị chiếm (409); đổi mentor giữa
   buổi (mentor cũ403); stale roster (409); deadline hết (409); cash activation
   rồi sync; thiếu điểm danh giữ chưa chốt; hủy/bù không đếm đôi; legacy không
   auto vắng; enrollment cũ không mở materials.
7. Mentor chọn range/period → preview/slot hoặc nhập tay → gửi PENDING → Manager
   duyệt → cancel/replacement/gia hạn → cả mentor/Student thấy lịch mới.
8. FULL_DAY có student conflict → queue → cùng Course Unit + xác nhận nội dung →
   placement → guest context/roster → target mentor finalize → credit source một lần.
9. Nghỉ buổi trùng học viên phải chặn; FULL_DAY giữ clock; hai ngày lịch/calendar deadline/
   approval stale/expired/rollback, guest capacity race và pending credit có evidence.

Tất cả là acceptance dự kiến, chưa evidence pass. Không dùng MinIO/material
authoring làm prerequisite cho điểm danh; material context dành cho substitute
cần handoff riêng với Phase3. API cash confirm/mentor class payment roster hiện
hữu giữ quyền snapshot, không dùng làm Session attendance roster.

## 14. Implemented4.1 — contract thực tế và handoff

Mục này giữ baseline/evidence của riêng slice4.1; các câu attendance chưa có
là trạng thái tại baseline đó. HEAD `246abf4` đã có attendance4.2 và correction/
recovery/audits4.3; xem [summary hiện hành](PHASE_4_API_SUMMARY.md).

Sau migration mới 1791849600000-session-mentor-assignment, API mục2–4 và GET
mentor/schedule + GET class-sessions/:sessionId/context có source/Swagger/tests.
Attendance, leave, makeup và Student projections vẫn planned. Chưa deploy/VPS.

SessionView41 thực tế:

{sessionId,classId,classUnitId,title,startsAt,endsAt,status,primaryMentor,
effectiveMentor,assignmentType,version,actualStartedAt,actualEndedAt,editableUntil,
asOf,timeZone}.

Mentor={id,displayName}; effectiveMentor nullable khi legacy terminal thiếu
snapshot. Chưa trả permissions/makeupForSessionId/makeupRootSessionId ở4.1.
Full SessionView mục1 là roadmap; SessionView41 là implemented cho các API4.1.

- Context4.1 chỉ ADMIN/MANAGER/MENTOR được giao buổi. STUDENT guest còn4.4b;
  chưa makeupPlacementId. RoomName giữ nguyên; meetingUrl=null khi Class/Session
  terminal, còn lại ưu tiên Session URL rồi Class. Không có Materials.
- Candidates ACTIVE MENTOR, sort displayName ASC,id ASC, pageSize<=100; basis
  TEACHING_SCHEDULE_ONLY. DRAFT không giữ slot, open kiểm lại toàn bộ override.
  IN_PROGRESS kiểm interval còn lại; quá endsAt range rỗng tại asOf.
- IN_PROGRESS/clock schema cho assignment giữ thời gian; API start/roster chưa có.
  Local test tạo IN_PROGRESS bằng DB fixture, không phải người dùng start được.
- Code mentor không hợp lệ thực tế **422 CLASS_MENTOR_NOT_ELIGIBLE** (baseline),
  thay tên MENTOR_NOT_ELIGIBLE dự kiến. Version/key/state/assignment codes đã có.
- Legacy PATCH /admin/classes/:classId có mentorId chỉ nhận
  {mentorId,reason,expectedVersion} + Idempotency-Key; version là Class.assignmentVersion.
  Fields khác sửa bằng request riêng. Command dùng cùng ledger/audit như dedicated
  Class assignment; response legacy vẫn ClassManagementDetailDto thêm assignmentVersion,
  reload detail hiện hành. Direct ClassesService.update không còn đổi mentor.
- Add/time/lifecycle tăng Class.assignmentVersion để candidates cũ bị stale;
  time/lifecycle tăng Session.version. Class assignment tăng version các buổi
  SCHEDULED không override. Retry dedicated command trả outcome đã commit.

[Postman4.1](../../postman/Mindy-Teaching-Phase41.postman_collection.json): login
staff → class detail → candidates → assignment → login assigned mentor → schedule/
context. UUID key cho mỗi ý định; retry giữ key/body, refetch/đổi ý định dùng key mới.

Local gates: pnpm check310/310 (31 suites), pnpm test:http29/29 (3 suites),
migration up/down/up + refusal và contention PostgreSQL pass. Chưa browser smoke,
FE implementation hoặc VPS. Completion/cancel orchestration, attendance, legacy
recovery và guest access chuyển implemented khi slice tương ứng có evidence.

## 15. Implemented4.2 — contract thực tế và handoff

Mục này giữ baseline/evidence của riêng slice4.2; correction/audits/recover
được triển khai tiếp ở4.3 trong HEAD `246abf4`. Contract hiện hành ưu tiên
[API4.3](PHASE_4_3_flow-api-breakdown.md) và [summary](PHASE_4_API_SUMMARY.md).

Ngày2026-10-13. Source: AttendanceController/AttendanceService; Classes export
SessionLifecycleService, Enrollments export roster readers. Migration
`1791849600001-session-attendance` phải chạy trước khi bật các API này.
Các endpoint dưới đây đã implemented local cho **REGULAR enrollment**.
Correction sau COMPLETED/CANCELLED, GET audits và `/attendance/recover` đã có
ở4.3. Guest, Student history/summary/schedule fields và management backlog vẫn PLANNED.
Contract mục15 ưu tiên hơn shape đề xuất ở mục1/5–7 cho slice4.2.

### Auth, input và concurrency dùng chung

- Cookie `access_token`; ACTIVE MENTOR hiệu lực của đúng Session hoặc ACTIVE
  MANAGER/ADMIN. Student không được GET roster/ghi attendance. Mentor chủ nhiệm
  bị thay không có quyền trên buổi override, kể cả replay của request cũ.
- Path `sessionId` từ management detail hoặc mentor schedule/context; invalid
  UUID400, unknown404 CLASS_SESSION_NOT_FOUND. GET không cần idempotency header.
- Cả bốn mutation required `Idempotency-Key` UUIDv4 và body `expectedVersion`
  integer>=1, lấy từ roster.session.version. Header thiếu/sai422 HTTP_ERROR.
  Staff luôn required `reason` trimmed1–1000; Mentor có thể gửi reason optional.
  Body/query lạ, null, sai kiểu/enum/array và date không offset trả422 HTTP_ERROR.
- Mỗi key gắn một actor/Session/action/payload. Retry giữ **key và body ban đầu**;
  replay trả outcome đã commit, asOf/permissions cũ, không tăng version/audit,
  không chụp lại roster hoặc kéo hạn. Refetch GET sau replay để lấy quyền hiện tại.
  Đổi payload cùng key409 IDEMPOTENCY_KEY_REUSED. Request mới dùng key mới.
- Class → Session row locks; start dùng mentor advisory lock chung4.1/recheck.
  Mark/sync/finalize cùng Session version; race chỉ một write thật commit,
  request stale409 SESSION_VERSION_CONFLICT. No-op mark/sync không tăng version.
  Write + lifecycle + audits + receipt cùng transaction; lỗi bất kỳ rollback cả.
  Không gọi payment/provider/SMTP/storage trong transaction điểm danh.
- Mentor ghi khi server now < editableUntil, đúng deadline409
  ATTENDANCE_EDIT_WINDOW_EXPIRED. Staff không deadline nhưng vẫn kiểm state và
  reason. Buổi quá endsAt vẫn UNMARKED/IN_PROGRESS tới khi có thao tác chốt.

### GET `/api/v1/class-sessions/:sessionId/attendance` — 200

FE mở trang điểm danh sau context; query `page` integer>=1 default1 và `pageSize`
1–100 default20. Sort enrollmentId ASC; private/no-store. Trước start trả items=[]
và totals0, không tạo roster; CASH pending còn hạn chỉ góp pendingPaymentCount.
Không trả email/phone/orderId/amount/meetingUrl cho substitute.

Response trực tiếp `{session,items,page,pageSize,total,totals,pendingPaymentCount}`.
session gồm các field TeachingSessionDto4.1 (`sessionId,classId,classUnitId,title,
startsAt,endsAt,status,primaryMentor,effectiveMentor,assignmentType,version,
actualStartedAt,actualEndedAt,editableUntil,asOf,timeZone`) và permissions
`{canStart,canEditAttendance,canFinalize,canSyncRoster}`. Actual clocks/deadline
nullable trước start; UTC ISO trả qua JSON, timeZone từ APP_TIME_ZONE.
permissions đánh giá cho actor hiện tại, không phải token cấp quyền ghi.
canStart chỉ đúng ngày lịch và Class OPEN/IN_PROGRESS; Staff recovery ngoài ngày
vẫn dùng request có actualStartedAt/reason. canEditAttendance/canFinalize chỉ
IN_PROGRESS; canSyncRoster thêm COMPLETED đã start cho Staff.

Item `{attendanceId,enrollmentId,entryType:"REGULAR",makeupPlacementId:null,
student:{id,displayName},status,checkedInAt,admittedAt}`. displayName nullable nếu
không có tên; checkedInAt nullable, là lần đánh dấu PRESENT gần nhất, không phải
giờ học viên đến. admittedAt là giờ server tạo snapshot/admit. status dùng đúng
UNMARKED/PRESENT/ABSENT. total là toàn roster; totals
`{present,absent,unmarked,eligible}` cũng toàn roster, không theo page;
eligible=present+absent+unmarked. Ví dụ một hàng chưa tick:

```json
{"attendanceId":"44444444-4444-4444-8444-444444444444","enrollmentId":"33333333-3333-4333-8333-333333333333","entryType":"REGULAR","makeupPlacementId":null,"student":{"id":"66666666-6666-4666-8666-666666666666","displayName":"Học viên A"},"status":"UNMARKED","checkedInAt":null,"admittedAt":"2026-10-13T10:00:00.000Z"}
```

### POST `/api/v1/class-sessions/:sessionId/start` — 200

FE bấm Bắt đầu; Mentor body `{"expectedVersion":2}`. Staff thêm reason, optional
actualStartedAt ISO có offset <=now. Mentor gửi actualStartedAt422.
Không gửi timestamp: dùng server now, chỉ được mở trong các ngày giao lịch
[startsAt,endsAt) theo APP_TIME_ZONE; cấm overnight, endsAt đúng00:00
không mở thêm ngày. Ngoài ngày409 ATTENDANCE_START_DAY_CLOSED.
Staff phục hồi start với timestamp explicit và reason; vẫn yêu cầu Class
OPEN/IN_PROGRESS, Session SCHEDULED. Đây chưa phải legacy/terminal-class recovery4.3.
Mentor inactive422 CLASS_MENTOR_NOT_ELIGIBLE; conflict lịch409
CLASS_MENTOR_SCHEDULE_CONFLICT. SCHEDULED→IN_PROGRESS, snapshot teaching mentor,
startedBy/actualStartedAt và editableUntil=00:00 của ngày học + 2 theo APP_TIME_ZONE. Class OPEN tự chuyển
IN_PROGRESS đóng đăng ký trong cùng commit. Không tự đánh dấu PRESENT/ABSENT.

Snapshot enrollment cùng Class: ACTIVE hiện hành, createdAt<=actualStartedAt,
enrolledAt<=actualStartedAt. Recovery quá khứ không lấy ACTIVE hôm nay để suy ra
đã trả tiền tại giờ đó. CASH pending không có row. Retry key cũ giữ clocks/roster;
start lại bằng key mới khi đã IN_PROGRESS409 SESSION_STATE_CONFLICT.

### POST `/api/v1/class-sessions/:sessionId/attendance/sync-roster` — 200

Sau cash confirm của **manager bất kỳ** đã commit, FE gọi
`{"expectedVersion":3}`; Staff thêm reason. Mentor chỉ IN_PROGRESS trước deadline hết ngày học kế tiếp;
Staff IN_PROGRESS hoặc COMPLETED đã có actualStartedAt. Server tìm enrollment
cùng Class ACTIVE, createdAt<=actualStartedAt chưa có row, đã kích hoạt trước start
hoặc paid CASH sau start. PayOS kích hoạt sau start và enrollment tạo sau start
không admit. Không nhận IDs tùy ý, không tự xác nhận CASH hoặc chuyển quyền thu tiền.
Row mới UNMARKED khi IN_PROGRESS; Staff admit sau chốt tạo ABSENT có audit.
Không bổ sung được row: changedEnrollmentIds=[], version giữ nguyên.
Correction ABSENT→PRESENT sau chốt đã implement4.3; xem contract4.3 và deploy migrations trước khi tích hợp.

### PUT `/api/v1/class-sessions/:sessionId/attendance` — 200

FE tick/bỏ tick hoặc ghi ABSENT khi đang điểm danh. Body ví dụ:

```json
{"expectedVersion":4,"records":[{"enrollmentId":"33333333-3333-4333-8333-333333333333","status":"PRESENT"}]}
```

Staff thêm reason; records required1–100, unique enrollmentId UUIDv4, status
UNMARKED/PRESENT/ABSENT; không nhận makeupPlacementId ở4.2. Chỉ IN_PROGRESS đã
start, mọi row phải thuộc snapshot đúng Session; batch có row ngoại roster422
ATTENDANCE_ENROLLMENT_NOT_ELIGIBLE, không ghi một phần. Đổi PRESENT lưu checkedInAt
server now; đổi sang UNMARKED/ABSENT xóa checkedInAt. Giữ kết quả lịch sử dù
enrollment đã rời lớp. Không gửi các page chưa load; batches nối tiếp dùng version
mới. Baseline4.2 chỉ IN_PROGRESS;4.3 thêm correction COMPLETED/Staff CANCELLED đã start,closed status chỉ PRESENT/ABSENT.

### POST `/api/v1/class-sessions/:sessionId/finalize` — 200

FE xác nhận totals toàn roster rồi gửi `{"expectedVersion":5}`. Staff thêm reason,
optional actualEndedAt ISO có offset; Mentor không gửi actualEndedAt.
actualStartedAt < actualEndedAt <= now, không hợp lệ422 HTTP_ERROR.
Chỉ IN_PROGRESS đã start. Atomically UNMARKED→ABSENT, giữ PRESENT/ABSENT đã tick,
Session→COMPLETED, completedBy/actualEndedAt và lifecycle/attendance audit/version.
Replay không nhân audit vắng; không có worker tự chốt khi quá giờ hoặc quá deadline.

Cả bốn mutation trả WriteView `{session,totals,changedEnrollmentIds,
changedMakeupPlacementIds:[]}`. Session là shape của GET; changedEnrollmentIds chỉ
row được thêm/đổi trong lệnh (finalize là các UNMARKED chuyển ABSENT); guest array
luôn rỗng. Success refetch roster/context/mentor schedule/management detail.
Student attendance projection chưa implemented, không giả đã có field trong /me/schedule.

### Errors và FE flow

401: refresh/login theo adapter hiện có. 403 SESSION_ASSIGNMENT_REQUIRED hoặc
role guard: dừng retry/poll, refetch assignment và khóa UI. 404: sai ID, quay lịch.
409 SESSION_VERSION_CONFLICT: refetch roster, user xác nhận lại, key mới; không
tự ghi đè. 409 state/deadline/day-closed: khóa thao tác, chuyển staff xử lý;
409 key-reused: sửa key/body, không retry vô hạn. 422: hiện field error, sửa request
hoặc bỏ enrollment ngoại roster. Error envelope `{statusCode,code,message,details?,requestId?}`.
Mọi trang có loading/empty/error/success; disable action đang gửi. Poll GET mỗi30s
khi IN_PROGRESS và visible; dừng rời trang/COMPLETED/CANCELLED/401/403. canEdit=false
khóa write UI; backend vẫn kiểm server time/current assignment. Lỗi mạng retry hữu
hạn giữ body/key. Cash activation chưa thấy row thì sync/refetch sau commit.

Happy path: management/candidates/assignment4.1 → mentor context → GET roster →
start → GET snapshot → mark/unmark → xác nhận totals → finalize. Branch pending:
manager xác nhận thu tiền → effective teaching mentor sync → refetch. Overdue:
Manager reason + explicit start clock → finalize có end clock; deadline không
được cấp lại. Substitute không nhận cash/material-authoring quyền từ attendance.
Class complete hiện từ chối còn SCHEDULED/IN_PROGRESS409 SESSION_STATE_CONFLICT;
class/session cancel orchestration còn4.4a. Không có auto notification/email.

[Postman4.2](../../postman/Mindy-Attendance-Phase42.postman_collection.json).

Review/tách plan2026-10-13: progress riêng ghi AC→source→tests→gaps; Staff recovery
chỉ SCHEDULED/Class OPEN hoặc IN_PROGRESS, không full legacy/terminal recovery.
Class cancel chưa cancel Session batch/audit; Student mentor vẫn Class primary.
Xem Progress4.1/4.2 để phân biệt core source, test coverage thiếu và dependencies.
Lượt này chỉ Markdown, không runtime gates/migrations/FE/deployment mới.
Migrate ở cửa sổ bảo trì trước code, giữ snapshot/audits khi rollback; down từ
chối nếu đã có attendance/lifecycle/receipt history. Không backfill vắng legacy.
Evidence thực tế ghi tại [Progress4](../progress/phase%204/PHASE_4_PROGRESS.md).

Revision thực thi: context provider recheck ACTIVE/role/assignment; start tính
server now sau mentor lock và recheck ngày khi lock wait qua midnight. Add/time/
open/start không nhận overnight (`422 CLASS_SESSION_OVERNIGHT_NOT_ALLOWED`
cho add/time/start; open legacy invalid schedule409 CLASS_NOT_READY_TO_OPEN).
Calendar deadline stored vẫn là editableUntil ISO UTC, permissions/deadline
errors giữ envelope/code cũ. HTTP Staff recovery/sync và audited Admin PATCH đã
có journeys mới; Student/correction/legacy/cancel/guest còn đúng slices sau.

2026-10-13 implementation4.3: correction sau chốt,Staff audit GET và historical
evidence recovery đã có migration1791849600003 và runtime assertions. Handoff
[Flow4.3](PHASE_4_3_FLOW.md)/[API4.3](PHASE_4_3_flow-api-breakdown.md);
full local gates tại [Progress4.3](../progress/phase%204/PHASE_4_3_PROGRESS.md).
GAP42-01–03 thuộc implementation này;Student4.4c/guest4.4b/cancel-leave4.4a và
release4.5 vẫn mở. Chưa deploy/VPS/browser/live-payment hoặc sửa FE.

2026-10-14 deploy log review: Check397/39 HTTP pass cho release `e0c9174`;
preflight bị chặn bởi untracked `..env.production.swp` trên VPS. Chưa chạy bước
rollout, không thay contract API. Recovery procedure ở
[VPS runbook](../VPS_DEPLOYMENT.md); cần retry rồi có release evidence mới để
xác nhận các API hiện có đã bật trên VPS.

## 2026-10-15 — Plan chi tiết Phase 4.4a–c

[Plan 4.4](../implement_phase/phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md)
chốt thứ tự a → b → c và kế thừa các nhóm API PLANNED tại mục 8–12; chưa thêm
endpoint runtime hoặc đổi contract API4.1–4.3 trong lượt này. Mở rộng guest sau
này phải giữ payload regular hiện hữu, tách guest records theo makeupPlacementId.
Đăng ký/thanh toán sau duyệt lịch bù vẫn theo baseline; trùng mới được ghi vào
conflict queue để Manager xử lý theo lựa chọn user. Xem [flow tổng](PHASE_4_FLOW.md).
Chỉ kiểm tài liệu/link/diff, không runtime tests/migrations/FE/deployment mới.
Trạng thái server/Postman 4.3 theo xác nhận user ngày 15/10 trong backlog;
không suy ra 4.4 đã có API hoặc đã deploy.
## Tích hợp Materials3.3/3.4 — 2026-10-15

ClassesModule giữ teaching/lifecycle/attendance4.1–4.3 cùng context/release3.3;
không cấp quyền Materials/CASH cho substitute từ teaching assignment. Guard hoàn
thành Class vẫn đòi Sessions terminal; test release3.3.4 đã cập nhật prerequisite.
Hai migration compatibility giải quyết unique constraint trùng mà không sửa
migration lịch sử; source22, clean/upgrades/data/FK/down-up3/3 pass local.
[Quyết định tích hợp](../progress/phase%203/PHASE_3_3_PROGRESS.md).
Không đổi contract Phase4, không migrate development/VPS hoặc nghiệm thu FE.

Kiểm chứng tích hợp15/10: pnpm check513/513 (48 suites), HTTP60/60 (5 suites)
qua cấu hình mặc định; lint/type-check/build pass. Migration compatibility3/3
đã chạy lại sau guard tên DB test. Không VPS/browser/FE hoặc live payment evidence.
