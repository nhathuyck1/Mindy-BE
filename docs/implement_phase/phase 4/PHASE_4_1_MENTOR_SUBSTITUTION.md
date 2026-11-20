# Phase 4.1 — Mentor availability và phân công dạy thay

Ngày lập plan riêng và đối chiếu: **2026-10-13**.
**Core BE đã có source và evidence local trước lượt review này; chưa đóng release.**
Lượt này viết lại plan theo nghiệp vụ đã chốt, rồi đối chiếu code/test hiện có;
không coi việc thêm tài liệu là implementation hoặc một lần chạy test mới.

[Plan Phase 4](PHASE_4_ATTENDANCE_OPERATIONS.md) ·
[Progress 4.1](../../progress/phase%204/PHASE_4_1_PROGRESS.md) ·
[Flow 4.1](../../api_flow/PHASE_4_1_FLOW.md) ·
[API 4.1](../../api_flow/PHASE_4_1_flow-api-breakdown.md).

## 1. Mục tiêu, đầu vào và đầu ra nghiệm thu

Manager/Admin tìm mentor ACTIVE trống lịch cho một Session hoặc các buổi chịu ảnh
hưởng của đổi mentor Class, phân công có lý do, rồi mentor mới thấy lịch/context
của buổi. Mentor cũ mất quyền buổi; phân công giữa buổi giữ thời gian bắt đầu và
hạn điểm danh. Mọi writer lịch hiện hữu phải kiểm cùng effective mentor policy.

Prerequisites: role MANAGER từ Phase 3.1; Classes/Class Units/Class Sessions,
Users/auth và enrollment/payment Phase 2. Không đợi Materials CRUD Phase 3.3.
Đọc `document/Flow.txt`, `document/COURSE_FLOW.md`, plan Phase 4 và
`docs/core/NESTJS_PROJECT_RULES.md` trước khi đổi nghiệp vụ.

Chuỗi nghiệm thu core: staff discovery → candidates → assignment → mentor
schedule → session context. Chuỗi nghiệm thu đầy đủ nối thêm attendance 4.2,
Student projection 4.4c và browser/VPS 4.5; core pass chưa chứng minh chuỗi đầy đủ.

## 2. Phạm vi và dependency còn phải theo dõi

| Phần | Trách nhiệm |
|---|---|
| 4.1 core | Management metadata; candidates; assignment buổi/lớp; effective mentor; writer lịch; Mentor schedule/context; audit/receipt/version |
| 4.2 | Start/snapshot/mark/finalize; sử dụng assignment 4.1, không cấp quyền tiền |
| 4.3 | Correction/audit reader/legacy recovery; giữ quyền theo effective mentor |
| 4.4a | Approved leave nối vào candidates và mọi writer; cancel/replacement orchestration |
| 4.4c | Student timetable hiển thị mentor hiệu lực từng buổi; không chỉ mentor Class |
| Phase 3 phối hợp | Material read context cho substitute qua public provider; không mở authoring/review/release cả lớp |
| 4.5 | Migration/server/browser smoke và release evidence |

Qualification, availability tự khai và mentor tự nhận slot chưa có trong MVP
4.1. Candidates hiện chỉ chứng minh không trùng lịch dạy, không chứng minh đã
được duyệt môn, đã nhận lời hoặc không có khoảng nghỉ được duyệt.
Không tự gửi email/notification/chat khi phân công.

## 3. Invariants và acceptance criteria

### 3.1 Phân công buổi khác phân công cả lớp

- **AC41-01:** SCHEDULED dùng `mentorOverrideId ?? Class.mentorId`. Sau start
  dùng `teachingMentorId`; legacy thiếu snapshot trả null, không đoán người dạy.
- **AC41-02:** Staff đổi/clear override bằng command riêng. `mentorId:null`
  nghĩa quay về mentor Class; thiếu field không có nghĩa clear. Chỉ SCHEDULED/
  IN_PROGRESS được đổi; COMPLETED/CANCELLED từ chối.
- **AC41-03:** Đổi giữa buổi cập nhật teaching mentor nhưng giữ `actualStartedAt`,
  `startedBy`, `editableUntil`, kết quả/roster hiện có. Không gia hạn deadline.
