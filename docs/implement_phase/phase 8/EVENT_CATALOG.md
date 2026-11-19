# Phase 8 — Event catalog đã chốt cho implementation

Ngày review: **20/11/2026**. BE: `757be19f401ab212686f3348e795dd89619b6670`.
Trạng thái: **R0 SOURCE REVIEW COMPLETE — chưa có business producer runtime**.
[Phase 8](PHASE_8_CONTRACTS_POLICY.md) · [Writers](WRITER_INVENTORY.md) ·
[Policy](RECIPIENT_POLICY.md) · [Contract](../../api_flow/BUSINESS_NOTIFICATIONS_flow-api-breakdown.md).

## 1. Envelope và identity

Envelope v1: eventId UUIDv4, schemaVersion=1, type theo catalog, aggregateType,
aggregateId UUID, aggregateRevision dạng string canonical, causeId UUIDv4,
occurredAt UTC do server cấp, actorId UUID|null, typed refs, notBefore UTC,
immutable recipient snapshot + relation/role/provenance cần thiết.

Một command có causeId lưu trong transaction/receipt; nested helper nhận cùng cause.
Receipt replay không chạy capture lần nữa. Command không có receipt lấy causeId mới
nhưng identity event vẫn theo transition/revision, không theo request UUID ngẫu nhiên.
Event identity unique = (type, aggregateId, aggregateRevision); inbox unique =
(userId, eventId). Delivery attempts không tạo eventId mới. Compare semantic before/
after ngay trong transaction; tăng version vì bookkeeping không đủ điều kiện phát.

Quy ước revision:
- Session: version sau thay đổi; publish/deadline: assignment.revision sau thay đổi.
- ZIP grade: gradeId + releasedVersion (aggregateId=submissionId); sửa điểm nháp
  làm tăng currentVersion nhưng chỉ release version mới mới được tạo event.
- Order PAID/EXPIRED: transition một lần trong vòng đời order, revision PAID/EXPIRED;
  reminder: expiresAt UTC ISO (hiện order không có expiry revision riêng).
- Class cancel: revision CANCELLED (lớp không có workflow reopen trong scope).
- Leave/placement: version sau thay đổi; material: content revision.
- CHAT_MESSAGE giữ identity chat hiện tại, không chuyển sang business outbox.

Actor mặc định excluded; ba event ORDER/PAYMENT giữ chủ order dù là actor.
Một người có nhiều relation nhận một row/event. Snapshot chụp trước mutation làm
mất quyền (old mentor/cancel/placement), chỉ lưu refs cần thiết; không lưu điểm,
nội dung chat, lý do nghỉ, URL hoặc thông tin ngân hàng.

## 2. Catalog, audience và target

A=active visibility; T=terminal generic; M=active cho người còn quyền, terminal cho
mentor bị thay. Chi tiết policy tại Recipient Policy. Target refs nội bộ không là URL.

