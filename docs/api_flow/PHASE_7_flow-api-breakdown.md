# Phase 7 — Firebase notification: API runtime và FE handoff

Runtime revision 2026-10-27: 'PushController', 'PushRegistry', migration '1793059200000'.
P1/P2 có test HTTP thật (guards/Origin/DTO/8KiB/ownership/generation/rate/Swagger/logout).
Postman tái dùng [collection Chat Phase6](../../postman/Mindy-Chat-Phase6.postman_collection.json), thêm nhóm Phase7.

Defaults backend: inbox path '/notifications', TTL300s, max10 installation, 20 mutation attempts/phút/session (kể cả conflict), Retry-After60s. Path/origin cần FE xác nhận trước bật staging. HTTPS và exact CORS allowlist bắt buộc khi PUSH_ENABLED; worker off vẫn đăng ký/enqueue, inbox/socket độc lập. PUSH_ENABLED=false trả503 PUSH_DISABLED.

Generation_started_at ngăn registry rotation tạo push lịch sử khi fanout retry. Same PUT giữ generation; ciphertext có thể được re-encrypt theo active key. Session revoke trigger thu hồi registry trong cùng auth transaction, không tạo vòng DI. Hết session/suspend/role change vẫn bị current-check chặn dù cleanup trễ. Provider accepted và browser received là hai evidence khác nhau.

Auth guard trả401 'AUTHENTICATION_REQUIRED'; DTO422 dùng 'HTTP_ERROR', UUID path400 dùng 'HTTP_ERROR'; Origin403 'ORIGIN_NOT_ALLOWED', role403 theo RolesGuard. Body quá8KiB413 'INVALID_JSON_BODY'. Push429 'PUSH_RATE_LIMITED' có Retry-After. Không có success envelope, token/list API hoặc public send-test route.

DI: ChatModule → PushNotificationsModule → AuthModule. ChatPushPolicy bind public PushEligibility ở onModuleInit; không import ChatModule ngược. Registry lock session → owner advisory → installation; rate budget reserve riêng bằng session advisory. Fanout giữ conversation lock như Phase6 và enqueue bằng cùng EntityManager; worker claim lease riêng, current scope checks dùng public ChatAccessService; mọi locks kết thúc trước gọi mạng. Giới hạn race: revoke sau check/provider accept không recall được generic push.

[Runbook và browser matrix](../PHASE_7_FIREBASE_RUNBOOK.md) ghi config/SDK/SW và rollout. FE SDK/SW, public config/VAPID, actual route/browser evidence chưa có; phần FE bên dưới là handoff, không phải đã implement trong repo FE.


**2026-10-27 · P1/P2 đã implement backend local; Firebase live/FE browser chưa nghiệm thu.**
[Flow](PHASE_7_FLOW.md) ·
[Plan](../implement_phase/phase%207/PHASE_7_FIREBASE_NOTIFICATIONS.md) ·
[Progress](../progress/phase%207/PHASE_7_PROGRESS.md).

## 1. Contract chung

- Prefix `/api/v1`. P1/P2: STUDENT/MENTOR ACTIVE, access cookie HttpOnly, session
  còn hiệu lực; fetch credentials include. Mutation phải gửi Origin đúng CORS_ORIGINS
  qua RequestOriginGuard; Postman cũng cần Origin. Không dùng Firebase token làm auth.
- Không nhận userId/sessionId/role hoặc send target từ client. UUIDv4 normalize lowercase;
  generation là decimal string bigint dương. UTC ISO8601, không timestamp client làm authority.
- DTO unknown fields/validation422, malformed JSON400; body giới hạn 8KiB đã triển khai.
  Responses DTO trực tiếp, không thêm success envelope; errors theo global filter repo.
  Cache-Control no-store. Raw FCM token không bao giờ trả về response/list/log.
- Rate limit 20 mutations/phút/session, response429 + Retry-After; maximum10
  active installations/user. Token max4096 ký tự, nonempty ASCII không whitespace.
  Đây là giới hạn input dự án, không giả regex có thể xác minh token hợp lệ của Firebase.
- PUSH_ENABLED=false: P1/P2 trả503 PUSH_DISABLED; dừng auto retry. Auth logout vẫn chặn
  session như hiện tại và không phụ thuộc API deregister. GET inbox không phụ thuộc push flag.
- Lỗi runtime:401 AUTHENTICATION_REQUIRED → refresh/login flow một lần theo auth hiện tại;
  403 role/account/origin → dừng và xử lý quyền/cấu hình, không retry nóng;
  422 → sửa input;429 → đợi Retry-After;503 → giữ inbox và retry chủ động khi phù hợp.
  Mã push dùng AppHttpException/global error envelope; guard auth thực trả AUTHENTICATION_REQUIRED, role/origin theo guard hiện hành.

