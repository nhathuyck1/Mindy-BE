# Phase 2.4 — API breakdown cho Manager HR + kế toán

Cập nhật 2026-10-16: **A–C đã implement trong source**, local verified theo progress.
Chưa deploy/VPS/browser acceptance. D finance summary vẫn backlog.
[Flow](PHASE_2_4_FLOW.md) · [Plan](../implement_phase/phase2/PHASE_2_4_MANAGER_OPERATIONS.md).

## 1. Quy ước chung cho API đã implement

- Prefix /api/v1. MANAGER active, session hợp lệ, cookie access_token;
  credentials: include. Không cần class assignment. Không body cho GET,
  không Idempotency-Key hoặc Origin nghiệp vụ riêng cho GET.
- UUID v4; page integer≥1/default1; pageSize1–100/default20. Query không có trong
  DTO bị422. q nếu có trim1–100, tìm literal tên/email/phone ở directory, tên/mã
  ở lớp; không nhận pattern SQL/regex. Danh sách mới nhất trước, tie-break id ASC;
  lịch startsAt ASC, id ASC; units position ASC, id ASC.
- Range nếu được hỗ trợ phải gửi cả from/to ISO8601 có timezone, from<to, tối đa
 366ngày cho finance; mentor schedule bắt buộc range, tối đa31ngày. Thời điểm
  nửa mở [from,to); schedule lấy buổi giao range, không chỉ buổi bắt đầu trong range.
- Timestamps ISO UTC; date YYYY-MM-DD; lịch có timeZone từ APP_TIME_ZONE.
  Tiền VND nguyên. GET200 trả DTO trực tiếp; list {items,page,pageSize,total}.
  Detail không nhét list lớn không phân trang. Cache-Control: private,no-store.
- 401 đăng nhập lại;403 sai role; suspended/demoted/revoked session trả401 theo AccessTokenGuard, dừng thao tác;
 400 UUID path sai;422 field/query/range sai, sửa input;404 đối tượng không có,
  sai role target hoặc sai quan hệ, quay lại list. Error code mới phải được ghi
  đúng Swagger/exception khi implement, không dùng tên lỗi dự kiến làm contract đã có.
- HR directory chỉ nhận MENTOR/STUDENT theo route; không nhận role query để đọc
  ADMIN/MANAGER. Target suspended vẫn đọc được. Không có token/passwordHash,
  session/identity data, raw webhook/signature/credentials trong responses.
- Mọi GET mới không side effect, không remote PayOS/SMTP, không settle hoặc tạo
  seat hold. Gọi lại đọc trạng thái hiện hành; tổng hợp nhiều bảng cần snapshot
  nhất quán khi có concurrent settlement/assignment/enrollment.

## 2. Những API đã có dùng lại

| API hiện có | Điều hướng / contract hiện tại | Giới hạn |
|---|---|---|
| GET /manager/courses | Mở course directory; page/pageSize, categoryId UUID/isActive bool optional; CourseManagementPageDto | Chưa có q; không giả định filter mới đã có |
| GET /manager/courses/:courseId | CourseManagementDetailDto, unit metadata; courseId từ list | Không tự mở CRUD course/price |
| GET /management/classes | TeachingClassPageDto; page/pageSize/status | Teaching summary, khác cash/manager class list |
| GET /management/classes/:classId | TeachingClassDetailDto, timetable phân trang page/pageSize | Giữ response hiện tại; dùng để hiển thị lịch tại class detail |
| GET /manager/classes | MentorClassPageDto hiện dùng cho manager; page/pageSize/status | Filter bổ sung đã có ở mục3 |
| GET /manager/classes/:classId/students | ManagerRosterPageDto; paymentType CASH/PAYOS, orderStatus, page/pageSize | Contact/detail đã có theo mục3 |
| GET /manager/cash-orders | OrderPageDto, page/pageSize; toàn bộ CASH | Không phải directory tất cả CASH/PAYOS transactions |
| POST /manager/cash-orders/:orderId/confirm | {receivedAmount}, nguyên1–MAX_SAFE_INTEGER bằng tổng đơn;200 OrderDto PAID | MANAGER; giữ nguyên auth/transaction/idempotency/409 của Phase2.2 |

Course detail/list → courseId → manager/classes?courseId qua sliceA. Lấy classId
từ response, không suy từ tên. Existing Teaching/Materials/Attendance commands
vẫn theo contract phase gốc; không tạo alias hay bỏ reason/version/audit.

## 3. Slice A — Class detail và học viên theo lớp

