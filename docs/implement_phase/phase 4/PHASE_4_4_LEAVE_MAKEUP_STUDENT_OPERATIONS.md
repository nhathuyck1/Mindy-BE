# Phase 4.4 — Nghỉ có duyệt, học bù và lịch/điểm danh học viên

Ngày lập: **2026-10-15**. Trạng thái: **IN PROGRESS — Session operations 4.4a và core 4.4b đã code; leave/approved intervals và 4.4c còn thiếu**.
Phạm vi đã chốt trong chat: toàn bộ 4.4a–c, thực hiện lần lượt a → b → c.
Lượt lập plan ban đầu chỉ lưu tài liệu. Lượt bắt đầu code tiếp theo triển khai
schedule/cancel/makeups và batch Class cancellation; xem
[progress 4.4](../../progress/phase%204/PHASE_4_4_PROGRESS.md),
[flow](../../api_flow/PHASE_4_4_FLOW.md) và
[API đã có](../../api_flow/PHASE_4_4_flow-api-breakdown.md).

[Plan Phase 4](PHASE_4_ATTENDANCE_OPERATIONS.md) ·
[Flow Phase 4](../../api_flow/PHASE_4_FLOW.md) ·
[API breakdown](../../api_flow/PHASE_4_flow-api-breakdown.md) ·
[Progress Phase 4](../../progress/phase%204/PHASE_4_PROGRESS.md).

## 1. Mục tiêu, baseline và phạm vi

Triển khai BE theo thứ tự **4.4a → 4.4b → 4.4c**. Mỗi phần là một vertical
slice hoàn chỉnh: migration → nghiệp vụ → API → kiểm thử; không tạo toàn bộ
schema rồi trì hoãn authorization và API sang cuối phase.

Nguồn nghiệp vụ là plan Phase 4 và API breakdown liên kết ở trên, cùng
`document/Flow.txt` và `document/COURSE_FLOW.md`. Giữ các quyết định đã duyệt:
nghỉ báo trước hai ngày lịch, Manager/Admin duyệt, không overnight, deadline
điểm danh đến hết ngày học kế tiếp và không gửi thông báo tự động trong Phase 4.

Baseline đối chiếu source:

- 4.1–4.3 đã có assignment/effective mentor, lifecycle, regular roster,
  correction, audit và evidence recovery.
- Class cancel hiện chưa hủy Session batch; sức chứa chưa tính guest học bù;
  lịch Student hiện lấy mentor chủ nhiệm thay vì mentor hiệu lực của Session.
- Theo [backlog ngày 15/10](../../progress/TASK_SUMMARY_BACKLOG_2026-10-15.md),
  user đã xác nhận 4.3 lên server và thử Postman hoàn tất. Đây là xác nhận của
  user, không phải evidence deployment mới do lượt lập plan này thực hiện.

Chỉ triển khai BE và tài liệu tích hợp. FE là nguồn tham khảo chỉ đọc.
Email/thông báo tự động, chat, chứng chỉ và xử lý tài chính khi hủy lớp thuộc
phần khác; không mở rộng quyền Manager sang toàn bộ Admin APIs.

## 2. 4.4a — Nghỉ có duyệt và lịch bù

### Dữ liệu và tổ chức nghiệp vụ

- Thêm request nghỉ, từng buổi bị ảnh hưởng, khoảng nghỉ đã duyệt, conflict
  học viên và audit bằng migration mới. Không sửa migration đã chạy.
- Request có trạng thái PENDING/APPROVED/REJECTED/WITHDRAWN/EXPIRED,
  version, reviewer, submittedAt/expiresAt và snapshots của các source.
- Thêm `makeupForSessionId` và `makeupRootSessionId` vào Session; constraint
  bảo vệ cùng Class/Course Unit, chống vòng và chống hai replacement hiệu lực
  trong cùng chuỗi. Hủy rồi tạo lại vẫn giữ ancestry và audit.
- `TeachingOperationsModule` điều phối duyệt nghỉ và đổi lịch; Classes sở hữu
  lịch/lifecycle. Provider khoảng nghỉ độc lập cung cấp approved intervals
  cho candidate queries và mọi writer lịch.

