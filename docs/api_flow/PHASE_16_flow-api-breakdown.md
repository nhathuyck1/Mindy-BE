# Phase 16 — API và WebSocket cho chuông ngoài chat

20/11/2026 — **IMPLEMENTED LOCAL: REST/WS/extensions bên dưới đã có source; chưa deploy/FE sign-off**.

Source: src/modules/notifications/, auth/realtime-ticket.controller.ts và migration
1795132800000. Các nhãn proposal/đề xuất trong phần thiết kế dưới là baseline;
chi tiết runtime hiện hành/khác biệt được chốt tại mục 5 và progress.

[Flow](PHASE_16_FLOW.md) ·
[Plan](../implement_phase/phase%2016/PHASE_16_BELL_NOTIFICATIONS_WEBSOCKET.md) ·
[Unified base contract](BUSINESS_NOTIFICATIONS_flow-api-breakdown.md).

## 1. REST inbox — kế thừa Phase 9, mở rộng BUSINESS scope

### Bước 0 — Login trước khi gọi notification

Collection Phase16 đã có folder **Authentication — choose one login**:
chọn Login Student **hoặc** Login Mentor, sau đó GET current user. Điền
student_email/student_password hoặc mentor_email/mentor_password trong Postman
environment local; không export credentials. Cookie jar theo host dùng tài khoản
đăng nhập gần nhất; hai login không tạo hai actor độc lập cho các request kế tiếp.

`POST /api/v1/auth/login` là endpoint Auth hiện hữu, public; headers
Content-Type: application/json, FE gửi credentials/include để browser lưu cookie.
Body: email required email <=320 ký tự; password required 1–128 ký tự;
deviceName optional <=150 ký tự. Ví dụ dùng giá trị giả:

```json
{"email":"student@example.test","password":"<local-password>","deviceName":"Postman Phase 16"}
```

200 trả `{user: UserDto, accessTokenExpiresAt: ISO8601}` và Set-Cookie
access_token/refresh_token HttpOnly; không có access token trong JSON để copy
sang Bearer. Postman tự giữ cookie, browser dùng credentials:include trên các
request cùng cấu hình CORS/cookie đã triển khai. Login thất bại 401, input sai
422; không gọi tiếp inbox khi login chưa thành công.

`GET /api/v1/auth/me` dùng access cookie, 200 trả UserDto (id/role và profile
hiện hữu), 401 nếu thiếu/invalid/revoked session. FE kiểm actor hiện tại rồi gọi
BUSINESS list/count hoặc xin ticket channel notifications. Ticket chỉ dùng
handshake, không thay cookie để gọi REST. Các notification routes đã có
AccessTokenGuard; chưa đăng nhập bị từ chối, không cần tạo login route riêng.

20/11/2026: bổ sung runnable login requests và cookie/role assertions vào collection;
không đổi auth runtime/notification guards. Kiểm JSON/script syntax/diff; không
chạy lại BE suite hoặc đăng nhập tài khoản thật cho thay đổi collection này.

Auth access_token HttpOnly cookie, ACTIVE account/session; Origin allowlist cho
mutations, owner từ principal. Mentor/Student dùng BUSINESS; quyền REST bốn role
của Phase 9 giữ nguyên. Không có public create/broadcast/retry API.

| API đầy đủ | FE gọi và input | Success/side effect |
| --- | --- | --- |
| GET /api/v1/notification-inbox | Khi mở/reconnect/focus; category=BUSINESS (mới), limit 1–100 default 20, cursor <=2048, unreadOnly boolean default false | 200 `{data: NotificationInboxV1[], meta:{hasMore,nextCursor}}`; business visible, keyset createdAt/id DESC; no mutation |
| GET /api/v1/notification-inbox/unread-count | Cùng list; category=BUSINESS (mới, optional; mặc định ALL tương thích Phase 8) | 200 `{unreadCount:3}`; tổng unread visible business, cùng retention/policy list |
| PATCH /api/v1/notification-inbox/:notificationId/read | UUIDv4 từ row người dùng click; body rỗng | 200 `NotificationInboxV1` theo base contract; readAt ISO UTC, repeat giữ timestamp; emit own read invalidation sau commit |
| POST /api/v1/notification-inbox/read-all | category=BUSINESS (query mới, optional; mặc định ALL), body rỗng | 200 `{readAt:"2026-11-20T03:00:00.000Z",resyncRequired:true}`; snapshot visible unread business IDs, không đọc CHAT hoặc late fanout |

Đề xuất query category cho count/read-all chỉ chấp nhận ALL/BUSINESS; list giữ
category enum Phase 8 và thêm BUSINESS. Cursor bind category, owner và unreadOnly,
TTL 24h như base contract; không dùng cursor ALL cho BUSINESS. Đọc từng row luôn
check own visibility; client chuông chỉ lấy ID từ BUSINESS list.

