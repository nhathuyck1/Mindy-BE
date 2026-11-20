# Phase 4.2 — Session lifecycle và attendance roster

Ngày lập plan riêng và đối chiếu: **2026-10-13**.
**Core BE đã có source và evidence local trước lượt review này; recovery đầy đủ
và release còn mở.** Planning ban đầu chỉ Markdown; lượt sửa theo plan đã thêm
regression tests, actor context checks, calendar deadline và migration mới.

**Rule user sửa ngày2026-10-13:** không có buổi học qua đêm. Ngày học thứ Ba
cho Mentor ghi/sửa/chốt đến hết thứ Tư, tức `now < 00:00 thứ Năm` theo
APP_TIME_ZONE. Mốc tính từ `Session.startsAt` trên lịch, không từ actualStartedAt.
Hạn chốt không đổi theo giờ bấm, retry, reassignment hoặc Staff recovery.

[Plan Phase 4](PHASE_4_ATTENDANCE_OPERATIONS.md) ·
[Plan 4.1](PHASE_4_1_MENTOR_SUBSTITUTION.md) ·
[Progress 4.2](../../progress/phase%204/PHASE_4_2_PROGRESS.md) ·
[Flow 4.2](../../api_flow/PHASE_4_2_FLOW.md) ·
[API 4.2](../../api_flow/PHASE_4_2_flow-api-breakdown.md).

## 1. Mục tiêu, prerequisites và giới hạn nghiệm thu

Mentor hiệu lực mở điểm danh trong ngày học, server chụp roster, Mentor tick/bỏ
tick và chốt buổi. Chỉ chốt mới tự chuyển chưa tick thành ABSENT. Staff phục hồi
buổi quên thao tác có reason và actual time; retry/đổi mentor không kéo dài hạn.
ONLINE/OFFLINE đều thủ công, Student không ghi attendance.

Prerequisites: 4.1 effective mentor/locks/version/context; Classes lifecycle;
Enrollments ACTIVE và paid CASH settlement từ Phase 2.2. Không gọi settlement bên
trong transaction attendance, không đợi Materials CRUD. Nghiệp vụ theo Flow.txt,
COURSE_FLOW, plan Phase 4 và rules NestJS; không backfill ABSENT cho legacy.

Core journey: GET roster → start → snapshot → mark/unmark → xác nhận totals →
finalize. Nhánh CASH: snapshot Order mentor confirm → commit → teaching mentor
sync roster. Nhánh recovery hiện tại chỉ SCHEDULED của Class OPEN/IN_PROGRESS.
Legacy COMPLETED/terminal Class recovery vẫn cần ở 4.3; không gọi core4.2 là đã
đáp ứng toàn bộ recovery đã duyệt.

## 2. State machine, thời gian và acceptance criteria

### 2.1 Session lifecycle

- **AC42-01:** SCHEDULED → IN_PROGRESS → COMPLETED qua command; OPEN Class
  chuyển IN_PROGRESS atomic ở lần start đầu tiên, đóng đăng ký. Start Session
  khác với API start Class. DRAFT/terminal Class không start thường.
- **AC42-02:** Mentor mở bất kỳ giờ trong ngày bắt đầu lịch theo APP_TIME_ZONE.
  Không cho buổi qua đêm; endsAt00:00 exclusive không mở thêm ngày rỗng.
  Ngoài ngày chỉ Staff recovery explicit timestamp + reason.
- **AC42-03:** Lần start đầu lưu server now hoặc Staff supplied actualStartedAt,
  startedBy, teachingMentorId, editableUntil=00:00 của ngày học+2 theo
  APP_TIME_ZONE. Timestamp UTC; giờ bấm không khẳng định giờ bắt đầu dạy thực tế.
- **AC42-04:** Mentor không inject actual start/end. Staff time không tương lai;
  finalize cần actualStartedAt < actualEndedAt <= now. Retry không reset clocks,
  không snapshot roster lại. Key mới start lại IN_PROGRESS409.
