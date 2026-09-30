# Phase 1 — Registration, users, authentication và authorization baseline

## 1. Mục tiêu

Xây dựng identity prerequisite dùng chung cho các phase nghiệp vụ. Kết thúc phase này:

- Admin có thể tạo các tài khoản cần cho vận hành MVP.
- User có thể tự đăng ký bằng email/password, hoàn thiện thông tin cá nhân và xác minh
  email trước khi tài khoản được kích hoạt.
- User đăng nhập bằng email/password.
- User có thể đăng ký/đăng nhập bằng Google OIDC. Nếu là user mới, hệ thống prefill dữ
  liệu Google có sẵn rồi bắt buộc hoàn tất cùng bộ thông tin cá nhân như form đăng ký
  thường trước khi tạo tài khoản.
- Access token và refresh token được gửi bằng cookie `HttpOnly`.
- Refresh token rotate an toàn theo từng thiết bị/session.
- Có thể logout một session hoặc toàn bộ session.
- Các module sau nhận được `userId`, `sessionId` và `role` đã xác thực.
- Có guard/decorator cho authentication, role và current user.

Phase 1 có hai entry flow nhưng hội tụ về cùng user/profile contract:

1. Email/password: nhập đầy đủ thông tin, tạo account chờ xác minh, verify email rồi
   mới chuyển `ACTIVE`.
2. Google: Google xác minh email, backend tạo registration intent ngắn hạn, frontend mở
   cùng trang đăng ký với email khóa và các field có thể lấy từ Google được prefill;
   user xác nhận/chỉnh thông tin còn thiếu rồi mới tạo account `ACTIVE`.

Public registration luôn tạo role `STUDENT`; client không được gửi/chọn role. Password
reset và OAuth provider khác vẫn ngoài scope.

## 2. Điều kiện bắt đầu

- Phase 0 đạt exit criteria.
- PostgreSQL development/test sẵn sàng.
- Migration workflow chạy được từ database rỗng.
- JWT RS256 key development/test đã được tạo và không commit raw key.
- Google OAuth client cho từng môi trường đã được tạo với redirect URI chính xác;
  client secret nằm ngoài repository.
- Email delivery adapter hoặc local mail sink sẵn sàng cho verification email; raw
  verification token không được log.
- Error response, request ID và test database đã có quy ước.

## 3. Quyết định schema và tài liệu nguồn

Có các khác biệt và quyết định cần chốt trước khi code:

1. Implementation plan chọn UUID v4, trong khi DBML cũ ghi UUID v7. Phase này dùng
   UUID v4 theo implementation plan; muốn đổi sang v7 phải có quyết định áp dụng
   đồng bộ toàn dự án.
2. DBML cũ có `refresh_tokens.user_id`, nhưng database review mới hơn bổ sung
   `auth_sessions` và token rotation chain. Phase này dùng schema session-based của
   database review.
3. Google identity dùng claim OIDC `sub` làm định danh ổn định. Email verified dùng để
   resolve account hiện hữu hoặc khởi tạo registration intent; sau khi link, không dùng
   email làm khóa provider cho các lần đăng nhập sau.
4. OAuth callback chưa được xem là đăng ký hoàn tất. User mới chỉ được tạo sau khi
   submit form hoàn thiện hồ sơ bằng onboarding credential một lần, ngắn hạn.
5. Không sửa migration `identity-foundation` đã chạy. Registration và Google Login
   được bổ sung bằng migration mới `registration-and-google-identity`.

Các migration đã review là nguồn sự thật thực thi; không sửa migration cũ đã deploy.

## 4. Domain ownership

