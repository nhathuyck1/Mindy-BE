THIS IS THE PROGRESS THAT U WILL BE UPDATED THROUGHOUT THE PROJECT
Phase 0: Hạ tầng và quy ước chung
↓
Phase 1: Registration + User + Authentication
↓
Phase 2: Course Catalog + Class Registration + Cart + Full Payment + Enrollment
↓
Phase 3: File + Materials
↓
Phase 4: Attendance + Operational Queries
↓
Phase 5: Production Hardening + Deploy
↓
Phase 6: Chat / Notification
Whiteboard
Assignment
Compiler / Judge

## Documentation updates

- 2026-10-09: Tiếp tục và hoàn tất Phase 3.2 local từ lượt bị ngắt. Files API
  intent/complete/status, upload policy Materials → Files, private versioned MinIO,
  SQL provenance/identity constraints, pinned version/hash, bounded binary parser,
  durable VALIDATE lease/fencing/retry/expiry + READY reference lock đã triển khai.
  Siết Office OPC/XML/CRC/ZIP bounds, sửa HTTP fixture/type-check, giữ parser
  operational errors retryable; bỏ thư mục preview tmp khỏi lint. Đồng bộ
  DBML/env/Swagger/Postman/runbook/index/progress. `pnpm check` pass 217 tests/18
  suites + lint/type-check/build; sau thêm crash-copy/concurrent-claim và trigger
  staging immutability, focused Files 42/42 pass; HTTP 19/19 pass, không skip.
  Chỉ migrate test DB/bucket riêng, setup bucket local; chưa migrate development,
  VPS deploy, browser staging, extraction/cleanup hay payment live.
  Bàn giao tiếp theo 3.3 Materials CRUD/review; xem PHASE_3_2_PROGRESS.md.

- 2026-10-09: Đổi màu cả email đăng ký/thanh toán theo `docs/pallete3.png` từ
  Mindy-FE branch `Huy/Feat/UIredesign` do user cung cấp. Đọc ảnh palette và lấy
  chính xác màu pixel: #355872 (text/CTA), #7AAACE (header accent/summary border),
  #9CD5FF (logo dot/dividers/card border), #F7F8F0 (background/summary/CTA text),
  card trắng trung tính. Giữ wordmark Mindycoding 34px và header 14px, cập nhật
  hai HTML preview. Lint/diff check pass; chỉ đổi màu, không đổi flow/link/mail API.

- 2026-10-09: Chỉnh nhận diện cả hai email theo feedback: tên `Mindycoding`
  viết hoa M, wordmark 34px (trước 28px); dòng header nhỏ 14px (trước 11px),
  line-height 1.5 và letter-spacing 1px để dễ đọc tiếng Việt. Đồng bộ tên trong
  nội dung/subject/footer và cập nhật hai HTML preview ở tmp. Lint hai file mail
  và 6 mail tests pass; đây là thay đổi nội dung/giao diện, chưa thử SMTP thật.

- 2026-10-09: Nâng cấp email xác thực đăng ký và xác nhận thanh toán online sang
  mẫu HTML tiếng Việt dùng chung nhận diện Mindy, table layout/CSS inline, nút CTA,
  preheader, link dự phòng và plain-text alternative. Email thanh toán hiển thị mã
  đơn/số tiền VND và dẫn tới `FRONTEND_BASE_URL` + `ORDER_DETAILS_PATH`, mặc định
  `/orders/:orderId` theo route FE user xác nhận; worker truyền UUID từ outbox.
  Thêm schema/env examples và README; giữ token verification, settlement và retry.
  Local: 6 mail tests pass; lint 8 file liên quan và type-check riêng mail/payment
  email service pass; `pnpm test` 109 pass, 68 integration tests skip vì thiếu
  `TEST_DATABASE_URL`. Kiểm tra hiển thị hai mẫu bằng browser với dữ liệu giả.
  `pnpm check` bị chặn ở lint các thay đổi Files/Materials và code ngoài phạm vi;
  global type-check/build gặp module `express` và `../files/files.module.js` thiếu
  trong phần Files/Materials đang triển khai. Chưa kiểm SMTP thật/Gmail/Outlook,
  frontend redirect sau đăng nhập, VPS deploy hoặc giao dịch thật.