- **AC42-05:** Không worker tự ABSENT/COMPLETED vì quá endsAt/deadline; chưa chốt vẫn
  IN_PROGRESS/UNMARKED. Giờ chiếm lịch theo 4.1 chỉ interval dự kiến.
- **AC42-06:** Hoàn thành Class chặn SCHEDULED/IN_PROGRESS. Cancel orchestration
  giữ attendance/audit và hủy các buổi liên quan còn là dependency 4.4a; placement
  completion guard bổ sung khi triển khai 4.4b.

### 2.2 Roster, payment và lịch sử

- **AC42-07:** Snapshot một row cho mỗi enrollment/session cùng Class. Enrollment
  ACTIVE hiện hành, createdAt/enrolledAt<=actualStartedAt; chỉ định ACTIVE hôm nay
  không là evidence đã có mặt trong roster quá khứ. Trước start GET không tạo rows.
- **AC42-08:** CASH pending không row; pending còn hạn chỉ góp pendingPaymentCount.
  Sau paid CASH commit, sync có thể admit ACTIVE hold tồn tại trước start dù
  kích hoạt sau start. PayOS kích hoạt sau start/enrollment mới sau start không admit.
- **AC42-09:** Sync không nhận tùy ý enrollment IDs, không confirm tiền. Mentor
  sync IN_PROGRESS trong deadline; Staff sync IN_PROGRESS hoặc COMPLETED đã start,
  required reason. Row mới UNMARKED trong buổi, ABSENT sau chốt có admission audit;
  correction ABSENT→PRESENT sau chốt phải có ở 4.3.
- **AC42-10:** Composite FK enforce Enrollment–Session cùng Class; unique cặp
  enrollment/session. Rời lớp không xóa snapshot hoặc đổi nghĩa vụ lịch sử.
  RESTRICT giữ audit; guest học bù có bảng riêng tại 4.4b.

### 2.3 Mark, finalize và permission

- **AC42-11:** PUT là batch các rows thay đổi, không replace toàn roster. Tick
  PRESENT; bỏ tick UNMARKED trước chốt. Contract hiện tại cũng nhận ABSENT explicit
  trong IN_PROGRESS; FE checkbox dùng PRESENT/UNMARKED. Batch1–100, UUID v4 unique,
  mọi row thuộc snapshot đúng Session; một row sai làm cả batch thất bại.
- **AC42-12:** checkedInAt là lần đánh dấu PRESENT mới nhất, không giờ đến lớp;
  UNMARKED/ABSENT xóa timestamp. recordedBy/audit actor từ server.
- **AC42-13:** Finalize atomic UNMARKED→ABSENT, giữ PRESENT/ABSENT có sẵn;
  Session COMPLETED/actualEndedAt/completedBy/version/lifecycle audit/receipt cùng
  commit. Totals toàn roster để FE xác nhận, không totals riêng page.
- **AC42-14:** Actor ACTIVE/current role/effective assignment kiểm lại trong
  transaction trước replay. Mentor cũ mất roster/write sau reassignment; Staff
  không deadline nhưng mọi write mới cần reason. Student không được đọc cả roster.
- **AC42-15:** Mentor write khi now<editableUntil; đúng deadline hết quyền.
  4.2 mark/finalize chỉ IN_PROGRESS, Staff sync thêm COMPLETED đã start.
  Post-finalization/canceled correction bất kỳ lúc nào cho Staff và trước deadline lịch cho
  Mentor là yêu cầu 4.3, chưa được coi là implemented trong 4.2.
- **AC42-16:** GET có permissions theo actor/asOf. Đây là gợi ý UI; write kiểm
  lại server state. canStart=false ngoài ngày không cấm Staff recovery có evidence.

### 2.4 Concurrency và API