- **AC41-04:** Đổi mentor Class chỉ ảnh hưởng SCHEDULED chưa override; tăng
  Class.assignmentVersion và version các buổi chịu ảnh hưởng. Giữ overrides và
  historical teaching snapshots. Class terminal không đổi mentor chủ nhiệm.
- **AC41-05:** Mentor mới đọc context/schedule đúng buổi, mentor cũ mất quyền
  buổi sau commit. Quyền Class khác, CASH theo Order snapshot và Materials policy
  không được suy ra từ quyền buổi. Student mentor projection phải nối ở 4.4c.

### 3.2 Availability và writer lịch

- **AC41-06:** Candidates chỉ ACTIVE + MENTOR, phân trang/sort ổn định; search
  displayName có giới hạn. Server lấy interval từ Session, không nhận giờ thay thế.
- **AC41-07:** Overlap theo `[start,end)`: `a.start < b.end && a.end > b.start`.
  Hai buổi tiếp giáp được phép; không travel buffer. Occupied là SCHEDULED của
  Class OPEN/IN_PROGRESS và mọi IN_PROGRESS; DRAFT không giữ slot.
- **AC41-08:** Đổi IN_PROGRESS kiểm `[max(now,startsAt),endsAt)`; quá endsAt
  khoảng rỗng, không giữ slot vô hạn. Vẫn kiểm role/status/version.
- **AC41-09:** GET không giữ chỗ; command kiểm lại sau lock. Session candidates
  loại đúng target; Class candidates loại tập SCHEDULED chưa override nhưng vẫn
  kiểm các buổi khác cùng Class. Không bỏ cả Class khỏi conflict query.
- **AC41-10:** Add/reschedule/bulk/open/đổi mentor Class/đổi mentor Session cùng
  dùng effective mentor checker và advisory key; open revalidate primary/override
  đang ACTIVE. Writer Admin PATCH mentor cũ phải đi qua audited command.
- **AC41-11:** Approved leave được tích hợp tại 4.4a vào cả GET và write; trước
  đó API trả `availabilityBasis:TEACHING_SCHEDULE_ONLY` và FE diễn đạt đúng.

### 3.3 Transaction, API và quyền

- **AC41-12:** Khóa Class → Session khi cần → tập mentor UUID tăng dần, dùng
  advisory transaction lock chung baseline. Không network/provider call khi giữ lock.
- **AC41-13:** Staff command kiểm actor ACTIVE/current role trước replay; target
  mentor ACTIVE/MENTOR kiểm khi thực hiện write mới. Có expectedVersion và
  Idempotency-Key UUID v4; payload khác cùng key409, stale version409.
- **AC41-14:** Assignment + version + audit + receipt cùng transaction. Replay
  trả outcome cũ, không tạo thêm history; FE refetch quyền/version sau retry.
  Assignment bằng key mới hiện tăng version/audit cả khi chọn lại cùng mentor;
  không áp dụng quy tắc no-op của mark/sync 4.2 vào command này.
- **AC41-15:** Management chỉ MANAGER/ADMIN; schedule chỉ MENTOR; context staff
  hoặc effective mentor. Session context là scope SESSION; terminal ẩn meetingUrl.
- **AC41-16:** DTO runtime metadata, UUID/pagination/range validation, private
  no-store, safe DTO và Swagger/Postman đồng bộ. Không mở Admin CRUD cho Manager.

## 4. Schema, ownership và kế hoạch triển khai theo bước

Migration additive `1791849600000-session-mentor-assignment.ts` sở hữu Classes:
thêm IN_PROGRESS enum, Class.assignmentVersion, Session override/teaching snapshot,
version, actual clocks/start/completed actors/editableUntil; tạo
`teaching_assignment_audits`, `teaching_mutation_receipts`, index override/start.
Clock nullable là nền cho 4.2; 4.1 không tự tạo attendance hoặc start endpoint.