### Quy trình nghỉ

- Form gồm fromDate/toDate inclusive, tối đa 93 ngày, mức nghỉ và lý do.
  MORNING [00:00,12:00), AFTERNOON [12:00,18:00), EVENING [18:00,24:00),
  FULL_DAY [00:00,24:00), tính theo APP_TIME_ZONE.
- Preview lấy đầy đủ Session SCHEDULED thuộc Class OPEN/IN_PROGRESS mà mentor
  đang được phân công hiệu lực và giao khoảng nghỉ; deduplicate Session.
  Không có buổi phù hợp thì preview rỗng và không tạo request.
- Gửi trước ít nhất hai ngày lịch, dựa ngày học sớm nhất của affected set.
  Thứ Tư 23:00 gửi cho buổi thứ Sáu vẫn hợp lệ; thứ Năm không hợp lệ.
- PENDING chứa đủ lịch bù và phiên bản source; chưa đổi lịch hoặc giữ slot.
  Mentor chỉ xem/rút own request; Manager/Admin xem, duyệt hoặc từ chối.
- Duyệt phải trước startsAt source sớm nhất. GET chỉ hiển thị trạng thái hết
  hạn hiệu lực, không ghi DB; command persist EXPIRED và audit khi xử lý
  request quá hạn. Không tự approve.
- Khi source/version/phân công/tập buổi thay đổi, trả
  `409 LEAVE_REQUEST_STALE`; không commit một phần, giữ PENDING để lập lại
  request hoặc rút theo workflow. Không tự thêm/bỏ source khỏi request.

### Chọn và áp dụng lịch bù

- Nghỉ sáng/chiều/tối: gợi ý slot mỗi 15 phút hoặc nhập tay, giữ thời lượng,
  toàn buổi nằm trong targetPeriod. Trùng mentor, Class hoặc học viên đều
  chặn; Manager không override student conflict trong trường hợp này.
- Kiểm lịch học viên ACTIVE, CASH pending còn hạn và guest ASSIGNED.
  PayOS pending không có timetable, nhưng vẫn giữ sức chứa theo hold policy.
  GET gợi ý không giữ chỗ; submit/approve đều kiểm lại cùng validator.
- FULL_DAY ánh xạ ngày gốc → ngày bù, giữ giờ. Trùng mentor/Class vẫn chặn;
  trùng học viên được lưu, hiển thị cho người có quyền và yêu cầu Manager
  `acknowledgeStudentConflicts=true` trước duyệt.
- Một transaction duyệt gồm APPROVED, hủy source, tạo replacement, ghi khoảng
  nghỉ, conflict, audit và receipt; tự gia hạn Class.endDate khi cần. Replacement
  giữ Class Unit, thời lượng, context phòng/meeting và mentor xin nghỉ là người
  dạy bù, không ngầm chuyển sang primary mentor mới.
- Không tạo buổi qua đêm, buổi quá khứ hoặc trước Class.startDate. Không copy
  attendance/ABSENT từ source; replacement chỉ snapshot roster khi start.
- Source có guest/placement chưa xử lý phải trả conflict trước khi đổi lịch
  hoặc duyệt nghỉ; quản lý xử lý placement trước, không âm thầm bỏ học viên.

### API và lifecycle

Triển khai nguyên nhóm API mục 10–11 của API breakdown, prefix `/api/v1`:

- Management Session: PATCH schedule; POST cancel; POST makeups.
- Mentor leave requests: POST preview/makeup-slots/create; GET list/detail;
  POST withdraw.
- Management mentor leave requests: GET list/detail; POST approve/reject.

Đồng thời tích hợp vào hành vi hiện hữu:

- Khoảng nghỉ APPROVED chặn candidate/add/bulk/reschedule/open và mọi command
  đổi mentor lớp/buổi; PENDING không giữ slot. DRAFT không giữ lịch, kiểm lại
  trước open.
- Management reschedule chỉ SCHEDULED, không thay clocks/deadline của buổi đã
  start; API giữ ngày Phase 2.3 vẫn giữ semantics cũ và dùng checker chung.