- 2026-10-09: Rà soát plan 3.2 sau user xác nhận 3.1 hoàn tất/pass; đối chiếu
  source và evidence 3.1 pnpm check 171 tests/16 suites + HTTP 5/5, không skip.
  Bỏ gate chờ bàn giao, ghi rõ baseline đã đạt và 3.2 sẵn sàng triển khai.
  Plan chọn chuyển upload policy sang Files-owned provider, facade Materials
  giữ contract và delegate để tránh cycle; giữ errors ancestry 404/422,
  declaration MIME/filename theo assertions 3.1, không thêm yêu cầu compile/parse
  source. Bổ sung bounded copy candidate history cho retry/orphan recovery.
  Đồng bộ plan/progress/index; chỉ kiểm diff/link, chưa refactor source hoặc
  chạy lại BE/DB/MinIO tests, không migrate/deploy/payment live.

- 2026-10-09: Theo yêu cầu hoàn tất full 3.1 D1–D6 trước khi đụng 3.2, triển khai
  MaterialsModule/MaterialPolicyService, entity-free Catalog/Classes context providers,
  domain Course Unit ownership, Manager/Mentor permissions, Student ACTIVE/release/
  review/publication/READY gates và review transitions/revision/audit output.
  firstApprovedAt giữ tài liệu đã duyệt thuộc quyền sửa Manager; origin class là
  provenance, không đổi owner. Thêm declaration allowlist/limits MVP file-only.
  61 domain + 6 PostgreSQL integration tests mới; pnpm check pass 171 tests/16
  suites, lint/type-check/build; test:http 5/5 pass. Chỉ dùng test DB riêng.
  Đồng bộ plan/progress/core/course flow. 3.1 local hoàn tất; persistence/atomic
  revision locking thuộc 3.3, HTTP access thuộc 3.4. Chuẩn bị dependencies 3.2
  đã hoàn nguyên; chưa upload/storage/binary verification/deploy/dev migration.
  Giữ plan/progress 3.2 đã lập, chưa bắt đầu code 3.2.

- 2026-10-09: Theo yêu cầu user lập plan 3.2 khi 3.1 đang làm, tạo
  `docs/implement_phase/PHASE_3_2_SAFE_UPLOAD.md` và tiến độ riêng
  `docs/progress/PHASE_3_2_PROGRESS.md`. Scope Manager/Mentor upload private cho
  Course Unit, intent/complete/status, binary validation, version pinning,
  DB jobs/lease/fencing/retry/crash recovery và READY reference provider.
  Ghi gate bàn giao role/policy/context 3.1, schema/DTO/config/milestones/test;
  READY khác review, extraction/cleanup ở 3.5. Đồng bộ index/plan/progress tổng;
  giữ các thay đổi code đang có của 3.1/2.3. Chỉ kiểm diff/link, không chạy BE/
  DB/MinIO tests, sửa source/schema/config/migration, deploy hoặc payment live.

- 2026-10-09: User duyệt D1–D6 Phase 3.1 và yêu cầu role MANAGER: Manager sửa/
  quản lý/duyệt Material chính shared của Course Unit, Mentor upload chờ duyệt;
  ACTIVE/release/shared live/enrollment COMPLETED/MVP giữ đúng quyết định user.
  Bổ sung UserRole.MANAGER, DBML enum, migration mới
  `1791504000000-restore-manager-role.ts`; không sửa logic migration lịch sử hoặc
  promote account. Admin tạo Manager qua /admin/users; public registration vẫn STUDENT,
  Manager không kế thừa Admin/payment/CASH. Đồng bộ plan tổng/3.1/Course flow/core docs;
  review draft/submit/approve/reject/revision còn là contract cho 3.2–3.3, chưa API.
  Evidence local: pnpm check pass (104 tests/14 suites, không skip), test:http
  5/5 pass; role clean migration/down-up/refused rollback và admin-create/login/
  refresh/role-denial có regression. Chuẩn hóa CRLF baseline thành LF để full lint
  pass, không thay logic ngoài scope. Chỉ dùng database mindy_phase31_test và fixture
  suffix test riêng; chưa apply migration dev/VPS, storage, deploy hoặc payment live.

