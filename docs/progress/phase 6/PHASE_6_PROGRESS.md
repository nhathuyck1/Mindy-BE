# Phase 6 progress — Chat realtime / Notification

## Kiểm tra sáu integration suites failed — 2026-10-27

Tái hiện pnpm test không có TEST_DATABASE_URL:6 suites failed trong beforeAll,
272 tests passed/419 skipped. Suites phase32-files, phase33-material-authoring,
phase331-manager-materials, phase332-mentor-materials, phase333-material-review,
phase34-student-materials yêu cầu DB test riêng; assertions chưa được chạy.
Đã start PostgreSQL/MinIO containers hiện hữu và chạy pnpm check với
TEST_DATABASE_URL=postgresql://mindy:mindy@127.0.0.1:5433/mindy_center_test.
Cả6 suites PASS117 tests. Full pnpm check PASS: lint/type-check/build PASS,
78 suites/691 tests PASS,0 skipped;32 migration artifacts build/verify PASS.
Không chạy lại HTTP suite trong lượt kiểm tra này. README đã sửa hướng dẫn
dependency và phân biệt suites skip với suites fail khi thiếu biến.
API/flow/schema không đổi. Logs ignored: tmp/test-failures-20261027.log,
tmp/test-check-configured-20261027.log.

## Backfill group chat local — 2026-10-27

Theo yêu cầu user, đã chạy compiled maintenance CLI trên local mindy_center. Trước:10 classes/1 CLASS conversation/1 DM/1 LIFECYCLE PENDING. Sau: **10/10 classes có group, missing_groups0**, giữ1 DM; group lớp Chi vẫn `98f91cca-b59e-4e74-aeb7-15c440ceddbd`, DM vẫn `9e974da1-5aa2-407f-be47-9dd194470d0c`.

Đã build PASS32 migration artifacts, backfill dry-run limit20 thấy10 IDs/cursor null và không ghi group; apply/repeat apply PASS, không duplicate. Snapshot joined_at/visible_from_seq/last_read_seq/last_read_at của4 membership rows ban đầu giữ nguyên. Messages0/notifications0;9 OPEN groups có primary mentor (lớp Chi thêm Student),1 DRAFT group rỗng và source policy vẫn deny. Không tạo notification hàng loạt.

Cấu hình local ignored .env: CHAT_ENABLED=true, CHAT_JOB_ENABLED=true; tạo encryption key version1 vì chưa có key và DB có0 chat messages/0 chat receipts. Key chỉ lưu .env, không đưa vào source/logs/Postman. Không bật attachments hoặc đổi cờ nghiệp vụ khác. Existing source đã có DB lifecycle triggers và worker reconcile current state; không thêm runtime API hoặc scheduler.

**Runtime activation còn chờ restart API.** API cổng3000 là Mindy Center API, PID94336, đang chạy trước khi đổi .env; ConfigModule cache không tự reload các cờ. Hệ thống tự duyệt từ chối command dừng/khởi động lại (blocked by policy, không cung cấp lý do chi tiết); command không thực thi. Không tiếp tục thử cách kill/start khác để vượt chặn. Sau kiểm cuối, jobs vẫn chờ:1 LIFECYCLE,9 REALTIME,9 NOTIFICATION. User cần restart terminal API (Ctrl+C rồi pnpm dev hoặc pnpm start) để worker đọc .env mới. Chưa có evidence auto-consumption trên tiến trình live này.

Logs ignored: tmp/phase6-backfill-dry.log, tmp/phase6-backfill-apply.log, tmp/phase6-backfill-repeat.log; snapshot tmp/phase6-pre-backfill-state.txt và tmp/phase6-post-backfill-state.txt chỉ metadata member, không body/secret. Chỉ thay local config và chạy vận hành; không đổi runtime source, migrate schema, payment state hoặc chạy lại application suites.


## Dữ liệu test local: student Chi vào lớp — 2026-10-27

Theo yêu cầu insert SQL trực tiếp local. UUID user cung cấp `1f9a0b9f-d88d-4ac9-940b-2821998b1d77` là user STUDENT ACTIVE (`student.chi@gmail.com`), không phải class. Đã chọn lớp OPEN còn chỗ `HTML-CSS-101-ON1`, class_id `0d92ff10-6a12-4571-b96f-719707221378`, primary mentor `mentor.frontend@gmail.com` / `08939ff0-7497-421e-9b54-2765789981b4`.

Đã thực thi SQL trong một transaction trên Docker local mindy_center: tạo1 order CASH/PENDING `LOCAL-CHAT-CHI-HTML-ON1`,1 detail theo giá catalog và1 enrollment PENDING_PAYMENT `b66cb5b7-6c62-4867-a8fb-93af1733422d`. Hold48h, expires2026-10-29T01:00:50.659114Z (08:00:50+07:00). Không tạo payment transaction/paid evidence hoặc gửi mail/provider. CASH pending mở chat, không mở materials/quiz.

