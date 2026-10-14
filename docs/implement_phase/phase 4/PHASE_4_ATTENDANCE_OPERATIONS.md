# Phase 4 — Attendance, nghỉ dạy, học bù và mentor dạy thay

Ngày lập: **2026-10-13**. Trạng thái: **core 4.1–4.2 có source/evidence local lịch sử;
core coverage đã đóng local; dependencies/release còn mở; 4.3 implemented/focused verified;4.4–4.5 pending; chưa deploy**.
User duyệt nghiệp vụ trong chat ngày 2026-10-13: điểm danh trong ngày học,
Manager tìm mentor dạy thay, mentor đăng ký nghỉ trước hai ngày lịch có duyệt,
bù theo buổi/ngày và học viên học bù tại lớp khác cùng Course Unit.
Lượt lập plan ban đầu chỉ sửa Markdown. Implementation4.1 có evidence ở Progress.
API/schema4.3 đã implement;4.4–4.5 vẫn là thiết kế. API4.1–4.3 cần deploy migrations trước khi dùng trên VPS.

[Flow](../../api_flow/PHASE_4_FLOW.md) ·
[API breakdown](../../api_flow/PHASE_4_flow-api-breakdown.md) ·
[Progress](../../progress/phase%204/PHASE_4_PROGRESS.md).

Plan chi tiết riêng: [4.1 — Mentor substitution](PHASE_4_1_MENTOR_SUBSTITUTION.md)
và [4.2 — Session attendance](PHASE_4_2_SESSION_ATTENDANCE.md),
[4.3 — Correction/recovery/history](PHASE_4_3_ATTENDANCE_CORRECTIONS_HISTORY.md).
Đối chiếu AC → code → tests → gaps tại
[Progress 4.1](../../progress/phase%204/PHASE_4_1_PROGRESS.md) và
[Progress 4.2](../../progress/phase%204/PHASE_4_2_PROGRESS.md).
Plan chung giữ toàn bộ yêu cầu nghiệp vụ; không lấy core đã code để thu hẹp DoD.
Recovery4.2 hiện chỉ SCHEDULED/Class OPEN hoặc IN_PROGRESS; legacy/terminal
recovery, correction, Student projection và cancel orchestration còn mở.

**Quyết định mới của user2026-10-13:** không có buổi qua đêm; buổi thứ Ba
cho Mentor ghi/sửa/chốt đến hết thứ Tư, tức00:00 thứ Năm theo APP_TIME_ZONE.
Deadline dựa ngày của startsAt trên lịch, không actual start +24h.
Quyết định này thay thế rule24h/overnight của các implementation logs cũ.

## 1. Baseline và làm song song Phase 3

- Đã đọc `document/Flow.txt`, `document/COURSE_FLOW.md`, DBML và quy tắc NestJS.
- Source có Classes/Class Units/Class Sessions, enrollment/payment, My Classes,
  `/me/schedule`, Mentor class/payment roster; role MANAGER đã tồn tại.
- SessionStatus hiện chỉ SCHEDULED/COMPLETED/CANCELLED; chưa attendance entity/API.
- `classes.mentor_id` là phân công cả lớp. ClassScheduleService kiểm overlap theo
  mentor cả lớp, chỉ SCHEDULED, dùng advisory transaction lock theo mentor.
- AdminClassesController chỉ ADMIN. Có MANAGER enum không có nghĩa Manager đã
  gọi được API lịch/phân công hiện hữu.
- CASH confirm `/mentor/cash-orders/:orderId/confirm` theo mentor snapshot của
  Order; đổi mentor lớp/buổi không chuyển quyền thu tiền của order cũ.
- Phase 4 không đợi materials CRUD hoàn thành. Dùng baseline Phase 2.3 và role
  MANAGER; không import private provider Materials hoặc sửa migrations đã chạy.
- Chia ownership: Phase 4 sở hữu Classes session lifecycle/assignment, Attendance,
  StudentLearning attendance projection. Phase 3 sở hữu Materials/Files/release.
  Chốt thứ tự migration và review shared files trước merge; mỗi migration một
  người tạo. Không thay entitlement/review/approval của Phase 3.

## 2. Nghiệp vụ điểm danh đã chốt

### Ngày được mở điểm danh

- Mentor có thể bấm Bắt đầu đầu hoặc cuối buổi, bất kỳ giờ nào trong ngày học.
  Ngày tính bằng APP_TIME_ZONE; đây là thao tác mở quy trình điểm danh.
- Ngày hợp lệ là ngày startsAt theo APP_TIME_ZONE. Không có buổi qua đêm;
  `[startsAt,endsAt)` phải nằm trong cùng ngày, end00:00 exclusive không thêm ngày.
- Lần bấm đầu dùng server now cho actualStartedAt; deadline là hết ngày kế tiếp
  của ngày startsAt trên lịch. Mốc bấm mở không
  khẳng định mentor thực sự bắt đầu dạy tại thời điểm đó; IN_PROGRESS phản ánh
  quy trình chưa chốt, không kéo dài interval dạy dự kiến.
- Sau ngày hợp lệ chỉ Manager/Admin recovery. Retry hoặc đổi mentor không reset
  actualStartedAt/editableUntil. Quyền sửa sau khi đã mở vẫn theo hạn đến hết ngày học kế tiếp.

