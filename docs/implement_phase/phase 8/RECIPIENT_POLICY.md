# Phase 8 — Recipient và visibility policy

Runtime 20/11/2026: Phase16 đã có immutable recipient rows (user/role/terminal,
context candidates, relation_keys). Student enrollment entitlement revision tăng
khi revoke/complete; old snapshot không khớp relation được khôi phục/đăng ký lại.
Worker/list/count/read/socket dùng cùng batch policy. Chat và material gọi owning
exported services; các domain còn lại dùng SQL projections đã ghi quyết định ở
plan Phase16. Account/role current phải còn hợp lệ; socket thêm current Auth session.
N18 chỉ mentor đang có scope chấm bài ungraded; N19/N20 terminal cho mentor tác
giả, detail qua MaterialAuthoringService; N21/N22 và N10 bỏ stale revision/window.
Review matrix P01–P14 bên dưới không tự được đánh toàn bộ PASS từ implementation;
evidence local theo từng case tại Progress16, FE/production riêng.

Review 20/11/2026, BE `757be19`. **R0 contract; providers mới chưa implement.**
[Phase 8](PHASE_8_CONTRACTS_POLICY.md) · [Catalog](EVENT_CATALOG.md).

## 1. Snapshot và current policy

Capture event/snapshot trong transaction domain dưới khóa đang dùng của domain;
snapshot chứa userId + role + relation IDs + policy mode + resource ancestry.
Không chỉ query joinedAt <= occurredAt: trạng thái join/leave/rejoin có thể thay đổi.
Bản đầu chụp recipient rows ngay trong transaction, batch INSERT nếu roster lớn;
không trì hoãn query mutable roster tới worker rồi gọi đó là snapshot.
Snapshot class/guest/mentor bị mất quyền phải lấy trước mutation/trigger.
Mọi provider mới phải có batch form và dùng cùng policy list/count/read/socket.

Bốn hàng rào: ACTIVE actor khi capture; eligibility tại event; ACTIVE account
và role hiện hành còn khớp recipient lúc xử lý; resource visibility hiện hành
ngay trước trả REST/emit. Role đổi không giữ quyền từ snapshot cũ.
Session logout/revoke chặn socket/REST bằng Auth, không xóa inbox của tài khoản.

| Policy | Recipient khi capture | Current check tại fanout/list/count/read/emit |
| --- | --- | --- |
| A: active | Quan hệ phù hợp event + domain eligibility | Owner ACTIVE/role match và resource policy hiện hành; deny thì ẩn row |
| T: terminal | Quan hệ thật trước thay đổi, immutable snapshot | Owner ACTIVE/role match + snapshot hợp lệ; generic row vẫn visible 90d; target.available theo domain read hiện tại |
| M: mentor changed | Student + old/new mentor, lưu recipient relation khác nhau | Old-only mentor dùng T; Student/new mentor dùng A; nếu còn scope khác, target chỉ available khi domain cho phép |
| N17 delayed | Student ACTIVE enrollment/context lúc publication, chưa áp temporal availableAt | Tới notBefore áp full StudentMaterial policy/readiness; nếu fail skip/defer theo lỗi transient, không thêm late joiner |

Terminal không có nghĩa cho phép đọc chi tiết cũ. Data public không mang old/new
mentorId, roster, grade, reason hoặc ancestry private; chỉ allowlisted target IDs
đã thuộc snapshot của chính recipient. ActorId public là null cho business terminal
generic; event nội bộ vẫn giữ actorId để audit và exclude. A cũng không expose actorId
nếu provider không cho phép đọc danh tính actor; phiên bản business v1 luôn trả null.
CHAT_MESSAGE actorId vẫn như contract chat cũ.

## 2. Role / resource matrix

| Nhóm | Student FULL | Student CASH_PREVIEW | Mentor | Manager/Admin |
| --- | --- | --- | --- | --- |
| Lịch/đổi mentor | Đúng regular/guest schedule scope | Có regular schedule nếu hold CASH chưa hết hạn, class không hủy | Effective mentor; old-only nhận generic T khi bị thay | Không nhận broadcast lịch theo role |
| Hủy lớp/buổi | Snapshot trước hủy, kể cả guest | Snapshot schedule hợp lệ trước hủy | Snapshot mentor bị ảnh hưởng | Không nhận chỉ vì là actor/quản lý |
| Bài tập/grade | AssignmentAccessService; grade chỉ chủ submission | Không | Không broadcast bài/grade của Student | Không |
| Order | Đúng orders.studentId, không cần enrollment active | Đúng owner như FULL | Không nhận tiền của Student chỉ vì xác nhận CASH | Không nhận owner notice của Student |
| Leave requested | Không | Không | Actor/requester excluded | ACTIVE ADMIN/MANAGER được service cho xử lý |
| Leave approved/rejected | Không | Không | Chính mentor requester, generic T; detail theo owner policy | Không nhận kết quả chỉ vì đã duyệt |
| Placement | Đúng Student được xếp | Không cấp thêm guest FULL từ preview | Effective mentor target tại event | Không broadcast theo role |
| Material | Full material/context/file policy | Không | Không nhận broadcast Student | Không |