- **AC42-17:** Class → Session locks; start lấy mentor advisory lock chung4.1.
  expectedVersion chung cho assignment/sync/mark/finalize. Stale409; đồng thời
  mark/finalize hoặc sync/finalize chỉ một write thay đổi state commit.
- **AC42-18:** Mọi mutation dùng key UUID v4; actor/route/key/hash/outcome atomic.
  Cùng key/body replay outcome cũ, không audit/version/deadline mới. Key khác
  payload409. No-op mark/sync không tăng version nhưng lưu receipt.
- **AC42-19:** Không network/payment/provider/SMTP trong attendance transaction;
  không rò payment/order/email/phone/meeting URL trong roster substitute.
  DTO runtime validation, safe response, pagination ổn định/no-store/Swagger.
- **AC42-20:** Recovery đầy đủ legacy COMPLETED/terminal Class cần roster,
  payment/actual time/result evidence; thiếu chứng cứ giữ no-data. Audit reader,
  correction và phục hồi này thuộc 4.3, vẫn là acceptance dependency còn mở.

## 3. Schema và biên module

Migration `1791849600001-session-attendance.ts` chạy sau 4.1:

| Schema | Vai trò/invariant |
|---|---|
| UNIQUE Class Unit(id,class_id), Enrollment(id,class_id) | Parent keys cho composite ancestry |
| Session.class_id backfill từ Class Unit, NOT NULL | UNIQUE(id,class_id), FK(unit_id,class_id); INSERT trigger derive cho writer cũ |
| attendance_records | class/enrollment/session; enum UNMARKED/PRESENT/ABSENT; unique enrollment/session; hai composite FKs; timestamps/actor/admission source |
| attendance_audits | Append audit ADMIT/MARK/FINALIZE, actor old/new status/reason/version |
| session_lifecycle_audits | State old/new, actor/reason/version/time |
| attendance_mutation_receipts | actor/route/key unique; payload hash/outcome |

Chỉ backfill ancestry/version từ dữ liệu chắc chắn. Không suy đoán attendance,
teaching mentor hoặc actual time Session COMPLETED trước migration.
Index Session class/status, attendance session/status, audit record/time.

AttendanceModule sở hữu records/commands/roster; Classes export
SessionLifecycleService/TeachingReadService/MentorConflictService. Enrollments
export attendanceCandidates/attendanceStudents/pendingAttendanceCount và tham gia
caller EntityManager. Không Classes→Attendance vòng ngược. StudentLearning
projection consumer public provider ở4.4c, không cấp lại materials entitlement.

## 4. Kế hoạch triển khai theo bước và gate

| Bước | Deliverable | Gate trước chuyển bước |
|---|---|---|
| 4.2.1 Schema/ancestry | Migration/additive parent keys/trigger/entity/enums | Cross-Class SQL reject; legacy no-data; clean/up-down-up/refusal |
| 4.2.2 Lifecycle/clock | Public start/finalize, day/deadline policy, Class transition | Không qua đêm; hết ngày kế tiếp/midnight exact; clock sau lock; terminal reject |
| 4.2.3 Snapshot/read | Enrollment public readers, start roster, paginated view/totals/permissions | ACTIVE/cutoff; pending không row; totals toàn roster; ownership |
| 4.2.4 CASH admission | Explicit sync sau settlement commit; late paid CASH/cutoff/audit | PayOS late/new enrollment reject; no-op; Staff post-finalize reason |
| 4.2.5 Mark/finalize | Atomic batch/UNMARKED→ABSENT/actual end/audits | Partial invalid rollback; giữ PRESENT; replay; race stale version |
| 4.2.6 Staff recovery core | Historical start cho SCHEDULED + Class OPEN/IN_PROGRESS | Time<=now, reason, historical activation cutoff, start<end khi finalize |
| 4.2.7 Class guard + API handoff | complete guard, controllers/DTO/Swagger/Postman | Runtime cookies/validation; contract chỉ regular; dependency4.3/4.4 rõ |