- 2026-10-09: User làm rõ Material là tài liệu chính của Course Unit, quan hệ
  Course Unit 1–N Material; đã kiểm DBML materials dòng 607–619/Ref dòng 984.
  User chọn Session link tùy chọn, không đổi Course Unit owner. Sửa plan 3.1
  schema/policy/API/DTO tương ứng; bỏ đề xuất owner Class Unit/Session, giữ
  course_unit_id NOT NULL. Session theo dõi assignment/Q&A/student code riêng;
  quyền Mentor sửa tài liệu chung còn chờ duyệt. Đồng bộ progress và ghi plan
  3.1 thay thế các đề xuất ownership cũ trong plan tổng. Chỉ sửa tài liệu;
  chưa code/migrate/deploy, chưa có evidence BE/DB/MinIO hoặc payment live.

- 2026-10-09: Soạn planning chi tiết Phase 3.1 tại
  `docs/implement_phase/PHASE_3_1_POLICY_CONTRACT.md` và tiến độ riêng
  `docs/progress/PHASE_3_1_PROGRESS.md`; chờ user duyệt trước khi triển khai.
  User xác nhận Unit 1–N Material; plan đề xuất Unit bắt buộc + Session tùy chọn
  cùng Unit, loại Unit/cách gắn Session còn chờ xác nhận. Có policy/provider/API/DTO,
  HTTP 422 theo baseline, allowlist/limits/TTL và ma trận quyền/threat cases.
  Đồng bộ liên kết plan tổng/index/progress; chỉ kiểm diff/link, chưa đổi source,
  DBML, migration, env, chạy BE/storage tests hoặc deploy.

- 2026-10-09: Theo yêu cầu chia nhỏ P3 và điều phối user làm P3/người khác làm
  2.3, mở rộng mục 7 plan P3 thành Phase 3.1–3.6 có phạm vi/đầu ra/exit gate riêng.
  Ưu tiên quyền/contract, upload an toàn, quản lý và Student đọc/tải trước metadata
  nâng cao; validation bảo mật/test không hoãn tới cuối. Đổi dependency 2.3 → P3
  thành triển khai song song/tích hợp trước nghiệm thu FE; đồng bộ index và plan/
  progress hai phase. Chỉ sửa tài liệu, kiểm diff/link; chưa code, migrate, test BE
  hoặc deploy. Giữ ghi chú ưu tiên cũ như lịch sử, không coi là policy hiện hành.

- 2026-10-09: Theo yêu cầu planning, tạo Phase 2.3 My Classes + Personal Schedule
  tại `docs/implement_phase/PHASE_2_3_MY_CLASSES_SCHEDULE.md` và progress riêng
  `docs/progress/PHASE_2_3_PROGRESS.md`, ưu tiên trước Phase 3. Plan tái dùng full
  detail/CASH preview, đề xuất enrollment-based list và lịch nhiều lớp, contract
  filter/range/timezone, expiry/access/history, module read projections, milestones,
  test và rollout. Không mở entitlement COMPLETED/pending PAYOS; không làm materials,
  attendance hoặc sửa settlement. Cập nhật index/FE backlog và liên kết prerequisite
  Phase 3. Chỉ tài liệu và kiểm tra diff/link; chưa code, migrate, test BE hoặc deploy.

- 2026-10-09: Lập kế hoạch Phase 3 File + Materials từ DBML, COURSE_FLOW,
  Flow.txt và usecase-course.drawio, đối chiếu code/config/progress hiện hành.
  Plan tại `docs/implement_phase/PHASE_3_FILES_MATERIALS.md`, progress riêng tại
  `docs/progress/PHASE_3_PROGRESS.md`: đề xuất material ba scope, mentor assignment,
  ACTIVE entitlement + unit/material release, upload/validation/metadata async,
  lifecycle/cleanup, API, migration, milestones, tests và rollout. Các lựa chọn
  ownership/access còn mở được ghi là đề xuất, chưa đổi business rules/schema.
  Giữ CASH preview/confirm và PayOS/email; không nhận evidence roster deploy làm
  bằng chứng payment live. Chỉ thay đổi tài liệu, kiểm tra diff/link; chưa chạy BE
  tests, tạo migration, triển khai storage hoặc deploy Phase 3.

- 2026-10-09: In Cloudflare zone `quanh123.id.vn`, deployed active Cache Rule
  `Bypass cache Swagger UI init` matching host `api.quanh123.id.vn` and exact
  path `/docs/swagger-ui-init.js`, with edge cache eligibility and browser TTL
  both set to bypass. Five subsequent public requests across SIN/HKG returned
  the new mentor route document with `CF-Cache-Status: DYNAMIC`; Chrome Swagger
  UI displayed both mentor-class endpoints. No backend deployment was needed.

