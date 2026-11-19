# Phase 8–15 — Contract notification nghiệp vụ v1

Ngày chốt R0: **20/11/2026**. **CONTRACT READY — business API chưa implement**.
[Roadmap](../implement_phase/BUSINESS_NOTIFICATIONS_ROADMAP.md) ·
[Catalog](../implement_phase/phase%208/EVENT_CATALOG.md) ·
[Policy](../implement_phase/phase%208/RECIPIENT_POLICY.md) ·
[FE mapping](../implement_phase/phase%208/FE_TARGET_MAPPING.md) ·
[Flow](BUSINESS_NOTIFICATIONS_FLOW.md) · [Progress](../progress/BUSINESS_NOTIFICATIONS_PROGRESS.md).

## 1. Quyết định compatibility

Chọn endpoint mới **/api/v1/notification-inbox** cho unified inbox version 1.
Giữ nguyên bốn route **/api/v1/notifications** hiện tại là legacy CHAT_MESSAGE.
Lựa chọn này thay đề xuất ban đầu mở rộng trực tiếp legacy routes: type mới,
nullable refs và read-all toàn hệ thống không phải additive an toàn cho client cũ.
Không cần thay global API versioning hoặc nâng quyền chat controller hiện tại.

| Mặt contract | Legacy /notifications (runtime hiện có) | Unified /notification-inbox (Phase 9) |
| --- | --- | --- |
| Role | Mentor/Student | ACTIVE Student/Mentor/Manager/Admin |
| Types | CHAT_MESSAGE | CHAT_MESSAGE + 17 business types trong catalog |
| Gate | CHAT_ENABLED | NOTIFICATIONS_ENABLED; chat rows còn cần CHAT_ENABLED |
| Read-all | Chỉ chat như hiện tại | Mọi type visible, không phụ thuộc filter danh sách |
| Cursor | Giữ ChatCursorService/signature/scope cũ | Format riêng versioned, không dùng chat keyring |
| Data/read state | Chat rows hiện hữu | Cùng rows và readAt; không copy thành inbox thứ hai |
| Socket event | notification:created / notifications:read, chỉ chat | notification-inbox:created / notification-inbox:read |
| Khi client cũ hoạt động | Không nhận business DTO vào parser cũ | Client mới chủ động opt-in routes/event names mới |

CHAT_MESSAGE cũ giữ actorId/conversationId/messageId UUID, generic title/body,
data.conversationId/messageId và pagination. Unified thêm metadata khi projection
nhưng không sửa DTO legacy. Legacy chat read/read-all cũng phát invalidation event
unified cho own sockets mới khi unified bật; unified đọc chat cần legacy read
invalidation cho own sockets cũ. Không dual-emit business row vào legacy event.
Việc đọc conversation chỉ đánh chat notifications tới sequence như hiện tại.

## 2. Unified routes — chưa tồn tại trong runtime

Base /api/v1; không có public create/fanout/retry route.

| Method / route | Input | Output / effect |
| --- | --- | --- |
| GET /notification-inbox | limit 1–100 mặc định 20; cursor max 2048; unreadOnly boolean mặc định false; category ALL/CHAT/SCHEDULE/ASSIGNMENT/PAYMENT/LEAVE_MAKEUP/MATERIAL mặc định ALL | data + meta.hasMore/nextCursor, keyset createdAt DESC/id DESC |
| GET /notification-inbox/unread-count | Không có filter | unreadCount tổng rows visible trong 90 ngày theo flags/policy |
| PATCH /notification-inbox/:notificationId/read | UUIDv4; không cho client chọn owner | Notification; COALESCE readAt, repeat giữ timestamp |
| POST /notification-inbox/read-all | Không body/filter | readAt + resyncRequired:true; snapshot unread IDs visible lúc bắt đầu |

Guards: AccessTokenGuard + current ACTIVE account/session + RolesGuard +
RequestOriginGuard theo pattern hiện có. GET no-store; PATCH/POST kiểm Origin.
Ownership/policy/flags áp nhất quán list/count/read/read-all. GET không mutate.

| Error | Unified v1 | Legacy giữ nguyên |
| --- | --- | --- |
| Query/category/body/UUID sai | 400 theo ValidationPipe/ParseUUIDPipe | 400 theo guards/DTO hiện có |
| Không có/invalid authentication | Auth contract hiện hành | Auth contract hiện hành |
| Foreign/hidden/not found notification | 404 NOTIFICATION_NOT_FOUND | 404 CHAT_NOT_FOUND (source service) |
| Cursor tamper/scope/owner/version sai | 422 NOTIFICATION_CURSOR_INVALID | 422 CHAT_CURSOR_INVALID |
| Cursor unified quá hạn | 410 NOTIFICATION_CURSOR_EXPIRED | Không thêm TTL mới vào cursor cũ |
| Business API flag OFF | 503 NOTIFICATIONS_DISABLED | Vẫn CHAT_ENABLED; OFF trả 503 CHAT_DISABLED |
| Lỗi provider hạ tầng | 503 NOTIFICATION_POLICY_UNAVAILABLE; không silent skip coi là revoke | Không thay behavior hiện có |

Cursor unified v1: signed HMAC-SHA256 với NOTIFICATION_CURSOR_SECRET (ít nhất
32 bytes entropy, cấp qua secret env); không phụ thuộc CHAT_ACTIVE_KEY_VERSION
hoặc bật chat. Payload có v=1, ownerId, category, unreadOnly, createdAt/id position,
issuedAt/expiresAt; TTL 24h. Không tái sử dụng cursor legacy hoặc đổi filter giữa
các trang. Khi cursor expired, FE refetch trang đầu. Đổi secret invalidates cursor
cũ theo 422 và FE refetch; không ảnh hưởng inbox/read state. Không log cursor/secret.
Thông báo bị revoke sau page đầu được filter lại; không hứa snapshot list bất biến.

