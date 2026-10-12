# Phase 1 — Account creation: password policy correction

Cập nhật2026-10-12. [API breakdown](PHASE_1_flow-api-breakdown.md).
Theo user, mọi role dùng cùng password **6–128 ký tự khi tạo tài khoản**.
Baseline bị lệch: public RegisterDto6–128 nhưng CreateUserDto cho admin12–128.
Đã sửa CreateUserDto validation + Swagger, FE schema/error text/form hint và
tài liệu active; report lịch sử12–128 mô tả baseline trước ngày này.

## Flow

- Người mới đăng ký Student → POST `/api/v1/auth/register` →202 → xác thực email
  theo flow cũ → login. Public registration không nhận role và không tạo Manager.
- Admin đã login → POST `/api/v1/admin/users` với role ADMIN/MANAGER/MENTOR/STUDENT
  →201 account ACTIVE → tài khoản mới login theo role. Password6–128 cho cả4role.
- FE validate6–128 trước gửi; backend validate và hash password, không trả hash
  hoặc password trong UserDto. Không thay endpoint/role/ownership/session flow.
- Login input vẫn1–128; đổi rule tạo account không tự đổi mật khẩu hay revoke
  session của tài khoản đã tạo.

## Kiểm chứng local

- Full BE `pnpm check`:298tests/27suites + lint/type-check/build pass trên workspace
  hiện hành (count bao gồm các thay đổi khác đang có).
- Full HTTP27/27tests pass; bốn role tạo/login với6 ký tự, tạo với128 hợp lệ;
  5/129 bị422. Manager6 ký tự vẫn không có quyền Admin/Student.
- FE full unit138tests/25suites (gồm schema regression5/5tests), type-check/build, module boundaries và targeted
  Biome các file đổi pass. Identity Chromium E2E1/1pass với tạo account6 ký tự
  và kiểm hint. Full FE lint có lỗi format CRLF ở nhiều file baseline chưa chỉnh;
  không coi full lint pass. UI chỉ đổi hint/error copy, không đổi layout; dùng
  behavioral E2E, không mở rộng visual QA cho lượt này.
- Chưa deploy/VPS. Runbook Manager/Files đã cập nhật6–128; cần release BE/FE mới
  để server áp dụng. Tiến độ tổng tại docs/progress/Progress.md.
