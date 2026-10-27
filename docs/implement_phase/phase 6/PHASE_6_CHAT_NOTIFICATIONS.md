# Phase 6 — Chat realtime và thông báo trong ứng dụng

## Nghiệm thu local — 2026-10-26

**39/39 AC của8 slices6.0–6.7 PASS — backend local R4 complete.** Dev Docker đã backup/migrate16→32 và repeat no-op; check691/691, HTTP117/117 và restore/ops PASS. [Evidence từng slice](../../progress/phase%206/PHASE_6_PROGRESS.md#docker-acceptance-2026-10-26) gồm24 revoke barriers, process crash/recovery, populated upgrade, MinIO races và contract/log canaries. Checkbox trong plan riêng đã cập nhật theo evidence. Các đoạn planning bên dưới giữ lịch sử; FE/VPS/production IAM/load acceptance chưa suy từ local tests.

## Implementation revision — 2026-10-24

Runtime 6.0–6.6 đã có source. Gates và acceptance còn mở xem [Progress6](../../progress/phase%206/PHASE_6_PROGRESS.md). Flags mặc định tắt; chưa deploy hoặc nghiệm thu FE/VPS. Nội dung PLANNED/proposed phía dưới là baseline planning trước implementation.

Quyết định đã chốt:

- Pure policy + public batch providers Classes/Enrollments/Commerce/Users; Auth trả verified expiry, nhận manager. Send locks: AuthSession → Classes (UUID sort) → Orders → Enrollments → Users → Conversation → message/receipt. Lifecycle không giữ conversation rồi lấy source write locks.
- Lifecycle dùng transactional PostgreSQL triggers ở Classes/Enrollments/Orders/Users, ghi domain_outbox và LIFECYCLE job cùng transaction. Consumer reconcile current state; SYSTEM actor là null. Không inject Chat ngược vào payment/class modules. Current source checks luôn là authority; passive socket poll mỗi giây cộng per-delivery authorization.
- Shared mutation_receipts namespace chat; route chứa operation/scope; outcome chỉ resourceId/keyVersion/fingerprintVersion. HKDF-HMAC riêng purpose, giữ append-only trigger hiện hữu; không body snapshot hoặc receipt table song song. Canonical UUID chống retry khác chữ hoa/thường tạo receipt khác.
- Raw SQL storage/DTO mapping theo convention Tracking, tránh lặp schema bằng ORM entity không được dùng. Ba migrations1792800000000..2 và DBML cập nhật. chat_jobs UNIQUE(event_id,consumer), lease30s, tối đa8 lần, SKIP LOCKED/token fencing; domain envelope và trạng thái từng consumer tách riêng.
- Socket.IO4.8.1 gắn Nest11 HTTP server qua HttpAdapterHost; không thêm gateway dependencies. Namespace /chat, websocket-only, không connection-state recovery; không broadcast protected data qua room.
- File owner model riêng chat_file_objects với purpose CHAT, conversation FK, pinned versions/chat_file_copies. Tái dùng exported FILE_STORAGE/BINARY_VALIDATOR; không sửa file_objects/CourseUnit của Materials. Image5MiB/PDF10MiB, GET URL60s; F1 có receipt idempotency.
- Timestamp chat precision milliseconds để cursor time+UUID roundtrip chính xác qua JS Date. Sequence bigint decimal string. CLI compiled chat:maintenance mặc định dry-run, bounded backfill/rotate/replay/retention/metrics; tắt mọi background worker trước dynamic AppModule import. Reserve giới hạn1 triệu encryptions/key trong transaction; giữ khóa cũ cho receipts/backups.

Source: src/modules/chat và public owner providers. [Runbook](../../PHASE_6_CHAT_RUNBOOK.md), API runtime revision và Progress6 là handoff hiện hành. Không tick toàn bộ AC chỉ vì có source; chaos/load/FE/VPS acceptance cần evidence riêng.

## Kế hoạch triển khai theo slice

Từ **2026-10-26**, mỗi slice có một file riêng theo cách tổ chức Phase 4.
Giữ nguyên số slice 6.0–6.7, 59 task IDs và 39 acceptance IDs; không đổi thứ tự dependency.

| Slice | Plan chi tiết | Phụ thuộc |
|---|---|---|
| 6.0 | [Contracts, access và biên tích hợp](PHASE_6_0_CONTRACTS_ACCESS.md) | Source baseline |
| 6.1 | [Schema, mã hóa, receipt và job foundation](PHASE_6_1_SCHEMA_CRYPTO_FOUNDATION.md) | 6.0 |
| 6.2 | [Lifecycle membership và REST text hoàn chỉnh](PHASE_6_2_MEMBERSHIP_REST.md) | 6.1 |
| 6.3 | [Socket.IO, nhận event an toàn và reconnect](PHASE_6_3_REALTIME_RECOVERY.md) | 6.2 |
| 6.4 | [Edit/delete, read cursor và unread đa thiết bị](PHASE_6_4_MUTATIONS_READ.md) | 6.3 |
| 6.5 | [Notification inbox bền vững](PHASE_6_5_NOTIFICATION_INBOX.md) | 6.4 |
| 6.6 | [Image/PDF attachments theo conversation](PHASE_6_6_CHAT_ATTACHMENTS.md) | 6.5 + Files |
| 6.7 | [Full gates, handoff và vận hành](PHASE_6_7_HANDOFF_OPERATIONS.md) | 6.0–6.6 |

## Baseline planning — lịch sử trước implementation

2026-10-24 · **PLANNED — chưa implement** · Source baseline `dev@cc8d843`.
[Flow](../../api_flow/PHASE_6_FLOW.md) ·
[API proposal](../../api_flow/PHASE_6_flow-api-breakdown.md) ·
[Progress](../../progress/phase%206/PHASE_6_PROGRESS.md).

Tài liệu này là kế hoạch BE, không phải contract đang chạy. Không thay đổi code,
database, frontend hoặc deployment trong lượt planning. Phase 5 hiện là Assignment;
Phase 6 là Chat/Notification, độc lập việc hoàn thành ZIP/reporting Phase 5.

## 1. Baseline và quyết định

Đã đọc `document/Flow.txt`, DBML và quy tắc NestJS của repo. Source có auth cookie,
JWT RS256, session validation, enrollment/payment, class assignment và private files.
Chưa có ChatModule, NotificationsModule, migration chat hoặc WebSocket gateway.
DBML chỉ là baseline: `chat_conversations`, `chat_members`, `chat_messages`,
`notifications`; chưa đủ crypto, retry, replay hoặc lifecycle integration.

### Đã thống nhất trong trao đổi

- Một group chat chính cho mỗi Class, tự tạo theo lifecycle lớp; bổ sung backfill lớp cũ.
- DM mentor–student; group và DM dùng chung conversation/message model.
- CASH pending còn hạn được vào nhóm lớp/DM mentor, chưa được mở nội dung học.
- Manager nhận đủ tiền: Order `PAID`, Payment `SUCCEEDED`, Enrollment `ACTIVE`.
  Chat giữ conversation, thành viên, lịch sử và khóa; không tạo lại nhóm/DM.
- Nội dung mã hóa tại backend bằng AES-256-GCM, truyền qua TLS/WSS. Backend đọc
  được nội dung; không gọi đây là E2EE. Không có khóa riêng sender/receiver.
- Client giữ nguyên `clientMessageId` khi retry; unique DB chống tạo tin trùng.

### Mặc định đề xuất cho implementation

Các mục sau là quyết định thiết kế đề xuất, chưa phải yêu cầu đã được user xác nhận:

- NestJS gateway + Socket.IO 4, namespace `/chat`, engine path `/socket.io`;
  websocket-only cho đợt đầu. FE dùng socket.io-client, không dùng native WebSocket.
- Một instance BE ở đợt đầu; PostgreSQL lưu bền vững, chưa bắt buộc Redis.
- DM chỉ mentor chính hiện tại và student có quan hệ lớp hợp lệ; không student–
  student, nhóm tùy ý hoặc manager đọc mọi DM. Dạy thay không tự có chat cả lớp.
- Class/enrollment COMPLETED: đọc lịch sử, không gửi. CANCELLED hoặc mất quan hệ:
  mất quyền đọc/gửi/nhận mới. Account phải ACTIVE cho mọi thao tác.
- Thành viên nhóm thấy tin từ lần gia nhập hiện tại; backfill đặt mốc trước tin
  đầu tiên. Rời rồi tham gia lại đặt mốc mới, không tự khôi phục lịch sử cũ.
  DM giữ cùng conversation theo cặp user; lịch sử đã có của cặp được đọc lại khi
  quan hệ hợp lệ trở lại. Ghi rõ khác biệt này trong UI/contract.
- Reply một cấp tham chiếu; sửa text bởi tác giả trong 15 phút; xóa mềm tin của
  mình khi còn quyền gửi. Không staff moderation trong v1.
- Thông báo v1 chỉ `CHAT_MESSAGE`, generic text không copy body; không tự gửi mail,
  push, SMS hoặc thêm thông báo payment/attendance/assignment trong phase này.
- File/image nằm ở slice 6.6 riêng, bắt buộc hoàn tất mới đánh dấu toàn phase done.
  Có thể bàn giao text-only trước với capability `canAttach=false`.

## 2. Phạm vi và quyền

| Actor/trạng thái | Nhóm lớp | DM mentor–student |
|---|---|---|
| Student ACTIVE enrollment, Class OPEN/IN_PROGRESS | Đọc/gửi theo membership | Đọc/gửi với mentor chính hiện tại |
| Student CASH PENDING_PAYMENT, order PENDING và còn hạn | Đọc/gửi, không mở materials | Đọc/gửi với mentor chính |
| Student PayOS pending | Không cấp quyền từ pending hold | Không cấp quyền từ pending hold |
| Student COMPLETED hoặc Class COMPLETED | History read-only nếu chưa bị revoke | Read-only nếu chỉ còn quan hệ completed |
| Student CANCELLED, CASH hết hạn, Class CANCELLED | Thu hồi; còn quan hệ khác không cứu quyền nhóm lớp này | Kiểm tra các lớp chung khác; không còn quan hệ thì thu hồi |
| Mentor chính hiện tại, ACTIVE account | Đọc/gửi; COMPLETED read-only | Chỉ DM của chính mình với student hợp lệ |
| Mentor cũ/dạy thay/guest makeup | Không tự cấp quyền nhóm | Không tự cấp quan hệ DM |
| Manager/Admin | Không tự là chat member; không đọc nội dung qua quyền quản trị | Không blanket access |

Đọc history, members, reply, file, notification và mọi event đều dùng chung
`ChatAccessPolicy`. Không coi `left_at IS NULL`, biết UUID hay đang ở room là đủ.
Pending phải đối chiếu Order/paymentType/expiry thực tế, không chỉ enum enrollment.
Nếu student có nhiều enrollment/lớp hợp lệ, tính quyền từ toàn bộ quan hệ còn hiệu
lực. Suspension/role change/session revoke chặn cả chiều nhận event.
Class DRAFT chưa mở chat cho student; group có thể được provision sẵn nhưng chưa
hiển thị cho student. V1 cũng không mở gửi tin của mentor trong Class DRAFT.

V1 không có API client tự add/remove thành viên nhóm. Class/Enrollment/Commerce
phát domain event trong transaction nghiệp vụ; Chat xử lý membership. Backfill và
reconciler sửa projection, nhưng mọi request vẫn kiểm nguồn quyền hiện tại. GET
không tạo nhóm/DM/membership. DM được ensure tự động khi có cặp đủ điều kiện; POST
direct là đường retry/reconciliation có kiểm quyền, không gửi tin tự động.
Nếu source đủ quyền nhưng projection group/member chưa provision thì route class
chat trả503 CHAT_PROVISIONING thay vì404; không dùng lỗi này để lộ lớp ngoài scope.
Rejoin group đặt last_read_seq ít nhất visible_from_seq-1, tránh unread tin trước mốc.

## 3. Kiến trúc và biên module

```text
Auth / Users / Classes / Enrollments / Commerce
            │ exported typed scope + transactional domain outbox
            ▼
ChatAccessPolicy → ChatService / ChatReadService → PostgreSQL
                         │                         │
                   ChatCryptoService         durable event/outbox
                         │                         ▼
                    backend secrets       Dispatcher → ChatGateway
                                                   │
                                  NotificationsModule / Files public API
```

- `ChatModule` sở hữu conversation/member/message/crypto/replay; dùng TypeORM
  entities hoặc typed SQL nhất quán với slice, không trộn owner repositories.
- `NotificationsModule` sở hữu inbox/read state. Không phụ thuộc ngược Chat;
  consumer điều phối scope qua provider interface do composition layer nối.
- Domain writer không import ChatModule ngược Classes/Commerce để gọi tạo nhóm.
  Dùng domain outbox trung lập có contract version, ghi cùng EntityManager; Chat
  consumer idempotent. Đây là hạ tầng cần xây mới, không giả định đã tồn tại.
- Class writer ghi class-created outbox cùng transaction; consumer tạo group tự
  động, idempotent sau commit. Đây là **eventual provisioning**, không khẳng định
  group cùng transaction với class. Tránh vòng DI Classes↔Chat; GET trong khoảng
  provisioning trả503 `CHAT_PROVISIONING`, không âm thầm tạo trên GET.
- Provider mới dự kiến: Classes chat scope/primary mentor/class lifecycle,
  Enrollments current chat entitlement, Commerce valid pending CASH hold.
  Auth có TokenService/AuthService export; guard và HTTP exception filter hiện tại
  dùng `switchToHttp`, không áp nguyên xi cho gateway.
- Lock order phải kiểm theo writers hiện tại trước implementation; chat transaction
  khóa source scope cần thiết → conversation → membership/message/receipt.
  Không thêm đường đảo lock với checkout, cash confirm hoặc reassignment.

## 4. Schema và constraints đề xuất

Migration additive mới, timestamp lớn hơn catalog hiện tại; không sửa migration
đã chạy. Đồng bộ DBML khi triển khai schema, giữ rõ baseline/planned.

Mỗi bảng được tách theo cột để đọc và đối chiếu. Kiểu dữ liệu chưa nêu trong bản
tóm tắt trước được ghi dưới đây ở mức **đề xuất**, cần chốt trong migration/DTO khi
implementation. Đây không phải các bảng đã được tạo trong database.

### 4.1. `chat_conversations` — cuộc hội thoại

| Cột | Kiểu đề xuất | NULL | Ý nghĩa / mặc định |
|---|---|---|---|
| `id` | `uuid` | Không | Khóa chính của cuộc hội thoại. |
| `type` | enum `GROUP`, `DIRECT` | Không | Loại nhóm chat hoặc chat riêng. |
| `class_id` | `uuid` | Có | Khóa ngoại đến `classes.id`; gắn nhóm với lớp. |
| `name` | `varchar(200)` | Có | Tên nhóm; không dùng cho DM. |
| `direct_key` | `varchar(100)` | Có | Cặp user ID đã sắp xếp để chống trùng DM; không phải khóa mã hóa. |
| `created_by` | `uuid` | Có | Khóa ngoại đến `users.id`; NULL khi hệ thống tạo mà không có actor cụ thể. |
| `creation_source` | enum `USER`, `SYSTEM` | Không | Nguồn tạo, bao gồm system backfill. |
| `last_event_seq` | `bigint` | Không | Sequence sự kiện mới nhất trong conversation; mặc định `0`. |
| `activity_at` | `timestamptz` | Không | Thời điểm hoạt động gần nhất để sắp xếp inbox. |
| `created_at` | `timestamptz` | Không | Thời điểm tạo. |
| `updated_at` | `timestamptz` | Không | Thời điểm cập nhật gần nhất. |

Ràng buộc của bản plan v1:

- `id` là PRIMARY KEY; `direct_key` UNIQUE khi có giá trị.
- GROUP: `class_id` và `name` bắt buộc, `direct_key` phải NULL.
- DIRECT: `class_id` và `name` phải NULL, `direct_key` bắt buộc.
- Partial UNIQUE trên `class_id` khi `type='GROUP' AND class_id IS NOT NULL`.
  Đây là **giới hạn một nhóm/lớp do plan đề xuất**, không phải ràng buộc của DBML
  hiện tại. DBML vẫn cho phép Class→Conversation 1–N; lượt trình bày lại này chưa
  thay quyết định sang nhiều nhóm hoặc thêm `is_primary`.

### 4.2. `chat_members` — thành viên cuộc hội thoại

| Cột | Kiểu đề xuất | NULL | Ý nghĩa / mặc định |
|---|---|---|---|
| `conversation_id` | `uuid` | Không | Khóa ngoại đến `chat_conversations.id`. |
| `user_id` | `uuid` | Không | Khóa ngoại đến `users.id`. |
| `role` | enum `ADMIN`, `MEMBER` | Không | Vai trò trong nhóm, không phải role tài khoản. Không tự tạo OWNER hệ thống. |
| `joined_at` | `timestamptz` | Không | Thời điểm bắt đầu lần tham gia hiện tại. |
| `left_at` | `timestamptz` | Có | Thời điểm rời/bị thu hồi membership; NULL nếu projection đang tham gia. |
| `visible_from_seq` | `bigint` | Không | Mốc sequence bắt đầu được đọc lịch sử theo policy. |
| `last_read_seq` | `bigint` | Không | Mốc đã đọc cao nhất; mặc định `0`, điều chỉnh theo mốc join. |
| `last_read_at` | `timestamptz` | Có | Thời điểm read cursor tăng gần nhất; NULL nếu chưa đọc. |
| `entitlement_version` | `bigint` | Không | Version projection quyền, hỗ trợ phát hiện/cập nhật membership cũ; không thay current source check. |

Ràng buộc và index:

- PRIMARY KEY ghép: `(conversation_id, user_id)`.
- Index `(user_id, left_at)` để tìm các conversation của user.
- DIRECT phải có đúng hai user khớp `direct_key`, kiểm trong transaction tạo có lock.
- Không có API công khai để client tự thêm/xóa member; `left_at=NULL` không tự đủ
  quyền nếu enrollment, assignment hoặc account đã hết hiệu lực.

### 4.3. `chat_messages` — tin nhắn

| Cột | Kiểu đề xuất | NULL | Ý nghĩa / mặc định |
|---|---|---|---|
| `id` | `uuid` | Không | Khóa chính của tin nhắn. |
| `conversation_id` | `uuid` | Không | Khóa ngoại đến `chat_conversations.id`. |
| `sender_id` | `uuid` | Không | Khóa ngoại đến `users.id`; lấy từ principal, không tin client. |
| `client_message_id` | `uuid` | Không | ID client giữ nguyên khi retry cùng thao tác gửi. |
| `sequence` | `bigint` | Không | Event sequence khi tạo tin; không đổi khi sửa/xóa. |
| `last_changed_seq` | `bigint` | Không | Event sequence của lần tạo/sửa/xóa gần nhất. |
| `type` | enum `TEXT`, `FILE`, `IMAGE` | Không | Loại tin nhắn trong v1. |
| `reply_to_message_id` | `uuid` | Có | Tin nhắn được trả lời, phải cùng conversation. |
| `body_ciphertext` | `bytea` | Có điều kiện | Nội dung hoặc caption đã mã hóa. |
| `body_iv` | `bytea` | Có điều kiện | IV 12 byte của lần mã hóa nội dung. |
| `body_auth_tag` | `bytea` | Có điều kiện | Tag xác thực AES-GCM, 16 byte. |
| `body_key_version` | `integer` | Có điều kiện | Version khóa trong keyring backend. |
| `body_crypto_version` | `smallint` | Có điều kiện | Version định dạng mã hóa/AAD. |
| `file_object_id` | `uuid` | Có | Khóa ngoại đến file đã qua chat upload policy; chỉ FILE/IMAGE. |
| `version` | `integer` | Không | Version tin nhắn để kiểm concurrent edit/delete. |
| `edited_at` | `timestamptz` | Có | Lần sửa gần nhất; NULL nếu chưa sửa. |
| `deleted_at` | `timestamptz` | Có | Thời điểm xóa mềm; NULL nếu chưa xóa. |
| `created_at` | `timestamptz` | Không | Thời điểm tạo tin nhắn. |

Ràng buộc:

- UNIQUE `(conversation_id, sender_id, client_message_id)` chống tạo tin trùng khi retry.
- UNIQUE `(conversation_id, sequence)` chống trùng sequence tạo tin.
- UNIQUE `(conversation_id, id)` làm đích cho composite reply FK.
- Reply FK `(conversation_id, reply_to_message_id)` tham chiếu
  `chat_messages(conversation_id, id)`, bảo đảm reply không trỏ sang conversation khác.
- Năm cột `body_*` cùng có giá trị hoặc cùng NULL; TEXT bắt buộc có body,
  FILE/IMAGE có thể không caption. Kiểm IV/tag đúng độ dài.
- Không có `receiver_id`: người nhận được xác định qua conversation và quyền member.

### 4.4. `chat_mutation_receipts` — model logic biên nhận chống thực hiện lặp

Đối chiếu source khi lập chi tiết slices: migration `1792627200002` đã tạo kho
`mutation_receipts` dùng chung, có namespace CHECK và trigger append-only. Tên
`chat_mutation_receipts` dưới đây là **model logic**, chưa quyết định tạo bảng vật lý
riêng. Slice6.0 phải chốt mapping; ưu tiên mở rộng namespace/metadata bằng migration
additive và provider ghi trong transaction, không giả TrackingModule đã export writer.
Nếu constraints/HMAC/key-version không thể giữ bằng model chung, ghi quyết định và
trade-off trước chọn bảng riêng. Không sửa migration consolidation đã chạy.

| Cột / thành phần | Kiểu đề xuất | Ý nghĩa |
|---|---|---|
| `actor_id` | `uuid` | User thực hiện thao tác. |
| `operation` | `varchar` | Loại thao tác gửi/sửa/xóa. |
| Phạm vi request | ID resource theo operation | Conversation cho gửi tin; message cho sửa/xóa. Tên cột vật lý chốt khi implement. |
| `request_key` | `uuid` | `clientMessageId` hoặc `Idempotency-Key` của thao tác. |
| `request_fingerprint` | `bytea` | HMAC của canonical request để nhận biết cùng key nhưng khác payload. |
| `fingerprint_key_version` | `integer` | Version khóa dùng tạo/kiểm fingerprint. |
| `resource_id` | `uuid` | ID resource đã tạo hoặc tác động, ví dụ message ID. |
| `outcome_version` | `integer` | Version resource khi thao tác commit. |
| `created_at` | `timestamptz` | Thời điểm ghi receipt. |

Ràng buộc và lưu trữ:

- Unique theo `(actor, operation, phạm vi request, request_key)`.
- Không lưu plaintext request hoặc hash SHA thuần của body dễ đoán.
- Receipt gửi tin giữ suốt vòng đời message/tombstone để retry sau edit/delete
  không tạo tin mới. Replay trả projection hiện tại sau authorize lại.

### 4.5. `chat_events` — lịch sử sự kiện để đồng bộ

| Cột / thành phần | Kiểu đề xuất | NULL | Ý nghĩa |
|---|---|---|---|
| `event_id` | `uuid` | Không | ID duy nhất của sự kiện, dùng dedupe packet. |
| `conversation_id` | `uuid` | Không | Conversation sở hữu sự kiện. |
| `sequence` | `bigint` | Không | Thứ tự sự kiện trong conversation. |
| `type` | `varchar` | Không | Tạo/sửa/xóa tin hoặc thay đổi membership. |
| `message_id` | `uuid` | Có | Tham chiếu tin nhắn nếu đây là message event. |
| `message_version` | `integer` | Có | Version message tại thời điểm phát sinh event. |
| Tham chiếu membership | IDs theo loại event | Có | Resource liên quan khi event thay đổi thành viên; schema chi tiết chốt khi implement. |
| `created_at` | `timestamptz` | Không | Thời điểm tạo sự kiện. |

Ràng buộc và xử lý:

- `event_id` duy nhất; UNIQUE `(conversation_id, sequence)`.
- Ghi cùng transaction với mutation tương ứng.
- Không lưu raw message body. Khi replay, authorize rồi lấy current message DTO;
  tin đã xóa chỉ trả tombstone, không khôi phục nội dung phiên bản cũ.

### 4.6. `domain_outbox` — sự kiện nghiệp vụ chờ xử lý

Đây là **bảng mới dự kiến**, không phải `payment_confirmation_emails` hoặc
`file_processing_jobs` hiện có. Ví dụ chứa `CLASS_CREATED` để tự tạo group sau commit.

| Cột / thành phần | Kiểu đề xuất | Ý nghĩa |
|---|---|---|
| `event_id` | `uuid` | ID sự kiện duy nhất. |
| `type` | `varchar` | Loại sự kiện nghiệp vụ. |
| `version` | `integer` | Version cấu trúc sự kiện, không phải version message. |
| Tham chiếu aggregate | Type + ID resource | Lớp, enrollment hoặc resource phát sinh sự kiện. |
| `status` | Trạng thái job | Chờ xử lý, đang xử lý, hoàn tất hoặc thất bại. Enum vật lý chốt khi implement. |
| `attempts` | `integer` | Số lần đã thử xử lý. |
| `next_attempt_at` | `timestamptz` | Thời điểm được thử lại. |
| `lease_token` | `uuid`, nullable | Token xác định worker đang giữ quyền xử lý. |
| `lease_until` | `timestamptz`, nullable | Thời điểm hết hạn lease. |
| `last_error_code` | `varchar`, nullable | Mã lỗi gần nhất, không lưu secret hoặc raw body. |

Class/enrollment state và event outbox được ghi cùng transaction. Worker đọc sau
commit, claim bằng SKIP LOCKED, retry có giới hạn, completion kiểm lease token.
Job hết số lần thử cần dead-letter/replay tool. Chỉ lưu refs/metadata cần xử lý,
không JWT, cookie, message plaintext hoặc khóa mã hóa.

### 4.7. `chat_dispatch_jobs` — công việc phát sự kiện chat

Nhiệm vụ khác `domain_outbox`: message đã lưu, job chờ phát packet và tạo inbox.

| Cột / thành phần | Kiểu đề xuất | Ý nghĩa |
|---|---|---|
| `event_id` | `uuid` | ID duy nhất, tham chiếu event cần dispatch. |
| `type` | `varchar` | Loại công việc dispatch. |
| `version` | `integer` | Version cấu trúc công việc. |
| Tham chiếu resource | Conversation/message/event IDs | Nguồn lấy current projection khi xử lý. |
| Recipient refs / cutoff | IDs hoặc mốc eligibility | Bảo đảm người gia nhập sau không nhận notification cũ. |
| `status` | Trạng thái job | Chờ xử lý, đang xử lý, hoàn tất hoặc thất bại. |
| `attempts` | `integer` | Số lần đã thử. |
| `next_attempt_at` | `timestamptz` | Thời điểm retry tiếp theo. |
| `lease_token` | `uuid`, nullable | Token quyền xử lý hiện tại. |
| `lease_until` | `timestamptz`, nullable | Hạn giữ quyền xử lý. |
| `last_error_code` | `varchar`, nullable | Mã lỗi gần nhất đã lọc dữ liệu nhạy cảm. |

Ghi job cùng transaction với message/event. Dùng claim/retry/fenced completion như
outbox. Trước khi emit, kiểm quyền từng recipient/socket; không lưu body trong job.
Hai bảng ở mục4.6–4.7 được tách để giải thích hai nhiệm vụ; tên cột vật lý và việc
dùng chung hạ tầng worker được chốt ở slice6.0, không có migration trong lượt này.

### 4.8. `notifications` — thông báo trong ứng dụng

| Cột | Kiểu đề xuất | NULL | Ý nghĩa |
|---|---|---|---|
| `id` | `uuid` | Không | Khóa chính của thông báo. |
| `user_id` | `uuid` | Không | Khóa ngoại đến user nhận thông báo. |
| `actor_id` | `uuid` | Có | User gây ra thông báo, ví dụ người gửi tin. |
| `type` | `varchar(80)` | Không | V1 chỉ dùng `CHAT_MESSAGE`. |
| `message_id` | `uuid` | Không với CHAT_MESSAGE | Tin nhắn được thông báo. |
| `conversation_id` | `uuid` | Không với CHAT_MESSAGE | Conversation chứa tin nhắn. |
| `title` | `varchar(250)` | Không | Tiêu đề chung, ví dụ “Tin nhắn mới”. |
| `body` | `text` | Không | Nội dung thông báo chung, không copy body tin nhắn. |
| `data` | `jsonb` | Theo DTO | Chỉ IDs cần điều hướng, không body/key/signed URL. |
| `read_at` | `timestamptz` | Có | NULL nếu chưa đọc. |
| `created_at` | `timestamptz` | Không | Thời điểm tạo thông báo. |

Ràng buộc và index:

- UNIQUE `(user_id, type, message_id)` chống notification trùng khi worker retry.
- Index `(user_id, created_at, id)` phục vụ inbox pagination.
- Partial index cho unread với `read_at IS NULL`.
- Query list/count/read đều lọc current conversation rights; không chỉ kiểm owner.

### 4.9. Quy tắc chung cho message, sequence và read cursor

Message body: TEXT bắt buộc ciphertext và không file; FILE/IMAGE bắt buộc file,
caption nullable. IV 12 byte, tag 16 byte bằng CHECK. Reply composite FK đảm bảo
cùng conversation; service kiểm target trong cửa sổ history của người gửi.
Không hard-delete rows cho phép tái dùng client_message_id. Soft delete trả tombstone,
không trả body/file/quoted preview; metadata tối thiểu giữ để replay/dedupe.

Sequence là **event sequence theo conversation**, tăng dưới conversation row lock
trong transaction. Tin mới dùng sequence đó làm creation sequence; edit/delete
nhận event sequence mới nhưng không đổi creation sequence. Serialize bigint dưới
dạng decimal string, không ép JS number. Timestamp UTC ISO 8601; FE hiển thị local.

Read cursor chỉ tăng tới sequence đã tồn tại, không vượt last_event_seq hoặc thấp
hơn visible_from_seq-1. Unread đếm tin người khác chưa xóa với creation sequence
lớn hơn last_read_seq và trong scope history; edit không tạo unread mới.

## 5. Mã hóa và quản lý khóa

- `ChatCryptoService` dùng node:crypto AES-256-GCM, key 32 byte; mỗi encryption kể
  cả edit/rotation sinh random IV 12 byte mới, tag 16 byte. Không derive IV từ IDs.
- Canonical AAD UTF-8 JSON array `[cryptoVersion,messageId,conversationId,senderId]`;
  các ID normalize UUID lowercase, cryptoVersion integer. Khóa các field AAD sau
  create. Auth tag lỗi thì fail closed, không trả partial plaintext hoặc fallback.
- Keyring server có `CHAT_ENCRYPTION_ACTIVE_KEY_VERSION` và khóa Base64 theo version;
  validation decode đúng32 byte, active version có khóa; enabled chat thiếu khóa
  thì startup fail. `CHAT_ENABLED=false` không yêu cầu secret chat và không nhận
  traffic/worker chat; rollout không làm auth/payment cũ phụ thuộc secret mới.
- Key tại secret store của môi trường triển khai; local .env ignored; mỗi môi
  trường độc lập. Không ghi key trong migration/DB/log/FE/cookie. Không dùng khóa JWT.
- Fingerprint idempotency dùng HMAC của canonical request, subkey HKDF có purpose
  riêng từ key version lưu trong receipt; không dùng ciphertext ngẫu nhiên làm
  fingerprint. Giữ khóa cũ để so replay và decrypt dữ liệu cũ.
- Nonce uniqueness là bắt buộc theo key; dùng CSPRNG, theo dõi số lần mã hóa và
  đặt giới hạn vận hành bảo thủ <=1 triệu lần/key trước rotation ở v1. Test reuse
  regression; ghi rõ random nonce không phải bảo đảm toán học không va chạm.
- Rotation: phân phối V2 tới mọi instance → active V2 → ghi mới V2/đọc V1,V2 →
  job mã hóa lại theo batch/version check → kiểm backup/receipt dependencies mới
  xét retire V1. Receipt cần re-key hoặc giữ V1; không xóa khóa chỉ vì messages=0.
- Sao lưu/restore thử cả DB và keyring, cất riêng có ACL. Mất key không khôi phục
  plaintext. Lộ cả backend và key nằm ngoài bảo vệ của mô hình này.
- Metadata sender/recipient/time không mã hóa; không full-text search body ở v1.
  Không plaintext trong outbox, notification preview, app logs, tracing hoặc Redis.

## 6. Transactions, retry và delivery

### Gửi tin

1. Validate account/session/expiry + source entitlement và payload.
2. Lock conversation, kiểm membership và scope hiện tại lại trong transaction.
3. Tìm receipt/message theo actor+conversation+clientMessageId.
   Cùng fingerprint: trả current DTO, `replayed=true`; khác:409 idempotency conflict.
4. Validate reply/file, cấp messageId/event sequence, encrypt, ghi message+receipt+
   chat_event+dispatch job atomically. Unique constraint xử lý cả concurrent retry;
   không catch23505 rồi tiếp tục query trong transaction đã aborted.
5. Commit rồi ack. Worker phát event và tạo notifications theo recipients đủ quyền.
   Ack chỉ nghĩa **server persisted**, không phải delivered/read.

Network retry cùng ID không tạo thêm tin/event/notification. FE chủ động gửi lần
mới dùng ID mới dù body giống nhau. Edit/delete dùng expectedVersion + mutation
UUID key; replay vẫn authorize lại và trả current state, không phục hồi body đã xóa.
Edit window/version chỉ kiểm khi thực hiện mutation mới; receipt hợp lệ đã commit
có thể replay sau15 phút nếu actor vẫn có current authorization, không edit lại.

### Outbox, reconnect và revoke

- Socket.IO không bảo đảm phát lại sự kiện bị lỡ theo mặc định. Worker có thể phát
  trùng khi crash sau emit trước complete; FE dedupe bằng eventId/messageId/version.
- Durable REST history + events là nguồn khôi phục. GET events có upper-watermark
  chốt lúc bắt đầu catchup, page ASC; page không có side effects read receipt.
- Event edit/delete được replay bằng current authorized message projection, không
  khôi phục nội dung phiên bản cũ. Nếu message đã bị xóa chỉ tombstone; nếu không
  còn quyền thì không trả metadata resource đó. Expired cursor trả410 yêu cầu resync.
- Room là danh sách ứng viên, không authority. Dispatcher kiểm lại **từng socket**
  account/session/token-expiry + source entitlement trước phát content/typing/read;
  không phát body bằng io.to(room).emit sau chỉ kiểm người gửi. Khi revoke commit,
  purge pending deliveries, remove room và invalidate cache; per-delivery check là
  backstop nếu domain event chậm. Byte đã gửi trước revoke không thể thu hồi.
- Khi logout/role change/suspension, không tiếp tục gửi tới socket bị vô hiệu dù
  client không phát thêm event. Định nghĩa và test race tại điểm authorization;
  nếu cần serialize nghiêm ngặt, lock scope kiểm quyền ở bước lập delivery.
- Auth handshake dùng exported TokenService + AuthService. Bổ sung verified exp
  accessor trong Auth public API vì AuthenticatedUser hiện không có exp. Timer
  đóng socket lúc access token hết hạn; FE refresh qua HTTP hiện có rồi reconnect.
  Không đưa refresh token lên socket hay token trong URL.
- V1 tắt Socket.IO connection-state recovery để tránh replay bỏ qua auth. Sau này
  bật recovery phải revalidate middleware và quyền từng packet.

## 7. Lifecycle, backfill và eventual consistency

| Trigger | Hành động / invariant |
|---|---|
| Create class | Class+domain event cùng transaction; group được consumer tạo tự động sau commit; created_by actor hoặc SYSTEM rõ ràng. |
| Existing classes | Backfill idempotent trước enable; unique class_id; không giả actor UUID; không gửi notification hàng loạt. |
| Mentor assignment | Cấp mentor mới; mentor cũ mất class scope; DM cũ chỉ còn quyền nếu có lớp chung khác. |
| CASH checkout hợp lệ | Enrollment hold + outbox cùng transaction; auto group member và ensure DM theo cặp. UI pending provisioning có retry/backoff hữu hạn. |
| CASH manager confirm / PayOS settlement | Không đổi payment invariants; ACTIVE cấp chat nếu chưa có, CASH member hiện hữu không duplicate. |
| CASH expires / cancel / class cancelled | Current scope deny ngay khi check; worker/reconciler cập nhật left_at, room, notification visibility. Không phụ thuộc cron đã đổi enrollment hay chưa. |
| COMPLETED | Đọc history theo cửa sổ hợp lệ; disable send/edit/delete/typing/upload. |
| Role/account/session revoke | Account không hợp lệ chặn toàn bộ chat/inbox; session revoke chỉ ngắt sessions đó. |

Nghiệp vụ payment/enrollment giữ nguyên nguồn sự thật. Không dùng chat_members để
mở material, không thay TTL hold, không tạo transaction thanh toán giả. Outbox job
lỗi không rollback một khoản đã commit; tự retry/reconcile và có metric backlog.

## 8. File/image và notification

**Files gap thực tế:** FilesController hiện chỉ Manager/Mentor, scope CourseUnit;
không phải upload API chat cho Student. Không nới toàn bộ Roles để vượt giới hạn.

Slice6.6 thêm API chat attachment scoped riêng, tái dùng Files storage/validator
qua exported provider. Cần mở rộng file_objects với discriminator purpose
COURSE_MATERIAL/ASSIGNMENT/CHAT và nullable course_unit_id chỉ với CHAT, hoặc model
owner tương đương được review theo schema thực tế tại thời điểm implement. Không
giả CourseUnit cho DM. Giữ constraint/quyền material và assignment hiện hữu;
migration upgrade regression bắt buộc trước mở capability.

V1 đề xuất IMAGE JPEG/PNG/WebP tối đa5MiB; FILE PDF tối đa10MiB; một file/message,
không SVG/HTML/executable/ZIP trong chat v1. Pipeline intent→storage PUT→complete→
validation→READY, immutable object version, owner đúng user và conversation.
Không network/storage call trong chat transaction. Upload không tự thành message.
Read/access authorize lại conversation+message, signed GET TTL<=60s; URL đã phát
còn sống tối đa TTL sau revoke. Storage encryption của file là công việc riêng,
AES body không đồng nghĩa binary đã mã hóa. Orphan cleanup có grace period và
không purge object đã được message commit tham chiếu.
Khi xóa mềm, đánh reference attachment không còn active trong cùng transaction;
cleanup chỉ xóa nếu không có active message reference khác. Giữ receipt/message
identity để không biến retry tin đã xóa thành upload/send mới.

Notifications tạo async idempotent từ message-created job cho recipient có quyền
tại thời điểm gửi và còn quyền khi xử lý; không cho thành viên gia nhập sau nhận
thông báo cũ. Snapshot eligible recipient IDs hoặc eligibility cutoff được ghi
trong transaction, không snapshot body. Không tạo cho sender; không dựa vào online
status để quyết định tạo. Inbox count/list cũng lọc quyền hiện tại. Đọc conversation
đánh read notifications tới cursor; đọc notification không tự nâng last_read_seq.

## 9. Slices và dependency

| Slice | Deliverables | Acceptance chính |
|---|---|---|
| 6.0 — Contracts/access | Policy matrix, pending/complete/history defaults, typed scope contracts, lock order, DTO/event errors, dependency versions tương thích Nest11 | Quyền được test theo source; không vòng import; flow/API cập nhật trước FE tích hợp. |
| 6.1 — Schema/crypto | Migration, keyring/crypto/receipt, conversation/message repositories, backfill tool dry-run/apply | Clean+upgrade+repeat migration; AAD/tamper/key rotation; key absent fail closed; không plaintext persisted. |
| 6.2 — Membership/REST | Domain outbox integration, group create/backfill, DM ensure, discovery/members/history/send/reply | Auto member CASH, PayOS activation; no GET writes; pending expiry; unique races; unauthorized lists không leak counts. |
| 6.3 — Realtime/recovery | Gateway auth, origin, rate limits, send/join/leave/typing; dispatcher and events catchup; định nghĩa read event, mở handler ở6.4 | Lost ack/server restart/dedupe; expired/revoked passive socket không nhận body; HTTP filter không dùng cho WS. |
| 6.4 — Mutations/read | Edit/delete versions/receipts, monotonic read cursor, unread, concurrent devices | Catchup nhận edit/delete; deleted replay không lộ body; same key khác payload409; race một winner. |
| 6.5 — Notifications | Durable chat inbox, fanout job, read/read-all, unread count; generic payload | Retry không duplicate; sender excluded; recipient cutoff/revoke; mark read không vượt authority. |
| 6.6 — Attachments | Chat-specific Files scope/schema/validation/access/orphan jobs | Student scoped upload; foreign file deny; not READY deny; revoked download deny; regression Materials/Assignments. |
| 6.7 — Handoff/ops | Tổng hợp Swagger/Postman/Socket.IO harness từ từng slice, key/worker runbook, full gates | Cả REST+real socket tests, clean/upgrade+rollback notes, no secret logs; FE/VPS evidence ghi riêng. |

Dependency: 6.0 → 6.1 → 6.2 → 6.3 → 6.4 → 6.5 → 6.6 → 6.7.
Mỗi slice cập nhật plan/flow/API/progress cùng commit. Không đánh phase complete
khi mới có text demo hoặc chưa có recipient revoke tests.

### 9.1. Cách thực hiện và mốc bàn giao

Chi tiết task được lập ngày2026-10-24 và đã chuyển sang các file slice riêng ở trên.
Ở baseline planning, toàn bộ task là TODO implementation; trạng thái hiện hành xem Progress6.
Checkbox chỉ đánh dấu khi có code và evidence tương ứng. Task ID `6.x-Tyy` dùng
để đối chiếu progress/review; tên file/provider mới là đề xuất theo convention repo.
Không cài package, tạo migration, chạy backfill hoặc sửa FE trong lượt lập kế hoạch.

| Mốc | Phải hoàn tất | Có thể nghiệm thu | Phần còn thiếu |
|---|---|---|---|
| R0 nền tảng | 6.0–6.1 | Policy/crypto/schema trên DB test | Chưa có chat cho FE. |
| R1 REST text | 6.2 | Auto group/DM, history, send/reply qua REST | Chưa realtime, edit/delete/read/inbox/attachment. |
| R2 realtime text | 6.3–6.4 | Socket send/reconnect/revoke, sửa/xóa, unread/read | Chưa inbox notification và file/image. |
| R3 text + inbox | 6.5 | Chat text + thông báo bền vững | `canAttach=false`; chưa hoàn tất Phase6. |
| R4 full scope local | 6.6–6.7 | Text/image/PDF + inbox + full local gates | Deploy/FE browser/live smoke cần evidence riêng. |

Đây là thứ tự triển khai tuần tự, không phải phân công agent hoặc cam kết thời gian.
Mỗi slice đi qua source/schema cần thiết → service → transport → tests → docs.
Swagger/Postman và harness được bổ sung ngay khi route/event có runtime;6.7 kiểm
đủ và tổng hợp, không dồn toàn bộ test/tài liệu tới cuối phase.

<a id="slice-60"></a>

### 9.2. Slice6.0 — Contracts, access và biên tích hợp

Plan chi tiết đã tách sang [Phase 6.0 — Contracts, access và biên tích hợp](PHASE_6_0_CONTRACTS_ACCESS.md).
Task, tiêu chí nghiệm thu và hướng kiểm thử được quản lý trong file riêng;
quy tắc chung và dependency giữ tại tài liệu này.

<a id="slice-61"></a>

### 9.3. Slice6.1 — Schema, mã hóa, receipt và job foundation

Plan chi tiết đã tách sang [Phase 6.1 — Schema, mã hóa, receipt và job foundation](PHASE_6_1_SCHEMA_CRYPTO_FOUNDATION.md).
Task, tiêu chí nghiệm thu và hướng kiểm thử được quản lý trong file riêng;
quy tắc chung và dependency giữ tại tài liệu này.

<a id="slice-62"></a>

### 9.4. Slice6.2 — Lifecycle membership và REST text hoàn chỉnh

Plan chi tiết đã tách sang [Phase 6.2 — Lifecycle membership và REST text hoàn chỉnh](PHASE_6_2_MEMBERSHIP_REST.md).
Task, tiêu chí nghiệm thu và hướng kiểm thử được quản lý trong file riêng;
quy tắc chung và dependency giữ tại tài liệu này.

<a id="slice-63"></a>

### 9.5. Slice6.3 — Socket.IO, nhận event an toàn và reconnect

Plan chi tiết đã tách sang [Phase 6.3 — Socket.IO, nhận event an toàn và reconnect](PHASE_6_3_REALTIME_RECOVERY.md).
Task, tiêu chí nghiệm thu và hướng kiểm thử được quản lý trong file riêng;
quy tắc chung và dependency giữ tại tài liệu này.

<a id="slice-64"></a>

### 9.6. Slice6.4 — Edit/delete, read cursor và unread đa thiết bị

Plan chi tiết đã tách sang [Phase 6.4 — Edit/delete, read cursor và unread đa thiết bị](PHASE_6_4_MUTATIONS_READ.md).
Task, tiêu chí nghiệm thu và hướng kiểm thử được quản lý trong file riêng;
quy tắc chung và dependency giữ tại tài liệu này.

<a id="slice-65"></a>

### 9.7. Slice6.5 — Notification inbox bền vững

Plan chi tiết đã tách sang [Phase 6.5 — Notification inbox bền vững](PHASE_6_5_NOTIFICATION_INBOX.md).
Task, tiêu chí nghiệm thu và hướng kiểm thử được quản lý trong file riêng;
quy tắc chung và dependency giữ tại tài liệu này.

<a id="slice-66"></a>

### 9.8. Slice6.6 — Image/PDF attachments theo conversation

Plan chi tiết đã tách sang [Phase 6.6 — Image/PDF attachments theo conversation](PHASE_6_6_CHAT_ATTACHMENTS.md).
Task, tiêu chí nghiệm thu và hướng kiểm thử được quản lý trong file riêng;
quy tắc chung và dependency giữ tại tài liệu này.

<a id="slice-67"></a>

### 9.9. Slice6.7 — Full gates, handoff và vận hành

Plan chi tiết đã tách sang [Phase 6.7 — Full gates, handoff và vận hành](PHASE_6_7_HANDOFF_OPERATIONS.md).
Task, tiêu chí nghiệm thu và hướng kiểm thử được quản lý trong file riêng;
quy tắc chung và dependency giữ tại tài liệu này.

### 9.10. Ma trận sẵn sàng và test xuyên slice

| Nhóm contract | Định nghĩa | Mở runtime sau slice | Evidence tối thiểu |
|---|---|---|---|
| C1–C5, M1, M2 TEXT/reply | 6.0 | 6.2 | Policy/PG + compiled HTTP; CASH/PayOS/regression. |
| E1, join/leave/send/typing, created/membership/access events | 6.0 | 6.3 | Real clients + passive revoke + restart/catchup. |
| M3/M4/R1, message:read, updated/deleted/conversation:read | 6.0 | 6.4 | PG version/receipt/read races + HTTP/socket. |
| N1–N4, notification:created/notifications:read, R1 inbox hook | 6.0 | 6.5 | Fanout/read/revoke races + own socket sync. |
| F1–F4, M2 FILE/IMAGE, canAttach=true | 6.0 | 6.6 | MinIO/binary/purpose migration + HTTP/socket. |
| Bộ contract đầy đủ và release package | Từng slice | 6.7 | Full local gates + runbook/evidence matrix. |

Các regression bắt buộc: CASH pending chỉ mở chat, không mở materials/quiz;
manager confirm/PayOS settlement không đổi tiền/hold/email semantics; class primary
reassignment không bị lẫn substitute; Files CHAT không lọt material/assignment
read models. Khi thay code ở slice sau, chạy lại nhóm bị ảnh hưởng, không tự đổi
evidence cũ thành bằng chứng cho code mới.

Các quyết định phải đóng trước code phụ thuộc: receipt physical mapping và lock
graph ở6.0; job consumer ownership/cutoff ở6.1; lifecycle writer coverage ở6.2;
passive revoke authorization boundary ở6.3; Files purpose model ở6.6. Đây là việc
implementation phải giải quyết bằng source/tests, không mặc định cần hỏi lại user
cho lựa chọn kỹ thuật thường lệ trong phạm vi đã cho phép.

## 10. Test matrix và vận hành

- Unit: policy mọi actor/status, canonical DM pair, canonical request/HMAC,
  encrypt/decrypt Unicode/empty caption, tag/IV/AAD/key tamper, cursor validation.
- PostgreSQL isolated: unique concurrent send/DM/group provisioning; rollback,
  receipts same/different payload; monotonic sequence/read; reply cross-conversation;
  notification unique; lease expiry/dead-letter; old/current migrations và FK checks.
- Compiled HTTP: cookie auth, foreign IDs404, list/cursor/capabilities, CASH pending
  còn hạn vs PayOS pending; manager confirm đúng Order/Payment/Enrollment, replay;
  material access vẫn bị chặn khi chỉ chat pending.
- Real Socket.IO clients: two users/tabs, fake sender reject, origin missing/evil,
  payload limit, expired token, refresh reconnect, passive logout/session revoke,
  membership/reassignment/expiry revoke, crash after commit/emit, catchup gaps,
  edit/delete/replay, typing TTL, max socket limits và graceful shutdown.
- Files: MinIO isolated, declared-vs-actual MIME, READY immutable version, cross-user/
  cross-conversation references, completed read-only, URL TTL và orphan race.
- Notifications: account owner, read-all concurrency cutoff, stale recipients,
  failed fanout replay, no body in DB inbox/outbox/logs.

Defaults đề xuất: body<=4000 ký tự và<=16KiB UTF-8; socket packet<=32KiB;
send<=20/phút/user và burst5/giây/user; typing<=1/2s/conversation/user TTL5s;
max5 sockets/user, max20 subscribed conversations/socket; mọi giới hạn enforce
server, có error retryAfterMs. HTTP parser64KiB hiện có giữ nguyên.

Retention v1: chat events90 ngày, cursor cũ410; job đã complete30 ngày; notifications
90 ngày; receipts send/tombstone giữ cùng message; chưa tự purge message content.
Policy retention phải hiện trong runbook, không xóa key khi backup còn cần đọc.

Gates implementation: `pnpm lint`, `pnpm type-check`, targeted suites, `pnpm test`,
`pnpm build`, `pnpm test:http` và real-socket suite mới. Full check dùng môi trường
test riêng; không chạy production migrations để chứng minh local pass.

Rollout: backup DB+keyring → migrate/backfill dry-run rồi apply → deploy disabled
→ cấu hình secrets/origin/TLS/proxy upgrade/timeout → enable staging → smoke2 users
→ enable production sau quy trình deploy hiện hành. Không bật nhiều BE instance
trước khi có distributed fanout adapter/dispatch routing; Redis alone không đủ
nếu sau này bật polling. Rollback code giữ additive tables/keyring, disable workers
và traffic; không chạy down phá lịch sử. Rotate/re-encrypt job phải checkpoint được.

Metrics: outbox age/retries/dead-letter, connection/auth/rate rejects, send latency,
crypto failures/key-version usage, cursor resync và orphan jobs. Log IDs/error codes,
không body/token/cookie/key/signed URL. Reconcile có dry-run và bounded batches.

## 11. Tài liệu tham chiếu kỹ thuật

- [NestJS gateway](https://docs.nestjs.com/websockets/gateways): gateway/adapter integration.
- [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/):
  ordered events không thay persistence/retry của ứng dụng.
- [Socket.IO connection recovery](https://socket.io/docs/v4/connection-state-recovery):
  recovery không luôn thành công, không thay durable catchup.
- [Node.js22 crypto](https://nodejs.org/docs/latest-v22.x/api/crypto.html):
  AES-GCM, IV, AAD, auth tag và HKDF.
- [OWASP WebSocket](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html):
  origin, session lifecycle và message authorization.
- [OWASP cryptographic storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html):
  authenticated encryption và tách khóa khỏi ciphertext.