## 2. P1 — PUT /api/v1/notifications/push/installations/:installationId

Mục đích: upsert token web cho **chính actor và current session**. FE gọi sau user
gesture permission granted → Firebase getToken. Firebase SDK request đi tới Firebase;
P1 là request tới BE. Không gọi BE để tự sinh FCM token.

Path `installationId`: UUIDv4 bắt buộc, FE tạo/giữ trong browser profile; không lấy
user ID làm installation ID. Không query hoặc custom Idempotency-Key.

Body bắt buộc, không field phụ:

```json
{
  "platform": "WEB",
  "token": "example-fcm-token-replace-with-sdk-result"
}
```

`platform` enum WEB; `token` string1..4096, không trắng/khoảng trắng. Body trên minh họa
shape, không phải token Firebase chạy được. Headers: Content-Type application/json,
Origin từ FE allowlist và cookie auth. Không gửi service account/VAPID private key.

Success **200** cả create/update/replay, DTO runtime:

```json
{
  "installationId": "3dc19219-dba2-4b54-920c-c00a9aa1d945",
  "platform": "WEB",
  "status": "ACTIVE",
  "generation": "1",
  "lastSeenAt": "2026-10-27T03:00:00.000Z"
}
```

FE dùng installationId/generation cho P2, status để hiển thị đã đăng ký BE. ACTIVE
không chứng minh browser đã nhận push hoặc token thực sự hợp lệ tại Firebase.
lastSeenAt là server refresh time. Không có pagination, nullable fields hoặc raw token.

Side effects: HMAC fingerprint/AEAD token, owner từ auth guard. Same binding/token
chỉ refresh lastSeenAt, generation giữ nguyên; token/session thay đổi tăng generation
atomic và làm queued generation cũ không thể gửi. Revoked installation của cùng owner
có thể reactivate với token/session hợp lệ, tăng generation. Không replay inbox cũ.

Race: concurrent upsert phải serialize unique installation/token. Request tới sau
được áp trạng thái hợp lệ hiện tại; response mất có thể retry nguyên PUT nhưng client
phải serialize các refresh requests để không gửi token cũ đè token mới.

| Lỗi bổ sung | Ý nghĩa | FE xử lý |
|---|---|---|
|409 PUSH_BINDING_CONFLICT | Installation/token thuộc account khác, không lộ owner | Dừng auto retry; account switch deleteToken/getToken mới, tạo installation mới nếu đổi owner |
|409 PUSH_INSTALLATION_LIMIT | Đã có10 active installation | Báo giới hạn, opt-out một thiết bị đang sở hữu rồi thử lại |
|429 rate limited | Quá số mutation cho session | Đợi Retry-After, không gọi getToken/PUT vòng lặp |
|503 PUSH_DISABLED | Push chưa bật | Hiển thị chưa khả dụng, inbox dùng bình thường |

UI: trạng thái đang đăng ký → success hoặc lỗi có thể retry; không block màn hình chat.
Network timeout/5xx retry tối đa3 lần với backoff giữ nguyên installation/body nếu token
chưa đổi; khi token mới xuất hiện cancel/serialize request cũ. Sau login/return focus
được getToken rồi refresh P1; không poll mỗi giây. Không refetch toàn chat sau PUT.

## 3. P2 — DELETE /api/v1/notifications/push/installations/:installationId

Mục đích: opt-out current installation trước logout/đổi account. Actor phải owner và
đúng current bound session. Path UUIDv4 từ P1, query **generation** bắt buộc là decimal
string >0 từ P1, không JSON body. Cookie + Origin như P1.

Ví dụ: `DELETE /api/v1/notifications/push/installations/3dc19219-dba2-4b54-920c-c00a9aa1d945?generation=1`.
Success **204**, không response body; registry REVOKED, worker skip queued deliveries.
Lặp DELETE cùng binding đã revoked trả204. Không delete inbox/message/auth session.

| Lỗi bổ sung | Ý nghĩa | FE xử lý |
|---|---|---|
|404 PUSH_INSTALLATION_NOT_FOUND | Unknown/foreign user hoặc session không sở hữu binding | Không suy owner, giữ logout flow; session revoke vẫn chặn gửi |
|409 PUSH_GENERATION_CONFLICT | Binding đã rotate bởi request/tab khác | Không retry generation cũ; phối hợp tab/current P1 rồi user quyết định opt-out binding hiện tại |
|503 PUSH_DISABLED | Push feature off | FE deleteToken và tiếp tục logout; auth logout là bước bắt buộc |

