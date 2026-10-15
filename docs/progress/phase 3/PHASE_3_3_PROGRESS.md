# Phase 3.3 — Tiến độ Material management

Cập nhật: **2026-10-15**.
Plan: [PHASE_3_3_MATERIAL_MANAGEMENT.md](../../implement_phase/phase%203/PHASE_3_3_MATERIAL_MANAGEMENT.md).
Flow: [PHASE_3_3_FLOW.md](../../api_flow/PHASE_3_3_FLOW.md).
API đã có + dự kiến: [breakdown 3.3](../../api_flow/PHASE_3_3_flow-api-breakdown.md).

## Hiện trạng

- 2026-10-15: Đã xử lý conflict với dev/Phase4, giữ implementation Materials13–14/10.
  Quyết định schema22/bridge và kết quả tích hợp ở mục cuối; các ghi chép bên dưới
  ngày11–13/10 là lịch sử planning tại thời điểm đó, không thay trạng thái hiện hành.

- 2026-10-13: Theo user, người khác triển khai3.3–3.6; user nhận deploy/server
  acceptance; FE do nhóm riêng, repo FE local chỉ để đọc. Lập
  [plan3.4 phối hợp](../../implement_phase/phase%203/PHASE_3_4_MATERIAL_ACCESS_PREVIEW.md)
  và cập nhật plan3.3: typed schema/refs/policy3.3.1 bàn giao consumer; staff
  preview/assets3.4 nghiệm thu cùng review3.3.3; Student server journey sau
  publication/release. Contract preview/asset GET + expectedRevision là planned,
  không source/API runtime change. Một người sở hữu schema/migration; user nhận
  SHA/migrations/config/checks/Postman/smoke/rollback khi triển khai bàn giao.
  Chỉ tài liệu BE; không sửa source/FE, migrate, runtime tests hoặc deploy.
  Planning checks: git diff --check pass; 14 tài liệu/152 local links/1 anchor/
  14 JSON examples hợp lệ, code fences cân bằng. Evidence này chỉ cho tài liệu.

- 2026-10-12 (tư vấn UX Unit/bài học): User muốn CKEditor FE + HTML BE như trang
  đọc kiến thức. Đề xuất Course Unit metadata/description + nhiều Material ARTICLE,
  không thêm bảng details trùng content. PDF dùng FILE riêng hoặc attachment;
  upload READY không tạo/publish Material hay tự chuyển sang HTML. Đã đối chiếu
  entity/controller hiện tại: FILE/VIDEO read có sẵn, ARTICLE/authoring/attachments
  còn planned. Cập nhật plan/flow/breakdown; không implement/migrate/deploy ARTICLE.
- Cùng lượt chạy lại pnpm seed:course-class trên DB development local: tạo 0 lớp
  vì cohort đã tồn tại; query xác minh HTML-CSS-101-10S-20261013 có 5 Course Unit,
  5 Class Unit và 10 Session, hai buổi mỗi Unit (13/10–14/11). Không ghi Material.
  Phần tư vấn không có implementation/test ARTICLE. Sau yêu cầu tiếp theo seed3
  lớp, code seed đổi và pnpm check298/298 pass (27 suites); xem progress2.3,
  không dùng kết quả seed/tests này làm evidence triển khai ARTICLE3.3.

- 2026-10-12: 3.2 đã nghiệm thu VPS theo xác nhận user; hoàn thiện plan3.3 từ
  bản nháp, thống nhất ARTICLE HTML/FILE/VIDEO trong schema/domain/DTO/flow.
  Bổ sung gate local + server từng slice, batch lock mọi primary/inline/attachment
  refs trước Class locks, safe summaries và bàn giao3.4. Estimate BE provisional
  7–10 ngày, chốt sau sanitizer/batch-lock spike. Chưa implement/test/deploy3.3.

- 2026-10-11: User mở rộng scope thành ARTICLE lưu HTML, FILE và VIDEO MP4 private
MinIO+signed URL; HLS sau. Đã cập nhật plan/flow/breakdown cho sanitize, nullable
file có CHECK theo loại, inline/attachment refs, Student article/asset access và
video Range/expiry. API/source 3.3 vẫn chưa implement; estimate file-only cũ cần
hiệu chỉnh. User muốn nghiệm thu API trên server ở mỗi slice, không chỉ local.

