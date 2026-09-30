# Phase 1 — Users, authentication và authorization baseline

## 1. Mục tiêu

Xây dựng identity prerequisite dùng chung cho các phase nghiệp vụ. Kết thúc phase này:

- Admin có thể tạo các tài khoản cần cho vận hành MVP.
- User đăng nhập bằng email/password.
- Access token và refresh token được gửi bằng cookie `HttpOnly`.
- Refresh token rotate an toàn theo từng thiết bị/session.
- Có thể logout một session hoặc toàn bộ session.
- Các module sau nhận được `userId`, `sessionId` và `role` đã xác thực.
- Có guard/decorator cho authentication, role và current user.

Không triển khai public self-registration, OAuth hoặc password reset trong phase này
trừ khi product requirement được bổ sung và review riêng.

## 2. Điều kiện bắt đầu

- Phase 0 đạt exit criteria.
- PostgreSQL development/test sẵn sàng.
- Migration workflow chạy được từ database rỗng.
- JWT RS256 key development/test đã được tạo và không commit raw key.
- Error response, request ID và test database đã có quy ước.

## 3. Quyết định schema và tài liệu nguồn

Có hai khác biệt trong tài liệu hiện tại cần chốt trước khi code:

1. Implementation plan chọn UUID v4, trong khi DBML cũ ghi UUID v7. Phase này dùng
   UUID v4 theo implementation plan; muốn đổi sang v7 phải có quyết định áp dụng
   đồng bộ toàn dự án.
2. DBML cũ có `refresh_tokens.user_id`, nhưng database review mới hơn bổ sung
   `auth_sessions` và token rotation chain. Phase này dùng schema session-based của
   database review.

Migration `identity-foundation` là nguồn sự thật sau khi được review.

## 4. Domain ownership

```text
UsersModule
  owns: users
  exports: user lookup/management provider cần thiết

AuthModule
  owns: auth_sessions, refresh_tokens
  exports: guards, decorators và authenticated-user contract
```

Auth không đọc HTTP cookie ở sâu trong Users service. Cookie/JWT parsing nằm ở auth
adapter/guard; module nghiệp vụ sau chỉ nhận principal đã xác thực.

## 5. Schema mục tiêu

### 5.1 Enum `user_role`

```text
ADMIN
MANAGER
MENTOR
STUDENT
```

### 5.2 Enum `user_status`

```text
ACTIVE
SUSPENDED
```

Không dùng role/status do client tự gửi ở endpoint thường. Chỉ endpoint quản trị có
quyền mới được chọn role hoặc thay đổi status.

### 5.3 Table `users`

| Column | Type | Rule |
|---|---|---|
| `id` | uuid | PK, UUID v4 do application tạo |
| `email` | varchar(320) | not null, unique trên normalized email |
| `phone` | varchar(32) | nullable, unique khi có giá trị |
| `password_hash` | varchar(255) | not null, không bao giờ trả ra API |
| `display_name` | varchar(150) | not null |
| `role` | user_role | not null |
| `status` | user_status | default `ACTIVE` |
| `last_login_at` | timestamptz | nullable |
| `created_at` | timestamptz | not null |
| `updated_at` | timestamptz | not null |

`avatar_file_id` tạm hoãn đến Phase 4 để migration Phase 1 không tạo FK tới bảng chưa
tồn tại. Có thể bổ sung cột nullable khi file module được triển khai.

Index:

- Unique normalized email.
- Unique phone khi phone khác null.
- `(role, status)` phục vụ admin lookup.

Email phải được trim và normalize nhất quán trước lookup/save. Migration phải chọn
chiến lược unique case-insensitive rõ ràng, ví dụ functional unique index trên
`lower(email)` hoặc extension/type PostgreSQL được team chấp thuận.

### 5.4 Table `auth_sessions`

| Column | Type | Rule |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK `users.id`, not null |
| `device_name` | varchar(150) | nullable, chỉ là metadata |
| `user_agent` | text | nullable, không dùng làm bằng chứng bảo mật |
| `ip_address` | inet | nullable |
| `last_seen_at` | timestamptz | nullable |
| `expires_at` | timestamptz | not null |
| `revoked_at` | timestamptz | nullable |
| `created_at` | timestamptz | not null |

