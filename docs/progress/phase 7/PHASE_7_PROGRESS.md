# Phase 7 — Firebase notification progress

## Local implementation 2026-10-27

**Backend 7.0–7.3 implemented; 7.4 BE handoff delivered; 7.5 local gates verified separately from FE/Firebase/VPS pending. Phase7 release chưa đóng.**

### Source và quyết định

- Module `src/modules/push-notifications/`: installation registry/DTO/controller, token AEAD/HMAC, durable outbox, worker, ADC/HTTP v1 adapter, public eligibility hook và maintenance CLI.
- Migration additive `1793059200000-push-notifications.ts`: registry/delivery/rate-budget tables, constraints/indexes, session revoke trigger. Cùng transaction logout/logout-all/reuse revoke; current session check vẫn chặn expiry/suspension/role change. DBML bổ sung cả auth session snapshot đang được registry tham chiếu.
- `ChatModule → PushNotificationsModule → AuthModule`; `ChatPushPolicy` bind public scope checker, tái dùng `ChatAccessService`, không copy business entitlement SQL và không có import Chat ngược từ Push.
- Fanout giữ conversation lock như baseline; inbox + enqueue dùng cùng EntityManager. Registry lock session → owner advisory → installation; budget reserve riêng qua session advisory để conflict vẫn tính vào rate. Worker lease/fencing riêng; không giữ DB/source locks khi gọi provider.
- Web CHAT_MESSAGE, TTL300s, quota10 installation, 20 validated mutations/phút/session, inbox route `/notifications`. Route/origin/public SDK/VAPID/SW cần nhóm FE xác nhận trước staging. Worker không dùng socket-online để suppress.
- Admin SDK14.5.0 dùng ADC; HTTP v1 request abort sau10s, ADC lookup deadline10s, trừ thời gian lấy credential khỏi TTL. Worker quản retry/backoff+jitter/Retry-After/max8; invalid payload/config không invalidate token. Raw HTTP dùng `webpush.fcm_options`, không gửi camelCase SDK field.
- Ciphertext có AAD installation/version; HMAC purpose riêng, keyring riêng chat. Generation/session/token/status đổi làm jobs cũ skip; generation_started_at và prior-delivery check ngăn fanout retry đẩy history sang binding mới. AES key rotation giữ fingerprint/generation.
- Swagger/P1/P2 và nhóm Postman Phase7 dùng chung collection Chat Phase6 đã cập nhật. [Runtime API](../../api_flow/PHASE_7_flow-api-breakdown.md), [flow](../../api_flow/PHASE_7_FLOW.md), [runbook](../../PHASE_7_FIREBASE_RUNBOOK.md) cùng source revision.

### Evidence local

Môi trường: PostgreSQL17 và MinIO test containers hiện hữu; `TEST_DATABASE_URL` trỏ database riêng `mindy_center_test`, fixtures tạo databases hậu tố `_test`. Không migrate database dev hoặc production. Không sử dụng credential/token Firebase thật.

| Gate | Evidence |
|---|---|
| Unit/config/crypto/provider | `src/modules/push-notifications/push.spec.ts`: 16 PASS; flags-off không init Firebase/network, invalid keys/config/URL, AAD/tampering, generic payload, mapped failures/backoff |
| PostgreSQL feature | `test/integration/phase7-push.spec.ts`: 33 PASS; clean/repeat/populated migration down/up giữ inbox; concurrent PUT/rotate/delete, quota/rate/session revoke, atomic rollback/replay, source eligibility/barriers, lease reclaim/fencing, provider failures/max8/TTL, retention/dry-run/key rotation, cross-account registration race và provider-accept/DB-completion recovery |
| Compiled HTTP feature | `test/http/phase7-push.spec.ts`: 6 PASS; real guards/Origin/DTO/UUID/8KiB/ownership/generation/Retry-After/Swagger/logout và token canary redaction |
| HTTP v1 transport | Postman CLI1.77.0 simulation + `tools/push/verify-fcm-simulation.mjs`: 6/6 PASS (200/400/403/UNREGISTERED/429/503, Retry-After90s, dummy auth, generic payload và REST casing). Không publish mock/workspace. [Context](../../../postman/simulations/phase7-fcm.context.md) |
| Full check | `pnpm check` trên Node22.22.0: 80 suites / 739 tests PASS, 0 skipped; lint/type-check/build PASS, 33 compiled migration artifacts. Log local `tmp/phase7-check-node22.log`. Sau hardening completion DB, lint/type-check và focused push49/49 PASS (`tmp/phase7-final-targeted.log`); không suy thành full740 chưa chạy |
| Full HTTP | `pnpm test:http` trên Node22.22.0: 13 suites / 123 tests PASS, 0 skipped; log local `tmp/phase7-http-final.log`; build33 migration artifacts PASS |