```text
UsersModule
  owns: users
  exports: user lookup/management provider cần thiết

AuthModule
  owns: user_identities, registration_intents, email_verification_tokens,
        auth_sessions, refresh_tokens
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
PENDING_VERIFICATION
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
| `password_hash` | varchar(255) | nullable cho account Google-only; không bao giờ trả ra API |
| `display_name` | varchar(150) | not null |
| `role` | user_role | not null |
| `status` | user_status | self-register mặc định `PENDING_VERIFICATION`; admin/Google-complete theo policy |
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

Account Google-only có `password_hash = NULL`; không tạo password giả/ngẫu nhiên.
Account `PENDING_VERIFICATION` không được login, refresh hoặc truy cập nghiệp vụ.

### 5.4 Table `user_identities`

| Column | Type | Rule |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK `users.id`, not null |
| `provider` | varchar(32) | not null; Phase 1 chỉ chấp nhận `GOOGLE` |
| `provider_subject` | varchar(255) | not null; Google OIDC `sub` |
| `email_at_link` | varchar(320) | not null, audit metadata |
| `email_verified` | boolean | not null; phải là `true` khi link |
| `created_at` | timestamptz | not null |
| `last_login_at` | timestamptz | nullable |

Constraint/index:

- Unique `(provider, provider_subject)` để một Google identity không thuộc hai user.
- Unique `(user_id, provider)` để Phase 1 chỉ link một Google identity/provider/user.
- Index `user_id` phục vụ lookup và quản trị.

Không lưu Google authorization code, access token, refresh token hoặc raw ID token.
Ứng dụng chỉ cần xác thực danh tính; nếu sau này cần Google API scope thì phải có thiết
kế consent, encryption, revoke và retention riêng.

### 5.5 Table `registration_intents`

Giữ trạng thái onboarding Google trước khi user hoàn tất form; không phải session đăng
nhập và không cấp quyền truy cập API nghiệp vụ.

| Column | Type | Rule |
|---|---|---|
| `id` | uuid | PK |
| `provider` | varchar(32) | Phase 1 là `GOOGLE` |
| `provider_subject` | varchar(255) | Google `sub`, not null |
| `verified_email` | varchar(320) | normalized, not null |
| `display_name_hint` | varchar(150) | nullable, prefill từ `name` |
| `avatar_url_hint` | text | nullable, chỉ dùng preview; không tự lưu làm avatar nội bộ |
| `token_hash` | char(64) | hash onboarding token, unique; không lưu raw token |
| `return_to` | varchar(500) | relative path đã allowlist |
| `expires_at` | timestamptz | TTL ngắn, đề xuất 15 phút |
| `consumed_at` | timestamptz | nullable, one-time consumption |
| `created_at` | timestamptz | not null |

Không nhận các hint này từ frontend. Chúng chỉ được tạo từ ID token đã verify. Callback
lặp lại phải vô hiệu intent cũ chưa consume của cùng `(provider, provider_subject)` hoặc
serialize bằng transaction để không có hai onboarding credential cùng hiệu lực.

### 5.6 Table `email_verification_tokens`

| Column | Type | Rule |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK `users.id`, not null |
| `token_hash` | char(64) | SHA-256 hex, unique; không lưu raw token |
| `expires_at` | timestamptz | not null |
| `used_at` | timestamptz | nullable |
| `created_at` | timestamptz | not null |

Resend có thể tạo token mới nhưng không vô hiệu token hợp lệ trước đó chỉ vì một request
public, tránh attacker spam làm hỏng link của user. Verify thành công dùng transaction +
row lock, activate user và mark used mọi verification token còn lại của user.

### 5.7 Table `auth_sessions`

| Column | Type | Rule |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK `users.id`, not null |
| `identity_id` | uuid | nullable FK `user_identities.id`; null khi password login |
| `authentication_method` | varchar(32) | `PASSWORD` hoặc `GOOGLE` |
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

### 5.8 Table `refresh_tokens`

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

### 6.5 Google OIDC transient state

- Dùng Authorization Code flow; backend đổi `code` với Google qua server-to-server.
- Bật PKCE (`S256`) dù backend là confidential client để giảm rủi ro code interception.
- Sinh `state`, `nonce` và `code_verifier` bằng cryptographic RNG cho mỗi lần bắt đầu.
- Lưu transient state trong cookie `HttpOnly`, `Secure` ở production, `SameSite=Lax`,
  TTL tối đa 10 phút; có thể chuyển sang shared store khi chạy nhiều replica.
- Callback phải so khớp và consume state đúng một lần, validate nonce trong ID token,
  rồi xóa toàn bộ transient cookie kể cả khi thất bại.
- Không đưa access/refresh token nội bộ hoặc Google token vào query string/redirect URL.

Google user mới nhận thêm cookie onboarding opaque, `HttpOnly`, one-time và TTL ngắn.
Cookie này chỉ có quyền đọc registration context và complete registration, không phải
access token. Database chỉ lưu hash trong `registration_intents`.

### 6.6 Email verification token

- Token opaque sinh bằng cryptographic RNG, raw token chỉ xuất hiện trong email link.
- Database chỉ lưu SHA-256 hash; TTL đề xuất 30 phút và dùng một lần.
- Email link mở frontend verification page; frontend gửi token bằng request body tới
  API, tránh token trong API query log.
- Register/resend trả response tổng quát để không tiết lộ email đã tồn tại.

## 7. API contract

### 7.1 Authentication

```text
POST /api/v1/auth/register              public, email/password registration
POST /api/v1/auth/email/verify          public, consume verification token
POST /api/v1/auth/email/resend          public, generic response
POST /api/v1/auth/login       public
GET  /api/v1/auth/google      public, bắt đầu Google Authorization Code flow
GET  /api/v1/auth/google/callback public, callback đã đăng ký với Google
GET  /api/v1/auth/registration-context  onboarding cookie only
POST /api/v1/auth/google/complete-registration onboarding cookie only
POST /api/v1/auth/refresh     public nhưng yêu cầu refresh cookie
POST /api/v1/auth/logout      authenticated/session-aware
POST /api/v1/auth/logout-all  authenticated
GET  /api/v1/auth/me          authenticated
```

Status đề xuất:

- Email/password register: `202 Accepted` sau khi tạo/resend verification; response
  giống nhau cho email mới và email đã tồn tại.
- Verify email thành công: `200 OK`, activate account, tạo session và set cookies;
  token hết hạn/đã dùng trả lỗi tổng quát.
- Password login/refresh thành công: `200 OK` và set cookies.
- `GET /auth/google`: `302 Found` tới Google authorization endpoint.
- Google callback với identity đã tồn tại: set access/refresh cookies rồi `302 Found`
  về frontend path nằm trong allowlist.
- Google callback của user mới: set onboarding cookie rồi `302 Found` tới trang hoàn
  thiện đăng ký; chưa tạo auth session.
- `GET /registration-context`: trả verified email read-only và các field prefill an
  toàn (`displayName`, avatar preview nếu có), không trả `sub` hoặc provider token.
- Complete Google registration: `201 Created`, consume intent, tạo `STUDENT` + Google
  identity + session, set cookies và trả safe current-user DTO.
- Google callback thất bại: xóa transient state và redirect về một error path cố định
  với error code tổng quát; không phản chiếu raw error/provider payload.
- Logout/logout-all thành công: `204 No Content` và clear cookies phù hợp.
- Sai credential/token: `401 Unauthorized`.
- Account suspended: public response không tiết lộ thông tin thừa; behavior được
  test và document.

### 7.2 Contract của form đăng ký dùng chung

| Field | Email/password | Google user mới |
|---|---|---|
| `email` | user nhập, normalize, phải verify | prefill từ verified claim, read-only |
| `password` | bắt buộc theo password policy | không hiển thị/không gửi; `password_hash=NULL` |
| `displayName` | bắt buộc | prefill từ Google `name` nếu có, user được sửa |
| `phone` | optional theo validation chung | Google OIDC scope chuẩn không cấp phone; để trống cho user nhập |
| avatar | chưa thuộc Phase 1 | có thể preview `picture`, không persist trước Phase 4 |
| `role` / `status` | không có trong public DTO | không có trong public DTO |

Frontend có thể dùng cùng component/form schema cho phần profile, nhưng payload API là
hai DTO riêng để password/email read-only không bị client Google gửi ngược lên. Backend
luôn lấy email/sub của Google từ registration intent, không lấy từ complete body.

### 7.3 User administration cần cho các phase sau

```text
POST  /api/v1/admin/users
GET   /api/v1/admin/users
GET   /api/v1/admin/users/:userId
PATCH /api/v1/admin/users/:userId/status
```

Required scope:

- Chỉ `ADMIN` hoặc policy quản trị được duyệt mới tạo user.
- Admin có thể tạo account Google-only với `password` bị bỏ trống; API phải thể hiện
  rõ login methods, nhưng không trả identity subject hoặc provider token.
- List có pagination, filter role/status và stable sort.
- Public registration chỉ tạo `STUDENT`; admin endpoint vẫn là đường duy nhất tạo
  `ADMIN`, `MANAGER` hoặc `MENTOR`.
- Nếu admin provision email đang có account `PENDING_VERIFICATION`, phải dùng explicit
  admin claim flow, thay credential/profile bằng dữ liệu admin cung cấp và ghi audit;
  không giữ password chưa verify từ public registration.
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
│   ├── register.dto.ts
│   ├── verify-email.dto.ts
│   ├── resend-verification.dto.ts
│   ├── google-login-query.dto.ts
│   ├── complete-google-registration.dto.ts
│   ├── registration-context.dto.ts
│   └── authenticated-user.dto.ts
├── exceptions/
├── guards/
│   ├── access-token.guard.ts
│   └── roles.guard.ts
├── services/
│   ├── auth.service.ts
│   ├── registration.service.ts
│   ├── email-verification.service.ts
│   ├── google-oidc.service.ts
│   ├── password.service.ts
│   ├── token.service.ts
│   └── session.service.ts
├── auth-session.entity.ts
├── user-identity.entity.ts
├── registration-intent.entity.ts
├── email-verification-token.entity.ts
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

### 9.2 Đăng ký bằng email/password

```text
POST /auth/register
  -> RegisterDto: email, password, displayName, phone?; không có role/status
  -> normalize email/phone, validate password/profile
  -> nếu email chưa tồn tại:
       hash password
       transaction:
         create user(role=STUDENT, status=PENDING_VERIFICATION)
         create email_verification_token hash + expiry
       after commit: gửi verification email
  -> nếu account PENDING_VERIFICATION hợp lệ:
       register lặp lại không mutate account; explicit resend chịu cooldown/rate limit
  -> nếu email đã ACTIVE/SUSPENDED:
       không thay đổi credential/account
  -> luôn trả 202 response tổng quát