Index:

- `(user_id, revoked_at)`.
- `(expires_at)` để cleanup session hết hạn.

Session active khi `revoked_at IS NULL` và `expires_at > now()`.

### 5.5 Table `refresh_tokens`

| Column | Type | Rule |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid | FK `auth_sessions.id`, not null |
| `token_hash` | char(64) | SHA-256 hex, unique; không lưu raw token |
| `parent_token_id` | uuid | nullable self FK |
| `replaced_by_token_id` | uuid | nullable self FK |
| `expires_at` | timestamptz | not null |
| `used_at` | timestamptz | nullable |
| `revoked_at` | timestamptz | nullable |
| `created_at` | timestamptz | not null |

Index:

- Unique `token_hash`.
- `(session_id, expires_at)`.
- `(session_id, revoked_at)`.

Foreign-key delete behavior phải được review. Mặc định ưu tiên giữ audit/session
history và revoke thay vì hard delete; không bật cascade rộng theo thói quen.

## 6. Token và cookie contract

### 6.1 Password

- Password hash dùng thuật toán password hashing memory-hard được review, ưu tiên
  Argon2id.
- Implementation hiện tại dùng Node.js built-in `crypto.scrypt` với salt ngẫu nhiên và
  tham số được encode trong hash để không thêm native dependency vào boilerplate.
  `PasswordService` là boundary duy nhất; có thể thay bằng Argon2id sau này mà không
  đổi schema/API.
- Parameter phải được benchmark trong môi trường deploy và có thể nâng cấp.
- Không log password hoặc password hash.
- Login response phải giống nhau cho email không tồn tại và mật khẩu sai.

### 6.2 Access token

- JWT ký bằng RS256 private key.
- API verify bằng public key.
- TTL mặc định 15 phút theo `.env.example`.
- Không lưu access token trong PostgreSQL.
- Claims tối thiểu: `sub`, `sid`, `role`, `iat`, `exp`.
- Không đặt email, password hoặc PII không cần thiết trong token.

### 6.3 Refresh token

- Random token đủ entropy, không phải JWT là mặc định của phase này.
- Browser giữ raw token trong cookie `HttpOnly`.
- Database chỉ giữ SHA-256 hash của random token.
- Mỗi lần refresh tạo token mới và đánh dấu token cũ đã dùng.
- Reuse token đã dùng làm session bị revoke.

### 6.4 Cookie

Access cookie:

```text
HttpOnly=true
Secure=COOKIE_SECURE
SameSite=Lax (mặc định khi frontend/API cùng site phù hợp)
Path=/
Max-Age=ACCESS_TOKEN_TTL_SECONDS
```

Refresh cookie:

```text
HttpOnly=true
Secure=COOKIE_SECURE
SameSite=Lax hoặc Strict theo deployment
Path=/api/v1/auth/refresh
Max-Age=REFRESH_TOKEN_TTL_SECONDS
```

Cookie path phải khớp route thực tế có global prefix/version. Nếu frontend và API
khác site và buộc dùng `SameSite=None`, phải bật `Secure` cùng CSRF protection đầy
đủ; không thay đổi chỉ để sửa CORS tạm thời.

## 7. API contract

### 7.1 Authentication

```text
POST /api/v1/auth/login       public
POST /api/v1/auth/refresh     public nhưng yêu cầu refresh cookie
POST /api/v1/auth/logout      authenticated/session-aware
POST /api/v1/auth/logout-all  authenticated
GET  /api/v1/auth/me          authenticated
```

Status đề xuất:

- Login/refresh thành công: `200 OK` và set cookies.
- Logout/logout-all thành công: `204 No Content` và clear cookies phù hợp.
- Sai credential/token: `401 Unauthorized`.
- Account suspended: public response không tiết lộ thông tin thừa; behavior được
  test và document.

### 7.2 User administration cần cho các phase sau

```text
POST  /api/v1/admin/users
GET   /api/v1/admin/users
GET   /api/v1/admin/users/:userId
PATCH /api/v1/admin/users/:userId/status
```

Required scope:

- Chỉ `ADMIN` hoặc policy quản trị được duyệt mới tạo user.
- List có pagination, filter role/status và stable sort.
- Không có public registration trong Phase 1.
- Không bao giờ trả `password_hash`.
- Không cho client tự nâng role qua endpoint profile/status.

Nếu product chưa cần UI user management ngay, vẫn phải có seed/bootstrap command an
toàn để tạo initial admin, mentor và student phục vụ Phase 2/3 testing.

## 8. Cấu trúc module đề xuất

```text
src/modules/users/
├── dtos/
│   ├── create-user.dto.ts
│   ├── update-user-status.dto.ts
│   ├── user.dto.ts
│   └── user-page-options.dto.ts
├── exceptions/
├── users.controller.ts
├── users.service.ts
├── users.module.ts
└── user.entity.ts

src/modules/auth/
├── decorators/
│   ├── current-user.decorator.ts
│   └── roles.decorator.ts
├── dtos/
│   ├── login.dto.ts
│   └── authenticated-user.dto.ts
├── exceptions/
├── guards/
│   ├── access-token.guard.ts
│   └── roles.guard.ts
├── services/
│   ├── auth.service.ts
│   ├── password.service.ts
│   ├── token.service.ts
│   └── session.service.ts
├── auth-session.entity.ts
├── refresh-token.entity.ts
├── auth.controller.ts
└── auth.module.ts
```

Chỉ tách service khi có trách nhiệm thật. Nếu một service chỉ chuyển tiếp một lệnh,
gộp lại. Phase này có thể dùng focused application services, chưa cần thêm CQRS chỉ
để có tên command/handler.

## 9. Luồng xử lý chi tiết

### 9.1 Tạo user

```text
Admin request
  -> AccessTokenGuard
  -> RolesGuard
  -> CreateUserDto validation
  -> UsersController
  -> UsersService
       -> normalize email
       -> kiểm tra duplicate thân thiện
       -> hash password
       -> tạo ACTIVE user với role được phép
  -> UserRepository.save
  -> map UserEntity thành UserDto
  -> 201 Created
```

Unique constraint trong PostgreSQL là phòng tuyến cuối cho hai request đồng thời.
Driver error phải được map thành domain conflict, không trả raw constraint message.

### 9.2 Login

```text
POST /auth/login
  -> LoginDto validation
  -> AuthController
  -> AuthService.login
       -> UsersService.findAuthenticationIdentity(normalizedEmail)
       -> verify password (response generic nếu sai)
       -> reject non-active user theo policy
       -> transaction:
            create auth_session
            create refresh_token hash
            update last_login_at
       -> sign short-lived access JWT
  -> set access + refresh cookies
  -> return safe current-user DTO
```

Raw refresh token chỉ tồn tại đủ lâu để set cookie và không xuất hiện trong log.

### 9.3 Authenticate request

```text
Cookie access_token
  -> AccessTokenGuard
       -> verify RS256 signature/exp
       -> validate sub/sid/role shape
       -> optionally enforce required session/account state policy
       -> attach AuthenticatedUser principal
  -> RolesGuard nếu endpoint yêu cầu role
  -> Controller nhận principal qua @CurrentUser()
```

Module nghiệp vụ nhận ID/role, không nhận Express `Request` hoặc tự parse cookie.

### 9.4 Refresh rotation

Refresh là multi-write use case và phải dùng transaction:

```text
POST /auth/refresh
  -> hash raw refresh cookie
  -> BEGIN
       lock token row
       load + lock session khi cần
       reject/revoke nếu session expired/revoked
       nếu token.used_at khác null:
           revoke toàn session (reuse detection)
           commit security state
           trả 401 và clear cookies
       reject nếu token expired/revoked
       create new random token + hash
       old.used_at = now
       old.replaced_by_token_id = new.id
       new.parent_token_id = old.id
       session.last_seen_at = now
     COMMIT
  -> sign access JWT mới
  -> replace both cookies
```

Hai refresh request đồng thời phải được serialize bằng row lock/constraint để chỉ một
request thành công; request còn lại phải kích hoạt policy reuse hoặc conflict đã chốt,
không được phát hành hai token con hợp lệ.

### 9.5 Logout current session

