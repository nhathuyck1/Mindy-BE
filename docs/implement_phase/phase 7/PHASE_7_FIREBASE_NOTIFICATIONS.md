# Phase 7 — Notification bằng Firebase Cloud Messaging

## Implementation revision — 2026-10-27

Backend7.0–7.3 đã có source/migration/Swagger/Postman và kiểm thử local. 7.4 bàn giao contract/runbook, FE tự triển khai SDK/SW; 7.5 ghi local evidence riêng với Firebase/IAM/browser/VPS chưa có.
Theo dõi [progress hiện hành](../../progress/phase%207/PHASE_7_PROGRESS.md), [runtime API](../../api_flow/PHASE_7_flow-api-breakdown.md) và [runbook](../../PHASE_7_FIREBASE_RUNBOOK.md). Planning baseline phía dưới giữ lịch sử, không phải trạng thái runtime hiện hành.

Quyết định implementation: default inbox '/notifications' (cấu hình, chờ FE sign-off), HTTPS allowlist bắt buộc; Firebase Admin14.5.0 cấp ADC, HTTP v1 fetch deadline10s để worker tự quản retry. Registry có generation_started_at chống replay sau rotate và bảng budget dùng chung PostgreSQL. Auth revoke dùng DB trigger additive thay vì Auth import Push: mọi session revoke path đều được thu hồi atomic. Graph Chat→Push→Auth không vòng; ChatPushPolicy bind public eligibility hook. Source checks không giữ locks trong network call. Một migration additive bao gồm registry/deliveries/budget; schema cũ không bị sửa.


**2026-10-27 · PLANNED — chưa implement, chưa cấu hình Firebase hoặc deploy.**
Baseline source: `2533b00`. Yêu cầu: lập phase notification bằng Firebase.
[Flow](../../api_flow/PHASE_7_FLOW.md) ·
[API proposal](../../api_flow/PHASE_7_flow-api-breakdown.md) ·
[Progress](../../progress/phase%207/PHASE_7_PROGRESS.md).

## 1. Mục tiêu và baseline thực tế

Bổ sung thông báo đẩy qua **Firebase Cloud Messaging (FCM) cho web** khi người
dùng không mở màn hình chat. PostgreSQL tiếp tục lưu inbox/read state; Socket.IO
đồng bộ trong ứng dụng. FCM là kênh chuyển thông báo, không sở hữu dữ liệu chat.

Đã đọc toàn bộ `document/Flow.txt`, quy tắc tại `docs/core/NESTJS_PROJECT_RULES.md`,
plan/progress Phase 6 và source notification/auth/jobs hiện tại:

| Thành phần | Baseline đã có | Phase 7 bổ sung |
|---|---|---|
| Inbox | `ChatNotificationsService`, bảng `notifications`, unique user/type/message | Tạo push delivery cùng transaction fanout |
| API | GET list/count, PATCH read, POST read-all; STUDENT/MENTOR | API đăng ký/thu hồi installation của chính actor |
| Realtime | `notification:created`, `notifications:read` qua Socket.IO | FCM song song, không đổi read semantics |
| Jobs | `chat_jobs`, lease/fencing, consumer NOTIFICATION | Hàng đợi push riêng theo notification/installation/generation |
| Quyền | `ChatAccessService`, source checks, history window, account/session | Recheck trước mỗi lần gửi tới provider |
| Firebase | Chưa có `firebase-admin`, config, registry token hoặc worker FCM | Adapter injectable, credentials server và FE handoff |

Runtime inbox đang nằm **trong ChatModule**, không có NotificationsModule độc lập.
Không giả định tên module trong baseline planning Phase 6 là source đã tồn tại.
Phase 6 có nghiệm thu backend local; FE/VPS và việc bật worker môi trường thực tế
vẫn theo [progress Phase 6](../../progress/phase%206/PHASE_6_PROGRESS.md).

## 2. Phạm vi và mặc định đề xuất