Provision projections theo source membership rules để test ngay khi workers chưa chạy: group `98f91cca-b59e-4e74-aeb7-15c440ceddbd`, DM `9e974da1-5aa2-407f-be47-9dd194470d0c`, mỗi conversation2 active members Student/Mentor. Group rejoin reset history window, DM giữ lịch sử theo pair; không dùng member rows để thay source authorization. Enrollment trigger vẫn ghi lifecycle outbox/job bình thường.

SQL guard local database, kiểm student/mentor ACTIVE, lớp OPEN/capacity/timetable, dùng locks và giữ existing effective enrollment. Script local ignored: `tmp/phase6-local-student.sql`. Đã chạy lại PASS no-op: order1/detail1/enrollment1/payment_transactions0; source cash deadline/student/class/mentor checks đều true. Không đổi runtime API/schema/flags, không chạy lại application suites cho thao tác fixture này.


## Postman login theo từng nhóm — 2026-10-27

Theo yêu cầu user, collection Phase6 hiện có5 nhóm: Conversations, Messages, Read/Recovery, Notifications, Attachments. Mỗi nhóm có folder đăng nhập gồm Student, Mentor và GET /auth/me. Tổng34 requests =19 nghiệp vụ giữ nguyên +10 login +5 current-user. Credential variables student_email/student_password/mentor_email/mentor_password mặc định rỗng; điền local trong Postman, không export password. Cookie jar tự dùng actor login gần nhất; sửa/xóa và upload/complete/status giữ đúng author/uploader. Không thêm Manager/Admin vì Chat chỉ Student/Mentor.

Verification: parse JSON, exact-preservation cả19 request objects,5 nhóm/10 login/5 me, body login và JS script syntax PASS; credential defaults rỗng. Lint/type-check PASS. Existing HTTP parity check đã hỗ trợ folder đệ quy và loại Auth khỏi19 routes. Không chạy lại HTTP runtime hoặc gửi login bằng tài khoản thật trong lượt collection này; source fingerprint/gates39 AC ở lượt trước là evidence tại checkpoint trước thay đổi Postman/test traversal này. Không đổi runtime API/quyền/schema.


<a id="docker-acceptance-2026-10-26"></a>

## Docker migration và nghiệm thu tiếp — 2026-10-26

**39/39 AC PASS — cả8 slices6.0–6.7 đạt nghiệm thu backend local (R4).** Đã đóng cả4 tiêu chí từng còn thiếu ở mốc35/39; lượt trước Docker là13/39. Checkbox/evidence từng AC ở các plan dưới đây. **FE browser, VPS/TLS/proxy, production storage credentials/IAM và tải lớn chưa có nghiệm thu riêng.**

| Slice | AC PASS | Kết luận |
|---|---|---|
| [6.0 — Contracts/access](../../implement_phase/phase%206/PHASE_6_0_CONTRACTS_ACCESS.md) | 4/4 | PASS local |
| [6.1 — Schema/crypto](../../implement_phase/phase%206/PHASE_6_1_SCHEMA_CRYPTO_FOUNDATION.md) | 5/5 | PASS local |
| [6.2 — Membership/REST](../../implement_phase/phase%206/PHASE_6_2_MEMBERSHIP_REST.md) | 6/6 | PASS local |
| [6.3 — Realtime/recovery](../../implement_phase/phase%206/PHASE_6_3_REALTIME_RECOVERY.md) | 5/5 | PASS local |
| [6.4 — Mutations/read](../../implement_phase/phase%206/PHASE_6_4_MUTATIONS_READ.md) | 5/5 | PASS local |
| [6.5 — Notification inbox](../../implement_phase/phase%206/PHASE_6_5_NOTIFICATION_INBOX.md) | 5/5 | PASS local |
| [6.6 — Attachments](../../implement_phase/phase%206/PHASE_6_6_CHAT_ATTACHMENTS.md) | 5/5 | PASS local |
| [6.7 — Handoff/operations](../../implement_phase/phase%206/PHASE_6_7_HANDOFF_OPERATIONS.md) | 4/4 | PASS local |

### Migration trên DB phát triển

- User yêu cầu chạy lại migration sau khi bật Docker. Container PostgreSQL cũ chưa mở host port dù có binding; đã force-recreate container, giữ named volume. Hiện PostgreSQL17.11 trên localhost:5433/mindy_center.
- Đã pg_dump trước migration và copy backup vào file ignored `tmp/phase6-before-migration-20261026.dump` (146075 bytes). Không reset/drop schema dev hoặc down migration.
- `pnpm migration:run` áp dụng **16 migrations còn thiếu**, ledger từ16 lên **32**, gồm3 Chat migrations; COMMIT. Chạy lại báo **No migrations are pending**.
- Kiểm sau và cuối lượt: users8/orders0/enrollments0 giữ nguyên; chat_conversations/chat_file_objects tồn tại, ledger có đủ3 Chat migrations. Đây là dev migration, không phải production/deployment evidence.
- U nâng fixture Phase5 có order/enrollment và READY material file qua3 Chat migrations, snapshot giữ nguyên, repeat no-op. S kiểm duplicate sequence23505/composite reply FK23503.