- 2026-10-09: Post-deploy read-only check for mentor roster APIs: GitHub Actions
  deploy run `37880983054` succeeded on self-hosted runner `mindycode` for `dev`
  commit `0e2e780c`; its VPS checkout/release and internal API readiness steps
  passed. Public `GET /api/v1/mentor/classes` and
  `GET /api/v1/mentor/classes/{classId}/students` return 401 without login,
  while an unknown mentor route returns 404; public `/docs-json` lists both
  operations. The Swagger UI initializer at `/docs/swagger-ui-init.js` first
  returned an older Cloudflare cache HIT (no mentor routes, `max-age=14400`),
  whereas a cache-busted request returned the new spec. A later public request
  returned `EXPIRED` with the new mentor routes, but subsequent repeated
  requests proved the cache is inconsistent across Cloudflare edges: HKG
  returned the new initializer while SIN still returned the old `HIT` copy
  (age about 3985 seconds). Direct VPS SSH was unavailable
  from this workstation; no Cloudflare settings or production state were changed.

- 2026-10-09: Aligned CI/CD with the VPS checkout on `dev`: `Deploy` runs on
  pushes to `dev` (including merges), calls the reusable `Check` workflow for
  that exact commit, then deploys only if checks pass. Manual runs require
  `dev`; the VPS checkout must also be on `dev`. `Check` remains standalone for
  PRs and `main` pushes. This is local workflow editing only; no push or VPS run
  was performed.

- 2026-10-09: Added `.github/workflows/deploy.yml` for the connected Linux
  self-hosted GitHub Actions runner. It deploys the exact checked commit on
  `dev` (or a manual run on `dev`) through the existing VPS checkout,
  validates Compose quietly, builds one immutable image, creates/validates a
  PostgreSQL backup, runs the migration once, then updates the API and checks
  readiness. Documented the default `DEPLOY_DIR` and runner permissions in
  `docs/VPS_DEPLOYMENT.md`. This is workflow authoring only; no push, runner
  execution, VPS migration, routing change or live transaction was performed.

- 2026-10-09: Bổ sung Phase 2 mentor collection view: `GET /mentor/classes`
  liệt kê lớp hiện được phân công và `GET /mentor/classes/:classId/students`
  liệt kê enrollment còn hiệu lực, student name, order/payment status và
  `orderId` để dùng API CASH confirm sẵn có. Có phân trang/lọc, kiểm tra class
  assignment và hiển thị tổng order khi một cash order gồm nhiều lớp; không đổi
  schema hay quyền confirm theo mentor snapshot. Local targeted Biome, type-check,
  42 unit tests và build pass. 61 PostgreSQL integration tests (gồm case roster
  mới) bị skip vì không có `TEST_DATABASE_URL`; Docker/PostgreSQL không chạy trên
  máy này. `pnpm check` toàn repo dừng ở lint vì nhiều file cũ đang có CRLF;
  chưa có kiểm chứng HTTP/DB, VPS hay live payment cho increment này.

- 2026-10-09: Đọc toàn bộ `document/Flow.txt`, sơ đồ
  `document/usecase-course.drawio` và các quyết định/tiến độ Phase 2 hiện hành;
  tạo `document/COURSE_FLOW.md` làm bản course flow để user kiểm tra trước Phase 3.
  Tài liệu tách flow nghiệp vụ khỏi trạng thái triển khai, giữ CASH pending preview,
  mentor confirm, PayOS/email, chat deferred và liệt kê các điểm cần chốt về
  material ownership/access. Theo yêu cầu bổ sung, đối chiếu tiếp
  `document/mindy_center_full.dbml` và use case: thêm flow điểm danh theo
  Enrollment + Class Session, trạng thái/unique key, quyền ghi/xem, liên hệ với
  buổi bù và chứng chỉ; làm rõ DBML hiện gắn material với Course Unit và các
  quy tắc điểm danh cần chốt ở Phase 4. Chỉ thay đổi tài liệu; chưa bắt đầu
  Phase 3/4, chưa chạy BE tests hoặc deploy.

