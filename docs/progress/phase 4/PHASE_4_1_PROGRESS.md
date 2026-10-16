# Phase 4.1 — Progress và đối chiếu plan với code

2026-10-16 implementation4.4c: GAP41-01 đóng local bằng public Attendance
projection trên timetable, effective Session mentor (terminal legacy nullable),
current access/CASH masking/guest scope.20 PG/3 HTTP4.4c và13 regression lịch
pass; full gates tại [Progress4.4](PHASE_4_4_PROGRESS.md). Leave-aware availability
và release/browser dependencies vẫn riêng. Ghi chú planning bên dưới là lịch sử.

2026-10-16: GAP41-01 Student effective mentor đã có kế hoạch chi tiết tại
[plan4.4 mục4](../../implement_phase/phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md#4-44c--lịch-student-tổng-hợp-và-hàng-chờ-vận-hành),
AC44C-01–07/C2; vẫn OPEN tới khi implementation/tests pass. User xác nhận4.4b
hoàn tất; approved leave provider vẫn gap source riêng. Lượt này chỉ planning,
không runtime4.1 mới; evidence/log dưới đây giữ ngày gốc.

Cập nhật **2026-10-13**. **Core BE và coverage T41-10–12 đã sửa/kiểm local;
dependencies Student/Materials/leave và release còn mở.**
Lượt planning ban đầu chỉ Markdown; evidence sửa code và tests mới tại mục8.

[Plan riêng](../../implement_phase/phase%204/PHASE_4_1_MENTOR_SUBSTITUTION.md) ·
[Progress Phase 4](PHASE_4_PROGRESS.md) · [Flow](../../api_flow/PHASE_4_1_FLOW.md) ·
[API](../../api_flow/PHASE_4_1_flow-api-breakdown.md).

## 1. Cách đọc trạng thái và phạm vi lượt review

- **Có source + test:** đã đọc implementation và assertions tương ứng, không
  mặc định mọi edge case/race trong plan đã phủ.
- **Có source, thiếu gate:** thấy implementation nhưng test/acceptance cụ thể còn thiếu.
- **Dependency chưa làm:** yêu cầu nghiệp vụ vẫn mở, giao slice đã nêu trong plan.
- **Evidence lịch sử:** số test đã được ghi ở lượt implementation trước; lượt
  planning/review này không chạy lại pnpm check, HTTP hoặc PostgreSQL migrations.

Review working tree hiện tại gồm các thay đổi/untracked4.1/4.2 có sẵn; không reset
hoặc ghi đè source. Đây là đối chiếu source, không xác nhận artifact đã deploy.

## 2. Ma trận AC → implementation → tests → kết luận

| AC trong plan | Source đối chiếu | Tests/assertions hiện có | Kết luận |
|---|---|---|---|
| AC41-01 | effective-mentor.ts; TeachingReadService.sessionViews | effective-mentor.spec; class reassignment/legacy null | Có source + test; TS/SQL cùng policy |
| AC41-02–03 | TeachingAssignmentService.assignSession; checkedInterval/assertAssignmentEditable | Clear override/terminal reject; IN_PROGRESS giữ start/startedBy/deadline | Có source + test |
| AC41-04 | assignClass; affectedSessions; Class.assignmentVersion | Giữ override, affectedSessionCount/version, legacy null | Có source + dedicated Class candidate edges |
| AC41-05 | context/schedule; AttendanceService.authorize | Old mentor context403; substitute context;4.2 revoke replay/cash403 | Staff/Mentor core có; Student/material dependencies mở |
| AC41-06–09 | TeachingReadService.candidates; checkedInterval; EFFECTIVE/OCCUPIED SQL | Pagination/overlap/adjacent/stale GET/overdue empty interval | Có source + candidate search/override/empty/terminal tests |
| AC41-10 | ClassScheduleService; ClassesService; AdminClassesController | Reschedule/open rollback, service writer mentor reject; HTTP invalid Admin PATCH | Có source +4 mixed-writer races/valid audited Admin HTTP |
| AC41-11 | Candidate availabilityBasis hiện TEACHING_SCHEDULE_ONLY | Chưa có leave schema/provider/tests | Dependency4.4a; chưa được gọi là leave-aware |
| AC41-12 | loadSession locks Class→Session; lockMentors sorted UUID | Concurrent two-Class assignment một commit/một409 | Lock code + dedicated mixed-writer races pass local |
| AC41-13–14 | validate/assertActor/replay/hash/audit/remember cùng transaction | Role/key/stale/replay/audit count; inactive target reject | Có source + session/Class fault injection/staff revoke replay tests |
| AC41-15–16 | Management/Schedule/Context guards; DTO runtime imports | HTTP cookies, wrong roles, validation, cache header, OpenAPI | Có source + test; toàn schema/routes không đều có HTTP happy path |
| Migration/rollout | 1791849600000-session-mentor-assignment | phase41-migration: up/down/up, legacy null, IN_PROGRESS refusal | Có rehearsal local lịch sử; server pending |

## 3. Evidence lịch sử đã ghi trước lượt review

Nguồn: [Implementation mốc4.1](PHASE_4_PROGRESS.md), giữ nguyên lịch sử:

- `pnpm check`: lint/type-check/build pass, **310/310 tests,31 suites**.
- `pnpm test:http`: **29/29 tests,3 suites**.
- Tests riêng4.1: **8 integration +1 migration +3 domain/DTO;2 HTTP cases**.
- PostgreSQL17 dedicated *_test, MinIO local; fake PayOS, không real merchant/SMTP.
- Sau triển khai4.2, progress chung ghi check328/328/35 suites, HTTP30/30/4 suites.
  Đây là snapshot sau4.2, không số tests riêng4.1 và không lượt rerun của review này.

Chưa có evidence dev/VPS migration, deployment, browser smoke hoặc live payment
cho Phase4. Không suy ra production đang có các API mới.

## 4. Open items sau đối chiếu

| ID | Phát hiện và bằng chứng | Việc phải làm / slice | Trạng thái |
|---|---|---|---|
| GAP41-01 | MyScheduleService compose public AttendanceProjectionService, Session effective mentor | 4.4c giữ CASH_PREVIEW/guest scope, legacy nullable | CLOSED LOCAL16/10; PG/HTTP/regression tại Progress4.4; FE/browser4.5 riêng |
| GAP41-02 | Context4.1 chỉ room/meeting/session; không material context; policy authoring giữ Class baseline | Phối hợp Phase3 public read provider cho substitute, scoped đúng buổi | Chưa nghiệm thu material handoff |
| GAP41-03 | Candidates/conflict checker chưa có approved leave provider | 4.4a tích hợp vào cả read và mọi writer; keep availabilityBasis đúng trước đó | Dependency planned |
| GAP41-04 | Trước review thiếu mixed-writer races | Thêm4 PostgreSQL assignment vs add/bulk/open/Class assignment races, assert one commit/409/rollback | Đã đóng local T41-10 |
| GAP41-05 | Trước review thiếu candidate edges/Admin PATCH happy path | Added affected-set/override/search/empty/terminal edges và valid audited Admin HTTP journey | Đã đóng local T41-11 |
| GAP41-06 | Trước review thiếu fault-injection/staff replay revoke | Session/Class audit failure rollback + staff status/role revoke replay | Đã đóng local T41-12 |
| GAP41-07 | Local evidence chưa có staging/VPS/browser | Handoff SHA/image/migration/smoke/rollback; chạy server/browser cases4.5 | Release pending |

Không đổi business rules hoặc sửa code để giải quyết các gap trong lượt viết
plan này. Core implementation không bị đánh đồng với toàn bộ nghiệm thu Phase4.1.

## 5. Checklist progress hiện hành

- [x] Viết plan riêng4.1: mục tiêu/scope/AC/schema/bước/API/tests/rollout/DoD.
- [x] Đối chiếu AC với migration/controllers/services/DTO/shared writers/tests.
- [x] Có source core staff candidates/assignment và Mentor schedule/context.
- [x] Lưu evidence local cũ đúng mốc, không tạo runtime evidence mới.
- [x] Ghi explicit GAP41-01–07 và owner/dependency/gate.
- [x] Đóng T41-10–12 bằng meaningful regression tests trên PostgreSQL/built HTTP.
- [ ] Student mentor projection/material context/approved leave tích hợp.
- [ ] Staging/VPS migration, browser journey và release acceptance.

## 6. Files evidence để kiểm tra lại

[Assignment service](../../../src/modules/classes/services/teaching-assignment.service.ts),
[Read/context/candidates](../../../src/modules/classes/services/teaching-read.service.ts),
[Shared conflicts](../../../src/modules/classes/services/mentor-conflict.service.ts),
[Schedule writers](../../../src/modules/classes/services/class-schedule.service.ts),
[Integration assertions](../../../test/integration/phase41-teaching-assignment.spec.ts),
[HTTP assertions](../../../test/http/phase41-teaching-assignment.spec.ts),
[Student schedule hiện tại](../../../src/modules/student-learning/services/my-schedule.service.ts).

## 7. Nhật ký lượt planning/review này

2026-10-13: tách plan/progress4.1, flow/API entrypoint riêng; review source/tests,
chỉnh current-state mô tả ở tài liệu Phase4 chung và index. Chỉ Markdown;
verification diff/relative links, không BE tests/migrate/FE/deploy/commit/push.

## 8. 2026-10-13 — Sửa theo plan và local gates mới

GAP41-04–06 đóng local: thêm4 mixed-writer races (assignment vs add/bulk/open/
Class assignment), candidate affected-set/search/override/empty/terminal tests,
Session/Class audit-failure rollback, staff status/role revoke replay và audited
Admin PATCH HTTP journey. Context provider tự kiểm ACTIVE/current role/
assignment trong transaction; regression direct Student/inactive/stale-role403.
Schedule add/time/open reject overnight theo quyết định user mới.

- `pnpm check` **pass359/359 tests,36 suites, không skip**; lint/type-check/build pass.
- `pnpm test:http` **pass33/33 tests,4 suites**; built Nest app/cookies/Swagger.
- Riêng assignment integration **18 cases**, HTTP4.1 **3 journeys/cases**.
- PostgreSQL17 riêng `mindy_phase41_42_audit_test` và các DB suffix *_test;
  private MinIO test local. Fake PayOS, không merchant/SMTP thật.

Không migrate dev/VPS, sửa FE, deploy hoặc commit/push. GAP41-01–03/07 vẫn mở:
Student effective mentor/Materials context/approved leave/server acceptance.
Không coi current Class cancel state race test là cancel orchestration đã có.