Nguồn policy đã đọc:
- [Learning access](../../../src/modules/student-learning/domain/learning-access.ts):
  FULL cần ACTIVE; CASH_PREVIEW chỉ hold CASH còn hạn; canceled class deny.
- [Schedule projection](../../../src/modules/attendance/services/attendance-projection.service.ts):
  REGULAR_ACCESS và GUEST_ACCESS, session guest scope; không suy quyền cả lớp đích.
- [Assignment access](../../../src/modules/assignments/services/assignment-access.service.ts):
  Student active enrollment, class/session không CANCELLED; role Mentor có scope riêng.
- [Material policy](../../../src/modules/materials/services/material-policy.service.ts) và
  [material read predicate](../../../src/modules/materials/domain/material-access.ts):
  approved revision, publication/availableAt, enrollment/context và file readiness.
- [Order read](../../../src/modules/commerce/services/order-settlement.service.ts):
  studentId owner check độc lập enrollment.
- [Leave service](../../../src/modules/teaching-operations/services/mentor-leave.service.ts):
  actor() và row(): hiện ACTIVE ADMIN/MANAGER xử lý toàn hệ thống; không có
  team/tenant assignment scope bổ sung để tự invent.
- [Placement service](../../../src/modules/attendance/services/makeup-placement.service.ts):
  actor quản trị ADMIN/MANAGER; Student/mentor notice theo relation đích.
- [Chat access](../../../src/modules/chat/services/chat-access.service.ts):
  CHAT_MESSAGE tiếp tục quyền/visibility và flags chat cũ.

Nếu một user thuộc nhiều class references cùng material: một inbox row với
server-only context candidates; target chọn context còn đọc được, stable order theo
classId khi nhiều context còn hợp lệ. Không trả toàn bộ classIds cho client.
Guest chỉ có lịch/bảng theo nguồn entitlement, không tự được assignment/material
lớp đích vì cùng session.

## 3. Revoke / privacy scenarios — AC8-3

| ID | Tình huống | Kết quả đã chốt |
| --- | --- | --- |
| P01 | User B đoán notificationId của A | Không list/count; read 404; socket own-only |
| P02 | Student lớp khác, PAYOS pending, CASH quá hạn | Không A notice lịch không có scope; không bài/tài liệu |
| P03 | Mất enrollment hoặc guest placement sau event | A notice ẩn; không authorize bằng chat membership |
| P04 | Hủy lớp làm mất entitlement | N04 generic T còn visible cho snapshot recipient; target có thể unavailable |
| P05 | Mentor bị thay, không còn quyền session | N02 old-only generic T; không lộ Student/mentor mới hoặc session detail |
| P06 | Order EXPIRED làm enrollment CANCELLED | Chủ order vẫn xem N11; không cần re-activate enrollment |
| P07 | Account SUSPENDED hoặc role thay đổi | Chặn REST/socket/worker delivery; không dùng old role trong snapshot |
| P08 | Logout/revoke trong lúc chờ emit | Auth recheck per socket, không gửi packet protected |
| P09 | Late join/rejoin sau event | Không thêm recipient mới; A quyền hiện tại không thay thế snapshot eligibility |
| P10 | Leave mất PENDING sau approve/reject/withdraw/expiry | N12 ẩn; N13/N14 chỉ owner generic T; reason không trong payload |
| P11 | Material bị unpublish/delete/file invalid | A ẩn; resource API vẫn kiểm lại quyền khi click |
| P12 | Reminder đã có, order PAID/CANCELLED/EXPIRED | N10 ẩn khỏi list/count/read/emit; N09/N11 không bị nhầm là reminder |
| P13 | N16 hủy placement, mentor target đổi sau đó | Chỉ snapshot mentor nhận terminal generic; không fanout mentor mới muộn |
| P14 | Failure khi authorize | Fail closed; lỗi hạ tầng được retry/503 theo contract, không coi lỗi DB là policy deny vĩnh viễn |

P01–P14 là kịch bản kiểm chứng cho phase runtime; ở Phase 8 chỉ review matrix và
đối chiếu policy nguồn. Không ghi là test revoke barriers đã chạy.