### Gates và source đã kiểm

Môi trường thực chạy gates: Node22.20.0/pnpm12.6.0, PostgreSQL17.11 Docker postgres:17-alpine, MinIO test versioned tag repo trên localhost:19000. Base `mindy_center_test`; các suite dùng DB con kết thúc `_test`, bucket riêng `-test`. Không merchant network/giao dịch thật. **Không reset schema mindy_center.** Không tự stop Docker containers sau gates.

Chốt tài liệu ngày2026-10-27:13 tài liệu/155 local links hợp lệ,39 checkbox AC đều tick, source manifest drift0 và git diff --check PASS. Docker daemon lúc kiểm cuối không còn sẵn (pipe dockerDesktopLinuxEngine không tồn tại), nên không đọc lại live DB ở thời điểm27/10. Kết quả migrate32/no pending/users8/orders0/enrollments0 và các gates bên dưới là evidence đã thực chạy trước đó; không tuyên bố services hiện đang chạy.

| Gate | Kết quả thực chạy |
|---|---|
| `pnpm check` | **691/691 PASS,78 suites,0 skip**, lint/type-check/build PASS,32 migration artifacts. |
| Lint/type-check/build sau các test HTTP cuối | PASS; không đổi runtime hoặc non-HTTP test source từ lượt691. |
| `pnpm test:http` lượt chốt cuối | **117/117 PASS,12 suites,0 skip**, exit0. |
| Focused H cuối | **34/34 PASS**, gồm24 delivery barriers và full contract/log canaries. |
| R restore/ops rehearsal | PASS fresh/repeat/compiled rotate/DB+key restore/wrong key/old receipt dependencies; metrics/backfill dry/apply và DEAD replay dry/apply bounded10. |
| Dev migration/repeat |32 migrations/no pending; dữ liệu đếm nêu trên giữ nguyên. |

Source: HEAD `cc8d8437fb7558c34a8395b2d2aa03a8d19751f4` + working tree, không commit/push. Manifest533 source/config files `tmp/phase6-docker-final-source.sha256`, SHA256 `ca63cf6b57706563e83d551dc99783e7591293ed14f2cc2231e4730f4acf8ccf`. Không gồm .env/secrets/logs; các manifest trước giữ evidence cho từng checkpoint.

Logs ignored trong tmp/: `phase6-docker-migration.log`, `phase6-docker-migration-repeat.log`, `phase6-docker-check.log`, **`phase6-docker-http-final.log`**, `phase6-docker-barriers.log`, `phase6-docker-restore.log`. `phase6-docker-http.log` giữ checkpoint92/92; `phase6-docker-http-initial-timeout.log` giữ lượt83 PASS/9 skip do setup ETIMEDOUT, **không tính lượt lỗi là PASS**. DB host probe và các lượt sau đã pass.

### Bốn tiêu chí đã đóng cuối lượt

- **AC6.3-2 / AC6.4-5 / AC6.5-2**:24 real-network cases = logout/suspend/reassign/CASH-expiry × message:created/updated/deleted, conversation:read, typing:changed, notification:created. Test-only IPC/AsyncLocalStorage giữ đúng entry của per-socket validation trước current session/account/scope authorization, commit revoke rồi release. Ordered socket fence hoặc disconnect xác nhận đã drain stream trước khi assert không nhận protected packet. Reassign/expiry vẫn nhận generic access-changed đúng contract. Notification đã fanout trước barrier vẫn không phát sau revoke.
- **AC6.7-2**: kiểm6 client commands, success/error ack/capabilities,9 server events,19 REST method/routes và guide có từng event. Captured stdout/stderr của các child server không chứa body canary/cookies/JWT/keyring/key/signed URLs; DTO không expose crypto columns. Đã sửa docs drift: tách rõ tên created/updated/deleted và đầy đủ envelope/type/occurredAt, read.unreadCount, ack không có requestId; handshake Origin transport errors không hứa business code; typing:stop dùng cùng quota và socket/subscription cap không hứa retryAfterMs.

Barrier là evidence tại **authorization boundary đã thấy revoke**, không hứa thu hồi byte phát trước đó hoặc thay v1 thành strict serialized global revocation. Giữ giới hạn one-instance/per-delivery checks/passive poll trong runbook.

### Evidence bổ sung và cách tái hiện

Ký hiệu P/C/S/L/H/F/G/R như bảng lượt trước; **U** = [populated upgrade](../../../test/integration/phase6-upgrade.spec.ts). H dùng [test-only resume fixture](../../../test/http/chat-resume-server.mjs), chỉ dedicated HTTP-test DB, không reset/seed khi restart. `pnpm test:chat` đã bao gồm U.

