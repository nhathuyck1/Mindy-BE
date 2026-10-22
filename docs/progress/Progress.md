THIS IS THE PROGRESS THAT U WILL BE UPDATED THROUGHOUT THE PROJECT

## 2026-10-22 — Tổng quan nghiệp vụ BE bằng tiếng Việt

Thêm [tài liệu ôn nghiệp vụ](../api_flow/BE_BUSINESS_OVERVIEW_VI.md) dựa trên
controller/service/domain và flow hiện hành: actor, mô hình Course/Class/Session,
checkout/hold, CASH/payOS, quyền học, tài liệu, mentor workspace, attendance,
leave/makeup và QUIZ; kèm câu hỏi tình huống và ví dụ xuyên suốt.
Làm rõ bỏ unit-release, MANAGER xác nhận CASH, ZIP/reporting/completion còn thiếu.
Không thay API/code/schema; chỉ đối chiếu source và kiểm tra tài liệu tĩnh,
không chạy lại runtime tests/migration/provider/deployment.

## 2026-10-22 — Build và CI/CD cho migration tracking

Build tạo manifest SHA-256 và kiểm tra đủ compiled migration so với source.
Container migration và `pnpm migration:run:build` dùng runner xác minh artifact,
chạy toàn bộ pending migrations trong transaction và kiểm tra lại catalog.
CI bắt buộc có artifact `1792627200002-consolidate-tracking.js`, thêm smoke test
compiled runner hai lần trên DB test riêng. Deploy giữ backup trước khi dừng API,
dừng writers khi chuyển bảng/view, chỉ khởi động API mới khi migrate thành công;
nếu lỗi giữ API dừng, không tự rollback hoặc seed.

Local: build đủ 28 migration artifacts, type-check/Biome pass, 5 test artifact gate
pass; YAML và 16 shell blocks của workflow pass kiểm tra syntax. Docker daemon và
PostgreSQL test đang tắt nên chưa build Docker image/chạy smoke DB cho runner mới
tại local; bước smoke đã nằm trong CI. Chưa deploy hoặc chạy DB dev/VPS.

## 2026-10-22 — Gộp audit/receipts và tracking cho Admin

Migration `1792627200002` chuyển bốn bảng receipts vào `mutation_receipts` và
mười bảng audit hiện có vào `audit_events`; bổ sung audit sửa link Meet trong
cùng kho. Giữ namespace chống đụng key giữa module, dữ liệu cũ, required fields,
CHECK/UNIQUE/FK và chế độ chỉ thêm audit/receipt. Tên cũ trở thành view đọc/ghi
tương thích, không lưu bản sao. Giữ riêng file_metadata/file_objects và bộ chứng
cứ attendance_recovery_audits/items có khóa ngoại tổng hợp đặc thù.

Thêm `GET /admin/tracking/events` và `GET /admin/tracking/events/:source/:eventId`
cho ADMIN đang ACTIVE: lọc source/actor/entity/class/session/action/thời gian,
phân trang, metadata danh sách và dữ liệu gốc khi mở chi tiết; bao gồm chứng cứ
recovery, không trả payload receipts. Lịch sử Meet mới lưu link trước/sau.
Swagger, [flow triển khai](../api_flow/ADMIN_TRACKING.md) và collection
`postman/Mindy-Admin-Tracking.postman_collection.json` đã có.

Kiểm tra trước khi chốt commit tracking: Biome, type-check, build pass;
235 unit + 5 integration PostgreSQL pass; toàn bộ HTTP 81/81 pass. Migration
đã rehearse với dữ liệu có sẵn, rollback/up lại, kiểm tra FK/CHECK/UNIQUE,
append-only và key trùng giữa namespace. Một lần chạy rộng gặp retry storage
MinIO; chạy riêng file/materials 39/39 rồi chạy lại toàn bộ HTTP 81/81 đều pass.
Chưa chạy migration trên DB dev/VPS; không cần seed lại. Hoàn thiện trên nhánh
`codex/mentor-teaching-api-gaps`, không đưa thay đổi tracking vào dev trong chat này.

## 2026-10-22 — Mentor sửa link meeting của buổi

Thêm PATCH `/mentor/class-sessions/:sessionId/meeting-url`, chỉ effective mentor
đang hoạt động được sửa buổi SCHEDULED/IN_PROGRESS; khóa Class → Session để đồng
bộ với thay mentor, lịch và lifecycle. expectedVersion bắt buộc, version cũ trả
409; URL HTTP/HTTPS hoặc null để dùng lại link lớp. Giữ lịch và phân công, không
đụng thanh toán. Cookie/role/Origin, UUID và body strict được kiểm tra.

Type-check, build và Biome cho file thay đổi pass; integration PostgreSQL 4/4 và
built-app HTTP workspace 3/3 pass (bao gồm quyền, substitute/teaching snapshot,
hai cập nhật đồng thời, link context, xóa link và validation). Bổ sung Swagger,
Postman và [flow meeting](../api_flow/MENTOR_SESSION_MEETING.md).
Không cần migration; chỉ BE, chưa deploy VPS.

## 2026-10-22 — Bỏ khóa/mở/hẹn giờ chương theo xác nhận của user

Quyền đọc tài liệu theo enrollment ACTIVE sau xác nhận thanh toán, không yêu cầu
mentor mở chương. Bỏ hai PATCH release của Admin/Mentor, service/DTO release và
các test của nghiệp vụ đã bỏ. Giữ kiểm tra thanh toán, ancestry, role, lớp hủy,
duyệt/công bố tài liệu, availableAt và file READY. Chương mới/seed dùng OPEN.

Migration `1792627200001` mở LOCKED, xóa unlock_at, đổi DB default OPEN; giữ
COMPLETED, enrollment, progress và lịch sử audit. Policy bỏ qua cả dữ liệu khóa
cũ trước khi migration được áp dụng. Cập nhật Postman và
[flow quyền truy cập](../api_flow/CLASS_UNIT_ACCESS.md). Chỉ sửa BE, không sửa FE.

Kiểm tra local: 235 unit tests pass; 43 integration tests cho authoring/mentor
context/student materials pass trên PostgreSQL + MinIO, gồm migration up/down/up
và giữ chặn pending CASH. HTTP built-app files/materials 39/39 pass, gồm xác nhận
tiền mặt → đọc/tải ngay và release routes 404/không còn Swagger. Biome cho các file
thay đổi, type-check và build pass. Lần chạy đồng thời ban đầu gặp Node OOM; chạy lại với heap 512MB
pass. Chưa deploy hoặc chạy migration trên DB dev/VPS; phải áp dụng migration khi
triển khai để xóa trạng thái khóa cũ trong response.

## 2026-10-17 — Triển khai nốt workflow nghỉ có duyệt 4.4

Đã implement request/preview/slots/own/staff list/detail, withdraw/reject/approve,
approved intervals và kiểm lịch/candidates/guest placements. Approval atomic
cancel sources → replacements cùng unit/request mentor → extend endDate →
intervals/conflict queue/audits/receipt; current source/version/roles/placements
được recheck dưới Class/Session/mentor/student locks. Có notice2 calendar days,
FULL_DAY acknowledgment và partial-day student conflict guards; GET expiry không
ghi DB, command persist EXPIRED trước409. Không FE/payment/email/env/dependency.
Migration1792195200000 và down guard; server/browser/release4.5 còn riêng.
[Progress4.4](phase%204/PHASE_4_4_PROGRESS.md) ghi gates và giới hạn local.
Gate cuối17/10: **pnpm check634/634 tests/63 suites, lint/type-check/build pass;
pnpm test:http80/80 tests/9 suites,0 skip**. Focused leave PG15/calendar4 và
migration compatibility5 pass; local PostgreSQL/MinIO riêng, fake PayOS.

## 2026-10-17 — Xác nhận thanh toán VPS, dọn file 3.5 và phạm vi 4.5

User xác nhận luồng thanh toán thật đã test thành công trên VPS và phần dọn
file 3.5 đã hoàn tất. Đây là xác nhận trực tiếp của user, không phải agent chạy
lại; các ghi chép pending trước đây là lịch sử. Không tự suy thành đã nghiệm thu
mọi ca email/A1 hoặc mọi tác vụ trích metadata của 3.5.
4.5 còn nghiệm thu tích hợp 4.4 trên server, FE/browser theo role và release/
backup/rollback; không làm lại server/Postman 4.3 đã được user xác nhận xong.
Workflow xin nghỉ/duyệt và approved intervals là gap chức năng 4.4 riêng.
Lượt này chỉ đối chiếu/cập nhật tài liệu, không test runtime hoặc deploy mới.

## 2026-10-16 — Phase2.4 A–C và manager Materials text HTML