1. ONLINE/OFFLINE đều mentor đánh dấu thủ công. Student chỉ xem kết quả của mình.
2. Buổi học: SCHEDULED → IN_PROGRESS → COMPLETED. Manager/Admin có thể hủy
   SCHEDULED; hủy IN_PROGRESS cần lý do, giữ audit/attendance, loại khỏi chuyên cần.
   Không có mở lại COMPLETED hoặc xóa giờ bắt đầu để kéo dài quyền.
3. Bắt đầu buổi học không đồng nghĩa bắt đầu cả Class. Mentor bắt đầu Session
   thuộc Class OPEN/IN_PROGRESS; lần bắt đầu đầu tiên có thể atomically đưa Class
   OPEN → IN_PROGRESS theo transition hiện hành, đóng đăng ký như source Phase 2.
4. Lần bắt đầu đầu tiên ghi actualStartedAt, startedBy, teachingMentorId và
   editableUntil = 00:00 của ngày học + 2 theo APP_TIME_ZONE. Timestamp UTC, hiển thị APP_TIME_ZONE.
   Server time quyết định; `now < editableUntil`, đúng deadline đã hết quyền.
5. Chưa tick = UNMARKED khi đang học. Tick = PRESENT; bỏ tick trước chốt trở về
   UNMARKED. Kết thúc/chốt chuyển UNMARKED → ABSENT trong cùng transaction.
6. FE xác nhận tổng có mặt/vắng trước chốt. Chốt sau deadline do Manager/Admin
   xử lý; hệ thống không tự coi quá giờ lịch hoặc deadline là ABSENT/COMPLETED.
7. Mentor được phân công hiệu lực cho buổi sửa PRESENT/ABSENT sau chốt trong
   deadline lịch học, kể cả Class vừa COMPLETED. Không trả về UNMARKED sau chốt.
8. Manager/Admin sửa kết quả bất kỳ lúc nào sau khi buổi đã bắt đầu, kể cả
   enrollment/Class đã hoàn thành hoặc bị hủy; bắt buộc lý do và audit. Buổi hủy
   vẫn không tính vào tỷ lệ. Không tạo attendance cho Session chưa từng bắt đầu.
9. Mentor quên thao tác: operational query hiển thị OVERDUE_NOT_STARTED và
   STARTED_NOT_FINALIZED. Manager khôi phục bằng start có actualStartedAt thực
   tế + reason, rồi chốt; không sửa hạn để cấp lại quyền mentor. Thời gian thực
   tế không tương lai và phải bảo đảm start < end khi chốt phục hồi.
10. LATE/EXCUSED có trong DBML tham khảo nhưng chưa đưa vào MVP; không auto
    check-in online, QR hoặc tạo chứng chỉ. Đăng ký nghỉ có duyệt thuộc mục 5.

### Danh sách học sinh và lịch sử

- AttendanceModule snapshot roster ACTIVE tại lúc start; một row cho mỗi
  (enrollmentId, sessionId), status UNMARKED/PRESENT/ABSENT.
- Enrollment đã tạo sau actualStartedAt không được tự bổ sung vào buổi cũ.
  Chưa tham gia/không thuộc roster không có row, không suy ra ABSENT.
- CASH pending còn hạn thấy timetable nhưng chưa có kết quả chính thức. Nếu
  hold có trước lúc start được activate trong lúc học, roster có thể admit thêm
  trước chốt qua lệnh sync roster; kiểm ACTIVE + cùng Class + createdAt cutoff
  và lưu admission audit. Sau chốt, Manager mới được admit bổ sung với lý do,
  cũng phải chứng minh enrollment đã tồn tại lúc start. Không admit PayOS pending.
- Roster snapshot đã ghi không bị xóa khi enrollment bị hủy/rời lớp; giữ kết quả
  lịch sử. Tỷ lệ tính theo snapshot tham gia, không dùng enrollment status hiện
  tại để sửa lịch sử ngược. Manager sửa trạng thái, không âm thầm xóa nghĩa vụ.
- Mentor dạy thay không tự có quyền CASH confirm: hiển thị chờ mentor snapshot
  xác nhận và refetch roster sau activation. Việc chuyển người thu tiền là
  workflow payments riêng, chưa thuộc phase này.

### Phục hồi lịch sử bằng chứng cứ

- Manager/Admin được phục hồi cả buổi quên start/chốt và Session COMPLETED trước
  migration. Legacy recovery là command riêng, không mở lại trạng thái COMPLETED.
- Body có actualStartedAt/actualEndedAt, roster từng có nghĩa vụ tham gia,
  kết quả, evidenceNote và reason. Không dựng roster quá khứ bằng ACTIVE hiện tại
  hoặc chỉ bằng createdAt; enrolledAt là mốc activation, createdAt là mốc hold.
- Kiểm cùng Class và enrollment tồn tại trước mốc phục hồi. Enrollment đã
  COMPLETED/CANCELLED nhưng có chứng cứ từng trả tiền vẫn phục hồi được lịch sử;
  pending/chưa trả tiền không có kết quả chính thức. Hold trước start trả tiền
  sau start cần Manager xác nhận đủ điều kiện admission, không suy ra ACTIVE lúc start.
- Mốc thời gian UTC không tương lai, start < end; không dùng giờ recovery để cấp
  hạn mới. Giữ người dạy/startedBy đã biết; legacy thiếu thì nullable.
- Roster phải đầy đủ có chứng cứ; phần thiếu chứng cứ giữ no-data, không tự ABSENT.
  Recovery có audit/version, không cấp lại nội dung học. Row đã có chỉ sửa bằng
  correction; không ghi đè cả roster bằng recovery.

### Hiển thị Student