POST /auth/email/verify
  -> hash raw token từ body
  -> transaction + row lock:
       require token chưa dùng/chưa hết hạn
       require user đang PENDING_VERIFICATION
       mark token used, revoke token khác của user
       set user.status=ACTIVE
       create PASSWORD auth_session + refresh_token
  -> sign access token
  -> set access + refresh cookies
  -> return safe current-user DTO
```

Nếu gửi email thất bại sau commit, account vẫn ở `PENDING_VERIFICATION` và user có thể
dùng resend. Không giữ transaction database trong lúc gọi email provider.

Form đăng ký thường gồm `email`, `password`, `displayName`, `phone?`. Role luôn là
`STUDENT`. Nếu sau này bổ sung field hồ sơ, cả `RegisterDto` và Google complete DTO phải
dùng chung validation/value object để hai nhánh không drift.

### 9.3 Login

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

### 9.4 Google Login, registration onboarding và account linking

Luồng web-first, backend làm OIDC relying party:

```text
GET /auth/google?returnTo=/dashboard
  -> validate returnTo theo allowlist path nội bộ; không nhận arbitrary absolute URL
  -> generate state + nonce + PKCE verifier/challenge
  -> lưu transient state ngắn hạn trong HttpOnly cookie/shared store
  -> 302 tới Google authorization endpoint với scope "openid email profile"