| ID | Type | Trigger thật | Audience tại event | Mode / target |
| --- | --- | --- | --- | --- |
| N01 | SESSION_RESCHEDULED | startsAt/endsAt đổi trên buổi đã tồn tại, class không DRAFT | Student đúng schedule scope + effective mentor | A / SESSION |
| N02 | SESSION_MENTOR_CHANGED | effective mentor trước/sau khác, class không DRAFT | Student schedule scope + old/new effective mentor | M / SESSION |
| N03 | SESSION_CANCELLED | Buổi chuyển CANCELLED ngoài class-cancel cascade | Student regular/guest trước hủy + effective mentor | T / SESSION |
| N04 | CLASS_CANCELLED | Class chuyển CANCELLED từ trạng thái có audience | Student/guest và mentor bị ảnh hưởng trước hủy | T / CLASS |
| N05 | MAKEUP_SESSION_SCHEDULED | Insert successor có makeupForSessionId hợp lệ | Student scope của buổi thay thế + effective mentor | A / SESSION |
| N06 | ASSIGNMENT_PUBLISHED | DRAFT → PUBLISHED qua validation | Student có quyền AssignmentAccessService | A / ASSIGNMENT |
| N07 | ASSIGNMENT_DEADLINE_CHANGED | dueAt đổi trên published ZIP/CODE | Student có quyền assignment | A / ASSIGNMENT |
| N08 | ASSIGNMENT_GRADE_RELEASED | releasedVersion chuyển sang grade revision mới | Chủ ZIP submission | A / SUBMISSION |
| N09 | PAYMENT_CONFIRMED | PENDING → PAID thành công cùng activate enrollment | Owner order, không phụ thuộc quyền lớp | T / ORDER |
| N10 | ORDER_EXPIRING | Worker thấy PENDING, now < expiresAt <= now+24h | Owner order | A / ORDER |
| N11 | ORDER_EXPIRED | Persist PENDING → EXPIRED | Owner order | T / ORDER |
| N12 | MENTOR_LEAVE_REQUESTED | Insert PENDING request thành công | ACTIVE Manager/Admin có quyền xử lý hiện có | A / LEAVE |
| N13 | MENTOR_LEAVE_APPROVED | PENDING → APPROVED | Mentor requester | T / LEAVE |
| N14 | MENTOR_LEAVE_REJECTED | PENDING → REJECTED | Mentor requester | T / LEAVE |
| N15 | MAKEUP_PLACEMENT_CREATED | Insert placement ASSIGNED | Student được xếp + effective mentor target | A / MAKEUP |
| N16 | MAKEUP_PLACEMENT_CANCELLED | Explicit transition placement → CANCELLED | Student/target mentor snapshot trước hủy | T / MAKEUP |
| N17 | MATERIAL_PUBLISHED | Revision trở thành approved+published hợp lệ qua APPROVE hoặc PUBLISH | Student trong class-context snapshot | A / MATERIAL |

N17: APPROVE hiện đặt publishedAt; không đợi action PUBLISH mới capture.
Nếu availableAt tương lai, lưu event tại publication với notBefore=availableAt,
snapshot Student có relation/active enrollment tại publication, chưa giao inbox.
Worker tới hạn kiểm full material policy/file readiness; không gửi sớm hoặc thêm
late joiner. Không có worker tạo publication lịch sử khi bật tính năng.

N03/N04: snapshot guest trước trigger chuyển placement NEEDS_REASSIGNMENT.
Đây không phải placement CANCELLED; không phát N16 sai trạng thái.
N03+N05 từ leave approval là hai thông tin khác nhau (buổi cũ hủy, buổi mới được xếp);
cùng causeId liên kết, không tạo thêm N01 cho source không thực sự reschedule.
N04 suppress N03 cùng class-cancel cause; giữ guest notice một lần/user.
Chưa có SESSION_CREATED cho lịch khởi tạo, QUIZ deadline extension hoặc thông báo
điểm CODE/QUIZ trong catalog. CODE extend là writer N07 có sẵn.

## 3. Template v1

Body là câu cố định theo type, không nội suy dữ liệu riêng tư; title như bảng.