| API | Input | Response200 / FE handoff |
|---|---|---|
| GET /manager/classes — mở rộng additive | page/pageSize/status hiện tại; thêm courseId,mentorId UUID; deliveryMode ONLINE/OFFLINE; q1–100 optional | Giữ items/fields/sort của list hiện có. Chọn id→detail; courseId→course; mentor.id→mentor profile |
| GET /manager/classes/:classId — mới | classId UUID | ManagerClassDetailDto: fields class summary hiện có, status, roomName nullable, course {id,code,title}, unitCount/sessionCount, enrollmentCounts theo bốn trạng thái; không chứa toàn bộ roster/orders/sessions |
| GET /manager/classes/:classId/units — mới | classId, page/pageSize | {items,page,pageSize,total}; item id,courseUnitId,title,position,status,unlockAt nullable; chỉ metadata, không Material body/download |
| GET /manager/classes/:classId/students — mở rộng additive | Giữ query/envelope hiện tại | Giữ studentId/studentName/enrollmentId/enrollmentStatus/orderId/orderCode/orderStatus/paymentType/classAmount/orderTotalAmount/orderClassCount/expiresAt/paidAt/canConfirmCash; thêm email,phone nullable,studentStatus chỉ trong Manager DTO |
| GET /manager/classes/:classId/students/:studentId — mới | Hai UUID từ roster; không query | Fields tương đương AdminClassStudentDetailDto: student/contact/status, classId,enrollmentId/enrollmentStatus,enrolledAt nullable,orderDetailId,registeredAt,accountCreatedAt,lastLoginAt nullable |

Class detail lấy timetable qua existing /management/classes/:classId. Roster chỉ
effective enrollment PENDING_PAYMENT/ACTIVE/COMPLETED; class/student detail ngoài
quan hệ này404, kể cả student có học lớp khác. Dùng directory history ở sliceB
để xem CANCELLED/re-enrollment. Không bỏ class ancestry vì manager xem mọi lớp.

Ví dụ trích fields roster **đã implement A**:
```json
{"items":[{"studentId":"11111111-1111-4111-8111-111111111111","studentName":"Học viên A","email":"student@example.test","phone":null,"studentStatus":"ACTIVE","orderId":"22222222-2222-4222-8222-222222222222","orderTotalAmount":10000,"classAmount":5000,"canConfirmCash":true}],"page":1,"pageSize":20,"total":1}
```

Ví dụ detail **trích fields**:
```json
{"id":"33333333-3333-4333-8333-333333333333","code":"WEB-01","status":"OPEN","course":{"id":"44444444-4444-4444-8444-444444444444","code":"WEB101","title":"Web cơ bản"},"roomName":null,"unitCount":8,"sessionCount":16,"enrollmentCounts":{"PENDING_PAYMENT":2,"ACTIVE":10,"COMPLETED":0,"CANCELLED":1}}
```

States: list rỗng hiển thị chưa có lớp/học viên, không coi là lỗi403. Loading
detail không xóa filter list. Sau CASH confirm refetch order/roster/counts;
sau assignment/schedule mutations refetch detail/timetable. Manager roster mới
không thay mentor/public DTO. Confirm giữ nhận đủ tổng order, không thu từng line.

## 4. Slice B — HR directory và quan hệ

| API mới, IMPLEMENTED | Input | Response / quy tắc |
|---|---|---|
| GET /manager/mentors | page/pageSize, q,status ACTIVE/SUSPENDED optional | Page<ManagerPersonDto>, server cố định MENTOR |
| GET /manager/mentors/:mentorId | UUID | ManagerPersonDto, target phải MENTOR; khác role404 |
| GET /manager/students | page/pageSize,q,status optional | Page<ManagerPersonDto>, server cố định STUDENT |
| GET /manager/students/:studentId | UUID | ManagerPersonDto, target STUDENT; khác role404 |
| GET /manager/mentors/:mentorId/classes | page/pageSize,status ClassStatus; assignment PRIMARY/SUBSTITUTE/ANY defaultANY | Page<{class summary,assignmentType}>; mỗi class một dòng, assignmentType PRIMARY/SUBSTITUTE/BOTH; current primary/effective substitute relationships, không bịa audit assignment lịch sử |
| GET /manager/mentors/:mentorId/schedule | from/to bắt buộc≤31ngày; page/pageSize,assignment PRIMARY/SUBSTITUTE/ANY defaultANY | Page<TeachingSessionDto>; có primaryMentor,effectiveMentor,assignmentType,session status,startsAt/endsAt,timeZone; mỗi session một dòng |
| GET /manager/students/:studentId/classes | page/pageSize,enrollmentStatus optional; classStatus optional | Page<ManagerStudentEnrollmentDto>, mặc định mọi enrollment status gồm CANCELLED; mỗi enrollment một dòng để thấy đăng ký lại |