Yêu cầu dùng Firebase đã được user đưa ra. Các lựa chọn chi tiết dưới đây là
**đề xuất triển khai**, chưa phải xác nhận nghiệp vụ bổ sung:

- V1: web push cho `CHAT_MESSAGE`, STUDENT/MENTOR có quyền chat hiện tại.
- Một tài khoản có nhiều installation; một installation gắn một account/session
  hiện hành. Giới hạn đề xuất 10 installation active/user.
- Gửi cả khi socket online; FE gộp theo notification ID, không dùng trạng thái
  socket để suy chắc thiết bị đang đọc. Suppress nếu notification đã read trước send.
- Chỉ generic title/body; không gửi nội dung chat, tên lớp/người gửi, file URL,
  email, điểm hoặc dữ liệu thanh toán tới FCM.
- Push không tự mark read, không đổi conversation cursor; click phải gọi API có auth.
- Thông báo lịch đổi/học bù, assignment, material, payment và nhắc lịch là backlog
  tiếp theo. Mỗi loại cần event, recipient policy, template và AC riêng trước khi code.
  Yêu cầu mail lịch đổi trong Flow.txt vẫn là yêu cầu riêng, push không thay mail đó.
- Chưa gồm mobile native/APNs, broadcast marketing, topic theo lớp, Firebase Auth,
  Firestore hoặc chuyển database/chat sang Firebase. Không thêm send-test public API.

## 3. Các slice và dependency

| Slice | Plan | Đầu ra | Phụ thuộc |
|---|---|---|---|
| 7.0 | [Contract và Firebase foundation](PHASE_7_0_CONTRACTS_FIREBASE.md) | Adapter/config/flags và fake provider | Inbox/auth Phase 6 |
| 7.1 | [Installation và token lifecycle](PHASE_7_1_DEVICE_TOKENS.md) | Schema + 2 API token, logout/revoke | 7.0 |
| 7.2 | [Inbox → durable push delivery](PHASE_7_2_PUSH_OUTBOX.md) | Atomic enqueue, cutoff, eligibility | 7.1 |
| 7.3 | [FCM worker và retry](PHASE_7_3_FCM_WORKER.md) | Send, retry/dead-letter, metrics | 7.2 |
| 7.4 | [FE contract và web push](PHASE_7_4_WEB_HANDOFF.md) | SW/foreground/click/logout contract | 7.1 + 7.3 |
| 7.5 | [Nghiệm thu và rollout](PHASE_7_5_ACCEPTANCE_ROLLOUT.md) | Local gates, browser/VPS evidence | 7.0–7.4 |

Mỗi slice có 4 tasks và 4 AC: tổng **24 tasks / 24 AC**, tất cả TODO.
BE có thể bàn giao API 7.1 trước; không đánh dấu toàn phase done trước browser/VPS gates.

## 4. Kiến trúc và transaction

```text
message commit → NOTIFICATION job → ChatNotificationsService.fanout
                                      │ PostgreSQL transaction
                                      ├─ notifications (existing inbox)
                                      └─ notification_push_deliveries (new, unique)
                                                │ after commit
                           claim lease → current rights/session/token/read check
                                                │ no DB transaction across network
                                          FCM Admin adapter
                                                │
                               Web SDK / service worker → refetch inbox
```

- Tạo module `PushNotificationsModule` sở hữu registry/delivery/worker/adapter.
  ChatModule import public enqueue provider của module này. Push module nhận public
  eligibility provider từ composition wiring; không import ChatModule ngược lại.
  Giữ endpoint inbox ở ChatModule, không có hai controller cùng route.
- Refactor tối thiểu public chat scope nếu cần dùng chung; không copy SQL quyền
  sang push worker. Nêu rõ graph DI và source lock order trước implementation.
- Fanout insert notification và enqueue delivery bằng cùng EntityManager. Dùng
  notification hiện hữu sau `ON CONFLICT` để sửa được crash/retry, nhưng unique
  delivery không cho enqueue trùng. Không gọi FCM trong fanout/HTTP transaction.