- Hủy Session chỉ SCHEDULED/IN_PROGRESS, bắt buộc reason; giữ attendance và
  audit, loại khỏi tỷ lệ. Không đổi COMPLETED thành CANCELLED.
- Hủy Class phải hủy các Session SCHEDULED/IN_PROGRESS trong cùng transaction,
  giữ lịch sử. Đây không phải triển khai giải phóng hold/refund/payment
  orchestration của backlog commerce.

## 3. 4.4b — Học bù ở lớp khác

Cập nhật implementation 15/10: queue/candidates/placement/cancel/own, capacity
checkout, guest attendance/audits, context và completion guards đã có source;
contract thực tế [mục 6–12 API4.4](../../api_flow/PHASE_4_4_flow-api-breakdown.md).
Schema owned Attendance dùng SQL queries có kiểu để projection union nhiều bảng,
không thêm entity/repository chỉ để bọc raw queries; giữ FK regular không đổi.
Module đọc cấp thấp không phụ thuộc modules nghiệp vụ; cancellation projection
atomic bằng DB trigger tránh Classes → Attendance cycle. Không CQRS/dependency mới.
User yêu cầu tiếp b sau xác nhận a; checkout hiện tại chưa có leave workflow nên
approved-leave availability vẫn là dependency thiếu, không tự ghi đã hoàn tất a.

### Placement và kiểm tra điều kiện

- Thêm placement, guest attendance và audit riêng. Không bỏ invariant cùng
  Class của attendance_records thường để nhận enrollment ngoại lớp.
- Placement có version và trạng thái ASSIGNED/COMPLETED/CANCELLED/
  NEEDS_REASSIGNMENT; unique hiệu lực theo nghĩa vụ source và student/target.
  Ancestry/Course Unit equality được bảo vệ ở DB và service.
- Manager chọn target khác Class, cùng Course Unit, xác nhận nội dung tương
  đương bằng `contentMatchConfirmed=true` và nhập reason. Cùng Course Unit
  không tự chứng minh hai buổi dạy cùng nội dung.
- Enrollment gốc phải ACTIVE. Target phải SCHEDULED, startsAt > now, thuộc
  Class OPEN/IN_PROGRESS, không trùng lịch, còn sức chứa và student chưa có
  enrollment hiệu lực ở lớp nhận.
- Sức chứa target gồm enrollment ACTIVE, hold chưa hết hạn CASH/PayOS và
  guest đã xếp. Checkout lớp nhận cũng tính guest reservation ở từng Session
  để một enrollment mới không bán vượt sức chứa của bất kỳ buổi nhận bù nào.
- GET candidates không giữ suất; POST kiểm lại dưới locks. Không tạo order,
  payment hoặc enrollment ở lớp nhận.

### Attendance và quyền truy cập

- Mở rộng roster với `entryType: REGULAR | MAKEUP`; guest được nhận diện bằng
  makeupPlacementId. Giữ payload regular hiện hữu, bổ sung guest records riêng
  trong PUT attendance để không phá contract records/enrollmentId hiện có.
- Target start snapshot guest đủ điều kiện. Mark/finalize/correction dùng chung
  version Session, transaction và audit; không ghi guest vào bảng attendance
  thường. Totals và pagination tính trên cả regular và guest.
- Mentor target được ghi, mentor source không có quyền ghi target. Quyền sửa
  vẫn hết vào 00:00 ngày học + 2 theo APP_TIME_ZONE; không reset khi đổi mentor
  hoặc placement. Staff correction bắt buộc reason như baseline 4.3.
- Student chỉ đọc context/meeting của đúng target Session qua placement còn
  quyền và enrollment gốc hợp lệ. Không mở cả lớp nhận, classmates, materials
  của lớp nhận hoặc quyền thu tiền; materials theo policy lớp gốc/Phase 3.
- Target bị hủy: placement chuyển NEEDS_REASSIGNMENT, giữ row/audit và đưa lại
  vào queue, không tự ghi ABSENT. Command hủy placement có reason ngừng credit
  guest và quay về kết quả source nếu source đã chốt; guest snapshot vẫn giữ.