| Điều kiện | Nhãn FE | attendanceStatus |
|---|---|---|
| Session chưa bắt đầu | Chưa bắt đầu | null |
| Thuộc roster nhưng chưa đánh dấu | Chưa điểm danh | UNMARKED |
| Đã đánh dấu | Có mặt | PRESENT |
| Đã ghi vắng/chốt vắng | Vắng | ABSENT |
| Session bị hủy | Đã hủy | Có thể giữ giá trị lịch sử, excluded=true |
| Không thuộc roster hoặc CASH preview | Không áp dụng / Chờ xác nhận thanh toán | null |

sessionStatus và attendanceStatus là hai field riêng; không ghi NOT_STARTED vào
attendance enum. Attendance không cấp quyền materials hoặc meeting URL.

## 3. Phân công mentor và tìm lịch trống

### Hai phạm vi rõ ràng

- **Dạy thay một buổi:** Manager/Admin đặt session mentor override; không đổi
  mentor chủ nhiệm của Class. Có thể đổi ngay trong IN_PROGRESS để xử lý bận đột
  xuất; actualStartedAt/startedBy/deadline giữ nguyên. COMPLETED/CANCELLED không
  đổi người dạy, chỉ đọc lịch sử và chỉnh attendance theo quyền quản lý.
- **Đổi mentor cả lớp:** command riêng đổi classes.mentorId, ảnh hưởng SCHEDULED
  chưa có override. Không thay teachingMentorId đã snapshot ở buổi bắt đầu,
  không gỡ override các buổi dạy thay. Chỉ Class DRAFT/OPEN/IN_PROGRESS editable.
- Session SCHEDULED: effectiveMentorId = override ?? classes.mentorId.
  Session đã start: effectiveMentorId = teachingMentorId, chỉ thay bằng command
  phân công buổi có audit. Mentor mới có quyền buổi ngay sau commit, mentor cũ
  mất quyền ghi buổi ngay, kể cả request/cache cũ.
- Mentor chính vẫn quản lý Class theo quyền hiện có, nhưng khi override có
  hiệu lực chỉ mentor được giao buổi mới ghi attendance/lifecycle buổi đó.
- Quyền dạy thay giới hạn đọc context/roster/meeting của buổi được giao và
  start/điểm danh/chốt trong deadline. Không cấp quản lý cả lớp, tài liệu chung,
  review/release, thu tiền hoặc truy cập các buổi khác. Material read context
  dành cho dạy thay cần phối hợp Phase 3 qua public provider, không đổi policy
  Materials trong slice 4.1; nếu chưa tích hợp phải thể hiện giới hạn trên FE.

### API trống lịch

- Theo buổi: `GET /api/v1/management/class-sessions/:sessionId/available-mentors`.
  Session cung cấp khoảng giờ và course; client không tự gửi giờ khác để né kiểm.
- Theo cả lớp: `GET /api/v1/management/classes/:classId/available-mentors`, kiểm
  tất cả buổi SCHEDULED chưa có override chịu ảnh hưởng của đổi mentor chủ nhiệm.
- Candidate phải user ACTIVE, role MENTOR. Sau 4.4a kiểm cả khoảng nghỉ APPROVED;
  PENDING không giữ slot. Qualification và availability tự khai ngoài request
  nghỉ chưa có; không hứa mentor đã được duyệt môn hoặc đã nhận lời.
- Occupied: buổi SCHEDULED/IN_PROGRESS của Class OPEN/IN_PROGRESS, theo effective
  mentor; IN_PROGRESS vẫn chiếm lịch dù Class bị kết thúc trước khi Session chốt.
  Chỉ chiếm startsAt–endsAt dự kiến. Qua endsAt, buổi chưa chốt không chặn
  phân công/start buổi tiếp theo. Class DRAFT không giữ chỗ, kiểm lại khi open.
- So sánh interval `[startsAt, endsAt)`: a.start < b.end && a.end > b.start.
  Hai buổi tiếp giáp được phép; không tự thêm travel buffer trong MVP.
- Với thay mentor giữa buổi, kiểm `[max(now, startsAt), endsAt)`. Nếu now >= endsAt
  thì khoảng kiểm rỗng (checkedFrom=checkedTo=now), không dựng now + 1ms; vẫn kiểm
  ACTIVE/role/version và không cấp hạn sửa mới. Availability trả asOf,
  checkedFrom/checkedTo/sessionVersion; GET không giữ slot.
- Loại chính target Session khỏi phép kiểm nhưng không loại cả Class; bắt
  được xung đột ngay trong cùng lớp. Candidate hiện hành được trả isCurrent=true
  nếu vẫn phù hợp, FE có thể dùng làm lựa chọn giữ nguyên.
- POST/PATCH phân công luôn kiểm lại current role/status, version và overlap
  trong transaction; GET trống không đảm bảo PATCH sẽ thành công.
- Row lock Class rồi Session; advisory locks mentor cũ/mới theo UUID tăng dần,
  dùng cùng lock key/cơ chế với mọi writer lịch. Review deadlock giữa payment,
  roster sync, enrollment và Classes; lệnh roster sync chỉ đọc ACTIVE đã commit,
  không gọi cash settlement bên trong attendance transaction.
- Schedule add/reschedule/bulk/open/class reassignment/session reassignment đều
  dùng policy effective mentor mới. Khóa mentor theo tập đích đã tính, revalidate
  sau khóa. Không chỉ sửa API candidate mà giữ checker cũ theo class.mentorId.
