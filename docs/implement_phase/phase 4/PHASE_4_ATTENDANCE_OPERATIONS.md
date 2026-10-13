# Phase 4 — Attendance, session operations và mentor dạy thay

Ngày lập: **2026-10-13**. Trạng thái: **PLAN — chưa implementation/migration/test/deploy**.
User duyệt nghiệp vụ điểm danh trong chat và bổ sung Manager tìm mentor trống lịch,
đổi phân công khi mentor bận đột xuất. Các lựa chọn kỹ thuật dưới đây là thiết kế
triển khai, chưa phải API đang chạy.

[Flow](../../api_flow/PHASE_4_FLOW.md) ·
[API breakdown](../../api_flow/PHASE_4_flow-api-breakdown.md) ·
[Progress](../../progress/phase%204/PHASE_4_PROGRESS.md).

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

1. ONLINE/OFFLINE đều mentor đánh dấu thủ công. Student chỉ xem kết quả của mình.
2. Buổi học: SCHEDULED → IN_PROGRESS → COMPLETED. Manager/Admin có thể hủy
   SCHEDULED; hủy IN_PROGRESS cần lý do, giữ audit/attendance, loại khỏi chuyên cần.
   Không có mở lại COMPLETED hoặc xóa giờ bắt đầu để kéo dài quyền.
3. Bắt đầu buổi học không đồng nghĩa bắt đầu cả Class. Mentor bắt đầu Session
   thuộc Class OPEN/IN_PROGRESS; lần bắt đầu đầu tiên có thể atomically đưa Class
   OPEN → IN_PROGRESS theo transition hiện hành, đóng đăng ký như source Phase 2.
4. Lần bắt đầu đầu tiên ghi actualStartedAt, startedBy, teachingMentorId và
   editableUntil = actualStartedAt + 24h. Timestamp UTC, hiển thị APP_TIME_ZONE.
   Server time quyết định; `now < editableUntil`, đúng deadline đã hết quyền.
5. Chưa tick = UNMARKED khi đang học. Tick = PRESENT; bỏ tick trước chốt trở về
   UNMARKED. Kết thúc/chốt chuyển UNMARKED → ABSENT trong cùng transaction.
6. FE xác nhận tổng có mặt/vắng trước chốt. Chốt sau deadline do Manager/Admin
   xử lý; hệ thống không tự coi quá giờ lịch hoặc quá 24h là ABSENT/COMPLETED.
7. Mentor được phân công hiệu lực cho buổi sửa PRESENT/ABSENT sau chốt trong
   24h, kể cả Class vừa COMPLETED. Không trả về UNMARKED sau chốt.
8. Manager/Admin sửa kết quả bất kỳ lúc nào sau khi buổi đã bắt đầu, kể cả
   enrollment/Class đã hoàn thành hoặc bị hủy; bắt buộc lý do và audit. Buổi hủy
   vẫn không tính vào tỷ lệ. Không tạo attendance cho Session chưa từng bắt đầu.
9. Mentor quên thao tác: operational query hiển thị OVERDUE_NOT_STARTED và
   STARTED_NOT_FINALIZED. Manager khôi phục bằng start có actualStartedAt thực
   tế + reason, rồi chốt; không sửa hạn để cấp lại quyền mentor. Thời gian thực
   tế không tương lai và phải bảo đảm start < end khi chốt phục hồi.
10. LATE/EXCUSED có trong DBML tham khảo nhưng chưa đưa vào MVP; không auto
    check-in online, QR, xin nghỉ có duyệt hoặc tạo chứng chỉ trong phase này.

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
- Candidate phải user ACTIVE, role MENTOR. Hiện chưa có qualification/leave/
  đăng ký availability thật sự: MVP “trống lịch” nghĩa không trùng lịch dạy trong
  hệ thống, không hứa mentor đã xác nhận sẵn sàng hoặc được duyệt môn học.