## 3. DTO unified v1

```typescript
type NotificationInboxV1 = {
  id: string;
  type: string; // server closed catalog; client unknown-type fallback
  category: 'CHAT' | 'SCHEDULE' | 'ASSIGNMENT' | 'PAYMENT'
    | 'LEAVE_MAKEUP' | 'MATERIAL';
  actorId: string | null; // business luôn null; chat giữ actor hiện hữu
  conversationId: string | null; // chỉ chat
  messageId: string | null;      // chỉ chat
  title: string;
  body: string;
  data: Record<string, string>;  // allowlist theo type, không tùy ý
  readAt: string | null;
  createdAt: string;
  target: {
    kind: 'CHAT' | 'SESSION' | 'CLASS' | 'ASSIGNMENT' | 'SUBMISSION'
      | 'ORDER' | 'LEAVE' | 'MAKEUP' | 'MATERIAL';
    id: string;
    contextId?: string;
    available: boolean;
  };
};
```

Public data allowlist:
- CHAT: conversationId, messageId; target.id=conversationId.
- SESSION/CLASS/ASSIGNMENT/ORDER/LEAVE: đúng resource ID tương ứng, không old/new
  mentor IDs hoặc metadata class khác. SESSION target.contextId=classId chỉ khi
  provider cho phép ancestry đó.
- ZIP grade: submissionId + assignmentId nếu owner được xem; target.id=submissionId.
- MAKEUP: placementId; contextId=targetSessionId chỉ khi current read cho phép.
- MATERIAL: materialId; target.contextId=classId được provider chọn và authorize.
- Terminal unavailable: chỉ resource ID đã có trong recipient snapshot, không
  context/ancestry không còn quyền. target.available=false.
Không trả reason, điểm, grade feedback, HTML, signed URL hoặc payment reference.
Event internal actor vẫn dùng audit/exclusion nhưng không expose business actor.

Active notice mất quyền thì ẩn; terminal notice generic còn visible theo policy.
target.available là quyền đọc resource, không xác nhận FE đã có route.
FE mapping riêng phân biệt route thật, fallback và gap phải implement Phase 15.
Resource API luôn authorize lại khi click; không dùng id trong notification làm vé.

## 4. Flags, activation và retention

| N | C | Worker | Unified behavior | Legacy behavior |
| --- | --- | --- | --- | --- |
| OFF | OFF | bất kỳ | 503 NOTIFICATIONS_DISABLED | 503 CHAT_DISABLED |
| OFF | ON | bất kỳ | 503 NOTIFICATIONS_DISABLED | Chat như hiện tại |
| ON | OFF | OFF/ON | Business rows đã có; category CHAT rỗng | 503 CHAT_DISABLED |
| ON | ON | OFF/ON | Visible chat + business | Chat như hiện tại |

N=NOTIFICATIONS_ENABLED; C=CHAT_ENABLED. NOTIFICATION_JOB_ENABLED chỉ điều khiển
business fanout worker. N OFF chặn emit business/unified API, không xóa inbox hoặc
tắt capture. Worker ON vẫn có thể materialize backlog khi API OFF; socket emit
phải qua N. Chat workers tiếp tục dùng CHAT_JOB_ENABLED như hiện tại.

Producer activation là mốc bền trong DB riêng từng domain, không dùng feature flag
process làm mốc mất event. Sau deploy writer-compatible/schema, enable producer
trong transaction có khóa producer-state, chốt enabledAt và epoch; capture command
serialize trên mốc này. Không quét audit cũ hoặc replay trước activation epoch.
Sau activation, disable API/worker không tắt capture; backlog được revalidate khi
chạy lại. Chưa có producer nào được activate trong Phase 8.

Retention inbox 90 ngày theo createdAt, completed jobs 30 ngày; replay tối đa 90
ngày theo occurredAt và không trước activation. Event/dedupe markers giữ qua cửa sổ
replay (không xóa marker khi xóa inbox). Event hết replay window bị từ chối.
Tắt worker lâu không được gọi replay vô hạn; ops báo backlog/dead-letter cần xử lý.
N10 stale bỏ, N17 chưa tới notBefore không giao sớm; không bootstrap lịch sử.

## 5. Realtime và REST fallback

Giữ namespace /chat cho Mentor/Student hiện tại; không mở handshake role Manager/
Admin. Client mới nghe notification-inbox:created { notification } và
notification-inbox:read { readAt, resyncRequired:true }. Chỉ emit own socket sau
Auth + owner/provider recheck và các flags hợp lệ. CHAT_OFF không có transport
nhưng business API/worker vẫn hoạt động. Manager/Admin dùng REST như đã duyệt.

Socket delivery ít nhất một lần, client upsert theo id và refetch count khi invalidation,
focus/reconnect. Khi không có socket, mở inbox poll mỗi 30 giây, dừng khi tab hidden,
backoff lỗi. Offline/reconnect không tự mark read. Unified read-all snapshot bảo toàn
late fanout unread. Nhiều event nhận lặp không được tăng badge hai lần.

## 6. Contract acceptance cho Phase 9/15

R0 đã chọn compatibility strategy, không ghi route mới là implemented.
Runtime sau này cần kiểm bốn role × flags combinations, legacy cursor/DTO/readAll,
new cursor TTL/filter/owner, cross-view read sync, unknown type/target-unavailable,
socket revoke và read-all race. Swagger/Postman chỉ cập nhật implemented khi code
được nối và chạy kiểm thử. Không mở public admin retry route.
