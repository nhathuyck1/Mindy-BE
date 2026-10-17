# Phase 4.4 — Progress

## 2026-10-17 — Hoàn thiện phần còn thiếu của 4.4a

Backend đã có Mentor preview/slots/create/list/detail/withdraw, staff list/detail/
approve/reject, request items/snapshots/intervals/audits và idempotency receipts.
Approval revalidates toàn source/version/current assignment/placements/targets;
cancel/create replacements/extend Class endDate/approved leave/student conflict
queue/audit cùng transaction. Có calendar notice2 ngày,93 ngày/500 sources,
FULL_DAY giữ clock/ack student conflicts; partial-day chặn overlap.

Availability độc lập tích hợp shared checker/candidates/add/bulk/reschedule/open/
class-session mentor assignment và guest makeup candidates/create. DRAFT không
giữ lịch. Batch khóa union mentor của mọi affected Class tăng dần trước students,
Classes sở hữu cancel/replace/finish participants; leave module dùng typed SQL
theo pattern placements, không thêm dependency/env/worker/FE/email.

GET không ghi expiry; command persist EXPIRED/audit trước409. Own detail giữ
student IDs riêng tư; staff conflict details/items phân trang tại SQL. List/slots
không N+1; test query count pageSize1/100 bằng nhau. Migration1792195200000
additive, down từ chối khi có leave history; giữ schema khi rollback app.

Focused PG15/15, calendar/DTO4/4 và named makeup migration2/2 pass; full compiled
HTTP80/80 tests/9 suites,0 skip pass trên PostgreSQL/MinIO local riêng. **Full
pnpm check cuối PASS634/634 tests/63 suites,0 skip; lint/type-check/build pass**.
Migration compatibility5/5 gồm clean25 và upgrade dev22→25 giữ Materials data.
Postman30 requests toàn collection, folder leave10 requests/14 scripts compile;
Markdown links/anchors mới và git diff --check pass. Một lượt broad ban đầu vướng module cache do
chỉnh source khi tests đang chạy và fixture4.4b rollback nhầm latest migration;
đã dùng named migration rehearsal cho4.4b như các phase cũ. Không sửa migrations
đã deploy. Test actor inactive đã đổi sang đúng enum SUSPENDED.

