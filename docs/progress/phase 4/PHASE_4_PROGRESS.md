# Phase 4 — Progress

## 2026-10-16 — Implementation 4.4c

C1–C4 có source: credit CTE chung/owner student-root, schedule mentor/attendance/
guest, own history/summary và Staff summary/incomplete toàn backlog.
20 focused PG/3 compiled HTTP4.4c/13 timetable regression pass; full gates cuối
**check456/456 tests/45 suites,HTTP48/48 tests/8 suites,0 skip;lint/type-check/build pass**
ở [Progress4.4](PHASE_4_4_PROGRESS.md). [API mục13–18](../../api_flow/PHASE_4_4_flow-api-breakdown.md#13-44c--quy-ước-và-contract-chung)
đã implemented/Swagger/Postman cùng revision. GAP41-01/GAP42-05 đóng phần local
Student projection. Không migration/schema/env/FE/payment thật/deploy mới;
leave/approved intervals và release/browser4.5 còn riêng. Log planning phía
dưới là lịch sử trước implementation trong cùng ngày.

## 2026-10-16 — 4.4b hoàn tất; planning 4.4c

User xác nhận4.4b đã xong. Đã đối chiếu progress/source và chi tiết hóa
[plan4.4 mục4](../../implement_phase/phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md#4-44c--lịch-student-tổng-hợp-và-hàng-chờ-vận-hành):
22 AC/20 scenarios/5 bước C1–C5, shared credit reader/reducer, schedule
effective mentor/guest, own history/summary, Staff summary/incomplete toàn backlog.
[Contract dự kiến](../../api_flow/PHASE_4_4_flow-api-breakdown.md#13-44c--quy-ước-và-contract-chung)
và [progress4.4](PHASE_4_4_PROGRESS.md) cùng revision. Chưa code4.4c; gate436/45
ở15/10 là evidence lịch sử. Leave/approved intervals còn gap source riêng.
Chỉ tài liệu/source review, không BE tests/migrations/FE/deploy mới. User xác
nhận server/Postman4.3 ngày15/10 là evidence riêng, không suy thành deploy4.4b.

## 2026-10-15 — Tiếp 4.4b: học bù lớp khác

Đã triển khai migration1792022400001, Staff queue/candidates/create/cancel placement,
Student own placements, capacity với checkout, guest roster/mark/finalize/audits,
Student context đúng target và requeue/completion guards. Late CASH/PayOS activation
không bị từ chối vì trùng replacement; ghi queue atomic. Flow/API/Postman cùng revision.
User xác nhận a xong; source hiện tại vẫn thiếu workflow leave/approved intervals,
không đánh dấu candidates đã kiểm approved leave. 4.4c/4.5 vẫn pending. Không sửa FE,
không migrate dev/VPS hoặc giao dịch thật. Gate cuối local: **pnpm check436/436 tests/44 suites, pnpm test:http45/45 tests/7 suites,0 skip; lint/type-check/build pass**. Chi tiết xem Progress4.4.


## 2026-10-15 — Implementation4.4a: Session operations đầu tiên

Management schedule/cancel/makeups, ancestry/audit migration và hủy Class batch
đã có source; chi tiết gates/rollback và pending ở [Progress4.4](PHASE_4_4_PROGRESS.md).
Workflow nghỉ/duyệt và approved leave provider chưa có;4.4b–c/4.5 vẫn mở.
Flow/API/Postman cập nhật cùng revision, không sửa FE/dev/VPS hoặc giao dịch thật.

Local gates cuối: **check413/413 tests/41 suites,HTTP42/42 tests/6 suites,0 skip**;
lint/type-check/build pass. Đây là slice đầu, không đánh dấu toàn4.4a đã hoàn tất.

Cập nhật **2026-10-13**. Trạng thái: **core 4.1–4.2 có source/evidence local lịch sử;
core coverage đã đóng local; dependencies/release còn mở; 4.3 implemented/full local gates verified;4.4–4.5 pending; chưa deploy**.

[Plan](../../implement_phase/phase%204/PHASE_4_ATTENDANCE_OPERATIONS.md) ·
[Flow](../../api_flow/PHASE_4_FLOW.md) ·
[API breakdown](../../api_flow/PHASE_4_flow-api-breakdown.md).

Plan/progress riêng sau yêu cầu review của user:
[Plan4.1](../../implement_phase/phase%204/PHASE_4_1_MENTOR_SUBSTITUTION.md) /
[Progress4.1](PHASE_4_1_PROGRESS.md) và
[Plan4.2](../../implement_phase/phase%204/PHASE_4_2_SESSION_ATTENDANCE.md) /
[Progress4.2](PHASE_4_2_PROGRESS.md).
Implementation riêng [Plan4.3](../../implement_phase/phase%204/PHASE_4_3_ATTENDANCE_CORRECTIONS_HISTORY.md) /
[Progress4.3](PHASE_4_3_PROGRESS.md) /
[Flow4.3](../../api_flow/PHASE_4_3_FLOW.md) /
[API4.3](../../api_flow/PHASE_4_3_flow-api-breakdown.md).
Planning4.3 ngày2026-10-13 có22 AC/16 scenarios/5 bước và ma trận source/gaps;
chỉ Markdown/source review. Diff check,30 links/5 JSON examples trong4 docs mới
pass; chưa correction/recovery/audit-reader runtime evidence4.3.
Hai progress riêng đối chiếu current source/test coverage; implementation logs
bên dưới là lịch sử. Lượt tách plan không chạy lại BE gates hoặc tạo VPS evidence.

## Nghiệp vụ user đã duyệt

- Mentor bắt đầu Session, tick Có mặt, chốt chưa tick thành Vắng.
- Chưa bắt đầu/Chưa điểm danh khác Vắng; manual ONLINE/OFFLINE.
- Mentor sửa đến hết ngày kế tiếp của ngày học trên lịch theo APP_TIME_ZONE;
  thứ Ba→00:00 thứ Năm. Manager sửa bất kỳ lúc nào có audit.
- Manager tìm mentor trống lịch và phân công dạy thay khi bận đột xuất.
- Phase4 bắt đầu song song trong khi người khác tiếp tục Phase3.
- Mở điểm danh bất kỳ giờ trong ngày học; không overnight, ngoài ngày chỉ
  Manager recovery. Hạn dựa ngày startsAt trên lịch, không giờ mở đầu tiên.
  Quá endsAt không giữ slot vô hạn; đúng deadline hết quyền Mentor.
- Manager phục hồi buổi quên thao tác và legacy COMPLETED có roster/thời gian/
  kết quả có chứng cứ; thiếu chứng cứ giữ no-data.
- Mentor nghỉ theo range sáng00–12/chiều12–18/tối18–24/cả ngày, gửi trước hai
  ngày lịch (không48h); Manager/Admin duyệt mới cập nhật lịch.
- Nghỉ buổi có cả slot gợi ý và nhập giờ, tránh trùng học viên; FULL_DAY đổi
  ngày giữ giờ, ghi học viên trùng để Manager/mentor biết và xử lý.
- Hủy source + replacement có root link; tự gia hạn endDate khi bù vượt kỳ.
- Xếp học viên ACTIVE sang học bù Class khác cùng Course Unit, Manager xác nhận
  nội dung; guest attendance/credit riêng, quyền đúng một buổi, count một lần.
- Completion chặn SCHEDULED/IN_PROGRESS và placement chưa giải quyết; queues
  mặc định toàn bộ backlog. Chỉ cập nhật lịch, notification/email tự động hoãn.

## Kế hoạch đã ghi

- [x] Đối chiếu Flow.txt/COURSE_FLOW/DBML/source Classes/Users/StudentLearning/Payments.
- [x] Phân công buổi riêng với mentor chủ nhiệm; đổi giữa buổi giữ deadline.
- [x] Candidate theo Session/Class, effective mentor, overlap và mutation recheck.
- [x] Slice4.1–4.5, migration/ownership/lock/version/audit và regression gates.
- [x] Roster snapshot/CASH activation/cutoff, historical reads, summary và makeup.
- [x] Flow/API dự kiến chi tiết + đồng bộ index/combined flow/core progress.
- [x] Bổ sung quyết định review vào plan, nghỉ có duyệt/slot/manual/full-day,
  recovery/context/composite FK và placement/guest credit riêng.

## Implementation và evidence

| Hạng mục | Trạng thái |
|---|---|
| 4.1 Mentor availability/substitution | Current local gates pass; GAP41-04–06 đóng; GAP41-01–03/07 dependencies/release mở |
| 4.2 Session lifecycle/attendance roster | Core/correction/cancel/guest/Student có source/local gates; Student GAP42-05 đóng local,release GAP42-10 còn mở |
| 4.3 Correction/audit/evidence recovery/history | Implemented/local gates; server/Postman hoàn tất theo user15/10, xem Progress4.3 |
| 4.4a Nghỉ có duyệt/slot/manual/replacement/auto endDate | Session operations/replacement/cancel có source/local gates; leave/approved intervals còn thiếu |
| 4.4b Student conflicts/học bù lớp khác/guest attendance | Hoàn tất theo user16/10; local gates15/10 tại Progress4.4; không tự suy deploy |
| 4.4c Student projections/summary/backlog | CLOSED LOCAL16/10; check456/456,HTTP48/48,0 skip; full evidence tại Progress4.4 |
| 4.5 Integration/release | Chưa implementation |
| Migration local / database tests / pnpm check / HTTP gate | Latest4.4c16/10:check456/456,HTTP48/48,0 skip; không migration4.4c mới |
| Staging/VPS / browser smoke | Server/Postman4.3 xong theo user15/10; chưa có evidence deploy4.4/FE browser4.5 |

2026-10-13: chỉ thay tài liệu; kiểm diff/relative links/coverage endpoint và
đối chiếu contract với source baseline. Không coi test lịch/payment cũ là test
attendance mới, không chạy BE tests cho thay đổi chỉ Markdown.
Revision bổ sung vẫn chỉ Markdown, không code/migration/FE/deploy. Ước lượng
8–12 ngày BE/3–5 ngày FE cũ không còn đại diện scope mở rộng.

## Thứ tự kế hoạch (4.1 đã triển khai local)

4.1 đã có source/test local: session override/effective mentor provider, management discovery,
availability và assignment commands, integrate mọi schedule writer với locks
chung. Mỗi migration một người tạo/reviewer phối hợp Phase3. Giữ giới hạn MVP:
trống lịch chưa qualification, có approved leave ở4.4a; substitute không tự có
cash confirm/material authoring. Nghỉ có duyệt và học bù lớp khác vào Phase4;
notification/email tự động/chứng chỉ còn hoãn.

## 2026-10-13 — Implementation mốc 4.1

- Migration mới `1791849600000-session-mentor-assignment`: Session override/teaching
  snapshot/version, Class.assignmentVersion, audit, mutation receipts; IN_PROGRESS
  enum và clock nullable để assignment giữ nguyên actual start/deadline. Không
  tạo attendance hoặc suy đoán mentor lịch sử COMPLETED cũ.
- Management Class list/detail phân trang, candidates theo buổi/cả lớp, PATCH
  mentor buổi/Class; Mentor schedule và Session context. MANAGER/ADMIN dùng
  management, không kế thừa quyền admin/catalog CRUD.
- MentorConflictService dùng effective mentor và advisory lock theo UUID tăng
  dần, cùng key lịch baseline. Add/reschedule/bulk/open kiểm primary/substitute,
  half-open intervals và transaction rollback. Lock Class → Session → mentors.
- Class assignment chỉ đổi SCHEDULED chưa override, tăng version các buổi đó.
  IN_PROGRESS reassignment giữ clocks/startedBy; qua endsAt khoảng kiểm rỗng.
  DRAFT không giữ slot; open revalidate cả override và active mentor.
- Audit + receipt atomic; UUID v4 key; replay không tăng audit/version, payload
  mismatch409, staff role/status hiện hành kiểm trước replay. Mentor cũ mất
  Session context ngay sau commit; không chuyển quyền cash/materials.
- Admin Class PATCH có mentorId dùng cùng command: phải gửi riêng mentorId,
  reason, expectedVersion và Idempotency-Key, không trộn fields khác.
  ClassesService.update chặn writer mentor cũ. Add/time/lifecycle tăng Class
  assignmentVersion; time/lifecycle tăng Session version để mutation cũ bị stale.
- Swagger, [Postman4.1](../../../postman/Mindy-Teaching-Phase41.postman_collection.json),
  flow và API breakdown đồng bộ. HTTP runner fileParallelism:false như integration
  runner để tránh partial shared-module evaluation trên Windows.

Evidence local:

- `pnpm check`: lint/type-check/build pass, **310/310 tests, 31 suites**; dùng
  PostgreSQL17 database riêng *_test và private MinIO local.
- `pnpm test:http`: **29/29 tests, 3 suites** (4.1/2.2/3.2), built Nest app,
  cookie guards/Swagger thật; fake PayOS, không merchant/SMTP thật.
- 4.1 mới: 8 integration assignment cases, 1 migration case, 3 unit/validation
  cases và 2 HTTP cases. Cover cạnh tranh mentor/adjacent/override/stale/key,
  role/inactive, rollback/open/reschedule, context403 mentor cũ, legacy unknown,
  giữ clocks và migration up/down/up + rollback refusal khi có IN_PROGRESS.
- Bật Docker PostgreSQL/MinIO để chạy tests. Không migrate dev/VPS, sửa FE,
  deploy, browser smoke hoặc ghi live payment evidence.

Tiếp theo **4.2**: AttendanceModule/composite ancestry migration, start/snapshot,
CASH admission, mark/unmark/finalize và manager recovery. Chưa có API start tạo
IN_PROGRESS từ người dùng; test4.1 dùng DB fixture cho trạng thái này.
Permissions/makeup fields của SessionView đầy đủ còn các slice sau. Context4.1
chỉ staff/assigned Mentor, chưa Student guest. Approved leave/qualification,
Materials context, attendance deadline/correction, completion/cancel orchestration
và Student projections còn pending ở thời điểm mốc4.1. Mốc4.2 bên dưới thay thế
trạng thái core lifecycle/roster; các gap hiện hành xem progress riêng.
Staging/VPS/browser/release4.5 chưa đạt.

## 2026-10-13 — Implementation mốc 4.2

- Migration additive `1791849600001-session-attendance`: backfill chỉ Session
  class ancestry, UNIQUE parent/composite FK Enrollment–Session cùng Class,
  regular attendance/audits, session lifecycle audits và mutation receipts.
  INSERT trigger derive class_id cho writers cũ; không backfill attendance hoặc
  suy đoán mentor buổi COMPLETED legacy. RESTRICT giữ lịch sử.
- AttendanceModule có GET roster phân trang/totals/canStart/canEdit/canFinalize/
  canSyncRoster; start; sync-roster; PUT mark/unmark; finalize. Cookie role guard,
  ACTIVE actor/current effective assignment kiểm lại trong transaction, cả replay.
  DTO runtime validation/Swagger và Postman4.2 đã có.
- Start trong ngày theo APP_TIME_ZONE, overnight/exclusive midnight; snapshot
  ACTIVE với createdAt/enrolledAt cutoff; OPEN Class→IN_PROGRESS atomic. Không tự
  tick/vắng. Staff recovery start explicit actualStartedAt<=now + reason, giữ hạn
  24h từ actual start; cần enrollment kích hoạt trước mốc quá khứ.
- CASH pending không row; sau cash snapshot mentor confirm commit, effective
  teaching mentor sync paid ACTIVE CASH có hold trước start. Không nhận PayOS
  late activation/enrollment mới sau start; substitute không có quyền confirm tiền.
  Staff sync COMPLETED đã start tạo ABSENT có reason/admission audit.
- Mark/unmark chỉ IN_PROGRESS trong slice4.2; checkedInAt là giờ đánh dấu PRESENT
  mới nhất. Finalize chuyển chỉ UNMARKED→ABSENT, giữ PRESENT, lưu actual end/
  completedBy/lifecycle audit. Quá endsAt không tự ABSENT/COMPLETED. Mentor deadline
  strict now<editableUntil; Staff không deadline nhưng bắt buộc reason.
- Locks Class→Session, mentor advisory khi start; expectedVersion bảo vệ mark/
  sync/finalize/assignment. Audit/write/receipt atomic; retry giữ outcome/clock,
  key payload mismatch409; no-op không tăng version. Không payment/provider/SMTP
  call trong attendance transaction. Snapshot không bị xóa khi enrollment rời lớp.
- Classes export public SessionLifecycleService; Enrollments export roster readers,
  không vòng Classes→Attendance. Class completion chặn Session SCHEDULED/
  IN_PROGRESS; regression lifecycle Phase2 fixture đã cập nhật theo rule này.
- Flow4/API breakdown mục15/plan/index/core progress/combined flow/Postman đồng bộ;
  full planned guest/correction shapes không được coi là contract4.2.

Evidence local ngày2026-10-13 (PostgreSQL17 riêng *_test, MinIO test local):

- **`pnpm check` pass: lint/type-check/build, 328/328 tests, 35 suites, không skip.**
- **`pnpm test:http` pass: 30/30 tests, 4 suites**; built Nest app, cookie guards,
  validation/Swagger thật; PayOS fake, không merchant/SMTP thật.
- 4.2 mới18 tests: 12 integration, 1 migration, 5 domain/DTO; thêm1 HTTP journey.
  Cover duplicate start key, mark/finalize và admission/finalize races, ACTIVE/
  CASH/createdAt/activation cutoff, role/inactive/assignment revoke/replay,
  clock injection/outside-day/staff recovery/deadline, no-op, rollback audit lỗi,
  composite ancestry, snapshot rời lớp, completion guard và finalization retry.
- Migration clean DB + legacy no-data + up/down/up và refusal khi có history pass.
  HTTP round phát hiện type-only DTO import làm mất validation metadata; đã sửa
  runtime DTO imports, rerun whole gates pass. Kiểm pnpm/local source hiện tại,
  không migrate dev/VPS, sửa FE, deploy hoặc thêm live payment evidence.

**Tiếp4.3:** correction sau COMPLETED/CANCELLED, GET audits và legacy/terminal
recovery có roster/payment evidence. Cancel orchestration, leave/makeup/guest,
Student history/summary/schedule và management backlog còn4.4; completion placement
guard bổ sung khi có placements. Materials substitute context và staging/VPS/
browser/release4.5 chưa nghiệm thu. Metrics/rate-limit/i18n giữ limitations baseline.

## 2026-10-13 — Viết plan riêng và đối chiếu lại code/progress

- [x] Plan riêng4.1/4.2 đầy đủ mục tiêu/AC/schema/steps/API/test matrix/rollout/DoD.
- [x] Progress riêng có AC→source→assertions→kết luận và gap register/owner/gate.
- [x] Flow/API entrypoint4.1/4.2, index/combined flow và core progress đồng bộ.
- [x] Chỉnh drift: flow còn ghi4.2 planned, combined flow ghi tất cả chưa code,
  schema chung ghi tất cả planned và dòng gate progress chỉ ghi4.1.
- [ ] GAP41-04–06: mixed-writer concurrency, Class-candidates/Admin PATCH HTTP,
  assignment audit-failure/actor-revocation coverage.
- [ ] GAP42-07–09: edge/multi-page/no-op, mixed-flow races và Staff HTTP.
- [ ] Student timetable hiện Class mentor:4.4c effective mentor/attendance/history.
- [ ] Material substitute context/approved leave/full recovery/correction/cancel/
  guest và server/browser/release dependencies còn mở ở slices tương ứng.

Review thấy core4.1/4.2 có migration/service/API/tests; chưa thấy đầy đủ dedicated
tests cho toàn ma trận race. Đây là coverage gaps, không evidence runtime failure.
Staff historical start có source nhưng legacy/terminal recovery chưa có;
Class cancel chỉ đổi Class state, chưa cancel Session batch/audit.
Các số310/29 và328/30 giữ là evidence lịch sử. Lượt này chỉ Markdown/diff/links/
source review, không BE tests/migrations/FE/deploy/commit/push.

Verification tài liệu lượt này: `git diff --check -- docs` pass; kiểm8 file
Markdown mới,54 local links và headings của anchors contract14/15 đều hợp lệ;
code fences cân bằng, không trailing whitespace. Plan4.1 có16 AC, plan4.2 có20 AC.
Các kiểm tra này là documentation checks, không BE runtime test evidence.

## 2026-10-13 — Đối chiếu và sửa code theo plan4.1/4.2

User sửa deadline: hết ngày kế tiếp của ngày học trên lịch theo APP_TIME_ZONE
(thứ Ba→00:00 thứ Năm), không rolling24h; không có buổi qua đêm. Rule mới này
thay thế phần "Nghiệp vụ user đã duyệt"24h/overnight và logs cũ bên trên.

- [x] Public context recheck ACTIVE/current role/effective assignment.
- [x] Start recheck server day/clock sau mentor lock; regression trước fix red.
- [x] Calendar deadline + no overnight tại add/time/open/start/recovery.
- [x] Migration additive1791849600002 sửa deadline cũ/versions, giữ lịch sử;
  clean/up-down-up, clock backfill/DST equivalence/refusal pass.
- [x] GAP41-04–06 và GAP42-07–09: mixed-writer/edge/Staff HTTP gates đóng local.
- [x] **pnpm check359/359 tests,36 suites, không skip; lint/type-check/build pass.**
- [x] **pnpm test:http33/33 tests,4 suites**, built Nest app/guards/validation/Swagger.
- [ ] Student/material/leave/full correction+recovery/cancel+guest dependencies4.3–4.4.
- [ ] Server/VPS/browser/release4.5; chưa migrate dev/VPS.

Dùng PostgreSQL17 riêng `mindy_phase41_42_audit_test` và suffix *_test, MinIO test
local; fake PayOS, không SMTP/merchant thật.31 tests mới trong check +3 HTTP
cases mới so với mốc328/30. Không FE/deploy/commit/push; không sửa migrations đã có.
Hai progress riêng mục8 có source/evidence và current gap status đầy đủ.

Verification cuối: pnpm lint pass sau cập nhật Postman; git diff --check pass;
12 Markdown Phase4/92 local links và code fences hợp lệ. Không chạy lại full
gates sau các sửa chỉ Markdown/Postman description vì không thay runtime.

### 2026-10-13 — Phase4.3 implementation

Correction COMPLETED/Staff CANCELLED, Staff audit reader và insert-only historical
evidence recovery đã có. Migration1791849600003 giữ clocks/actors/history và exact
paid lineage;route-specific256KiB/1000 rows đã test built app. Focused31 PG/2 migration/
5 domain/4 HTTP pass; full regression gate và gap status theo [Progress4.3](PHASE_4_3_PROGRESS.md).
GAP42-01–03 đã có implementation/evidence4.3,Student/guest/cancel/leave/release vẫn
4.4–4.5. Không FE/dev migration/VPS deploy/giao dịch thật mới trong lượt này.

Evidence4.3 cuối lượt:pnpm check397/397 tests/39 suites,HTTP39/39 tests/5 suites,
0 skip;GAP43-01–08/GAP42-01–03 đóng local,server/browser/release4.5 vẫn mở.

## 2026-10-14 — Đối chiếu hai commit và API summary

- Review `8a1c7e8` (chỉ tài liệu) và `246abf4` (implementation4.1–4.3): 15 endpoint
  Phase4 + 2 endpoint Admin student mới; các route Admin/CASH/Student cũ được
  phân biệt rõ trong [API summary](../../api_flow/PHASE_4_API_SUMMARY.md).
- File summary có bảng method/endpoint/quyền/chức năng, ID/version handoff và
  flow assignment/start/mark/finalize/correction/audit/CASH sync/evidence recovery.
- Đồng bộ flow và breakdown tổng, sửa nhãn correction/recovery/audits còn ghi
  chưa implement. Student/leave/makeup/guest/release giữ trạng thái planned/mở.
- Kiểm chứng lượt này chỉ documentation checks: route coverage theo controller
  trước/sau commit, local links, JSON examples, code fences, `git diff --check`.
  Không chạy lại runtime tests/migration, không sửa FE, không deploy/VPS/payment.

## 2026-10-14 — Deploy preflight failure, Check passed

User cung cấp Actions logs `logs_104514482910`, release `e0c9174`. CI lint,
type-check/build pass; 397 tests/39 suites và 39 HTTP tests/5 suites pass.
Deploy lúc20:23 Asia/Bangkok dừng ở clean VPS checkout vì untracked
`..env.production.swp`; chưa fetch/build/backup/migration/API rollout trong job.
Đã đối chiếu guard trong deploy.yml và ghi procedure bảo toàn swap ngoài checkout
rồi re-run failed jobs ở [runbook](../../VPS_DEPLOYMENT.md). Không thay workflow/
API, không truy cập VPS hoặc chạy lại tests; deploy success/readiness chưa xác nhận.

## 2026-10-15 — Lưu plan riêng 4.4a–c

- [x] Lưu [plan 4.4](../../implement_phase/phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md)
  dựa trên plan/flow/API Phase 4 và source hiện có; thứ tự a → b → c.
- [x] Ghi quyết định user: giữ đăng ký/thanh toán khi trùng lịch bù phát sinh
  sau duyệt, tạo conflict queue cho Manager; không chặn settlement vì trùng lịch.
- [x] Liên kết plan với flow/API breakdown và tiến độ tổng. Chỉ kiểm tài liệu,
  relative links và diff; không chạy BE tests/migration hoặc thao tác FE/VPS.
- [ ] Implementation/migrations/API/tests 4.4a–c và integration 4.5 vẫn pending.

Theo [backlog ngày 15/10](../TASK_SUMMARY_BACKLOG_2026-10-15.md), user xác nhận
4.3 đã lên server và thử Postman xong. Đây là cập nhật trạng thái theo user;
không phải lượt lưu plan vừa deploy/test server, và không áp dụng cho 4.4.
## Tích hợp Materials3.3/3.4 — 2026-10-15

Giữ source/contract4.1–4.3 từ dev e0c9174 và mọi nhật ký planning/implementation
ngày13/10. ClassesModule exports teaching/lifecycle/conflict providers cùng
Materials context/release. Không nới Class completion, attendance deadline,
substitute entitlement, payment lineage hay historical recovery.
Hai migration bridge giải quyết constraint trùng với3.3.4; không sửa migration
đã chạy, source22. Clean22/16→22/17→22/data/FK/down-up3/3 pass trên dedicated DB.
Chi tiết và full gates sau tích hợp tại [progress3.3](../phase%203/PHASE_3_3_PROGRESS.md).
Development/VPS/FE và các slice4.4–4.5 giữ trạng thái pending theo evidence riêng.

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
