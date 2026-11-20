# Phase 16 — Chuông notification Mentor/Student qua WebSocket

Ngày lập: **20/11/2026**. Trạng thái: **BE IMPLEMENTED LOCAL — gates/evidence hiện hành tại progress; FE/deploy chưa nghiệm thu**.

[Flow](../../api_flow/PHASE_16_FLOW.md) ·
[API/WS proposal](../../api_flow/PHASE_16_flow-api-breakdown.md) ·
[Progress](../../progress/phase%2016/PHASE_16_PROGRESS.md) ·
[Nền tảng Phase 8–15](../BUSINESS_NOTIFICATIONS_ROADMAP.md).

## 1. Mục tiêu và dependency

Implementation cập nhật 20/11/2026: foundation Phase 9 chưa tồn tại nên Phase 16
đã bổ sung một NotificationsModule dùng lại bảng notifications, migration additive
1795132800000 và business outbox/recipient checkpoints chung. Không tạo inbox
thứ hai. Các ghi chú PLANNED/dependency bên dưới là baseline trước implementation;
không tự đóng 32 AC của Phase 8–15 từ evidence Phase 16.

Student/Mentor nhận thông báo nghiệp vụ trên chuông, badge và inbox; online cập
nhật qua Socket.IO, offline đồng bộ REST khi quay lại. Phạm vi phase này loại
chat; legacy chat tiếp tục riêng. Không tạo bảng inbox hoặc worker thứ hai.

Phase 8 đã có contract review; Phase 9–15 còn PLANNED theo tài liệu hiện tại.
Phase 16 phụ thuộc Phase 9 (schema, durable outbox, recipient snapshot, policy,
inbox/read API). Các producer lịch/bài tập/thanh toán/nghỉ-bù/tài liệu thuộc
Phase 10–14: tái sử dụng và kiểm chứng từng nhóm, không coi chúng đã implement.
Có thể làm transport sau Phase 9; chỉ bật một nhóm khi producer tương ứng có evidence.

Quyết định mở rộng so với baseline Phase 8: transport riêng không phụ thuộc
CHAT_ENABLED; thêm notification chờ chấm ZIP, kết quả duyệt tài liệu và reminders.
Khi code phải cập nhật catalog/policy/mapping/contract chung cùng revision; không
âm thầm thay catalog 17 business types đã chốt R0 hoặc đánh lại AC phase cũ.

## 2. Catalog và điều kiện gửi

Các type cũ dùng đúng catalog Phase 8; tên type mới dưới đây là **đề xuất Phase 16**.
Thông báo do mutation chỉ sinh sau thay đổi thật, snapshot recipient cùng transaction;
retry/no-op/rollback không tạo thêm. Người thao tác không tự nhận, trừ owner order
theo policy Phase 8. Mỗi người một trạng thái đọc độc lập.

| Nhóm | Type | Người nhận và trigger |
| --- | --- | --- |
| Lịch học/dạy | SESSION_RESCHEDULED | Student được xem lịch và mentor hiệu lực khi ngày/giờ thực sự đổi, gồm bulk update |
| Phân công | SESSION_MENTOR_CHANGED | Student bị ảnh hưởng, mentor cũ/mới khi người dạy hiệu lực đổi; override không đổi thì không gửi |
| Hủy | SESSION_CANCELLED, CLASS_CANCELLED | Student/mentor bị ảnh hưởng; hủy lớp chỉ một notice/user/cause, không cascade spam từng buổi |
| Buổi bù | MAKEUP_SESSION_SCHEDULED | Student thuộc phạm vi buổi bù và mentor hiệu lực khi buổi thay thế được tạo |
| Bài tập | ASSIGNMENT_PUBLISHED, ASSIGNMENT_DEADLINE_CHANGED | Student có quyền truy cập khi publish/đổi hạn bài published; không gửi draft |
| Kết quả | ASSIGNMENT_GRADE_RELEASED | Chỉ chủ submission ZIP khi release/re-release revision điểm; không gửi điểm trong packet |
| Đơn hàng | PAYMENT_CONFIRMED, ORDER_EXPIRING, ORDER_EXPIRED | Student là chủ order; settlement/CASH thành công, cửa sổ 24h cuối hoặc persist EXPIRED; giữ policy/race Phase 12 |
| Nghỉ dạy | MENTOR_LEAVE_APPROVED, MENTOR_LEAVE_REJECTED | Mentor gửi đơn khi kết quả được commit; Student chỉ nhận lịch/hủy/bù tương ứng |
| Chỗ học bù | MAKEUP_PLACEMENT_CREATED, MAKEUP_PLACEMENT_CANCELLED | Đúng Student được xếp và mentor đích theo policy; không broadcast lớp đích |
| Tài liệu phát hành | MATERIAL_PUBLISHED | Student có quyền đọc revision approved/published, sau availableAt; không gửi sớm |
| Chờ chấm ZIP (mới) | ZIP_SUBMISSION_REVIEW_REQUIRED | Mentor có quyền chấm assignment/session khi submit ZIP commit thành SUBMITTED; không báo lúc upload/draft |
| Nộp lại ZIP (mới) | ZIP_SUBMISSION_REVIEW_REQUIRED | Attempt nộp mới hợp lệ cần chấm; cùng type với lần đầu, dedupe theo submission/attempt revision; không thêm workflow reopen/resubmit |
| Duyệt tài liệu (mới) | MATERIAL_REVIEW_APPROVED, MATERIAL_REVIEW_REJECTED | Mentor tác giả khi review revision đã gửi chuyển APPROVED/REJECTED; không gửi cho người chỉ sửa hộ, không lộ lý do trên chuông |
| Nhắc buổi (mới) | SESSION_STARTING_SOON | Student có quyền xem lịch và mentor hiệu lực, một lần trước 30 phút/session/schedule revision/recipient |
| Nhắc hạn bài (mới) | ASSIGNMENT_DUE_SOON | Student có quyền làm bài published có dueAt, chưa có lượt nộp hợp lệ đáp ứng bài; một lần trong 24h cuối/deadline revision/recipient |