- L:10→17 PG tests, thêm7 tests và mở rộng PayOS activation/CASH quiz deny. Kiểm source changes, foreign/hidden/deleted reply, DM restore/list isolation, first provision/backfill/direct race, recipient cutoff/consumer independence, read+fanout/partial cursor và catchup revoke/watermark.
- U:1 populated-upgrade test. F:3→5 PG/MinIO tests và mở rộng retry/purpose/version/PROCESSING/foreign deny. Completed đọc file, revoke/hidden sign404; send-before-cleanup lock barrier giữ live file, DELETING-before-send deny409; delete requeue cleanup.
- H:5→34 tests (+29): refresh/reconnect, quotas, own-tab read/inbox; kill sau commit trước ack hoặc sau emit trước completion; disabled rollback giữ auth/message/receipt; recover cùng DB/keyring/replay/event dedupe/current tombstone;24 revoke barriers và1 contract/log harness. Expire lease trong DB test để tái hiện thời gian reclaim.
- R kiểm dry-run không đổi message/job snapshot và compiled replay reset DEAD→PENDING/attempts0; tự xóa đúng hai DB/scratch của lượt rehearsal.
- G regression payment/commerce, Files/Materials/Assignments và các phase hiện hữu PASS. ZIP/reporting Phase5 vẫn pending.

Các lỗi fixture đã sửa, không đổi runtime để che test: UPDATE RETURNING dùng CTE SELECT để lấy flat rows; cloned session giữ đúng class_id/class_unit_id FK. Contract test tìm được docs shorthand thiếu tên event riêng và đã sửa docs trước lượt cuối117 PASS. Không thêm automatic assertion retries hoặc bỏ qua critical suites.

Chạy lại với Docker/Node22 và TEST_DATABASE_URL test riêng: `pnpm test:chat`, `pnpm test:chat:socket`, `pnpm check`, `pnpm test:http`, `pnpm chat:restore:rehearsal`. R cần PG_BIN_DIRECTORY cùng major17. Không chạy các schema-reset suites dùng chung DB đồng thời.

### Trạng thái bàn giao

**Backend local acceptance complete39/39**. Dev DB migrated32. Deployment readiness/production IAM smoke, FE browser, TLS/proxy/VPS và tải lớn cần evidence riêng; không suy test thành deployed. Chat flags dev vẫn theo cấu hình hiện có; migrate schema không tự bật chat. Không sửa FE, payment semantics, runtime API hoặc triển khai nhiều replicas.

---

**Lịch sử lượt trước Docker:** phần dưới giữ nguyên evidence/trạng thái tại thời điểm đó; bảng hiện hành là39/39 ở trên.



## Nghiệm thu tự động theo slice — 2026-10-26

Yêu cầu: tự chạy nghiệm thu từng slice6.0–6.7. Đối chiếu đủ39 AC; chỉ tick khi toàn bộ mệnh đề có evidence. **13 AC PASS / 26 AC PARTIAL / 0 AC ghi FAIL runtime** sau lượt sửa test và chạy lại. PARTIAL nghĩa đã có một phần bằng chứng, chưa đủ điều kiện nghiệm thu; không đồng nghĩa tính năng hỏng. Chi tiết source/test/gap từng AC nằm trong8 plan được liên kết dưới đây.

| Slice | AC PASS | AC PARTIAL | Kết luận |
|---|---|---|---|
| [6.0 — Contracts/access](../../implement_phase/phase%206/PHASE_6_0_CONTRACTS_ACCESS.md) | 4/4 | 0 | Đạt tiêu chí local |
| [6.1 — Schema/crypto](../../implement_phase/phase%206/PHASE_6_1_SCHEMA_CRYPTO_FOUNDATION.md) | 4/5 | 1 | Chưa đóng toàn slice |
| [6.2 — Membership/REST](../../implement_phase/phase%206/PHASE_6_2_MEMBERSHIP_REST.md) | 1/6 | 5 | Chưa đóng toàn slice |
| [6.3 — Realtime/recovery](../../implement_phase/phase%206/PHASE_6_3_REALTIME_RECOVERY.md) | 0/5 | 5 | Chưa đóng toàn slice |
| [6.4 — Mutations/read](../../implement_phase/phase%206/PHASE_6_4_MUTATIONS_READ.md) | 2/5 | 3 | Chưa đóng toàn slice |
| [6.5 — Notification inbox](../../implement_phase/phase%206/PHASE_6_5_NOTIFICATION_INBOX.md) | 0/5 | 5 | Chưa đóng toàn slice |
| [6.6 — Attachments](../../implement_phase/phase%206/PHASE_6_6_CHAT_ATTACHMENTS.md) | 0/5 | 5 | Chưa đóng toàn slice |
| [6.7 — Handoff/operations](../../implement_phase/phase%206/PHASE_6_7_HANDOFF_OPERATIONS.md) | 2/4 | 2 | Chưa đóng toàn slice |