- Class completion chặn placement ASSIGNED/NEEDS_REASSIGNMENT chưa giải quyết
  của lớp gốc, ngoài guard SCHEDULED/IN_PROGRESS hiện có.

### API

Triển khai nhóm mục 12 của breakdown: conflict queue, makeup candidates, tạo
placement, hủy placement và own placement list. Mở rộng attendance/context
hiện hữu, kiểm ownership/current entitlement trước mọi response hoặc replay.

## 4. 4.4c — Lịch Student, tổng hợp và hàng chờ vận hành

- Mở rộng GET `/me/schedule` additive: mentor hiệu lực từng buổi, assignmentType,
  attendanceStatus/applicability/excluded và liên kết buổi bù. Legacy chưa biết
  người dạy trả nullable, không giả bằng primary hiện tại.
- Guest event dùng `accessMode: SESSION_MAKEUP`, giữ source enrollment và
  physical target Class/Session. Filter classId theo lớp của event, gộp/loại
  trùng regular + guest rồi mới tính total/phân trang; giữ validation/filter/
  envelope lịch Phase 2.3.
- FULL/CASH_PREVIEW và entitlement cũ giữ nguyên; CASH preview chỉ trả
  `attendanceStatus=null`, applicability PAYMENT_PENDING, không meeting URL.
- Thêm GET own Class attendance history/summary và management Class summary
  theo mục 8–9 của breakdown. Người từng thuộc lớp có thể đọc own historical
  metadata sau COMPLETED/CANCELLED enrollment; không mở lại nội dung lớp.
- Thêm incomplete queue cho OVERDUE_NOT_STARTED và STARTED_NOT_FINALIZED.
  Incomplete/conflict/makeup queues mặc định toàn bộ backlog, không mặc định
  tuần hiện tại. Lists phân trang ổn định, bounded range và tránh N+1.
- Dùng một phép tính chung cho Student/management: present, absent, unmarked,
  excluded, makeupPending, finalizedEligibleCount; rate = present /
  finalizedEligibleCount × 100, làm tròn hai chữ số; mẫu số 0 trả null.
- Chỉ tính nghĩa vụ đã chốt hợp lệ. Buổi hủy, legacy thiếu dữ liệu, chưa chốt
  và makeup đang chờ bị loại khỏi mẫu số. Guest đã chốt thay source đúng một
  lần, không rewrite attendance vật lý và không tăng tỷ lệ lớp nhận. Chuỗi
  replacement chỉ tính buổi hiệu lực, không cộng source đã hủy.

**Quyết định bổ sung user đã chốt ngày 15/10/2026:** đăng ký/thanh toán phát
sinh sau duyệt lịch bù vẫn tiếp tục theo luồng hiện tại. Nếu gây trùng với lịch
bù, ghi conflict trong cùng transaction để Manager xử lý; không từ chối đăng
ký/thanh toán chỉ vì trùng lịch. Không mở rộng thành hàng chờ cho mọi xung đột
đăng ký không liên quan lịch bù trong phase này. CASH pending chỉ preview/conflict,
phải ACTIVE trước khi tạo placement chính thức.

## 5. Ràng buộc kỹ thuật, kiểm thử và bàn giao

### Transaction, module boundary và tương thích

- Mutation mới dùng expectedVersion, Idempotency-Key UUID v4, audit và receipt
  atomic. Replay kiểm quyền hiện hành, không nhân bản replacement/placement/
  audit hoặc dời clock. Payload khác cùng key trả 409 IDEMPOTENCY_KEY_REUSED.
- Chuẩn hóa thứ tự khóa lịch: các Class theo UUID → Session theo UUID → mentor
  → student, mỗi tập được sort/deduplicate. Request lock trước aggregate locks
  cho decision commands; revalidate source/target sau khi có đủ locks.