**3.3.1–3.3.4 đã implement local; chưa deploy/nghiệm thu VPS. 3.3.5 đã hoàn thiện local acceptance/handoff; VPS evidence/user sign-off còn pending.** User xác nhận 3.1/3.2 đã xong.
Policy/review domain, Files READY reference lock và Classes context có sẵn;
đã có Material FILE/VIDEO read persistence và ba Student GET theo
[read slice3.4](PHASE_3_4_PROGRESS.md); Manager authoring HTTP có ở3.3.1; Mentor context/authoring/submit có ở3.3.2; review/publication HTTP có ở3.3.3; release HTTP đã có3.3.4 local.
Khi triển khai typed schema3.3, mở rộng bằng migration additive mới.

## Lượt planning — 2026-10-11

- Đọc Flow.txt, rules, plans/progress 3.1/3.2 và source policy/Files/Classes/schema.
- Chia 5 bước: Manager persistence/CRUD → Mentor context/draft/submit → Manager
  review/publication → Class Unit release → full checks và bàn giao 3.4.
- Kế thừa Course Unit owner/shared live/firstApprovedAt/revision và role đã chốt.
  Ghi schema/audit/ancestry guards, file/class lock ordering, visibility trước
  pagination, transaction actor/assignment checks, test matrix và rollout.
- Bổ sung kế hoạch Mentor unit/session picker; không thay roster/payment DTO.
  Item detail để FE refetch conflicts; API planned đều đánh dấu chưa triển khai.
- Ghi drift: ParseUUIDPipe path 400 khác body/query 422; chưa có global CSRF
  guard. Đề xuất Origin check cho mutation mới, không mô tả CORS là CSRF protection.
- Student read/download và Manager/Mentor binary preview ở 3.4; 3.3 nghiệm thu
  state/metadata review, không tuyên bố human binary review đã dùng được.
- Kiểm diff whitespace, liên kết cục bộ tài liệu mới/cập nhật và ví dụ JSON.
  Không chạy BE/HTTP/DB/MinIO tests; không migrate dev/VPS, deploy, sửa FE hoặc payment live.

## Theo dõi triển khai

| Bước | Trạng thái | Gate |
|---|---|---|
| Plan | Hoàn tất | Plan + flow/API + progress/index đồng bộ |
| 3.3.1 Typed Manager draft | Đã implement local; chờ VPS acceptance | ARTICLE-only/sanitize/refs/FILE/VIDEO + schema/READY/ancestry/audit/locks; server CRUD cases |
| 3.3.2 Mentor context/submission | Đã implement local; chờ VPS acceptance | Assignment + own draft + ID mapping + hidden pagination; evidence bên dưới |
| 3.3.3 Review/publication | Đã implement local; chờ VPS acceptance | Queue/revision/races/no-op retry/firstApprovedAt + withdrawal migration |
| 3.3.4 Class Unit release | Đã implement local; chờ VPS acceptance | Actor/Class/Unit locks, time semantics, atomic Classes audit |
| 3.3.5 Acceptance/handoff | Local verified; chờ VPS/user sign-off | Full gates406/48/42, all migrations/Postman–Swagger check, three typed workflows, runbook/evidence table + providers/fixtures3.4 |

## Lượt hoàn thiện plan — 2026-10-12

- Lấy nghiệm thu3.2 làm baseline, không yêu cầu upload gate lại.
- Hợp nhất plan từ file-only + addendum thành typed ARTICLE/FILE/VIDEO; CHECK theo
  loại, references table, HTML-only không file, safe summary/detail và sanitizer bounds.
- Đồng bộ API examples bắt buộc contentType, fileId theo loại, nullable file và
  list omit HTML; workflow review/revision/firstApprovedAt giữ baseline.
- Ghi multi-file lock gap của provider3.2: cần batch khóa mọi file trước Class,
  khóa union old/new refs khi replacement và kiểm actor cùng transaction.
- Chia việc + local gate + server acceptance3.3.1–3.3.5; preview binary/Student/
  signed GET/video Range thuộc3.4, cleanup refs thuộc3.5; không đợi3.6 mới deploy.
- Kiểm diff whitespace, local links/anchors và JSON examples của tài liệu cập nhật.
  Kết quả: git diff --check pass; 9 tài liệu, 95 local links và 9 JSON examples
  hợp lệ, không lỗi link/anchor/JSON.
  Không chạy pnpm check/DB/HTTP/MinIO tests, migration, source/FE hoặc deploy.

## Evidence và phần còn mở

Evidence 3.1/3.2 đã có trong progress riêng; không phải test pass 3.3.
Đã có Material migration/DB/HTTP tests3.3.1 và SQL self-review; PR reviewer trước merge còn cần chỉ định.
Preview binary, UI/VPS smoke chưa có.
Chốt SQL ancestry/parent locks và reviewer trước merge khi implement 3.3.1.
Manager picker inactive catalogue là gap UI riêng; không cấp quyền Admin tạm.