- 2026-10-06: Sửa lỗi PayOS GET-first ngăn tạo QR trên VPS. Evidence user:
  env container đã bật/đủ biến; SDK GET trả HTTP 200, code `101`, desc
  `Mã thanh toán không tồn tại`. Adapter trước chỉ nhận `231`, nên trả 503 trước
  CREATE. Bổ sung đúng response 200/101/desc đã quan sát; lỗi 101 khác, auth,
  rate limit và lỗi tạm thời vẫn không tạo link mù. `pnpm check` pass 102 tests
  (42 unit, 60 PostgreSQL integration, không skip); thêm test adapter và workflow
  DB GET→CREATE→persist QR→reuse; built-app HTTP tests pass 4/4. Chưa deploy bản
  sửa hoặc xác nhận payment thật.

- 2026-10-05: Hoàn thiện increment CASH/preview và PayOS return mapping trong
  phạm vi Phase 2 theo yêu cầu user. Thêm mentor cash list/confirm, transaction
  idempotent với audit/activation/progress; lookup numeric provider orderCode →
  internal orderId theo owner, không settle từ redirect. Payment summary đọc được
  cả CASH. Contract/backlog tại `docs/PHASE_2_FE_CONTRACT.md`; chưa làm materials,
  attendance, enrolled-class listing hoặc progress read/write. Local quality gate
  pass 95 tests (59 PostgreSQL integration, không skip), HTTP built-app pass 4
  tests; chưa deploy/live payment. Không thay trạng thái A1/Phase 0/1 còn thiếu.

- 2026-10-05: Expanded `docs/progress/PHASE_2_PROGRESS.md` with the completed
  Phase 2.1 tooling, VPS deployment, Cloudflare routing, signature/input/restart/
  concurrent test evidence, and successful provider confirm callback. Retained
  A1 latency/coverage limitations and the distinction between probe verification
  and unimplemented BE settlement/real payment. Updated the old step-1 entry to
  point to current server results while preserving its historical date.

- 2026-10-05: Reviewed the existing payment plan and current BE source; PayOS
  integration was already designed in the continuation plan B–D but is not in the
  BE runtime. Created `PHASE_2_2_PAYOS_BE_REAL_PAYMENT.md` and a separate
  `PHASE_2_2_PROGRESS.md` as the current plan/progress for
  schema/module contracts, link/retry, verified atomic settlement, existing-hold
  activation/progress, access, email outbox, reconciliation, tests and VPS/live smoke.
  Read all of `document/Flow.txt`; recorded full payment, online confirmation mail,
  class onl/off, mentor cash confirmation, pending preview and deferred chat/DM.
  Updated rules, phase index, Phase 2/2.1/continuation/core docs and progress to
  reflect server webhook confirmation passed, with A1 limitations preserved.
  This is documentation only; no SDK/payment implementation, migration, VPS route
  switch or real payment was performed. Validation: Markdown local links and
  git diff whitespace checks; no BE tests run for this documentation change.

- 2026-10-05: Phase 2.1 step 3 passed based on user VPS screenshot: PayOS SDK
  CONFIRM_OK for public callback URL at 15:06:34.588Z, matching receiver callback
  200 verified at 15:06:34.302Z (requestId cb1f34be-0dd1-4750-b057-fb9c6947d6fb,
  handler latency 0.53 ms). Stopping for user review. No payment transaction,
  order settlement or enrollment activation was tested; step 4 has not started.

- 2026-10-05: User explicitly requested moving to Phase 2.1 step 3. Prepared a
  VPS SDK confirm command in the probe runbook with bounded timeout/no automatic
  retries and redacted output. Step 2 limitations remain documented; full Gate A1
  is not retroactively marked passed. Waiting for user to run command and provide
  provider-confirm plus callback-log evidence; no actual confirm result yet.

- 2026-10-05: User concurrent synthetic callback test on VPS returned 5/5 HTTP
  200 verified with distinct request IDs; latencies 696/1672/1055/517/2351 ms.
  Functional concurrency passed, but one request exceeded the internal 2-second
  goal. Recorded limitations in Phase 2.1; full Gate A1 is not marked passed
  (external signed sender and receiver log/latency correlation remain pending).
  Stopping for user review, without starting PayOS confirm or real payment.

- 2026-10-05: User screenshot confirms receiver recovery after restart: Compose
  healthy, loopback ready, public callback empty JSON still returns 400, and BE
  public readiness remains ok. Recorded evidence in Phase 2.1. Concurrent signed
  delivery remains pending; no PayOS confirm or real payment is evidenced.