```text
POST /auth/logout
  -> identify authenticated session
  -> transaction:
       session.revoked_at = now
       revoke active refresh tokens của session
  -> clear access + refresh cookies
  -> 204
```

Logout nên idempotent: gọi lại không tạo lỗi nội bộ hoặc làm session active trở lại.

### 9.6 Logout all sessions

```text
POST /auth/logout-all
  -> current user
  -> transaction:
       revoke mọi active auth_sessions của user
       revoke refresh tokens liên quan
  -> clear current cookies
  -> 204
```

### 9.7 `/auth/me`

- Trả dữ liệu user mới nhất từ database, không chỉ echo claims cũ.
- Không trả entity trực tiếp.
- User suspended/revoked phải tuân theo session validation policy đã chọn.

## 10. Authentication và authorization primitives

Phase 1 phải cung cấp:

- `AuthenticatedUser` interface: `userId`, `sessionId`, `role`.
- `@CurrentUser()` decorator.
- `@Roles(...roles)` metadata decorator.
- Access-token authentication guard.
- Roles guard.
- Cách đánh dấu public endpoint tường minh nếu dùng global auth guard.

Role guard chỉ kiểm tra coarse-grained role. Ownership/resource authorization ở các
phase sau vẫn nằm trong application use case.

## 11. Security requirements

- Rate limit login/refresh bằng shared store trước khi scale nhiều replicas; nếu
  Phase 1 mới chạy một replica, phải document giới hạn tạm thời và task nâng cấp.
- So sánh password bằng API an toàn của thư viện hashing.
- Refresh token random dùng cryptographic RNG.
- JWT algorithm bị pin là RS256; không tin `alg` tùy ý từ header.
- Validate issuer/audience nếu deployment contract sử dụng chúng.
- Origin/CSRF policy cho cookie-authenticated mutation phải được test.
- CORS chỉ cho origins cấu hình, bật credentials.
- Không log cookie, JWT, refresh token, password hoặc token hash.
- Public login error không hỗ trợ account enumeration.
- Suspended user không được tạo session mới.
- Revoke/expiry dùng server time nhất quán và test boundary.

## 12. Exception contract

Các lỗi domain tối thiểu:

```text
InvalidCredentialsException        -> 401
InvalidRefreshTokenException       -> 401
AuthenticationSessionRevoked       -> 401
AuthenticationSessionExpired       -> 401
UserNotFoundException              -> 404 cho admin/resource lookup
UserEmailAlreadyExistsException    -> 409
UserPhoneAlreadyExistsException    -> 409
UserForbiddenException             -> 403
```

Login không được dùng `UserNotFoundException` public; cả user không tồn tại và
password sai đều map về cùng `InvalidCredentialsException` response.

## 13. Migration `identity-foundation`

Migration thực hiện theo thứ tự:

1. Tạo `user_role` và `user_status` enum.
2. Tạo `users` cùng unique/check/index cần thiết.
3. Tạo `auth_sessions` và FK tới `users`.
4. Tạo `refresh_tokens`, self-FK và FK tới `auth_sessions`.
5. Tạo index phục vụ lookup, revoke và cleanup.

Review checklist:

- Email uniqueness thực sự case-insensitive theo quyết định.
- `token_hash` đúng `char(64)` nếu lưu SHA-256 hex.
- `timestamptz` được dùng cho expiry/revocation.
- FK delete behavior được ghi rõ.
- Enum/drop order trong `down` hợp lệ.
- `down` không drop type trước table đang sử dụng.
- Migration chạy/revert/chạy lại được trên test database.

## 14. Testing plan

### 14.1 Unit tests

- Email normalization.
- Password hash/verify adapter.
- JWT claims/sign/verify.
- Cookie option builder cho development và production.
- Role guard.
- Token expiry boundary.

### 14.2 Integration tests

- Unique email khác casing.
- Unique phone khi có giá trị.
- Session/token foreign keys.
- Token hash unique.
- Login transaction rollback khi tạo token lỗi.
- Refresh rotation commit đúng chain.
- Concurrent refresh chỉ có một kết quả hợp lệ theo policy.
- Reuse detection revoke session.
- Logout/logout-all revoke đúng scope.
- Migration up/down/up.