Loading: vô hiệu nút opt-out trong lúc gửi, success cập nhật UI rồi Firebase deleteToken.
DELETE timeout có thể retry cùng generation một lần; nếu logout, không để deregister
network failure chặn auth logout. Dọn local toast/SW display; deleteToken thất bại vẫn
tiếp tục auth logout. Không dùng P2 thay auth logout và không tự revoke thiết bị khác.

## 4. Inbox đã implement — tái dùng, không đổi contract

Đối chiếu `src/modules/chat/controllers/notifications.controller.ts` và service tại
baseline2533b00. Auth STUDENT/MENTOR, own+current chat visibility; CHAT_ENABLED vẫn
chi phối inbox. P1/P2 mới không thay endpoint/read state sau đây. Chi tiết auth/errors/
pagination/FE transitions theo [runtime revision Phase 6](PHASE_6_flow-api-breakdown.md).

| API hiện có | Input / success runtime | FE dùng sau push |
|---|---|---|
| GET /api/v1/notifications | unreadOnly/limit/cursor;200 `{data,meta:{hasMore,nextCursor}}` | Refetch first page trên foreground/click; không tự read |
| GET /api/v1/notifications/unread-count | Không body;200 `{unreadCount}` | Refetch badge, không cộng1 theo số push |
| PATCH /api/v1/notifications/:notificationId/read | UUID owner visible;200 NotificationDto | User chọn item; readAt set-once, không nâng conversation cursor |
| POST /api/v1/notifications/read-all | Không field nghiệp vụ;200 `{readAt,resyncRequired:true}` | Chỉ user chọn read-all; không tự retry khi mất response |

NotificationDto runtime gồm id/type/actorId/conversationId/messageId/title/body/data/
readAt/createdAt. Không dùng response proposal cũ `{updatedCount,unreadCount}` của
Phase6 baseline thay runtime revision. N1 meta không chứa unreadCount; lấy qua N2.
Foreign/hidden/deleted item404: bỏ item và refetch;401 theo auth flow;503 CHAT_DISABLED
không retry nóng. Empty inbox/unread0 là trạng thái bình thường.

## 5. Provider payload và FE receive contract runtime / FE handoff

```json
{
  "notification": {
    "title": "Tin nhắn mới",
    "body": "Bạn có tin nhắn mới."
  },
  "data": {
    "schemaVersion": "1",
    "notificationId": "1495f1ef-6237-4a12-9613-f55b9d1eccd5"
  }
}
```

Đây là phần application payload, không phải toàn bộ Firebase Admin Message request.
BE thêm token từ registry, webpush TTL/tag và fcmOptions.link HTTPS tới inbox route
đã chốt; không có API FE truyền arbitrary payload/target/link để gửi push.
Một tag theo notificationId cho browser gộp display; provider vẫn có thể deliver trùng.

- Foreground: `onMessage` refetch N1/N2, dedupe bằng notificationId với Socket.IO
  `notification:created`. Không increment badge từ push vì message có thể read/hidden.
- Background: notification payload dùng display mặc định của SDK. SW không gọi thêm
  showNotification cho cùng event; giữ service worker sẵn trước getToken/onMessage.
- Click: mở/focus inbox, xác thực theo cookie hiện tại, N1/N2 lấy target. Nếu bị revoke
  hoặc khác account, chỉ hiển thị inbox hiện tại; không fetch target từ push đã cũ.
- Received/click không tự N3/N4 hoặc nâng conversation read cursor. Khi user chọn item,
  dùng flow N3→conversation theo Phase6. SW/cache không lưu protected body/account data.
- Permission default: chỉ hỏi sau click bật notification. Denied: hướng dẫn cài browser,
  không tự prompt lại; unsupported: ẩn khả năng bật push, giữ inbox. Không hứa nhận push
  khi browser/OS tắt service worker hoặc chặn notification.

Firebase yêu cầu web setup/SW/VAPID và phân biệt foreground/background; tham chiếu
[web setup](https://firebase.google.com/docs/cloud-messaging/web/get-started) và
[receive messages](https://firebase.google.com/docs/cloud-messaging/web/receive-messages).

## 6. Điều kiện bàn giao và kiểm chứng

P1/P2 chỉ FE gọi được sau7.1 implementation + Swagger/Postman cập nhật. Push thực
cần7.2/7.3, Firebase project/ADC server, public web config/VAPID FE, flags/cutoff,
HTTPS/SW và permission granted. Route inbox cụ thể phải chốt trong7.0, chưa bịa route FE.
Postman chỉ kiểm P1/P2/inbox; không chứng minh SW/browser nhận thông báo.
Lượt2026-10-27 chỉ planning, chưa chạy request tới BE/Firebase hoặc test runtime mới.