- 2026-10-05: User screenshot confirms public HTTPS invalid JSON rejected with
  400 and oversized input rejected with 413; probe loopback health remains ready.
  Recorded request IDs in Phase 2.1. Concurrent delivery and restart recovery
  checks are pending; no provider confirm or payment has been performed.

- 2026-10-05: User screenshot confirms four synthetic signed fixture checks via
  public HTTPS from VPS: valid and duplicate ACK 200, tampered data rejected 400,
  missing signature rejected 400. Recorded evidence in Phase 2.1. This is not a
  provider callback or real payment; remaining ingress/operational checks are
  pending, and step 2 remains in progress.

- 2026-10-05: User added and reordered the exact PayOS callback route in tunnel
  `flowzy-quanh123` ahead of the general API route. External public HTTPS POST with
  empty JSON returned HTTP 400 `invalid_webhook` from probe (requestId recorded
  in Phase 2.1); BE public readiness returned 200. Signed fixture/server operations
  testing is still pending, so step 2 is not complete; PayOS confirm has not run.

- 2026-10-05: User deployed the Phase 2.1 probe on VPS using both Compose files.
  Screenshots show `mindy-webhook-probe-probe-1` healthy, loopback health ready,
  and HTTP 200/ready through alias `mindy-payos-probe:3100` on `mindy-be_backend`.
  Recorded server evidence in the Phase 2.1 plan. Step 2 remains in progress:
  public callback routing and signed ingress tests are pending. No PayOS confirm
  or real payment has been evidenced.

- 2026-10-04: Phase 2.1 step 2 discovery via user-provided VPS outputs confirmed
  Cloudflare Tunnel `cloudflare-mindy`, shared Docker network `mindy-be_backend`,
  and API ingress `api.quanh123.id.vn -> http://mindy-be-api-1:3000`. Added a
  separate Compose tunnel override with alias `mindy-payos-probe` and updated
  runbook. Receiver code is still local; no remote deploy/tunnel mutation/confirm
  or real payment has occurred. The VPS uses clean `dev` at `e63bf92`.

- 2026-10-04: Created `docs/implement_phase/PHASE_2_1_WEBHOOK_VPS_PAYOS.md` as a
  separate Phase 2.1 plan with four numbered steps and a user review stop after
  each step. User now has Casso and a verified PayOS account. Completed step 1
  preparation only: standalone `tools/webhook-probe` with pinned SDK 2.0.5,
  signature verification, bounded JSON input/timeouts, redacted correlation logs,
  isolated loopback Compose deployment and VPS runbook. Tooling type-check/lint,
  6/6 synthetic HTTP tests, frozen-lockfile install and local Docker image build
  passed. No VPS access/deployment, PayOS confirm or real payment was performed;
  steps 2–4 have not started. Waiting for user review before continuing.

- 2026-10-04: Reviewed Phase 2 code at `577af2f` on `Feat/Webhooktest` against
  project rules and added `docs/implement_phase/PHASE_2_WEBHOOK_VPS_PAYOS_PLAN.md`.
  The plan gates standalone VPS webhook/PayOS confirmation before BE payment
  integration, then fake/DB/HTTP tests and a VPS payment release with a small real
  PayOS smoke test. No VPS access, webhook test, payment implementation or deployment
  has been performed. PayOS has no separate sandbox per its current official docs.
  Local recheck: type-check/build passed; 29 tests passed and 35 PostgreSQL tests
  skipped without TEST_DATABASE_URL. Full check failed on CRLF formatter diagnostics;
  lint/assist passed with formatter disabled for diagnosis only. Local Node 20.20.0
  differs from the pinned Node 22.20.0 baseline; both issues remain release prerequisites.
  User confirmed Git pull + Docker Compose on the VPS and no PayOS channel yet.
  The plan preserves that deployment workflow, selects HTTPS/reverse proxy with
  separate staging data, and leaves real PayOS confirmation pending channel setup.
- 2026-10-02: Added a detailed Phase 2 plan under `docs/implement_phase/` for
  course/class browsing, cart, checkout, full cash/PayOS payment and enrollment.
  It separates planning, migrations and implementation, and leaves live PayOS
  merchant configuration to a later step. This is planned scope, not an
  implementation-complete claim.
- 2026-09-29: Added detailed implementation specifications for Phase 0 (foundation,
  database and deployment baseline) and Phase 1 (users, authentication and
  authorization) under `docs/implement_phase/`.
