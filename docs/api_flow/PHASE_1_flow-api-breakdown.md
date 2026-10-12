# Phase 1 — Account creation API: password6–128

Cập nhật2026-10-12; đã code/local verified, chưa deploy. [Flow](PHASE_1_FLOW.md).
Sửa minimum managed creation12→6; public registration giữ6. Response/permissions
không đổi. FE/client qua same-origin `/api/v1` adapter hiện có.

## POST /api/v1/admin/users

Actor ADMIN, cookie access_token; FE `/management/users/new` sau login.
POST JSON `Content-Type: application/json`; FE adapter yêu cầu Origin cùng app.
Không gửi userId/owner/status/token; role mới là input được Admin phép chọn.

| Body field | Contract |
|---|---|
| email | Required email string, max320; service normalize trim/lowercase |
| password | Required string **6–128**, giống nhau cho mọi role; không trim |
| displayName | Required string1–150; service trim |
| role | Required ADMIN/MANAGER/MENTOR/STUDENT |
| phone | Optional string7–32; bỏ field nếu form rỗng |

```json
{"email":"manager@example.test","password":"123456","displayName":"Material Manager","role":"MANAGER"}
```

201 JSON trực tiếp UserDto:

```json
{"id":"11111111-1111-4111-8111-111111111111","email":"manager@example.test","phone":null,"displayName":"Material Manager","role":"MANAGER","status":"ACTIVE","lastLoginAt":null,"createdAt":"2026-10-12T12:00:00.000Z"}
```

FE dùng id mở detail, role/status hiển thị quyền/trạng thái; createdAt ISO UTC,
lastLoginAt nullable. Password/hash không trả ra. Account ACTIVE không cần verify
email trong managed flow. Endpoint không tự login account mới/không tạo session
cookie cho account đó. Controller chưa đặt Cache-Control riêng; FE proxy hiện
trả private,no-store cho dữ liệu cá nhân.

Side effect: tạo user với hashed password/role cho phép; unique email/phone.
Không idempotency key; retry mất response phải đọc/refetch danh sách trước gửi lại.
Concurrent duplicate bị unique constraint. Loading/disable-submit khi gửi,
success mở detail/refetch list; không polling. Error envelope
`{statusCode,code,message,details?,requestId?}`:

| Error | FE xử lý |
|---|---|
| 401 AUTHENTICATION_REQUIRED | Session recovery/login |
| 403 INSUFFICIENT_ROLE | Dừng, chỉ Admin được tạo |
| 422 HTTP_ERROR | Hiện validation; password5/129 hoặc field thừa invalid |
| 409 USER_EMAIL_ALREADY_EXISTS / USER_PHONE_ALREADY_EXISTS | Hiện lỗi field; refetch nếu recovery |

FE schema role chưa nhận MANAGER là gap riêng đã ghi ở audit3.4; lượt này chỉ
đồng bộ password cho schema/form, không thêm role navigation.

## POST /api/v1/auth/register

Public, không cookie bắt buộc; FE `/register`. POST JSON email/password/displayName
cùng bounds trên; phone optional7–32, **không role/status**. DisplayName phải có
ký tự khác whitespace theo RegisterDto.

```json
{"email":"student@example.test","password":"123456","displayName":"Student"}
```

202 `{message}` theo RegistrationAcceptedDto, không UserDto/session/access token.
Giữ Student pending email verification và mail flow hiện hữu, rồi verify/login;
không dùng route này tạo Manager. Password5/129 trả422 HTTP_ERROR; dữ liệu invalid
hiện ở form. Loading khi submit, success hướng dẫn kiểm tra email; không tự retry
POST vô hạn hoặc suy đã đăng nhập. Rule/side effects public không thay. Toàn
identity/session tiếp tục theo controller/docs hiện hành; không thêm API mới.