Đã implement manager class/contact, role-scoped mentor/student directory và
relationships, global orders/payments safe read. Full CASH manager và Student
ownership/preview/FULL không đổi; D summary backlog. Không migration/env/dependency
mới, không sửa FE/deploy. Flow/breakdown/Postman/phase progress đã cập nhật.

User bổ sung màn hình hai nút: ARTICLE nhận contentText hoặc CKEditor contentHtml;
PDF/TXT/MP3 FILE và MP4 VIDEO qua luồng Files đã có. Bổ sung contract tích hợp BE,
Word .docx là FILE/DOCUMENT để upload và approve theo yêu cầu làm rõ của user. Không tự publish
và không coi upload READY là Student entitlement.

Local gate cuối: pnpm check615/615 (61 suites, lint/type/build pass), focused2.4
9/9 gồm EXPLAIN/re-enrollment. HTTP cuối77/77,8 suites, có full Word DOCX upload/approve/access/withdraw với
MinIO thật; chi tiết ở progress2.4/3.3. Không dùng
kết quả này làm evidence VPS/A1/giao dịch thật. Rate-limit/metrics/i18n riêng và
production-scale index evidence chưa có; không đánh dấu là đã làm.

## 2026-10-16 — Sửa seed roster khi server đã có học viên

User báo JS-101-ON1 full làm rollback cả lượt seed. Đổi mục tiêu theo yêu cầu
mới thành20 ghế mỗi lớp HTML/JS, tính cả ACTIVE/PENDING_PAYMENT hiện có.
Dừng bổ sung khi đạt min(20,maxStudents); lớp đã đầy/trên mục tiêu giữ nguyên,
không xóa ghi danh. Đây là sửa seed, không đổi API/schema/payment runtime.
Lỗi server là ảnh user cung cấp; chưa chạy bản sửa trên VPS.

## 2026-10-16 — Planning Manager HR + kế toán (Phase2.4)

Theo yêu cầu manager xem lớp/course/mentor/student, đã audit source và lập
[plan2.4](../implement_phase/phase2/PHASE_2_4_MANAGER_OPERATIONS.md),
[flow](../api_flow/PHASE_2_4_FLOW.md) và
[API breakdown dự kiến](../api_flow/PHASE_2_4_flow-api-breakdown.md).
Thứ tự: A class detail/filter/contact → B HR directory/profile/relationships →
C orders/payments read; D finance summary là backlog. Manager đã có course GET,
teaching/attendance/materials và CASH; không triển khai lại hoặc mở toàn admin.
Giữ Student flow và các quyền ghi manager hiện có. Chỉ cập nhật tài liệu,
kiểm diff/link; không BE tests/build/migrate/deploy/FE/giao dịch thật lượt này.
[Progress riêng2.4](phase%202/PHASE_2_4_PROGRESS.md).

## 2026-10-16 — Manager thu tiền mặt ở mọi lớp

