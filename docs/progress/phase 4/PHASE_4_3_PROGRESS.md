# Phase 4.3 — Progress và đối chiếu plan với code

2026-10-16 implementation4.4c: Student history/summary consume persisted regular/
recovery/guest evidence; partial legacy no-data không thành ABSENT. Source credit
reader giữ terminal metadata/correction và count-once root/owner; source/tests/
gates tại [Progress4.4](PHASE_4_4_PROGRESS.md). Đây là local evidence4.4c mới,
không thay xác nhận server/Postman4.3 ngày15/10 hoặc nghiệm thu browser4.5.

2026-10-16 — Đồng bộ dependencies: server và thử Postman4.3 đã xong theo xác
nhận trực tiếp user15/10 (ghi tại backlog tổng15/10); các dòng deployment
pending bên dưới là trạng thái lịch sử. User nay xác nhận4.4b đã xong;
cancel/replacement/guest có source. Own Student projections/summary/backlog
đang [planning4.4c](../../implement_phase/phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md#4-44c--lịch-student-tổng-hợp-và-hàng-chờ-vận-hành).
Recovery partial4.3 phải được reader4.4c giữ no-data cho rows không có evidence.
Không chạy lại test/deploy4.3 trong lượt cập nhật tài liệu này.

Cập nhật **2026-10-13**. **Implementation4.3.1–4.3.5 đã có; local gates
pass. Full check397/397 và HTTP39/39,0 skip. Chưa deploy/VPS/browser hoặc giao dịch thật.**
[Plan](../../implement_phase/phase%204/PHASE_4_3_ATTENDANCE_CORRECTIONS_HISTORY.md) ·
[Flow](../../api_flow/PHASE_4_3_FLOW.md) ·
[API](../../api_flow/PHASE_4_3_flow-api-breakdown.md) ·
[Progress Phase4](PHASE_4_PROGRESS.md).

## 1. Source và business scope

- AttendanceService mở rộng PUT COMPLETED/Staff CANCELLED đã start; chỉ row trong
  snapshot, closed states chỉ PRESENT/ABSENT. CORRECT audit, no-op giữ version/
  checkedInAt; actor/current role/assignment trước replay, now sau Class→Session locks.
- AttendanceAuditService + AttendanceManagementController: Staff paginated GET,
  optional same-Class enrollment filter, REPEATABLE READ total/items và sort
  occurredAt DESC,id DESC. Safe DTO/private,no-store, recovery summary nullable.
- Recovery riêng: Staff POST insert-only1–1000 rows, explicit admissionBasis/note,
  ISO clocks có timezone và single teaching day. Known clocks/mentor/actors giữ
  nguyên; unknown legacy null, SCHEDULED→COMPLETED, không reopen hoặc đổi Class.
- Enrollments.attendanceHistory trả metadata lịch sử; Payments public evidence
  reader gọi Commerce public line reader, yêu cầu matching ancestry/SUCCEEDED/
  paid_at/amount/verified reference. PayOS còn matching SETTLED event. Không network,
  settlement hoặc entitlement write; Class lock giữ committed evidence nhất quán.
- Migration1791849600003 + recovery entities lưu clocks/status/deadline/basis/
  payment references. Composite FKs giữ Session/record/enrollment/detail/order/
  payment lineage; RESTRICT; down từ chối CORRECT/RECOVER hoặc recovery evidence.
- Parser256KiB chỉ POST recovery, trước global64KiB. Nested UUID lowercase,
  duplicate/null/unknown fields422. Swagger và Postman4.3 đã có.

## 2. AC → source → assertions

| AC | Source | Evidence mới |
|---|---|---|
| AC43-01–02 | assertWritable/markRows, shared PUT | PG closed/CANCELLED/never-started/UNMARKED/batch; built HTTP correction matrix |
| AC43-03–04 | authorize, calendar window, permissions | PG Class COMPLETED/deadline-1ms/exact midnight/real Class lock wait; missing deadline/unknown teaching/current role/status/replay; HTTP Mentor terminal Class |
| AC43-05–06 | markRows/audit/version transaction | PG checkedInAt present/absent/no-op/foreign rollback/totals; existing terminal enrollment |
| AC43-07–09 | recoverRows + SessionLifecycle.recover | PG SCHEDULED terminal Classes, COMPLETED missing clocks/partial roster; known clocks/actors preserve/mismatch/invalid state; HTTP future/overnight/offset validation |
| AC43-10–12 | recovery-evidence domain, enrollment/payment/line readers | Domain status/cutoff/basis; real CASH/PayOS settlements, canceled/completed enrollment, pending/unpaid/new hold/late PayOS/student mismatch, exact line SQL FKs |
| AC43-13–14 | recoverRows/entities/lifecycle/audits | Existing-row batch409 rollback; only missing row inserted; omitted row remains no-data in1000-row HTTP fixture; six persistence fault points rollback all writes |
| AC43-15–16 | audit reader/safe DTO/recovery metadata | PG scoped filter/empty/Staff current status/multipage/tie sort; HTTP auth/private,no-store/recovery summary/CORRECT history |
| AC43-17–18 | shared locks/version/hash/receipts | PG corrections/class completion/sync/finalize, recovery/recovery/correction/sync/assignment/CASH settlement; cancellation/withdrawal via Class-lock fixture; replay/hash/revocation/fault receipts |
| AC43-19–20 | response permissions, DTO/Swagger/configureApp | Built HTTP cookies/whitelist/nested/null/case duplicate/Staff reason;1000 rows successful >64KiB,1001 rejected, exactly256KiB parses,256KiB+1=413, other route64KiB |
| AC43-21 | additive migration1791849600003 | Clean/up-down-up/legacy no-backfill, composite lineage/RESTRICT/refusal, EXPLAIN ANALYZE20k audit rows and ordered record-history index |
| AC43-22 | flow/API/plan/progress/Postman | Full gates recorded below; pending4.4/4.5 and deployment are explicit |

Tests có state/rows/version/audit/receipt assertions, không chỉ status200. Races
chạy Promise.all trên PostgreSQL thật; post-lock test thấy pg_stat_activity lock
wait rồi mới đổi fake server clock đến midnight. CANCELLED/withdrawal fixtures
không thay thế orchestration4.4a chưa triển khai.

## 3. Local verification

Dedicated PostgreSQL URL dùng database mindy_center_test và các *_test riêng;
không migrate dev/VPS. Local private versioned MinIO chạy cho regression Files.

| Gate | Evidence |
|---|---|
| Focused4.3 PostgreSQL command matrix |31/31 cases,0 skip |
| Focused4.3 migration rehearsal |2/2 cases,0 skip |
| Recovery evidence domain |5/5 cases |
| Focused built-app HTTP4.3 |4/4 journeys,0 skip;1000 evidence rows và exact byte boundaries |
| pnpm check | PASS:lint + type-check +397/397 tests/39 suites,0 skip +build |
| pnpm test:http | PASS:39/39 tests/5 suites,0 skip;compiled app,real cookies/PostgreSQL/local MinIO |
| Documentation/JSON/diff checks | PASS:23 local links/5 JSON examples in4 phase43 docs,2 Postman collections,git diff --check |

Lần full regression đầu phát hiện assertions4.2 cũ còn mong Staff không được
mark COMPLETED và canEditAttendance=false. Đã cập nhật thành closed no-op được
phép/giữ version và permission correction=true, đúng contract4.3. Không đổi
start/sync/finalize business rules để ép tests. Baseline359/359 và HTTP33/33 trong
planning là evidence lịch sử, không dùng làm kết quả lượt implementation này.

## 4. Gap register và scope tiếp theo

| ID | Trạng thái |
|---|---|
| GAP43-01 (=GAP42-01) correction | CLOSED LOCAL:source/PG/HTTP/full gates pass |
| GAP43-02 (=GAP42-03) audit read | CLOSED LOCAL:source/PG/HTTP/pagination/query plan pass |
| GAP43-03 (=GAP42-02) evidence recovery | CLOSED LOCAL:source/legacy/terminal/partial/fault assertions pass |
| GAP43-04 historical verified evidence | CLOSED LOCAL:public providers/settled fixtures/lock-order/races pass |
| GAP43-05 recovery schema | CLOSED LOCAL:migration up/down/up/no-backfill/FK/RESTRICT/refusal pass |
| GAP43-06 races/replay/fault | CLOSED LOCAL:PG assertions pass; actual cancel/withdrawal commands remain4.4a |
| GAP43-07 parser/DTO/Swagger/Postman | CLOSED LOCAL:built HTTP boundaries pass;collection4.3 exists |
| GAP43-08 full regression/handoff | CLOSED LOCAL:check397/397,HTTP39/39,Swagger/Postman/docs pass |
| GAP43-09 server/browser/release | OPEN4.5; no deployment evidence |

4.4a leave/cancel/replacement,4.4b guest/placement,4.4c Student projections/
summary/denominator/backlog,4.5 release và baseline metrics/rate-limit/i18n vẫn
mở. No-data không tự ABSENT/full coverage; checkedInAt recovery là giờ ghi nhận,
không giờ đến lớp. Staff chưa có historical enrollment lookup mới; IDs lấy từ
chứng cứ vận hành đã đối chiếu như plan. Không sửa FE/commit/push trong lượt này.

## 5. Handoff và rollout/rollback

1. Review migration1791849600003 sau1791849600000/1/2 và migration Phase3 đang
   phối hợp. Backup/run compiled migrations một lần, schema trước code. Không
   backfill clocks/actors/attendance hoặc sửa migrations cũ.
2. APP_TIME_ZONE phải khớp calendar baseline; không có env/dependency mới.
   [Postman](../../../postman/Mindy-Attendance-Phase43.postman_collection.json)
   dùng cookie jar, GET lấy version, UUIDv4 key cho ý định mới; retries giữ body/key.
3. Smoke Mentor correction trong hạn, Staff CANCELLED/history/filter, legacy/
   terminal recovery với real historical payment evidence, replay/revocation.
   Ghi SHA/config/migration/server/browser evidence riêng tại4.5.
4. Có CORRECT/RECOVER/evidence thì down từ chối; giữ schema, rollback application
   tương thích. Code4.2 đọc roster nhưng không xử lý correction/evidence recovery.
   Không xóa audits để ép down. Canceled history vẫn giữ, tỷ lệStudent thuộc4.4c.

## 6. Nhật ký

2026-10-13 planning: đọc baseline/rules/Flow.txt, lập22 AC/16 scenarios và proposed
flow/API. Documentation-only evidence lịch sử: diff check/30 links/5 JSON examples.

2026-10-13 implementation theo user: correction → audit read → evidence providers/
new schema/entities → lifecycle/recovery → route parser/HTTP/Postman. Added5 domain,
31 PG,2 migration cases và4 HTTP journeys. Cập nhật shared4.2 assertions theo
contract4.3; giữ mọi working-tree thay đổi có từ trước và không sửa repo FE.

Final verification:397/397 tests/39 suites,0 skip qua pnpm check;39/39 tests/5 suites,
0 skip qua pnpm test:http. Final Swagger hardening required:true của recovery
reason đã được kiểm chứng lại bằng full HTTP gate;DTO validation regression,lint/
type-check/build pass. GAP43-01–08 và gaps kế thừa GAP42-01–03 đóng local;GAP43-09/release4.5 mở.

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
