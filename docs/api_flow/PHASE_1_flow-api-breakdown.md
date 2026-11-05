# Phase 1 — Account creation API: password6–128

## 04/11/2026 — POST /api/v1/auth/realtime-ticket (IMPLEMENTED, LOCAL ONLY)

- Actor: MENTOR hoặc STUDENT ACTIVE; cookie access_token, guard AccessTokenGuard + RolesGuard, Origin bắt buộc thuộc CORS_ORIGINS exact. POST HTTP200, Cache-Control private/no-store, Vary Cookie,Origin. Không có path params; không dùng Idempotency-Key. Browser gọi qua proxy FE, không gửi raw access token sang JS.
- Body strict: {"channel":"chat"} hoặc {"channel":"whiteboards"}, channel bắt buộc, chỉ hai giá trị. Không nhận mentorId/userId/URL đích/origin trong body. Global validation chặn field thừa; channel tương ứng phải bật CHAT_ENABLED hoặc WHITEBOARD_ENABLED.
- Success DTO: {"ticket":"<short-lived-signed-ticket>","expiresAt":"2026-11-04T12:01:00.000Z"}. expiresAt là hạn handshake, không phải hạn sống socket. Proxy FE bổ sung url công khai từ REALTIME_ORIGIN runtime (mặc định origin API_BASE_URL). Response không có accessToken/refreshToken. Không cache vé trong TanStack Query/Redux/storage.
- FE gọi trước mỗi attempt/reconnect. Socket.IO auth payload {ticket}, chat namespace /chat với path /socket.io, bảng namespace mặc định với path /ws/whiteboards; addTrailingSlash false, transports websocket, không phụ thuộc cookie backend. API lookup/refresh vẫn same-origin FE. Vé không được đưa vào URL/query.
- Vé ký bằng JWT RSA keys hiện hữu nhưng typ riêng mindy-realtime+jwt; REST AccessTokenGuard chỉ nhận typ JWT nên không chấp nhận vé. Claims có actor/session/role, origin, channel, iat/exp, sessionExpiresAt. exp = min(now+60s, access expiry), sessionExpiresAt giữ access expiry. Cửa sổ dùng lại tối đa60s; không claim single-use. Không có side effect DB.
- Gateway vẫn kiểm Origin allowlist, verify ticket đúng channel/origin/signature/expiry, xác minh session/account ACTIVE rồi kiểm resource trên join/command/fanout như cũ. Cookie same-origin cũ vẫn được hỗ trợ khi không có ticket; ticket sai không fallback sang cookie. Socket được ngắt ở access expiry và khi quyền/session bị thu hồi.
- Lỗi HTTP: 401 AUTHENTICATION_REQUIRED khi thiếu/hết hạn access, kể cả race hết hạn sau guard; FE dùng recovery chung rồi retry một lần. 403 INSUFFICIENT_ROLE cho role/origin sai; không retry. 422 input invalid theo global validation. 503 native ServiceUnavailableException nếu channel tắt; FE hiển thị không sẵn sàng/retry giới hạn. Connect_error của bảng vẫn offline; chat giữ polling fallback.
- Lifecycle FE: tối đa3 retry 1/2/5s, mỗi lần xin vé mới; logout/session abort/unmount dừng socket/attempt cũ. Whiteboard giữ manual reconnect, queue/updateId và epoch theo flow Phase7. Không tự cấp quyền khi ticket thành công.
- Deploy BE này trước FE mới, giữ các origin hợp lệ trong CORS_ORIGINS. BE public HTTPS endpoint phải nhận WS Upgrade trực tiếp; không proxy hai path socket qua Vercel/host FE. Không đổi cookie SameSite/HttpOnly. Xem flow Phase1 và hướng dẫn FE docs/backend-connectivity.md.
- Evidence: tools/realtime-smoke.mjs kiểm HTTP thật và cookie-free WS join thật cho hai channel, origin/channel isolation/session revoke. Session lookup/domain dùng fixture memory, không thay nghiệm thu nghiệp vụ/DB. Browser cùng build FE ở127.0.0.1:3181 và localhost:3182 đã online, update ACK và reconnect bằng vé mới. Chưa deploy/production verified.

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
## Managed-user search addition — 2026-11-03

Implemented: GET `/api/v1/admin/users?q=nguyen&page=1&pageSize=10`, active ADMIN/MANAGER
with existing access_token cookie. Optional q is trimmed, string 2–100 characters;
omitted means all users. Existing role/status/page/pageSize bounds unchanged. No body.
Matches substrings in display name/email/phone case/accent insensitively; `%`, `_`,
and backslash are literal. Bound parameters prevent SQL injection. Response remains
200 `{items,page,pageSize,total}` with safe UserDto fields; total counts all matches
before pagination. Stable sorting createdAt DESC then ID ASC. No extra student PII
fields or changed authorization. No write, polling or idempotency key.

FE debounce 250ms, minimum two characters, suppress composition requests, reset to page
1 on committed term, preserve term on pagination/filters. No results uses existing
empty state; failed requests use existing retry. Clearing omits q. 401/403 retain
existing session/role behavior; 422 invalid q uses normal validation response; proxy
uses INVALID_QUERY and rejects duplicate/unsupported keys. Local verified through
real FE and API; remote deployment remains pending. See PHASE_1_FLOW.md.