## Triển khai 3.3.1 — 2026-10-13

- Branch `codex/phase-3-3-1-manager-materials`; typed ARTICLE/FILE/VIDEO domain,
  sanitizer/canonical HTML, inline images/attachments, nullable primary và safe DTO.
- Additive migration `1791849600000-typed-manager-materials`, refs/audit/indexes,
  typed CHECK, READY/kind/scope/file-state protections, immutable ancestry/first approval,
  append-only audit. Clean up/down/up và upgrade có FILE legacy trên DB test.
- Files batch reference khóa union old/new file rows UUID tăng dần trước Class authorize;
  reuse batch summary read không upload-owner check/không storage network.
- Manager create/list/detail/PATCH/delete; roles/current actor under transaction,
  Users FOR SHARE bảo vệ role/status, Origin allowlist bắt buộc, stale revision409,
  same-value EDIT tăng revision/reset approval, DELETE retry204/không audit trùng.
- Tests ARTICLE-only/image-only/XSS/UTF-8/depth/nodes, refs/kind/scope, đổi file
  ngược chiều, PATCH races, rollback audit/ref replacement, file-state race,
  parent reparent guards, actor revoke lock, tombstones và safe summary/detail.
- Built-app HTTP tests3.3.1 chạy cùng fixture Files3.2: CRUD/roles/Origin/DTO/413/
  Swagger và attach PDF/MP4 đã upload/validate trên MinIO thật. Fixture cố định
  MINIO_PUBLIC_URL local, tránh kế thừa public endpoint của .env.
- Swagger, Postman Phase33, DBML, plan/flow/API/progress cập nhật theo source.
- Final local gate: `pnpm check` pass (lint/type-check/build + **332/332 tests,
  30 suites, 0 skip**); `pnpm test:http` **32/32, 2 suites, 0 skip**;
  `pnpm test:files` **42/42, 1 suite, 0 skip**, PostgreSQL + private MinIO thật.
  Test331 có14 integration cases; sanitizer17 cases; shared typed predicate3 cases.
  HTTP3.3.1 có5 cases trong Files HTTP suite, gồm nhiều nhánh role/DTO/Origin.
  `git diff --check` pass; 26 local links, 9 JSON examples và11 Postman requests hợp lệ.
  Log ERROR/WARN trong các failure/retry fixtures có chủ đích; không có test failure.
- Chỉ migrate dedicated *_test databases và bucket fixture riêng; chưa migrate dev/VPS,
  chưa deploy/merge hoặc nghiệm thu server. Mentor/review/release và ARTICLE asset
  access/binary preview chưa được cấp bởi slice này.

### Server acceptance 3.3.1 cần chạy sau deploy

Backup DB → chạy additive migration → deploy app → health/auth smoke. Import
`postman/Mindy-Materials-Phase33.postman_collection.json`, đặt Manager credentials,
Origin đúng allowlist và Course Unit fixture UUID. Ghi release SHA/migration ID,
request/status/result cho các ca: text ARTICLE CRUD; ảnh IMAGE + PDF attachment;
FILE PDF/VIDEO MP4 READY3.2; stale PATCH409; DELETE retry204/detail404; foreign refs422;
Admin/Mentor/Student403; missing/foreign Origin403; empty ARTICLE422; body413.
Không tự đánh dấu server pass từ local checks. Rollback app giữ typed tables/data.

## Triển khai 3.3.2 — 2026-10-13

- Branch `codex/phase-3-3-2-mentor-submission`. Đọc toàn Flow.txt/rules/plan;
  triển khai Materials thuộc Course Unit/shared live, Class provenance chỉ quản lý
  own submission. Không đổi CASH/PayOS/Student entitlement/chat/mail flow.
- Classes có GET `/mentor/classes/:classId/units` và `.../units/:unitId/sessions`:
  current active Mentor/assignment/Class chưa CANCELLED, pagination1/20 max100,
  title batch Catalog, không meeting URL/room/enrollment; mapping IDs như breakdown.
- Materials có sáu routes Mentor typed create/list/detail/PATCH/delete/submit.
  Đổi ManagerMaterialsService thành MaterialAuthoringService chung cho hai actors,
  giữ toàn bộ sanitizer/reference/revision/audit baseline. List SQL visibility trước
  count/page: published APPROVED chung + own never-approved đúng provenance Class.
  Summary không HTML/refs arrays; detail có canonical HTML/verified refs, own reason,
  canEdit chỉ DRAFT/REJECTED + firstApprovedAt null. Không áp Student release/time gates.