GET /auth/google/callback?code=...&state=...
  -> require và consume transient state đúng một lần
  -> đổi authorization code bằng PKCE verifier qua Google token endpoint
  -> verify ID token signature qua Google JWKS
  -> validate iss, aud, exp, iat, nonce và sub
  -> require email_verified=true và normalize email
  -> tìm user_identity bằng (GOOGLE, sub)
  -> nếu identity đã link:
       reject user không ACTIVE
       transaction tạo GOOGLE session + refresh token, update last_login_at
       set access + refresh cookies
       clear transient cookie
       302 về frontend success path
  -> nếu identity chưa link nhưng normalized verified email thuộc user ACTIVE:
       transaction link identity với user hiện hữu + tạo session
       set cookies, 302 success (không tạo account trùng)
  -> nếu email thuộc user PENDING_VERIFICATION:
       tạo registration_intent từ Google claims; Google verified email có thể thay thế
       bước email verification nhưng vẫn phải complete form
       set onboarding cookie; 302 tới trang đăng ký hoàn tất
  -> nếu chưa có user:
       tạo registration_intent từ sub/email/name/picture đã verify
       set onboarding cookie; 302 tới trang đăng ký hoàn tất

GET /auth/registration-context
  -> hash onboarding cookie và load intent chưa dùng/chưa hết hạn
  -> return email read-only + displayName/avatar prefill an toàn

