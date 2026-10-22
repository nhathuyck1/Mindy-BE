# Admin tracking và gộp bảng — 22/10/2026

Phạm vi chỉ BE. Giữ riêng `file_metadata`, `file_objects` và các bảng nghiệp vụ.

## Lưu trữ sau migration 1792627200002

- Bốn bảng `teaching_mutation_receipts`, `attendance_mutation_receipts`,
  `makeup_mutation_receipts`, `teaching_note_receipts` lưu chung trong
  `mutation_receipts`. Namespace giữ nguyên phạm vi key cũ, tránh đụng key giữa
  module; hash, response và thời điểm cũ được giữ nguyên.
- Mười bảng audit cũ và lịch sử sửa Meet mới lưu trong `audit_events`:
  material, phân công, lifecycle, đổi lịch, điểm danh thường/học bù, xếp học bù,
  đơn nghỉ, ghi chú, lịch sử khóa chương cũ và link meeting.
- Tên bảng cũ trở thành **view đọc/ghi tương thích**, không có bản sao dữ liệu.
  Trong DBeaver xem hai bảng chung ở Tables; tên cũ nằm ở Views. Các service/API
  cũ tiếp tục ghi trong cùng transaction thông qua view.
- Giữ `attendance_recovery_audits` và `attendance_recovery_audit_items`: đây là
  chứng cứ khôi phục với khóa ngoại tổng hợp tới điểm danh và thanh toán, không
  chỉ là log hoạt động. Tracking đọc được cả phần này.
- Giữ ràng buộc bắt buộc, CHECK, UNIQUE và khóa ngoại của audit cũ. Các cột `ref_*`
  trong audit_events là projection được DB sinh để giữ khóa ngoại; không ghi tay.
- Audit/receipts chỉ thêm, không sửa/xóa. Không công khai receipt response qua API.
  Không bỏ lịch sử khóa chương cũ: dữ liệu được đưa vào kho audit chung.

## API, prefix /api/v1

Chỉ tài khoản ADMIN đang ACTIVE được đọc. Cookie auth; response private, no-store.

`GET /admin/tracking/events`

Query tùy chọn: `source`, `actorId`, `entityId`, `classId`, `sessionId`, `action`,
`from`, `to`, `page` (mặc định 1), `pageSize` (mặc định 20, tối đa 100).
`from`/`to` phải có timezone, khoảng [from,to); from phải nhỏ hơn to khi có cả hai.
Nguồn hợp lệ có trong enum Swagger. Sắp xếp thời gian mới nhất, rồi ID và source.

Ví dụ:

```text
GET /api/v1/admin/tracking/events?source=session_meeting_audits&page=1&pageSize=20
GET /api/v1/admin/tracking/events?actorId=<mentor UUID>&classId=<class UUID>
```

Response `{items,total,page,pageSize}`. Mỗi item có ID sự kiện, source, action,
actor (ID/tên hiện tại hoặc null nếu hệ thống), entityType/entityId, classId,
sessionId, version, reason, occurredAt. Danh sách không tải nội dung ghi chú.

`GET /admin/tracking/events/:source/:eventId`

Trả metadata như trên, thêm `data` chứa nguyên dữ liệu audit gốc và
`evidenceItems` khi là khôi phục điểm danh. Không có sự kiện trả 404; sai UUID
hoặc source ở path trả 400; sai query trả 422; chưa đăng nhập 401/sai quyền 403.

Phạm vi tracking là các sự kiện audit được BE ghi nhận, không phải nhật ký mọi
HTTP request hoặc toàn bộ CRUD tài khoản/thanh toán. Audit cũ chỉ lưu action/ID
thì không thể dựng lại trước/sau. Sửa link Meet từ bản này có link trước/sau;
lưu cùng giá trị hoặc transaction thất bại không thêm event.

Lọc class/session dùng liên kết sự kiện tới lớp/buổi. Audit đơn nghỉ nhiều lớp
được lọc theo leave_items; tài liệu dùng chung không tự nhân log cho từng lớp.

## Triển khai và rollback

Backup DB theo quy trình deploy, dừng các process ghi DB, build image mới rồi
chạy migration container. Migration khóa các bảng nguồn trong transaction trước
khi copy và chuyển sang view; dữ liệu seed hiện có không cần seed lại. Không sửa
migration cũ hoặc drop bảng thủ công trong DBeaver.

`down` tái tạo bảng, constraints/indexes/triggers cũ và copy lại dữ liệu từ hai
kho chung. Metadata schema dùng để rollback nằm trong COMMENT của view, không
xóa/sửa comment này. Nếu đã có lịch sử Meet, down giữ bảng session_meeting_audits
để không mất lịch sử mới. Chỉ bỏ bảng Meet khi trống. Rollback đã được kiểm tra
với dữ liệu thật trên DB test, không chỉ schema rỗng.

Chưa chạy migration trên DB dev/VPS. Chỉ các database test riêng đã được cập nhật.