MENTOR_LEAVE_REQUESTED vẫn thuộc inbox Manager/Admin ở Phase 13, ngoài chuông
Mentor/Student của Phase 16. QUIZ/CODE tự chấm không tạo hàng chờ mentor chấm ZIP.
Không tự thêm thông báo mọi trạng thái runner hoặc kết quả QUIZ/CODE tức thời.

Reminder dùng giờ DB, lưu timestamp UTC; UI hiển thị theo APP_TIME_ZONE. Cửa sổ
buổi: startsAt-30m <= now < startsAt; hạn bài: dueAt-24h <= now < dueAt. Record
mới nằm trong cửa sổ được xét ở lượt worker kế tiếp. Worker kiểm lại lịch/trạng
thái/quyền/lượt nộp trước materialize và delivery, bỏ job revision cũ hoặc quá hạn.
Không gửi bù sau giờ học/hạn nộp. Đổi lịch/hạn tạo revision mới, tối đa một nhắc
cho revision mới. Loại bài không có deadline thì không nhắc; semantics attempt
được đối chiếu service từng loại trong 16.4 trước khi bật producer.

## 3. Kiến trúc và bảo đảm dữ liệu

Mutation → outbox + recipient snapshot trong cùng DB transaction → worker claim
có lease/retry → unique durable inbox → emit theo current policy → FE refetch.
Không gọi socket trong transaction. Lỗi socket không rollback nghiệp vụ hoặc mất inbox.

NotificationsModule Phase 9 sở hữu dữ liệu; Phase 16 thêm socket adapter và delivery
bridge. Module domain cung cấp policy qua exported service; không import vòng với
Chat. Business DTO chỉ generic title/body và resource refs allowlist, không điểm,
đáp án, lý do nghỉ/từ chối, signed URL hay thông tin thanh toán nhạy cảm.

Transport đề xuất: Socket.IO namespace `/notifications`, Engine.IO path
`/ws/notifications`, websocket only. Dùng path riêng để không tranh `/socket.io`
của ChatSocketService hoặc `/ws/whiteboards`. Cùng HTTP server theo pattern repo,
kiểm chứng đồng thời ba transport bằng real sockets trước đóng slice 16.1.

Auth: access cookie hoặc realtime ticket channel `notifications`, origin allowlist,
ACTIVE Mentor/Student và session hợp lệ; owner luôn lấy từ principal. Không cho
client chọn userId/join phòng user tùy ý. Reauthorize mỗi lần emit và định kỳ;
hết hạn/khóa/revoke thì disconnect, xóa timer/peer. Chỉ gửi own sockets đã authorize.

Không hứa replay socket đầy đủ/exactly-once. FE dedupe notification.id, refetch
list/count lúc connect/reconnect/focus. Crash sau inbox commit trước emit vẫn phục
hồi qua REST. Read qua REST, sau commit invalidate mọi own socket; không thêm
socket mutation read/read-all. Chuông Phase 16 dùng category khác CHAT; badge
riêng tính tổng visible business, cần mở rộng count như contract Phase 16.

Active notice mất quyền thì ẩn; terminal notice giữ generic theo snapshot/account
ACTIVE, target có thể unavailable. Unknown type có fallback; resource API authorize
lại khi click. Poll 30s khi đang mở inbox và không có socket, dừng tab hidden.

## 4. Các slice triển khai