- PATCH Class cũ có mentorId phải đi qua cùng assignment use case/audit/version;
  không để tồn tại writer bỏ qua kiểm tra mới. Time writers/lifecycle cũ cũng
  tăng version tương ứng. Class completion từ chối nếu còn Session
  SCHEDULED/IN_PROGRESS; quản lý phải chốt, phục hồi hoặc hủy trước.
  Class cancel atomically hủy các SCHEDULED/IN_PROGRESS và audit, giữ attendance.
  Trong rollout, mọi IN_PROGRESS còn tồn tại giữ slot dù Class đã terminal.

## 4. Schema và module ownership dự kiến

ClassesModule:
- class_sessions: thêm IN_PROGRESS, actual_started_at/actual_ended_at,
  started_by, completed_by, mentor_override_id nullable, teaching_mentor_id
  nullable, editable_until, version integer >=1; makeup_for_session_id nullable.
- Session assignment/lifecycle audit: actor, reason, old/new mentor/state,
  occurred_at, version; lịch sử trước start cũng được giữ.
- class mentor assignment audit + class assignmentVersion phục vụ optimistic
  concurrency (không lấy version của một Session làm version cả Class).
- effective mentor resolution và schedule conflict provider export cho consumers.
- Context riêng của Session trả roomName/meetingUrl theo buổi được giao; URL
  dùng Session override rồi fallback Class, không dùng payment roster làm context.
- makeup_root_session_id cùng makeup_for_session_id bảo vệ cả chain bù, không
  cho hai nhánh replacement hiệu lực của cùng root.

AttendanceModule sở hữu entity/query/commands:
- attendance_records: enrollment_id/session_id, status UNMARKED/PRESENT/ABSENT,
  checked_in_at nullable, recorded_by, admitted_at, admission_source,
  created_at/updated_at; unique enrollment/session; index session/status.
- attendance_audits: row, actor, old/new status, reason, occurred_at; append-only.
  checked_in_at là lần xác nhận PRESENT gần nhất, không suy ra giờ đến thực tế.
- Mọi write tăng session.version; cả roster admission, chốt và manager edit
  dùng expectedVersion tránh ghi đè trên danh sách cũ. Audit + write atomic.
- Mutation idempotency ledger lưu actor/route/key/payload hash/outcome cùng
  transaction; header Idempotency-Key UUID, replay không nhân audit hoặc reset
  clock. Kiểm quyền hiện hành trước replay; xem contract chung trong breakdown.
- FK giữ lịch sử bằng RESTRICT với enrollment/session/user; không cascade delete
  lịch sử. Review delete semantics đã có trong migrations và account deactivation.
- Chọn composite FK cho attendance thường: thêm/backfill class_sessions.class_id,
  FK (class_unit_id,class_id) → class_units(id,class_id); attendance_records có
  class_id, FK (enrollment_id,class_id) → enrollments(id,class_id) và
  (session_id,class_id) → class_sessions(id,class_id). Additive UNIQUE parent keys
  theo pattern composite context đã có của Files.
- makeup_placements riêng nối enrollment gốc, source_session_id và target_session_id;
  source cùng Class với enrollment, target khác Class nhưng cùng Course Unit.
  makeup_attendance_records nối placement/target; không bỏ invariant cùng Class
  của attendance_records để nhận trực tiếp enrollment ngoại lớp.
- Placement có version/audit, trạng thái ASSIGNED/COMPLETED/CANCELLED/
  NEEDS_REASSIGNMENT; unique hiệu lực enrollment/source và target/student.
  Guest attendance unique placement, status UNMARKED/PRESENT/ABSENT, actor/timestamps.
- Cross-class Course Unit equality được bảo vệ bằng constraint trigger kiểm
  placement/ancestry; không đổi ancestry âm thầm khi đã có lịch sử.
- Migration additive mới, enum upgrade có rollout riêng; backfill version,
  không tạo ABSENT cho Session COMPLETED cũ. Buổi cũ thiếu attendance trả
  legacy/no-data và bị loại mẫu số tới khi Manager phục hồi có chứng cứ.
- Đổi mentor chủ nhiệm không làm thay các Session đã COMPLETED trước migration:
  review backfill historical mentor; nếu không có chứng cứ snapshot, đánh dấu
  legacy unknown, không trình bày mentor hiện tại là người đã dạy buổi cũ.

StudentLearningModule đọc qua provider public Attendance/Classes; UsersModule
cung cấp mentor ACTIVE query. Không có vòng phụ thuộc với Payments/Materials.

TeachingOperationsModule điều phối nghỉ/duyệt/bù/conflict; không để Classes
import ngược Attendance/StudentLearning. Availability provider riêng sở hữu
mentor_unavailability, không import Classes; Classes dùng provider khi kiểm lịch.
Các bảng dự kiến thêm:
- mentor_leave_requests: mentor, from_date/to_date, period, reason, submitted_at,
  status PENDING/APPROVED/REJECTED/WITHDRAWN/EXPIRED, reviewer/version/timestamps.
- mentor_leave_request_items: source Session/version/lịch snapshot, lịch bù đề
  xuất và replacement Session sau duyệt.
- mentor_unavailability: interval nghỉ APPROVED, mentor/request/audit; nguồn chung
  cho mọi schedule writer và candidate query.
- student_schedule_conflicts: enrollment, Session mới, interval/event trùng,
  trạng thái OPEN/MAKEUP_ASSIGNED/RESOLVED, actor/lý do/history.

Schema assignment/lifecycle/regular attendance/audits/receipts đã có migration
4.1–4.2 và local rehearsal lịch sử. Leave/replacement/placements/guest/conflict
schema vẫn PLANNED. Không khẳng định dev/VPS đã chạy migrations mới.