- Chỉ enqueue khi message gốc tạo từ `PUSH_ACTIVATED_AT` trở đi, chưa read, chưa hết hạn và
  installation active tại thời điểm fanout. Dữ liệu inbox cũ không bị replay push.
  Đăng ký thiết bị mới không đẩy lại inbox trước đó. Một message delayed quá TTL bị skip.
- Push failure không làm rollback message/inbox và không block Socket.IO. NOTIFICATION
  chỉ hoàn thành khi inbox + enqueue commit; provider failure thuộc worker riêng.
- Auth logout/session revoke chặn send qua current session check kể cả cleanup registry
  trễ. Không giữ source locks trong lúc gọi mạng; quyền bị revoke sau khi provider
  nhận không thu hồi được push đã xếp bên ngoài. Payload generic và TTL ngắn giảm lộ dữ liệu.

## 5. Schema đề xuất

Migration additive sau catalog hiện tại; không sửa migrations đã chạy. Dùng typed SQL
nhất quán module Chat hiện tại, TypeORM migration sở hữu schema, `synchronize=false`.
Cập nhật `document/mindy_center_full.dbml` khi thực sự triển khai, chưa sửa DBML lần planning.

### `push_installations`

| Cột | Kiểu/constraint đề xuất | Ý nghĩa |
|---|---|---|
| id | UUID PK, client UUIDv4 | Installation ID ổn định qua reload trong một browser profile |
| user_id / session_id | UUID FK users / auth_sessions, NOT NULL | Owner từ cookie, không nhận qua body |
| platform | varchar, CHECK WEB | V1 chỉ web |
| token_ciphertext / nonce / auth_tag / key_version | bytea/bytea/bytea/int | FCM token mã hóa AEAD có thể giải mã để gửi |
| token_fingerprint | bytea UNIQUE, NOT NULL | HMAC purpose riêng để tìm token, không log raw token |
| generation | bigint > 0 | Tăng khi đổi token hoặc bind session, trả API dạng decimal string |
| status | ACTIVE / REVOKED / INVALID / STALE | Chỉ ACTIVE có thể gửi |
| last_seen_at / created_at / updated_at | timestamptz(3) | Freshness server clock, UTC |
| revoked_at | timestamptz(3), nullable | Theo logout/opt-out/invalid cleanup |

Index `(user_id,status,last_seen_at)` và `(session_id,status)`. Crypto key riêng với
chat keys, có version/rotation; HMAC fingerprint v1 cố định trong rollout đầu, rotation
fingerprint cần migration dual lookup riêng. Không dùng SHA thuần hoặc log ciphertext.
Token uniqueness áp toàn registry: token/installation thuộc user khác trả conflict,
không silently chuyển owner. Account switch: thu hồi + `deleteToken` tại FE rồi lấy
token mới; nếu stale conflict thì bỏ push và cho retry chủ động, không ép rebind.
Owner cũ có thể reactivate installation của mình bằng token mới và session hợp lệ.

### `notification_push_deliveries`

| Cột | Kiểu/constraint đề xuất | Ý nghĩa |
|---|---|---|
| id | UUID PK | Delivery ID nội bộ |
| notification_id | UUID FK notifications | Inbox là source |
| installation_id / installation_generation | UUID FK / bigint > 0 | Token binding snapshot, không gửi bằng generation khác |
| status | PENDING / RUNNING / SENT / SKIPPED / DEAD | SENT chỉ có nghĩa provider đã accept |
| attempts / next_attempt_at | int >= 0 / timestamptz(3) | Durable retry |
| lease_token / lease_until | UUID / timestamptz(3), nullable | Worker fencing |
| expires_at | timestamptz(3) | created_at message gốc + TTL, đề xuất 5 phút; fanout trễ không gia hạn |
| provider_message_id / last_error_code | varchar nullable, giới hạn | Metadata allowlist, không raw provider response/token |
| created_at / completed_at | timestamptz(3) / nullable | Vận hành và retention |