- Occupied: buổi SCHEDULED/IN_PROGRESS của Class OPEN/IN_PROGRESS, theo effective
  mentor; IN_PROGRESS vẫn chiếm lịch dù Class bị kết thúc trước khi Session chốt.
  Buổi đang học quá endsAt vẫn chặn phân công buổi đang diễn ra cho cùng mentor
  cho tới chốt/hủy. Class DRAFT không giữ chỗ lịch, kiểm lại khi open.
- So sánh interval `[startsAt, endsAt)`: a.start < b.end && a.end > b.start.
  Hai buổi tiếp giáp được phép; không tự thêm travel buffer trong MVP.
- Với thay mentor giữa buổi, kiểm phần còn lại `[max(now, startsAt),
  max(endsAt, now + 1ms))` và xung đột buổi đang IN_PROGRESS của candidate.
  Availability trả asOf, checkedFrom/checkedTo và sessionVersion; không giữ slot.
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
  tăng version tương ứng. Class completion từ chối nếu còn Session IN_PROGRESS;
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
- Validate cùng Class qua enrollment → Class và Session → Class Unit → Class;
  chốt cách bảo vệ ancestry ở DB (constraint trigger hoặc denormalized composite
  FK có review) trước migration, không chỉ dựa vào UUID client gửi.
- Migration additive mới, enum upgrade có rollout riêng; backfill version,
  không tạo ABSENT cho Session COMPLETED cũ. Buổi cũ thiếu attendance trả
  legacy/no-data và bị loại mẫu số tới khi Manager phục hồi có chứng cứ.
- Đổi mentor chủ nhiệm không làm thay các Session đã COMPLETED trước migration:
  review backfill historical mentor; nếu không có chứng cứ snapshot, đánh dấu
  legacy unknown, không trình bày mentor hiện tại là người đã dạy buổi cũ.

StudentLearningModule đọc qua provider public Attendance/Classes; UsersModule
cung cấp mentor ACTIVE query. Không có vòng phụ thuộc với Payments/Materials.

## 5. Đổi lịch, hủy và học bù

- Manager/Admin dùng command riêng đổi thời gian của SCHEDULED, đủ start/end
  ISO timestamp, cùng ngày hoặc ngày khác, trong Class period và kiểm conflict.
  Không dùng API sửa giờ Phase 2.3 (giữ ngày) để giả vờ đổi ngày học bù.
- Manager/Admin hủy buổi với reason. Cấm thay lịch khi IN_PROGRESS/COMPLETED.
- Bù thay thế: original CANCELLED + replacement SCHEDULED cùng Class, FK
  makeup_for_session_id; mỗi buổi gốc tối đa một replacement không CANCELLED.
  Hủy buổi bù rồi tạo lại vẫn giữ chain/audit, không tạo vòng hoặc đổi Class.
- Mẫu số chỉ tính replacement đã chốt, original bị loại; buổi bổ sung thật sự
  không có makeup_for_session_id thì được tính riêng khi đã chốt/thuộc roster.
- Luồng nghỉ có duyệt, đăng ký slot, email trước 1 ngày và notification là scope
  sau; hiện Manager chủ động đổi/hủy/phân công. Ghi rõ chưa tự gửi email Phase 4.

## 6. Operational queries

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
- Summary theo lớp: present/absent/unmarked/excluded/finalizedEligibleCount,
  rate = present / finalizedEligibleCount * 100; mẫu số 0 → rate=null.
  Chỉ Session COMPLETED đã chốt và roster hợp lệ; UNMARKED/legacy/cancelled loại.
- Manager incomplete sessions: OVERDUE_NOT_STARTED nếu SCHEDULED và now >= endsAt;
  STARTED_NOT_FINALIZED nếu IN_PROGRESS, trả severity/deadline để ưu tiên xử lý.
- Danh sách phân trang ổn định, giới hạn date range/pageSize, không N+1.
  Revenue/order reports mới không nằm trong Phase 4, payment APIs hiện hữu giữ nguyên.

## 7. Các slice triển khai và nghiệm thu