`SENT` chỉ provider accept. Fake-provider/unit/transport simulation không chứng minh ADC/IAM, token hợp lệ tại Firebase, browser received hoặc user read. Chưa có deployment/live-send/FE sign-off.

### AC matrix — 24 criteria

PASS ở bảng này là **local backend**; không thay browser/VPS evidence. Plan slices7.0–7.3 tick local AC tương ứng.

| AC | State | Evidence / phần còn thiếu |
|---|---|---|
| AC7.0-1 | PASS local | Chat→Push→Auth DI, HTTP full app boot và existing inbox routes giữ nguyên |
| AC7.0-2 | PASS local | Disabled config/crypto/adapter startup test; baseline HTTP flags-off |
| AC7.0-3 | PASS local | Invalid enabled config/keyring/link rejected; startup ADC deadline/error sanitization; HTTP canary |
| AC7.0-4 | PASS local | DI provider override; generic payload unit + HTTP transport mock contract |
| AC7.1-1 | PASS local | Parallel PUT idempotency, rotate/rebind/reactivate generation, same replay |
| AC7.1-2 | PASS local | PG ownership/fingerprint conflicts; HTTP role/Origin/DTO/foreign DELETE |
| AC7.1-3 | PASS local | Concurrent rotate vs stale DELETE, logout/current/all sessions, revoked principal |
| AC7.1-4 | PASS local | AAD crypto/tamper, quota10, shared PG rate20, migration upgrade/repeat preserving inbox |
| AC7.2-1 | PASS local | Crash-before-commit rolls back inbox/delivery; retry-after-commit logical delivery unique |
| AC7.2-2 | PASS local | CASH pending source scopes, sender excluded; read/deleted/revoked/current history checks, Phase6 regression |
| AC7.2-3 | PASS local | Future cutoff/TTL, new installation after fanout, generation rotation followed by fanout replay |
| AC7.2-4 | PASS local | Flag-off preserves inbox, read-before-fanout, provider only worker/failure independent of message |
| AC7.3-1 | PASS local | Two concurrent claims, expired lease reclaim, stale completion fenced; provider accepted rồi DB completion fail được reclaim/retry, giữ một logical row |
| AC7.3-2 | PASS local | Read/cursor/delete/leave/logout/rotate/suspend/role/expiry/session/source blocks provider; read/rotate/logout barrier during scope query |
| AC7.3-3 | PASS local | UNREGISTERED isolated, INVALID_PAYLOAD/CONFIG DEAD, quota>=60s, Retry-After90s, timeout/max8/TTL |
| AC7.3-4 | PASS local | Flags/shutdown gates, sanitized accepted/error logs, bounded metrics/CLI/retention, key rotation preserving binding; restore procedure in runbook |
| AC7.4-1 | PENDING FE | User gesture/denied/unsupported browser evidence |
| AC7.4-2 | PENDING FE | Socket+FCM foreground dedupe and single background display |
| AC7.4-3 | PENDING FE | Click/login/refetch/hidden target; no auto-read browser behavior |
| AC7.4-4 | PENDING FE | Multi-tab/device/logout/account switch on staging HTTPS |
| AC7.5-1 | PASS local | Node22 full check739, targeted push49 sau hardening, full HTTP123, 0 skipped; migrations giữ inbox/auth và repeat no-op |
| AC7.5-2 | PASS local | Runtime/OpenAPI routes, Postman mutations, redaction/DTO/Origin tests |
| AC7.5-3 | PENDING VPS | Real staging ADC/IAM/send, rollback rehearsal/queue metrics |
| AC7.5-4 | PENDING release | Local matrix delivered; requires FE/VPS evidence above before whole-phase completion |

### Lịch sử kiểm chứng và giới hạn

- Lượt HTTP đầu:122 PASS/1 fail vì test parity collection cũ giả URL luôn là string trong khi hai request mới dùng object. Đã thống nhất URL string và cập nhật route parity19→21; không sửa business chat để né assertion.
- Lượt HTTP Node22 tiếp theo bị3 lỗi beforeAll/23 skipped do chạy đồng thời build khác, thư mục dist bị thay trong lúc child process import data-source. Đây là lỗi điều phối kiểm tra local; lượt cuối chạy tuần tự sau build/check hoàn tất. Không dùng lượt có skips làm acceptance evidence.
- Chuẩn runtime cuối: Node22.22.0 (engines>=22.20,<23), pnpm12.6.0, PostgreSQL17/MinIO local. Các lượt check737 trên host Node24 trước đó chỉ là evidence phụ, không thay gate Node22.
- CLI compiled đã smoke `metrics`, `retention --limit=5`, `replay --limit=5` (hai lệnh sau dry-run) trên database `_phase7_http_test`; output chỉ counts/status/key versions.
- Final source fingerprint28 paths (runtime/migration/config/package/lock/Postman/tests): SHA256 `445ffb44510ae2f74a133ba2c83e5b8aacf08c1fa9b7b9cb6e1cc2fcd1d0a6f2`. Manifest local `tmp/phase7-source-fingerprint.json`; tính SHA256 bằng cách nối từng path UTF8 đã sort, NUL, raw bytes file, NUL. Không bao gồm tài liệu/progress hoặc secrets.
- Final feature gates:33 PG +16 unit =49 PASS;6 HTTP mới nằm trong full123 PASS; HTTP v1 simulation6/6 PASS chạy lại trên Node22 với build cuối. `git diff --check` và57 local Markdown targets PASS. Không chạy full740 sau khi thêm ca provider-accept/DB-completion cuối; bằng chứng sau ca sửa đó là lint/type-check, focused49, build và fullHTTP123.