### Evidence và cách chạy lại

Source: HEAD `cc8d8437fb7558c34a8395b2d2aa03a8d19751f4` **+ working tree hiện tại**, gồm Phase6 runtime chưa commit và các test bổ sung trong lượt này. Không coi HEAD đơn lẻ là bản đã kiểm thử. Không commit/push/deploy hoặc migrate dev/prod. Runtime API/schema/business rules không đổi; chỉ sửa tests và tài liệu.

Môi trường: Node22.20.0 / pnpm12.6.0 / PostgreSQL17.6 local, DB tên kết thúc `_test`, MinIO versioned trên localhost:19000, bucket riêng kết thúc `-test`. Không dùng merchant network hoặc tiền thật. Docker daemon không chạy; dùng binaries test đã có trong `tmp/`, start/stop đúng dịch vụ test.

| Ký hiệu | Source/test evidence | Lệnh chạy lại (sau khi có dịch vụ test và TEST_DATABASE_URL hợp lệ) |
|---|---|---|
| P | [policy matrix](../../../src/modules/chat/domain/chat-access.spec.ts) | `pnpm exec vitest run src/modules/chat/domain/chat-access.spec.ts` |
| C | [crypto/tamper/keys](../../../src/modules/chat/services/chat-crypto.service.spec.ts) | `pnpm exec vitest run src/modules/chat/services/chat-crypto.service.spec.ts` |
| S | [schema/storage/receipts/lease](../../../test/integration/phase61-chat-storage.spec.ts) | `pnpm exec vitest run test/integration/phase61-chat-storage.spec.ts` |
| L | [lifecycle/REST/mutations/read/inbox](../../../test/integration/phase62-chat.spec.ts) | `pnpm exec vitest run test/integration/phase62-chat.spec.ts` |
| H | [compiled HTTP + real Socket.IO](../../../test/http/phase63-chat.spec.ts) | `pnpm test:chat:socket` |
| F | [real MinIO image/PDF/cleanup](../../../test/integration/phase66-chat-files.spec.ts) | `pnpm exec vitest run test/integration/phase66-chat-files.spec.ts` |
| G | Lint/type-check/all unit+integration/build + toàn bộ compiled HTTP regression | `pnpm check`, `pnpm test:http` |
| R | [compiled rotate + DB/key restore](../../../tools/chat/restore-rehearsal.mjs) | `pnpm chat:restore:rehearsal` |

Các lệnh targeted trên là cách tái hiện, không tuyên bố đã chạy riêng từng lệnh; toàn bộ specs được thực thi trong G. Rate/typing/worker isolation specs cạnh code cũng nằm trong G. Không chạy song song các suite dùng chung DB test vì chúng reset schema.

Snapshot source dưới test: 531 files trong src/test/tools và package/lock/compiler/lint/Vitest configs; manifest local `tmp/phase6-acceptance-source.sha256`, SHA256 `7c0cbdb9012f8d5cab5ee56044715950f50975c911b9259bcd8cec2418dcb7b7`. Không bao gồm secrets/env hoặc logs. Manifest giúp phân biệt working tree này với HEAD và các lần chỉnh source sau.

### Kết quả thực chạy

- Lượt đầu: full check **680 PASS / 1 FAIL**,77 suites. Test mới dùng UPDATE created_at bị immutable identity trigger chặn đúng thiết kế. Đã sửa test dùng spy Date.now để đi qua cửa sổ16 phút, giữ nguyên DB trigger; kết quả lượt đầu không được ghi PASS.
- Lượt cuối sau sửa test: **pnpm check PASS — 681/681 tests,77 suites,0 skip**, lint/type-check/build PASS;32 compiled migration artifacts được verify. Không đổi source sau snapshot trên.
- HTTP **88/88 PASS**,12 suites,0 skip, gồm5 real-socket/compiled chat tests và assertion Postman↔Swagger đủ19 method/routes.
- Rehearsal **PASS**: fresh migrate/repeat no-op, compiled rotate, pg_dump/pg_restore, restored key decrypt, receipt phụ thuộc old key, wrong key fail closed.
- Wrapper cuối exit0; đã dừng PostgreSQL/MinIO test. Kiểm tra12 tài liệu Phase6:139 local links hợp lệ,39 checkbox AC/13 tick, `git diff --check` PASS. Các tài liệu giữ đủ phần thiếu evidence theo từng slice.
- Full logs local ignored: `tmp/phase6-check-pg17.log`, `tmp/phase6-http-pg17.log`, `tmp/phase6-restore.log`; lượt đầu giữ riêng ở `tmp/phase6-acceptance-first-check.log`. Không đưa credentials/keyring/cookie/signed URLs vào tài liệu.

### Bổ sung kiểm chứng và phần còn mở

