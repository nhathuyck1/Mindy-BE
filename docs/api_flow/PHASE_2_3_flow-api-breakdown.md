# Phase 2.3 — API breakdown cho FE: My Classes và lịch

Cập nhật: **2026-10-10**. Bốn endpoint dưới đây đã implement trong checkout.
[Flow Student](PHASE_2_3_FLOW.md) · [Contract FE](../PHASE_2_3_FE_CONTRACT.md).
Deployment/VPS chưa được xác minh trong lượt này; API tồn tại trong source không
chứng minh môi trường FE đang gọi đã có release tương ứng.

## 1. Contract chung

- Prefix BE `/api/v1`; role STUDENT, user/session active, cookie `access_token`.
  Browser gọi với `credentials: 'include'` hoặc Axios `withCredentials: true`.
  Không tự đọc token, không gửi studentId/role. GET không cần body hay header
  nghiệp vụ riêng; có thể gửi `Accept: application/json`.
- Ownership lấy từ principal. `classId`, `enrollmentId`, `orderId` lấy từ response
  của BE, không suy ra từ tên lớp. Bốn GET chỉ đọc, không ghi DB/gọi PayOS/tạo link.
  Gọi lại sẽ đọc trạng thái hiện hành; concurrent settlement/expiry có thể làm
  response sau khác response trước, nên detail/preview kiểm quyền lại.
- Success là DTO JSON trực tiếp, không có wrapper `{ data: ... }`. List và lịch
  có pagination; detail/preview không phân trang. Mọi success trả 200 và
  `Cache-Control: private, no-store`.
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