POST /auth/google/complete-registration
  -> validate cùng profile rules với đăng ký thường; không nhận email/role/status/sub
  -> hash onboarding cookie, lock intent, recheck uniqueness
  -> transaction:
       nếu user PENDING_VERIFICATION cùng email:
         update profile đã xác nhận, clear password_hash chưa được email-verify,
         set ACTIVE và consume email verification tokens
       nếu chưa có user:
         create user(email verified, password_hash=NULL, role=STUDENT, ACTIVE)
       create user_identity(GOOGLE, sub)
       mark registration_intent consumed
       create GOOGLE auth_session + refresh_token
       update last_login_at
     commit
  -> sign access JWT, set access + refresh cookies
  -> clear onboarding/transient cookies
  -> return safe current-user DTO
```

Account-linking policy:

- Google user mới chỉ được tạo sau khi complete form; callback đơn lẻ không tạo user.
- Email Google đã verify được prefill và khóa trên form. `name` có thể prefill
  `displayName` nhưng user được phép sửa trước khi submit; `picture` chỉ là preview vì
  avatar/file ownership được triển khai ở Phase 4.
- Không server-fetch `picture` trong Phase 1. Nếu frontend render preview, chỉ cho HTTPS
  provider URL đã allowlist và có fallback; không coi URL này là avatar nội bộ tin cậy.
- Không dùng role/status từ Google; public Google registration luôn là `STUDENT`.
- Sau khi link, lookup luôn bằng `(provider, provider_subject)`. Google thay đổi email
  không chuyển identity sang user khác.
- Nếu verified email đã link với một Google `sub` khác hoặc `sub` thuộc user khác,
  reject và ghi security audit; không tự merge.
- Nếu user bắt đầu đăng ký email/password rồi chọn Google cùng verified email, complete
  Google registration kích hoạt cùng user pending thay vì tạo duplicate, nhưng phải
  xóa password hash chưa được email-verify. Nếu giữ password pending, attacker có thể
  pre-register email nạn nhân rồi đăng nhập sau khi nạn nhân kích hoạt bằng Google.
  User Google-only chỉ được thêm password qua authenticated set-password flow được
  thiết kế riêng sau này.
- Không cung cấp endpoint link/unlink khi user đang đăng nhập trong bước đầu. Nếu bổ
  sung sau, thao tác phải yêu cầu recent authentication và không được bỏ credential
  cuối cùng của account.
- `returnTo` chỉ là relative path đã allowlist; tuyệt đối không redirect theo URL client
  tùy ý để tránh open redirect.

### 9.5 Authenticate request

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

### 9.6 Refresh rotation

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

### 9.7 Logout current session

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

### 9.8 Logout all sessions

```text
POST /auth/logout-all
  -> current user
  -> transaction:
       revoke mọi active auth_sessions của user
       revoke refresh tokens liên quan
  -> clear current cookies
  -> 204