- 2026-09-30: Expanded the remaining Phase 1 plan with two public `STUDENT`
  registration paths: email/password plus one-time email verification, and Google OIDC
  plus a mandatory profile-completion page prefilled from verified Google claims.
  Added registration intents, identity linking, migrations, security rules and tests;
  this entry is planned scope, not an implementation-complete claim.

## Implementation status

- 2026-10-05 — Implemented Phase 2.2 payOS in BE: pinned SDK 2.0.5; additive
  `1791158400000-payos-payments` migration; persistent single attempt/order and
  numeric sequence/channel mapping; leased link creation with GET-first recovery;
  verified callback/atomic PAID + hold activation + progress + confirmation outbox;
  duplicate/reference-collision/late-payment review; private class/session access;
  shared auth/payment mail transport with retry worker; ADMIN reconciliation command
  and paginated review queue. Added env validation, separate create-link kill switch,
  64 KiB JSON limit, sanitized callback logging, Postman and user deployment runbook.
  Node 22.20.0/pnpm 12.6.0: frozen install and full `pnpm check` passed (36 unit +
  55 PostgreSQL integration = 91 tests, none skipped); built-app HTTP E2E passed
  3 tests with real guards/SDK verifier and test-only fake provider, including outbox
  failure → 503, rollback and successful retry. Parallel suite evaluation on Windows
  produced partial-module errors, resolved by serial test files; concurrency within
  tests remains enabled. Test databases live only in a new disposable PostgreSQL 17
  container with separate regression/payment/HTTP/runtime DBs. Docker production
  image `mindy-be:phase22-check` built, all 10 migrations applied on empty runtime
  test DB; readonly/non-root `node` API was healthy, ready 200, payOS-disabled callback
  503. User chose self-deployment: no VPS migration/routing change/BE confirm, real
  provider payment request or money transfer performed. Cash confirmation/preview
  and Phase 0/1 hardening remain open. Detailed status: PHASE_2_2_PROGRESS.md.

- 2026-10-04 — Added fixed Unsplash image URLs for all six demo courses, verified
  each URL with a successful HTTP 200 JPEG GET (1200×675 requested). Course/class
  seed includes images for new courses and fills missing images for existing demo
  courses without replacing custom images. Added `pnpm seed:course-images` and
  `pnpm seed:data` (admin → accounts → course/class → images, fail-fast).
  Verified full reseeding and rerun on a dedicated disposable PostgreSQL 17 DB:
  6 users, 3 categories, 6 courses, 27 course units, 7 classes, 47 sessions,
  6 courses with images; no duplicate rows, null-image backfill and custom-image
  preservation passed. Full `pnpm check` after image seed implementation passed
  all 67 tests plus lint/type-check/build; aggregate seed command and final lint
  also passed. Local development DB migrations were applied, but its catalog was
  empty; seed execution verification used the disposable DB with test credentials.
  No VPS seed/deployment was performed. README documents seed env requirements
  and the existing demo-account password-reset behavior.
- 2026-10-04 — Added optional course `imgUrl` across admin create/update and
  public/admin course list/detail responses. New migration `1791072000000-add-course-img-url`
  adds nullable `courses.img_url` varchar(2048), preserving existing courses without
  images. HTTP/HTTPS URLs only, explicit protocol, no embedded credentials, max 2048
  characters; omitted PATCH values preserve the image and null clears it. Updated
  DBML and Phase 2 API notes. Full `pnpm check` passed under Node 22.20.0/pnpm 12.6.0:
  lint, type-check, 67 tests (31 unit + 36 PostgreSQL integration, none skipped) and
  build. Integration includes image persistence/mapping/update/clear and migration
  up/down/up on a dedicated disposable PostgreSQL 17 test container. No VPS migration
  or deployment has been performed.
- 2026-10-04 — Fixed the Windows checkout quality gate: added `.gitattributes`
  (`text=auto eol=lf`), explicitly set Biome LF, normalized tracked text files locally
  and formatted `register.dto.ts` (quotes/import layout only). Existing Node version
  files already pinned 22.20.0. Installed/selected Node 22.20.0 with nvm-windows and
  pnpm 12.6.0; confirmed the Node version used through pnpm. Frozen-lockfile install
  succeeded without dependency/lockfile changes. Full `pnpm check` passed: lint,
  type-check, all 64 tests (29 unit + 35 PostgreSQL integration, none skipped) and build.
  Integration tests used a new, disposable PostgreSQL 17 container on a dynamic
  loopback port with its own `mindy_center_test` database, not an existing project DB.
  Migration up/down/up, checkout concurrency/rollback and expiry tests passed.
  README now explains runtime selection, LF and the full-test database requirement.
  These are local results; no merge, push or VPS deployment was performed.
