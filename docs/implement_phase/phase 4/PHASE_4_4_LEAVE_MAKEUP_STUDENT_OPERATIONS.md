# Phase 4.4 — Nghỉ có duyệt, học bù và lịch/điểm danh học viên

**Implementation17/10/2026:** workflow request/preview/slots/own/staff reads/
withdraw/reject/approve, approved intervals và schedule/candidate integration đã
có backend. Không còn giữ leave như source gap của4.4; các ghi chép gap bên dưới
là lịch sử. Contract thực tế tại [API4.4 mục19](../../api_flow/PHASE_4_4_flow-api-breakdown.md#19-mentor-leave-requests--implementation-2026-10-17).
SQL typed persistence theo pattern4.4b; Classes cung cấp transaction participants
cancel/replace/finish batch, TeachingOperations điều phối, availability độc lập.
93 ngày/500 sources, list/detail phân trang, slot SQL theo15 phút không N+1;
expiry persist bằng command, không thêm worker. Không email/notification/FE.
Migration mới1792195200000, không sửa lịch sử; server/browser/release ở4.5 riêng.

Ngày lập: **2026-10-15**. Cập nhật **2026-10-16**: **4.4b hoàn tất theo user; 4.4c hoàn tất backend/local gates — check456/456,HTTP48/48,0 skip**.
Session operations 4.4a có source; workflow leave/approved intervals vẫn là gap
được ghi riêng. Xác nhận hoàn tất 4.4b không đồng nghĩa đã nghiệm thu toàn 4.4.
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

**Revision implementation 2026-10-16.** Schedule extension và4 GET đã có source,
20/20 focused PG và3/3 compiled HTTP4.4c pass. Full regression ghi tại Progress4.4.
Thiết kế/gates phía dưới giữ traceability; trạng thái implemented xem mục4.7.
Dùng dữ liệu 4.2–4.4b hiện có; không chờ workflow leave
để làm read projections. Contract dự kiến tại
[API4.4 mục13–18](../../api_flow/PHASE_4_4_flow-api-breakdown.md#13-44c--quy-ước-và-contract-chung).

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

### 4.1. Source baseline và khoảng thiếu đã kiểm tra

Bảng này ghi baseline lúc planning; các gap projection đã được xử lý ở mục4.7.

| Nguồn hiện hành | Tái sử dụng / phần cần thêm |
|---|---|
| `student-learning/services/my-schedule.service.ts` | Đã có range overlap, current ACTIVE/live CASH, count/page trong read snapshot; hiện chỉ join `class.mentorId`, chưa union guest/attendance |
| `student-learning/dtos/my-schedule-query.dto.ts` | Giữ from/to bắt buộc, Z/offset, positive range tối đa31 ngày, page1/pageSize100/max100, includeCancelled=true, classId UUIDv4 |
| `student-learning/services/read-snapshot.ts` | REPEATABLE READ + READ ONLY, count/page cùng snapshot; provider mới phải nhận EntityManager để dùng cùng transaction |
| `classes/domain/effective-mentor.ts`, `TeachingReadService.sessionViews` | SCHEDULED dùng override hoặc primary; các state khác dùng teaching snapshot nullable. Mapping batch có ancestry/clocks/version, không trả meeting URL |
| `attendance_records`, recovery audits/items4.3 | Regular evidence theo enrollment/session, admissionSource; recovery có thể chỉ phục hồi một phần roster. Thiếu row không đồng nghĩa ABSENT |
| `MakeupPlacementService`, `GuestAttendanceService` | Own placements, guest physical status và finalize/requeue/cancel đã có; creditStatus FINALIZED của placement chưa là denominator lớp |
| `EnrollmentsService.attendanceHistory` | Đọc enrollment lịch sử qua provider; chưa có paginated own/all Class history scope. Không dùng listForClass hiện loại CANCELLED để suy ra toàn lịch sử |
| `AttendanceModule`, `StudentLearningModule` | Chưa có shared credit reader, own history/summary hoặc management summary/incomplete controllers. Attendance chỉ export AttendanceService hiện tại |
| Tests Phase2.3/4.1–4.4b | Là regression baseline, chưa chứng minh 4.4c. Full gates436/45 là evidence lịch sử15/10 |

### 4.2. Quy tắc projection và credit

Các invariant phía trên kế thừa plan đã có. Các chi tiết normalization/range
dưới đây là **lựa chọn thiết kế đề xuất cho implementation**, phải khóa bằng
fixtures ở bước C1; không ghi thành quyết định nghiệp vụ mới đã được user duyệt.

1. Tách **physical result** (`attendanceStatus` từ row của đúng buổi) khỏi
   **credited result** (`creditedAttendanceStatus`, nullable PRESENT/ABSENT).
   Có PRESENT khi chưa finalize vẫn hiển thị physical, chưa vào present/denominator.
   Giữ physical source kể cả guest thay credit; không rewrite row/audit.
2. Nghĩa vụ tính theo `(enrollmentId, rootSessionId)`, root = makeupRootSessionId
   hoặc own ID. Resolve toàn chain trước khi filter ngày; source/replacements
   vẫn là các dòng lịch sử, chỉ một nghĩa vụ có thể mang credit. Buổi hiệu lực
   cuối chain là mốc range của nghĩa vụ (overlap `[from,to)`); guest chuyển credit
   về mốc source này, không dùng ngày target để âm thầm chuyển kỳ báo cáo.
3. Placement ASSIGNED/NEEDS_REASSIGNMENT hoặc conflict OPEN/MAKEUP_ASSIGNED chưa
   giải quyết => MAKEUP_PENDING; một nghĩa vụ tăng makeupPending một lần và
   loại khỏi denominator. Cancel placement giữ physical history, thu hồi guest
   credit; nếu conflict vẫn OPEN thì vẫn pending, không tự lấy PRESENT cũ thế lại.
4. Placement COMPLETED chỉ có credit khi target COMPLETED, guest snapshot đúng
   placement/enrollment/root và status PRESENT/ABSENT. Target cancel/requeue
   hoặc placement CANCELLED không còn credit. Chỉ cộng vào source enrollment;
   lớp nhận không có thêm enrollment/count vì guest. Correction hợp lệ của
   guest COMPLETED đổi credit lần đọc tiếp; correction sau cancel không hồi credit.
5. Không có pending/guest credit: chỉ regular row PRESENT/ABSENT trên Session
   COMPLETED và có evidence hợp lệ mới vào denominator. Snapshot/recovery đã
   persist là nguồn eligibility lịch sử; không loại kết quả chỉ vì enrollment
   nay COMPLETED/CANCELLED. Không tái dựng eligibility bằng ngày ACTIVE hiện tại.
6. SCHEDULED chưa bắt đầu => NOT_STARTED/null; IN_PROGRESS có row => ELIGIBLE
   nhưng chưa credit. COMPLETED thiếu own row: LEGACY_NO_DATA nếu thiếu evidence
   roster/eligibility; NOT_ELIGIBLE khi chứng minh học viên không thuộc cutoff.
   Recovery partial chỉ count rows đã có evidence; không tự ABSENT cho omissions.
7. CASH_PREVIEW luôn PAYMENT_PENDING/null, không lộ physical/credited result
   trong schedule. Hủy Session loại credit dù vẫn giữ physical status lịch sử;
   không có reason enum mới cho cancellation: dùng sessionStatus + excluded=true.
   enrollment chưa từng ACTIVE, không snapshot/payment evidence, không tự thành
   absent. Enrollment terminal vẫn đọc own metadata, không mở quyền Class/materials.
8. Summary categories: present/absent là credited finalized; unmarked là nghĩa
   vụ có own UNMARKED snapshot chưa chốt; makeupPending là nghĩa vụ chờ bù;
   excluded là nghĩa vụ không credit và không thuộc hai nhóm pending/unmarked
   (chưa start, không đủ điều kiện, canceled không successor, legacy no-data).
   Các nhóm loại trừ nhau trên tập nghĩa vụ, không lấy tổng số physical history
   rows làm tổng nhóm. `finalizedEligibleCount=present+absent`,
   `rate=round(present/finalizedEligibleCount*100,2)`, denominator0 => null.
9. Student Class summary gộp own enrollment histories; management trả từng
   enrollment, kể cả canceled có history, giữ enrollmentId để đối chiếu. Kiểm
   chứng canceled→re-enroll trước khi khóa C1: hai enrollment cùng student/root
   không được tạo hai credit. Nếu fixtures chứng minh có thể xảy ra, phải xác
   định một credit owner chung trong reader và bổ sung contract/test trước C2;
   không tự SUM từng enrollment rồi gọi là count-once.
10. History trả physical sessions theo own Class, kèm root/placement/credit link;
    không thêm target như một nghĩa vụ lớp nhận. Schedule trả physical regular
    và own guest target; deduplicate theo student/physical session trước count/page,
    regular hiện có ưu tiên khi target đồng thời có current enrollment hợp lệ.
    Thuộc tính source vẫn giữ ở history/own placements để tra credit.

`attendanceApplicability` dùng enum đã dự kiến: ELIGIBLE, NOT_STARTED,
NOT_ELIGIBLE, PAYMENT_PENDING, LEGACY_NO_DATA, MAKEUP_PENDING, MAKEUP_CREDITED.
`attendanceExcluded`/history `excluded` nghĩa là dòng không đóng góp credit
hiện tại; không phải nhãn Vắng. Ví dụ SCHEDULED có excluded=true vì chưa chốt;
đây là làm rõ semantics, thay ví dụ excluded=false trong breakdown tổng cũ.
Một canceled source ancestor luôn excluded; credit gắn source hiệu lực của chain.

### 4.3. Ownership, module và query

- Attendance sở hữu `AttendanceProjectionService` dự kiến và pure credit reducer
  trong domain; đọc regular/guest/placement/conflict do module này sở hữu.
  Export provider typed, nhận EntityManager + principal/scope + asOf. Không gọi
  paginated own-placement API trong loop để tính credit.
- StudentLearning import AttendanceModule và ClassesModule để compose schedule/
  history/summary; Classes không import ngược Attendance/StudentLearning.
  Public Classes/Enrollments/Users providers đọc metadata/ownership theo batch;
  chỉ mở rộng method có nhu cầu thật, không wrapper một dòng hoặc vòng module.
  Metadata SQL read model hiện có của MySchedule giữ trong slice; việc thêm
  bảng Attendance vào query phải qua public projection provider.
- Management summary/incomplete đặt controller trong Attendance, dùng Classes
  public reader và cùng reducer; không tái tính công thức tại controller.
- Mỗi response có một asOf và read-only REPEATABLE READ transaction. Filter
  ownership/status/range → normalize/deduplicate → count → stable page, cùng
  snapshot. Batch metadata cho page; không query từng student/session/placement.
  Summary phải aggregate toàn tập hợp lệ, không summary riêng page history.
- History ownership: có ít nhất một enrollment own của đúng Class, kể cả
  terminal; không cần current entitlement. Guest-only không có source enrollment
  trong lớp nhận thì không được gọi Class history/summary của lớp nhận.
  Current schedule class filter được phép nếu có current regular access **hoặc**
  own guest hợp lệ của physical receiving Class; không mở full Class detail.
- Query histories/summary optional range phải có cả cặp, Z/offset, >0 và <=93
  ngày; bỏ range là toàn Class history. Incomplete bỏ range là toàn backlog,
  chỉ SCHEDULED/IN_PROGRESS có endsAt<=asOf; không lấy DRAFT/terminal Class hoặc
  COMPLETED/CANCELLED Session. Issue và deadlineExpired không suy ra quyền ghi.
- Đo EXPLAIN (ANALYZE, BUFFERS) trên fixtures nhiều Class/enrollment/chain và
  ghi query count. Mặc định read-only, không schema mới. Chỉ thêm migration index
  additive nếu query plan chứng minh thiếu index; không sửa migrations đã chạy,
  không attendance/mentor backfill hoặc materialized summary cần worker mới.

### 4.4. Acceptance criteria 4.4c

| ID | Điều kiện nghiệm thu |
|---|---|
| AC44C-01 | Schedule giữ from/to31 ngày, overlap, page/filter/envelope và local clock fields Phase2.3 |
| AC44C-02 | Mentor scheduled override/primary; started/terminal dùng snapshot nullable, không giả primary cho legacy |
| AC44C-03 | Schedule physical status khác credited status; NOT_STARTED/UNMARKED/ABSENT không bị nhập một |
| AC44C-04 | CASH preview còn hạn chỉ PAYMENT_PENDING/null; PayOS pending/expired hold không vào lịch |
| AC44C-05 | Own guest hợp lệ xuất hiện ở physical target, SESSION_MAKEUP chỉ mở context đúng buổi |
| AC44C-06 | classId target guest-only hoạt động; union dedup/filter trước total/page; stable tie sort |
| AC44C-07 | Guest mất entitlement/cancel bị loại khỏi current schedule; own history không cấp lại nội dung |
| AC44C-08 | Own history/summary kiểm ownership cả terminal; guessed IDs/guest-only receiving Class bị chặn |
| AC44C-09 | History giữ physical canceled/ancestry, không rewrite attendance/clock/mentor và không lộ người khác |
| AC44C-10 | Một reducer và range basis cho Student/management; summary toàn scope độc lập history page |
| AC44C-11 | present+absent=denominator; rate2 chữ số, denominator0=null, UNMARKED không thành absent |
| AC44C-12 | Replacement nhiều tầng chỉ một obligation/credit; resolve chain trước range và không count canceled ancestors |
| AC44C-13 | OPEN conflict/ASSIGNED/reassignment pending loại denominator, không count nhiều placement history |
| AC44C-14 | COMPLETED guest đúng snapshot ghi credit source một lần, không tăng lớp nhận |
| AC44C-15 | Guest correction đổi source credit; target cancel/cancel placement revoke, physical history vẫn giữ |
| AC44C-16 | Legacy/partial recovery/late CASH/late PayOS/withdrawal không phát sinh ABSENT giả |
| AC44C-17 | Re-enroll không hai credit cùng student/root; Student và management đối chiếu đúng credit owner |
| AC44C-18 | Management summary phân trang enrollment gồm historical rows, stable displayName/id; không N+1 |
| AC44C-19 | Incomplete mặc định toàn backlog, hai issue chính xác, equality endsAt và deadline/null có test |
| AC44C-20 | Range cặp/offset/limit93 ngày, page/max100, UUID/unknown/null/enum sai bị validate đúng |
| AC44C-21 | Current role/status, private/no-store, safe fields, một snapshot/asOf; GET không write/lock writer |
| AC44C-22 | Focused PG/compiled HTTP + full check/HTTP pass, docs/Swagger/Postman và query evidence đồng bộ; VPS/FE tách4.5 |

### 4.5. Kịch bản kiểm chứng bắt buộc

| ID | Kịch bản và assertion trọng tâm |
|---|---|
| T44C-01 | Regression schedule2.3:31 ngày, overlap, offset/local clock, page boundary, class filter, includeCancelled |
| T44C-02 | Override/primary, start/reassign, COMPLETED legacy unknown => đúng mentor hoặc null |
| T44C-03 | ACTIVE/CASH live/expired/PayOS pending, payment trước/sau snapshot => đúng access và null masking |
| T44C-04 | Guest-only target filter/context; regular+guest trùng target; count sau dedup và multipage tie |
| T44C-05 | Source entitlement mất/target cancel/placement cancel; list lịch thu hồi, historical metadata còn |
| T44C-06 | Student khác/STAFF/Mentor/suspended/guessed classId và guest-only receiving Class: auth/ownership |
| T44C-07 | SCHEDULED/IN_PROGRESS/COMPLETED/CANCELLED với null/UNMARKED/PRESENT/ABSENT: physical vs credit |
| T44C-08 | Chain root→replacement→replacement; range chỉ chứa ancestor, range chỉ source hiệu lực, target ngoài range |
| T44C-09 | OPEN conflict chưa assign, ASSIGNED, no-snapshot reassignment, cancel→reassign: makeupPending đúng một |
| T44C-10 | Guest PRESENT/ABSENT finalize: source count một, receiving summary không tăng, source physical giữ |
| T44C-11 | Correction COMPLETED guest đổi rate; correction sau cancel không hồi credit; target cancel revoke |
| T44C-12 | Legacy zero/partial recovery, omitted student, late CASH admission, late PayOS không được tự ABSENT |
| T44C-13 | Enrollment COMPLETED/CANCELLED vẫn đọc evidence; canceled→re-enroll fixture khóa credit-owner policy |
| T44C-14 | Denominator0/null,1/3=33.33, no UNMARKED-as-absent; Student/management cùng fixtures cho cùng counts |
| T44C-15 | Summary toàn scope không thay khi history page/pageSize đổi; filter trước count/page; historical roster |
| T44C-16 | Backlog nhiều tuần/tháng, endsAt==asOf, hai issues, terminal exclusion; deadline trước/đúng/sau và null |
| T44C-17 | Concurrent finalize/correct/cancel/settlement với GET: count/items/summary cùng snapshot, không write/audit |
| T44C-18 | Built-app HTTP cookies/roles/DTO422/path400/ownership404/private,no-store/Swagger nullable và enums |
| T44C-19 | Large fixture EXPLAIN/query count: bounded batch, không N+1; migration index rehearsal chỉ nếu thực sự thêm |
| T44C-20 | Full local gates + Postman journey lịch→history→source/management summary→backlog→refetch, không FE/VPS claim |

### 4.6. Thứ tự thực hiện và điểm dừng kiểm chứng

| Bước | Deliverable | Gate trước chuyển bước |
|---|---|---|
| C1 — Credit foundation | Fixtures/truth table4.2, pure reducer + typed public reader, scope/credit-owner/range policy; query plan ban đầu | T07–14; khóa re-enroll và partial recovery bằng source/evidence, không còn SUM/dedup mơ hồ |
| C2 — Schedule additive | Batch attendance/mentor/guest, nullable mentor DTO, SESSION_MAKEUP, class filter và dedup | T01–05 + regression2.3; ngày/clock/access cũ giữ nguyên |
| C3 — Own history/summary | Hai routes Student, terminal ownership provider, safe DTO, cùng reducer | T06–15; own/Staff parity, no-data và denominator0 rõ |
| C4 — Management reads | Class summary phân trang + incomplete backlog toàn bộ, static route trước dynamic sessionId | T15–19; filters/snapshot/current authorization/query evidence |
| C5 — Handoff/local DoD | Full check/HTTP, Swagger/Postman, docs source/AC/tests/evidence map | T20 + AC22, không skip DB rồi ghi pass; đánh dấu implemented chỉ theo kết quả thật |

Không triển khai FE, notification/email, workflow leave còn thiếu, settlement mới,
generic learning progress/certificate hoặc release4.5 trong slice này. Không thêm
env/dependency/worker theo plan hiện tại. Metrics/rate-limit/i18n chưa xây dựng
tiếp tục backlog chung. Rollback mặc định app-only vì read projections; nếu thêm
index migration thì review riêng up/down và app tương thích schema4.4b.

### 4.7. Implementation 2026-10-16 và quyết định kỹ thuật

- C1–C4 đã có source. `AttendanceProjectionService` sở hữu typed read models,
  `AttendanceReportsService` kiểm current principal/own history và transaction.
  Student/management controllers đặt trong AttendanceModule; StudentLearning
  import public projection provider cho schedule. Classes public reader cung
  cấp incomplete/calendar metadata; Enrollments public provider kiểm own history.
  Không có module import ngược StudentLearning hoặc Classes→Attendance.
- **Quyết định kỹ thuật:** credit reducer được thực thi như CTE set-based dùng
  chung trong `attendance/domain/attendance-credit.ts`, thay vì tải toàn bộ
  history về JavaScript. Classify/root/owner dùng cùng policy cho schedule,
  history và hai summaries; aggregate/count/filter/page trong PostgreSQL.
  `attendanceSummary` là pure function duy nhất cho denominator/rate. Cách này
  giữ memory của HTTP lists bounded và tránh hai bản diễn giải credit khác nhau.
- Chốt credit owner sau fixture re-enroll: partition student/root, ưu tiên
  finalized evidence → pending obligation → physical snapshot → enrollment đã
  ACTIVE trước cutoff → current ACTIVE/COMPLETED → history còn lại; trong cùng
  nhóm chọn enrollment.createdAt DESC,id DESC. Non-owner không cộng bất kỳ
  summary count nào; vẫn giữ physical history, excluded=true/credit=null.
  Management từng enrollment và Student aggregate cùng reader, không SUM trùng.
- History range theo physical row; summary range theo source leaf hiệu lực,
  resolve toàn chain trước range, guest ngoài range vẫn thay đúng source.
  Placement COMPLETED thiếu valid target/snapshot được giữ MAKEUP_PENDING,
  không dùng fallback regular để tự khôi phục credit.
- Shared read snapshot helper chuyển từ StudentLearning sang common/database;
  mỗi GET READ ONLY + REPEATABLE READ, không writer lock/audit/receipt mới.
  MySchedule query compositing chuyển qua public Attendance provider để union
  regular/guest và dedup trong SQL trước count/page, không đọc Attendance tables
  trực tiếp từ StudentLearning. Metadata joins là scoped typed read model,
  không thêm entity/repository hoặc chuyển ownership Class/enrollment/payment.
- 20 focused PG cases gồm actual late CASH admission, terminal/re-enroll,
  correction/revoke/no-snapshot, chain/range/rounding, snapshot-vs-finalize và
  backlog/end boundary. HTTP3 cases dùng compiled Nest/cookies/guards/Swagger;
  guest HTTP journey4.4b bổ sung schedule/source/receiving summary assertions.
- Query fixture3 Classes/24 enrollments/120 Sessions/960 obligations:8 queries
  mỗi management summary, giữ nguyên khi pageSize1→100; EXPLAIN ANALYZE thực tế
  10.371ms ở full gate cuối (không là production SLO). Không thấy nhu cầu thêm index
  ở fixture này, nên không migration/schema/backfill mới. C5 full gates/handoff
  và bằng chứng cuối ghi tại Progress4.4; không suy local thành VPS/FE acceptance.

**C5 đóng local:** `pnpm check`456/456 tests/45 suites,lint/type-check/build;
`pnpm test:http`48/48 tests/8 suites,0 skip.17 Markdown/52 links+anchors mới,
14 JSON examples,Postman20 requests/20 scripts/8 bodies và diff check pass.
Không tạo migration4.4c; rollback application reader, giữ schema/history4.4b.

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