| Slice/task | Công việc | Đầu ra và gate |
| --- | --- | --- |
| 16.0 / 16-T01 | Đối chiếu toàn bộ writer/policy Phase 8–14 theo revision thực; chốt loại bài/attempt, quyền mentor chấm, review recipient, target mapping và BUSINESS filter | Catalog/matrix/contract đồng bộ; dependency nào chưa có ghi pending |
| 16.1 / 16-T02 | Thêm socket service/types/auth ticket channel/config; lifecycle, per-user limit và revoke | Connect Mentor/Student khi CHAT_OFF; sai role/origin/channel/expiry bị chặn; chat/board chạy cùng được |
| 16.2 / 16-T03 | Nối worker delivery và read invalidation; BUSINESS list/count/read-all scope | Không lộ cross-user; read nhiều tab; crash/duplicate/reconnect không mất inbox hoặc tăng badge sai |
| 16.3 / 16-T04 | Tích hợp nhóm cũ theo producer Phase 10–14 | Lịch → bài/điểm → payment → nghỉ/bù → material có happy path/rollback/retry/revoke riêng |
| 16.4 / 16-T05 | Thêm capture ZIP chờ chấm, review tài liệu và reminder jobs | Migration additive catalog/CHECK/jobs nếu cần; fake clock, revision stale, retry, attempt/policy tests |
| 16.5 / 16-T06 | Swagger/Postman + hướng dẫn socket/FE, runbook/flags, regression và rollout | Gates thực chạy, AC có evidence; FE/browser/VPS ghi riêng, không sửa repo FE |

Thứ tự: 16.0 → 16.1 → 16.2; 16.3 theo readiness từng phase; 16.4 sau foundation
và domain tương ứng; 16.5 cuối. Mỗi slice có source/tests/docs trước bật delivery.

## 5. File dự kiến tạo/sửa khi implement

Các đường dẫn sau là **targets**, chưa có nghĩa đã tồn tại:

- Tạo `src/modules/notifications/services/notification-socket.service.ts`,
  `notification-delivery.service.ts`, `notification-reminders.worker.ts`;
  `src/modules/notifications/dtos/notification-socket.dto.ts` và unit tests tương ứng.
- Sửa module/controller/query/count/read-all của NotificationsModule Phase 9;
  dùng API module hiện hữu sau khi Phase 9 implement, không scaffold trùng.
- Sửa `src/modules/auth/realtime-ticket.controller.ts`,
  `src/modules/auth/services/token.service.ts` và ticket tests để thêm channel.
- Nối exported provider/writer tại ZIP submissions, material review và producer
  Phase 10–14; migration mới trong `src/database/migrations/` nếu mở CHECK/catalog
  hoặc thêm reminder jobs; giữ lịch sử migration/chat rows.
- Sửa `src/config/environment.schema.ts`, `.env.example`, `.env.production.example`
  và app composition; thêm `NOTIFICATION_SOCKET_ENABLED=false` mặc định.
- Tạo `test/integration/phase16-notifications.spec.ts`,
  `test/http/phase16-notifications.spec.ts`,
  `postman/Mindy-Notifications-Phase16.postman_collection.json`,
  `docs/PHASE_16_NOTIFICATIONS_RUNBOOK.md` khi implementation.

Socket chỉ bật khi NOTIFICATIONS_ENABLED và NOTIFICATION_SOCKET_ENABLED đều ON.
CHAT_ENABLED không điều khiển business transport. Worker flag/capture/activation
watermark kế thừa Phase 8; socket OFF không xóa inbox hoặc tắt capture. Single
replica trước; nhiều replica cần adapter/broker và acceptance riêng.

## 6. Tiêu chí nghiệm thu

- [ ] AC16-01: Catalog cũ/mới, writer inventory, recipients, terminal policy, FE targets và BUSINESS scope nhất quán; không tính chat vào chuông này.
- [ ] AC16-02: Chỉ ACTIVE Mentor/Student kết nối; cookie/ticket đúng origin/channel, expiry/revoke/role/connection limit đều có tests.
- [ ] AC16-03: Business socket vẫn nhận khi CHAT_OFF; CHAT/whiteboards/notifications cùng bật không tranh path; cleanup sau disconnect/shutdown.
- [ ] AC16-04: Emit đúng owner/current policy; tài khoản bị khóa hoặc resource revoke không nhận protected packet; terminal payload tối thiểu.
- [ ] AC16-05: Durable inbox trước emit; rollback/no-op/retry/crash không tạo trùng; reconnect phục hồi được notice đã bỏ lỡ.
- [ ] AC16-06: Mọi nhóm cũ trong catalog có producer tests riêng, bao gồm cash/payOS race, grade privacy, leave cancellation/replacement và availableAt.
- [ ] AC16-07: ZIP submit/attempt mới gửi đúng mentor có quyền chấm; replay/upload/auto-grade không tạo notice chờ chấm.
- [ ] AC16-08: Review APPROVE/REJECT đúng tác giả/revision; no-op không gửi; không đưa rejectionReason vào payload.
- [ ] AC16-09: Reminder đúng cửa sổ/revision, bỏ stale/cancelled/archived/submitted/expired/revoked; downtime không gửi bù quá hạn.
- [ ] AC16-10: BUSINESS list/count/read-all nhất quán; read-all không đọc chat, late fanout vẫn unread; duplicate packet không làm badge tăng lặp, own read sync đa tab.
- [ ] AC16-11: `pnpm check`, compiled HTTP/real sockets, PG integration và fresh/upgrade/repeat migration khi có schema đổi đều có kết quả; critical skips ghi pending.
- [ ] AC16-12: Runbook path proxy/flags/restore/rollback và FE offline/reconnect/unknown/unavailable được bàn giao; local, FE và deploy evidence tách biệt.