NotificationInboxV1, data allowlist, target.available, response rows/pagination và
retention kế thừa đầy đủ base contract; type mới của Phase 16 phải bổ sung registry
và DTO validation khi code. Ví dụ row tối thiểu: id UUIDv4, type=SESSION_RESCHEDULED,
category=SCHEDULE, title/body generic, actorId/conversationId/messageId=null,
data={sessionId:UUIDv4}, readAt=null, createdAt ISO UTC,
target={kind:SESSION,id:UUIDv4,available:true}. Không trả điểm/lý do/URL private.

Errors: invalid query/body 422 theo global ValidationPipe hiện tại; UUID sai 400
theo ParseUUIDPipe; 401 auth, 403 role/Origin; 404 NOTIFICATION_NOT_FOUND cho foreign/
hidden/missing; 422 NOTIFICATION_CURSOR_INVALID; 410 NOTIFICATION_CURSOR_EXPIRED;
503 NOTIFICATIONS_DISABLED/NOTIFICATION_POLICY_UNAVAILABLE theo base proposal.
Base Phase 8 đang ghi validation chung 400: khi implement phải đồng bộ thành
422 DTO / 400 path theo configure-app.ts, không đổi global pipe vì phase này.

UI: loading/empty/error riêng; cursor invalid/expired refetch trang đầu; 401 dùng
auth refresh hiện hữu rồi reconnect, refresh thất bại yêu cầu đăng nhập; 403 dừng
retry; 503 backoff, giữ dữ liệu cũ có nhãn chưa đồng bộ. GET no-store. Read/all
thành công refetch list/count ở tab hiện tại và các tab nhận invalidation.

## 2. Ticket authentication — mở rộng endpoint hiện hữu

POST **/api/v1/auth/realtime-ticket**, Mentor/Student, access cookie + Origin thuộc
CORS_ORIGINS. FE gọi trước connect khi cần ticket (ví dụ cross-site cookie transport).

Request mới: `{"channel":"notifications"}`; đây là enum bổ sung, hiện runtime
chỉ nhận chat/whiteboards. Không path/query; body chỉ có channel required.
200 `{"ticket":"<memory-only>","expiresAt":"2026-11-20T03:01:00.000Z"}`,
private,no-store; ticket tối đa 60s và không vượt access expiry. Ticket bound
origin/channel/session; không log/persist/query string, không trả access/refresh token.
Mint ticket không tạo inbox hoặc đánh đọc. Auth/channel/origin validation và
role deny dùng 401/403/422 theo auth hiện có; channel flags OFF trả 503.
Mở rộng guard chọn flag đúng channel, tránh fallback notifications sang whiteboards.

## 3. Socket.IO — proposal

- Namespace `/notifications`; Engine.IO path `/ws/notifications`, websocket only;
  path không có `/api/v1`. Reverse proxy forward Upgrade path này.
- Handshake `auth:{ticket}` hoặc access cookie, luôn Origin allowlist; ticket sai
  không fallback cookie để bỏ qua kiểm tra ticket. Owner/role không nhận từ payload.
- Gate: NOTIFICATIONS_ENABLED && NOTIFICATION_SOCKET_ENABLED; mặc định flag socket
  OFF, CHAT_ENABLED độc lập. Tối đa 5 kết nối/user đề xuất, kiểm concurrency trước
  accept; message size tối đa 32 KiB, không có room-join hoặc public emit command.
- Channel notifications chỉ gửi business rows; client không đồng thời nghe unified
  business từ /chat. Giữ legacy chat contracts, không dual-emit vào legacy parser.

| Event server → client | Payload | Hành vi FE |
| --- | --- | --- |
| notification-inbox:created | `{notification: NotificationInboxV1}` | Upsert theo id; không tăng badge theo số packet; refetch business count/list khi cần |
| notification-inbox:read | `{readAt: ISO8601, resyncRequired:true}` | Refetch BUSINESS list/count mọi own tab; payload không mô tả read-all toàn bộ |

Không có client event mutation hoặc socket replay cursor. Socket ready/connect
không tự đánh đọc. Transport best effort, packet có thể lặp hoặc mất; durable REST
là nguồn phục hồi. Trước từng emit: account/session ACTIVE, đúng owner, flags và
provider visibility; hạ tầng policy lỗi thì fail closed, không phát packet.

Đề xuất connect_error.data `{code,statusCode}` với AUTHENTICATION_REQUIRED (401),
INSUFFICIENT_ROLE (403), NOTIFICATIONS_DISABLED (503), NOTIFICATION_RATE_LIMITED
(429). Origin bị chặn có thể chỉ thấy transport error; không phụ thuộc HTTP status
trong browser. Đây là codes dự kiến, cần map vào exception/DTO khi implement.
401 refresh/re-ticket rồi reconnect có giới hạn; 403 dừng; 429/503 exponential
backoff+jitter. Disconnect do hết access hạn dùng auth flow hiện hữu, không loop
dùng lại expired ticket. Account revoke chặn emit ngay và audit loop đề xuất <=5s
dọn kết nối; lỗi hạ tầng audit phải fail closed.