## 5. Mentor đăng ký nghỉ và tự điều chỉnh lịch sau duyệt

### Form và khoảng nghỉ

- Form theo reference user: từ ngày, đến ngày, mức nghỉ, lý do. fromDate/toDate
  inclusive theo ngày trung tâm, fromDate <= toDate, tối đa 93 ngày.
- MORNING [00:00,12:00), AFTERNOON [12:00,18:00), EVENING [18:00,24:00),
  FULL_DAY [00:00,24:00). Mỗi ngày trong range sinh một interval tương ứng.
- Preview lấy Session SCHEDULED, Class OPEN/IN_PROGRESS, mentor là effective
  assignment và Session giao khoảng nghỉ. Xét overlap cho buổi qua nửa đêm,
  deduplicate Session; không chỉ so ngày startsAt. Không có buổi thì không tạo
  request đổi lịch. Không thêm loại nghỉ HR tang chế/hôn hỉ từ ảnh tham khảo.

### Hạn gửi và bước duyệt

- Ít nhất hai ngày lịch, không phải 48h:
  localDate(submittedAt) <= min(localDate(affected.startsAt)) - 2 calendar days.
  Buổi thứ Sáu 19:00: gửi thứ Tư 23:00 vẫn hợp lệ; dùng ngày sớm nhất cả batch.
- Mentor gửi PENDING với lịch bù đủ cho toàn bộ danh sách bị ảnh hưởng.
  PENDING không đổi lịch/giữ slot; mentor có thể WITHDRAW trước quyết định.
- Manager/Admin xem lý do, lịch và student conflicts rồi APPROVE hoặc REJECT.
  Approval trước startsAt sớm nhất; quá mốc request EXPIRED. Báo nghỉ sát ngày/
  bận đột xuất chuyển management reschedule/dạy thay, không tự duyệt.
- Approval lock/reload các Classes, Sessions, mentor theo UUID tăng dần, so
  versions và tập Session với request. Tập thay đổi, source đã start/terminal
  hoặc lịch mới không hợp lệ trả 409; không tự thêm/bỏ buổi, không commit một phần.
- Revalidate nghỉ APPROVED, lịch mentor/Class/student/capacity hiện hành. Writer
  checkout/activation/schedule dùng khóa student chung khi ảnh hưởng conflict
  để không có race chèn lịch học viên trong lúc approval. Không gọi payment
  settlement/network trong transaction nghỉ.
- Một transaction commit APPROVED + hủy source + replacement + gia hạn Class
  nếu cần + khoảng nghỉ + student conflict records + audit/idempotency.
  Replacement giữ classUnitId/thời lượng/context phòng-meeting, mentor bù là
  người gửi; snapshot override cần thiết, không ngầm giao cho primary mới.
- Source có guest/placement liên quan cần quản lý xử lý placement trước approval;
  trả conflict thay vì bỏ học viên nhận bù khỏi lịch.

### Chọn lịch bù theo loại nghỉ

- Nghỉ MORNING/AFTERNOON/EVENING: chọn ngày và period bù, rồi giờ cho từng Session;
  có cả slot gợi ý và nhập giờ thủ công. Giữ thời lượng, toàn Session trong period,
  startsAt > now và không sớm hơn Class.startDate.
- Slot gợi ý mỗi 15 phút trong period; duration theo source. Lọc lịch mentor,
  Class và học viên ACTIVE/CASH pending còn hạn, cộng các placement đã ASSIGNED.
  Pending PayOS không có timetable. Nhập tay được chọn phút khác nhưng cùng
  validator; GET slot là gợi ý tại asOf, không giữ chỗ.
- Nghỉ theo buổi: student conflict là hard block cho cả slot gợi ý/nhập tay;
  Manager không override. Không có slot thì chọn period/ngày khác.
- FULL_DAY: mỗi ngày gốc chọn một ngày bù, giữ local clock và độ lệch ngày của
  buổi qua nửa đêm. Buổi giao hai ngày nghỉ chỉ có một item, sourceDate là ngày
  bắt đầu; mapping preview rõ. Mentor/Class conflict vẫn bắt buộc chặn.
- FULL_DAY cho student conflict: lưu các học viên/interval trùng, show cho mentor
  liên quan và Manager. Manager xác nhận đã xem khi duyệt; queue hỗ trợ xếp học
  viên sang học bù lớp khác. Không âm thầm đổi giờ để tránh conflict.
- Phase 4 chỉ cập nhật thời khóa biểu sau duyệt. Không gửi email/notification/
  chat message; mentor chủ động nhắn học viên, notification thuộc phase sau.

## 6. Đổi lịch, hủy và học bù

- Manager/Admin dùng command riêng đổi thời gian của SCHEDULED, đủ start/end
  ISO timestamp, cùng ngày hoặc ngày khác, trong Class period và kiểm conflict.
  Không dùng API sửa giờ Phase 2.3 (giữ ngày) để giả vờ đổi ngày học bù.
- Manager/Admin hủy buổi với reason. Cấm thay lịch khi IN_PROGRESS/COMPLETED.
- Bù thay thế: original CANCELLED + replacement SCHEDULED cùng Class, FK
  makeup_for_session_id và makeup_root_session_id; mỗi root tối đa một
  replacement hiệu lực. Replacement cùng Class và Course Unit của source.
  Hủy buổi bù rồi tạo lại vẫn giữ chain/audit, không tạo vòng hoặc đổi Class.