Flow/breakdown/Swagger/Postman folder21 đã bổ sung; contract nằm ở
[API4.4 mục19](../../api_flow/PHASE_4_4_flow-api-breakdown.md#19-mentor-leave-requests--implementation-2026-10-17).
Chưa migrate development/VPS, deploy, browser/FE hoặc đóng4.5. Thanh toán thật
VPS/dọn file3.5 đã xong theo user17/10, không chạy lại trong lượt này.

Ngày bắt đầu code: **2026-10-15**. Cập nhật **2026-10-16**:
**4.4b hoàn tất theo xác nhận user; 4.4c hoàn tất backend/local gates — check456/456,HTTP48/48,0 skip**.
[Plan](../../implement_phase/phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md) ·
[Flow](../../api_flow/PHASE_4_4_FLOW.md) · [API](../../api_flow/PHASE_4_4_flow-api-breakdown.md).

## 2026-10-16 — Kiểm tra conflict PR15 sau fetch

Đã fetch origin; Feat/Phase4 tại6bd851e,dev tại0b7aefc. Merge-tree tái hiện đúng
6 content conflicts Markdown trong ảnh user; mỗi file một block. Các block là
logs Phase4.4 và Materials3.3/3.4/CI từ dev, cần giữ cả hai theo mốc ngày;
không chọn toàn bộ ours/theirs. Không có conflict source theo Git; ClassesModule
tự union providers/controllers/entities của hai nhánh. Chưa merge vào checkout,
chưa commit/push hoặc test bản tích hợp; gates456/48 ở trên chỉ nhánh Phase4.

## 2026-10-16 — Implementation 4.4c theo yêu cầu user

Handoff triển khai16/10:4.4c có thể đưa lên server để nghiệm thu độc lập trước
khi đóng4.5. Không migration/env mới; server cần schema đến1792022400001 của4.4b.
Working tree hiện chưa commit/push đầy đủ, gồm các file mới; chưa có deployment
evidence4.4c.4.5 kiểm integration server/Postman,FE/browser theo role và release/
backup/rollback. Leave/approved intervals còn thiếu không tự được đóng bởi4.5.
Lượt giải thích readiness chỉ đọc source/docs và kiểm diff, không chạy lại tests.

- Đã code shared SQL credit policy + typed projection provider; own physical
  history/summary, Staff Class summary và incomplete toàn backlog; schedule
  effective mentor nullable/guest union/dedup/page/current access/CASH masking.
  Physical attendance, source credit và Class/material entitlement tách rõ.
- Root leaf resolve trước range; guest finalized count một lần về source;
  OPEN conflict/ASSIGNED/reassignment/no eligible snapshot giữ pending, hủy
  placement thu hồi credit, correction vật lý không phục hồi credit hủy.
  Source/receiving Class summaries không dùng physical roster totals để tính rate.
- C1 chốt owner student/root qua fixture canceled→re-enroll; evidence finalized
  ưu tiên, tie enrollment.createdAt DESC/id DESC, non-owner không cộng count.
  CTE là quyết định set-based thay pure JS per-row reducer để aggregate trong PG;
  shared pure denominator/rate function, chi tiết Plan4.4 mục4.7.
- Current role/status kiểm trong snapshot; history cho own terminal enrollment,
  không nhận studentId, không URL/materials/contact/payment/evidenceNote.
  GET private,no-store + READ ONLY REPEATABLE READ; query helper chuyển common.
  Không migration/env/dependency/worker, không sửa FE hoặc leave workflow còn thiếu.
- Postman Phase44 thêm5 GET reads (16–20), variables range và20 scripts. Cookie
  actor/versions vẫn phải chọn theo flow; GET không có side effect. Swagger DTO
  enum/nullability cho mentor/rate/deadline và SESSION_MAKEUP đã có compiled tests.

| Gate 4.4c | Evidence local hiện hành |
|---|---|
| Focused PG projection/report | **20/20 pass,0 skip**; root/credit/own/guest/terminal/re-enroll/no-data/late CASH/backlog/snapshot |
| Focused compiled HTTP4.4c | **3/3 pass,0 skip**; real login/cookies/roles/DTO/Swagger/own history/summary/CASH/terminal |
| Regression timetable2.3 + session time updates | **13/13 pass** |
| Query evidence |3 Classes/24 enrollments/120 Sessions/960 obligations;8 queries per Class summary, pageSize1/100 bằng nhau; EXPLAIN10.371ms ở full gate cuối,không là production SLO |
| Full pnpm check | **PASS456/456 tests/45 suites,0 skip; lint/type-check + production build**; lượt cuối gồm assertions hai physical results/re-enroll,PayOS range và exact deadline |
| Full pnpm test:http | **PASS48/48 tests/8 suites,0 skip**; compiled Nest/cookies/PG/private MinIO/fake PayOS, gồm guest source/receiving/revoke assertions |
| Docs/Postman/diff | **PASS17 Markdown/52 links+anchors mới/14 JSON examples; Postman20 requests/20 parsed scripts/8 JSON bodies; diff check** |

| AC coverage4.4c | Source / evidence thực tế |
|---|---|
| AC01–04 | AttendanceProjection timetable + MySchedule DTO; PG scheduled/unmarked/physical/finalized,override/legacy,CASH/PayOS masking; regression2.3/time và HTTP4.4c journey |
| AC05–09 | SQL regular/guest union+dedup,Class access provider,history ownership/mapping; PG guest-only/filter/page/revoke/terminal,HTTP44b guest history404/source-safe metadata |
| AC10–12 | Shared credit CTE/attendanceSummary; PG rate33.33/zero,null,chain resolve-before-range,history page independent; Student/management HTTP parity |
| AC13–16 | CTE placement/conflict/guest/physical precedence; PG pending/cancel/reassign/no-snapshot,correction,revoke,partial legacy,actual late CASH admission; HTTP44b guest finalize/revoke |
| AC17–18 | student/root rank and SQL aggregate/page; PG re-enroll including two contradictory physical results,one credit owner; Class fixture960 obligations/8 queries/pageSize invariant |
| AC19–21 | TeachingRead incomplete + Reports auth/read snapshot; PG whole backlog/end/deadline/null/filter/terminal,actual finalize-vs-GET snapshot,no GET audits; HTTP roles/DTO/private headers/Swagger |
| AC22 | Focused PG20/HTTP3,full check/HTTP gates và Docs/Postman ở trên; không có VPS/browser acceptance claim |

PostgreSQL localhost5433 dùng dedicated mindy_center*_test; local private/versioned
MinIO19000 cho regression Phase3. Fake PayOS; không merchant/SMTP/payment thật,
không migrate dev/VPS. Các lượt đầu focused fail do fixture clock start=end,
expiry/cash-mentor constraints và constructor/payment DTO assertions đã sửa;
không sửa lifecycle guards/SQL migrations cũ để ép pass. Các kết quả pass bên trên
là lượt sau sửa. Leave/approved intervals và release/browser4.5 còn riêng;
baseline metrics/rate-limit/i18n chưa xây dựng vẫn backlog chung.

**C1–C5 CLOSED LOCAL.** Backend4.4c đủ scope bàn giao, chưa deploy/FE acceptance.
Runtime rollback app-only vì4.4c không thêm schema. App vẫn cần migrations đến
1792022400001 của4.4b; không undo schema có guest/attendance history để rollback
reader. FE cần handle mentor/rate/deadline nullable và SESSION_MAKEUP trước tích hợp.

## 2026-10-16 — Đóng trạng thái 4.4b và planning 4.4c

- User xác nhận trực tiếp **4.4b đã xong**. Source có placements/guest/context/
  capacity; giữ local evidence15/10 bên dưới (check436/436, HTTP45/45,0 skip)
  là kết quả lịch sử, không phải chạy lại trong lượt planning này. User không
  nêu môi trường deploy nên không tự gán xác nhận này thành VPS/browser evidence.
- Đã đọc progress tổng/Phase4/4.1–4.4, backlog15/10 và đối chiếu source
  StudentLearning, Classes effective mentor, Attendance/guest/recovery,
  Enrollment/payment evidence và tests hiện có. Các bảng cũ ghi4.4b chưa
  implementation đã được cập nhật; log ngày cũ giữ làm lịch sử.
- Mở rộng [plan mục4](../../implement_phase/phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md#4-44c--lịch-student-tổng-hợp-và-hàng-chờ-vận-hành)
  thành baseline/gaps, physical-vs-credit/range/root policy, boundary/query,
  **22 AC,20 test scenarios,5 bước C1–C5**. Lựa chọn normalization chi tiết là
  thiết kế đề xuất; C1 phải khóa re-enroll credit owner/partial recovery bằng
  fixtures trước khi code các API phụ thuộc.
- [API mục13–18](../../api_flow/PHASE_4_4_flow-api-breakdown.md#13-44c--quy-ước-và-contract-chung)
  mô tả schedule extension và4 GET mới: own history/summary, management summary,
  incomplete toàn backlog. Toàn bộ extension/route mới vẫn **PLANNED**.
- Thứ tự: C1 shared credit reader/reducer → C2 schedule → C3 own history/summary
  → C4 management/backlog → C5 PG/HTTP/full gates/Swagger/Postman/handoff.
  GAP41-01/GAP42-05 được gắn vào plan, chưa đóng vì chưa code/test4.4c.
- Workflow leave/approved intervals chưa thấy trong source vẫn ghi riêng;
  4.4c đọc dữ liệu đã persist nên có thể tiếp tục theo yêu cầu user. Không
  tự đổi candidates thành leave-aware hoặc tuyên bố toàn4.4 hoàn tất.
- Lượt này chỉ source/doc review và kiểm tra tĩnh tài liệu; không sửa source,
  FE, Postman executable requests, migrations/config/dependencies, không chạy
  BE runtime tests/DB migrations, không deploy hoặc giao dịch thật.
- Kiểm chứng tĩnh16/10: **PASS17 Markdown files trong docs,32 liên kết local/
  anchors mới,14 JSON blocks,đủ22 AC/20 scenarios/C1–C5 và git diff --check**.
  Không thay source/config/Postman; không có runtime evidence mới cho4.4c.

| Work item4.4c | Trạng thái khi planning (trước implementation) | Evidence cần để đóng |
|---|---|---|
| C1 Credit foundation | PLANNED | T44C-07–14, shared reader/reducer, credit-owner/range truth table |
| C2 Schedule | PLANNED | T44C-01–05, regression2.3, nullable mentor/guest/filter/dedup |
| C3 Own history/summary | PLANNED | T44C-06–15, ownership terminal/no-data/source credit |
| C4 Management/backlog | PLANNED | T44C-15–19, all-backlog/queries/snapshot/role |
| C5 Handoff | PLANNED | T44C-20, full local gates/Swagger/Postman; release4.5 riêng |

## Tiếp4.4b theo yêu cầu user ngày15/10

- Migration1792022400001: conflicts/placements/receipts/audits, guest attendance/audits
  tách regular; FK/trigger/unique bảo vệ Unit/root/source/student/target/identity,
  RESTRICT và history rollback refusal; không attendance backfill.
- Staff queue/candidates/create/cancel và Student own list; strict DTO/Swagger,
  content confirmation/reason/versions/UUIDv4 key. Current Staff trước replay;
  reservation/version/audit/receipt atomic. Queue trả thêm makeupPlacementVersion
  để Staff hủy/reassign sau target cancellation.
- Capacity gồm ACTIVE, mọi live CASH/PayOS hold và guest ASSIGNED. Checkout tính
  peak guest ở từng Session; source ACTIVE, target khác Class/cùng Unit/future,
  không target enrollment hiệu lực hoặc student conflict. GET không giữ suất.
- ScheduleReservationsModule chỉ đọc projection/khóa student, không import Classes/
  Attendance/Payments. Attendance sở hữu typed SQL schema/queries, không wrapper
  entity/repository dư thừa; regular FK không đổi. Target cancel projection atomic
  bằng trigger, actor transaction-local; NO KEY UPDATE Session tránh FK KEY SHARE
  với late-checkout/student-lock deadlock. Class→Session→mentor→student như plan.
- CASH checkout/activation và fake PayOS settlement tiếp tục khi trùng replacement,
  ghi queue atomic theo quyết định user. PayOS pending không có timetable.
- Target start snapshot guest đủ điều kiện; roster/totals/page union regular+guest;
  PUT records + guestRecords chung Session version/transaction/audit. Finalize
  chuyển placement COMPLETED/conflict RESOLVED; thiếu snapshot hợp lệ thì
  NEEDS_REASSIGNMENT, không ABSENT giả. Correction/deadline/current target mentor
  giữ baseline; physical correction không khôi phục credit hủy.
- Student context chỉ own target với current entitlement; không mở cả lớp nhận,
  classmates/materials/CASH. Own metadata/history vẫn giữ sau enrollment terminal.
- Target/receiving Class cancel requeue giữ guest history; Staff cancel trước reassign.
  Source cancel/reschedule/bulk-time và completion chặn unresolved placements.
  Không reset clocks/deadline. Postman/flow/API/plan/progress đồng bộ.
- User xác nhận a xong; source hiện tại chưa có leave/approved intervals, không tự
  ghi đã implement hoặc candidates đã kiểm approved leave. Không dependency/env/
  worker/mail mới, không sửa FE/migrations cũ/dev/VPS hoặc payment thật.
  Metrics/rate-limit/i18n baseline tiếp tục backlog chung.

## Đã triển khai — baseline Session operations4.4a

- Migration1792022400000: ancestry pair/composite same-unit FKs/immutable chain,
  unique successor/effective root, schedule audit và rollback refusal sau khi có history.
- ADMIN/MANAGER PATCH schedule, POST cancel, POST makeups: strict DTO/Swagger,
  current authorization trước replay, expectedVersion/UUIDv4 idempotency receipt,
  Class→Session locks, shared Class/effective-mentor checker, audit/version atomic.
- Replacement cùng Unit/duration/room/meeting, mentor explicit hoặc primary,
  chưa attendance/clocks/deadline; tự extend Class.endDate cùng transaction.
- Hủy Class batch SCHEDULED/IN_PROGRESS, giữ COMPLETED/history/attendance/clocks;
  Admin route ghi actor hiện hành. Không mở rộng quyền Manager sang Admin routes.
- Rehearsal migration4.1–4.3 chọn đúng migration thay vì giả định latest;4.1 tháo/
  reapply migration4.4 phụ thuộc enum. Không sửa SQL các migrations cũ.
- FE repo chỉ đọc, không sửa. Không env/dependency mới, không mail/notification.

## Local verification4.4b — 2026-10-15

| Gate | Kết quả local |
|---|---|
| Focused PG cross-class makeup |19/19 pass: queue/late CASH và fake PayOS activation, same Unit/content/ACTIVE, context, capacity/checkout/different-student/start/cancel races, roster union, correction/deadline/current mentor, reassign, no-snapshot và rollback|
| Migration4.4b |2/2 pass: clean/up-down-up/no backfill, ancestry/Unit/immutability/unique/guest FK/RESTRICT/history refusal|
| DTO4.4b |2/2 pass: required content/reason/versions/UUID, guest-only/duplicate/null/empty/invalid batch|
| Compiled focused HTTP4.4b |3/3 pass: real login/cookies/roles/DTO/Swagger/key/replay, real checkout→conflict→placement→context→guest finalize→cancel credit|
| Full pnpm check |PASS lint/type-check +436/436 tests/44 suites,0 skip + production build|
| Full pnpm test:http |PASS45/45 tests/7 suites,0 skip; real PG/cookies/local private MinIO và fake PayOS|
| Docs/Postman |4 phase4.4 docs/20 local links/6 JSON examples; collection15 requests/15 parsed scripts; diff check|

Các lượt regression phát hiện test cũ dùng latest migration thay vì named policy,
FK recovery phụ thuộc payment và một tên alias trùng biến PL/pgSQL trong trigger mới.
Đã sửa fixture/rehearsal và alias, không sửa SQL migrations cũ hoặc guards để ép pass;
focused35/35 ca liên quan pass sau sửa. Regression đầu chưa bật MinIO gặp lỗi setup;
đã khởi động local fixture để chạy lại đầy đủ. Gate cuối là bằng chứng hiện hành,
không dùng các lượt fail hoặc skip làm pass.

PG localhost5433 dùng DB suffix _test riêng, MinIO fixture19000/private/versioned;
không migrate dev/VPS, không merchant/SMTP/payment thật, không sửa FE. Metrics/
rate-limit/i18n chưa xây dựng vẫn backlog chung. User có thể tiếp tục4.4c riêng;
leave/approved intervals là phần source thiếu cần đối chiếu4.4a trước nghiệm thu toànphase.

## Local verification — baseline lượt4.4a

| Gate | Kết quả local ngày2026-10-15 |
|---|---|
| Focused PG Session operations |14/14 pass: permissions/replay, schedule/conflicts, ancestry, cancel/history, faults và races|
| Focused migration4.4a |2/2 pass: clean/up-down-up, no legacy backfill, composite FKs/immutability/unique/RESTRICT/refusal|
| Built-app HTTP4.4a |3/3 pass: cookies/roles/DTO/Swagger/key/replay, replacement journey, Admin cancellation batch|
| `pnpm check` |PASS: lint/type-check +413/413 tests/41 suites,0 skip + production build|
| `pnpm test:http` |PASS:42/42 tests/6 suites,0 skip; compiled Nest app, real PostgreSQL/cookies/local MinIO|
| Docs/Postman/diff |PASS:4 phase4.4 Markdown files/19 local links/4 JSON examples,4 Postman request bodies/scripts,final lint và git diff --check|

PG dùng localhost:5433, `mindy_center_test` và các database suffix `_test` riêng;
MinIO private/versioned fixture local chỉ cho regression Phase3. Fake PayOS;
không merchant/SMTP, không migrate development/VPS hoặc giao dịch thật.

Lần regression đầu phát hiện test hard-code số lượng/thứ tự migration và
`undoLastMigration()` trỏ nhầm migration4.4. Đã chuyển rehearsal4.1–4.3/PayOS/
Manager enum sang named migration, full Phase2 rollback đếm migrations đã apply
từ catalog boundary. Ca race4.2 cập nhật đúng ownership sau cancellation: buổi
chưa start không có historical teacher nên Mentor403 trước state guard; buổi
đã start giữ teacher và409. HTTP suspended account401 ở auth guard. Không đổi
business guards để ép test; các gate cuối ở trên đã chạy lại và pass đầy đủ.

## Còn phải làm — chưa đánh dấu hoàn tất 4.4a

1. Leave preview/15-minute slots/create/list/detail/withdraw và staff approve/
   reject/expiry; notice/range/period validators, source-set snapshots, stale,
   atomic multi-Class cancellation/replacement/leave/conflict/receipt.
2. Approved leave provider vào candidates/add/bulk/open/assignment/reschedule;
   student conflict validators/locks và late checkout/activation conflict queue
   theo quyết định user: checkout/activation conflict projection và source placement guards
   đã có trong4.4b; producer từ leave approval và approved interval checks chưa có.
3. Core4.4b đã triển khai như trên; approved-leave availability còn phụ thuộc
   provider/workflow4.4a chưa thấy trong source. Không suy ra toàn4.4 đã hoàn tất.
4. 4.4c own schedule/history/summary, management summary/backlog và shared credit
   đã implement16/10; current gates và source mapping ở revision đầu file.
5. Server/FE/browser acceptance ở4.5; xác nhận server4.3 theo user không phải evidence4.4.

## Rollout/rollback

Khi release4.4b: backup, compiled migration1792022400001 sau đầy đủ migrations
4.2/4.3/4.4a, chạy một lần trước API mới. Không trộn app chưa biết placements
với writers mới khi đã có guest data. Source/guest history thì down từ chối, giữ
schema và rollback application tương thích. Khi release slice4.4a: compiled
migration1792022400000 trước API; chưa chạy
trên dev/VPS. Chỉ app đã biết schema mới đọc ancestry được. Nếu audit/makeup đã
tồn tại thì down từ chối, giữ schema và rollback application tương thích.
Không xóa audit/attendance hoặc backfill ABSENT/mentor giả để hoàn tất migration.
Baseline metrics/rate-limit/i18n của repo vẫn là backlog chung, không được ghi pass.