- Mutation recheck actor/assignment/ancestry dưới locks: Material→union old/new files
  UUID tăng dần→Users FOR SHARE→union Classes UUID tăng dần (file upload intents cũ/mới,
  submission Class, session Class). ARTICLE-only cũng khóa actor/Class. Files batch
  provider nhận optional contextClassIds; giữ single-file3.2. Không storage network
  trong authoring transactions; retry deadlock/serialization tối đa3 lần như baseline.
- SUBMIT DRAFT→PENDING_REVIEW giữ revision; retry pending cùng revision giữ updatedAt/
  timestamps và không audit trùng. REJECTED phải EDIT trước, pending không EDIT/delete;
  từng approved không được Mentor sửa/xóa/submit dù Manager đã sửa về DRAFT.
  Soft-delete authorized retry204 giữ refs/binary; role/status/assignment bị thu hồi
  chặn cả tombstone retry. Origin bắt buộc mutations, no-store metadata.
- Không thêm migration/schema/config/dependency; dùng migration3.3.1. Swagger/Postman
  22 requests cập nhật với Mentor login/context/ARTICLE/FILE/VIDEO/list/detail/edit/
  submit/delete. Manager review/publication/release còn3.3.3/3.3.4; binary preview3.4.
- Local checks **Node22.20.0/pnpm12.6.0**: `pnpm check` pass lint/type-check/build và
  **348/348 tests, 31 suites, 0 skip**; `pnpm test:http` **36/36, 2 suites, 0 skip**;
  `pnpm test:files` **42/42, 1 suite, 0 skip**. Mentor thêm16 DB integration cases và4
  HTTP cases, gồm MinIO upload/validation thật PDF/MP4→READY→create→submit. PostgreSQL
  dedicated *_test/bucket fixture riêng; các failure/retry logs có chủ đích.
- Lượt HTTP đầu có sai field fixture khiến vòng upload không chạy; type-check phát
  hiện, đã sửa sang filename/mimeType + assertion2 binaries và chạy lại HTTP thành công.
  Kết quả cuối phía trên là lượt sau sửa trên Node22.20.0, không dùng lượt đầu làm
  evidence upload. Runtime mặc định host24; portable Node22 checksum verified dùng
  riêng cho gates, không đổi runtime/cấu hình hệ thống.
- Final documentation check: `git diff --check` và lint pass; 7 Markdown files,
  87 local links, 9 JSON examples và22 Postman requests hợp lệ (13 bodies JSON).
- Kiểm concurrency submit/submit, EDIT/submit, reassignment/cancel trước lock,
  actor/assignment revoke đợi mutation commit; audit-failure rollback, cross-class
  file scope locks, own rejected EDIT/resubmit, published shared reads/hidden total.
  Fixtures DB tạo state REJECTED/APPROVED để test; không phải Manager review API.
- Không migrate dev/VPS, merge/push/deploy hoặc server acceptance. PR/API/auth review
  cần trước merge theo repo rules; metrics/rate limiting/i18n tiếp tục baseline hardening,
  không tự đánh dấu đã hoàn tất trong slice này.

### Server acceptance 3.3.2 cần chạy sau deploy

Đảm bảo migration3.3.1 đã chạy (slice3.3.2 không có migration mới), deploy app/health/
auth smoke; import Phase33 collection. Chọn classId đang assigned Mentor, lấy Unit
id/courseUnitId/sessionId từ context mới; Origin khớp allowlist. Ghi release SHA,
migration IDs, status/code/result cho các ca:

1. Context Unit/session đúng ID mapping, phân trang, wrong parent404; nonassignment/
   cancelled403, wrong role403, anonymous401, UUID400/query422.
2. Text-only ARTICLE201 canonical HTML + provenance/revision1; own READY FILE PDF,
   VIDEO MP4 và ARTICLE IMAGE/PDF attachment sau upload3.2; foreign owner/scope bị chặn.
3. Own draft EDIT revision+1; SUBMIT200 pending/revision giữ; repeat cùng revision
   giữ timestamps/audit; pending EDIT/delete403, stale mutation409; DELETE draft
   same revision204/detail404. Missing revision422/Origin403/oversized JSON413.
4. Mentor khác hoặc lớp khác không thấy draft (detail404/list hidden trước total);
   revoke assignment/cancel chặn context/list/detail/create/edit/delete/submit403,
   Manager vẫn thấy submission. Review/reject/resubmit runtime chờ3.3.3.

Chỉ ghi server pass khi thực hiện trên VPS; local fixtures không thay server evidence.

## Triển khai 3.3.3 — 2026-10-13