ManagerPersonDto allowlist: id,displayName,email,phone nullable,role,
status,createdAt,lastLoginAt nullable. Chưa có experience/salary/contract/avatar
HR trong model thì không tự thêm dữ liệu giả hoặc field "đã có". Detail và list
cùng nguồn; relation endpoints cũng kiểm đúng role target trước khi truy vấn.

Student enrollment item: enrollmentId,enrollmentStatus,registeredAt,enrolledAt
nullable,class {id,code,name,status,courseId},orderDetailId,orderId,orderStatus,
paymentType. Student có thể có nhiều enrollment cùng lớp; phân trang/sort theo
registration, không unique student/class ở read history. Không trả FULL entitlement
bằng cách suy từ việc manager đọc được hồ sơ.

Ví dụ request:
`GET /api/v1/manager/mentors?q=Nguyen&status=ACTIVE&page=1&pageSize=20` → id
→ `GET /api/v1/manager/mentors/:id/schedule?from=2026-10-18T17:00:00Z&to=2026-10-25T17:00:00Z`.
Lịch giữ buổi CANCELLED kèm status nếu thuộc quan hệ hiện hành; không chiếm slot.
Không dùng lịch này suy lương/chấm công hoặc thay attendance credit.

Ví dụ person response:
```json
{"id":"55555555-5555-4555-8555-555555555555","displayName":"Mentor A","email":"mentor@example.test","phone":null,"role":"MENTOR","status":"ACTIVE","createdAt":"2026-10-01T00:00:00Z","lastLoginAt":null}
```

UI: search có debounce, reset page khi đổi filter, giữ selection bằng id; không
poll danh bạ. Sai role404 không hiển thị contact từ cache cũ. Lịch/quan hệ refetch
sau assignment/schedule/enrollment/payment; không tự gọi create enrollment.

## 5. Slice C — Kế toán: orders và transactions

| API mới, IMPLEMENTED | Input | Response200 |
|---|---|---|
| GET /manager/orders | page/pageSize,studentId,classId UUID,paymentType CASH/PAYOS,status OrderStatus,orderCode exact1–50,from/to optional≤366ngày; from/to theo createdAt | Page<ManagerOrderSummaryDto>; mỗi order một dòng |
| GET /manager/orders/:orderId | UUID từ roster/enrollment/order list | ManagerOrderDetailDto: student summary, OrderDto fields, immutable details[], payment summary nullable; details là cart snapshot bounded≤20, không mọi order của student |
| GET /manager/payments | page/pageSize,studentId,classId,orderId UUID,paymentType,status PaymentStatus; from/to optional≤366ngày; dateField CREATED_AT/PAID_AT defaultCREATED_AT | Page<ManagerPaymentSummaryDto>; PAID_AT range loại paidAt=null, không biến pending thành đã thu |
| GET /manager/payments/:paymentId | UUID lấy từ order.payment hoặc payments list | Payment detail safe: id,orderId,amount,status,paidAt nullable,referenceCode nullable,providerOrderCode nullable,CASH confirmedBy nullable và safe review summary |

OrderStatus PENDING/PAID/EXPIRED/CANCELLED. PaymentStatus CREATING/PENDING/
SUCCEEDED/REQUIRES_REVIEW. Không thêm status APPROVED và không suy SUCCEEDED từ
redirect. Dùng DTO riêng cho manager, không bỏ owner check trong /me/orders.

Summary order gồm id/orderCode/student {id,displayName}/totalAmount/paymentType/
status/expiresAt/paidAt/createdAt/payment nullable; details ở detail. Các orders
filter classId dùng EXISTS/dedup trước count/page, không nhân order nhiều lớp.
Amount từ snapshot đã lưu; không nhân theo course price hiện tại.

Payment confirmedBy {id,displayName nullable,source MANAGER/LEGACY_MENTOR}
hoặc null; source theo provenance lúc xác nhận, không theo role hiện tại. Không có
reference hợp lệ thì null và UI hiển thị chưa xác định, không đoán từ class mentor.
Review summary chỉ mã/outcome/lý do safe theo allowlist; raw payload, signature,
merchant keys, auth/session và dữ liệu ngân hàng không cần cho hỗ trợ bị loại.