## 4. Handoff/gates

FE dùng role target mapping Phase 8; thêm mapping ZIP review queue/material own
review/reminder theo resource API thực khi implement, chưa khẳng định route FE có
sẵn. Khi resource 403/404 hoặc target.available=false hiển thị unavailable,
không retry vô hạn. Chuông không có quyền đọc chi tiết từ packet.

Kiểm real sockets trên app compiled: cookie/ticket, wrong channel/origin/owner,
expiry/revoke, CHAT_OFF, ba path đồng thời, duplicate/drop/read đa tab; kiểm REST
BUSINESS count/read-all không ảnh hưởng chat. Lượt này chưa sửa Swagger/Postman,
chưa chạy endpoint/socket thật hoặc nghiệm thu FE.

## 5. Runtime hiện hành — 20/11/2026

Local demo: đã gọi authenticated PATCH /api/v1/management/class-sessions/
d3cce7fe-102a-42de-8f51-d03ff20a541f/schedule bằng Manager Ops, expectedVersion=1,
UUID Idempotency-Key, startsAt=2026-11-24T10:00:00+07:00,
endsAt=2026-11-24T11:30:00+07:00 và reason test; HTTP 200. SCHEDULE activation
đã bật trên DB local. Event DONE, mentor frontend + 8 Student có unread inbox;
user có thể login mentor.frontend@example.com hoặc student.an@example.com và
GET notification-inbox?category=BUSINESS để xem, GET không đánh đọc. Không đổi
contract/endpoint; không chứng minh frontend đã nhận live socket packet.

- Đã implement đủ 4 route ở mục 1 và channel ticket notifications ở mục 2.
  Guards AccessTokenGuard/RolesGuard/RequestOriginGuard; bốn role cho REST,
  Mentor/Student cho socket; API OFF trả 503 NOTIFICATIONS_DISABLED.
  GET no-store và không tự đọc; PATCH/POST chỉ nhận body rỗng, field lạ 422.
- Query category count/read-all chỉ ALL/BUSINESS, default ALL. List thêm BUSINESS
  vào enum Phase 8; cursor owner/category/unreadOnly bound, TTL 24h. DTO query/body
  validation 422, UUID path 400; foreign/hidden id trả cùng 404. Cursor invalid 422,
  expired 410. Provider infrastructure error trả 503 NOTIFICATION_POLICY_UNAVAILABLE.
- Namespace /notifications trên path /ws/notifications, websocket only, buffer
  32KiB và tối đa 5 own connections/user. Cookie/ticket, origin/channel/session và
  role được kiểm tra; ticket không thay REST cookie. connect_error.data như mục 3;
  lỗi auth underlying được chuẩn hóa AUTHENTICATION_REQUIRED, HTTP ticket dùng
  error contract Auth hiện hữu. Audit disconnect định kỳ 5s, kiểm Auth mỗi emit.
- Payload created/read đúng mục 3. Business-created không đi vào legacy chat DTO.
  Read/inbox state dùng cùng notifications rows; legacy chat read/conversation-read
  invalidate socket mới, unified đọc chat invalidate own legacy sockets. Đọc
  notification không cập nhật last_read_seq. CHAT_OFF vẫn dùng business REST/socket.
- **22 business types** trong notification-catalog.ts: 17 types R0 +
  ZIP_SUBMISSION_REVIEW_REQUIRED, MATERIAL_REVIEW_APPROVED,
  MATERIAL_REVIEW_REJECTED, SESSION_STARTING_SOON, ASSIGNMENT_DUE_SOON.
  N12 MENTOR_LEAVE_REQUESTED chỉ staff REST, không chuông Mentor/Student.
  Business actorId/conversationId/messageId null; title/body cố định theo catalog.
- Data keys runtime: sessionId/classId/assignmentId/submissionId/orderId/leaveId/
  placementId/materialId theo kind; ZIP result thêm assignmentId khi được đọc.
  target.contextId có thể là classId (SESSION/MATERIAL), assignmentId (SUBMISSION).
  MAKEUP trả targetSessionId qua contextId khi current placement/session policy
  cho phép; không coi placementId là sessionId. Terminal unavailable không trả
  ancestry/contextId.
- Material review target dùng created_in_class_id snapshot và owning-domain mentor
  detail policy; bị mất scope thì terminal generic còn visible, available=false.
  Tài liệu Student dùng full material/file policy và class contexts tại publication.
- Các route FE mới cho mentor ZIP review queue, material review/focus và schedule
  reminders chưa được sửa/xác minh ở repo FE. Dùng typed target allowlist và generic
  fallback theo mapping Phase 8; không hứa browser navigation đã đạt.
- Swagger khai báo request/query/response/errors; Postman collection tại
  postman/Mindy-Notifications-Phase16.postman_collection.json. Kiểm real sockets,
  migrations và benchmark tại progress; chưa chạy collection qua Postman CLI.