- Branch codex/phase-3-3-3-material-review. Bốn POST Manager approve/reject/publish/
  unpublish đã implement HTTP200 detail/no-store; queue dùng global list filters
  reviewStatus/courseUnitId/contentType và pagination trước total, summary không HTML.
  Strict expectedRevision1..2147483647, reason string nonempty/max2.000 trước trim,
  cookie/role/Origin/path validation; safe DTO/canEdit theo actor như3.3.1/3.3.2.
- Material row lock→mọi file UUID→actor→Classes; typed snapshots/current refs,
  workflow+audit atomic. Review/publication không sửa content/reference rows;
  no-op không save nên giữ updatedAt/timestamps/audit. Approve/reject chỉ một thắng;
  review sau EDIT revision cũ409; Manager EDIT dù cùng giá trị tăng revision và
  clear approval/publication, giữ firstApprovedAt; Mentor không lấy lại quyền sửa.
- Manager own DRAFT approve trực tiếp, Mentor chưa submit/Manager khác chưa từng
  approve draft409; bản Manager sửa sau từng approved được approve lại. Reject
  cùng revision/trimmed reason no-op, reason khác409; phải EDIT trước resubmit.
  Unpublish giữ approval; approve retry sau unpublish không republish, cần publish.
- Migration mới1791853200000-material-publication-withdrawal: trigger cũ gate READY
  trên mọi UPDATE ngăn unpublish khi file unavailable. Bypass chỉ withdrawal hoặc
  soft-delete với content/identity/revision/review giữ nguyên. Insert/EDIT/review/
  publication mới vẫn guard READY/ancestry. Không sửa migration đã chạy. Down chỉ
  phục hồi trigger cũ, giữ tables/data/audit; clean up/down/up đã test DB *_test.
  Staff detail/delete/unpublish dùng batch metadata unavailable nội bộ; Student
  read/signing giữ default READY. Không storage signing/network trong decisions.
- Gates trên Node22.20.0/pnpm12.6.0: pnpm check pass lint/type-check/build,
  **365/365 tests, 32 suites, 0 skip, 0 unhandled errors**; pnpm test:http
  **40/40 tests, 2 suites, 0 skip**. Full check gồm Files42/42 và Student read15/15;
  không cần lặp standalone Files gate. Thêm17 DB tests và4 HTTP cases (21 cases),
  gồm real MinIO validated PDF/MP4 review, queue/reject/edit/resubmit/approve,
  publication retry, stale commands, auth/Origin/DTO/UUID/tombstone và concurrency.
- Lượt đầu DB test thiếu local Docker/PostgreSQL đang dừng; đã khởi động existing
  test dependencies. READY-unavailable fixtures phát hiện staff summary/DB trigger
  chặn withdrawal, đã sửa bằng option + migration mới và test lại thành công.
  Full gate đầu có365 assertions pass nhưng fail do test3.3.2 tạo nhiều rejection
  promises trước khi attach assertion; chuyển thành callback gọi lần lượt, chạy lại
  full gate sạch. Các kết quả cuối phía trên là sau sửa, không dùng lượt fail.
- Swagger/Postman **27 requests/17 JSON bodies**, flow/API breakdown/plan/index và
  progress đồng bộ. Không thêm dependency/config; không migrate dev/VPS, merge/push/
  deploy hoặc tuyên bố server acceptance. SQL/API/auth/transaction review trước merge
  theo repo rules; release3.3.4, handoff3.3.5 và binary preview/ARTICLE assets3.4 còn planned.

### Server acceptance 3.3.3 cần chạy sau deploy

Chạy migration1791853200000 sau schema3.3.1, deploy app/health/auth smoke; import
Phase33 collection, Origin khớp CORS_ORIGINS. Ghi release SHA/migration IDs,
HTTP status/code/response và audit counts cho từng ca:

1. Mentor tạo text-only ARTICLE→submit; Manager queue filters→detail đọc canonical
   HTML. Login Manager lại để cookie jar đúng actor; không dùng Files status làm preview.
2. Manager reject reason→Mentor detail có canEdit/reason→EDIT revision+1→resubmit
   →Manager approve: APPROVED/current approvedRevision, firstApprovedAt/publishedAt.
   Repeat giữ audit/timestamps; reason khác409, stale revision409, pending EDIT403.
3. Unpublish→approval giữ, approve retry không republish→publish. Repeated publish/
   unpublish không audit trùng; publish/unpublish/publish là transition hợp lệ cùng revision.
4. Manager PATCH published dù cùng giá trị→DRAFT/revision+1/current approval null,
   firstApprovedAt giữ; Mentor EDIT/delete/submit403, Manager reapprove đúng revision.
5. READY PDF/MP4 và ARTICLE inline IMAGE/attachment review; every ref READY gate,
   disabled MinIO không chặn metadata decisions. Binary human review chờ3.4.