```

### 9.9 `/auth/me`

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

- Rate limit register, resend, verify, login, Google start/callback/complete và refresh
  bằng shared store trước khi scale nhiều replicas; nếu
  Phase 1 mới chạy một replica, phải document giới hạn tạm thời và task nâng cấp.
- So sánh password bằng API an toàn của thư viện hashing.
- Refresh token random dùng cryptographic RNG.
- JWT algorithm bị pin là RS256; không tin `alg` tùy ý từ header.
- Validate issuer/audience nếu deployment contract sử dụng chúng.
- Origin/CSRF policy cho cookie-authenticated mutation phải được test.
- CORS chỉ cho origins cấu hình, bật credentials.
- Không log cookie, JWT, refresh token, password hoặc token hash.
- Public login error không hỗ trợ account enumeration.
- Register/resend luôn trả response tổng quát; không reset password, identity hoặc
  profile của account đã tồn tại qua public endpoint.
- Pending email không được giữ vô hạn: có retention/cleanup và trusted admin claim flow
  để public pre-registration không chặn provisioning vận hành.
- Verification/onboarding token chỉ lưu hash, TTL ngắn, one-time và bị consume dưới
  row lock. Không dùng JWT dài hạn làm registration credential.
- `PENDING_VERIFICATION` không được cấp access/refresh token trừ đúng transaction xác
  minh email hoặc complete Google registration.
- Suspended user không được tạo session mới.
- Revoke/expiry dùng server time nhất quán và test boundary.
- Chỉ dùng Google OIDC discovery/JWKS và HTTPS endpoint chính thức; pin expected issuer
  và client audience, cache JWKS theo HTTP cache headers và xử lý key rotation.
- Không tin `email`, `email_verified`, `sub` hoặc profile gửi trực tiếp từ frontend;
  chỉ dùng claims từ ID token đã verify hoàn chỉnh.
- OAuth callback phải chống login CSRF bằng state, replay bằng one-time consumption,
  token substitution bằng nonce/audience và code interception bằng PKCE.
- Rate limit cả điểm bắt đầu và callback theo IP/state failure; không log code, ID token,
  provider token, state, nonce hoặc PKCE verifier.
- Google client secret và redirect URI được validate lúc startup khi
  `GOOGLE_AUTH_ENABLED=true`; production không có default secret.

## 12. Exception contract

Các lỗi domain tối thiểu:

```text
InvalidCredentialsException        -> 401
RegistrationAccepted               -> 202 response tổng quát, kể cả email đã tồn tại
InvalidEmailVerificationToken      -> 400/401 response tổng quát
InvalidRegistrationIntent          -> 400/401 response tổng quát
GoogleAuthenticationFailed         -> redirect error tổng quát hoặc 401 cho non-browser adapter
GoogleIdentityConflict             -> 409 chỉ ở trusted admin/linking context; callback dùng lỗi tổng quát
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

Google callback/registration cũng không tiết lộ account hiện hữu bị suspend hay
identity đã link nơi khác. Chi tiết chỉ xuất hiện trong structured security log đã
redact và có correlation ID.

## 13. Migration Phase 1

### 13.1 `identity-foundation`

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

### 13.2 `registration-and-google-identity`

Migration mới, không sửa migration đã deploy:

1. Cho phép `users.password_hash` nullable.
2. Thêm `PENDING_VERIFICATION` vào `user_status`.
3. Tạo `user_identities`, `registration_intents`, `email_verification_tokens` cùng
   unique constraint/index đã chốt.
4. Thêm `auth_sessions.identity_id` nullable và
   `auth_sessions.authentication_method` với backfill `PASSWORD` cho session cũ.