Thêm6 PG tests: backfill dry-run/apply/repeat và rollback source+outbox/jobs; concurrent edit/delete + receipt replay sau window/delete; exact15-minute boundary/foreign/completed/unread; concurrent device read/no-op timestamp; read-all/fanout snapshot barrier và inbox đọc riêng; deleted/revoked fanout và source revocation ẩn inbox. Storage rollback nay kiểm cả message/event/job/receipt. HTTP đối chiếu method+path cả19 routes Postman với Swagger runtime.

AC6.0-4 có điều kiện “chưa đánh API implemented” thuộc mốc baseline trước6.2; bảng nghiệm thu dùng revision runtime hiện hành và giữ baseline như lịch sử. Không đổi API đang có thành planned.

Các gate tự động PASS không đủ thay26 AC còn PARTIAL: đặc biệt populated upgrade, verified PayOS→chat, source-reassignment cases, crash/restart và authorization barriers, catchup pagination khi revoke, network quotas, late joiner/cutoff, cross-tab sync, attachment race/purpose/TTL và ops replay/disabled rollback. FE/browser, TLS/proxy/VPS, nhiều replicas và tải lớn vẫn **PENDING**. Vì vậy **chưa đóng Phase6/R4 local acceptance**, dù các local test gates pass. Không mở ZIP/reporting Phase5 hoặc thay payment semantics.



## Implementation — 2026-10-24

Theo yêu cầu user, đã triển khai runtime trên checkout dev@cc8d843 + working tree. Không tạo commit/push, không sửa FE, không migrate dev/production hoặc deploy. Các flags mặc định false. [Runbook](../../PHASE_6_CHAT_RUNBOOK.md), [API runtime revision](../../api_flow/PHASE_6_flow-api-breakdown.md).

| Slice | Source/test evidence | Trạng thái hiện hành |
|---|---|---|
| 6.0 | Pure policy matrix; public batch scope providers Classes/Enrollments/Commerce/Users; verified JWT expiry/manager Auth; documented lock graph/receipt mapping | Implemented local. |
| 6.1 | Three additive migrations, AES-GCM/HKDF-HMAC/keyring, durable encryption counter, append-only shared receipts, sequence/event/job transaction, lease fencing/dead letter | Implemented; crypto/storage/rollback/concurrent tests. |
| 6.2 | Transactional source triggers/outbox, current-state group/DM/member reconcile, REST discovery/history/send/reply/backfill; CASH/PayOS rules and history windows | Implemented; PostgreSQL/compiled HTTP. |
| 6.3 | Socket.IO4.8.1 direct Nest HTTP adapter, cookie/Origin/session/expiry auth, quotas/subscription/packet limits, per-socket dispatch/passive checks, signed event catchup | Implemented; real network clients. |
| 6.4 | Versioned edit/delete, current-state replay/tombstones, monotonic read/unread, cross-tab read sync | Implemented; PostgreSQL/HTTP/socket paths. |
| 6.5 | Durable generic inbox, unique recipient fanout, current rights/cutoff, read-before-fanout, owner list/count/read/read-all and socket sync | Implemented; source and runtime tests. |
| 6.6 | CHAT owner model + shared storage/validator, idempotent scoped intents, pinned versions, image/PDF, authorized signing, claim/recheck cleanup | Implemented; real MinIO image/PDF and compiled HTTP image flow. |
| 6.7 | OpenAPI/Postman19 routes, real-socket harness, maintenance CLI, DB/key rotation+restore rehearsal, runbook | Local gates below; deployment/FE/browser sign-off pending. |

### Local gates

Môi trường isolated: Node22.20.0, pnpm12.6.0, PostgreSQL17.6 (cùng major compose/CI), private versioned MinIO build theo tag pinned của repo. Các DB suffix _test và bucket -test riêng. Không merchant network hoặc giao dịch thật.

- Lượt chốt cuối: pnpm check PASS675/675 tests,77 suites; lint/type-check/build pass,32 compiled migration artifacts verified. pnpm test:http PASS88/88,12 suites,0 skip.
- Rehearsal PASS: fresh migrate/repeat no-op, compiled rotate CLI, pg_dump/pg_restore sang DB ngẫu nhiên khác, restored keyring decrypt, old receipt key dependency, wrong-key fail closed. Tool tự cleanup đúng hai DB và scratch của lượt test.
- Review cuối bổ sung canonical UUID cho retries, rate-limit error retryAfterMs, key-limit503, receipt F1 và cleanup requeue sau attach/delete race. Regression tests xác nhận durable key limit và các consumer độc lập: upload chậm không chặn realtime. Toàn bộ local gates đã PASS sau các thay đổi này.

Logs local ignored: tmp/phase6-check-pg17.log, tmp/phase6-http-pg17.log, tmp/phase6-restore.log. Không log keyring/token/cookie/signed URL hoặc raw chat body. Lượt PG18 trước đó có SQLSTATE RESTRICT23001 thay23503 ở4 test cũ; lượt dịch vụ test bị dừng gây suites không chạy không được tính PASS. Đã dựng PG17 và giữ services cùng lifetime của check để kiểm chứng đúng môi trường.