UNIQUE `(notification_id,installation_id,installation_generation)`;
index `(status,next_attempt_at)` và lease expiry. Không nhân bản message body/token
vào delivery. Recheck owner từ notification và installation; generation đổi thì SKIPPED,
không tự chuyển job sang token/session mới. Thêm CHECK trạng thái/lease và FK deletion
policy giữ được inbox retention 90 ngày hiện tại; purge terminal deliveries trước inbox.

## 6. Token, auth và dữ liệu gửi

- Hai API proposed dùng access cookie, AccessTokenGuard/RolesGuard/RequestOriginGuard,
  STUDENT/MENTOR ACTIVE, current auth session; exact Origin allowlist cho mutation.
  Installation UUID không phải bằng chứng quyền. Rate limit đề xuất 20 mutations/phút/session.
- PUT idempotent với cùng binding/token, chỉ tăng lastSeenAt; đổi token/session tăng
  generation atomic. Hai PUT concurrent khóa row/unique fingerprint, không mất revoke.
- DELETE chỉ owner + session đang bind, lặp trả 204. Logout revoke registry session đó;
  logout-all revoke toàn bộ sessions. Password reset/suspension/role change/session expiry
  đều bị current eligibility check chặn trước send, cleanup có thể chạy sau.
- Revoke DELETE cũ phải có expected generation để không vô hiệu token mới do race.
  Giới hạn 10 installation trả 409, không tự đá thiết bị khác.
- Payload data v1: `{schemaVersion:"1",notificationId:"<uuid>"}`. Không chứa user/session,
  conversation/message IDs; app mở inbox rồi lấy target qua REST đã authorize.
  Generic title/body được cố định phía server. Data values đều string.
- V1 dùng notification + data cho background hiển thị mặc định. Foreground `onMessage`
  refetch, chỉ một cơ chế toast; SW không gọi thêm showNotification cho cùng payload.
  Web notification tag theo notificationId; duplicate ngoài provider vẫn có thể xảy ra.
- Click URL là `FRONTEND_BASE_URL` + route inbox FE chốt tại 7.0; HTTPS production,
  allowlist server, không nhận URL từ client hoặc nội dung chat. Không nhúng auth token.

## 7. Worker, retry và vận hành

- Claim `FOR UPDATE SKIP LOCKED`, lease 30 giây; request deadline ngắn hơn lease,
  lease renewal nếu cần. Complete/fail có lease token fencing, không cho worker cũ ghi.
- Mỗi lần gửi kiểm account/role/session, owner+generation/status, notification chưa
  read/visible, message không deleted, source entitlement/history window và TTL.
  Sender/new joiner bị exclude từ fanout; không giả manager có quyền chat.
- Timeout có thể xảy ra sau provider accept: retry có thể gửi trùng. Hệ thống chỉ bảo đảm
  một logical delivery DB; không hứa exactly-once push hoặc client đã đọc/đã nhận.
- Unregistered token: INVALID và skip future jobs. INVALID_ARGUMENT chỉ invalid token
  khi xác định payload hợp lệ; malformed payload đưa DEAD/alert, không xóa hàng loạt token.
- 429/500/503/timeout: exponential backoff + jitter, tôn trọng Retry-After; quota429
  khởi đầu tối thiểu 60 giây. Tối đa 8 attempts và không vượt expires_at. TTL hết → SKIPPED.
  Auth/project/sender mismatch: DEAD/alert cấu hình, không retry nóng hoặc invalidate cả registry.
- Replay DEAD: CLI giới hạn/dry-run, vẫn kiểm quyền/TTL/generation; không hồi sinh delivery cũ.
  Retention đề xuất terminal deliveries 30 ngày, STALE khi 30 ngày không refresh; purge
  token revoked/invalid theo policy và FK/retention đã kiểm. Đăng nhập/return focus refresh registry.
- Metrics: pending age/count, attempts, provider accepted, skipped theo reason,
  invalid token, DEAD, latency. Logs chỉ internal IDs/error allowlist, không raw payload/secrets.