- Mẫu số chỉ tính replacement đã chốt, original bị loại; buổi bổ sung thật sự
  không có makeup_for_session_id thì được tính riêng khi đã chốt/thuộc roster.
- Replacement sau Class.endDate tự gia hạn endDate tới localDate(endsAt) trong
  cùng transaction, kể cả OPEN/IN_PROGRESS; lưu old/new date và reason/audit.
  Không đổi startDate hoặc nhận buổi trước startDate/quá khứ.
- Nghỉ có duyệt + slot bù thuộc Phase 4 theo mục 5; email/notification còn hoãn.

### Học viên học bù tại lớp khác

- Có trong Phase 4. Manager/Admin xử lý student conflict bằng placement cho
  Session của Class khác, cùng Course Unit và contentMatchConfirmed + reason;
  cùng Unit chưa đủ chứng minh cùng nội dung vì Unit có thể có nhiều Session.
- Enrollment gốc phải ACTIVE; CASH pending chỉ preview/conflict, activate trước
  placement chính thức. Không tạo enrollment/order/payment mới ở lớp nhận.
- Source là Session hiệu lực của lớp gốc cần bù; target SCHEDULED, startsAt > now,
  Class OPEN/IN_PROGRESS, cùng Course Unit, không trùng học viên và còn sức chứa.
  Capacity tính ACTIVE + mọi hold chưa hết hạn (CASH/PAYOS) + guest ASSIGNED;
  giữ seat-hold policy Phase2, dù PayOS pending không có timetable. Student đã có
  enrollment hiệu lực tại lớp target không tạo guest trùng.
- Placement do Manager tạo sau preview; kiểm lại interval/content/seat dưới locks.
  Target start snapshot guest đủ điều kiện; target mentor hoặc staff ghi theo
  makeupPlacementId. Mentor lớp gốc không có quyền ghi attendance target.
- Student thấy event nhận bù, context/meeting của đúng Session; không mở cả lớp
  nhận, classmates hoặc quyền Materials. Materials theo enrollment lớp gốc và
  shared Course Unit policy; không chuyển quyền CASH confirm.
- Giữ attendance vật lý source. Summary lớp gốc dùng guest result đã chốt thay
  cho source, mỗi nghĩa vụ một lần; không copy ngoại lớp vào attendance_records.
  Guest không tăng tỷ lệ enrollment lớp nhận. Chờ chốt guest = MAKEUP_PENDING/null,
  loại nghĩa vụ khỏi mẫu số; không tự ngụ ý vắng.
- Target hủy → NEEDS_REASSIGNMENT, giữ row/audit và cần Manager xếp lại, không
  tự ABSENT. Cancel placement có reason thì quay về source result nếu đã chốt.
  Không xóa lịch sử/reset deadline target khi sửa placement.
- Class completion cũng chặn placement ASSIGNED/NEEDS_REASSIGNMENT tồn đọng
  của lớp gốc; chốt guest hoặc cancel placement có lý do trước completion.

## 7. Operational queries

- Lịch mentor theo buổi effective assignment, có assignmentType PRIMARY/SUBSTITUTE;
  không thay danh sách lớp/payment roster hiện hữu bằng danh sách dạy thay.
- Management list/detail Class read-only cho MANAGER/ADMIN để lấy class/session
  IDs; không mở quyền create/catalog/release/payment rộng qua Admin controller.
- Roster theo Session: snapshot học sinh, status, version, permissions/canEdit,
  deadline, totals và pendingPaymentCount (không tiết lộ order detail cho dạy thay).
- Student lịch hiện có thêm attendanceStatus/applicability/excluded và mentor
  của buổi; vẫn giữ accessMode/FULL/CASH_PREVIEW và entitlement Phase 2.3.
- Student lịch sử riêng có ownership, kể cả COMPLETED/CANCELLED enrollment từng
  thuộc mình; chỉ attendance metadata, không mở lại nội dung lớp đã mất quyền.
- Summary theo lớp: present/absent/unmarked/excluded/makeupPending/finalizedEligibleCount,
  rate = present / finalizedEligibleCount * 100; mẫu số 0 → rate=null.
  present/absent và mẫu số chỉ lấy nghĩa vụ đã chốt hợp lệ; placement đã chốt dùng
  guest result. Pending makeup/UNMARKED/legacy/cancelled loại khỏi rate.
- Manager incomplete sessions: OVERDUE_NOT_STARTED nếu SCHEDULED và now >= endsAt;
  STARTED_NOT_FINALIZED nếu IN_PROGRESS, trả severity/deadline để ưu tiên xử lý.
- Danh sách phân trang ổn định, giới hạn date range/pageSize, không N+1.
  Revenue/order reports mới không nằm trong Phase 4, payment APIs hiện hữu giữ nguyên.
- Incomplete/conflict/makeup queues mặc định toàn bộ tồn đọng; from/to chỉ filter
  khi gửi tường minh, không áp tuần hiện tại của calendar cho queue.
- Mentor/Manager có request list/detail, approval preview và conflict queue.
  Student chỉ own event/placement/history, không xem lý do nghỉ riêng tư.

## 8. Các slice triển khai và nghiệm thu