Source chính: `attendance/services/attendance.service.ts`, domain
`attendance-window.ts`, DTO/controller/entity; `classes/services/session-lifecycle.service.ts`,
`classes.service.ts`; `enrollments/services/enrollments.service.ts`.
Không thêm generic Session PATCH status hoặc client-write ancestry.

## 5. Contract API thực tế và yêu cầu tích hợp FE

Routes prefix `/api/v1`, actor MANAGER/ADMIN/effective MENTOR, success200.
Mọi mutation required expectedVersion integer>=1 và Idempotency-Key UUID v4;
Staff required reason trim1–1000. ParseUUIDPipe sai path400; DTO/header422.

| Method + route | Body/query | Kết quả |
|---|---|---|
| GET `/class-sessions/:sessionId/attendance` | page default1/pageSize default20 max100 | session/permissions, items/total/page, totals, pendingPaymentCount |
| POST `/class-sessions/:sessionId/start` | version, optional reason/actualStartedAt Staff | WriteView, snapshot + IN_PROGRESS |
| POST `/class-sessions/:sessionId/attendance/sync-roster` | version, reason Staff | WriteView, rows admit đủ cutoff |
| PUT `/class-sessions/:sessionId/attendance` | version, records enrollmentId/status, reason Staff | WriteView, changed rows; IN_PROGRESS only |
| POST `/class-sessions/:sessionId/finalize` | version, reason/actualEndedAt Staff | WriteView, Session COMPLETED |

Item regular gồm attendanceId/enrollmentId/student{id,displayName}/status/
checkedInAt/admittedAt, entryType REGULAR, makeupPlacementId null. WriteView gồm
session/totals/changedEnrollmentIds/changedMakeupPlacementIds; guest array hiện rỗng.
Không có API Student own attendance, summary hoặc GET audit trong 4.2 hiện tại.

FE lấy version từ GET/outcome, gửi chỉ rows thay đổi, nối batches bằng version
mới; confirm totals trước finalize. Sau success/replay refetch roster/context/
schedule. Lỗi mạng retry giữ key/body;409 stale refetch rồi user xác nhận, không
tự ghi đè. Deadline/day/state closed khóa action và chuyển staff xử lý.
Tick/unmark sau chốt không được gọi theo contract4.2; đợi4.3.
API/shape/lỗi đầy đủ theo breakdown Phase4 mục15; full guest/planned shape chưa có.

## 6. Ma trận verification và coverage cần hoàn thiện

| ID | Scenario phải nghiệm thu | Test hiện có / phần thiếu |
|---|---|---|
| T42-01 | Đúng ngày mở; cấm qua đêm; hết ngày kế tiếp, exact midnight/DST | attendance-window/class-calendar specs và integration calendar boundary |
| T42-02 | Duplicate IDs/enum/batch/version/recovery ISO/reason | attendance-input.dto.spec.ts (2 cases); HTTP validation |
| T42-03 | Start atomically Class close/snapshot/cutoff/receipt/retry | phase42-attendance integration start + duplicate start race |
| T42-04 | CASH pending→confirm commit→sync; no-op; PayOS late/new hold không admit | Integration CASH/cutoff cases |
| T42-05 | Mark/unmark/foreign row whole-batch rollback, finalize once | Integration batch/finalize; HTTP start→mark→finalize→replay |
| T42-06 | Elapsed schedule không ABSENT; finalization giữ PRESENT | Integration preserve-present/no-auto-absent |
| T42-07 | Mark/finalize và sync/finalize race stale409 | Integration hai races; không đồng nghĩa settlement/finalize race đã test |
| T42-08 | Assignment đổi Mentor: revoke cả replay, giữ hạn/cash owner | Integration role/status/assignment test |
| T42-09 | Staff outside-day recovery, future/no reason/inject reject | Integration recovery; lịch sử activation cutoff |
| T42-10 | Staff admit sau chốt, withdrawal giữ history; audit failure rollback | Integration post-finalize/snapshot/fault injection |
| T42-11 | Composite ancestry reject và migration no-data/up-down-up/refusal | Integration constraint + phase42-migration.spec.ts |
| T42-12 | Totals nhiều page, empty finalize, no-op mark, Staff/terminal states | Có dedicated PostgreSQL edge cases mới |
| T42-13 | Start/mark vs assignment; checkout/settlement vs start; complete/cancel vs writes | Có PostgreSQL races mới; cancel state race không thay cho cancel orchestration4.4a |
| T42-14 | Staff recovery/sync, timestamps, whitelist/nested batch qua HTTP | Thêm2 built-app Staff journeys; kiểm full gate tại progress |
| T42-15 | COMPLETED/CANCELLED correction, legacy/terminal recovery, own Student history | Chưa implementation; 4.3/4.4c dependencies |

