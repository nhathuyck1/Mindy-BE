# Roadmap Phase 8–15 — Notification nghiệp vụ ngoài message

**Cập nhật runtime 20/11/2026:** [Phase 16](phase%2016/PHASE_16_BELL_NOTIFICATIONS_WEBSOCKET.md)
đã triển khai local foundation dùng chung và các producer nghiệp vụ tại persistence
boundary, bổ sung 5 types/reminders và transport Mentor/Student riêng. Contract
hiện hành có [override Phase 16](../api_flow/PHASE_16_flow-api-breakdown.md#5-runtime-hiện-hành--20112026).
Các mô tả chưa-runtime/PLANNED của baseline bên dưới và 32 AC cũ không phải trạng
thái nghiệm thu Phase 16; formal gates/FE/production vẫn theo progress riêng.

Extension planning 20/11/2026: [Phase 16 — chuông Mentor/Student qua WebSocket](phase%2016/PHASE_16_BELL_NOTIFICATIONS_WEBSOCKET.md)
tái sử dụng Phase 9–14, đề xuất transport độc lập chat và ZIP/review/reminders mới.
Đây là phạm vi riêng 6 slices/12 AC PLANNED, không đổi 32 AC hoặc trạng thái
Phase 8–15; extension contract được mô tả tại [API/WS16](../api_flow/PHASE_16_flow-api-breakdown.md).

Ngày lập: **20/11/2026**. Trạng thái: **Phase 8 hoàn tất R0/source review; Phase 9–15 PLANNED — chưa có business runtime/migration/deploy**.

Yêu cầu: mở rộng notification ngoài message; ưu tiên lịch học → bài tập → thanh toán
→ nghỉ/bù → tài liệu. Tài liệu theo cấu trúc implement Phase 6/7: roadmap chung,
phase, tasks, acceptance criteria, flow, API contract và progress. Phase 8 đã chốt
contract triển khai trong các artifact liên kết dưới đây; schema/flags/API mới
chưa được nối runtime. Chi tiết đã chốt tại artifact Phase 8 có ưu tiên hơn baseline đề xuất.

- [Flow](../api_flow/BUSINESS_NOTIFICATIONS_FLOW.md)
- [API proposal](../api_flow/BUSINESS_NOTIFICATIONS_flow-api-breakdown.md)
- [Progress](../progress/BUSINESS_NOTIFICATIONS_PROGRESS.md)
- Baseline: [Phase 6](phase%206/PHASE_6_CHAT_NOTIFICATIONS.md) và
  [inbox 6.5](phase%206/PHASE_6_5_NOTIFICATION_INBOX.md).

## 1. Baseline source và khoảng trống

**R0 20/11/2026 hoàn tất:** [catalog](phase%208/EVENT_CATALOG.md),
[writer inventory](phase%208/WRITER_INVENTORY.md), [policy](phase%208/RECIPIENT_POLICY.md),
[FE target mapping](phase%208/FE_TARGET_MAPPING.md) và [review evidence](phase%208/R0_REVIEW.md).

### Phương án hoạt động đã duyệt — 20/11/2026

User đã duyệt kênh thông báo và cách hoạt động:

- Thông báo trong ứng dụng Mindy qua chuông, badge số chưa đọc và inbox.
- Sau khi nghiệp vụ commit, backend lưu sự kiện và worker tạo durable inbox
  cho đúng recipient; offline vẫn nhận khi quay lại qua API đồng bộ.
- Student/Mentor nhận realtime qua Socket.IO khi transport đang bật, kết hợp
  refetch API khi mở ứng dụng/focus/reconnect.
- Manager/Admin nhận qua REST; khi mở inbox, refresh mỗi 30 giây theo flow.
- Click mở resource tương ứng và kiểm tra lại quyền hiện hành.
- Chưa thêm email/SMS/push trình duyệt hoặc điện thoại; email xác nhận thanh toán
  hiện có tiếp tục là luồng riêng.

Đây là phê duyệt phương án hoạt động, chưa phải evidence implementation hoặc
nghiệm thu các AC. Các chi tiết schema/flag/reminder và tiêu chí kỹ thuật bên dưới
đã được chốt ở contract R0 để triển khai; mọi thay đổi sau này cần cập nhật contract và regression matrix.

Đối chiếu source tại `origin/dev` revision `757be19`:

| Nguồn hiện có | Điều phải giữ / khoảng trống |
| --- | --- |
| `src/database/migrations/1792800000001-chat-lifecycle.ts` | Notifications CHECK chỉ CHAT_MESSAGE; actor, conversation/message bắt buộc; unique user/type/message. Không thể chỉ thêm enum rồi dùng cho nghiệp vụ khác. |
| `src/modules/chat/services/chat-notifications.service.ts` | Fanout idempotent, generic payload, visibility theo chat, read/read-all, retention 90 ngày. Business visibility phải có provider riêng. |
| `src/modules/chat/controllers/notifications.controller.ts` | Bốn route inbox chỉ Mentor/Student, đang dùng chat guards/service và feature flag. |
| `src/modules/chat/services/chat-socket.service.ts` | Namespace /chat, Mentor/Student, CHAT_ENABLED. Không cấp Manager/Admin quyền vào chat để nhận noti. |
| `src/modules/classes/services/{session-operations,class-schedule,teaching-assignment,classes}.service.ts` | Có reschedule/cancel/makeup, bulk updateSessionTimes, đổi mentor buổi/lớp và hủy lớp; phải bao phủ mọi writer. |
| `src/modules/assignments/services/{assignments,zip-submissions,code-review}.service.ts` | Publish/archive, ZIP extend/release, CODE rejudge/void. Không giả định mọi loại bài đều có release điểm thủ công. |
| `src/modules/assignments/services/code-submission-notifier.ts` | code_submission.updated là realtime yêu cầu refetch; không tự coi mỗi trạng thái runner là một inbox notification. |
| `src/modules/payments/services/{payment-settlement,cash-payments,payment-email}.service.ts` | Có settlement và email xác nhận riêng. In-app không gọi lại email hoặc làm thay đổi settlement. |
| `src/modules/commerce/services/order-expiry.service.ts` | Có expiresAt và nhiều đường persist expiry; reminder là chức năng mới. |
| `src/modules/teaching-operations/services/mentor-leave.service.ts` | Có create/approve/reject/withdraw và expiry; đây là mentor leave, không suy thành luồng Student xin nghỉ mới. |
| `src/modules/attendance/services/makeup-placement.service.ts` | Có xếp/hủy chỗ học bù; không giả định có luồng đơn xin học bù cần duyệt. |
| `src/modules/materials/services/material-authoring.service.ts` | APPROVE/PUBLISH/UNPUBLISH riêng; chỉ phát khi nội dung thực sự được Student nhìn thấy. |

Các đường dẫn brace ở bảng là nhóm file tham khảo, không phải tên file literal.
Khi triển khai phải đối chiếu lại revision mới và lập writer inventory trước nối event.

## 2. Phạm vi và giả định nghiệp vụ

### Trong phạm vi

Một inbox chung có trạng thái đọc độc lập cho từng người, chứa CHAT_MESSAGE và
các sự kiện dưới đây; tự tạo async sau khi thay đổi nghiệp vụ đã commit.
Offline vẫn có inbox. Click mở đúng resource qua quyền hiện hành.

| Nhóm / type dự kiến | Trigger hợp lệ | Người nhận |
| --- | --- | --- |
| SESSION_RESCHEDULED | Lịch buổi thay đổi thực sự, gồm bulk update | Student có quyền xem lịch buổi; mentor hiệu lực |
| SESSION_MENTOR_CHANGED | Thay mentor làm đổi người dạy hiệu lực | Student của buổi; mentor cũ/mới |
| SESSION_CANCELLED / CLASS_CANCELLED | Hủy buổi / hủy lớp thành công | Student bị ảnh hưởng; mentor bị ảnh hưởng |
| MAKEUP_SESSION_SCHEDULED | Tạo buổi bù thay thế thành công | Student thuộc phạm vi buổi bù; mentor hiệu lực |
| ASSIGNMENT_PUBLISHED / ASSIGNMENT_DEADLINE_CHANGED | Publish lần đầu / ZIP hoặc CODE extend đổi hạn bài published | Student thực sự được truy cập bài |
| ASSIGNMENT_GRADE_RELEASED | ZIP release lần đầu hoặc release lại revision điểm đã sửa; grade draft không gửi | Chủ submission; không broadcast điểm cả lớp |
| PAYMENT_CONFIRMED | Settlement thành công / CASH được xác nhận thành công | Chủ order |
| ORDER_EXPIRING / ORDER_EXPIRED | Cửa sổ nhắc hạn / persist EXPIRED | Chủ order còn hợp lệ với sự kiện |
| MENTOR_LEAVE_REQUESTED | Tạo mentor leave PENDING | Manager/Admin đang có quyền xử lý request |
| MENTOR_LEAVE_APPROVED / MENTOR_LEAVE_REJECTED | Request chuyển trạng thái thành công | Mentor gửi request |
| MAKEUP_PLACEMENT_CREATED / MAKEUP_PLACEMENT_CANCELLED | Xếp/hủy chỗ bù thực sự | Student được xếp; mentor đích còn quyền |
| MATERIAL_PUBLISHED | Revision approved được publish và có phạm vi Student truy cập | Student thuộc lớp/buổi có quyền đọc material |

Mặc định đề xuất:
- Không gửi cho actor thực hiện hành động, ngoại trừ PAYMENT_CONFIRMED,
  ORDER_EXPIRING và ORDER_EXPIRED vì chủ đơn vẫn cần xác nhận trạng thái của mình.
- Không fanout cho người gia nhập sau thời điểm event. Recipients phải thỏa
  eligibility tại event và policy hiện hành lúc xử lý/đọc/phát realtime.
- Lịch bị hủy và mentor bị thay vẫn cần nhận thông tin kết thúc phạm vi của mình:
  dùng relation snapshot đã xác thực tại event cho cancellation/removal notice,
  payload tối thiểu; không dùng notice để mở lại quyền resource đã mất.
- Đổi mentor ở lớp chỉ thông báo những buổi tương lai có effective mentor thay đổi;
  assignment override còn hiệu lực không sinh noti đổi người dạy.
- Hủy lớp gửi một CLASS_CANCELLED/người, không kèm N SESSION_CANCELLED cùng cause.
  Reschedule từ duyệt leave gửi lịch mới tới Student, kết quả leave tới người gửi.
  Placement notification chỉ tới đúng học viên; không broadcast toàn lớp đích.
- Reminder mặc định một lần/order/expiry revision trong 24 giờ cuối trước expiresAt;
  order tạo với thời hạn ngắn hơn được xét ở lượt worker kế tiếp nếu còn PENDING.
  Không nhắc sau expiry, không gửi bù reminder cũ khi khôi phục worker.
- Nội dung tiếng Việt generic, không chứa điểm, đáp án, lý do nghỉ, thông tin ngân hàng,
  signed URL hay nội dung chat. Lịch/điểm/thanh toán chi tiết đọc từ resource API.
- Giữ lịch sử terminal notice tối đa 90 ngày cho recipient snapshot có tài khoản ACTIVE;
  target có thể unavailable. Khi khóa tài khoản thì REST/socket đều từ chối.
- Nếu có nhiều lần thay đổi thật thì mỗi revision là event mới; replay/retry cùng
  revision không tạo trùng. Sửa draft/no-op/rollback không tạo thông báo.

### Ngoài phạm vi

Email/SMS/push mobile mới, preference/mute/digest, nhắc giờ vào học/hạn bài tập,
noti từng lần nộp bài/từng trạng thái runner, workflow Student xin nghỉ mới,
workflow xin học bù mới, dashboard counters ngoài unread và nhiều replica realtime.
Email payment hiện có giữ luồng riêng. FE là phase bàn giao/triển khai sau backend,
không được đánh dấu hoàn thành từ kết quả test BE.

## 3. Kiến trúc đề xuất và dữ liệu

NotificationsModule sở hữu inbox/read state/business outbox; các domain sở hữu
event và policy. Composition nối provider, không import vòng Chat ↔ Notifications.
Chat chỉ cung cấp adapter CHAT_MESSAGE, giữ nguyên một chiều conversation-read
→ notification-read. Đọc notification không làm đọc conversation.

### 3.1. Schema và tương thích

Migration mới, không sửa migration cũ đã chạy:
- Mở rộng bảng notifications giữ nguyên id/read_at/created_at và rows CHAT_MESSAGE.
  Thêm event_id, resource_type/resource_id, dedupe_key và data có schema/version.
  Với business row cho phép actor_id null (worker), conversation_id/message_id null;
  CHECK theo type bảo đảm CHAT_MESSAGE vẫn có actor/conversation/message đầy đủ.
  Giữ composite FK message và unique chat cũ; thêm unique(user_id,dedupe_key)
  cho business. Business dedupe_key lấy event id/type/resource revision ổn định.
- Thêm business outbox/jobs và recipient snapshot theo batch/checkpoint riêng;
  không trộn chat_events với payment/session events. Event/recipient/job cùng
  transaction với mutation, không chỉ emit sau commit rồi hy vọng retry.
- Event có eventId, type, aggregateId, revision/causeId, occurredAt, schemaVersion,
  actorId nullable, recipient cutoff/snapshot và typed resource refs tối thiểu.
  Snapshot theo tập recipient thực tại event, không chỉ query membership hiện tại
  bằng timestamp gần đúng. R0 chọn chụp recipient rows ngay trong transaction,
  batch INSERT khi roster lớn; chưa dùng deferred mutable roster query.
- Index inbox (user, created_at DESC, id DESC), unread, business dedupe,
  pending job/available_at và expiry candidates. Không quét toàn inbox để count.
- Không bootstrap notification lịch sử. Activation watermark cho từng producer;
  rollout/retry giữ event mới, không phát lại mọi audit row cũ.
- Retention đề xuất inbox/completed jobs 90/30 ngày; dedupe/processed-event markers
  giữ ít nhất bằng cửa sổ replay tối đa 90 ngày. Replay event cũ hơn bị từ chối,
  tránh xóa inbox rồi replay tạo lại unread.

### 3.2. Worker và độ tin cậy

Lease/claim có khóa, bounded batch, checkpoint, backoff, max attempts, dead-letter.
Một logical event-recipient có tối đa một inbox row khi crash trước/sau insert.
Worker reauthorize trước insert và trước socket emit; packet chứa dữ liệu tối thiểu.
Socket giao ít nhất một lần, FE dedupe theo notification.id; inbox là nguồn chính.
Sự cố socket không hủy mutation và không mất inbox. Nếu ghi durable event thất bại,
transaction mutation rollback; sau durable commit, lỗi fanout được retry độc lập.

Capture không bị tắt theo NOTIFICATIONS_ENABLED: producer lưu event mới khi schema
đã rollout; flags chỉ điều khiển API/business worker/delivery. Tạm tắt không mất
event; bật lại bỏ reminder stale và revalidate các event khác. CHAT_MESSAGE vẫn
theo flags/cơ chế cũ cho tới khi adapter đã qua regression.

### 3.3. Quyền, visibility và hiệu năng

Provider cho CHAT, SESSION, CLASS, ASSIGNMENT, ORDER, LEAVE, MAKEUP, MATERIAL
dùng entitlement/read policy hiện hành của domain, không coi chat membership là
quyền học. CASH_PREVIEW chỉ thấy lịch/thanh toán mà policy cho phép; không thấy
assignment/material private. Manager/Admin chỉ nhận và mở request mình được xử lý; hiện service cho ACTIVE
ADMIN/MANAGER xử lý toàn hệ thống, chưa có tenant/team scope riêng.

Đối với active notices, mất quyền thì ẩn khỏi list/count/read/socket. Đối với
cancellation/removal/expiry notices, giữ generic notice theo event-time relation
snapshot và current ACTIVE account; target unavailable nếu resource policy deny.
Đơn thanh toán vẫn theo owner của order, không phụ thuộc enrollment còn active.
Không trả metadata riêng tư của lớp khác trong lỗi hoặc target unavailable.

List dùng keyset pagination và batch authorization; count dùng cùng policy.
Unread count là tổng tất cả type đang visible trong 90 ngày. Read-all snapshot IDs
chỉ đánh dấu rows nhìn thấy ở thời điểm bắt đầu; fanout mới vẫn unread. Tất cả GET
không làm thay đổi trạng thái đọc.

## 4. Kế hoạch theo phase độc lập

| Phase | Plan | Phụ thuộc | Release |
| --- | --- | --- | --- |
| 8 | [Contract, event và quyền](phase%208/PHASE_8_CONTRACTS_POLICY.md) | Phase 6/nguồn domain | R0 review |
| 9 | [Inbox và worker dùng chung](phase%209/PHASE_9_SHARED_INBOX.md) | 8 | R1 nền tảng |
| 10 | [Lịch học và mentor](phase%2010/PHASE_10_SCHEDULE.md) | 9 | R2 ưu tiên đầu |
| 11 | [Bài tập và công bố điểm](phase%2011/PHASE_11_ASSIGNMENTS.md) | 9 | R3 |
| 12 | [Thanh toán và hạn đơn](phase%2012/PHASE_12_PAYMENTS.md) | 9 | R3 |
| 13 | [Nghỉ và xếp học bù](phase%2013/PHASE_13_LEAVE_MAKEUP.md) | 10 | R4 |
| 14 | [Tài liệu phát hành](phase%2014/PHASE_14_MATERIALS.md) | 9 | R4 |
| 15 | [FE, gates và vận hành](phase%2015/PHASE_15_HANDOFF_OPERATIONS.md) | Phase 8–14 | R5 |

Mỗi phase có file kế hoạch riêng, phạm vi, dependency và gate nghiệm thu riêng.
Task và acceptance criteria sử dụng mã của phase tương ứng.

Có **32 tasks và 32 acceptance criteria**: Phase 8 đạt **4/4 AC source review**;
28 AC còn lại chưa có runtime evidence. [Review R0](phase%208/R0_REVIEW.md) ghi rõ giới hạn.
Thứ tự triển khai ưu tiên 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15.
Không bắt buộc bật đồng thời mọi producer; mỗi release chỉ bật sau gate riêng.

## 5. Gate kiểm chứng và rollout

1. R0: event catalog, writer inventory, recipient/visibility matrix, API version và
   FE target mappings được đối chiếu source; mọi giả định ở mục 2 được review.
2. R1: schema fresh/upgrade/repeat, bảo toàn chat rows/read/cursor, fake worker
   clock, crash barriers, read-all concurrency, owner denial và account revoke.
3. R2–R4: transaction rollback, no-op/retry, fanout cutoff/revocation và HTTP
   integration trên DB test riêng cho từng producer. Race thanh toán/expiry phải
   chứng minh không gửi xác nhận sai hoặc reminder đã stale.
4. R5: `pnpm check`, compiled `pnpm test:http`, real sockets, FE đa tab/offline/
   reconnect/target unavailable, flags OFF/ON và restore/replay trên môi trường test.
   Ghi rõ suites pass/fail/skip; critical skip không được gọi là complete.
5. Deploy schema tương thích trước, API/adapter và FE chịu optional fields tiếp theo,
   worker/producer delivery bật cuối theo watermark. Mở Manager/Admin inbox bằng
   REST; unified API dùng /api/v1/notification-inbox và event notification-inbox:*
   tách khỏi legacy /notifications + chat events. Namespace realtime riêng là extension sau, không mở quyền chat.
6. Rollback bằng tắt business delivery/worker và bản code tương thích schema mở rộng;
   không down migration phá business rows. Backup/restore giữ inbox/outbox/dedupe.
   Trước rollback phải kiểm CHECK mới tương thích bản code cũ và khóa flags cần thiết.

Mục tiêu nghiệm thu đề xuất: trong môi trường test khai báo tài nguyên/tải cụ thể,
95% event có inbox trong 10 giây khi worker khỏe; 0 row trùng và 0 lộ dữ liệu trong
toàn bộ retry/revoke test matrix. Ở fixture 100 người nhận/event, 10.000 rows/user,
list/count p95 dưới 500ms; ghi số đo thật, chưa coi đây là kết quả đạt.

## 6. Gói bàn giao

Plan/phases, flow/API proposal, progress; khi implementation bổ sung Swagger,
Postman, env examples, migration manifest, runbook notification riêng và source
+ test + log theo từng AC. Tài liệu Phase 6 giữ vai trò baseline chat; chỉ cập nhật
contract hiện hành khi runtime thực sự đổi, không sửa lại lịch sử nghiệm thu cũ.

## 7. Quyết định R0 điều chỉnh baseline

- Unified inbox dùng route mới /api/v1/notification-inbox; legacy /notifications
  và event chat giữ riêng để không ép client cũ nhận business DTO.
- Leave approve tạo N03 cancellation + N05 replacement cùng cause, không giả
  thành N01 reschedule. CODE.extend là writer deadline riêng phải bao phủ.
- MATERIAL APPROVE có thể auto-publish; notBefore theo availableAt, không gửi sớm.
- Snapshot guest trước trigger NEEDS_REASSIGNMENT; không gọi trigger đó là explicit
  placement cancellation. Chi tiết catalog/writer/policy/API R0 là nguồn triển khai.
