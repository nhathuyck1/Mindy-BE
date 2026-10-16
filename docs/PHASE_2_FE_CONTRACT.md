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

## Admin roster và student detail — 2026-10-13

Danh sách lớp và class detail đã có `GET /api/v1/admin/classes` và
`GET /api/v1/admin/classes/:classId`. Bổ sung hai API chỉ cho ADMIN:

- `GET /api/v1/admin/classes/:classId/students?page=1&pageSize=20`:
  `{items, page, pageSize, total}`; page ≥1, pageSize 1–100 (default 20).
  Items có studentId/studentName/email/phone/studentStatus,
  enrollmentId/enrollmentStatus/enrolledAt. Lấy studentId để mở detail.
- `GET /api/v1/admin/classes/:classId/students/:studentId`: cùng fields trên,
  thêm classId/orderDetailId/registeredAt/accountCreatedAt/lastLoginAt;
  kiểm tra enrollment còn hiệu lực của đúng cặp Class/Student.

Chỉ PENDING_PAYMENT/ACTIVE/COMPLETED, không trả CANCELLED; account SUSPENDED vẫn
đọc được. Chưa có học sinh trả page rỗng; detail ngoài lớp trả 404
CLASS_STUDENT_NOT_FOUND. Cookie auth, UUID path; timestamps ISO UTC, phone/enrolledAt/
lastLoginAt nullable. Không thay đổi payment/access hoặc trả password/token.
Implement/test HTTP local, chưa deploy. [Flow](api_flow/PHASE_2_3_FLOW.md) và
[API breakdown §5.3](api_flow/PHASE_2_3_flow-api-breakdown.md#53-admin-danh-sách-và-chi-tiết-học-sinh-theo-lớp).

## CASH

### Bổ sung quản trị giờ Session — 2026-10-12

ADMIN có `PATCH /api/v1/admin/classes/:classId/sessions/:sessionId` (một buổi)
và `PATCH /api/v1/admin/classes/:classId/sessions/bulk` (1–100 Session được chọn).
Body `{startTime, endTime}` dạng `HH:mm`, bulk thêm sessionIds; giữ ngày địa phương,
ghi lại timestamps. Response 200 ClassManagementDetailDto; kiểm trạng thái/trùng
lịch và rollback bulk nếu lỗi. Contract Student lịch bổ sung dayOfWeek/startTime/endTime.
Xem [contract 2.3](PHASE_2_3_FE_CONTRACT.md) và
[API breakdown](api_flow/PHASE_2_3_flow-api-breakdown.md#51-admin-sửa-giờ-một-buổi-và-bulk).

### Màn hình Manager: lớp → học viên → thu tiền (2026-10-16)

Thay người thu/xác nhận từ MENTOR sang MANAGER. Mọi manager active xem được mọi
lớp, không cần phân công. Mentor giữ roster read-only, canConfirmCash=false.

| API | Quyền / contract |
|---|---|
| GET /api/v1/manager/classes?page=1&pageSize=20&status=OPEN | MANAGER; tất cả lớp, status tùy chọn |
| GET /api/v1/manager/classes/:classId/students?paymentType=CASH&orderStatus=PENDING | MANAGER; roster học viên theo lớp, có phân trang và filter tùy chọn |
| GET /api/v1/manager/cash-orders?page=1&pageSize=20 | MANAGER; toàn bộ CASH orders/lịch sử |
| POST /api/v1/manager/cash-orders/:orderId/confirm | MANAGER; {receivedAmount} bằng orderTotalAmount; 200 OrderDto PAID |

Một order nhiều lớp phải thu đủ tổng một lần. Confirm commit payment SUCCEEDED,
order PAID, holds ACTIVE và progress nguyên tử; retry/concurrent từ manager khác
không tạo trùng. Sai method/amount/hold/deadline/lớp hủy trả409; sai role403.
Route mentor/cash-orders cũ bỏ (404). OrderDto.mentorId giữ snapshot checkout cho
tương thích Student, không dùng chỉ người thu. Audit mới cash-manager:<managerId>:<orderId>;
legacy cash:<mentorId>:<orderId> vẫn hợp lệ. Không thay schema/migrations.
Student checkout/preview/full access/PayOS giữ nguyên. Chi tiết fields, validation,
lỗi và UI/refetch: [API breakdown](api_flow/PHASE_2_3_flow-api-breakdown.md#thu-tiền-mặt-bởi-manager--2026-10-16).
Chưa deploy/VPS; kết quả local ghi tại Progress.md.

## Backlog ngoài increment Phase 2 này

Ngày 2026-10-09 Phase 2.3 đã implement local `GET /me/classes` và `GET /me/schedule`,
đồng thời bổ sung field additive cho detail/preview; xem
[contract FE Phase 2.3](./PHASE_2_3_FE_CONTRACT.md). Chưa deploy, nên trên môi trường
đang chạy vẫn dùng workaround Order PAID bên dưới cho tới khi release Phase 2.3.

Phase 2 chỉ khởi tạo progress khi payment thành công. Chưa có API tự cập nhật
progress và chưa chốt cách tính từ attendance/homework để tránh FE tự chứng nhận
hoàn thành. Danh sách lớp riêng chưa thuộc endpoint set Phase 2 hiện hành; tạm
đọc `GET /me/orders?status=PAID` và details.classId cho luồng sau thanh toán.
Orders là lịch sử mua, không thay thế danh sách enrollment tổng quát.

| Phần | Contract dự kiến, chưa triển khai | Quy tắc cần chốt |
|---|---|---|
| Lớp đã đăng ký | Đã chốt và implement local ở Phase 2.3 | Xem [contract Phase 2.3](./PHASE_2_3_FE_CONTRACT.md) |
| Progress | `GET /me/classes/:classId/progress`; write API sau khi chốt actor | Tiến độ tự báo hay mentor/system, unit locked, completion/certificate |
| Materials — Phase 3 | Mentor CRUD theo class/session; student list/download theo ACTIVE enrollment | Storage, loại/dung lượng file, quyền upload, signed URL, soft delete |
| Attendance — Phase 4 | Mentor ghi theo session/enrollment; student đọc attendance của mình | PRESENT/ABSENT/LATE/EXCUSED, buổi bù, sửa/audit, quyền CASH pending |

Đây là backlog đề xuất để FE tránh phụ thuộc vào route chưa có, không mở rộng
triển khai sang Phase 3/4. Chat/DM CASH pending tiếp tục ở phase chat.

Deploy/live PayOS vẫn chờ nghiệm thu riêng theo runbook Phase 2.2. Test local
với DB riêng và fake network provider không chứng minh giao dịch tiền thật.