## 8. Cấu hình và rollout đề xuất

| Cấu hình | Mặc định / trách nhiệm |
|---|---|
| PUSH_ENABLED | false; API registration và enqueue off khi false |
| PUSH_WORKER_ENABLED | false; chỉ worker off, inbox/socket vẫn hoạt động |
| PUSH_ACTIVATED_AT | UTC ISO timestamp bắt buộc khi bật enqueue, cutoff cố định |
| FIREBASE_PROJECT_ID | Server project đúng môi trường |
| GOOGLE_APPLICATION_CREDENTIALS | ADC/secret file mount server; không commit JSON key |
| PUSH_TOKEN_KEYRING / PUSH_TOKEN_ACTIVE_KEY_VERSION | Secret server, riêng purpose chat |
| PUSH_TOKEN_FINGERPRINT_KEY | Secret HMAC ổn định v1 |
| PUSH_WEB_INBOX_PATH | Relative path đã chốt với FE, reject // hoặc absolute URL |
| PUSH_TTL_SECONDS | 300, validate 60..3600; worker còn kiểm expiry DB |

Đây là **env dự kiến**, chưa thêm vào `.env.example`. Khi flags tắt, không initialize
Firebase client hoặc cần credentials. Khi bật mà config sai, fail startup rõ ràng,
không chạy worker giả healthy. Cần cả CHAT_ENABLED/CHAT_JOB_ENABLED để có fanout chat.
BE cài/pin `firebase-admin` và lockfile trong implementation; FE tự pin SDK web phù hợp.
FE nhận public Firebase web config và public VAPID key; private service account/VAPID
private key không ra browser. Staging/prod tách project/token/secret.

Rollout: migrate additive → deploy flags off → kiểm guards/DB → cấu hình staging
Firebase + FE HTTPS/SW → bật registration/enqueue với cutoff mới → bật worker canary
→ nghiệm thu → mở rộng. Không gửi bù tin trước cutoff. Rollback tắt PUSH_ENABLED và
PUSH_WORKER_ENABLED rồi restart/deploy process để đọc config mới. Worker kiểm gate
trước request; không giả thay file env sẽ hot-reload process đang chạy.
Giữ inbox/socket và dữ liệu delivery để điều tra. Push đã provider accept không recall được.

## 9. Gate hoàn tất

1. Đủ 24 AC với test/evidence, clean migration + populated upgrade + repeat no-op.
2. `pnpm check`, `pnpm test:http`, focused push suites trên DB `_test` riêng; fake adapter,
   không gọi Firebase thật ở automated tests. Regression Phase 6/Files/Payments còn pass.
3. Swagger/Postman/runtime/flow cùng revision; token fields được redaction trong logs và docs.
4. Browser staging HTTPS: foreground/background/click, denied permission, unsupported,
   multi-tab, token rotate, logout/account switch và quyền bị thu hồi.
5. VPS: credentials/IAM thực, rollout/rollback, retry/dead-letter/metrics evidence; BE test
   pass không chứng minh browser nhận. Progress ghi riêng local, FE và VPS sign-off.

## 10. Nguồn Firebase đối chiếu ngày 2026-10-27

- [Web setup: HTTPS, permission, VAPID, service worker](https://firebase.google.com/docs/cloud-messaging/web/get-started).
- [Foreground/background và click HTTPS](https://firebase.google.com/docs/cloud-messaging/web/receive-messages).
- [Admin SDK và Application Default Credentials](https://firebase.google.com/docs/admin/setup).
- [Token freshness và invalid-token handling](https://firebase.google.com/docs/cloud-messaging/manage-tokens).
- [FCM error codes, backoff và Retry-After](https://firebase.google.com/docs/cloud-messaging/error-codes).

Giới hạn TTL, device count, retry attempts và retention trong plan là lựa chọn của
dự án, không phải bảo đảm delivery của Firebase. Recheck SDK/version khi implementation.
