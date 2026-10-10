# Contract FE — Phase 2.3 My Classes + Personal Schedule

Chốt ngày **2026-10-09** (bước 2.3.1), triển khai cùng ngày ở local. Kế hoạch:
[PHASE_2_3_MY_CLASSES_SCHEDULE.md](./implement_phase/PHASE_2_3_MY_CLASSES_SCHEDULE.md).
Contract Phase 2 trước đó vẫn hiệu lực: [PHASE_2_FE_CONTRACT.md](./PHASE_2_FE_CONTRACT.md).

Mọi route dưới `/api/v1`, cookie auth, role **STUDENT**. Không gửi `studentId`
(query thừa → 422). Mọi response cá nhân có `Cache-Control: private, no-store`.
Không có meeting URL, QR, checkout URL, materials, email/phone trong list hoặc lịch.

## Luồng

```text
checkout → GET /me/classes (refetch) → chọn dòng theo accessMode
  FULL         → GET /me/classes/:classId            (detail + meeting URL)
  CASH_PREVIEW → GET /me/classes/:classId/preview    (title/timetable/room)
  NONE         → chỉ summary/order; không tự gọi private detail
lịch tuần/tháng → GET /me/schedule?from&to (lấy đủ các trang) → click event → mở lớp theo accessMode
```

Sau PayOS PAID hoặc mentor xác nhận CASH: refetch My Classes/lịch rồi mở detail FULL.
Preview cũ trả 403 sau khi đã thanh toán — đó là chuyển trạng thái, không phải mất lớp.
`accessMode/accessReason/canView*` là gợi ý tại thời điểm `asOf`; detail/preview luôn
kiểm tra lại quyền.

## `GET /me/classes`

Query: `page` (≥1, mặc định 1), `pageSize` (1–100, mặc định 20),
`view=current|history|all` (mặc định `current`), và tùy chọn một giá trị cho mỗi filter
`enrollmentStatus`, `classStatus`, `deliveryMode`, `courseId` (UUID v4). Filter giao
nhau rỗng trả 200 `total: 0`. Sort cố định `createdAt DESC, enrollmentId ASC`; filter và
phân loại view áp dụng trước count/page.

- `current`: enrollment ACTIVE/COMPLETED, hoặc hold PENDING_PAYMENT của own order còn
  `PENDING` và `expiresAt > asOf`.
- `history`: phần còn lại — enrollment CANCELLED, hold quá hạn (kể cả khi job expiry
  chưa chạy), hold của order EXPIRED/CANCELLED, dòng dữ liệu lệch (`STATE_MISMATCH`).
- Mua lại sau khi hold cũ hủy tạo **dòng mới**; key UI là `enrollmentId`, không gộp theo
  `classId`.

Response `{ items, page, pageSize, total, asOf }`. Mỗi item:

| Nhóm | Fields |
|---|---|
| Enrollment | `enrollmentId`, `enrollmentStatus`, `enrolledAt` (nullable), `createdAt`, `isHoldExpired` |
| Course | `courseId`, `courseCode`, `courseTitle`, `courseImageUrl` (nullable) |
| Class | `classId`, `classCode`, `className`, `classStatus`, `deliveryMode`, `startDate`, `endDate` (`YYYY-MM-DD`), `mentor: { id, displayName }` (mentor hiện tại) |
| Order | `order: { orderId, orderCode, orderStatus, paymentType, expiresAt, paidAt, requiresReview } \| null` |
| Quyền | `accessMode`, `accessReason`, `canViewClass`, `canViewSchedule` |

`order` là own order tạo ra enrollment; một order có thể gồm nhiều lớp (nhiều dòng cùng
`orderId`). Giá/tổng tiền/QR đọc qua `GET /me/orders/:orderId`. `order` chỉ `null` khi
chuỗi enrollment → order detail → order không khớp student/class (`STATE_MISMATCH`).
`requiresReview=true` khi payment attempt cần đối soát: hiển thị “đang đối soát”, không
mời trả lần nữa. `isHoldExpired=true` khi hold đã quá hạn dù DB chưa đổi trạng thái.

### Access matrix

| Tình trạng tại `asOf` | `accessMode` | `accessReason` | View |
|---|---|---|---|
| ACTIVE, Class không CANCELLED | `FULL` | `ACTIVE_ENROLLMENT` | current |
| PENDING_PAYMENT, own order CASH `PENDING`, chưa quá hạn | `CASH_PREVIEW` | `PENDING_CASH` | current |
| PENDING_PAYMENT, own order PAYOS `PENDING`, chưa quá hạn | `NONE` | `PENDING_PAYOS` | current |
| COMPLETED | `NONE` | `ENROLLMENT_COMPLETED` | current |
| Class CANCELLED (ưu tiên trên các dòng trên) | `NONE` | `CLASS_CANCELLED` | theo enrollment |
| PENDING_PAYMENT quá hạn, hoặc order EXPIRED/CANCELLED | `NONE` | `HOLD_EXPIRED` | history |
| CANCELLED | `NONE` | `ENROLLMENT_CANCELLED` | history |
| Chuỗi order lệch, hoặc hold PENDING_PAYMENT với order PAID | `NONE` | `STATE_MISMATCH` | history |