| Bước | Deliverable | Gate trước chuyển bước |
|---|---|---|
| 4.1.1 Chốt policy/schema | Effective mentor TS/SQL; additive migration, enum rollout và legacy null | TS/SQL thống nhất; up/down/up; rollback có history từ chối |
| 4.1.2 Shared conflicts | MentorConflictService, tập mentor locks; integrate ClassScheduleService | Primary/substitute overlap, adjacent, DRAFT/open, rollback cuối transaction |
| 4.1.3 Staff reads | Class list/detail, Session/Class candidates; Users public queries | Pagination, search, role, asOf/version/checked interval; GET không giữ slot |
| 4.1.4 Assignment commands | Session override, Class primary; actor check, version, audit/receipt | Stale/key mismatch; class preserves override/history; race chỉ một commit |
| 4.1.5 Mentor context | Mentor schedule; context phòng/meeting URL đúng buổi | Mentor cũ403, Student403, terminal URL null, legacy effective mentor null |
| 4.1.6 Legacy writer integration | Admin PATCH riêng mentor fields; add/time/open/lifecycle versions | Không đường ghi mentor bỏ qua command; conflict rollback không tăng version |
| 4.1.7 Handoff | Actual API, flow, progress, Swagger/Postman, dependency register | Phân biệt core local với Student/material/leave/release pending |

Source chính: `classes/domain/effective-mentor.ts`, services
`mentor-conflict`, `teaching-read`, `teaching-assignment`, `class-schedule`,
`classes`; controllers `teaching-management`, `mentor-schedule`,
`session-context`, `admin-classes`. Users chỉ cung cấp public query;
Attendance/StudentLearning tiêu thụ Classes exports, không import private provider.

## 5. Contract API core cần bàn giao

Tất cả route dưới đây có prefix `/api/v1`; GET/assignment thành công200.

| Method + route | Actor | Input và kết quả chính |
|---|---|---|
| GET `/management/classes` | Staff | page/pageSize/status → metadata + assignmentVersion |
| GET `/management/classes/:classId` | Staff | page/pageSize → Class + paginated sessions |
| GET `/management/class-sessions/:sessionId/available-mentors` | Staff | page/pageSize/search → candidates, sessionVersion, checkedFrom/To, asOf |
| GET `/management/classes/:classId/available-mentors` | Staff | candidates cho tập affected, assignmentVersion, affectedSessionCount |
| PATCH `/management/class-sessions/:sessionId/mentor` | Staff | mentorId UUID/null, reason 1–1000 trimmed, expectedVersion, key → TeachingSessionDto |
| PATCH `/management/classes/:classId/mentor` | Staff | mentorId UUID, reason/version/key → ClassMentorAssignmentDto |
| GET `/mentor/schedule` | Mentor | default tuần theo APP_TIME_ZONE; explicit from/to phải có cả hai, offset, range ≤93 ngày; optional classId |
| GET `/class-sessions/:sessionId/context` | Staff/effective Mentor | Session + roomName/meetingUrl + accessScope SESSION |

Admin `PATCH /admin/classes/:classId` có mentorId phải gửi riêng mentorId,
reason, expectedVersion và key; request trộn fields khác bị422. ClassesService.update
không nhận writer mentor trực tiếp. ParseUUIDPipe sai path UUID400; validation
DTO/header422; auth401/403; missing404; conflict409 với mã domain.
Shape và lỗi đầy đủ lấy từ API breakdown Phase 4 mục14, không lấy full planned
SessionView đầu tài liệu làm shape hiện tại.

## 6. Ma trận verification bắt buộc và tình trạng coverage

Đây là yêu cầu nghiệm thu; trạng thái đối chiếu cụ thể ở Progress 4.1.
Các test tồn tại không đồng nghĩa mọi tổ hợp race đã được chạy hoặc đã phủ.