Ví dụ payment **đã implement C, trích fields**:
```json
{"id":"66666666-6666-4666-8666-666666666666","orderId":"22222222-2222-4222-8222-222222222222","amount":10000,"status":"SUCCEEDED","paidAt":"2026-10-16T08:00:00Z","providerOrderCode":null,"confirmedBy":{"id":"77777777-7777-4777-8777-777777777777","displayName":"Manager A","source":"MANAGER"}}
```

FE student detail→orders?studentId, class→orders?classId, order→paymentId→payment.
Order chưa có transaction hiển thị chưa phát sinh payment, không là lỗi404.
REQUIRES_REVIEW: dừng đề nghị trả lại/confirm, chuyển quy trình admin hiện có;
không tự gọi POST /admin/payments/:paymentId/reconcile bằng manager.
GET không có optimistic PAID/poll vô hạn; manual refresh, refetch sau CASH confirm.
Nếu timeout confirm, retry cùng orderId/receivedAmount theo contract CASH hiện có.

## 6. Backlog D và điều kiện sử dụng

GET /manager/finance/summary chỉ là đề xuất sau A–C; chưa chốt DTO/contract, FE
chưa tích hợp. Nếu làm: period paidAt cho tiền đã thu, backlog unexpired CASH ở
asOf cho chờ thu, chia CASH/PAYOS, dedup theo order. Không gọi tổng này là ledger,
doanh thu ghi nhận hoặc payroll. Contract chi tiết phải bổ sung trước implement.

Prerequisites runtime A–C: backend release đúng slice, active manager account,
PostgreSQL migrations hiện hành, exported read providers và role-safe DTOs.
GET không phụ thuộc PayOS/SMTP online. Không cần migration/flag mới theo plan
ban đầu; index chỉ thêm khi đo query. Server/browser acceptance và quyền hiển thị
menu FE là gate riêng, chưa hoàn thành bởi tài liệu này.

## 7. Chi tiết triển khai và handoff 2026-10-16

A–C dùng ManagerOperationsModule làm read facade qua các provider được export
của Users/Classes/Enrollments/Commerce/Payments; không import repository/entity
private để bỏ ownership của self API. Snapshot REPEATABLE READ cho các phép compose,
list/count và roster manager. Không migration, dependency hoặc env mới.

- `GET /manager/classes`: `mentorId` lọc mentor chính hiện tại; lịch dạy thay dùng
  mentor relationships. Sort createdAt DESC/id ASC như route cũ. DTO vẫn là
  MentorClassPageDto; không đổi client hiện có.
- Class detail kế thừa class summary, thêm course {id,code,title}, unitCount,
  sessionCount (mọi trạng thái), enrollmentCounts bốn trạng thái. `roomName=null`
  vì schema chỉ có phòng theo buổi; lấy phòng cụ thể từ timetable management.
- Units metadata trả id/courseUnitId/title/position/status/unlockAt. Lấy
  **courseUnitId** để soạn/upload Materials, không truyền nhầm classUnitId.
- Class/student detail dùng cùng allowlist AdminClassStudentDetailDto; kiểm
  student role và effective enrollment đúng lớp. Ngoài lớp/CANCELLED404.
- HR target PENDING_VERIFICATION có thể hiện khi không lọc status (UserStatus
  thực tế có ba giá trị); filter chỉ nhận ACTIVE/SUSPENDED theo plan.
- Mentor schedule chỉ buổi mà mentor là effective/current responsible mentor;
  PRIMARY loại buổi đã giao người khác. Terminal đã bắt đầu dùng teachingMentorId;
  CANCELLED chưa bắt đầu dùng override/primary hiện tại để hỗ trợ tra cứu, không
  coi là teaching credit. `assignmentType` PRIMARY/SUBSTITUTE; class relationship
  có thể BOTH nếu mentor vừa primary vừa có buổi override thuộc mình.
- Student enrollment history mỗi enrollment một dòng, giữ cả CANCELLED và đăng ký
  lại; không trả accessMode. Order/class status là trạng thái hiện tại.
- Order summary không details; detail dùng immutable OrderDto.details + student
  + payment nullable. Payment summary/detail cùng allowlist {id,orderId,amount,
  status,paymentType,paidAt,createdAt,referenceCode,providerOrderCode,confirmedBy,
  review,student,orderCode,orderStatus}. Không link thanh toán, QR, lease/channel,
  payload event hoặc credentials. PaymentDateField.PAID_AT loại paidAt null.
- `confirmedBy.source` theo reference đã lưu MANAGER/LEGACY_MENTOR, không theo
  role hiện tại/cashMentorId của đơn mới. displayName là tên hiện tại hoặc null;
  hệ thống chưa lưu snapshot tên người thu lúc giao dịch. UUID/source gốc giữ nguyên.
