# Phase 4.4 — Progress

Ngày bắt đầu code: **2026-10-15**. **IN PROGRESS — Session operations đầu4.4a và core4.4b có source; leave/approved intervals và4.4c còn thiếu**.
[Plan](../../implement_phase/phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md) ·
[Flow](../../api_flow/PHASE_4_4_FLOW.md) · [API](../../api_flow/PHASE_4_4_flow-api-breakdown.md).

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
4. 4.4c own schedule/history/summary, management summary/backlog, common credit
   formula không đếm đôi replacement/guest. Các API tương ứng vẫn PLANNED.
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