5. Tạo FK/index và check constraint cho authentication method.
6. Không backfill identity từ email; link chỉ xảy ra sau Google callback đã verify.

Review thêm:

- `provider_subject` là opaque string, không ép kiểu số/email.
- Unique constraint xử lý an toàn hai callback đồng thời.
- Verification và registration token dùng unique hash, expiry/index phục vụ cleanup.
- `down` không làm mất password login hiện hữu; môi trường có Google-only user cần
  precondition/guard trước khi đặt lại `password_hash NOT NULL`.
- Session `GOOGLE` phải có `identity_id`; session `PASSWORD` phải có
  `identity_id IS NULL` nếu check constraint được áp dụng.

## 14. Testing plan

### 14.1 Unit tests

- Email normalization.
- Password hash/verify adapter.
- JWT claims/sign/verify.
- Cookie option builder cho development và production.
- Google authorization URL builder, return path allowlist và transient state codec.
- Google ID-token claim validation: issuer, audience, expiry, nonce và verified email.
- Registration profile validation được dùng chung cho email và Google flow.
- Verification/onboarding token hash, expiry và one-time state transition.
- Role guard.
- Token expiry boundary.

### 14.2 Integration tests

- Unique email khác casing.
- Unique phone khi có giá trị.
- Session/token foreign keys.
- Token hash unique.
- Login transaction rollback khi tạo token lỗi.
- Email registration tạo pending user/token và verify kích hoạt đúng một lần.
- Resend tạo token mới theo cooldown mà không vô hiệu link hợp lệ trước đó hoặc rò rỉ
  account existence; verify một token consume toàn bộ token còn lại.
- Google callback user mới chỉ tạo registration intent, chưa tạo user/session.
- Complete Google registration tạo user + identity + session trong một transaction.
- Google verified email của pending password registration hợp nhất đúng một user và
  xóa password hash chưa được verify để chặn pre-registration account takeover.
- First Google login link đúng existing active user và tạo session trong một transaction.
- Callback đồng thời với cùng Google `sub` chỉ tạo một identity.
- Google `sub` đã link không bị chuyển user khi provider email thay đổi.
- Google-only user (`password_hash IS NULL`) không thể password login.
- Refresh rotation commit đúng chain.
- Concurrent refresh chỉ có một kết quả hợp lệ theo policy.
- Reuse detection revoke session.
- Logout/logout-all revoke đúng scope.
- Migration up/down/up.

### 14.3 E2E tests

- Admin tạo user và response không chứa password hash.
- Email registration luôn tạo `STUDENT`, gửi verification và chưa login trước verify.
- Verify email hợp lệ activate account/set cookies; expired/replayed token bị từ chối.
- Register/resend với email đã tồn tại không cho phép account enumeration.
- Login thành công set đúng hai cookie.
- Google start redirect có state, nonce, PKCE S256 và scope tối thiểu.
- Google callback user mới redirect tới onboarding và không cấp access cookie.
- Registration context prefill email/name từ Google; email/role/status không sửa được.
- Complete Google registration yêu cầu đủ profile, tạo `STUDENT`, set cookies và `/me` chạy.
- Google callback identity đã link login trực tiếp và không mở lại form đăng ký.
- Callback với state/nonce/audience/issuer/signature sai hoặc state replay bị từ chối.
- Google email chưa verify bị từ chối; provider claim do frontend tự gửi không được tin.
- Callback không chấp nhận arbitrary `returnTo`/open redirect.
- Suspended Google-linked user không tạo session.
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
- Google start/callback document redirect status, cookie side effects và public error
  code; không mô tả authorization code/ID token như dữ liệu client phải tự lưu.
- Register/verify/resend/registration-context/complete-registration document rõ field
  read-only/prefill, `202` generic và onboarding cookie không phải auth credential.

## 16. Thứ tự triển khai đề xuất