### Handoff còn lại

Nhóm FE triển khai SDK/SW trong repo FE và xác nhận route/public Firebase config/VAPID/browser matrix tại runbook. VPS rollout chạy migration33, deploy flags-off, cấu hình ADC/keyring/project/cutoff, canary rồi nghiệm thu provider accept và browser receipt riêng. Notification lịch/assignment/material/payment vẫn backlog; yêu cầu mail trong Flow.txt giữ nguyên.

## Planning archive — trước implementation

**Cập nhật2026-10-27 · PLANNED — 0/24 tasks, 0/24 AC được nghiệm thu.**
[Plan](../../implement_phase/phase%207/PHASE_7_FIREBASE_NOTIFICATIONS.md) ·
[Flow](../../api_flow/PHASE_7_FLOW.md) ·
[API proposal](../../api_flow/PHASE_7_flow-api-breakdown.md).

## 1. Công việc lượt này

Theo yêu cầu lập Phase7 notification bằng Firebase, đã đối chiếu Flow.txt, quy tắc
repo, source inbox/jobs/auth và docs Firebase chính thức. Tạo plan tổng +6 slice,
flow,2 API token đề xuất và FE handoff; liên kết từ index phase và Progress chung.
Baseline `2533b00`. Phase6 đã có generic inbox/Socket.IO trong ChatModule; Phase7
bổ sung FCM web push, không dựng lại inbox hoặc đổi read semantics.

CHAT_MESSAGE/web v1, TTL5phút, max10 installation và schema/env chi tiết là defaults
đề xuất cho implementation. Lịch/assignment/payment notifications là backlog cần
event/recipient/template riêng; không thay yêu cầu email đã có trong Flow.txt.

## 2. Theo dõi slice

| Slice | Tasks | AC | Implementation | Local tests | Browser/VPS |
|---|---|---|---|---|---|
| 7.0 Contracts/Firebase | 7.0-T01–T04 | AC7.0-1–4 | TODO | Chưa chạy | Pending |
| 7.1 Installation/token | 7.1-T01–T04 | AC7.1-1–4 | TODO | Chưa chạy | Pending |
| 7.2 Inbox/outbox | 7.2-T01–T04 | AC7.2-1–4 | TODO | Chưa chạy | Pending |
| 7.3 FCM worker | 7.3-T01–T04 | AC7.3-1–4 | TODO | Chưa chạy | Pending |
| 7.4 FE handoff | 7.4-T01–T04 | AC7.4-1–4 | TODO | Chưa chạy | Pending |
| 7.5 Acceptance/rollout | 7.5-T01–T04 | AC7.5-1–4 | TODO | Chưa chạy | Pending |

Mỗi AC cần evidence test/log/revision tại file slice khi triển khai. Không tick bởi
chỉ có plan/source hoặc provider trả message ID. Phase6 results không tính là test FCM.

## 3. Gate trước implementation và release

- Chốt DI/lock graph, inbox route/SW scope/public Firebase config với FE; giữ chat v1
  defaults trong plan trừ khi user mở rộng nghiệp vụ. Không cần credentials thật để code/test BE.
- Thực hiện theo7.0→7.1→7.2→7.3→7.4→7.5. Migration additive/DBML và pin dependency
  chỉ khi implementation. Không migrate database hoặc sửa `.env` trong planning.
- Automated tests dùng fake provider/dedicated `_test` database; local full gates,
  browser HTTPS staging, credentials/IAM VPS và rollout/rollback ghi riêng.
- Firebase SDK/SW trong repo FE do nhóm FE thực hiện; chưa có browser sign-off.

## 4. Kiểm chứng planning

PASS:10 tài liệu mới,6 slice/24 task IDs duy nhất/24 AC IDs duy nhất,38 local links
trong tài liệu mới; code fences cân bằng, không trailing whitespace; git diff --check PASS.
Các liên kết mới từ index/progress chung trỏ tới tài liệu đã có. Chưa cài package, thêm runtime/migration,
cấu hình Firebase, gửi push thật, chạy `pnpm check`/HTTP tests hoặc deploy trong lượt này.