Khi code/test thêm chạy pnpm check + pnpm test:http trên dedicated *_test,
phân biệt pass/skip và PostgreSQL race với mock. Không chạy migrations dev/VPS
chỉ để xác nhận Markdown. Planning ban đầu không tạo runtime evidence; lượt sửa theo plan có local gates mới ở Progress4.2 mục8.

## 7. Rollout, rollback và Definition of Done

1. Review migration order4.1→4.2 cùng Phase3 và artifact/SHA; backup, dừng writers
   trong maintenance window vì ALTER/backfill/UNIQUE/FK giữ lock.
2. Migrate trước code, kiểm Session ancestry của rows cũ và INSERT trigger của
   writers cũ. Legacy rows vẫn no-data, không tự biến thành ABSENT.
3. Smoke Mentor start→tick→finalize, Staff outside-day start/end có reason,
   CASH activation→sync, old Mentor403 và wrong-Class reject.
4. Down chỉ khi tables attendance/lifecycle/receipt chưa có history; nếu có giữ
   schema/audits, rollback code tương thích. Không xóa history để ép migration.
5. Ghi local/server/browser evidence riêng. Không lấy paid CASH fixture/fake PayOS
   làm real payment evidence; không claim Stage/VPS nghiệm thu từ local gates.

Core local DoD cần AC42-01–19 trong phạm vi triển khai và meaningful regression;
T42-12–14 đã thêm dedicated tests theo ma trận; full gates xem progress.
Recovery toàn bộ AC42-20,
correction, cancel, Student view và placement guard chưa được đóng bằng4.2.
Progress phải giữ những việc này mở dù trước đây check328/HTTP30 pass.

## 8. Kết quả đối chiếu và thứ tự tiếp nối

Core có migration/API/service/tests; recovery mới một nhánh, Student/correction/
cancel/guest chưa có. [Progress 4.2](../../progress/phase%204/PHASE_4_2_PROGRESS.md)
ghi từng AC, source/test evidence, thiếu coverage và acceptance chưa đạt.
Tiếp nối: full gates4.1/4.2 → correction/recovery4.3 → leave/cancel4.4a →
guest4.4b → Student/operations4.4c → staging/VPS/browser4.5.

## 9. Revision thực thi sau đối chiếu và rule thời gian mới

Start lấy server now sau mentor lock; regression trước fix đã cho start qua
midnight sai ngày, sau fix reject và rollback. Lifecycle tính calendar deadline
bằng local date, xử lý DST/tháng/năm. Schedule add/time/open và start/recovery
không nhận overnight. Migration mới `1791849600002-calendar-attendance-deadline`
đổi editable_until của Sessions đã start, tăng version khi deadline thay đổi,
giữ actual clocks/attendance/audits và legacy no-data. Chạy migration với
APP_TIME_ZONE giống API; receipt replay cũ cần GET refetch như contract.
Down chỉ khi chưa có actual start; có history giữ calendar policy và schema.
Không sửa migrations4.1/4.2 đã có, không migrate dev/VPS trong lượt kiểm thử.
