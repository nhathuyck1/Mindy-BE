# Phase 7 — Flow notification bằng Firebase

Implementation 2026-10-27: P1/P2 installation chạy với cookie/Origin/role, token AES-GCM/HMAC và session revoke trigger. ChatNotificationsService.fanout tạo inbox + durable delivery trong cùng transaction; push disabled vẫn giữ inbox/socket. Worker lease30s/heartbeat5s, recheck current scope/session/read/delete/generation/TTL, HTTP deadline10s, max8 attempts/backoff+jitter/Retry-After. SENT chỉ provider accept.

Kiểm chứng local: unit/PG và compiled HTTP suites, HTTP v1 Postman simulation (6/6); full gates ghi tại [progress](../progress/phase%207/PHASE_7_PROGRESS.md). Migration chỉ chạy trong databases '_test'; chưa cấu hình/gửi Firebase thật hoặc deploy. FE web SDK/service worker thuộc nhóm FE.

Các flow BE bên dưới nay có source; các bước browser vẫn là hợp đồng bàn giao. Default inbox path '/notifications' cần FE xác nhận trước rollout. Lịch/assignment/material/payment notifications vẫn backlog; push không thay yêu cầu mail trong Flow.txt.


**2026-10-27 · Backend đã implement local; FE/Firebase staging/VPS pending.**
[Plan tổng](../implement_phase/phase%207/PHASE_7_FIREBASE_NOTIFICATIONS.md) ·
[API breakdown](PHASE_7_flow-api-breakdown.md) ·
[Progress](../progress/phase%207/PHASE_7_PROGRESS.md).

## 1. Thay đổi và baseline

Lập Phase 7 để bổ sung FCM web push trên inbox CHAT_MESSAGE của Phase 6. Lượt này
chỉ tạo tài liệu; không cài SDK, đổi API runtime/schema/env, sửa FE hoặc deploy.
Phạm vi chat/web v1 và các giới hạn trong plan là đề xuất triển khai.
Đã đối chiếu source notification/controller/job/auth hiện tại và tài liệu Firebase.
Kiểm chứng lượt planning: diff, liên kết local và task/AC coverage; chưa chạy BE tests.

## 2. Bật notification trên web — flow dự kiến

1. FE login bằng cơ chế cookie hiện tại, GET auth/me để xác định actor/session hợp lệ.
2. Người dùng chọn bật notification; FE kiểm browser support, HTTPS/SW và permission.
3. Permission denied/unsupported: hiển thị trạng thái, giữ chat/inbox bình thường.
4. Permission granted: Web SDK getToken bằng public VAPID key và SW registration.
5. FE giữ installation UUIDv4 cho browser profile, gọi P1 PUT token cùng credentials
   và Origin. BE lấy user/session từ guard, không nhận userId/sessionId trong body.
6. P1 thành công: giữ generation từ BE để DELETE có điều kiện; refresh khi login,
   return focus hoặc getToken trả token khác. Conflict không tự chuyển token qua user khác.

## 3. Tin nhắn → inbox → push — flow dự kiến

1. Gửi tin theo Phase 6: DB message/event/job commit, ack persisted.
2. NOTIFICATION fanout kiểm send-time recipients + current entitlement/history;
   tạo inbox và push deliveries cùng transaction. Exclude sender/late joiner, read,
   deleted/revoked, message gốc trước cutoff/quá TTL và installation inactive. Fanout
   trễ không đặt lại TTL; expiresAt tính từ thời điểm tạo message gốc.
3. Retry fanout dùng unique notification/installation/generation, không duplicate row.
   Đăng ký thiết bị sau fanout không gửi lại inbox cũ.
4. Push worker claim lease; kiểm current session/account/role/chat rights, unread,
   generation/TTL/flags. Không hợp lệ → SKIPPED có reason.
5. Gọi FCM ngoài transaction. Accept → SENT; transient → retry bounded; invalid token
   → INVALID; malformed payload/config → DEAD/alert. Không ảnh hưởng inbox/socket.
6. Foreground onMessage: FE refetch N1/N2 và dedupe với notification:created.
   Background: SDK hiển thị một notification generic, SW không hiển thị thêm lần hai.
7. Click → mở inbox route đã chốt; nếu chưa login thì login trước; refetch inbox và
   scope qua REST. Không suy quyền từ push, không tự mark read từ received event.
8. User chọn inbox item: N3 mark inbox read rồi mở conversation qua Phase 6. Read
   conversation vẫn là command riêng; push không đổi semantics N3/N4.

## 4. Logout, opt-out và account switch

- Opt-out: P2 DELETE theo installation/generation → FE deleteToken → cập nhật trạng thái.
- Logout: FE thử P2 trước auth logout; auth revoke session vẫn là chốt chặn nếu request
  deregister thất bại. BE worker kiểm auth session trực tiếp, không chỉ registry projection.
- Logout-all/password reset/suspension: không còn send với session vô hiệu, cleanup sau.
- Account switch: clear UI/toast cũ, deleteToken/getToken mới, đăng ký owner mới. Token
  thuộc account khác bị409; không retry transfer tự động hoặc trả thông tin owner cũ.
- Push đã provider accept có thể đến sau logout; chỉ generic, không chứa nội dung/account.
  Click luôn resolve lại theo cookie hiện tại. Không hứa recall thông báo đã phát.

## 5. Recovery và bàn giao

| Tình huống | Hành vi dự kiến |
|---|---|
| Không permission hoặc không token | Inbox/socket vẫn hoạt động, không tạo pending delivery vô hạn |
| FCM timeout sau accept | Có thể duplicate push; DB unique + notificationId/tag giúp gộp |
| 429 / 503 | Backoff/jitter, Retry-After, không vượt TTL; quota429 đợi ít nhất60s |
| Read/revoke/delete khi đang chờ | Recheck trước provider call, SKIPPED nếu không còn eligible |
| Đổi token/session | Generation cũ skip, không retarget delivery cũ |
| Worker dừng/crash | Lease reclaim/fenced completion; inbox không mất |
| Tắt push | Tắt cả flags, inbox/socket tiếp tục, không replay lịch sử khi bật lại |

BE bàn giao P1/P2 và schema 7.1 → durable enqueue7.2 → worker7.3 → FE browser7.4
→ local + staging/VPS7.5. Public Firebase config/VAPID, inbox path, SW scope và
browser matrix phải chốt với nhóm FE trước nghiệm thu. Lịch/bài tập/payment push còn backlog.