| Slice | Deliverable có thể nghiệm thu | Gate |
|---|---|---|
| 4.1 Mentor availability + substitution | Additive assignment/version/audit migration; management Class reads; candidate APIs; đổi mentor buổi/lớp; effective mentor conflict provider; mentor schedule | Wrong role/assignment, overlap, adjacent, override, class change, concurrent last slot, revoke old mentor, add/reschedule/open regressions |
| 4.2 Session lifecycle + roster | Attendance migration; start/snapshot/sync roster; read roster; mark/unmark; finalize; manager recovery | Cash activation/cutoff, same ancestry, rollback/audit, retry start/finalize, overdue, state transitions |
| 4.3 Corrections + history | Mentor deadline; Manager unrestricted-time correction + reason; optimistic version; audit query | Deadline boundary, stale edits, mentor swap giữa buổi, manager edit sau Class completion/cancellation, revoked role |
| 4.4 Student + operations + makeup | Additive /me/schedule; own history/class summary; incomplete query; reschedule/cancel/makeup | Ownership, legacy/no data, denominator, canceled/makeup/late joins, pagination/query plans; FE flow |
| 4.5 Integration + release | Swagger/Postman/FE handoff; migration rehearsal; regression và staging acceptance | pnpm check + pnpm test:http; real PostgreSQL races; all role browser smoke; VPS evidence riêng |

Mỗi slice phải chạy được migration → use case → API → meaningful tests; không
tạo toàn bộ schema rồi trì hoãn authorization/API. 4.1 đã cần tích hợp checker
chung trong writer hiện hữu, không đợi 4.5 mới kiểm trùng lịch.

Ước lượng BE **8–12 ngày làm việc**, FE **3–5 ngày**, provisional; phụ thuộc
review migrations/lock order và tích hợp shared files với Phase 3, không cam kết
ngày xong. Thứ tự 4.1 → 4.2 → 4.3 → 4.4 → 4.5; Phase 3 tiếp tục song song.

## 8. Ma trận test bắt buộc

- Hai Manager gán cùng mentor cho hai buổi trùng: chỉ một commit, một 409.
- Đổi buổi vs đổi lịch/bulk/open/đổi mentor lớp: không lọt xung đột hoặc deadlock.
- Dạy thay A→B: B thấy buổi; A mất write; primary Class quyền khác không đổi.
- Đổi giữa buổi: deadline/startedBy giữ nguyên, audit có A/B, không cấp tiền/materials.
- Tick/bỏ tick/finalize đồng thời: expectedVersion stale bị 409, không mất dữ liệu.
- Start retry không chụp roster/deadline lại; finalize retry không audit vắng hai lần.
- 23:59:59 còn sửa, đúng 24h bị chặn; Manager sửa lúc nào cũng được với reason.
- CASH pending không attendance; activation trước chốt admit có audit, không làm
  mentor dạy thay trở thành cash order owner; enrollment created sau start không admit.
- Wrong Class enrollment, sai Student, guessed IDs và account inactive bị chặn.
- Buổi quên điểm danh giữ UNMARKED/chưa start; hết giờ không tự ABSENT.
- Legacy COMPLETED không ABSENT backfill; canceled/original makeup không denominator.
- Rời lớp giữ snapshot; own history đọc được nhưng materials không mở lại.
- Migrations clean DB và up/down/up; enum rollback không mất dữ liệu âm thầm:
  rollback chỉ khi không còn IN_PROGRESS/new references, nếu không phải fail rõ.

## 9. Definition of done

- Tất cả endpoint planned chuyển implemented chỉ sau controller/DTO/test evidence.
- Flow, API breakdown, progress, Swagger/Postman và FE contract cùng revision.
- pnpm check, HTTP gate, PostgreSQL concurrency và migration rehearsal pass.
- Manager tìm mentor trống → gán → mentor thay bắt đầu/điểm danh/chốt → Student
  thấy kết quả → Manager sửa ngoài 24h chạy end-to-end trên staging/VPS.
- Local pass không thay cho deploy/VPS hoặc live payment evidence.
- Handover rõ limitations: availability chưa leave/qualification, payment snapshot,
  substitute material context integration, notifications/certificate còn hoãn.
