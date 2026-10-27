# Phase 6 — Chat rollout, recovery và vận hành

## Evidence Docker — 2026-10-26

Dev database đã backup rồi migrate16→32, repeat no-op. Backend local acceptance **39/39 AC complete**; full check691/691, HTTP117/117 và restore/ops PASS. [Progress6](progress/phase%206/PHASE_6_PROGRESS.md#docker-acceptance-2026-10-26) có24 revoke barriers/contract-log harness và source fingerprint. FE/VPS/production storage credential/IAM/load smoke vẫn cần evidence riêng.

Rehearsal hiện kiểm thêm compiled metrics/backfill dry-run/apply/replay DEAD dry-run/apply (limit10), giữ message snapshot và xác nhận job replay về PENDING/attempts0. Test-only HTTP resume fixture giữ DB, kill sau commit trước ack hoặc sau emit trước complete, recover receipts/keys/dedupe; disabled rollback giữ auth/message/receipt. Các điều khiển IPC chỉ ở test fixture, không thêm API runtime.

Docker services giữ chạy cho phát triển; không chạy schema-reset tests trên mindy_center. Test URL phải kết thúc _test, bucket riêng -test. Backup dev chứa dữ liệu nội bộ nên giữ trong tmp ignored, không commit.


2026-10-24 · source local, chưa deploy. [Progress](progress/phase%206/PHASE_6_PROGRESS.md) · [API](api_flow/PHASE_6_flow-api-breakdown.md).

## Cấu hình và thứ tự bật

Local27/10: đã backfill10/10 classes và lưu CHAT_ENABLED/CHAT_JOB_ENABLED=true trong .env ignored. API đang chạy trước thay đổi config cần restart để worker nhận cờ mới; ConfigModule cache không tự reload .env. Stop/start tự động đã bị policy review chặn, nên activation/live worker check đang chờ user restart terminal API. Xem Progress6; không ghi việc chỉ đổi .env thành worker đã chạy.

1. Backup DB và keyring của môi trường vào hai nơi riêng có ACL; xác nhận restore trước rollout. Không dùng DB production để chạy tests.
2. Build, kiểm migration manifest và chạy compiled migration runner theo quy trình deploy hiện hữu. Ba migration additive 1792800000000..2 tạo chat/outbox/jobs/attachments và mở namespace chat trong receipt store chung. Không sửa migration cũ.
3. Deploy với CHAT_ENABLED=false, CHAT_JOB_ENABLED=false, CHAT_ATTACHMENTS_ENABLED=false. Auth/payment cũ không cần chat secret khi disabled.
4. Cấp CHAT_ENCRYPTION_KEYS từ secret store: JSON object version dương → canonical Base64 của key32 bytes; CHAT_ENCRYPTION_ACTIVE_KEY_VERSION phải tồn tại. Không dùng JWT key. Không ghi key vào Git, Postman, DB hoặc log.
5. Bật CHAT_ENABLED trên một instance staging, để workers tắt. Chạy backfill dry-run, review bounded IDs/cursor, rồi apply theo từng batch. CHAT_ENABLED=true thiếu key hợp lệ phải fail startup.
6. Bật CHAT_JOB_ENABLED; kiểm metrics/dead letters. Group provision eventual: FE retry503 theo API contract. Khi các gate storage/binary đã đạt, cấu hình private versioned MinIO và bật CHAT_ATTACHMENTS_ENABLED; MINIO_ENABLED cũng phải true.
7. Thực hiện smoke hai tài khoản/tabs, sau đó mới thực hiện quy trình enable production của owner. Source/local gates không phải evidence production.

Không mở nhiều replicas: socket registry/quota/fanout routing hiện ở một instance. Redis adapter đơn thuần chưa đủ để chuyển các invariant này sang distributed operation.

## TLS, proxy và client

- Backend qua TLS/WSS, namespace /chat, engine path /socket.io. Proxy phải forward Upgrade/Connection và giữ timeout vượt heartbeat; không gắn REST /api/v1 vào socket path.
- Client dùng socket.io-client4, transports websocket và credentials. Access cookie cùng host backend, exact Origin phải nằm trong CORS_ORIGINS. Không JWT/refresh token trong URL hoặc socket payload.
- Refresh bằng HTTP auth hiện có rồi reconnect. Token-expiry timer và passive audit mỗi giây ngắt session/account hết hiệu lực. Từng event gửi tới từng socket còn kiểm source rights; room không phải authority.
- Subscription tối đa20/socket,5 sockets/user, packet32KiB. Send20/phút/user và burst5/giây dùng chung HTTP/WS; typing1/2s/user/conversation, TTL5s.
- FE join/buffer trước snapshot, catchup từ highWatermark, dedupe eventId/messageId/version. Ack chỉ persisted. Reconnect phải refetch capabilities/inbox/count; cursor hết retention410 cần snapshot mới.

## Maintenance

Chạy sau build, với DATABASE_URL của môi trường được chỉ định và config hợp lệ. Command không có --apply là dry-run. Tool tắt toàn bộ background jobs trước khi tạo AppModule context.

```text
pnpm chat:maintenance metrics
pnpm chat:maintenance backfill --limit=20
pnpm chat:maintenance backfill --limit=20 --after=<UUIDv4> --apply
pnpm chat:maintenance rotate --limit=20
pnpm chat:maintenance rotate --limit=20 --after=<message-UUIDv4> --apply
pnpm chat:maintenance replay --limit=20
pnpm chat:maintenance replay --limit=20 --after=<job-UUIDv4> --apply
pnpm chat:maintenance retention --limit=20
pnpm chat:maintenance retention --limit=20 --after=<conversation-UUIDv4> --apply
```

Cursor UUID phải từ report của batch trước. Limit1..100. Backfill không gửi notification hàng loạt; existing membership/read/history giữ nguyên. LIFECYCLE consumer luôn reconcile current source nên event cũ không phục hồi entitlement đã revoke.

Metrics trả counts/oldest theo consumer/status, encryption usage và receipt key dependencies. Theo dõi oldest PENDING/RUNNING, DEAD, UPLOAD PROCESSING kéo dài, quota/auth rejects và file orphan backlog; alerting infrastructure bên triển khai nối vào các chỉ số này. Job claim SKIP LOCKED, lease30s, capped retry8 lần; stale lease không complete được job. Replay bounded, idempotency/unique constraints vẫn áp dụng; không tự replay fanout vô hạn.

## Rotation và restore

1. Phân phối key V2 cùng V1 đến instance, verify secret store/backup trước khi đổi active.
2. Chuyển active V2: ghi mới V2, vẫn đọc V1/V2. Reserve DB counter từ chối vượt1 triệu encryptions/key, không tái dùng IV cho edit/rotation.
3. Chạy rotate dry-run rồi apply các batch. Tool khóa conversation/message, kiểm lại version/key/deleted trước re-encrypt, giữ message version/sequence/content identity.
4. Kiểm metrics. Không retire V1 chỉ vì không còn message V1: HMAC receipts và backup cũ vẫn cần V1. Không tự xóa receipts/tombstone để retire key.
5. Restore DB và keyring riêng vào môi trường test; wrong key phải fail closed. Backup DB không kèm keyring không đủ khôi phục nội dung. Mất key không có plaintext fallback.

Rehearsal tự động chỉ dùng local TEST_DATABASE_URL kết thúc _test. Cần pg_dump/pg_restore cùng major server; PG_BIN_DIRECTORY có thể trỏ thư mục chứa binaries. Tool tạo hai DB tên ngẫu nhiên _test, migrate/repeat no-op, rotate bằng compiled CLI, dump/restore và kiểm cả decrypt/receipt/wrong-key; sau đó xóa đúng DB/scratch của chính lượt này. Không dùng deployment DB URL.

```text
pnpm build
pnpm chat:restore:rehearsal
```

## File lifecycle

CHAT dùng owner model riêng, không cấp CourseUnit giả hoặc mở Materials FilesController cho student. F1 receipt giữ fileId khi pending retry; PUT URL tối đa5 phút, intent15 phút. Complete pin staging version trước khi queue, validation chỉ JPEG/PNG/WebP<=5MiB hoặc PDF<=10MiB, MIME/size/content thật phải khớp.

Network copy/head/sign/read ngoài DB transaction. Mỗi attempt ghi copy candidate; worker renew lease và READY chỉ commit khi vẫn sở hữu lease. Send khóa file READY đúng owner/conversation/type. Download authorize visible message trước/sau signing, URL attachment60s; URL đã phát có thể sống tới TTL sau revoke. Binary encryption at storage là cấu hình độc lập, không phải E2EE/AES body.

Worker enqueue orphan cleanup sau24h, claim và khóa/recheck live message refs trước khi chuyển DELETING; send không attach được file đang cleanup. Storage failure giữ job retry, không xóa live file. Xóa message giữ tombstone/receipt, mất quyền cấp URL mới.

Provision script đã thêm s3:DeleteObjectVersion chỉ cho chat-staging/* và chat-final/* để backend cleanup đúng phiên bản; không cấp delete cho material/assignment prefixes. Owner cần áp dụng IAM policy này khi rollout, rồi nghiệm thu bằng backend credentials (local fixtures dùng storage test credentials).

Bucket lifecycle riêng cần dọn chat-staging current/noncurrent versions sau grace đủ lớn (đề xuất7 ngày), vì incomplete PUT/overwrites không có pinned version trong DB. Copy crash trước khi lưu versionId cần kiểm candidate prefix/version qua công cụ storage có quyền quản trị; không sweep toàn bộ chat-final vì có live messages. Đây là giới hạn cleanup cần giữ trong handoff.

## Retention và rollback

- Events90 ngày; maintenance cập nhật pruned-through floor để cursor cũ trả410. Completed jobs30 ngày; notifications90 ngày. CLI bounded, cần lịch vận hành của owner; không tự thêm automation trong app.
- Không purge message content, receipts hoặc tombstones trong v1. Generic notification chỉ IDs; không copy message body. Log IDs/error codes/counts, không plaintext/token/cookie/key/signed URL.
- Rollback code: disable traffic/workers/attachments, giữ additive tables và keyring. Foundation/attachment down từ chối khi đã có history; không down production để xóa chat.

## Acceptance và local gates

```text
pnpm check
pnpm test:http
pnpm test:chat
pnpm test:chat:socket
pnpm chat:restore:rehearsal
```

Các DB/bucket phải isolated. Repo compose/CI dùng PostgreSQL17, Node22.20.0; PG18 đổi SQLSTATE RESTRICT ở một số test cũ, không sửa migration/test chỉ để che mismatch môi trường. Không tính skipped suites là PASS.

Smoke bàn giao: CASH preview→group/DM→confirm giữ history; PayOS pending deny/verified activation grant; expiry/reassign/logout khi socket im lặng; reconnect/lost ack/edit/delete/read/inbox; ảnh/PDF PUT→READY→send→download→delete/revoke; invalid Origin/key/foreign IDs deny. FE browser, TLS proxy/VPS, tải lớn và crash-barrier exhaustive phải được ghi bằng evidence môi trường riêng.