| Slice | Deliverable có thể nghiệm thu | Gate |
|---|---|---|
| [4.1 Mentor availability + substitution](PHASE_4_1_MENTOR_SUBSTITUTION.md) | Migration/audit; staff reads/candidates; assignment buổi/lớp; shared checker; Mentor schedule/context | Core + mixed-writer/fault/HTTP gates pass local; Student/material/leave/release mở |
| [4.2 Session lifecycle + roster](PHASE_4_2_SESSION_ATTENDANCE.md) | Calendar deadline migration; regular start/sync/read/mark/finalize; Staff SCHEDULED recovery | Core/edge/mixed-flow/Staff HTTP gates pass local; full correction/recovery/cancel/Student/release mở |
| [4.3 Corrections + history](PHASE_4_3_ATTENDANCE_CORRECTIONS_HISTORY.md) | Completed/Staff canceled correction, Staff audit reader, legacy/terminal evidence recovery;22 AC/5 bước | Exact calendar midnight, stale/replay/races, evidence/clock preservation, migration/HTTP limits; implemented/focused local verified, full gates xem Progress4.3 |
| 4.4a Nghỉ có duyệt + lịch bù | Range/period; preview/slot/manual; approve/reject/withdraw/expire; replacement/auto endDate; approved leave policy | Hai ngày lịch, all-or-nothing, expired/stale request, student hard/soft conflicts, writer races |
| 4.4b Học bù lớp khác | Conflict queue, same Course Unit candidates, placement, guest roster/attendance/context | Ancestry/content, capacity race, target cancel, temporary access, credit once |
| 4.4c Student + operations | Additive /me/schedule; own history/summary; incomplete toàn bộ backlog | Ownership, no data/pending makeup, denominator, root chain, query plans; FE flow |
| 4.5 Integration + release | Swagger/Postman/FE handoff; migration rehearsal; regression và staging acceptance | pnpm check + pnpm test:http; real PostgreSQL races; all role browser smoke; VPS evidence riêng |

Mỗi slice phải chạy được migration → use case → API → meaningful tests; không
tạo toàn bộ schema rồi trì hoãn authorization/API. 4.1 đã cần tích hợp checker
chung trong writer hiện hữu, không đợi 4.5 mới kiểm trùng lịch.

Ước lượng cũ BE 8–12 ngày/FE 3–5 ngày không còn đại diện scope mở rộng có nghỉ
duyệt và học bù lớp khác; không dùng làm cam kết. Thứ tự 4.1 → 4.2 → 4.3 →
4.4a → 4.4b → 4.4c → 4.5; Phase 3 tiếp tục song song.

## 9. Ma trận test bắt buộc

- Hai Manager gán cùng mentor cho hai buổi trùng: chỉ một commit, một 409.
- Đổi buổi vs đổi lịch/bulk/open/đổi mentor lớp: không lọt xung đột hoặc deadlock.
- Dạy thay A→B: B thấy buổi; A mất write; primary Class quyền khác không đổi.
- Đổi giữa buổi: deadline/startedBy giữ nguyên, audit có A/B, không cấp tiền/materials.
- Tick/bỏ tick/finalize đồng thời: expectedVersion stale bị 409, không mất dữ liệu.
- Start retry không chụp roster/deadline lại; finalize retry không audit vắng hai lần.
- 23:59:59.999 ngày kế tiếp còn sửa, đúng00:00 ngày thứ hai bị chặn;
  Manager sửa bất kỳ lúc nào với reason; giờ bấm mở không đổi deadline.
- CASH pending không attendance; activation trước chốt admit có audit, không làm
  mentor dạy thay trở thành cash order owner; enrollment created sau start không admit.
- Wrong Class enrollment, sai Student, guessed IDs và account inactive bị chặn.
- Buổi quên điểm danh giữ UNMARKED/chưa start; hết giờ không tự ABSENT.
- Legacy COMPLETED không ABSENT backfill; canceled/original makeup không denominator.
- Mở đầu/cuối ngày; cấm overnight; ngoài ngày chỉ recovery; không dựng
  roster lịch sử từ ACTIVE hôm nay. Buổi quá endsAt chưa chốt không chiếm slot sau.
- Completion chặn SCHEDULED/IN_PROGRESS và placement chưa giải quyết.
- Hai ngày lịch: thứ Tư 23h → thứ Sáu 19h hợp lệ, thứ Năm bị chặn; multi-day/
  dùng affected start date sớm nhất, deduplicate đúng; không lịch qua đêm.
- PENDING không đổi lịch; approve/reject/withdraw/expire, role/ownership và races
  với assignment/reschedule/cash activation: stale409 hoặc commit hợp lệ.
- Nghỉ theo buổi: slot/manual tránh mentor/Class/student; FULL_DAY giữ clock/
  không sinh overnight, lưu student conflicts và Manager/mentor thấy queue.
- Approval rollback cả batch, retry không nhân replacement/audit; gia hạn endDate
  atomic; nghỉ APPROVED chặn add/open/assignment trong khoảng nghỉ.
- Học bù cùng Course Unit + xác nhận nội dung; khác Unit bị chặn; hai placement
  giành suất cuối chỉ một commit; CASH pending không guest access.
- Target mentor ghi guest trước deadline lịch học, source không count đôi; pending guest không
  ABSENT; target cancel cần xếp lại; guessed placement/context bị chặn.
- Không tự gửi email, notification hoặc chat khi duyệt đổi lịch.
- Rời lớp giữ snapshot; own history đọc được nhưng materials không mở lại.
- Migrations clean DB và up/down/up; enum rollback không mất dữ liệu âm thầm:
  rollback chỉ khi không còn IN_PROGRESS/new references, nếu không phải fail rõ.

## 10. Definition of done

Đây là DoD toàn Phase4, chưa đạt. Các tổng test trong implementation logs là
evidence lịch sử; review/tách plan2026-10-13 không chạy lại runtime gates.