| Types | Title | Body |
| --- | --- | --- |
| N01 | Lịch học đã thay đổi | Lịch một buổi học của bạn đã được cập nhật. |
| N02 | Thay đổi giảng viên | Giảng viên của một buổi học đã thay đổi. |
| N03 | Buổi học đã hủy | Một buổi học liên quan đến bạn đã được hủy. |
| N04 | Lớp học đã hủy | Một lớp học liên quan đến bạn đã được hủy. |
| N05 | Đã xếp buổi học bù | Bạn có lịch học bù mới. |
| N06 | Có bài tập mới | Một bài tập mới đã được phát hành. |
| N07 | Hạn bài tập đã thay đổi | Hạn nộp một bài tập đã được cập nhật. |
| N08 | Kết quả đã công bố | Kết quả một bài làm của bạn đã được công bố. |
| N09 | Thanh toán thành công | Đơn hàng của bạn đã được xác nhận thanh toán. |
| N10 | Đơn hàng sắp hết hạn | Một đơn hàng của bạn sắp hết hạn thanh toán. |
| N11 | Đơn hàng đã hết hạn | Một đơn hàng của bạn đã hết hạn thanh toán. |
| N12 | Có yêu cầu nghỉ mới | Có yêu cầu nghỉ của giảng viên cần xử lý. |
| N13 | Yêu cầu nghỉ được duyệt | Yêu cầu nghỉ của bạn đã được duyệt. |
| N14 | Yêu cầu nghỉ bị từ chối | Yêu cầu nghỉ của bạn đã bị từ chối. |
| N15 | Đã xếp chỗ học bù | Một chỗ học bù liên quan đến bạn đã được xếp. |
| N16 | Chỗ học bù đã hủy | Một chỗ học bù liên quan đến bạn đã được hủy. |
| N17 | Có tài liệu mới | Một tài liệu học tập mới đã được phát hành. |

## 4. Scenario review — AC8-1

Đây là kịch bản phải implement/test ở phase producer, không phải test runtime đã chạy.
Toàn bộ scenario được đối chiếu nhánh mutation hiện có ở Writer Inventory.

| ID | Happy path cần chứng minh | Negative / rollback cần chứng minh |
| --- | --- | --- |
| N01 | Direct/bulk/swap đổi giờ, đúng một event/session version | Giờ không đổi, class DRAFT hoặc conflict rollback: 0 event |
| N02 | assignClass/assignSession làm effective mentor đổi | Override không đổi, old=new hoặc assignment conflict: 0 event |
| N03 | Hủy buổi thành công, guest snapshot còn nhận notice | Already cancelled/validation fail: 0 event; class cause suppress |
| N04 | Hủy lớp có nhiều buổi: một notice/user | Repeat/rollback: 0 event mới; không có N03 cùng cause |
| N05 | Manual makeup hoặc approved leave tạo successor | Duplicate successor/leave rollback: 0 event mới |
| N06 | Publish QUIZ/ZIP/CODE hợp lệ | Edit draft/readiness fail/publish repeat: 0 event mới |
| N07 | ZIP.extend/CODE.extend đổi dueAt | Chỉ tăng attempts, edit DRAFT hoặc stale revision: 0 event |
| N08 | Release ZIP grade v1 rồi release corrected v2 | grade() tạo draft v2, replay receipt, current=released: 0 event mới |
| N09 | Webhook/CASH/reconcile thật làm order PAID | Duplicate, sample webhook, REQUIRES_REVIEW hoặc rollback: 0 confirmed |
| N10 | Fake clock vào cửa sổ 24h: một reminder/expiry ISO | PAID/CANCELLED/đúng expiresAt hoặc stale replay: 0 reminder |
| N11 | Cron hoặc checkout cleanup persist EXPIRED | Read thấy hết giờ nhưng chưa persist, PAID hoặc repeat: 0 event |
| N12 | Mentor tạo request PENDING | Preview/duplicate receipt/invalid source rollback: 0 event mới |
| N13 | Approve leave thành công, requester nhận kết quả | Expired/withdrawn/stale/rollback: không APPROVED notice |
| N14 | Reject PENDING thành công | Withdraw/expiry không được biến thành REJECTED notice |
| N15 | Insert placement thành công, đúng Student/target mentor | Capacity/conflict/unique rollback: 0 event; peers không nhận |
| N16 | Explicit cancel placement chuyển trạng thái | Replay/version conflict hoặc trigger NEEDS_REASSIGNMENT: 0 N16 mới |
| N17 | APPROVE auto-publish/PUBLISH sau unpublish tạo eligible revision | Same revision republish không trùng; notBefore tương lai không gửi sớm; failed files/approval rollback: 0 row |
