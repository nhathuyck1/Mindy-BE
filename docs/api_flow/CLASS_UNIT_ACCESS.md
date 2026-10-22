# Quyền truy cập chương — cập nhật 22/10/2026

Theo yêu cầu trực tiếp của user, bỏ khóa/mở/hẹn giờ từng chương. Tài liệu phase 3
cũ về Class Unit release được thay thế bởi quy tắc này.

- Học viên chờ xác nhận tiền mặt vẫn chỉ xem trước; không đọc nội dung hoặc lấy
  signed URL. Backend kiểm tra enrollment ACTIVE cho từng request.
- Khi đã xác nhận thanh toán và enrollment ACTIVE, học viên truy cập tài liệu
  đã được duyệt/công bố của lớp mà không cần mentor mở chương.
- Giữ kiểm tra role, tài khoản hoạt động, đúng lớp/chương/tài liệu, lớp không hủy,
  trạng thái duyệt/công bố, thời gian availableAt của tài liệu và file READY.
- Bỏ PATCH `/admin/classes/:classId/units/:unitId/release` và
  `/mentor/classes/:classId/units/:unitId/release`; route cũ trả 404 và không còn
  trong Swagger/Postman. Không thay bằng API mở khóa khác.

Migration `1792627200001` chuyển chương LOCKED thành OPEN, xóa unlock_at của tất
cả chương, đổi database default thành OPEN. Chương COMPLETED giữ trạng thái.
Giữ cột cũ và lịch sử audit để tương thích dữ liệu; policy không sử dụng chúng
để giới hạn quyền xem. Down migration chỉ khôi phục default LOCKED, không tái tạo
các khóa/lịch mở cũ hoặc tự khóa lại người đã thanh toán.

Khi triển khai: build và chạy migration bằng quy trình deploy hiện có. Lần sửa này
chỉ thay đổi BE; FE cần bỏ nút/modal và nhãn khóa chương trong lần cập nhật FE.