Theo yêu cầu user, bỏ quyền mentor xác nhận CASH; manager active bất kỳ được xem
mọi lớp/payment roster và confirm đủ tổng đơn, không cần assignment. Thêm GET
/manager/classes và /manager/classes/:classId/students; chuyển GET/POST cash-orders
sang /manager/cash-orders. Mentor roster giữ đọc, canConfirmCash=false. Student
checkout/grouping, CASH preview/TTL/hold, full access và PayOS không thay đổi.
Audit cash-manager lưu người thu; reader/retry/attendance giữ tương thích cash
mentor cũ. Không đổi schema hoặc migration. Đã cập nhật flow, breakdown, contract,
Postman và test fixtures liên quan. [Chi tiết API](../api_flow/PHASE_2_3_flow-api-breakdown.md#thu-tiền-mặt-bởi-manager--2026-10-16).
Local focused payment/attendance 52/52 pass; focused payment + provenance sau bổ
sung 34/34 pass. HTTP 72/72 distinct cases pass qua các lượt: 59 ngoài Phase2.2
pass, Phase2.2 rerun 13/13 pass. Lượt HTTP đầu 71/72 do email manager fixture mới
trùng test tạo user; đã đổi email test. Full check đầu 600/601 do assertion audit
CASH mới đặt nhầm vào test PayOS; chuyển đúng case, focused34/34 pass. Full check
cuối pass: pnpm check (lint/type-check, 601/601 tests trong58 suites, build).
HTTP72/72 distinct cases đã pass qua các lượt như trên. git diff --check pass.
Không deploy/VPS, tiền thật hoặc sửa frontend.


## 2026-10-16 — Test migration hiện hành và loại compiled migration cũ

Fetch origin xác nhận Feat/Phase4 đã chứa origin/dev, ahead5/behind0; không cần
merge thêm. Focused39/39 tests/6 suites pass; mở rộng compatibility từ3 lên5 ca,
5/5 pass gồm full catalog24 từ trống/down-up Phase4.4, upgrade dev22→24 bảo toàn
ARTICLE HTML/unique indexes, các history Materials/Phase4 cũ và không pending.
Chạy production DataSource từ dist phát hiện2 migration local1792108800000/1 còn
compiled dù source đã loại sau merge; lỗi enum42883 khi chạy trùng typed migration.
Sửa build chạy tools/build.mjs dọn dist trước tsc; không sửa migration lịch sử.
Build lại source24/compiled24 khớp; DB test riêng applied24, pending=false,
rerun applied0. Build/lint/type-check pass. Chưa migrate development/production,
merge/commit/push/deploy; API/FE contract giữ nguyên.
[Flow/evidence](../api_flow/PHASE_3_3_FLOW.md#2026-10-16--kiểm-chứng-migration-sau-đồng-bộ-dev).

## 2026-10-16 — Hợp nhất stash API local sau cập nhật feat4

Bản sửa constraint đã cherry-pick thành85cb913. Conflict do stash apply lên
36db5a6/85cb913, không phải cherry-pick thất bại. Theo lựa chọn user: giữ lõi
Materials từ dev, ghép API catalogue/unit metadata/unit detail và GET preview/
assets từ local; tránh duplicate route/service và hai migration tạo lại schema.
Đã sao lưu working files/stash-untracked tại tmp/conflict-backup-20261016; stash
gốc giữ nguyên. Các nhật ký local cũ dưới đây là evidence trước tích hợp.
Focused Materials26/26 pass sau tích hợp; full pnpm check pass:587/587 tests,
56 suites,0 skip; lint/type-check/build pass. HTTP lượt đầu phát hiện8 compiled
artifacts của hai migration local cũ còn trong dist; đã chuyển vào backup và
đối chiếu catalog24 source/24 compiled khớp. HTTP rerun:7 suites khác32/32 pass;
Files/Materials còn2 local cases phụ thuộc Unit bị LOCKED từ test dev trước đó.
Đã thiết lập release OPEN qua API ngay trong từng journey; chạy lại trọn suite
Files/Materials40/40 pass,0 skip. Tổng72 HTTP cases đã pass qua các lượt kiểm.
25 conflict paths đã resolved, stash gốc vẫn giữ; phần API giữ ở working tree/
index để user tiếp tục. Không commit/push,
deploy hoặc migrate DB development/VPS trong lượt giải quyết conflict này.

## 2026-10-16 — Sửa CI constraint sau merge Phase4/Materials

Tái hiện log merge trên36db5a6: fixture release thiếu hai compatibility bridges
1791849599999/1791856799999 nên tạo trùng `uq_class_units_id_class`; rollback
Materials dùng `undoLastMigration()` lại nhắm migration Phase4 mới hơn.
Fixture dùng release nay tự thêm cả hai bridge như CLI catalog; test3.3.1,
3.3.4 và Student materials rehearse đúng migration theo tên, trong transaction.
Thêm regression xác nhận hai unique constraints và FK attendance/release cùng
tồn tại sau release down/up; không sửa migration lịch sử hoặc bỏ tính năng.
Kiểm chứng local: focused52/52 tests (4 suites),0 skip trên PostgreSQL/MinIO
riêng cho test; gồm clean install, upgrade từ Materials/Phase4 và named down/up.
Full `pnpm check` pass: lint/type-check/build,573/573 tests/54 suites,0 skip.
Compiled `pnpm test:http` pass:69/69 tests/8 suites,0 skip; compiled app chạy
toàn bộ catalog migration trên DB test. Node22.20.0/pnpm12.6.0, base36db5a6;
bản sửa ở branch `codex/fix-phase4-constraint` trong worktree riêng, giữ nguyên
các thay đổi đang dở ở checkout ban đầu. Chưa push/deploy, migrate
development/VPS hoặc thực hiện payment thật.

### Nhật ký local trước tích hợp (giữ từ stash)

## 2026-10-16 — Hoàn thiện upload → review → student và CKEditor ARTICLE

Đã implement Manager/Mentor material CRUD/submit/review/publication, ARTICLE HTML
sanitize + verified inline/attachment refs, audit/revision locks, staff preview,
Student ARTICLE detail/asset access, mentor unit/session context, Admin/Mentor
unit release, Manager catalogue và Admin/Manager PATCH metadata unit.
CKEditor lưu bài học vào ARTICLE.contentHtml; description unit giữ overview.
Hai migrations additive:1792108800000-material-authoring và1792108800001-unit-release;
chỉ up/down/up trên DB test riêng, chưa migrate development/production hoặc deploy.

Local: full backend468/468 (47 suites); thêm2 domain cases sau đó và targeted63/63;
full built-app HTTP51/51 (8 suites), trong đó Files/material19/19; lint/type-check/
build pass. Có binary upload thật vào MinIO, PDF/MP4 Range, staff preview, mentor
reject/edit/resubmit/approve, Student HTML/inline/attachment, decision race/retry,
assignment revoke, Origin/DTO/body limit, unit editing/release. Bổ sung Swagger/
Postman/flow/API breakdown. Chưa UI FE, VPS hoặc production acceptance.
[Flow](../api_flow/PHASE_3_3_FLOW.md) ·
[API FE](../api_flow/PHASE_3_3_flow-api-breakdown.md) ·
[Progress3.3](phase%203/PHASE_3_3_PROGRESS.md).

## 2026-10-16 — Seed hai roster demo 20/25 và 24/25

Thêm `seed:class-roster`, tích hợp cuối `seed:data`; 44 STUDENT demo riêng với
ACTIVE enrollment, CASH PAID order, SUCCEEDED transaction và progress từng unit.
Đã chạy PostgreSQL local `mindy_center`: HTML-CSS-101-ON1 =20/25,
JS-101-ON1 =24/25; chạy lại tạo0 enrollment. Giữ dữ liệu hiện có, khóa class,
kiểm sức chứa, rollback cả hai roster nếu lỗi. Mật khẩu tài khoản mới dùng
SEED_ACCOUNT_PASSWORD, không reset tài khoản cũ. Không đổi API/schema/runtime
checkout/payment, không gọi provider/email, không migrate DB hoặc deploy/VPS.
[Flow và evidence](../api_flow/PHASE_2_3_FLOW.md#dữ-liệu-mẫu-roster--2026-10-16).
Đối chiếu DB:44 PAID orders/44 SUCCEEDED cash transactions/244 unit progress
(HTML100,JS144), đủ44 ACTIVE enrollments. Lint/type-check/build pass;
full check chưa pass vì thiếu TEST_DATABASE_URL/MinIO riêng cho integration suites.

## 2026-10-16 — Kiểm tra PR15 Feat/Phase4 vào dev

Fetch xong: head6bd851e/base0b7aefc. Merge-tree xác nhận6 conflict Markdown,
đều cần giữ cả log Phase4.4 và log Materials/CI của dev. Source không có conflict
theo Git,không đồng nghĩa runtime đã verified sau tích hợp. Chỉ kiểm tra và ghi
nhật ký; chưa merge/commit/push/test tích hợp. Chi tiết tại Progress4.4.

## 2026-10-16 — Hoàn tất backend4.4c và full local gates

Readiness/handoff: có thể deploy4.4c để nghiệm thu server trước4.5; cần commit/
push đủ file mới và schema4.4b đã áp dụng.4.5 là server integration,FE/browser
và release/rollback acceptance; chưa deploy hoặc tạo evidence mới trong lượt hỏi đáp.

Schedule thêm effective mentor nullable/own attendance/guest union/dedup;
own history/summary, Staff per-enrollment summary và incomplete toàn backlog
đã có source. Shared SQL credit policy tính một lần mỗi student/root, giữ
physical history/terminal metadata và loại pending/no-data/canceled khỏi rate.
20/20 focused PG,3/3 compiled HTTP4.4c,13/13 regression lịch pass. **Full pnpm
check456/456 tests/45 suites,lint/type-check/build;HTTP48/48 tests/8 suites,
0 skip**. Chi tiết ở [Progress4.4](phase%204/PHASE_4_4_PROGRESS.md).
[Contract implemented](../api_flow/PHASE_4_4_flow-api-breakdown.md#13-44c--quy-ước-và-contract-chung)
và Swagger/Postman có5 GET reads cùng revision. Không migration/env/dependency/
FE/worker mới; chỉ dùng DB *_test/fake PayOS/local MinIO. Leave/approved
intervals vẫn gap riêng; release/VPS/browser4.5 chưa nghiệm thu.

## 2026-10-16 — 4.4b đã xong, lập kế hoạch 4.4c

User xác nhận4.4b hoàn tất. Đã rà progress/source, sửa bảng tổng còn ghi4.4b
chưa triển khai và mở rộng [plan4.4 mục4](../implement_phase/phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md#4-44c--lịch-student-tổng-hợp-và-hàng-chờ-vận-hành)
với22 AC/20 scenarios/5 bước: shared credit → lịch → own history/summary →
management summary/backlog → kiểm thử/bàn giao. [Progress4.4](phase%204/PHASE_4_4_PROGRESS.md)
và [API dự kiến4.4c](../api_flow/PHASE_4_4_flow-api-breakdown.md#13-44c--quy-ước-và-contract-chung)
đã đồng bộ. Giữ source/guest count một lần, physical-vs-credit và terminal
ownership rõ; workflow leave/approved intervals vẫn gap riêng. Chưa code4.4c.
Chỉ Markdown/source review và kiểm tra tài liệu; không BE runtime tests,
migration/FE/deploy/payment mới. Local gates4.4b436/45 là evidence15/10;
xác nhận4.4b không tự suy thành VPS/browser evidence. Server/Postman4.3 đã xong
theo user15/10, không liệt kê lại là việc chưa thực hiện.

## 2026-10-15 — Tiếp 4.4b: học bù lớp khác

Đã triển khai migration1792022400001, Staff queue/candidates/create/cancel placement,
Student own placements, capacity với checkout, guest roster/mark/finalize/audits,
Student context đúng target và requeue/completion guards. Late CASH/PayOS activation
không bị từ chối vì trùng replacement; ghi queue atomic. Flow/API/Postman cùng revision.
User xác nhận a xong; source hiện tại vẫn thiếu workflow leave/approved intervals,
không đánh dấu candidates đã kiểm approved leave. 4.4c/4.5 vẫn pending. Không sửa FE,
không migrate dev/VPS hoặc giao dịch thật. Gate cuối local: **pnpm check436/436 tests/44 suites, pnpm test:http45/45 tests/7 suites,0 skip; lint/type-check/build pass**. Chi tiết xem Progress4.4.


## 2026-10-15 — Bắt đầu code Phase4.4a

Đã triển khai Session management reschedule/cancel/makeups, migration ancestry/
schedule audit và Class cancellation batch atomic. [Progress4.4](phase%204/PHASE_4_4_PROGRESS.md)
ghi source/gates và backlog; [flow](../api_flow/PHASE_4_4_FLOW.md)/
[API breakdown](../api_flow/PHASE_4_4_flow-api-breakdown.md)/Postman đã đồng bộ.
Chưa hoàn tất workflow nghỉ có duyệt hoặc4.4b–c; không sửa FE/dev migrations/VPS.
Local test evidence không đại diện deployment4.4 hoặc thanh toán thật.

Gate cuối lượt: **pnpm check413/413 (41 suites), lint/type-check/build pass;
pnpm test:http42/42 (6 suites),0 skip**. Chi tiết migration/race/fault assertions
và phạm vi leave/guest/Student còn mở trong Progress4.4. Migrations chỉ chạy ở DB test.
- 2026-10-15: Review PR readiness tại feat/phase-3-3 `2e7e876` so với
  origin/dev `e0c9174`: ahead22/behind0, source checkout sạch trước review.
  Node22.20.0/pnpm12.6.0: frozen install, pnpm check **513/513 (48 suites)**,
  HTTP **60/60 (5 suites)**, actionlint và production image build pass.
  Compose production tách biệt: backup hợp lệ, compiled migrations22/22,
  postflight chặn pending/catalog rỗng, rerun không pending, API healthy/ready200.
  GitHub API: chưa có PR/check cho HEAD; dev chưa protected/required checks.
  Deploy dev e0c9174 đã success trên runner mindycode ở
  [run38570656351](https://github.com/nhathuyck1/Mindy-BE/actions/runs/38570656351),
  không phải evidence deploy branch này. Đủ điều kiện mở PR; chờ PR Check xanh,
  nên bật required checks trước merge. Không đổi runtime/YAML/API, không push,
  merge hoặc migrate VPS/development. [Chi tiết](phase%203/PHASE_3_3_PROGRESS.md).

- 2026-10-15: Bổ sung migration gate riêng trong Check YAML cho clean22,
  Materials16→22 và Phase417→22; thiếu TEST_DATABASE_URL thì fail trước khi test.
  Deploy tiếp tục backup trước migrate toàn bộ compiled catalog, thêm postflight
  chặn thay API nếu catalog rỗng hoặc còn pending. Local: actionlint/YAML parse
  pass, compatibility3/3 pass trên PostgreSQL17 Docker; chạy đúng postflight từ
  YAML trên DB test xác nhận22/22 và kiểm ca pending bị chặn (exit1).
  Không đổi migration/API; chưa chạy GitHub Actions hoặc deploy VPS trong lượt này.
  [Chi tiết](phase%203/PHASE_3_3_PROGRESS.md).

- 2026-10-15: Tích hợp dev e0c9174 vào feat/phase-3-3 a363012, xử lý14 conflict
  theo lịch sử planning13/10 → implementation13–14/10 → kế hoạch15/10; giữ
  Materials3.3/3.4 cùng teaching/attendance4.1–4.3. ClassesModule union providers,
  giữ actor locks và Class completion guard. Cập nhật fixture release theo Session
  terminal. Full check đầu510 cases phát hiện1 fixture không còn hợp lệ; sau sửa
  check510/510 pass, HTTP startup phát hiện unique constraint trùng giữa hai nhánh.
  Thêm hai migration bridge, giữ nguyên migration đã chạy; clean22/upgrade16→22/
  17→22/data/FK/down-up3/3 pass local. Full gates cuối: pnpm check513/513 (48 suites), HTTP60/60 (5 suites),
  lint/type-check/build pass; focused compatibility3/3 sau chỉnh tên DB fixture.
  Chi tiết ở progress3.3/3.4;
  không migrate development/VPS, không sửa FE hoặc nghiệm thu server/browser.
  [Quyết định tích hợp](phase%203/PHASE_3_3_PROGRESS.md).

- 2026-10-14: Triển khai phần còn lại Phase 3.4 local: Student list/detail ARTICLE
  (sanitized HTML, inline images, attachments), POST file access theo role
  PRIMARY/INLINE_IMAGE/ATTACHMENT và staff preview Manager/Mentor theo canPreview;
  ký version đã verify ngoài transaction, recheck sau ký, attachment disposition.
  Không migration/env mới. pnpm check 411/411 (35 suites), HTTP 48/48 (2 suites),
  lint/type-check/build pass trên `_test` DB + MinIO local. Chưa commit/deploy/VPS/
  browser FE. Chi tiết [progress3.4](phase%203/PHASE_3_4_PROGRESS.md).

- 2026-10-14: Triển khai3.3.5 local acceptance/handoff:4 HTTP cases mới gồm16
  source migrations/34 Postman routes đối chiếu Swagger và ARTICLE PNG/PDF,
  FILE PDF, VIDEO MP4 từ upload MinIO thật→submit/reject/edit/resubmit/approve
  →release/withdraw/publish/edit revoke. Node22.20.0/pnpm12.6.0: pnpm check406/406
  (34 suites), HTTP48/48 (2 suites), Files42/42 (1 suite),0 skip/unhandled errors;
  lint/type-check/build pass. Runbook/evidence PENDING/providers/fixtures3.4 và
  flow/API/plan/progress/FE gap audit đồng bộ; không API/schema/migration mới.
  Chưa commit/merge/push/deploy/VPS acceptance/user sign-off; toàn3.3 chưa complete.
  Chi tiết [progress3.3](phase%203/PHASE_3_3_PROGRESS.md).

- 2026-10-14: Theo yêu cầu user, chạy migration cho development local
  mindy_center tại localhost:5433 bằng Node22.20.0/pnpm12.6.0. Hai migration
  MaterialPublicationWithdrawal1791853200000 và ClassUnitReleaseAudit1791856800000
  đã execute thành công cùng transaction COMMIT. migration:show xác nhận16/16
  source migrations đã áp dụng, không pending; query schema xác nhận audit table,
  6 constraints/4 indexes và2 Material content triggers. Không deploy/VPS hoặc
  chạy server acceptance; không dùng thao tác migrate làm evidence API/full tests.
  Chi tiết [progress3.3](phase%203/PHASE_3_3_PROGRESS.md).

- 2026-10-13: Triển khai3.3.4 Class Unit release cho Admin/assigned Mentor:
  LOCKED/OPEN + omitted/null/timezone unlockAt; actor/Class/Unit locks, audit atomic,
  no-op giữ timestamps, completed/cancelled409 và assignment/role revoke403.
  Migration additive1791856800000 + composite ancestry FK/index/DBML, common Origin
  guard tái dùng. Node22.20.0/pnpm12.6.0: pnpm check406/406 (34 suites),
  HTTP44/44 (2 suites), 0 skip; lint/type-check/build pass. 16 release integration,
  24 DTO, 4 HTTP mới và Student read regression trên PostgreSQL *_test/MinIO riêng.
  Swagger/Postman34 requests, flow/API/plan/progress cập nhật. Chưa migrate dev/VPS,
  merge/push/deploy/nghiệm thu server;3.3.5 và binary preview/ARTICLE assets3.4 còn pending.
  Chi tiết [progress3.3](phase%203/PHASE_3_3_PROGRESS.md).

- 2026-10-13: Triển khai3.3.3 Manager review/publication (queue filters, approve/reject/
  publish/unpublish), strict revision/reason, no-op audit/timestamps, atomic locks và
  firstApprovedAt/canEdit. Migration additive1791853200000 cho withdrawal/soft-delete
  với refs unavailable, giữ content/identity/review và Student READY gates.
  Node22.20.0: pnpm check365/365 (32 suites), HTTP40/40 (2 suites), 0 skip;
  lint/type-check/build pass. Swagger/Postman27 requests, flow/API/plan/progress cập nhật.
  Chưa migrate dev/VPS, merge/push/deploy hoặc server acceptance; release3.3.4 còn planned.
  Chi tiết [progress3.3](phase%203/PHASE_3_3_PROGRESS.md).

- 2026-10-13: Triển khai3.3.2 Mentor Unit/session context + typed own draft
  create/list/detail/EDIT/delete/submit; current assignment/actor/ancestry dưới locks,
  visibility trước count/page, pending retry no-op/audit, Origin/no-store.
  Node22.20.0: `pnpm check`348/348 (31 suites), HTTP36/36 (2 suites), Files42/42
  (1 suite), 0 skip; lint/type-check/build pass, upload Mentor PDF/MP4 thật trên MinIO.
  Swagger/Postman22 requests/flow/API/plan/progress cập nhật; không migration mới3.3.2,
  chưa merge/push/deploy/nghiệm thu VPS. Chi tiết [progress3.3](phase%203/PHASE_3_3_PROGRESS.md).

- 2026-10-13: Triển khai3.3.1 Manager typed draft CRUD (ARTICLE/FILE/VIDEO),
  sanitizer/refs/audit/additive migration + batch locks/current actor/Origin;
  Swagger/Postman/DBML/flow/API cập nhật. `pnpm check`332/332 (30 suites),
  HTTP32/32 (2 suites), Files42/42 (1 suite), 0 skip; lint/type-check/build pass. Chi tiết xem
  [progress3.3](phase%203/PHASE_3_3_PROGRESS.md); chưa deploy/VPS acceptance.

- 2026-10-13 — Implement ADMIN class roster và student detail:
  GET `/api/v1/admin/classes/:classId/students` (page/pageSize) và
  GET `/api/v1/admin/classes/:classId/students/:studentId`. GET class list/detail
  đã có và giữ contract. Roster chỉ enrollment PENDING_PAYMENT/ACTIVE/COMPLETED;
  detail kiểm đúng cặp Class/Student, account SUSPENDED vẫn đọc được. DTO contact/
  enrollment rõ ràng, không password/token; cross-module reads qua exported services,
  không migration, không ghi payment/access. Đồng bộ Phase2.3 flow/breakdown và FE
  contract Phase2. Local: changed-file Biome, type-check/build pass; built-app HTTP
  Phase2.2 **13/13** pass (2 case mới). Full PostgreSQL suite **357/359** pass:
  2 case `requires reason and state but not a deadline for ADMIN/MANAGER` trong
  `phase42-attendance.spec.ts` fail vì mong reject SESSION_STATE_CONFLICT nhưng
  recovery resolve. `pnpm check` dừng ở format của file ngoài phạm vi
  `attendance-payment-evidence.service.ts`. Không sửa attendance trong increment này.
  DB riêng `mindy_admin_roster*_test`, không migrate development/VPS; chưa deploy.
  [Breakdown](../api_flow/PHASE_2_3_flow-api-breakdown.md#53-admin-danh-sách-và-chi-tiết-học-sinh-theo-lớp).

- 2026-10-13 — Tiếp planning4.3 theo4.1/4.2: correction sau chốt/Staff canceled,
  Staff audit reader và legacy/terminal recovery có evidence. Tạo22 AC,16 test
  scenarios/5 bước triển khai, ma trận AC→source→tests→gaps và detailed FE contract;
  giữ deadline hết ngày học kế tiếp, không actual start+24h. Ghi payment lineage/
  CASH late admission basis và parser limit riêng cho recover1000 rows là gates.
  Đồng bộ index/Phase4/combined flow. [Plan4.3](../implement_phase/phase%204/PHASE_4_3_ATTENDANCE_CORRECTIONS_HISTORY.md),
  [Progress4.3](phase%204/PHASE_4_3_PROGRESS.md),
  [Flow4.3](../api_flow/PHASE_4_3_FLOW.md),
  [API4.3](../api_flow/PHASE_4_3_flow-api-breakdown.md).
  Chỉ Markdown/source review;4.3 chưa implement, không BE runtime tests/DB
  migration execution/FE/deploy mới. Totals359/33 của4.2 là baseline lịch sử.

- 2026-10-13 — Sửa theo plan4.1/4.2 và steering thời gian: không overnight,
  deadline Mentor hết ngày kế tiếp của ngày học trên lịch (thứ Ba→00:00 thứ Năm)
  theo APP_TIME_ZONE, không actual start+24h. Context provider current role/status
  checks; start clock sau mentor lock; additive migration1791849600002 giữ history
  và bump version khi sửa stored deadline. Bổ sung mixed-writer/edge/Staff HTTP
  tests, đóng GAP41-04–06/GAP42-07–09 local. **pnpm check359/359/36 suites,
  lint/type-check/build pass; test:http33/33/4 suites**, không skip. PostgreSQL17
  riêng *_test + MinIO test local; fake PayOS. Không FE/dev/VPS migrate/deploy/
  commit/push. Student/material/leave/correction/legacy/cancel/guest/release vẫn
  theo4.3–4.5. Chi tiết [Progress4.1](phase%204/PHASE_4_1_PROGRESS.md) /
  [Progress4.2](phase%204/PHASE_4_2_PROGRESS.md), mục8.

- 2026-10-13 — Viết plan chi tiết riêng4.1/4.2 rồi review migration/controllers/
  services/DTO/test assertions với plan và progress. Core có implementation;
  Student schedule vẫn Class mentor, full recovery/correction/cancel/material/
  approved leave/guest/release còn mở. Ghi riêng coverage gaps về mixed-writer
  races/edge/Staff HTTP và owner/gate; đồng bộ flow/API/index/current state.
  [Plan4.1](../implement_phase/phase%204/PHASE_4_1_MENTOR_SUBSTITUTION.md),
  [Plan4.2](../implement_phase/phase%204/PHASE_4_2_SESSION_ATTENDANCE.md),
  [Progress4.1](phase%204/PHASE_4_1_PROGRESS.md),
  [Progress4.2](phase%204/PHASE_4_2_PROGRESS.md).
  Chỉ Markdown/diff/link/source review; không BE runtime tests/migrations/FE/deploy.
  Các tổng check310/328 và HTTP29/30 bên dưới là evidence lịch sử implementation.

- 2026-10-13: Triển khai4.2 AttendanceModule/migration, start/ACTIVE snapshot,
  CASH admission/sync, regular mark/unmark/finalize và staff start/end recovery.
  Composite cùng Class, clock24h/current assignment/version/audit/idempotency,
  Class completion guard. `pnpm check`328/328 (35 suites), `pnpm test:http`30/30
  (4 suites), PostgreSQL races/up-down-up/rollback refusal pass local.
  Không FE/migrate dev/deploy/VPS/live payment. Tiếp4.3 corrections/audit/legacy
  recovery, Student projections/leave/guest còn4.4.
  [Progress4](phase%204/PHASE_4_PROGRESS.md),
  [contract4.2](../api_flow/PHASE_4_flow-api-breakdown.md#15-implemented42--contract-thực-tế-và-handoff).

- 2026-10-13: Triển khai mốc4.1 mentor availability/substitution, management
  reads, effective schedule checker, mentor schedule/context, assignment/version/
  audit/idempotency migration. pnpm check310/310 (31 suites), test:http29/29
  (3 suites), PostgreSQL races và migration up/down/up/refusal pass local.
  Không sửa FE/migrate dev/deploy/VPS/live payment. Tiếp4.2 lifecycle/roster.
  [Progress4](phase%204/PHASE_4_PROGRESS.md), [contract4.1](../api_flow/PHASE_4_flow-api-breakdown.md#14-implemented41--contract-thực-tế-và-handoff).

- 2026-10-13: Lập plan backend3.4 phối hợp3.3 theo user: người khác triển khai
  3.3–3.6, user nhận deploy/server acceptance; FE do nhóm riêng, repo FE local
  chỉ đọc. Preview PDF/MP4 và staff assets3.4 cùng mốc review3.3.3; typed Student
  reader sau contract3.3.1, server journey sau publication/release. Một chủ schema/
  migration additive, tái dùng ba Student FILE/VIDEO GET hiện có; contract GET
  preview/assets + expectedRevision là dự kiến chưa implement. Đồng bộ plans,
  flow/API/index/progress và handoff SHA/migrations/config/checks/Postman/smoke/
  rollback. Chỉ tài liệu BE, không source/FE/migration/runtime tests/deploy.
  [Plan3.4](../implement_phase/phase%203/PHASE_3_4_MATERIAL_ACCESS_PREVIEW.md),
  [progress3.4](phase%203/PHASE_3_4_PROGRESS.md).

- 2026-10-12: Theo yêu cầu seed3 lớp/3 Course, current demo gồm HTML/CSS và JS
  ONLINE, Python OFFLINE, mỗi lớp10 buổi thứ3/thứ7. Seed tạo thêm2 lớp cạnh HTML
  đã có, query local xác minh15 Class Unit/30 Session/0 mentor conflict; rerun0
  lớp. Helper timetable/partition10/10 pass; pnpm check298/298 (27 suites),
  lint/type-check/build pass; không seed Material/enrollment hoặc deploy.
  Chi tiết tại [progress2.3](phase%202/PHASE_2_3_PROGRESS.md).

- 2026-10-12: Chạy lại seed lớp/lịch/course units local, giữ cohort hiện tại,
  xác minh 5 Unit/10 Session. Tư vấn bài học CKEditor/HTML → Material ARTICLE
  trong Unit, PDF → FILE hoặc attachment; không thêm bảng unit details trùng
  nội dung. ARTICLE/authoring vẫn planned, không migrate/implement/deploy hoặc
  chạy lại BE tests. Ghi ở [progress3.3](phase%203/PHASE_3_3_PROGRESS.md).

- 2026-10-12: Phase 2.3 thêm thứ/giờ địa phương trên lịch Student và hai PATCH
  ADMIN sửa giờ một/bulk Session, giữ ngày, atomic rollback và kiểm trùng mentor.
  Seed local đã tạo cohort HTML/CSS 10 buổi thứ 3/thứ 7 13/10–14/11, rerun không
  tạo trùng. `pnpm check` 291/291 pass (27 suites), suite tập trung 36/36,
  `pnpm test:http` 23/23 pass (2 suites);
  không migration/deploy/VPS hoặc thay payment/access. Evidence chi tiết:
  [progress 2.3](phase%202/PHASE_2_3_PROGRESS.md) và
  [flow/API](../api_flow/PHASE_2_3_flow-api-breakdown.md#51-admin-sửa-giờ-một-buổi-và-bulk).

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

- 2026-10-13 — review bổ sung Phase4: user chốt mở điểm danh trong ngày/overnight,
  recovery legacy có chứng cứ, không giữ slot quá endsAt, completion chặn buổi
  chưa xử lý; mentor nghỉ theo range/period trước hai ngày lịch có Manager duyệt.
  Nghỉ buổi hỗ trợ slot/manual tránh student conflicts; FULL_DAY đổi ngày giữ
  giờ và ghi học viên trùng. Bổ sung root replacement/auto endDate và học bù lớp
  khác cùng Course Unit với placement/guest attendance/credit một lần.
  Đồng bộ plan4/flow/API/progress và các dẫn chiếu; chỉ Markdown, chưa code/
  migration/test BE/FE/deploy. Notification/email tự động còn hoãn.

- 2026-10-13: User duyệt nghiệp vụ điểm danh và yêu cầu Manager tìm mentor trống
  lịch/dạy thay; lập [plan Phase4](../implement_phase/phase%204/PHASE_4_ATTENDANCE_OPERATIONS.md)
  gồm4.1–4.5, phân công buổi vs lớp/effective mentor, transaction conflict recheck,
  24h từ actual start, roster/CASH activation, audit/version/idempotency,
  Student history/summary, thiếu điểm danh và makeup. Phase4 chạy song song
  Phase3; giữ payment snapshot/materials policy. Đồng bộ
  [flow/API](../api_flow/PHASE_4_FLOW.md), index/course/core/combined flow và
  [progress4](phase%204/PHASE_4_PROGRESS.md). Chỉ tài liệu, kiểm diff/link;
  chưa migrate/implement/chạy BE tests/deploy/nghiệm thu VPS Phase4.

- 2026-10-12: User chốt mọi account tạo mới password6–128. Sửa CreateUserDto/
  Swagger từ12→6, FE schema/error/form hint6 và active runbooks. BE check298tests/
  27suites pass; HTTP27/27 gồm tạo/login6 và bounds5/128/129 cho cả4role. FE schema
  full unit138tests/type-check/build/boundaries/targeted Biome và identity E2E1test pass;
  full FE lint còn lỗi CRLF baseline. Chưa deploy. [Flow/API](../api_flow/PHASE_1_FLOW.md).

- 2026-10-12: Theo yêu cầu FE, implement trước ba Student Material GET list/detail/
  download cho FILE/VIDEO + migration read slice, current policy gates, signed GET
  pinned version TTL<=60s và contract/Postman. `pnpm check`291tests/27suites pass;
  focused Student15 integration tests, full HTTP23/23tests pass. Rà source
  FE ghi missing proxy/role MANAGER/My Classes/schedule/roster integration và backlog
  authoring/review/release/ARTICLE/progress/account. Chưa deploy/VPS/browser smoke;
  không coi CRUD/review/release3.3 hoặc toàn3.4 đã hoàn tất. Chi tiết
  [progress3.4](phase%203/PHASE_3_4_PROGRESS.md),
  [flow/API](../api_flow/PHASE_3_4_FLOW.md),
  [FE audit](../api_flow/PHASE_3_4_FE_API_GAPS.md).

- 2026-10-12: Hoàn thiện plan3.3 sau nghiệm thu3.2; hợp nhất ARTICLE HTML/FILE/
  VIDEO trong domain/schema/API/refs, Manager/Mentor review và Classes release.
  Chia3.3.1–3.3.5 với local gate + server cases từng slice, estimate BE7–10 ngày
  provisional và bàn giao Student/binary preview/video playback3.4.
  Đồng bộ plan/flow/API/progress/index; kiểm diff/link/JSON tài liệu.
  Chưa implement3.3, chạy BE tests/migration hoặc deploy.

- 2026-10-12: Chốt Phase 3.2 theo xác nhận user đã nghiệm thu xong trên VPS.
  Giữ ảnh PDF/MP4 READY và private final objects làm evidence trực tiếp;
  các ca còn lại ghi theo xác nhận user, không nhận là agent tự chạy.
  Đồng bộ plan/index/progress/flow/breakdown/runbook; bàn giao 3.3 CRUD/review
  nội dung. Chỉ cập nhật tài liệu và kiểm diff, không chạy BE tests/deploy mới.

- 2026-10-11: Ghi evidence user MP4 VPS READY, fileId
  `91f575a9-df4b-4b33-b8c8-7680619244e2`, declared/verified 1583534 bytes,
  video/mp4, VIDEO, errorCode null. MinIO Console qua SSH tunnel hiện object
  trong final/<fileId> và bucket PRIVATE. PDF/MP4 happy paths pass; còn invalid
  binary, complete retry/quyền/anonymous access và browser CORS. Không sửa
  source/deploy hoặc chạy BE tests; kiểm git diff --check cho tài liệu.

- 2026-10-11: Ghi evidence user Postman VPS PDF READY/HTTP200, fileId
  `5118b974-64fc-44b0-826f-58c1f9ba6c90`, declared/verified 75758 bytes,
  application/pdf, errorCode null. Metadata PENDING đúng phạm vi 3.2;
  nghiệm thu toàn slice còn MP4, invalid binary, retry/quyền/private access
  và browser CORS. Không sửa source/deploy hoặc chạy BE tests trong lượt này.

- 2026-10-11: Ảnh Postman user cho thấy upload VPS intent201/PUT200/PROCESSING
  rồi FAILED FILE_SIZE_MISMATCH; binary picker còn Select file. Hướng dẫn chọn
  file + retry intent mới, ghi evidence chưa READY và không lưu signed URLs.
  Không sửa source/deploy hoặc chạy BE tests trong lượt này.

- 2026-10-11: Hướng dẫn tạo MANAGER qua ADMIN POST admin/users để nghiệm thu3.2;
  đối chiếu DTO/status/registration source. Không tự tạo tài khoản/đổi quyền DB,
  không có upload acceptance hoặc BE tests mới trong lượt tài liệu này.

- 2026-10-11: User báo storage public health200. Hướng dẫn public URL + enable/
  recreate đúng image/Files override/test upload. Workflow thêm override khi VPS
  có .env.minio.production để giữ scratch ở deploy sau; chưa deploy patch và
  chưa có upload READY/browser CORS evidence.
  Lint/diff/Bash syntax/Compose scratch model pass; không chạy lại BE tests.

- 2026-10-11: User gửi output MinIO provisioning ready trên VPS; script kiểm
  private bucket/versioning/backend credentials pass. Tiếp tục network/tunnel
  storage route rồi bật/test upload; chưa có evidence public PUT/READY/CORS.

- 2026-10-11: User thông báo deploy đã xong. Ghi nhận reported deployment,
  tiếp tục provisioning MinIO với MINIO_ENABLED=false; không suy ra storage
  hoặc upload server acceptance đã pass. Không SSH/chạy BE tests trong lượt này.

- 2026-10-11: User xác nhận qua ảnh SSH API recovery: MINIO_ENABLED=false,
  recreate image `8aafd5a` Healthy; .git directory và env/base compose tồn tại.
  Chỉ API recovery đã có evidence; release mới/checkout failure và MinIO/upload
  server acceptance chưa xác minh. Lượt này ghi tài liệu, không chạy BE tests.

- 2026-10-11: Lượt deploy kế tiếp fail tại `Check VPS checkout and release`
  theo screenshot user, trước build/migrate/API switch; silent test chưa cho biết
  condition fail. Đổi workflow sang named errors cho path/files/branch/dirty/
  Docker/fetch/fast-forward/SHA, giữ clean-check và ff-only; container diagnostics
  chỉ khi rollout fail. Yêu cầu branch/status VPS để xác định nguyên nhân; không
  tự reset/clean/stash hoặc coi đây là lỗi MinIO. User gửi ảnh nhánh dev/status
  clean; log mới release `1258e24` chưa nêu condition, API cũ `8aafd5a` vẫn
  restarting vì keys rỗng. Lint/diff/Bash syntax + 6 mock preflight cases pass;
  chưa có runtime recovery evidence.

- 2026-10-11: Chẩn đoán deploy từ log user (`logs_103358883936`, release
  `8aafd5a`): CI pass 243 tests + 20 HTTP tests, image/backup check/migration pass,
  API unhealthy sau recreate. Runtime logs user xác nhận MinIO bật với access/
  secret key rỗng làm ConfigModule fail. Probe local schema pass khi omitted/false,
  fail khi true. Bổ sung env preflight trước backup/migrate/API switch, diagnostics
  khi failure và hướng dẫn tắt flag/recreate đúng release trong tài liệu3.2.
  Lint/diff/Bash syntax pass; chưa redeploy/khôi phục/xác minh upload VPS.

- 2026-10-11: User yêu cầu server acceptance sau mỗi slice và cho biết code3.2
  đã có trên server. Chuẩn bị compose.files-production.yaml, pinned mc image,
  private/versioned bucket + scoped backend user provisioning, root env template,
  writable scratch và VPS/tunnel runbook. Kiểm lint/shell/Compose model/doc links;
  Docker daemon local chưa chạy nên chưa build/run production artifacts mới,
  chưa SSH/deploy/migrate hoặc xác minh upload trên VPS. API3.2 không đổi.
- 2026-10-11: User mở rộng Material thành ARTICLE lưu sanitized HTML để FE render,
  FILE và VIDEO MP4 private MinIO/URL expiry; HLS sau. Cập nhật plan3.3/flow/API,
  progress và COURSE_FLOW: typed payload/schema/ref checks, article-only không
  bắt buộc file, image data-file-id/attachment refs, Student detail/assets và
  video Range/expiry ở3.4. Chưa sửa domain/source/migrations, chưa nghiệm thu3.3.

- 2026-10-11: Lập plan Phase 3.3 sau user xác nhận 3.1/3.2 đã xong:
  `docs/implement_phase/phase 3/PHASE_3_3_MATERIAL_MANAGEMENT.md`, progress riêng,
  `docs/api_flow/PHASE_3_3_FLOW.md` và `PHASE_3_3_flow-api-breakdown.md`.
  Kế hoạch Manager persistence/CRUD → Mentor context/draft/submit → Manager
  review/publication → Class Unit release → full gates/handoff3.4; giữ owner
  Course Unit, revision/firstApprovedAt, READY refs, locks/audit/assignment và payment
  baseline. Ghi API planned, gaps context/preview, path400/body422 và Origin check
  cho mutation mới. Đồng bộ index/plan/progress/flow tổng hợp; sửa link tương đối
  trong tài liệu tổng Phase3 đã đổi thư mục. Kiểm diff/link/JSON tài liệu;
  không chạy BE/HTTP/DB/MinIO tests, tạo migration/source/FE hoặc deploy.

- 2026-10-10: Review đồng bộ Phase 2.3 trong progress/API flow. Progress đã có
  implementation và evidence local; flow tổng hợp còn ghi collection/calendar
  chưa code. Sửa `docs/api_flow/PHASE_2_3_TO_3_2_FLOW.md` theo source và tạo
  `PHASE_2_3_FLOW.md`, `PHASE_2_3_flow-api-breakdown.md` cho 4 GET list/detail/
  preview/schedule: query/response, access/current/history, pagination/timezone,
  errors, FE refetch/polling, checkout/payment/expiry và liên hệ Phase 3.
  Liên kết hai chiều với FE contract/progress; kiểm link, ví dụ JSON và diff.
  Chỉ sửa tài liệu, không thay API, chạy lại runtime tests, migration hoặc deploy.

- 2026-10-10: Viết `docs/api_flow/PHASE_3_2_FLOW.md` và
  `PHASE_3_2_flow-api-breakdown.md` cho FE: create intent → raw PUT MinIO → complete
  → poll status, request/response trực tiếp, errors/state/retry/expiry/polling và
  prerequisite VPS. Đối chiếu public Course units/Mentor roster: Mentor chưa có
  read API đủ mapping Class Unit → Course Unit cho UI chọn unit đầy đủ. Ghi rõ
  Material CRUD/review/download còn thuộc 3.3/3.4; không đổi source/API/env hoặc
  deploy, không chạy lại runtime tests; kiểm link và diff tài liệu.

- 2026-10-10: Theo yêu cầu user, chốt `docs/api_flow/` là thư mục ghi flow/API
  của từng phase. Đồng bộ `Agent.md` và rules: mỗi lượt planning/code/fix/review/
  test/docs/deploy phải cập nhật tài liệu phase ở đây; flow và API breakdown dùng
  prefix phase, tái dùng file đã có. Giữ flow tổng hợp user đã chuyển vào thư mục,
  sửa các liên kết tương đối theo vị trí mới. Chỉ sửa tài liệu, không đổi API.

- 2026-10-10: Bổ sung rule tài liệu flow/API trong
  `docs/core/NESTJS_PROJECT_RULES.md` và dẫn chiếu từ `Agent.md`: mỗi flow Markdown
  phải có file `flow-api-breakdown.md` riêng theo phase/feature, mô tả từng API và
  cách FE gọi/xử lý request-response, lỗi, state, polling, retry và refetch.
  Phân biệt API đã code/kế hoạch cùng evidence local/deploy; cập nhật hai tài liệu
  khi flow/API thay đổi. Đây là thay đổi rule tài liệu, chưa tạo breakdown cho các
  phase hiện hữu; không thay source/API, chạy runtime tests, migration hoặc deploy.
- 2026-10-10: Đồng bộ `origin/dev` (Phase 3.1/3.2) vào `Feat/class-schedule` cho
  PR #9. Resolve 6 conflict, giữ StudentLearning + Materials trong AppModule,
  fixture mở rộng và migration MANAGER từ dev, nội dung progress của cả hai phase
  và cấu trúc thư mục docs mới. Giữ `hasActiveAccess` để Materials dùng cùng
  `findActive` của Phase 2.3; entitlement ACTIVE và transaction manager không đổi.
  Sửa liên kết plan/progress/FE contract liên quan sau rename. Local:
  frozen-lockfile install pass, `pnpm check` pass **243/243 tests (22 suites)**,
  `pnpm test:http` pass **20/20 (2 suites)**, không skip; PostgreSQL DB `_test`
  riêng và MinIO fixture local. Không migrate development/VPS hoặc thanh toán thật.

- 2026-10-10: Kiểm chứng Phase 2.3 trên PostgreSQL local với DB test riêng.
  Log user xác nhận migration Phase 2.2 `PayosPayments1791158400000` COMMIT thành công;
  HTTP test ban đầu skip vì thiếu `TEST_DATABASE_URL`. Tạo `mindy_center_test` tại
  `127.0.0.1:5433` và chạy các suite bằng biến môi trường process: `pnpm test` pass
  **127/127** (60 unit + 67 PostgreSQL, gồm 6 ca Phase 2.3), `pnpm test:http` build
  và **5/5 HTTP test pass**, không skip. Không reset DB development hoặc sửa code
  nghiệp vụ. Còn query-plan review, staging/VPS smoke và coverage luồng PayOS settlement
  → My Classes/calendar; không có deploy hoặc giao dịch thật trong lượt này.
  Chi tiết: `docs/progress/phase 2/PHASE_2_3_PROGRESS.md`.

- 2026-10-09: Triển khai Phase 2.3 My Classes + Personal Schedule ở local. Thêm
  `StudentLearningModule` với `GET /api/v1/me/classes` (enrollment-based, view
  current/history/all, filter, order summary, accessMode/reason, `asOf`) và
  `GET /api/v1/me/schedule` (range `[from, to)` ≤ 31 ngày có timezone, chỉ FULL/
  CASH_PREVIEW, không meeting URL). Detail/preview thêm field additive; response
  cá nhân `Cache-Control: private, no-store`. Không migration, không đổi settlement/
  expiry/entitlement. Contract FE `docs/PHASE_2_3_FE_CONTRACT.md`, Postman folder 05.
  **Local checks:** `pnpm check` pass (lint, type-check, 60 unit test, build).
  **Chưa chạy:** suite PostgreSQL mới (`phase23-my-classes-schedule`) và
  `pnpm test:http` — skip vì không có `TEST_DATABASE_URL`; không tính là pass.
  **VPS/live:** chưa deploy, không có giao dịch thật. Chi tiết:
  `docs/progress/phase 2/PHASE_2_3_PROGRESS.md`.

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
  `docs/progress/phase 2/PHASE_2_3_PROGRESS.md`, ưu tiên trước Phase 3. Plan tái dùng full
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

### 2026-10-13 — Phase4.3 implementation

Correction COMPLETED/Staff CANCELLED, Staff audit reader và insert-only historical
evidence recovery đã có. Migration1791849600003 giữ clocks/actors/history và exact
paid lineage;route-specific256KiB/1000 rows đã test built app. Focused31 PG/2 migration/
5 domain/4 HTTP pass; full regression gate và gap status theo [Progress4.3](phase%204/PHASE_4_3_PROGRESS.md).
GAP42-01–03 đã có implementation/evidence4.3,Student/guest/cancel/leave/release vẫn
4.4–4.5. Không FE/dev migration/VPS deploy/giao dịch thật mới trong lượt này.

Evidence4.3 cuối lượt:pnpm check397/397 tests/39 suites,HTTP39/39 tests/5 suites,
0 skip;GAP43-01–08/GAP42-01–03 đóng local,server/browser/release4.5 vẫn mở.

### 2026-10-14 — Phase4 API summary theo hai commit

Đối chiếu `8a1c7e8`/`246abf4`: commit đầu chỉ docs; commit sau thêm 15 endpoint
Phase4.1–4.3 và 2 Admin student endpoints. Tạo [bảng API và flow liên kết](../api_flow/PHASE_4_API_SUMMARY.md),
ghi ID/version handoff, CASH sync, correction/audits và historical evidence recovery;
đồng bộ flow/breakdown/progress Phase4, phân biệt API hiện có và kế hoạch4.4–4.5.
Verification chỉ route coverage/local links/JSON/code fences/diff checks; không chạy
lại BE tests/migration, không sửa FE, không deploy/VPS hoặc giao dịch thật mới.

### 2026-10-14 — Review Actions deploy failure sau Check pass

Logs user cung cấp cho release `e0c9174`: CI397/397 và HTTP39/39 pass, lint/
type-check/build pass. Deploy dừng ở preflight Git status do VPS có untracked
`..env.production.swp`, trước fetch/build/backup/migration/API replacement.
[VPS runbook](../VPS_DEPLOYMENT.md) bổ sung bảo toàn editor swap ngoài checkout
và retry failed jobs sau Git sạch. Chỉ log/source review và docs; không thay code/
workflow, chưa thao tác VPS hoặc xác nhận release thành công.

2026-10-14 — Deployment handoff clarification: Phase4.1–4.3 adds no required env
variable. Keep APP_TIME_ZONE consistent between migration and API; existing
Asia/Ho_Chi_Minh default applies if unset. DATABASE_URL remains the existing
production PostgreSQL URL. TypeORM migration:run executes all pending migrations
in timestamp order and skips recorded ones; do not invoke numeric filenames
individually. Existing dev deployment workflow already builds, backs up DB and
runs the compiled one-off migration before replacing the API. Manual Compose
commands must preserve compose.files-production.yaml when .env.minio.production
exists so Files scratch configuration is retained. This is read-only source
verification/documentation; no migration, server deploy or runtime test was run.

### 2026-10-15 — Phase 4.4a–c: lưu kế hoạch Markdown

Lưu [plan 4.4](../implement_phase/phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md)
cho nghỉ có duyệt/lịch bù → cross-class placement/guest attendance → Student
schedule/history/summary và operational queues. User chọn giữ đăng ký/thanh toán
khi phát sinh trùng lịch bù sau duyệt; conflict được chuyển Manager xử lý.
Đã liên kết plan/flow/API breakdown/progress Phase 4; chỉ documentation checks
(Markdown, relative links, diff), chưa triển khai hoặc chạy runtime gates 4.4.
Không sửa FE, chạy migrations, deploy hay giao dịch thật. Server/Postman 4.3
đã hoàn tất theo xác nhận user được ghi trong backlog ngày 15/10; không lặp lại
việc này là pending, không suy thành evidence 4.4/4.5.

### 2026-10-22 — Mentor API gap audit before implementation

Confirmed dev/origin/dev at `1e89579` contains FixUnhappyCase `20a2214` (mentor leave
and makeup flow). Created `codex/mentor-teaching-api-gaps` from that base.
Reviewed source controllers/services and documented proposed gaps in Phase 4.4
flow/API breakdown: mentor class detail, mentor attendance/progress reads, session
notes, assignments/submissions/grading, and scoped substitute content access.
Materials and leave workflows already exist and must not be reimplemented.
Planning/source verification only; implementation awaits the user's requested review.
No application code, schema, FE changes, runtime checks, migration, VPS or live payment evidence.

### 2026-10-22 — Kế hoạch mentor workspace và Assignment QUIZ/ZIP

Đã viết plan/flow/API proposal/progress riêng Phase4.6 và Phase5, liên kết từ
implementation index và core plan. Chỉ documentation, chưa source/migration/FE.
4.6: scoped access chính/thay, class detail/timetable, mentor attendance reports,
stored progress với policy unknown, teaching notes/version/audit.
Phase5: Assignment thuộc ClassSession theo DBML (chưa runtime), purpose TEST/HOMEWORK
khác type QUIZ/ZIP. User xác nhận quiz chọn toàn đề rồi nộp một lần, BE mới chấm và
trả đáp án. QUIZ bật/tắt timer theo phút; ZIP deadline ngày giờ, không duration timer.
Plan thêm private answer keys, start/resume/saved answers, atomic final submit/result,
timeout worker đề xuất, scoped ZIP pipeline và mentor grade/release. Single-choice,
one-attempt/default limits và timeout unanswered tính sai là design proposals.
Thứ tự: mentor M1–M5, assignment A0–A5; source/code-execution/compiler ngoài v1.
Verification: source/DBML/docs audit và static links/JSON/diff checks; không runtime
tests/migrations/MinIO/VPS/browser/deployment/giao dịch thật mới. Không suy plan là
API đã callable. Flow/API4.4 audit trước đó là lịch sử; kế hoạch chi tiết hiện ở
PHASE_4_6_FLOW.md/PHASE_5_FLOW.md và breakdown cùng prefix.

Planning verification 2026-10-22: Node static check8 new documents/23 local links/
5 JSON examples passed; code fences balanced and git diff --check passed. Source
runtime tests were not run because this change is documentation only.

### 2026-10-22 — Phase 4.6 implementation (BE)

Implemented mentor workspace M1–M4: typed primary/session scope + ANY discovery,
class shell/scoped timetable/material preparation, provisional session roster,
mentor attendance via shared credit projection, stored-progress reads with unknown
completion policy, internal teaching notes with optimistic versions, idempotency,
append-only audit and staff correction. Added notes migration1792627200000,
Swagger, Postman25 requests and full flow/API handoff. FE unchanged.

Local feature evidence: PostgreSQL/MinIO material regression;4.6 integration8 and
makeup20 tests passed, compiled HTTP4.6 2 tests passed. Full check passed649 tests
before parallel release removal; final acceptance re-runs on an isolated test DB
and is recorded in docs/progress/phase 4/PHASE_4_6_PROGRESS.md. Earlier runs with
Docker outage or old release expectations are not current pass evidence.
Other ongoing bulk/release changes are preserved and are not claimed as4.6 work.
No VPS/production migration/deploy/browser/live payment evidence added. Completion
policy/Phase5 assignments/certificate remain outside4.6. Flow/API breakdown at
docs/api_flow/PHASE_4_6_FLOW.md and PHASE_4_6_flow-api-breakdown.md are authoritative
for FE handoff; planning proposals are no longer treated as runtime contracts.

Phase4.6 final acceptance 2026-10-22 (current source, isolated PostgreSQL test DB):
`pnpm check` PASS — lint/type-check/build +64 files/613 tests; `pnpm test:http`
PASS — compiled app,10 files/79 tests, không skip. MinIO local included. Swagger,
notes migration rehearsal, Postman25 requests,4 docs/16 local links/4 JSON examples
và git diff checks passed. M1–M5 local complete; VPS/production migration/deploy
và real payment evidence unchanged. Các lỗi hạ tầng/stale release expectations
trong lượt trước đã được thay bằng evidence cuối này, không gộp pass historical.

### 2026-10-22 — Manager API screen-gap audit, BE-only

Reviewed manager/management controllers, query DTOs and current source permissions.
User explicitly asked not to inspect FE code; no FE code read or changes. Confirmed
existing class/HR/finance/material/teaching/leave/attendance/notes routes span several
prefixes. Recorded proposed dashboard counts, global calendar, settled-payment
summary, manager student learning history/progress, business audits and future
Phase5 oversight in existing Phase2.4 flow/API breakdown. Class/course/account
writes and reconcile remain ADMIN-only unless business permission is redesigned.
Documentation/source review only; no application/API/schema changes, no new runtime
tests/build/migration/VPS/browser/live-payment evidence. git diff --check used.


### 2026-10-22 — Phase5 QUIZ implementation on codex/phase5-assignments

Added additive migration1792713600000 and AssignmentsModule: session-owned drafts,
scoped mentor ABCD authoring/publish/archive, Student ACTIVE enrollment metadata,
start/resume, versioned full-answer autosave, complete-paper submit, atomic scoring
and durable result, PostgreSQL timeout jobs/worker. Default1 quiz attempt; optional
timer; timeout only saved choices, blanks wrong. Private keys hidden until result.
Current entitlement follows source without legacy unit-release gates. Audit failure
rolls back grading; terminal quiz submissions and audits immutable. Existing summary
stays NOT_IMPLEMENTED until real aggregate. No entity mirrors; typed SQL/JSONB
following teaching-notes; ZIP grade/file schema remains A3/A4. ZIP draft metadata
only, publish explicitly blocked. A3-A5 still TODO; no claim Phase5 complete.

Local feature: domain5/5, isolated PostgreSQL9/9, compiled HTTP2/2. Final pnpm check
PASS69 files/637 tests, including untimed-revocation coverage.
Lint/type-check/build29 migration artifacts passed. Final full HTTP PASS11 files/83
tests, no skips; compiled rollout clean29/repeat0 migrations passed. Static handoff
4 docs/13 links/1 JSON example/Postman16 requests passed. Postman16 manual requests,
flow/current API and plan updated together. No FE changes, no application/dev/VPS
migrations or deployment/live payment evidence. Worker flag defaults enabled.