- Tất cả endpoint planned chuyển implemented chỉ sau controller/DTO/test evidence.
- Flow, API breakdown, progress, Swagger/Postman và FE contract cùng revision.
- pnpm check, HTTP gate, PostgreSQL concurrency và migration rehearsal pass.
- Manager tìm mentor trống → gán → mentor thay bắt đầu/điểm danh/chốt → Student
  thấy kết quả → Manager sửa ngoài deadline chạy end-to-end trên staging/VPS.
- Local pass không thay cho deploy/VPS hoặc live payment evidence.
- Mentor gửi nghỉ → Manager duyệt → đổi lịch/bù/gia hạn → xử lý student conflict
  bằng học bù cùng Course Unit → target mentor chốt guest → credit một lần phải
  được nghiệm thu cùng các flow điểm danh/dạy thay hiện hữu.
- Handover rõ limitations: qualification chưa có, payment snapshot, substitute
  material context integration; notification/chat automation/chứng chỉ còn hoãn.
- Lượt lập plan ban đầu chỉ đồng bộ Markdown/diff/link; các gate code/migration/runtime
  bên trên vẫn pending, không ghi là đã chạy hoặc đã đạt.

## 11. Implementation4.1 và rollout

4.1 đã có migration/use cases/API/tests, xem Progress và API breakdown mục14.
Migration đổi enum bằng rename/create/cast trong cùng transaction, không sửa
migration cũ, không backfill attendance/historical mentor. Đổi enum giữ lock bảng:
rollout ở cửa sổ bảo trì, dừng writers, migrate trước khi bật code. Down chỉ được
khi chưa có assignment history/receipts/actual clocks/IN_PROGRESS; có dữ liệu mới
thì giữ schema và rollback code, không xóa audit. Up/down/up và refusal test thật.
Admin PATCH mentor phải tách request khỏi các fields khác và gửi reason/version/key.
Cash quyền theo Order snapshot; Materials substitute handoff còn pending. Tiếp4.2.

Trạng thái hiện tại: core4.2 cũng đã triển khai. "Tiếp4.2" là handoff lịch sử
của mốc4.1; việc còn mở4.1 xem progress riêng, không suy toàn test matrix đã pass.

## 12. Implementation4.2 và rollout

Đã có migration1791849600001, AttendanceModule/controller/DTO/service và tests.
Regular start/roster/sync/mark/unmark/finalize; SessionLifecycleService public ở
Classes, enrollment roster readers public ở Enrollments. Không Classes→Attendance
import ngược. Session.class_id là cột ancestry do DB giữ; trigger INSERT derive
từ class_unit_id cho writers cũ, composite FK bảo vệ cả insert/update. Không thêm
field client có thể ghi để đổi ancestry; migration backfill chỉ class_id, không
mentor/attendance legacy. Attendance entity có classId và hai composite FKs cùng Class.

Snapshot ACTIVE cần createdAt/enrolledAt<=actual start. Sync nhận ACTIVE cùng
Class và cutoff, cho phép paid CASH sau start; PayOS late activation không admit.
Manager recovery start quá khứ không dùng ACTIVE hôm nay làm bằng chứng lịch sử.
Correction/legacy recovery4.3 vẫn cần roster/payment evidence riêng.
Mentor ghi trước deadline hết ngày học kế tiếp; Staff luôn reason và không deadline. Ghi/chốt/sync version,
audit và receipt atomic; no-op không tăng version. Class complete chặn các Session
SCHEDULED/IN_PROGRESS; cancel orchestration theo slice4.4a vẫn pending.

4.2 mark chỉ IN_PROGRESS; sửa sau chốt/canceled, GET audits và legacy recover là
4.3 theo [plan riêng](PHASE_4_3_ATTENDANCE_CORRECTIONS_HISTORY.md) và
[Progress4.3](../../progress/phase%204/PHASE_4_3_PROGRESS.md).
Student history/summary/schedule additive và guest là4.4. API thực tế xem
breakdown mục15, không coi full planned shapes là implemented. Không thêm biến
môi trường/dependency/network side effects hoặc thay entitlement Phase3.

Rollout migration trước code, dừng writers trong cửa sổ bảo trì vì ALTER/backfill/
parent UNIQUE/composite FK giữ lock. New INSERT trigger tương thích writers cũ;
down chỉ khi các bảng attendance/lifecycle/receipt rỗng, nếu có lịch sử thì fail
rõ và chỉ rollback code, giữ schema/audit. Clean DB/up-down-up/legacy no-backfill
và rollback refusal test thật. Staging/VPS/FE/browser chưa nghiệm thu.
Các nền tảng metrics/rate-limit/i18n chưa hoàn chỉnh vẫn theo baseline dự án;
slice này không ghi chúng đã đạt chỉ vì functional gates pass.

## 13. 2026-10-13 — Plan riêng và review code/progress

Đã tách detailed plans4.1/4.2, progress4.1/4.2 và flow/API entrypoints riêng.
Mỗi plan có AC, schema/ownership, bước triển khai, contract/gate/test matrix,
dependency và rollout/DoD; progress đối chiếu từng AC với source/assertions.
Core có implementation, nhưng Student mentor projection, substitute material
context, approved leave, full recovery/correction/cancel/guest và release vẫn mở.
Mixed-writer concurrency, edge và Staff HTTP test matrix chưa phủ đầy đủ.
Chỉ Markdown và source review; kiểm diff/link, không runtime tests/migrate/FE/deploy.
