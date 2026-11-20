# Phase 4.2 — Progress và đối chiếu plan với code

2026-10-16 implementation4.4c: GAP42-05 đóng local — schedule/own history/summary/
Staff reports/backlog có source và focused PG20/HTTP3, regression lịch13 pass;
full gates tại [Progress4.4](PHASE_4_4_PROGRESS.md). Cancel/guest4.4 đã có, historical
credit reader không tự ABSENT cho missing snapshot/recovery omissions. Own
terminal metadata không mở content. Planning/baseline phía dưới giữ ngày gốc.

2026-10-16: rà lại dependencies với source4.4 hiện hành. Session cancellation/
replacement và guest placement/attendance đã có;4.4b hoàn tất theo user.
GAP42-04 phần cancellation và GAP42-06 phần guest không còn là thiếu source;
leave/approved intervals vẫn riêng. GAP42-05 Student/summary/backlog giữ OPEN,
đã có [plan4.4c](../../implement_phase/phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md#4-44c--lịch-student-tổng-hợp-và-hàng-chờ-vận-hành)
22 AC/20 scenarios/C1–C5. Bảng review baseline phía dưới là evidence tại ngày
ghi gốc; không dùng các hàng “chưa implementation” cũ để phủ nhận source mới.
Chỉ cập nhật tài liệu, không chạy lại gates4.2 hoặc nghiệm thu deploy4.4.

Cập nhật **2026-10-13**. **Core attendance/calendar deadline và coverage T42-12–14
đã sửa/kiểm local; full recovery/dependencies/release còn mở.**
Lượt planning ban đầu chỉ Markdown; evidence code/tests/migration mới tại mục8.

[Plan riêng](../../implement_phase/phase%204/PHASE_4_2_SESSION_ATTENDANCE.md) ·
[Progress Phase4](PHASE_4_PROGRESS.md) · [Flow](../../api_flow/PHASE_4_2_FLOW.md) ·
[API](../../api_flow/PHASE_4_2_flow-api-breakdown.md).

## 1. Phạm vi review và cách hiểu evidence

Đã đọc migration/controller/DTO/service, Class lifecycle, Enrollments roster
readers và assertions4.2. Đối chiếu plan nghiệp vụ với source working tree,
không chỉ dựa vào progress cũ. Tests có file/assertion và evidence lần chạy cũ
được ghi riêng; lượt viết plan/review này không chạy BE runtime gates.

Core local gồm regular roster/start/sync/mark/unmark/finalize và Staff historical
start cho Session SCHEDULED của Class OPEN/IN_PROGRESS. Correction sau chốt,
legacy/terminal recovery, cancel/guest/Student history chưa implemented.

## 2. Ma trận AC → source → tests → kết luận

| AC trong plan | Source đối chiếu | Tests/assertions hiện có | Kết luận |
|---|---|---|---|
| AC42-01 | AttendanceService.open + SessionLifecycleService.start | Atomic start/class close/ACTIVE snapshot/replay | Có source + test |
| AC42-02–04 | attendance-window; open/close timestamp checks | No overnight/calendar midnight/DST/post-lock clock; recovery timestamps | Có source + Staff recovery/sync HTTP journeys |
| AC42-05 | Không auto-finalize worker; chỉ close đổi UNMARKED | Integration elapsed schedule giữ UNMARKED; PRESENT giữ khi chốt | Có source + test |
| AC42-06 | ClassesService.complete unresolved session guard |4.2 start case complete reject; finalize rồi complete pass | Guard sessions có; cancel orchestration/placement guard chưa có |
| AC42-07–09 | EnrollmentsService.attendanceCandidates; admit/sync/pendingCount | CASH pending/activate/sync/no-op; createdAt/PayOS late cutoff; Staff admit after close | Có source + test; historical roster tổng quát chưa có |
| AC42-10 | Composite FKs/unique/RESTRICT; roster đọc snapshot | Cross-Class insert/update reject; withdrawal history; migration no-data | Có source + test; guest thuộc4.4b |
| AC42-11–13 | MarkAttendanceDto; markRows; close/totals | Batch foreign-row rollback; mark/unmark/finalize/replay; checkedInAt | Có source + multi-page/no-op/empty-finalize edge tests |
| AC42-14–16 | authorize/assertWritable/permissions | Mentor revoke replay; suspended Mentor; Student403; deadline/reason checks | Có source + test; completed correction permissions cố ý chưa mở4.2 |
| AC42-17–18 | mutate Class→Session/version/hash/receipt; start mentor lock | Duplicate key/start; mark/finalize và sync/finalize race; audit failure rollback | Có source + mixed-flow races incl actual CASH settlement/start |
| AC42-19 | Controller guards/runtime DTO imports/no-store/safe DTO | HTTP real cookie journey/422/Swagger/key/version | Có source + Mentor/Staff HTTP validation+journeys |
| AC42-20 | open chỉ SCHEDULED và Class OPEN/IN_PROGRESS | Recovery cũ không admit ACTIVE kích hoạt hôm nay | Recovery partial; legacy/terminal evidence workflow chưa có4.3 |
| Rollout | 1791849600001-session-attendance | Migration ancestry/up-down-up/no attendance backfill/refusal | Local rehearsal lịch sử; server pending |

## 3. Evidence lịch sử đã ghi trước lượt review

Nguồn: [Implementation mốc4.2](PHASE_4_PROGRESS.md):

- **pnpm check pass:328/328 tests,35 suites**, lint/type-check/build pass, không skip.
- **pnpm test:http pass:30/30 tests,4 suites**.
- Tests riêng4.2: **12 integration +1 migration +5 domain/DTO;1 HTTP journey**.
- Dedicated PostgreSQL17 *_test và MinIO local; built Nest app/cookie guards/
  validation/Swagger. PayOS fake, không merchant/SMTP thật.
- Lượt implementation từng sửa runtime DTO imports sau HTTP validation failure
  và ghi rerun full gates pass. Review hiện tại không chạy lại các gates đó.

Các tổng328/30 là toàn project tại mốc4.2, không số test attendance riêng.
Không migrate dev/VPS, FE/browser smoke hoặc real payment evidence mới ở lượt này.

## 4. Gap register sau đối chiếu

| ID | Phát hiện và bằng chứng | Việc phải làm / slice | Trạng thái |
|---|---|---|---|
| GAP42-01 | assertWritable/permissions chỉ mark IN_PROGRESS; COMPLETED/CANCELLED reject |4.3 correction theo deadline, Staff reason/audit; không trả UNMARKED sau chốt | Đóng local4.3:correction/permissions/CORRECT audit có source/PG/HTTP/full gates |
| GAP42-02 | open chỉ Session SCHEDULED + Class OPEN/IN_PROGRESS; không recover endpoint/legacy evidence workflow |4.3 phục hồi COMPLETED legacy/terminal Class có roster/payment/time/result evidence | Đóng local4.3:insert-only legacy/terminal evidence recovery có source/migration/PG/HTTP |
| GAP42-03 | Baseline4.2 audit tables có write, controller không GET audit/history |4.3 Staff audits và4.4c own history | CLOSED LOCAL Staff4.3/Student4.4c; current gates tại Progress4.4 |
| GAP42-04 | Baseline4.2 Class cancel chưa orchestration |4.4a cancel batch/audits,4.4b placement guards,4.4c canceled excluded | CLOSED LOCAL source/gates4.4; leave workflow vẫn gap riêng |
| GAP42-05 | Shared Attendance projection/reports + MySchedule compose |4.4c own history/summary/effective mentor/guest/backlog, FULL/CASH masking | CLOSED LOCAL16/10; tests/gates tại Progress4.4; FE/VPS4.5 riêng |
| GAP42-06 | Baseline4.2 roster chỉ REGULAR |4.4b separate guest/capacity và4.4c source credit once | CLOSED LOCAL source/gates4.4b–c; regular FK giữ nguyên |
| GAP42-07 | Trước review thiếu totals/no-op/empty snapshot edges | Multi-page whole totals/no-op mark/empty finalize/Staff reason+state matrix | Đã đóng local T42-12 |
| GAP42-08 | Trước review thiếu mixed-flow races | PG start/mark vs assignment; actual CASH settlement/checkout vs start; complete/cancel vs writes | Đã đóng local T42-13; cancel orchestration4.4a vẫn mở |
| GAP42-09 | Trước review chỉ một Mentor HTTP journey | Added2 Staff recovery/sync/after-close admission journeys với timestamps/nested/whitelist errors | Đã đóng local T42-14 |
| GAP42-10 | Local gates không chứng minh VPS migrations/browser/Student journey |4.5 deploy/handoff/smoke/rollback evidence với dependencies4.3/4.4 | Release pending |

GAP42-01–06 vẫn là requirements/dependencies chưa làm. GAP42-07–09 đã đóng qua
lượt sửa theo plan; các logs planning cũ không thay thế evidence code mới.

## 5. Checklist progress hiện hành

- [x] Viết plan riêng4.2: state/AC/roster/payment/schema/steps/API/tests/rollout.
- [x] Review AC với source, assertions và progress lịch sử.
- [x] Core regular start/snapshot/sync/mark/finalize có implementation.
- [x] Recovery SCHEDULED có reason/time/cutoff, giữ deadline hết ngày học kế tiếp.
- [x] Ghi rõ recovery đầy đủ/correction/Student/cancel chưa hoàn tất.
- [x] Tách evidence lịch sử khỏi verification Markdown lượt này.
- [x] Đóng edge/concurrency/Staff HTTP gates T42-12–14 local.
- [ ]4.3 correction/audit reader/legacy/terminal recovery.
- [ ]4.4 cancel/leave/guest/Student/operations và placement completion guard.
- [ ]4.5 server/browser/release evidence.

## 6. Files evidence để kiểm tra lại

[Attendance commands/roster](../../../src/modules/attendance/services/attendance.service.ts),
[Lifecycle participant](../../../src/modules/classes/services/session-lifecycle.service.ts),
[Enrollment cutoff readers](../../../src/modules/enrollments/services/enrollments.service.ts),
[Migration](../../../src/database/migrations/1791849600001-session-attendance.ts),
[Class completion/cancel](../../../src/modules/classes/services/classes.service.ts),
[Integration assertions](../../../test/integration/phase42-attendance.spec.ts),
[Migration assertions](../../../test/integration/phase42-migration.spec.ts),
[HTTP assertions](../../../test/http/phase42-attendance.spec.ts).

## 7. Nhật ký lượt planning/review này

2026-10-13: tách plan/progress4.2, flow/API entrypoint riêng, bổ sung matrix
AC→code→tests→status và GAP42-01–10. Đồng bộ Phase4 chung/index/combined flow;
chỉ Markdown, verification diff/link. Không BE tests/DB migrations/FE/deploy/
commit/push; metrics/rate-limit/i18n limitations theo baseline vẫn còn mở.

## 8. 2026-10-13 — Sửa theo plan và rule ngày học

**User chốt lại:** không buổi qua đêm; thứ Ba học → hạn00:00 thứ Năm
theo APP_TIME_ZONE. Deadline lấy ngày startsAt trên lịch, không actual start +24h.
Mentor mở muộn/retry/đổi mentor/Staff recovery không cấp hạn mới.

- Fix start lấy now sau mentor lock: test mới trước fix tái hiện start vượt
  midnight vẫn được phép; sau fix reject đúng day-closed/rollback. Outcome asOf/
  permissions dùng giờ mới, không trả quyền theo clock trước lock wait.
- SessionLifecycleService tính midnight ngày học+2; class-calendar tests cover
  sáng/tối, tháng/năm và DST. Integration sửa sát midnight ngày kế tiếp pass,
  đúngdeadline reject; Staff chốt sau hạn vẫn giữ deadline.
- Add/time/open/start/recovery chặn overnight; regression Phase2 time-update cũ
  đổi sang reject+giữ dates/version theo user, không xóa lịch sử legacy.
- Migration mới [1791849600002](../../../src/database/migrations/1791849600002-calendar-attendance-deadline.ts)
  backfill clocks đã start/tăng version khi đổi, không chạm actual clocks/
  teaching snapshots/attendance/audits. APP_TIME_ZONE migration phải giống API;
  receipt outcome cũ refetch GET. Down khi có actual start fail, giữ policy/schema.
- GAP42-07–09 đã có edge/mixed-flow/Staff HTTP tests. Actual cash settlement vs
  start khác với sync/finalize race; checkout/start, assignment/start+mark,
  completion/finalize và Class cancel/start+mark đều có PG assertions.

Evidence mới (không dùng lại số lịch sử):

- **pnpm check pass359/359 tests,36 suites, không skip; lint/type-check/build pass.**
- **pnpm test:http pass33/33 tests,4 suites**; cookie auth/DTO metadata/Swagger
  thật. Riêng attendance integration **27 cases**, HTTP4.2 **3 journeys**;
  calendar migration có **3 cases** clean/up-down-up/legacy clocks/DST/refusal.
- PostgreSQL17 dedicated `mindy_phase41_42_audit_test` + DB suffix riêng; MinIO
  test local. Fake PayOS, không real merchant/SMTP. Migration chỉ test DB.
- Full gate đầu tiên phát hiện test Phase2 vẫn kỳ vọng overnight; đã sửa test
  theo yêu cầu mới, kiểm atomic reject, chạy lại cả pnpm check và HTTP pass.

GAP42-01–06/10 vẫn mở đúng4.3–4.5: correction/audit readers/legacy recovery,
cancel orchestration/guest/Student projections và release. Không FE/dev/VPS
migration/deploy/commit/push; metrics/rate-limit/i18n limitations giữ baseline.

### 2026-10-13 — Phase4.3 implementation

Correction COMPLETED/Staff CANCELLED, Staff audit reader và insert-only historical
evidence recovery đã có. Migration1791849600003 giữ clocks/actors/history và exact
paid lineage;route-specific256KiB/1000 rows đã test built app. Focused31 PG/2 migration/
5 domain/4 HTTP pass; full regression gate và gap status theo [Progress4.3](PHASE_4_3_PROGRESS.md).
GAP42-01–03 đã có implementation/evidence4.3,Student/guest/cancel/leave/release vẫn
4.4–4.5. Không FE/dev migration/VPS deploy/giao dịch thật mới trong lượt này.

Evidence4.3 cuối lượt:pnpm check397/397 tests/39 suites,HTTP39/39 tests/5 suites,
0 skip;GAP43-01–08/GAP42-01–03 đóng local,server/browser/release4.5 vẫn mở.
