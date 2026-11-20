# Phase 4.6 — Mentor teaching workspace

Ngày: 2026-10-22. Base kiểm tra: `1e89579`; nhánh `codex/mentor-teaching-api-gaps`.
Trạng thái: IMPLEMENTED BE/local verification; chưa deploy. Số 4.6 dành cho
feature bổ sung này; không thay thế nghiệm thu/release 4.5 của Phase 4.

Liên kết: [flow](../../api_flow/PHASE_4_6_FLOW.md),
[API contract](../../api_flow/PHASE_4_6_flow-api-breakdown.md),
[progress](../../progress/phase%204/PHASE_4_6_PROGRESS.md),
[BTVN phụ thuộc](../phase%205/PHASE_5_ASSIGNMENTS.md).

## 1. Bằng chứng và phạm vi

- `MentorClassRosterController`: list lớp/students, chưa GET class detail.
- `MentorContentContextService.assertClassAccess`: chỉ mentor chính; trong khi
  `effective-mentor.ts`/schedule/context phân biệt override và teaching mentor.
- Materials có CRUD/submit/review/preview/file access và release unit; giữ nguyên
  quyền authoring hiện hữu khi mở quyền đọc cho người dạy thay.
- Attendance có start/mark/sync/finalize; reports hiện STUDENT hoặc ADMIN/MANAGER.
  Dùng lại projection/credit, không viết công thức chuyên cần thứ hai.
- `class_unit_progress` đã có; chưa có read/write API hoặc completion policy.
- Leave preview/request/withdraw/approval và makeup đã có ở 4.4a; không viết lại.
- Chưa có teaching notes. BTVN có DBML, chưa có implementation; triển khai Phase 5.

## 2. Quyết định đề xuất cho implementation

### Quyền theo lớp và buổi

| Actor | Quyền dự kiến |
|---|---|
| Mentor chính hiện tại | Class detail, toàn timetable, roster, reports/progress; material authoring/release vẫn theo policy hiện hữu. |
| Mentor được phân công buổi | Class shell + đúng units/sessions, tài liệu đã publish thuộc unit cần dạy, roster tối thiểu của buổi; không lộ cả lớp/contact/payment hay nháp người khác. |
| Mentor dạy thay | Không tự cấp class-wide reports/progress, không sửa/release material của cả chương; có thể đọc summary phục vụ buổi của mình nếu trả scope rõ. |
| Admin/manager | Giữ management APIs; teaching notes staff read/correction có audit, không cần giả danh mentor. |
| Student | Không đọc notes nội bộ/roster/report của mentor. Student-facing summary nếu cần là feature khác. |

Session authorization dùng đúng `effectiveMentorId`: SCHEDULED dùng override hoặc
mentor chính; IN_PROGRESS/COMPLETED dùng `teachingMentorId`. Legacy null không tự
suy thành mentor đã dạy. Chuyển mentor/role/suspend phải kiểm lại mỗi request.
Class cancellation chặn mutations; reports lịch sử có thể đọc cho primary hiện tại
nhưng response ghi readonly. Completed cho phép history; không tự mở lại class.

Class list hỗ trợ `assignment=PRIMARY|SUBSTITUTE|ANY`, mặc định ANY (thay đổi hành
vi phải có regression + contract). Mỗi class chỉ một dòng, `assignmentType` có
PRIMARY/SUBSTITUTE/BOTH; hiệu lực substitute theo buổi, không theo creator.
Không nhét các buổi ngoài quyền vào nested detail hoặc meeting URLs.

### Detail và pagination

GET detail trả class shell, `accessScope`, `capabilities`, assignment metadata,
unit summaries/counts. Timetable phân trang qua GET sessions riêng; không trả cả
lớp không giới hạn. Tên course/unit lấy từ Catalog public service, không trả entity.
Meeting URL chỉ trong session context đã authorize; response mentor thay không
trả class-wide meeting URL. Empty pages vẫn authorize class trước.

### Chuyên cần và tiến độ

- Mentor class/student attendance dùng chung `ATTENDANCE_CREDIT_CTE` và formula
  có source root, guest makeup, excluded/legacy/unmarked. Rate null khi mẫu số 0.
- Progress v1 chỉ đọc dữ liệu lưu hiện có, trả `policyVersion=null` và
  `completionPolicy='UNDEFINED'` nếu chưa xác định nguồn; không gọi stored zero là
  tỷ lệ học thực tế. Thiếu row trả `trackingStatus='UNTRACKED'`, percent null.
- Tách `attendance`, `learningProgress`, `assignmentSummary` (sau Phase 5) thành
  các metric; không lấy download file, tham dự hoặc điểm bài tập làm % học.
- Completion command/weighted overall/certificate là milestone sau, chỉ triển khai
  khi có policy riêng. Không thêm command cho student tự chứng nhận hoàn thành.
- Summary assignment trước Phase 5 trả `availability='NOT_IMPLEMENTED'`, counts
  null; sau triển khai chỉ đếm bài đã publish theo entitlement, không dùng nháp.