1. Chốt schema/normalization/cookie/rotation, registration và Google account-linking decisions.
2. Tạo entities và migration `identity-foundation`.
3. Viết repository integration tests cho constraint.
4. Implement UsersModule và controlled user creation.
5. Implement password/token/session services.
6. Implement login và `/auth/me`.
7. Implement access guard, current-user và roles decorators.
8. Implement refresh rotation và reuse detection.
9. Implement logout/logout-all.
10. Thêm rate-limit/CSRF policy theo deployment.
11. Tạo migration `registration-and-google-identity`, registration/verification service
    và email delivery adapter.
12. Implement register, resend, verify và pending-account rules.
13. Implement Google start/callback, registration intent/context/complete, existing
    account linking và Google session creation.
14. Thêm registration + Google OIDC security/integration/E2E tests bằng mail sink và
    mock provider/JWKS; test staging
    riêng với Google client thật.
15. Hoàn thiện E2E, Swagger, seed và operational cleanup plan.
16. Chạy full quality gate và deploy staging.

## 17. Phân công hai người

### Người A — Users và persistence

- User entity, enums và migration owner.
- UserIdentity entity, nullable password migration và linking constraint tests.
- RegistrationIntent/EmailVerificationToken entity, pending-user lifecycle và cleanup.
- UsersModule, admin create/list/detail/status use cases.
- Email normalization, password adapter và user integration tests.
- Development/test seed.

### Người B — Auth và HTTP security

- AuthSession/RefreshToken entity review.
- Token/session services.
- Login/refresh/logout controllers và cookie handling.
- Google OIDC adapter, state/nonce/PKCE, callback và provider security tests.
- Public registration, verification/resend, Google onboarding và email adapter.
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
- Google OAuth client tách riêng development/staging/production; redirect URI phải exact
  match, secret có owner/rotation runbook và không được dùng client production ở local.
- Có dashboard/alert cho callback failure bất thường nhưng metric/log không chứa email,
  code, token, state hoặc subject thô.
- Google outage/key rotation phải fail closed cho Google Login mà không ảnh hưởng
  password login, refresh hoặc session nội bộ đang tồn tại.
- Email provider outage không activate account ngầm; resend có retry/rate-limit và
  pending registration/token có retention + cleanup job.
- Bổ sung và validate cấu hình dự kiến: `GOOGLE_AUTH_ENABLED`,
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, frontend base URL
  cùng allowlist success/error/complete-registration path, email sender và verification
  URL. `.env.example` chỉ chứa placeholder không nhạy cảm; production fail fast nếu bật
  feature nhưng thiếu secret/URI.

## 19. Exit criteria

- [ ] Migration `identity-foundation` được review và chạy từ database rỗng.
- [ ] `users`, `user_identities`, `registration_intents`,
      `email_verification_tokens`, `auth_sessions`, `refresh_tokens` khớp schema.
- [ ] Không còn mâu thuẫn UUID/token schema trong code thực thi.
- [ ] Admin tạo/list/read/suspend user theo đúng quyền.
- [ ] Login, refresh, logout và logout-all chạy qua cookie `HttpOnly`.
- [ ] Email/password registration tạo pending `STUDENT`, verify email một lần rồi mới
      activate và cấp session.
- [ ] Google OIDC start/callback dùng state + nonce + PKCE, verify đầy đủ ID token và
      không lưu provider token.
- [ ] Google user mới phải complete form hồ sơ với dữ liệu prefill trước khi tạo
      `STUDENT`; callback chưa complete không cấp auth session.
- [ ] Google verified email hợp nhất an toàn với existing/pending account, không tạo
      duplicate và không tự overwrite hồ sơ.
- [ ] Password và Google login cùng phát hành một internal session/token contract.
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

- Forgot/reset password.
- GitHub/Microsoft/Apple OAuth và provider khác.
- Gọi Google API thay mặt user hoặc lưu Google access/refresh token.
- UI quản lý link/unlink nhiều identity.
- MFA.
- Fine-grained permission engine.
- Avatar/file upload.
- Catalog, class, cart, payment và enrollment.