### Quyết định/handoff

- Lifecycle capture bằng DB trigger thay reverse module imports; domain_outbox chỉ refs/version, chat_jobs mỗi consumer một row UNIQUE. SYSTEM actor null. Source authorization không dựa vào left_at/room đơn thuần.
- Raw SQL owning storage/DTO mapping như Tracking; shared mutation_receipts namespace chat, outcome resourceId/keyVersion/fingerprintVersion. Không body snapshots hoặc receipt store song song.
- Files dùng chat_file_objects purpose CHAT riêng thay nullable CourseUnit giả; Materials/Assignments schema và quyền cũ giữ nguyên. GET URL60s; binary storage encryption là cấu hình riêng.
- MinIO provision policy thêm DeleteObjectVersion chỉ cho chat-staging/chat-final; chưa áp dụng IAM production. Shell syntax check riêng, rollout cần backend-credential smoke theo runbook.
- Backfill/rotate/replay/retention/metrics compiled CLI mặc định dry-run và bounded; tắt mọi worker trước AppModule context. Giữ receipts/tombstones/old keys cho backups.

### Acceptance còn cần evidence riêng

Không tick toàn bộ39 AC chỉ vì có source/gates. Chưa nghiệm thu FE browser, TLS/proxy/VPS, nhiều replicas hoặc large-recipient load. Exhaustive crash/interleaving barriers và query/fanout benchmarks vẫn cần review trước production. V1 dùng per-delivery authorization + passive poll1s, không hứa thu hồi bytes đã emit trước revoke.

Cleanup tự xử lý copies/pinned staging có record; incomplete PUT/overwrite/unrecorded version cần bucket lifecycle/storage operator theo runbook. Retention CLI cần lịch vận hành do owner triển khai. Không tự mở push/mail/SMS, moderation hoặc E2EE. Không đổi Phase5 ZIP/reporting thành done.

## Baseline planning — lịch sử trước implementation

2026-10-24 · **PLANNED — chưa implement** · Baseline `dev@cc8d843`.
[Plan](../../implement_phase/phase%206/PHASE_6_CHAT_NOTIFICATIONS.md) ·
[Flow](../../api_flow/PHASE_6_FLOW.md) ·
[API proposal](../../api_flow/PHASE_6_flow-api-breakdown.md).

## Trạng thái

| Hạng mục | Trạng thái | Evidence |
|---|---|---|
| Source/schema/auth/payment/files review | DONE — planning | DBML có chat tables; source chưa có chat gateway/module; guard HTTP và Files CourseUnit scope cần adapter/extension. |
| Plan + policy + API/event proposal | DONE — planning | Bộ tài liệu cùng ngày, phân biệt confirmed/proposed/runtime. |
| Chi tiết8 slices/task/AC/dependency/readiness | DONE — planning | Plan mục9;59 tasks/39 AC còn TODO implementation, source/test targets và R0–R4 handoff. |
| 6.0 Contracts/access | TODO | Chưa có provider/policy tests. |
| 6.1 Schema/crypto | TODO | Chưa có migration/keyring/crypto service. |
| 6.2 Membership/REST | TODO | Chưa có domain outbox integration hoặc chat routes. |
| 6.3 Realtime/recovery | TODO | Chưa có gateway/dispatch/events endpoint. |
| 6.4 Mutations/read | TODO | Chưa có edit/delete/read cursor. |
| 6.5 Notification inbox | TODO | Chưa có inbox/fanout/read APIs. |
| 6.6 File/image | TODO | Chưa mở Student chat upload scope. |
| 6.7 Handoff/ops | TODO | Chưa có REST/real-socket suite/Postman/runbook triển khai. |

## Backlog implementation theo slice — chưa thực hiện