| ID | Scenario và kết quả phải chứng minh | Test hiện có / việc còn bổ sung |
|---|---|---|
| T41-01 | Override trước start; snapshot sau start; legacy null | effective-mentor.spec.ts |
| T41-02 | Null clear; missing ID/reason/version/range sai | teaching-query.dto.spec.ts; HTTP validation |
| T41-03 | Discovery/pagination, context scoped, schedule có substitute | phase41-teaching-assignment integration + HTTP |
| T41-04 | Candidate cũ bị writer reject; overlap409; adjacent pass | Integration case occupied/adjacent/stale GET |
| T41-05 | Hai assignments khác Class tranh cùng mentor interval | Integration race: một commit/một409; audit một hàng |
| T41-06 | Replay đúng outcome; mismatch/stale409; wrong role/inactive | Integration replay/eligibility + HTTP key/version |
| T41-07 | Class đổi primary giữ override, version và legacy unknown | Integration class reassignment |
| T41-08 | Bulk reschedule conflict/open conflict rollback, direct writer reject | Integration writer recheck; test add/bulk baseline đọc kèm |
| T41-09 | Đổi IN_PROGRESS giữ clocks; qua endsAt khoảng rỗng | Integration in-progress reassignment |
| T41-10 | Assignment vs add/bulk/open/Class assignment: không lọt conflict/deadlock | Thêm4 PostgreSQL mixed-writer races, assert một commit/409 và rollback |
| T41-11 | Class candidates affected set; audited Admin PATCH hợp lệ qua HTTP | Added candidate search/override/empty/terminal edges và valid Admin HTTP journey |
| T41-12 | Audit lỗi rollback assignment/version/receipt; inactive staff replay bị chặn | Session/Class fault-injection + staff status/role revoke replay cases |
| T41-13 | Migration clean/up-down-up/legacy no-data/refusal | phase41-migration.spec.ts; chưa có VPS rehearsal |
| T41-14 | Student thấy đúng mentor buổi; substitute material read context | Chưa implement tích hợp tương ứng; dependency 4.4c/Phase 3 |

Khi bổ sung code/tests: `pnpm check`, `pnpm test:http` trên DB riêng `*_test`;
đếm pass và skip riêng, không dùng dev/prod DB. Race phải dùng PostgreSQL thật.
Lượt sửa Markdown hiện tại chỉ check diff/link và đối chiếu source/test.

## 7. Rollout, rollback và Definition of Done

1. Chốt artifact/SHA, thứ tự migration cùng người làm Phase 3; không sửa migration đã chạy.
2. Backup và chọn maintenance window vì enum rename/create/cast giữ lock bảng;
   dừng writers, migrate trước nhận traffic code mới.
3. Kiểm staff candidates/assign → substitute context/schedule, old mentor403,
   CASH owner nguyên theo Order và lịch writer không lọt overlap.
4. Rollback schema chỉ khi chưa có history/receipt/override/teaching snapshot/
   IN_PROGRESS/actual clocks theo guard migration. Có history giữ schema, rollback
   application với phiên bản tương thích; không xóa audit để ép down.
5. Đính kèm evidence local/server/browser riêng; approved leave chỉ claim sau 4.4a.

Core local DoD: AC41-01–10 và12–16 có implementation, meaningful tests và gates
pass; T41-10–12 đã bổ sung meaningful tests, evidence full gate xem progress.
Release DoD thêm Student/material/leave dependencies tương ứng và server/browser
evidence. **Không ghi 4.1 hoàn tất toàn bộ chỉ vì trước đây check310/HTTP29 pass.**

## 8. Kết quả review và việc tiếp theo

Đã đối chiếu migration, controllers, DTO, services, shared writers và assertions
các suites 4.1/4.2 với từng AC. Core tồn tại; kết quả và open items có ID tại
[Progress 4.1](../../progress/phase%204/PHASE_4_1_PROGRESS.md).
Không hạ yêu cầu nghiệm thu theo code hiện có: race matrix, Student projection,
material handoff, leave integration và deployment vẫn là việc phải hoàn thành.

Current local gates sau sửa: check359/359/36 suites, HTTP33/33/4 suites;
T41-10–12 đã đóng bằng tests mới, dependencies4.3–4.5 vẫn mở. Các đoạn chỉ
Markdown phía trên là lượt planning ban đầu, không áp cho lượt implementation này.

Revision thực thi2026-10-13: public Session context provider kiểm ACTIVE/current
role và assignment ngay trong read transaction; direct Student/stale role/inactive
actors bị403, không chỉ dựa controller guard. Add/time/open không chấp nhận
overnight theo user. Deadline attendance là hết ngày kế tiếp của ngày học trên
lịch; assignment giữ deadline, không gia hạn theo giờ đổi người dạy.