`canViewClass = canViewSchedule = accessMode !== 'NONE'`. COMPLETED chưa mở lại
private detail/lịch (quyền học lại để quyết định riêng). Unit LOCKED không ẩn tiêu đề
hay lịch Session ở Phase 2.3; materials/attendance/progress chưa tồn tại.

## Detail/preview (bổ sung additive)

Giữ route và mọi field cũ; chỉ thêm field:

- `GET /me/classes/:classId` (FULL): thêm `classStatus`, `enrollmentId`,
  `enrollmentStatus`, `enrolledAt`, `accessMode: "FULL"`.
- `GET /me/classes/:classId/preview` (CASH_PREVIEW): DTO `StudentClassPreviewDto` kế
  thừa `ClassDetailDto`, thêm `classStatus`, `enrollmentId`, `enrollmentStatus`,
  `orderId`, `orderCode`, `expiresAt`, `accessMode: "CASH_PREVIEW"`. Vẫn không có
  meeting URL. Public catalog DTO không đổi.

## `GET /me/schedule`

| Query | Quy tắc |
|---|---|
| `from`, `to` | Bắt buộc, ISO 8601 có `Z` hoặc `±HH:MM` (URL-encode dấu `+`). `from < to`, tối đa 31 ngày. Range nửa mở `[from, to)`. |
| `page`, `pageSize` | Mặc định 1 / **100**, tối đa 100. FE phải lấy đủ các trang của range. |
| `classId` | Tùy chọn (UUID v4). 403 `SCHEDULE_CLASS_ACCESS_DENIED` nếu không có FULL/CASH_PREVIEW cho lớp đó — không fallback lịch công khai. |
| `includeCancelled` | `true`/`false`, mặc định `true`: hiện Session CANCELLED với nhãn hủy. |

Session được chọn khi `startsAt < to AND endsAt > from`: buổi qua đêm xuất hiện ở cả hai
ngày nó giao; buổi kết thúc đúng `from` hoặc bắt đầu đúng `to` bị loại. Sort
`startsAt ASC, sessionId ASC`. Chỉ lớp có `accessMode` FULL hoặc CASH_PREVIEW, Class
không CANCELLED. FE đổi ngày/tuần/tháng theo giờ trung tâm (`timeZone`) thành range UTC,
ví dụ tuần bắt đầu 12/10/2026 giờ Việt Nam: `from=2026-10-11T17:00:00Z&to=2026-10-18T17:00:00Z`.

Response `{ items, page, pageSize, total, timeZone, from, to, asOf }`; timestamp là ISO
UTC, hiển thị theo `timeZone` (`APP_TIME_ZONE`, hiện `Asia/Ho_Chi_Minh`). Mỗi event:
`sessionId`, `sessionNumber`, `sessionTitle`, `sessionStatus`, `startsAt`, `endsAt`,
`roomName`, `classId`, `classCode`, `className`, `classStatus`, `courseId`,
`courseTitle`, `classUnitId`, `unitTitle`, `deliveryMode`, `mentor: { id, displayName }`,
`enrollmentId`, `accessMode` (`FULL` | `CASH_PREVIEW`).

Click event → mở lớp theo `accessMode` rồi định vị `sessionId` trong `units[].sessions[]`.
Không có session detail endpoint riêng. Event CANCELLED: nhãn hủy, không nút tham gia.
Đổi giờ/hủy Session hiện có phản ánh khi refetch; chưa có workflow nghỉ/dạy bù.

## Lỗi

| Status | Khi nào |
|---|---|
| 401 | Chưa đăng nhập/phiên không hợp lệ |
| 403 | Role không phải STUDENT; `classId` ngoài quyền xem lịch; detail/preview không đủ quyền |
| 422 | Query sai: thiếu timezone, range rỗng/ngược/>31 ngày, enum/UUID sai, `pageSize > 100`, field lạ |
| 200 rỗng | Chưa có enrollment, filter không khớp, range không có Session |

Envelope lỗi giữ như Phase 2 (`statusCode`, `code`, `message`, `details?`, `requestId`).

## FE checklist

- Loading/empty/error/session-expired cho cả list và lịch; cache theo user, xóa khi logout.
- Poll có giới hạn/backoff hoặc refresh khi focus/sau payment; không websocket.
- Không dùng return URL PayOS để đổi quyền; lookup order theo contract Phase 2.