- 2026-09-30 — Phase 0 implementation and local runtime smoke checks pass: source and
  production migration commands, PostgreSQL readiness, non-root Docker image startup,
  persistent local volume and `pnpm check` were verified. Phase 0 is not formally
  closed until clean-database migration is enforced in CI, test-database isolation is
  guarded, and backup/restore is exercised.
- 2026-09-30 — Phase 1 functional smoke checks pass against PostgreSQL: login, `/me`,
  refresh rotation, admin user listing and logout work through `HttpOnly` cookies.
  Swagger cookie schemes and a Postman cookie-jar collection are available. Phase 1 is
  not formally closed until public registration, email verification, Google onboarding,
  the planned integration/E2E/concurrency suite, rate-limit/CSRF baseline and staging
  smoke test are complete.
- Quality gate: `pnpm check` passes (lint, type-check, 8 unit tests and build); Docker
  image `mindy-be:phase01-check` builds and its liveness/readiness checks pass as user
  `node`.
- 2026-09-30 — Hardened the VPS container baseline: cached multi-stage production build,
  production-only dependencies, non-root runtime with an init process, readiness
  healthcheck, one-off migration gate, loopback-only API publishing, read-only API
  filesystem and a VPS deployment guide with production environment requirements.
- 2026-10-02 — Rechecked the VPS deployment path: production Swagger is controlled by
  `.env.production`, API publishing supports either a public or loopback bind address,
  the production environment template is tracked by Git, and deployment documentation
  covers Compose validation, direct Swagger smoke testing, HTTPS proxying and secret
  rotation.
- Phase 2 detail (structure, flows, APIs, tests, remaining work): PHASE_2_PROGRESS.md in this folder.
- 2026-10-02 — Phase 2 implemented up to checkout only (catalog, class management, cart,
  checkout, seat hold/expiry). Payment is intentionally not started: no `PaymentsModule`,
  no payment tables, no PayOS/cash confirmation, no preview endpoint, no confirmation email.
  - Modules: `catalog`, `classes` (class/unit/session aggregate; services split into
    command, schedule, read and offers), `enrollments` (seat holds), `course-browse` (public
    browse) and `commerce` (cart, checkout, orders, expiry job). Each module keeps
    `controllers/ services/ entities/ enums/ dtos/ exceptions/ domain/`.
  - Migrations: `course-catalog`, `class-operations`, `commerce-orders` and
    `enrollment-seat-holds`. Deviation from the plan: `enrollments` is created now (with
    `order_detail_id` and the partial unique index) because checkout holds seats through
    PENDING_PAYMENT enrollments. The later `payments-enrollment` migration only needs the
    payment tables and `class_unit_progress`.
  - Checkout creates PENDING orders and seat holds but no `payment_transactions` row; the
    payment step must create it when it is implemented.
  - Verified: migrations up/down/up on a dedicated test database; 29 unit tests and 35
    PostgreSQL integration tests (rollback, price revalidation, cash split per mentor,
    last-seat concurrency, deadlock-free lock order, expiry and re-checkout, constraints);
    two HTTP smoke runs (42 and 81 checks, including the expiry job running in the app and
    the Swagger document) against the built app (roles, 401/403/404/409/422, public DTOs
    without meeting URLs). Integration tests need `TEST_DATABASE_URL` pointing at a database
    whose name ends with `_test`; they are skipped without it and CI now provides one.
  - Demo data in src/database/seed: pnpm seed:account (two mentors, three students)
    then pnpm seed:course-class (programming categories, courses and classes with timetables
    taught by those mentors). Both are idempotent.
  - Role cleanup: the `MANAGER` role was removed (enum, guards, docs and migration
    `remove-manager-role`); `ADMIN` holds every management permission. The migration refuses
    to run while a user still has the role.
  - Not done: automated HTTP E2E tests (Vitest/esbuild does not emit decorator metadata, so
    booting Nest in tests needs an SWC plugin decision), Postman collection update, staging
    smoke. Phase 1 exit criteria are still open as noted above.