### 14.3 E2E tests

- Admin tạo user và response không chứa password hash.
- Login thành công set đúng hai cookie.
- Sai email và sai password trả response không phân biệt.
- Suspended user không login được.
- Access cookie gọi `/auth/me` thành công.
- Không có token trả `401`.
- Sai role trả `403`.
- Refresh trả token/cookie mới và token cũ không dùng lại được.
- Logout current session không ảnh hưởng session khác.
- Logout-all làm mọi session mất hiệu lực theo policy.
- Cookie production có `Secure`, `HttpOnly`, đúng `SameSite` và `Path`.
- Payload có field lạ bị `422`.

## 15. Swagger contract

Mỗi endpoint document:

- Request DTO và giới hạn field.
- Success status/response DTO.
- Cookie authentication requirement.
- Các lỗi `401`, `403`, `409`, `422` dự kiến.
- Không đưa password hash/token schema nội bộ vào response model.
- Refresh token nằm trong cookie, không yêu cầu body chứa token.

## 16. Thứ tự triển khai đề xuất

1. Chốt schema/normalization/cookie/rotation decisions.
2. Tạo entities và migration `identity-foundation`.
3. Viết repository integration tests cho constraint.
4. Implement UsersModule và controlled user creation.
5. Implement password/token/session services.
6. Implement login và `/auth/me`.
7. Implement access guard, current-user và roles decorators.
8. Implement refresh rotation và reuse detection.
9. Implement logout/logout-all.
10. Thêm rate-limit/CSRF policy theo deployment.
11. Hoàn thiện E2E, Swagger, seed và operational cleanup plan.
12. Chạy full quality gate và deploy staging.

## 17. Phân công hai người

### Người A — Users và persistence

- User entity, enums và migration owner.
- UsersModule, admin create/list/detail/status use cases.
- Email normalization, password adapter và user integration tests.
- Development/test seed.

### Người B — Auth và HTTP security

- AuthSession/RefreshToken entity review.
- Token/session services.
- Login/refresh/logout controllers và cookie handling.
- Guards, decorators, rate limit/CSRF baseline và E2E tests.

Điểm phối hợp:

- Chốt `AuthenticatedUser` contract trước khi code song song.
- Người A là migration owner; Người B review auth indexes/FKs.
- Refresh transaction do một người implement end-to-end, người còn lại viết/review
  concurrency tests.
- Cả hai không sửa cùng migration đã merge; thay đổi mới tạo migration mới.

## 18. Operational tasks

- Seed initial admin cho development/test; production bootstrap phải dùng secret và
  quy trình một lần, không hard-code password.
- Có job/command cleanup refresh token/session hết hạn; chưa cần chạy realtime nhưng
  phải có retention decision.
- Có cách revoke toàn bộ session khi JWT key/security incident xảy ra.
- JWT key rotation chưa cần tự động nhưng phải document key ownership và rollback.

## 19. Exit criteria

- [ ] Migration `identity-foundation` được review và chạy từ database rỗng.
- [ ] `users`, `auth_sessions`, `refresh_tokens` khớp schema đã chốt.
- [ ] Không còn mâu thuẫn UUID/token schema trong code thực thi.
- [ ] Admin tạo/list/read/suspend user theo đúng quyền.
- [ ] Login, refresh, logout và logout-all chạy qua cookie `HttpOnly`.
- [ ] Refresh rotation và reuse detection có integration test.
- [ ] Guards/decorators cung cấp principal chuẩn cho module sau.
- [ ] Role và ownership được phân biệt rõ.
- [ ] API không trả entity, password hash hoặc raw token.
- [ ] Swagger mô tả cookie auth và expected errors.
- [ ] Unit, integration và E2E tests bắt buộc pass.
- [ ] `pnpm check` pass.
- [ ] Staging smoke test trên PostgreSQL deploy thành công.
- [ ] `docs/Progress.md` được cập nhật.

## 20. Ngoài scope

- Public registration và email verification.
- Forgot/reset password.
- Google/GitHub OAuth và `user_identities`.
- MFA.
- Fine-grained permission engine.
- Avatar/file upload.
- Catalog, class, cart, payment và enrollment.