6. Role/anonymous/Origin/path/body/reason bounds, deleted404; approve/reject và
   decision/PATCH races; actor/assignment revoke theo local matrix. Manager vẫn duyệt
   được submission sau Mentor mất assignment; không cấp quyền Mentor lại.

Chưa chạy những ca này trên VPS; local evidence không thay server evidence.

## Triển khai 3.3.4 — 2026-10-13

- Hai PATCH Admin/Mentor Class Unit release200/no-store, cookie/route role/Origin,
  current active actor và current assignment. Path Class Unit UUIDv4/ancestry404.
- LOCKED/OPEN required; unlockAt omitted giữ/null xóa. Past hợp lệ, ISO timezone,
  năm0001–9999 cả local/UTC, millisecond1–3, invalid calendar/hour/offset/precision422.
  Unit COMPLETED hoặc Class CANCELLED409 UNIT_RELEASE_CONFLICT kể cả no-op.
  Class COMPLETED vẫn cho release Unit chưa COMPLETED theo §9 plan/API.
- Actor FOR SHARE → Class FOR UPDATE → Unit FOR UPDATE, authorization recheck dưới
  locks. Serialize reassignment/cancel/role/status/completion; no file/Material lock
  hoặc MinIO/SMTP. Retry toàn transaction tối đa3 lần chỉ40P01/40001.
- Update release + class_unit_release_audit atomic, no-op không save/audit; equivalent
  timezone instants giữ updatedAt. Audit actor/class/unit/before/after/time, service
  append-only. Concurrent opposite changes tạo audit chain khớp state cuối.
- Migration additive1791856800000, composite FK (class_unit_id,class_id), unique
  (class_units.id,class_id), status/change CHECK và indexes; không sửa migration cũ.
  Clean up/down/up và seeded Class Unit/enrollment preservation đã test trên DB riêng.
  Down xóa audit: production rollback code giữ schema/data, không down bảng có audit thật.
- Origin guard chuyển common; Materials giữ alias cho cùng implementation. Full
  HTTP regression xác minh Files/authoring/submission/review vẫn bảo vệ Origin.
- Node22.20.0/pnpm12.6.0, PostgreSQL *_test + private local MinIO:
  **pnpm check406/406 tests,34 suites; lint/type-check/build pass;0 skip.**
  **pnpm test:http44/44 tests,2 suites;0 skip.**
  Mới16 release integration cases (identity/Class/Unit races, audit rollback/FKs,
  no-op/migration),24 DTO cases,4 HTTP cases; thêm Student regression chứng minh
  shared Material release độc lập theo hai lớp, future/past/LOCKED/CASH pending và
  không đổi Material/enrollment/progress. Exact time boundary giữ domain tests3.1.
- Lượt kiểm tra đầu phát hiện strict ISO library làm sai năm có leading zero,
  đã dùng bounded calendar/instant validator và test lại cả bounds. HTTP test mới
  ban đầu để Unit OPEN làm ảnh hưởng fixture Student cũ; thêm cleanup nested suite,
  rerun final HTTP44/44. Full evidence trên là lượt cuối sau sửa.
- Swagger hai route + release enum, Postman34 requests (Admin login +6 release
  examples), DBML/plan/flow/breakdown/index/progress đồng bộ. Kiểm JSON/local links/
  git diff whitespace; sửa một link runbook cũ trong Postman README.
- Branch codex/phase-3-3-4-unit-release. Chưa migrate development/VPS, commit/merge/
  push/deploy hoặc server acceptance. SQL/API/auth/transaction review trước merge
  theo repo rules;3.3.5 acceptance/handoff và staff binary preview/Student ARTICLE
  assets3.4 vẫn pending, không đánh dấu toàn phase3.3 complete.

### Server acceptance 3.3.4 cần chạy sau deploy

1. Chạy migration1791856800000 sau các migration3.3.1/3.3.3, deploy/health/auth
   smoke. Import Phase33, set Origin đúng CORS_ORIGINS; ghi SHA/migration IDs.
2. Admin class detail lấy classId/Class Unit ID→OPEN/LOCKED/schedule. Login Mentor
   hiện assigned→Unit picker→các thao tác tương tự. Manager/Student/wrong role403,
   Mentor khác403; missing Origin403, UUID400, DTO422, wrong ancestry404.
3. unlockAt omitted giữ/null xóa, past/future/timezone đồng instant; repeat giữ
   updatedAt/audit count. UNIT COMPLETED/CANCELLED Class409 không update/audit.