- `review` là review event gần nhất của payment hoặc null, gồm outcome và reason
  từ allowlist reason nội bộ settlement; mã lạ trả reason=null. Review event có
  thể còn tồn tại sau khi xử lý, nên đọc status payment hiện tại cùng review.

Lỗi nghiệp vụ mới:422 MANAGER_RANGE_INVALID (thiếu một đầu, đảo/zero/vượt range);
404 PAYMENT_NOT_FOUND. Tái dùng404 USER_NOT_FOUND, CLASS_NOT_FOUND,
CLASS_STUDENT_NOT_FOUND, ORDER_NOT_FOUND; lỗi validation422 theo global filter.
400 path UUID;401 auth/session;403 role. GET không phát mail/ghi enrollment/settle;
retry đọc an toàn, không cần polling. Sau CASH confirm refetch roster, class counts,
order và payment; sau assignment refetch mentor classes/schedule.

Các bảng mục3–5 là contract runtime A–C. Examples trong bảng là trích fields,
không phải full payload. Full schema qua Swagger. Postman folder
`Phase 2.4 Manager operations` trong Mindy-BE dùng manager login/cookie jar,
biến course_id/class_id/mentor_id/student_id/order_id/payment_id và schedule_from/to.
Range schedule bắt buộc; rỗng trả items=[]/total=0. D summary chưa có endpoint.

Cấu hình runtime cần DB/catalog migrations hiện hành và manager active. GET không
cần provider online; upload tài liệu cần MinIO/Files worker theo Phase3.2.
Rate limiting/metrics/i18n riêng cho các GET mới chưa có infrastructure trong
slice này; không coi là đã triển khai. Bounded page/range và query parameterization
đã áp dụng; kế hoạch index bổ sung chờ EXPLAIN với dữ liệu production đại diện.

Local verification cuối16/10: check615/615 và HTTP77/77 pass, không skip;
manager cookies/role matrix/current-session/query validation được kiểm compiled
HTTP. Không có evidence VPS/browser/live payment. Word .docx hỗ trợ qua Materials
FILE/DOCUMENT và approve hiện hữu; xem phần cuối breakdown3.3.


## Rà soát sẵn sàng VPS ngày 2026-10-16

Đối chiếu Dockerfile, compose.production.yaml và workflow Deploy: image build từ
source và compiled migration catalog; push dev chạy check trước self-hosted deploy.
Increment2.4/contentText/DOCX approval không thêm migration/env/dependency. Local
check615 và HTTP77 đã pass. Working tree còn modified/untracked, cần commit đầy đủ
file mới trước push; không coi source local là đã có trên remote/VPS. Upload cần
MinIO/FILE_JOB hiện hữu đang hoạt động. Chưa agent deploy hoặc smoke test trên VPS;
sau rollout kiểm readiness, manager class list và DOCX upload/approve thực tế.
Đây là review cấu hình/readiness, không chạy lại BE tests trong lượt review này.

## 2026-10-22 — Manager screen-gap proposals (not implemented)

BE-only source audit, no frontend source inspection. Existing manager-accessible
routes span /manager, /management, /class-sessions and /files; keep existing routes.

| Proposed addition | FE use / scope to define before implementation |
|---|---|
| GET /manager/dashboard | Date range/timezone, settled revenue, today sessions, pending counts with drilldown links/filters and asOf; operational source counts reused, no raw rows from all queues. |
| GET /management/class-sessions | Global calendar from/to bounded, class/mentor/status filters and pagination; global view absent, per-class/per-mentor timetable already exists. |
| GET /manager/payments/summary | Aggregate verified transactions, payment method/date basis/currency; align filters with existing payment list, avoid duplicate multi-class order totals. Static route before :paymentId route. |
| Manager student learning view | Own-role history/progress across selected enrollment/class, not Student self APIs or Mentor impersonation; attendance formula reused. Route/DTO still to design. |
| Manager business audit view | Timeline/filter for class/session/actor/action, current authorization and redacted payloads; existing attendance audits/notes do not cover unified business timeline. |
| Assignment oversight | TEST/HOMEWORK + QUIZ/ZIP status/results/missing/grading queues dependent on Phase5 implementation; currently not callable. |

Routes above are candidates only, not available contracts. No request/error/retry
semantics or capability changes implemented in this audit. Decide class/course
creation/lifecycle/account-management rights separately; current ADMIN-only status
must not be bypassed by frontend. Existing material/leave/conflict/attendance/cash
queue APIs are sufficient for their action screens; dashboard can add counts rather
than duplicate commands. Existing class/person queries already have search/filters.
