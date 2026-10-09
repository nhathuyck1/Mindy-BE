# Contract FE — kết thúc Phase 2

Phạm vi theo yêu cầu ngày 2026-10-05: Course Catalog, Class Registration, Cart,
Full Payment và Enrollment. Materials thuộc Phase 3; attendance và operational
queries thuộc Phase 4. Không coi các API backlog bên dưới là đã tồn tại.

## PayOS → `/payment/result`

Giữ `PAYOS_RETURN_URL`/`PAYOS_CANCEL_URL` cố định phía server. PayOS thêm
`orderCode` (số), `id`, `code`, `cancel`, `status` vào URL theo
[contract return URL chính thức](https://payos.vn/docs/du-lieu-tra-ve/return-url/).
FE chỉ dùng `orderCode` để tra mapping, không dùng `code`/`status`/`cancel` để
xác nhận thanh toán hoặc tự hủy order.

1. Đọc `orderCode` nguyên dạng chuỗi từ query của `/payment/result`.
2. Gọi `GET /api/v1/me/orders/payment-result?orderCode=1000000000` với cookie.
   Chỉ gửi query `orderCode`; không chuyển toàn bộ query PayOS sang API.
3. Response là cùng `OrderPaymentDto` của `GET /me/orders/:orderId`: `id` là
   internal UUID orderId, `orderCode` là mã Mindy dạng `MD...`, `payment` là
   payment summary. `payment.providerOrderCode` là mã số PayOS.
4. Render trạng thái BE. Nếu `PENDING` sau redirect, hiển thị chờ xác nhận và
   poll `GET /me/orders/:id` với backoff/giới hạn; chỉ `PAID` mở luồng đã thanh toán.
   `REQUIRES_REVIEW` hiển thị cần đối soát, không mời trả lần nữa.

Lookup dùng mapping unique lưu DB, hoạt động sau refresh/đăng nhập lại trên thiết
bị khác, không cần localStorage hoặc orderId trong return URL. GET không gọi
provider, không settle hoặc sửa order. Không giới hạn mapping theo channel hiện
tại để order cũ vẫn đọc được khi đổi cấu hình kênh.

401: cần đăng nhập; 403: order thuộc student khác; 404: mã chưa tồn tại/ngoài safe
integer; 422: query thiếu/sai định dạng. Response tạo/reuse link đã bổ sung
`providerOrderCode` (number); CASH summary trả trường này `null`.

## CASH

### Màn hình Mentor: lớp → học viên → thu tiền

| API | Quyền | Contract |
|---|---|---|
| `GET /api/v1/mentor/classes?page=1&pageSize=20&status=OPEN` | MENTOR đang được gán cho Class | Danh sách lớp phân trang, chỉ lớp của chính mentor; gồm trạng thái Class. `status` tùy chọn. |
| `GET /api/v1/mentor/classes/:classId/students?page=1&pageSize=20&paymentType=CASH&orderStatus=PENDING` | MENTOR đang được gán cho Class | Danh sách enrollment còn hiệu lực của lớp; `paymentType`/`orderStatus` tùy chọn. Lớp không thuộc mentor trả 404. |

Mỗi dòng học viên có `studentId`, `studentName`, `enrollmentId/status`,
`paymentType`, `orderId`, `orderCode`, `orderStatus`, `classAmount`,
`orderTotalAmount`, `orderClassCount`, `expiresAt`, `paidAt` và `canConfirmCash`.
`canConfirmCash` chỉ là gợi ý cho UI tại thời điểm đọc; endpoint confirm vẫn kiểm
tra lại quyền, hạn, amount, trạng thái và giữ chỗ trong transaction. Không trả
email/số điện thoại hoặc meeting URL trong roster. Nếu một order CASH gồm nhiều
lớp của cùng mentor, **thu và confirm toàn bộ `orderTotalAmount` một lần bằng
`orderId`**, không thu `classAmount` riêng cho mỗi dòng/lớp. Khi Admin đổi mentor
của Class, mentor mới thấy roster nhưng không được confirm cash order đã chụp
mentor cũ; mentor cũ vẫn thấy order trong `GET /mentor/cash-orders` để xử lý.

| API | Quyền | Contract |
|---|---|---|
| `GET /api/v1/mentor/cash-orders?page=1&pageSize=20` | MENTOR snapshot của order | `{items: OrderDto[], page, pageSize, total}`, mới nhất trước; gồm lịch sử các trạng thái |
| `POST /api/v1/mentor/cash-orders/:orderId/confirm` | MENTOR snapshot của order | Body `{receivedAmount: 5000}`, đúng tổng VND nguyên; HTTP 200 `OrderDto` |
| `GET /api/v1/me/classes/:classId/preview` | STUDENT có hold CASH pending còn hạn | `ClassDetailDto`: summary, unit/session titles, timetable/room; không có meeting URL |
| `GET /api/v1/me/classes/:classId` | STUDENT ACTIVE | Full class DTO hiện có |

Confirm kiểm tra ownership, method, amount, deadline, class chưa CANCELLED và
holds hiện hữu. Transaction giữ lock class theo ID → order → activation holds;
payment SUCCEEDED + order PAID + enrollment ACTIVE + progress được commit cùng
nhau. Request lặp/song song đúng amount trả order đã PAID, không nhân bản dữ liệu.
Sai amount/trạng thái/hold: 409; sai mentor hoặc role (kể cả ADMIN): 403.
PayOS tắt không ảnh hưởng CASH. CASH không tạo PayOS detail hoặc email outbox.

Audit hiện dùng payment `reference_code = cash:<mentorId>:<orderId>` cùng amount,
paidAt và order mentor snapshot; không cần sửa schema/migration đã deploy.
`GET /me/orders/:id` đọc được payment CASH đã xác nhận với checkoutUrl/qrCode null.
Preview sau khi thanh toán trả 403; FE chuyển sang endpoint full class.

## Backlog ngoài increment Phase 2 này

Phase 2 chỉ khởi tạo progress khi payment thành công. Chưa có API tự cập nhật
progress và chưa chốt cách tính từ attendance/homework để tránh FE tự chứng nhận
hoàn thành. Danh sách lớp riêng chưa thuộc endpoint set Phase 2 hiện hành; tạm
đọc `GET /me/orders?status=PAID` và details.classId cho luồng sau thanh toán.
Orders là lịch sử mua, không thay thế danh sách enrollment tổng quát.

| Phần | Contract dự kiến, chưa triển khai | Quy tắc cần chốt |
|---|---|---|
| Lớp đã đăng ký | `GET /me/classes` phân trang, enrollmentStatus, accessMode | ACTIVE/COMPLETED/pending CASH/PAYOS, history/cancelled và cách lọc |
| Progress | `GET /me/classes/:classId/progress`; write API sau khi chốt actor | Tiến độ tự báo hay mentor/system, unit locked, completion/certificate |
| Materials — Phase 3 | Mentor CRUD theo class/session; student list/download theo ACTIVE enrollment | Storage, loại/dung lượng file, quyền upload, signed URL, soft delete |
| Attendance — Phase 4 | Mentor ghi theo session/enrollment; student đọc attendance của mình | PRESENT/ABSENT/LATE/EXCUSED, buổi bù, sửa/audit, quyền CASH pending |

Đây là backlog đề xuất để FE tránh phụ thuộc vào route chưa có, không mở rộng
triển khai sang Phase 3/4. Chat/DM CASH pending tiếp tục ở phase chat.

Deploy/live PayOS vẫn chờ nghiệm thu riêng theo runbook Phase 2.2. Test local
với DB riêng và fake network provider không chứng minh giao dịch tiền thật.