### Teaching notes

Một note hiện hành mỗi session: `session_id UNIQUE`, `content` plain text ≤10000
ký tự, `next_steps` ≤5000, `version`, creator/updater/timestamps. Bảng audit append
only ghi người sửa, version, thời gian và lý do staff correction; không log raw
content vào application logs. DRAFT session chưa bắt đầu không ghi "đã dạy";
cho ghi từ IN_PROGRESS. Mentor đã dạy sửa tới `editableUntil`; hết hạn staff
correction có reason. GET khi chưa có note: `{note:null,version:0}`.
PUT yêu cầu expectedVersion + UUIDv4 Idempotency-Key; create expectedVersion=0,
update kiểm version dưới lock; không ghi đè thay đổi người khác. Staff dùng route
riêng; không mở RolesGuard rồi bỏ qua assignment ở service.

## 3. Các bước thực hiện và điều kiện hoàn tất

| Slice | Việc | Acceptance / kiểm chứng |
|---|---|---|
| M1 — Access | Provider Classes export typed scope; kiểm active actor, primary/effective assignment; cập nhật discovery | primary/substitute/both, revoked role/override, legacy null, empty unauthorized, cross-class IDs đều được test. |
| M2 — Workspace | GET class detail + sessions, substitute unit/material read, scoped session roster dùng endpoint attendance hiện có | Không leak buổi/link/nháp/contact/payment; primary material writes không đổi; pagination stable. |
| M3 — Reports | Mentor class summary, student history/summary; progress stored/unknown | Kết quả khớp Student/Staff credit cùng dữ liệu, makeup counted once, late enrollment, no denominator; foreign student404. |
| M4 — Notes | Migration additive, DTO/service/controllers/audit/receipt | Version races một winner, retry cùng key, actor/window revoke, completed/cancelled rules. |
| M5 — Handoff | Swagger/Postman, full API breakdown, progress và regression gates | pnpm lint/type-check/test/build + compiled HTTP, PG/MinIO khi test material; deployment evidence ghi riêng. |

M1 → M2 → M3/M4 → M5. Không sửa FE; bàn giao contract cho nhóm FE. Không chạy
production migrations trong lượt planning/implementation; migration mới dùng
timestamp duy nhất sau catalog hiện tại, không sửa migration deployed.

## 4. Kiến trúc và regression

Classes sở hữu access/class detail/session scope, export typed provider; Attendance
sở hữu projections/reports; Enrollments sở hữu stored progress read; TeachingOperations
sở hữu notes/audits; Materials chỉ nhận scope/capability và giữ publication policy.
Không vòng import, không đọc private repository xuyên module để né authorization.
Transactions/lock order theo writer hiện có (actor/Class/Session) phải rà lại trước
implementation, notes row lock sau session; không gọi storage/network trong DB tx.

Test bắt buộc thêm: substitute được chuẩn bị tài liệu nhưng không đọc own-draft của
mentor chính; reassignment giữa signed URL issue/revalidation; primary đã bị override
không sửa note của người dạy thay; session cancelled trước start không có teaching
credit; pagination không count resource ngoài quyền; guest learner không cấp full
class access. Audit notes nội bộ không xuất cho student.

## 5. Giới hạn và checkpoint

Các route/field trong API proposal là đề xuất có thể điều chỉnh khi implement DTO.
Không coi plan là thay đổi quyền đã triển khai. Completion policy, student notes
và weighted gradebook chưa chốt, được tách khỏi critical path M1–M4.
Phần BTVN dùng plan Phase 5 và có migration/storage contract riêng.

## 2026-10-22 — Implementation decisions (M1–M5)

BE đã implement scope/workspace/reports/stored-progress/notes và regression suites.
API proposal được thay bằng contract thực tế trong breakdown4.6. Detail dùng
counts + routes units/sessions phân trang, không inline unit list; mentor unit
detail không trả nested timetable/meeting URLs. Progress class page là per-enrollment
tracking counts, student page là enrollment×unit rows. Student attendance summary
khai báo STUDENT_CLASS_HISTORY, class summary giữ per-enrollment.

TeachingOperations dùng SQL persistence cho notes/audit/receipt giống leave hiện
hữu, additive migration1792627200000 (không entity TypeORM mới). Không completion
policy/assignment implementation. GET attendance-candidates thêm để chuẩn bị roster
trước start mà không tạo attendance snapshots. API query schemas tách sessions và
progress để không nhận date filters bị bỏ qua. Notes replay kiểm lại cả window/state.

Nhánh workspace có thay đổi bulk attendance từ công việc song song; giữ nguyên,
khởi tạo changed=[] để nhánh bulk no-op không lỗi definite assignment. Không coi
bulk attendance là scope4.6 hoặc thay thế contract/report formula của phase khác.

Không sửa FE/migrations deployed, không production migration/deploy. Evidence cuối
của local gates, hạ tầng test và rollout xem progress4.6. Không suy local thành live.