## 7. Kiểm chứng và rollout

Unit fake clock + policy; integration DB `_test` riêng, không dev/prod; compiled
HTTP + socket.io-client thật cho cross-role/cross-origin/revoke/path collision.
Không tự thêm dependency khi Socket.IO đã có. Chạy regression chat/read receipt,
assignment privacy và payment trước release. Đo inbox lag p95 theo mục tiêu Phase
8–15 (10s), list/count p95 500ms trên fixture đã khai báo; ghi số đo thực.

Rollout schema tương thích → foundation/API BUSINESS → transport mặc định OFF →
FE tích hợp → delivery từng nhóm theo watermark → reminders. Reverse proxy cần
Upgrade cho `/ws/notifications`, cấu hình Origin và timeout phù hợp. Rollback bằng
tắt socket/delivery; không down migration phá inbox/outbox. Không thêm email/SMS/
push mới hoặc sửa email xác nhận payment hiện hữu.

## 8. Quyết định triển khai và mapping source hiện hành

- Capture đặt tại persistence boundary bằng BEFORE/AFTER PostgreSQL triggers,
  theo pattern ChatLifecycle hiện có, để bao phủ bulk, worker, CASH và payOS mà
  không bỏ writer. BEFORE snapshot session/class/placement giữ quan hệ trước
  cascade. Class cancellation marker gộp một event/user/cause; cause_id được chia
  sẻ trong transaction qua set_config. Migration cũ giữ nguyên.
- **Quyết định kỹ thuật về biên module:** schedule/assignment/order/leave/placement
  dùng các SQL read projection trong migration và batch predicate hiện hành tại
  notifications/domain/notification-access.query.ts. Đây là ngoại lệ được ghi nhận
  với quy ước mọi cross-module read qua exported service: capture cần snapshot
  cùng mutation ở DB và bao phủ legacy/bulk writers. Đổi rule domain phải đồng bộ
  các projection và chạy regression; không suy chat membership thành quyền học.
  Chat và Student/Mentor material reads dùng exported owning-domain services.
- notification_schedule_revision, notification_deadline_revision và
  notification_expiry_revision tăng khi thời gian thực sự đổi, độc lập với version
  bookkeeping; reminder identity không dựa vào timezone hoặc một timestamp lặp lại.
  Enrollment entitlement revision + relation_keys ngăn notice cũ sống lại khi
  Student bị revoke rồi đăng ký/khôi phục quyền. Snapshot không thêm late users.
- notification-worker.service.ts sở hữu delivery bridge/lease/checkpoints;
  notification-reminders.service.ts chụp reminder candidates có bound và DB clock.
  Không tạo wrapper notification-delivery.service.ts hoặc DTO socket riêng khi
  NotificationDto dùng chung đã đủ. Socket adapter và cursor/inbox/policy tách riêng.
- Read state shared với legacy chat; ChatSocketService cung cấp composition hook
  invalidation một chiều, không import NotificationsModule. Kênh /notifications
  chỉ phát business-created; unified CHAT-created forwarding trên /chat của Phase 9
  vẫn là phạm vi adapter chat riêng, không suy đã hoàn tất phase cũ.
- Retention CLI xóa business inbox >90 ngày có giới hạn, giữ event/recipient dedupe
  markers lâu hơn (hiện không tự purge). Job state gộp vào event; chưa compact jobs
  30 ngày. Đổi lại tránh replay tạo lại unread sau retention; theo dõi dung lượng DB.
- [Runbook](../../PHASE_16_NOTIFICATIONS_RUNBOOK.md) và Postman collection đã có;
  flags mặc định OFF, producer activation là thao tác DB bền riêng. Không deploy
  hoặc activate producer trên môi trường thật trong lượt implementation này.