| Slice | Task IDs | Acceptance IDs | Dependency | Contract/mốc sau nghiệm thu |
|---|---|---|---|---|
| [6.0](../../implement_phase/phase%206/PHASE_6_0_CONTRACTS_ACCESS.md) | 6.0-T01–T08 | AC6.0-1–4 | Source baseline | Chốt policy/provider/lock graph/receipt mapping; chưa API. |
| [6.1](../../implement_phase/phase%206/PHASE_6_1_SCHEMA_CRYPTO_FOUNDATION.md) | 6.1-T01–T07 | AC6.1-1–5 | 6.0 | Schema/crypto/receipt/job tests, R0; chưa API. |
| [6.2](../../implement_phase/phase%206/PHASE_6_2_MEMBERSHIP_REST.md) | 6.2-T01–T08 | AC6.2-1–6 | 6.1 | Lifecycle + C1–C5/M1/M2 TEXT, R1. |
| [6.3](../../implement_phase/phase%206/PHASE_6_3_REALTIME_RECOVERY.md) | 6.3-T01–T08 | AC6.3-1–5 | 6.2 | Gateway/dispatch/E1/recovery/revoke; read handler chờ6.4. |
| [6.4](../../implement_phase/phase%206/PHASE_6_4_MUTATIONS_READ.md) | 6.4-T01–T06 | AC6.4-1–5 | 6.3 | M3/M4/R1 + socket read/mutations, R2. |
| [6.5](../../implement_phase/phase%206/PHASE_6_5_NOTIFICATION_INBOX.md) | 6.5-T01–T07 | AC6.5-1–5 | 6.4 | N1–N4/events + R1 inbox hook, R3. |
| [6.6](../../implement_phase/phase%206/PHASE_6_6_CHAT_ATTACHMENTS.md) | 6.6-T01–T08 | AC6.6-1–5 | 6.5 + Files | F1–F4/M2 FILE/IMAGE/canAttach, chờ full gates. |
| [6.7](../../implement_phase/phase%206/PHASE_6_7_HANDOFF_OPERATIONS.md) | 6.7-T01–T07 | AC6.7-1–4 | 6.0–6.6 | Full local gates/handoff R4; deploy/browser riêng. |

Khi triển khai, bổ sung evidence source + tests + kết quả theo task/AC; không đánh
checkbox chỉ vì đã viết kế hoạch. Kho receipts chung chưa có public writer, neutral
outbox/gateway/chat providers chưa tồn tại.6.0 chốt cách mở rộng namespace/HMAC/
key-version và lock graph;6.1 không mặc định tạo bảng receipts song song.

## Quyết định được giữ

- Class group tự động + DM mentor–student; không nhóm tùy ý trong v1.
- CASH pending còn hạn có chat; manager confirm đủ tiền không reset chat/history/key.
- Backend AES-256-GCM + WSS, không E2EE; khóa không lưu theo sender/receiver.
- Retry giữ clientMessageId; UNIQUE và receipt phải cùng chống trùng/concurrent races.
- REST history + event replay bền vững; ack chỉ nghĩa persisted.
- Phase6 có notification trong ứng dụng, không tự mở email/push/automation phase khác.

## Mặc định đề xuất cần được ghi lại khi implementation chốt

Primary-only mentor chat; completed read-only; group history từ lần join hiện tại;
DM theo cặp toàn hệ thống; edit15 phút; generic notifications; attachments JPEG/PNG/
WebP/PDF; one-instance v1. Các giá trị chi tiết là proposed contract, chưa runtime.
Automatic group provisioning qua transactional outbox là eventual để tránh vòng
module; không còn khẳng định tạo group cùng DB transaction với class.

## Evidence và giới hạn

2026-10-24 — Lập chi tiết8 slices trong plan hiện có, đồng bộ flow/API readiness,
progress tổng và phase index. Bổ sung source integration points,59 task IDs,39 AC,
test targets, rollout gates; giữ toàn bộ implementation TODO. Làm rõ read handler
ở6.4 và notification schema/consumer ở6.5; có ca race read-trước-fanout và consumer
checkpoint riêng. Không thay business rules, runtime API hoặc production state.

2026-10-24 — Theo yêu cầu dễ đọc, schema plan được tách thành8 mục bảng với cột,
kiểu,ý nghĩa và constraints riêng. Outbox và dispatch jobs có mô tả riêng; các kiểu/
thành phần chưa chốt được ghi proposed. Không thay phạm vi quyền hoặc runtime API.

Chỉ thay tài liệu. Chưa chạy test runtime, tạo secret, cài dependencies, tạo branch,
commit/push, thay DBML runtime/migration, sửa FE, migrate DB hoặc deploy VPS.
Không suy kế hoạch thành tính năng đã hoạt động hoặc Phase5 đã hoàn tất.

### Verification — 2026-10-24

Follow-up chi tiết slices: PASS59 task IDs duy nhất/39 acceptance IDs duy nhất,
đủ8 slices;29 local links trong4 tài liệu Phase6 resolve và các slice anchors tồn
tại;3 JSON examples parse được;19 REST proposals không trùng.6 tài liệu liên quan
đã scan conflict markers/trailing whitespace, code fences Phase6 cân bằng;
`git diff --check` PASS cho tracked changes, scan trực tiếp bao gồm Phase6 untracked.
Không chạy application tests vì chỉ sửa Markdown; không phải evidence runtime.

PASS: 4 tài liệu Phase6 mới,20 local links resolve đúng,3 JSON examples parse được,
UUIDv4 examples hợp lệ,code fences cân bằng và19 REST proposals không trùng method/
route. Whitespace/conflict-marker scan và `git diff --check` PASS. Đã cập nhật index
implement phases và progress tổng. Không chạy application tests vì chỉ sửa Markdown;
các kết quả trên không phải bằng chứng chat đã hoạt động.
