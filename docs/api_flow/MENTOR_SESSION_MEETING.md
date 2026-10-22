# Mentor sửa link meeting của buổi học

`PATCH /api/v1/mentor/class-sessions/:sessionId/meeting-url`

Cookie đăng nhập MENTOR và Origin nằm trong CORS_ORIGINS là bắt buộc.
Mentor phải đang hoạt động và là effective mentor của buổi: mentor chính nếu
không có phân công thay; mentor dạy thay nếu đã được phân công; với buổi đang
diễn ra dùng teaching_mentor_id đã ghi khi bắt đầu. Mentor chính không sửa thay
buổi đã giao cho mentor khác. Buổi SCHEDULED/IN_PROGRESS được sửa; lớp hoặc buổi
đã hủy/hoàn thành không được sửa.

Đọc `version` từ session context hoặc lịch mentor, rồi gửi:

```json
{
  "meetingUrl": "https://meet.google.com/abc-defg-hij",
  "expectedVersion": 1
}
```

Response 200:

```json
{
  "sessionId": "<session UUID>",
  "classId": "<class UUID>",
  "meetingUrl": "https://meet.google.com/abc-defg-hij",
  "effectiveMeetingUrl": "https://meet.google.com/abc-defg-hij",
  "version": 2
}
```

URL HTTP/HTTPS đầy đủ, tối đa 2048 ký tự, không kèm username/password. Trường
meetingUrl bắt buộc: null xóa link riêng và dùng lại link chung của lớp; chuỗi
rỗng không hợp lệ. effectiveMeetingUrl trả link thực tế sau fallback, có thể null.
Chỉ sửa link của buổi được chọn; không sửa link chung, lịch, thanh toán hoặc
phân công. Lưu cùng giá trị và đúng version không tăng version.

409 SESSION_VERSION_CONFLICT: đọc lại dữ liệu/version trước khi lưu, không tự
ghi đè. 409 SESSION_STATE_CONFLICT: buổi/lớp không còn cho phép sửa.
403: sai role, tài khoản không hoạt động, thiếu/sai Origin hoặc không được phân
công. 400/404: UUID không hợp lệ/không có buổi; 422: body không hợp lệ.

Endpoint được khai báo trong Swagger. Không cần migration vì dùng meeting_url
và version đã có. Phạm vi lần sửa này chỉ BE; các API cấu hình lớp của Admin
vẫn được giữ. Chưa deploy lên VPS.