4. Hai lớp cùng Course Unit/approved Material: mở một lớp không mở lớp kia;
   OPEN+future chờ serverNow, LOCKED+past vẫn chặn. CASH pending vẫn denied;
   không đổi enrollment/progress/payment hoặc Material approval/revision/publication.
5. Hai release concurrent serialize và audit khớp state cuối; assignment/actor revoke
   chặn request tiếp theo, Unit completion/cancel409. Lost response refetch context,
   không auto replay release cũ. Ghi HTTP status/code/DTO/audit/count evidence.

Chưa chạy các ca này trên VPS; local evidence không thay server acceptance.

## Migration development — 2026-10-14

Theo yêu cầu user, dùng DATABASE_URL development trong .env (localhost:5433,
mindy_center). Preflight migration:show có14 applied/2 pending: withdrawal3.3.3
1791853200000 và release audit3.3.4 1791856800000. Chạy pnpm migration:run với
Node22.20.0/pnpm12.6.0: cảhai execute thành công và COMMIT cùng transaction.
Postflight16/16 source migrations applied, không pending; schema có
class_unit_release_audit,6 constraints/4 indexes và2 Material content triggers.
Development đã có schema3.3.4; không deploy/migrate VPS/nghiệm thu server3.3.5.
Không chạy lại test BE/HTTP ở lượt migrate này; local gate406/44 phía trên là
lượt implementation trước. Kiểm git diff whitespace cho cập nhật tài liệu.

## Triển khai 3.3.5 — 2026-10-14

- Hoàn thiện acceptance/handoff local theo plan; không thêm endpoint/DTO/schema,
  migration hoặc dependency. Thêm4 HTTP cases trong built-app suite: đối chiếu
  toàn bộ16 source migration IDs với startup DB và34 Postman method/routes với
  Swagger; ba workflows riêng ARTICLE/FILE/VIDEO dùng Mentor upload MinIO thật.
- ARTICLE dùng PNG inline + PDF attachment, FILE PDF, VIDEO MP4 đều complete/
  validation READY trước create; submit→reject→EDIT revision2→resubmit→approve
  →Mentor release→unpublish→approve retry không republish→publish→Manager EDIT
  revoke revision3→stale publish409. Kiểm no-store/safe refs, decisions không đổi
  reference rows và release không đổi Material/enrollment. Fixtures không lấy
  fileId/materialId từ test khác; unit release cleanup trong finally.
- Node22.20.0/pnpm12.6.0 (portable runtime có sẵn), PostgreSQL dedicated *_test
  và local private MinIO: **pnpm check pass406/406 tests,34 suites**, lint/type-check/
  build pass; **pnpm test:http48/48,2 suites**; **pnpm test:files42/42,1 suite**.
  **0 skip,0 unhandled errors**. Rerun lint/type-check cuối sau sửa HTTP fixture pass.
  Tests không dùng development DATABASE_URL; dùng URL đã đổi tên sang *_test,
  helper tạo DB fixture riêng. Không migrate development/VPS trong lượt này.
- HTTP lượt đầu phát hiện assertion fixture ORDER BY id sai vì refs dùng composite
  key và Postman url có dạng string. Đã sửa file_id/role + url union; lượt sau
  phát hiện numeric variable expected_revision cần substitute trước JSON parse.
  Sửa và rerun toàn bộ HTTP48/48 sạch; chỉ kết quả cuối là evidence acceptance.
- DBML đối chiếu primary nullable/typed Material, composite refs, Material audit,
  Class Unit release audit hiện hành; không schema change nên không sửa DBML.
  Swagger có đủ request routes đã đối chiếu Postman (34 requests), JSON templates
  kiểm sau substitution. Flow/breakdown/plan/Postman README/progress/index và
  FE gap audit cập nhật trạng thái authoring/context/review/release local hiện hữu.
- Bàn giao MaterialPolicyService + typed snapshots/predicates, Files batch summaries/
  ready projection/version signing, Classes context providers và binary/DB/HTTP
  fixtures tại [§10 API breakdown](../../api_flow/PHASE_3_3_flow-api-breakdown.md).
  Student ARTICLE/assets/staff preview chưa implement; FILE/VIDEO Student baseline
  và video runtime acceptance vẫn phân biệt. Không sửa source hoặc nghiệm thu UI FE.
- Runbook VPS có backup/migration/health/auth, workflow ba loại + text-only ARTICLE,
  case matrix từng slice, rollback giữ audit/schema và bảng evidence PENDING. Base
  checkout SHA e64a1ab5a2b6162a340de3f5930d3bc2f8e5aa50 chỉ là local base; thay đổi
  lượt này chưa commit, không dùng SHA đó làm release SHA của implementation mới.
  Chưa commit/merge/push/deploy, chưa server evidence hoặc user sign-off3.3.
  PR/API/auth review trước merge tiếp tục theo repo rules; toàn phase3.3 chưa complete.