- Checkout/activation/approval/placement dùng chung khóa student khi thay đổi
  lịch/conflict; giữ thứ tự cart/Class/order/payment hiện hữu, đặt student lock
  trước mutation liên quan và không có đường giữ student rồi quay lại lấy
  Class lock. Tập Class/Session thay đổi sau discovery phải retry từ đầu.
- Tách provider đọc lịch/reservation/placement chưa giải quyết thành module đọc
  cấp thấp, không phụ thuộc Classes/Payments/AttendanceModule; consumer gọi
  public provider. Attendance giữ ownership placements/guest; Classes không
  import ngược AttendanceModule hoặc StudentLearningModule. Đây là quyết định
  kỹ thuật để tránh vòng Classes → Attendance → Payments → Classes, không đổi
  nghiệp vụ hoặc chuyển quyền sở hữu enrollment/payment.
- Giữ schema lịch sử bằng RESTRICT, không cascade xóa audit/attendance. Migration
  không backfill ABSENT cho legacy và không tự suy ra mentor lịch sử.
- Giữ convention Nest application services, NodeNext `.js`, DTO/guards/error
  envelope hiện có. Không thêm CQRS hoặc dependency mới khi chưa cần.
- Không gọi network/payment settlement trong transaction nghỉ; không phát
  email/notification/chat. Không đổi CASH owner theo snapshot Order hoặc quyền
  materials Phase 3.

### Kiểm thử bắt buộc

- Notice hai ngày lịch, period boundaries, range 93 ngày, no affected sessions,
  future/no overnight, source/version thay đổi, own/staff permissions.
- Approve/reject/withdraw/expire và replay; approval rollback toàn batch, gia
  hạn endDate atomic, replacement chain không phân nhánh hoặc đổi ancestry.
- Candidate và mọi schedule writer tôn trọng APPROVED leave; partial-day hard
  conflicts và FULL_DAY acknowledgement/queue hoạt động đúng.
- PostgreSQL races: approval với assignment/start/checkout/activation;
  placement với suất cuối/checkout/target start/cancel; không oversell, commit
  một phần hoặc deadlock. Trùng mới sau settlement phải tạo queue đúng lựa chọn.
- Guest sai Unit, thiếu xác nhận nội dung, pending payment, trùng lịch hoặc đã
  enrolled target bị chặn; guessed IDs và quyền context hết hiệu lực bị chặn.
- Guest start/mark/finalize/correction giữ deadline, atomicity và totals;
  target cancel/reassignment/cancel placement giữ lịch sử, không tự ABSENT.
- Summary source/guest/root chain không đếm đôi; pending makeup, canceled,
  legacy, rời lớp, rate=null và range/pagination được kiểm chứng.
- Migration clean/up-down-up; rollback từ chối khi có lịch sử không thể xóa
  an toàn. Không migrate dev/VPS trong test, dùng DB riêng có suffix `_test`.
- Mỗi slice chạy focused PostgreSQL/HTTP; trước bàn giao chạy `pnpm check` và
  `pnpm test:http`, ghi rõ skip nếu có, không coi skipped DB suites là pass.

### Tài liệu và nghiệm thu

- File này là plan riêng 4.4. Khi implementation bắt đầu, thêm progress riêng
  4.4 và flow/API breakdown 4.4 theo quy định repo; cập nhật docs tổng, Swagger,
  Postman và contract FE cùng revision. Không sửa FE trong repo này.
- Giữ API mục 8–12 của breakdown tổng là PLANNED tới khi có controller/DTO/
  service/test evidence; phân biệt local checks, migration, server và nghiệm thu.
- 4.4 hoàn tất khi chạy được: gửi nghỉ → duyệt → replacement/gia hạn → xử lý
  trùng → học bù lớp khác → target chốt guest → Student thấy lịch và tỷ lệ đúng.
- FE/browser/VPS integration acceptance toàn Phase 4 tiếp tục ở 4.5; không
  coi local tests là bằng chứng deployment hoặc giao dịch thanh toán thật.

Kiểm chứng lượt lưu plan: chỉ kiểm Markdown, relative links và diff; không chạy
runtime tests, migration hoặc deployment, không đánh dấu chức năng 4.4 đã làm.
