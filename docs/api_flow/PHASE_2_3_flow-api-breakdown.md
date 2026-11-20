# Phase 2.3 — API breakdown cho FE: My Classes và lịch

Seed roster cập nhật2026-10-16: bổ sung HTML-CSS-101-ON1 và JS-101-ON1 đến20
ghế mỗi lớp (tính ACTIVE/PENDING_PAYMENT đang có, giới hạn capacity). Lớp đủ
người được giữ nguyên. Không đổi API/auth/request/response; xem flow roster.

Kiểm chứng local 2026-10-16: pnpm check601/601 tests,58 suites; HTTP72/72 distinct cases qua các lượt (Phase2.2 cuối13/13). Lint/type-check/build pass; chưa deploy hoặc thanh toán thật.

## Thu tiền mặt bởi Manager — 2026-10-16

Đã implement source; kiểm chứng local ghi tại Progress.md. Chưa deploy/VPS.
[Flow](PHASE_2_3_FLOW.md#thu-tiền-mặt-chuyển-sang-manager--2026-10-16).
Các route dưới đây dùng prefix /api/v1, cookie access_token, credentials: include,
role MANAGER active. Không cần class assignment; ADMIN/MENTOR/STUDENT trả 403,
chưa đăng nhập 401. Các GET không có body; confirm không cần Idempotency-Key.
Success trả DTO trực tiếp. Timestamps ISO UTC; tiền là VND nguyên.

| API | Request và thời điểm FE gọi | Response 200 |
|---|---|---|
| GET /api/v1/manager/classes | Mở trang thu tiền; page ≥1 default1, pageSize 1–100 default20; status tùy chọn DRAFT/OPEN/IN_PROGRESS/COMPLETED/CANCELLED | {items: ClassDto có status[], page, pageSize, total}; mọi lớp, mới nhất trước; lấy items[].id làm classId |
| GET /api/v1/manager/classes/:classId/students | classId UUID từ list; page/pageSize như trên; paymentType CASH/PAYOS và orderStatus PENDING/PAID/EXPIRED/CANCELLED tùy chọn. Trang cần thu dùng ?paymentType=CASH&orderStatus=PENDING | {items, page, pageSize, total}; enrollment PENDING_PAYMENT/ACTIVE/COMPLETED, không CANCELLED |
| GET /api/v1/manager/cash-orders | Danh sách toàn bộ CASH order/lịch sử; chỉ page/pageSize như trên, mới nhất trước | {items: OrderDto[], page, pageSize, total}; không lọc mentor/manager |
| POST /api/v1/manager/cash-orders/:orderId/confirm | orderId UUID từ roster hoặc cash-orders; body {"receivedAmount":10000}, bắt buộc number nguyên 1–Number.MAX_SAFE_INTEGER bằng toàn bộ orderTotalAmount | OrderDto status PAID, paidAt; không dùng trạng thái APPROVED |

Roster item: studentId/studentName, enrollmentId/enrollmentStatus, orderId/orderCode,
orderStatus/paymentType, classAmount (phần của lớp), orderTotalAmount (phải thu đủ),
orderClassCount, expiresAt, paidAt nullable, canConfirmCash. Ví dụ:
{"studentId":"11111111-1111-4111-8111-111111111111","studentName":"Học viên",
"orderId":"22222222-2222-4222-8222-222222222222","paymentType":"CASH",
"orderStatus":"PENDING","classAmount":5000,"orderTotalAmount":10000,
"orderClassCount":2,"canConfirmCash":true} (trích fields).
Không có email/phone/meeting URL trong roster. Một đơn nhiều lớp phải xác nhận
một lần bằng tổng đơn; không thu lặp theo từng lớp. canConfirmCash chỉ là hint:
CASH, PENDING còn hạn, hold PENDING_PAYMENT, mọi lớp trong đơn chưa CANCELLED.
Mentor GET /mentor/classes và /mentor/classes/:classId/students giữ quyền assigned,
nhưng canConfirmCash luôn false. Mentor cash-orders routes cũ trả 404.

Confirm kiểm role hiện tại, CASH/full amount, deadline, lớp và holds trong
transaction, khóa lớp theo ID rồi order; commit payment SUCCEEDED + order PAID +
enrollment ACTIVE + progress nguyên tử. Concurrent/retry từ manager khác trả cùng
order PAID, không ghi trùng hoặc đổi audit người thu đầu tiên. Audit manager mới
và legacy mentor đều được attendance evidence nhận diện. Không PayOS/SMTP call,
không CASH email outbox. OrderDto.mentorId chỉ là legacy snapshot, không phải
người thu. Checkout/grouping CASH theo snapshot giữ nguyên cho Student.

Lỗi: UUID sai 400; query/body sai hoặc field lạ 422; class/order không tồn tại
404 CLASS_NOT_FOUND/ORDER_NOT_FOUND; non-manager 403 (guard hoặc ORDER_ACCESS_DENIED).
409 CASH_CONFIRMATION_INVALID: sai method/amount hoặc payment evidence không khớp;
CASH_ORDER_CLOSED: hết hạn, đóng hoặc có lớp hủy; CASH_HOLD_INVALID: hold không thể
activate. FE không retry mù 409; refetch đơn/roster, hiển thị lý do và chặn xác nhận.
401 đăng nhập lại, 403 dừng thao tác, 404 quay lại danh sách, 422 sửa input.

FE có loading/empty/error/retry cho GET; chỉ bật confirm khi canConfirmCash true,
chống double click và hiển thị tổng cả đơn. Sau confirm refetch roster, cash-orders
và student order/class; pending preview → full class sau PAID. Student flow và
các gate Materials/Attendance giữ nguyên. Không cần polling manager; lỗi mạng
confirm có thể retry cùng orderId/amount rồi refetch. Hết hạn thì dừng thu theo đơn
đó. Điều kiện môi trường: release API mới và tài khoản MANAGER active; CASH không
phụ thuộc flag PayOS. Migration không thay đổi. Rollback code cũ không hiểu audit
cash-manager mới; phải giữ reader tương thích nếu rollback sau khi thu tiền.


Cập nhật: **2026-10-12**. Bốn GET Student và hai PATCH Admin dưới đây đã implement trong checkout.
[Flow Student](PHASE_2_3_FLOW.md) · [Contract FE](../PHASE_2_3_FE_CONTRACT.md).
Deployment/VPS chưa được xác minh trong lượt này; API tồn tại trong source không
chứng minh môi trường FE đang gọi đã có release tương ứng.

## 1. Contract chung

Dữ liệu demo local bổ sung ngày 2026-10-16: `pnpm seed:class-roster` tạo 20 ACTIVE
students cho HTML-CSS-101-ON1 và 24 cho JS-101-ON1, kèm CASH PAID fixture và unit
progress. Tài khoản, mật khẩu, kiểm chứng và giới hạn xem
[ghi chú roster trong flow](PHASE_2_3_FLOW.md#dữ-liệu-mẫu-roster--2026-10-16).
Không có endpoint mới hoặc thay đổi request/response/auth của các API dưới đây.

- Prefix BE `/api/v1`; bốn GET dùng role STUDENT, hai PATCH §5.1 dùng ADMIN;
  user/session active, cookie `access_token`.
  Browser gọi với `credentials: 'include'` hoặc Axios `withCredentials: true`.
  Không tự đọc token, không gửi studentId/role. GET không cần body hay header
  nghiệp vụ riêng; có thể gửi `Accept: application/json`.
- Ownership lấy từ principal. `classId`, `enrollmentId`, `orderId` lấy từ response
  của BE, không suy ra từ tên lớp. Bốn GET chỉ đọc, không ghi DB/gọi PayOS/tạo link.
  Gọi lại sẽ đọc trạng thái hiện hành; concurrent settlement/expiry có thể làm
  response sau khác response trước, nên detail/preview kiểm quyền lại.
- Success là DTO JSON trực tiếp, không có wrapper `{ data: ... }`. List và lịch
  có pagination; detail/preview không phân trang. Mọi success trả 200 và
  `Cache-Control: private, no-store` cho bốn GET Student.
- Date-time trả ISO UTC; ngày bắt đầu/kết thúc lớp là `YYYY-MM-DD`. Lịch hiển thị
  theo `timeZone` của response (`APP_TIME_ZONE`, hiện Asia/Ho_Chi_Minh).
- List/lịch/preview không trả meeting URL; FULL detail có meeting URL nullable.
  Không tự thêm materials, attendance hoặc progress API vào flow này.

Ví dụ lỗi (dữ liệu giả):

```json
{
  "statusCode": 403,
  "code": "SCHEDULE_CLASS_ACCESS_DENIED",
  "message": "An active enrollment or unexpired pending cash hold is required for this class",
  "requestId": "example-request-id"
}
```

`requestId`/`details` có thể thiếu; validation message có thể là array. Dùng status
và code để xử lý, không so sánh message cứng.

| Lỗi chung | Khi nào | FE xử lý |
|---|---|---|
| 401 AUTHENTICATION_REQUIRED | Thiếu cookie, token/session/user không hợp lệ | Dừng poll, xóa dữ liệu user và dùng flow đăng nhập/refresh hiện có |
| 403 INSUFFICIENT_ROLE | Principal không phải STUDENT | Dừng retry; không dùng account role khác để vượt quyền |
| 422 HTTP_ERROR | Query validation: enum, range, UUID, pageSize hoặc field lạ | Hiển thị lỗi input, sửa request; không retry nguyên request |
| 400 HTTP_ERROR | UUID path của detail/preview không hợp lệ (ParseUUIDPipe) | Sửa classId; khác với UUID query sai trả 422 |
| 500 INTERNAL_SERVER_ERROR | Lỗi vận hành ngoài dự kiến | Error state; cho retry có giới hạn, giữ requestId để tra cứu |

## 2. GET /api/v1/me/classes

**Mục đích/FE gọi:** mở “Lớp của tôi”, sau checkout hoặc refetch khi thanh toán,
filter/tab/page thay đổi. Không lấy Order PAID rồi tự ghép danh sách lớp nữa.

Không có path/body. Query:

| Field | Kiểu, default và validation |
|---|---|
| page | Integer ≥1, mặc định 1 |
| pageSize | Integer 1–100, mặc định 20 |
| view | current/history/all, mặc định current |
| enrollmentStatus | Tùy chọn: PENDING_PAYMENT/ACTIVE/COMPLETED/CANCELLED |
| classStatus | Tùy chọn: DRAFT/OPEN/IN_PROGRESS/COMPLETED/CANCELLED |
| deliveryMode | Tùy chọn ONLINE/OFFLINE |
| courseId | Tùy chọn UUID v4 |

```http
GET /api/v1/me/classes?page=1&pageSize=20&view=current&deliveryMode=ONLINE
```

Filter giao nhau, chạy trước count/page. Sort cố định `createdAt DESC,
enrollmentId ASC`. current = ACTIVE/COMPLETED hoặc pending hold của own order
PENDING còn hạn, với chuỗi order hợp lệ; history = các dòng còn lại; all = cả hai.
COMPLETED nằm current nhưng chưa có quyền detail/lịch. Class CANCELLED vẫn có thể
ở current theo enrollment; accessMode NONE. Một order nhiều lớp có nhiều dòng;
mua lại có enrollmentId mới, không dùng classId làm row key.

Ví dụ 200 (CASH pending, dữ liệu giả):

```json
{
  "items": [{
    "enrollmentId": "11111111-1111-4111-8111-111111111111",
    "enrollmentStatus": "PENDING_PAYMENT",
    "enrolledAt": null,
    "createdAt": "2026-10-10T10:00:00.000Z",
    "isHoldExpired": false,
    "courseId": "22222222-2222-4222-8222-222222222222",
    "courseCode": "WEB101",
    "courseTitle": "Web cơ bản",
    "courseImageUrl": null,
    "classId": "33333333-3333-4333-8333-333333333333",
    "classCode": "WEB101-A",
    "className": "Web lớp A",
    "classStatus": "OPEN",
    "deliveryMode": "ONLINE",
    "startDate": "2026-10-12",
    "endDate": "2026-11-12",
    "mentor": {"id": "44444444-4444-4444-8444-444444444444", "displayName": "Mentor Demo"},
    "order": {
      "orderId": "55555555-5555-4555-8555-555555555555",
      "orderCode": "MD-DEMO-001",
      "orderStatus": "PENDING",
      "paymentType": "CASH",
      "expiresAt": "2026-10-12T10:00:00.000Z",
      "paidAt": null,
      "requiresReview": false
    },
    "accessMode": "CASH_PREVIEW",
    "accessReason": "PENDING_CASH",
    "canViewClass": true,
    "canViewSchedule": true
  }],
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "asOf": "2026-10-10T12:00:00.000Z"
}
```

| Fields FE dùng | Ý nghĩa |
|---|---|
| enrollmentId/status, enrolledAt, createdAt | Row key, nhãn enrollment; enrolledAt nullable khi chưa kích hoạt |
| courseId/code/title/image | Thẻ khóa học; image nullable |
| classId/code/name/status, deliveryMode, startDate/endDate | ID mở lớp, nhãn trạng thái và ngày lớp |
| mentor.id/displayName | Mentor hiện tại của lớp; displayName nullable |
| order | Own order tạo enrollment; null khi chuỗi order sai. orderStatus=PENDING/PAID/EXPIRED/CANCELLED; paymentType=CASH/PAYOS; paidAt nullable |
| order.orderId | Truyền sang GET /api/v1/me/orders/:orderId theo contract Phase 2 để xem tiền/link thanh toán |
| order.requiresReview | Đang cần đối soát, không mời trả lần nữa |
| asOf, isHoldExpired | Mốc server xét deadline; pending hold quá hạn dù timer chưa persist |
| accessMode, accessReason, canViewClass/canViewSchedule | Hint tại thời điểm đọc; quyền phải được kiểm lại khi mở lớp |

Mapping access: FULL/ACTIVE_ENROLLMENT → detail; CASH_PREVIEW/PENDING_CASH → preview;
NONE với PENDING_PAYOS, HOLD_EXPIRED, ENROLLMENT_CANCELLED, ENROLLMENT_COMPLETED,
CLASS_CANCELLED hoặc STATE_MISMATCH → summary. Chi tiết ưu tiên reason theo
[access matrix](../PHASE_2_3_FE_CONTRACT.md#access-matrix).

200 `items: [], total: 0` khi chưa có lớp/filter không khớp; page vượt dữ liệu có
items rỗng nhưng total giữ tổng filter. FE loading → empty/success/error; đổi
filter reset page. Không poll list liên tục mặc định; refetch sau payment/focus.
Endpoint không có lỗi business riêng ngoài bảng lỗi chung.

## 3. GET /api/v1/me/classes/:classId

**Mục đích/FE gọi:** dòng hoặc event accessMode FULL. Lấy classId từ list/event;
role STUDENT, own enrollment ACTIVE, Class không CANCELLED. Không cần Class OPEN
hoặc Course active như public catalog. Không có query/body; classId là UUID path.

```http
GET /api/v1/me/classes/33333333-3333-4333-8333-333333333333
```

Ví dụ 200 (dữ liệu giả, không có Session trong fixture ví dụ):

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "courseId": "22222222-2222-4222-8222-222222222222",
  "code": "WEB101-A", "name": "Web lớp A",
  "startDate": "2026-10-12", "endDate": "2026-11-12",
  "deliveryMode": "ONLINE", "maxStudents": 20, "availableSeats": 5,
  "mentor": {"id": "44444444-4444-4444-8444-444444444444", "displayName": "Mentor Demo"},
  "units": [], "meetingUrl": "https://meet.example.test/demo-class",
  "classStatus": "OPEN",
  "enrollmentId": "11111111-1111-4111-8111-111111111111",
  "enrollmentStatus": "ACTIVE", "enrolledAt": "2026-10-10T12:00:00.000Z",
  "accessMode": "FULL"
}
```

Fields inherited: id là classId; courseId, code/name/date/deliveryMode, mentor như
thẻ lớp. maxStudents/availableSeats là capacity/số chỗ còn khả dụng. units[] có
`id` (classUnitId), `position`, `title`, `sessions[]`. Mỗi session có `id`
(sessionId), `sessionNumber`, `title`, `startsAt`, `endsAt`, `roomName` nullable,
`status` (SCHEDULED/COMPLETED/CANCELLED) và `meetingUrl` nullable. Root meetingUrl
cũng nullable. Không suy ra có nút join từ accessMode khi Session bị hủy.

Field additive: classStatus, enrollmentId/status, enrolledAt nullable và accessMode
FULL. FE định vị session bằng ID, không theo title/position; units/sessions rỗng
hiển thị chưa có buổi, không tự tạo content. FULL không đồng nghĩa Material mở.

- 403 CLASS_ACCESS_DENIED: không own ACTIVE hoặc Class CANCELLED. Refetch list,
  chuyển summary/preview theo trạng thái mới; không retry detail liên tục.
- 404 CLASS_NOT_FOUND: read service không tìm thấy lớp sau khi kiểm enrollment;
  refetch list và báo lớp không còn khả dụng. Lớp ngoài quyền thường bị chặn 403
  trước bước đọc này, không hứa mọi classId không tồn tại đều trả 404.
- Khi mới checkout/return PayOS chưa được ACTIVE, không gọi FULL dựa trên redirect.
- Loading detail → render units/timetable; khi lỗi quyền không giữ meeting URL cũ.
  Gọi lặp chỉ đọc hiện trạng, không tạo progress/enrollment.

## 4. GET /api/v1/me/classes/:classId/preview

**Mục đích/FE gọi:** dòng/event CASH_PREVIEW. Own hold PENDING_PAYMENT phải khớp
đúng order detail, own order CASH PENDING còn hạn, Class không CANCELLED. Sau
PAID/ACTIVE endpoint này không còn dùng. classId lấy từ list/event, UUID path;
không có query/body.

```http
GET /api/v1/me/classes/33333333-3333-4333-8333-333333333333/preview
```

Ví dụ 200 (dữ liệu giả):

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "courseId": "22222222-2222-4222-8222-222222222222",
  "code": "WEB101-A", "name": "Web lớp A",
  "startDate": "2026-10-12", "endDate": "2026-11-12",
  "deliveryMode": "OFFLINE", "maxStudents": 20, "availableSeats": 5,
  "mentor": {"id": "44444444-4444-4444-8444-444444444444", "displayName": "Mentor Demo"},
  "units": [], "classStatus": "OPEN",
  "enrollmentId": "11111111-1111-4111-8111-111111111111",
  "enrollmentStatus": "PENDING_PAYMENT",
  "orderId": "55555555-5555-4555-8555-555555555555",
  "orderCode": "MD-DEMO-001", "expiresAt": "2026-10-12T10:00:00.000Z",
  "accessMode": "CASH_PREVIEW"
}
```

Inherited class/unit/session fields giống mục 3, nhưng root và session **không có**
meetingUrl. Preview không trả enrolledAt; các field mới là classStatus,
enrollmentId/status, orderId/code, expiresAt và CASH_PREVIEW. OrderId dùng mở own
order, expiresAt dùng nhãn deadline; server quyết định quyền, không dùng đồng hồ
client để tự cấp entitlement.

- 403 CLASS_PREVIEW_DENIED: hold/order hết hạn, không khớp, đã confirm hoặc Class
  CANCELLED. Refetch list; nếu FULL đổi sang detail, nếu NONE hiển thị summary.
- 404 CLASS_NOT_FOUND có thể xảy ra ở bước read sau entitlement; cùng cách xử lý
  mục 3. Lỗi UUID/auth/role theo bảng chung.
- Loading/empty units/error giống detail. Gọi lặp không kéo dài deadline hoặc tạo
  hold mới. CASH confirm → refetch list + lịch + detail, không tiếp tục poll preview.

## 5. GET /api/v1/me/schedule

**Mục đích/FE gọi:** mở lịch tuần/tháng, đổi range, lọc lớp; refetch sau thay đổi
quyền học. Chỉ Session của own FULL/CASH_PREVIEW; không lấy Session của pending
PayOS, COMPLETED enrollment, expired/cancelled hold hoặc Class CANCELLED.

Không có path/body. Query:

| Field | Kiểu, default và validation |
|---|---|
| from, to | Bắt buộc ISO 8601 date-time có Z hoặc ±HH:MM; from < to; tối đa 31 ngày |
| page | Integer ≥1, mặc định 1 |
| pageSize | Integer 1–100, mặc định 100 |
| classId | Tùy chọn UUID v4; lấy từ My Classes/event; phải có quyền lịch |
| includeCancelled | Chuỗi true/false, mặc định true; false loại Session CANCELLED |

```http
GET /api/v1/me/schedule?from=2026-10-11T17:00:00Z&to=2026-10-18T17:00:00Z&page=1&pageSize=100&includeCancelled=true
```

Range tuần trên là 12–19/10/2026 lúc 00:00 theo giờ trung tâm +07. Dùng URLSearchParams
để encode dấu + trong offset; gửi ngày đơn thuần/thiếu timezone bị reject.
Chọn overlap `startsAt < to AND endsAt > from`; ending=from hoặc starting=to bị
loại, buổi qua đêm có thể hiện trên cả hai ngày. Sort startsAt ASC, sessionId ASC.

Ví dụ 200 (dữ liệu giả):

```json
{
  "items": [{
    "sessionId": "66666666-6666-4666-8666-666666666666",
    "sessionNumber": 1, "sessionTitle": "Buổi 1", "sessionStatus": "SCHEDULED",
    "startsAt": "2026-10-12T01:00:00.000Z", "endsAt": "2026-10-12T02:00:00.000Z",
    "dayOfWeek": "Monday", "startTime": "08:00", "endTime": "09:00",
    "roomName": null,
    "classId": "33333333-3333-4333-8333-333333333333",
    "classCode": "WEB101-A", "className": "Web lớp A", "classStatus": "OPEN",
    "courseId": "22222222-2222-4222-8222-222222222222", "courseTitle": "Web cơ bản",
    "classUnitId": "77777777-7777-4777-8777-777777777777", "unitTitle": "Unit 1",
    "deliveryMode": "ONLINE",
    "mentor": {"id": "44444444-4444-4444-8444-444444444444", "displayName": "Mentor Demo"},
    "enrollmentId": "11111111-1111-4111-8111-111111111111", "accessMode": "CASH_PREVIEW"
  }],
  "page": 1, "pageSize": 100, "total": 1,
  "timeZone": "Asia/Ho_Chi_Minh",
  "from": "2026-10-11T17:00:00.000Z", "to": "2026-10-18T17:00:00.000Z",
  "asOf": "2026-10-10T12:00:00.000Z"
}
```

Event fields: sessionId dùng key/định vị Session; number/title/status dùng nhãn,
startsAt/endsAt dùng vẽ lịch theo timeZone; roomName nullable. class/course/unit
IDs và tên dùng điều hướng/thẻ lớp; mentor như list; enrollmentId giữ liên hệ
enrollment; accessMode chỉ FULL/CASH_PREVIEW, không có NONE trong events.
Response page/pageSize/total để lấy đủ trang; from/to là range chuẩn hóa UTC,
asOf là mốc server xét quyền. Không có meetingUrl hoặc order/payment payload.

`dayOfWeek`: thứ của `startsAt` theo `timeZone`, tên tiếng Anh đầy đủ từ Monday
đến Sunday. `startTime`/`endTime`: giờ địa phương `HH:mm` (24 giờ), tính từ hai
timestamps; không có cột DB mới. Buổi qua đêm dùng thứ ngày bắt đầu và có thể có
endTime nhỏ hơn startTime; vẫn phải dùng endsAt để xác định ngày kết thúc.

- 200 total=0 khi không có lớp có quyền hoặc không có Session giao range. Loading
  → lịch rỗng/success/error; lấy đủ trang trước khi coi range hoàn chỉnh.
- 403 SCHEDULE_CLASS_ACCESS_DENIED nếu truyền classId không có quyền (kể cả ID
  không tồn tại); không fallback public schedule. Refetch My Classes, bỏ filter
  không còn quyền hoặc về summary; dừng retry request cũ.
- Không truyền classId thì bỏ qua lớp không đủ quyền, có thể trả lịch rỗng thay 403.
- 422 HTTP_ERROR khi thiếu from/to, range sai/>31 ngày, offset/UUID/boolean sai,
  pageSize>100 hoặc studentId thừa. Hiển thị lỗi và sửa query.
- Đổi range reset page; tránh ghép response của range/user cũ. Session CANCELLED
  vẫn hiện mặc định với nhãn hủy, không nút tham gia. Khi bấm event, gọi lại detail/
  preview và dùng sessionId; event không phải token quyền. Lịch GET không đổi giờ,
  hủy Session, settle order hoặc ghi attendance.

## 5.1 Admin sửa giờ một buổi và bulk

Hai endpoint mới ngày 2026-10-12, cookie auth, **ADMIN** (khác bốn GET Student):

| Method và route | Mục đích |
|---|---|
| `PATCH /api/v1/admin/classes/:classId/sessions/:sessionId` | Sửa giờ một Session của Class |
| `PATCH /api/v1/admin/classes/:classId/sessions/bulk` | Áp dụng cùng giờ cho các Session được chọn trong Class, một transaction |

FE mở `GET /api/v1/admin/classes/:classId`, lấy classId và `units[].sessions[].id`;
chọn một/nhiều buổi, nhập giờ rồi PATCH với `Content-Type: application/json`.
Path classId/sessionId là UUID; sessionId phải thuộc đúng Class, kể cả bulk.
Không query. Payload single:

```json
{ "startTime": "07:30", "endTime": "09:30" }
```

Payload bulk:

```json
{
  "sessionIds": [
    "66666666-6666-4666-8666-666666666666",
    "88888888-8888-4888-8888-888888888888"
  ],
  "startTime": "07:30",
  "endTime": "09:30"
}
```

startTime/endTime bắt buộc dạng đúng `HH:mm`, khoảng 00:00–23:59; không nhận
`7:30`, `24:00`, seconds, timestamp, ngày, field lạ. sessionIds là mảng 1–100 UUID v4
không trùng; không suy diễn mảng rỗng thành “toàn bộ lớp”. Chọn tất cả thì FE lấy
đủ ID từ class detail (trên 100 thì chia request, mỗi request atomic riêng).

Backend ghép giờ với **ngày bắt đầu/kết thúc hiện tại tương ứng** theo APP_TIME_ZONE,
lưu starts_at/ends_at TIMESTAMPTZ. Ví dụ buổi 13/10/2026 đổi thành 07:30–09:30
giờ Việt Nam → startsAt `2026-10-13T00:30:00.000Z`, endsAt `2026-10-13T02:30:00.000Z`.
Buổi qua đêm giữ cả hai ngày; endpoint không đổi ngày/thứ, title, room, URL,
number, unit, status hoặc attendance. Thời điểm phải start < end và trong period
của Class. Class DRAFT/OPEN/IN_PROGRESS và Session SCHEDULED được sửa; không có
quy tắc tự đổi status dựa trên thời gian. Không sửa Class COMPLETED/CANCELLED hoặc
Session COMPLETED/CANCELLED. Giờ không tồn tại do DST bị reject; giờ lặp do DST
ưu tiên offset cũ nếu có thể.

200 trả **ClassManagementDetailDto** giống GET admin class detail: class fields,
status, units và sessions chứa timestamps mới (không có wrapper data).
Ví dụ phần Session trong response (rút gọn):

```json
{
  "id": "66666666-6666-4666-8666-666666666666",
  "sessionNumber": 1,
  "title": "Buổi 1",
  "startsAt": "2026-10-13T00:30:00.000Z",
  "endsAt": "2026-10-13T02:30:00.000Z",
  "status": "SCHEDULED"
}
```

Class row lock tuần tự hóa thay đổi trong cùng lớp; mentor advisory lock giữ
quy tắc trùng mentor giữa OPEN/IN_PROGRESS classes. Kiểm overlap trên trạng thái
cuối cùng, gồm buổi được chọn và chưa chọn; hai buổi sát nhau được phép. Một lỗi
→ rollback toàn bộ bulk. Gọi lại cùng payload giữ nguyên giờ, không nhân bản Session;
không gửi notification/payment hoặc sửa enrollment/progress.

| Status / code | FE xử lý |
|---|---|
| 401 | Đăng nhập lại |
| 403 INSUFFICIENT_ROLE | Không hiển thị thao tác cho role ngoài ADMIN; dừng retry |
| 400 HTTP_ERROR | Path UUID sai; sửa ID |
| 404 CLASS_NOT_FOUND / CLASS_SESSION_NOT_FOUND | Class/Session mất hoặc Session thuộc lớp khác; refetch selection |
| 409 CLASS_NOT_EDITABLE / CLASS_SESSION_NOT_EDITABLE | Trạng thái không cho sửa; refetch và bỏ thao tác |
| 409 CLASS_SESSION_OVERLAP / CLASS_MENTOR_SCHEDULE_CONFLICT | Giữ input, báo trùng lịch; không tự retry |
| 422 HTTP_ERROR | Body sai format/field/mảng IDs; sửa input |
| 422 CLASS_SESSION_TIME_RANGE_INVALID / CLASS_SESSION_OUTSIDE_CLASS_PERIOD / CLASS_SESSION_LOCAL_TIME_INVALID | Khoảng giờ/ngày hoặc giờ DST không hợp lệ; sửa input |

Form có loading/success/error, khóa submit khi pending; không optimistic-update
từng buổi khi bulk chưa thành công. Success → dùng detail mới/refetch admin detail
và invalidate lịch Student. API lịch tự dẫn xuất lại dayOfWeek/startTime/endTime.
Không polling bắt buộc. Chưa có workflow xin nghỉ/dạy bù/approval hay API đổi ngày.
Không migration; cần deploy backend mới để FE gọi hai PATCH.

## 5.2 Seed lịch demo hiện tại

`pnpm seed:course-class` (hoặc seed:data) tạo ba lớp demo của ba Course:

| Course | Mode | Giờ (+07) | Course/Class Unit | Sessions |
|---|---|---|---|---|
| HTML-CSS-101 | ONLINE | 15:00–17:00 | 5 | 10 |
| JS-101 | ONLINE | 15:00–17:00, mentor khác HTML | 6 | 10 |
| PY-101 | OFFLINE, Phòng Lab 2 | 09:00–11:00 | 4 | 10 |

Code `<course-code>-10S-YYYYMMDD`, suffix là ngày của buổi đầu tiên còn sắp tới.
10 buổi liên tiếp vào thứ 3/thứ 7. Chia đủ 10 slot theo thứ tự syllabus qua toàn
bộ units của từng Course, mỗi Unit ít nhất một buổi; chênh lệch số buổi/unit tối đa1.
Từ 12/10/2026: 13,17,20,24,27,31/10 và 03,07,10,14/11.
Không tạo lại/sửa lớp cũ; chạy lại giữ cohort từng Course DRAFT/OPEN/IN_PROGRESS còn trong period
để không tạo lịch trùng mentor. Sau khi cohort kết thúc mới seed cohort suffix mới.
Accounts/mentors phải seed trước;
không tạo enrollment hay giả thanh toán, Student cần checkout để lịch cá nhân có quyền đọc.
Lịch 5 tuần dài hơn giới hạn 31 ngày của GET: FE lấy theo tuần hoặc chia range.
Kiểm chứng local sau mở rộng3 lớp: query đúng2 ONLINE/1 OFFLINE,15 Class Unit,
30 Session,0 mentor conflict; rerun0 lớp. pnpm check298/298 pass (27 suites),
lint/type-check/build pass; không có deploy/VPS evidence mới.

## 5.3 Admin danh sách và chi tiết học sinh theo lớp

Implement local ngày 2026-10-13; chưa có evidence deploy/VPS.
Flow: [quản trị roster](PHASE_2_3_FLOW.md#bổ-sung-quản-trị-học-sinh-theo-lớp--2026-10-13).

Hai API cần cookie `access_token` hợp lệ, role ADMIN. MANAGER/MENTOR/STUDENT
không được đọc. Admin đọc mọi Class, không cần assignment; không giới hạn trạng
thái Class. Chỉ đọc enrollment PENDING_PAYMENT, ACTIVE, COMPLETED, bỏ CANCELLED.
Student SUSPENDED vẫn hiển thị. Không có body/header idempotency, không side effect,
không xác nhận thanh toán, không gọi PayOS. Gọi lặp trả trạng thái hiện tại.

### GET /api/v1/admin/classes/:classId/students

Màn hình chi tiết lớp/tab học sinh gọi sau `GET /api/v1/admin/classes`;
`classId` lấy từ `items[].id`. Admin class detail hiện có vẫn trả units/sessions.
Path `classId` bắt buộc UUID. Query chỉ có `page` (integer ≥1, default 1)
và `pageSize` (integer 1–100, default 20). Query thừa bị reject 422.
Sort đăng ký mới nhất trước, tie-break enrollment ID ASC; total tính trước phân trang.

```http
GET /api/v1/admin/classes/11111111-1111-4111-8111-111111111111/students?page=1&pageSize=20
Cookie: access_token=<token>
```

200 trả trực tiếp page, không có wrapper `data`:

```json
{
  "items": [{
    "studentId": "22222222-2222-4222-8222-222222222222",
    "studentName": "Nguyễn An",
    "email": "an@example.test",
    "phone": null,
    "studentStatus": "ACTIVE",
    "enrollmentId": "33333333-3333-4333-8333-333333333333",
    "enrollmentStatus": "PENDING_PAYMENT",
    "enrolledAt": null
  }],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

`studentId` dùng mở detail; `studentName/email/phone` dùng hiển thị/liên hệ;
phone nullable. `studentStatus`: ACTIVE/SUSPENDED (account);
`enrollmentStatus`: PENDING_PAYMENT/ACTIVE/COMPLETED (đăng ký).
`enrolledAt` là ISO timestamp UTC khi enrollment được activate, null lúc pending.
`enrollmentId` định danh đăng ký, không dùng thay studentId. Pending không chứng
minh đã thanh toán. Class tồn tại nhưng chưa có học sinh hoặc trang vượt total
trả 200 `items: []`; total vẫn là tổng roster. Mỗi học sinh có tối đa một enrollment
còn hiệu lực theo partial unique index hiện có.

### GET /api/v1/admin/classes/:classId/students/:studentId

FE bấm học sinh trong roster, truyền cùng classId và `items[].studentId` (UUID).
Không có query/body. Không dùng `GET /admin/users/:userId` thay thế check membership.
200 trả object có toàn bộ fields của một roster item, bổ sung:

```json
{
  "studentId": "22222222-2222-4222-8222-222222222222",
  "studentName": "Nguyễn An",
  "email": "an@example.test",
  "phone": null,
  "studentStatus": "ACTIVE",
  "enrollmentId": "33333333-3333-4333-8333-333333333333",
  "enrollmentStatus": "ACTIVE",
  "enrolledAt": "2026-10-13T03:10:00.000Z",
  "classId": "11111111-1111-4111-8111-111111111111",
  "orderDetailId": "44444444-4444-4444-8444-444444444444",
  "registeredAt": "2026-10-13T03:00:00.000Z",
  "accountCreatedAt": "2026-10-01T03:00:00.000Z",
  "lastLoginAt": "2026-10-13T02:55:00.000Z"
}
```

`registeredAt`: tạo enrollment/giữ chỗ; `accountCreatedAt`: tạo account;
`lastLoginAt`: login cuối, nullable. Tất cả timestamps trả ISO UTC, FE chuyển timezone
khi hiển thị. `orderDetailId` là UUID dòng order, không phải orderId. Không trả
password/hash/token và không có payment summary/progress/attendance trong detail này.
Student không có enrollment còn hiệu lực trong đúng Class (kể cả chỉ có CANCELLED)
trả 404 CLASS_STUDENT_NOT_FOUND.

### Lỗi, UI và kiểm chứng

| Status/code | FE xử lý |
|---|---|
| 401 (auth guard) | Đăng nhập lại, clear cache |
| 403 (role guard) | Ẩn quyền quản trị, không retry |
| 400 HTTP_ERROR | Path không phải UUID; sửa ID |
| 422 HTTP_ERROR | Query list sai/thừa; sửa phân trang |
| 404 CLASS_NOT_FOUND | Class không tồn tại, quay lại danh sách lớp |
| 404 CLASS_STUDENT_NOT_FOUND | Học sinh không thuộc roster hiện tại; refetch list |

Error envelope `{statusCode, code, message, details?, requestId?}` theo filter hiện có.
Tab roster/detail có loading/empty/success/error; giữ page khi refetch, cache theo
actor/classId/studentId và clear khi logout. Không cần polling; refetch sau checkout,
payment/enrollment/account-status change hoặc khi mở lại tab. Không optimistic ghi
đăng ký từ GET. Prerequisite: deploy BE mới, các migration users/classes/enrollments
hiện có, cookie/CORS đúng origin FE. Hai HTTP case mới pass trên DB test riêng:
401/403/400/422/404, Swagger, list/detail, empty/page bounds, pending/active/completed,
suspended account, bỏ cancelled và học sinh ở lớp khác. Chưa deploy/VPS.

## 6. Refetch, polling và prerequisite

- Login/checkout → list; nhận PAID từ own order hoặc CASH confirm → refetch list,
  calendar và endpoint detail thích hợp. Return PayOS không tự chuyển FULL.
- Cache UI theo user, clear khi logout/401; không giữ URL/private detail khi quyền
  bị thu hồi. Refresh khi focus/sau payment; poll payment hữu hạn/backoff theo flow
  Phase 2, dừng khi order kết thúc/requiresReview/401/403/rời màn hình. Không thêm
  realtime contract hoặc thời gian poll bắt buộc mà BE chưa quy định.
- Release cần StudentLearningModule + detail/preview DTO mới và các migration
  nền tảng enrollment/payment đã có. 2.3 không thêm migration riêng; không cần
  MinIO để dùng list/lịch. CORS/cookie auth phải cho phép origin FE, `/api/v1/me/*`
  phải bypass cache. Full flow payment còn phụ thuộc cấu hình Phase 2.2.
- Evidence local trước lượt tài liệu: 6 PostgreSQL case 2.3; full check 243 và
  HTTP 20 pass. Coverage PayOS settlement → My Classes/calendar, query plan trên
  fixture lớn và staging/VPS smoke vẫn là gate riêng. Lượt này chỉ review/docs.

## Nguồn đối chiếu

- Kiểm chứng bổ sung 2026-10-12: `pnpm check` 291/291 (27 suites), HTTP 23/23
  (2 suites) pass; seed DB development local 1 cohort/10 Session, rerun 0 lớp.
  Chưa deploy/VPS phần bổ sung clock-time/calendar này.
- [Session clock-time controller](../../src/modules/classes/controllers/admin-classes.controller.ts)
- [Session clock-time requests](../../src/modules/classes/dtos/update-class-session-time.dto.ts)
- [Atomic schedule updates](../../src/modules/classes/services/class-schedule.service.ts)
- [Clock-time integration tests](../../test/integration/session-time-updates.spec.ts)

- [List controller](../../src/modules/student-learning/controllers/my-classes.controller.ts)
- [List query DTO](../../src/modules/student-learning/dtos/my-class-page-options.dto.ts)
- [List response DTO](../../src/modules/student-learning/dtos/my-class.dto.ts)
- [List read query](../../src/modules/student-learning/services/my-classes.service.ts)
- [Schedule controller](../../src/modules/student-learning/controllers/my-schedule.controller.ts)
- [Schedule query DTO](../../src/modules/student-learning/dtos/my-schedule-query.dto.ts)
- [Schedule response DTO](../../src/modules/student-learning/dtos/my-schedule.dto.ts)
- [Schedule read query](../../src/modules/student-learning/services/my-schedule.service.ts)
- [Full detail controller](../../src/modules/classes/controllers/student-classes.controller.ts)
- [Full detail DTO](../../src/modules/classes/dtos/student-class.dto.ts)
- [Full entitlement](../../src/modules/classes/services/student-class.service.ts)
- [CASH controller](../../src/modules/payments/controllers/cash-payments.controller.ts)
- [Preview DTO](../../src/modules/payments/dtos/student-class-preview.dto.ts)
- [CASH entitlement](../../src/modules/payments/services/cash-payments.service.ts)
- [Access matrix implementation](../../src/modules/student-learning/domain/learning-access.ts)
- [Error envelope](../../src/filters/global-exception.filter.ts)
- [HTTP configuration](../../src/configure-app.ts)
- [Integration tests](../../test/integration/phase23-my-classes-schedule.spec.ts)
- [HTTP tests](../../test/http/phase22-payments.spec.ts)