- Final documentation check: git diff --check và lint pass; kiểm107 local links,5 path FE thuộc audit cũ trỏ sibling repo không có tại workspace hiện tại đã đổi thành tham chiếu text có nhãn lịch sử;102 local links còn lại resolve được.

## Tích hợp Phase3.3/3.4 với Phase4 — 2026-10-15

Gộp `dev` e0c9174 (merge14/10, implementation Phase4 ngày13/10) vào
`feat/phase-3-3` a363012 (Materials implementation13–14/10, plan3.4 cập nhật15/10).
Giữ nguyên các nhật ký và tổng test ở đúng ngày thực hiện; không dùng ngày merge
mới hơn để ghi đè implementation hoặc đánh dấu VPS/browser đã nghiệm thu.

- Giữ authoring/review/release3.3 và ARTICLE/scoped access/staff preview3.4;
  hợp nhất Classes controllers/providers/exports với teaching/lifecycle/attendance4.1–4.3.
  Giữ actor FOR SHARE của Materials và các read providers mới của Phase4.
- Contract hiện hành là POST files/access, response có role/revision; planning
  GET preview/assets + expectedRevision ngày13/10 chỉ giữ dưới nhãn lịch sử.
  Không đổi quyền Materials/CASH sang substitute chỉ vì có teaching assignment.
- Class completion tiếp tục chặn Session SCHEDULED/IN_PROGRESS theo Phase4.
  Fixture3.3.4 kiểm guard409, chuyển Sessions sang terminal rồi complete Class;
  Unit chưa COMPLETED vẫn được release theo policy3.3.4. Không nới business guard.
- Hai nhánh từng tạo cùng constraint `uq_class_units_id_class`. Không sửa/đổi
  tên migration đã chạy: thêm `1791849599999-prepare-release-unit-constraint`
  và `1791856799999-isolate-attendance-unit-constraint` để rename constraint/index,
  giữ OID/FK và dữ liệu, rồi để các migration lịch sử chạy nguyên trạng.
  Hai ID là **khóa thứ tự tương thích**, không phải ngày tạo mới: cả hai được viết
  ngày15/10, lần lượt trước attendance4.2 và release-audit3.3.4. TypeORM chạy các
  migration chưa có theo identity/name và thứ tự timestamp; cần phát hành đầy đủ
  catalog, không chạy riêng migration lịch sử gây va chạm.
- Source hiện có22 migration. Hai migration cùng timestamp1791849600000 có tên
  khác nhau, giữ nguyên. Các con số16 (Materials) và17 (dev/Phase4) là baseline
  lịch sử, không sửa thành22 trong nhật ký cũ. Test tích hợp mới kiểm clean22,
  upgrade16→22 và17→22, giữ data/FK index, down/up và không pending.
- Không migrate development/VPS hoặc thay code FE. Server/user sign-off và browser
  CORS/PDF/MP4 seek/refresh vẫn pending. Các cảnh báo dependency đã báo ở lượt quét
  trước không nằm trong phạm vi sửa conflict này.

Kết quả full local gates sau tích hợp được ghi ở progress3.3/3.4 và Progress chung;
3/3 ca migration compatibility đã pass trên PostgreSQL test riêng.

### Kết quả kiểm chứng cuối sau tích hợp — 2026-10-15

- Node22.20.0/pnpm12.6.0, dedicated PostgreSQL17 test tại localhost:15433 và MinIO
  test local: **pnpm check513/513,48 suites; lint/type-check/build pass**.
- **pnpm test:http60/60,5 suites**, dùng cấu hình mặc định đã nhận từ dev
  (fileParallelism:false), built Nest runtime/cookies/guards và migrations đầy đủ22.
  Không critical skip hoặc unhandled errors trong hai lượt cuối.
- Sau khi rút gọn suffix DB fixture để không bị PostgreSQL truncate mất _test,
  chạy lại lint/type-check và focused migration compatibility: **3/3 pass**.
  Thay đổi cuối này chỉ ở tên/guard DB test, không đổi production code/migrations.
- Lượt trước bridge có HTTP startup fail vì constraint trùng; kết quả60/60 ở trên
  là lượt chạy sau sửa, không dùng skip ở lượt thất bại làm evidence pass.
- 14 conflict đã giải quyết; không sửa migration lịch sử, không migrate DB
  development/VPS hoặc FE. Giữ ngày13/10 planning/Phase4,13–14/10 implementation
  Materials,15/10 integration như các mục riêng. Server/browser/user sign-off còn pending.
