# Phase 6.3 — Socket.IO, nhận event an toàn và reconnect

Tách thành plan riêng ngày **2026-10-26** từ slice 6.3 của kế hoạch Phase 6 ngày 2026-10-24.

[Plan Phase 6](PHASE_6_CHAT_NOTIFICATIONS.md) ·
[Progress Phase 6](../../progress/phase%206/PHASE_6_PROGRESS.md) ·
[Flow](../../api_flow/PHASE_6_FLOW.md) ·
[API](../../api_flow/PHASE_6_flow-api-breakdown.md) ·
[Runbook](../../PHASE_6_CHAT_RUNBOOK.md).

[Trước: 6.2](PHASE_6_2_MEMBERSHIP_REST.md) · [Tiếp: 6.4](PHASE_6_4_MUTATIONS_READ.md)

**Cách đọc:** nội dung bên dưới giữ task, acceptance criteria và thứ tự triển khai của baseline planning.
Runtime đã có source local theo implementation revision ở plan tổng; tên file/provider và các mốc
“chưa mở” trong baseline là dự kiến tại thời điểm lập kế hoạch. Quyết định implementation hiện hành
xem plan tổng/API; evidence và phần chưa nghiệm thu xem Progress. Checkbox chưa tick không có nghĩa
source chưa tồn tại; việc tách tài liệu không xác nhận thêm AC hoặc thay đổi trạng thái triển khai.

Các quy tắc nghiệp vụ, schema, transaction và phạm vi chung tiếp tục nằm trong
[plan tổng](PHASE_6_CHAT_NOTIFICATIONS.md); đọc cùng plan này trước khi triển khai hoặc review.

## Nghiệm thu tự động — 2026-10-26 (Docker)

**5/5 AC PASS — local backend**. Đã có bằng chứng cho các tiêu chí bên dưới; deployment/VPS/FE/browser/load acceptance vẫn cần evidence riêng.

| AC | Kết quả | Evidence |
|---|---|---|
| AC6.3-1 | PASS | H: missing/evil Origin, forged JWT/actor, passive expiry; HTTP refresh cookie→reconnect→history. |
| AC6.3-2 | PASS | H:24 barrier cases = logout/suspend/reassign/CASH-expiry × created/updated/deleted/read/typing/notification; giữ trước per-socket valid+scope check, revoke commit rồi release. Ordered fence/disconnect xác nhận không nhận packet protected. |
| AC6.3-3 | PASS | H: barrier giữ ack sau DB commit→kill/restart→same-ID replay; emit-before-complete→kill→expire lease→restart→eventId trùng có thể dedupe; L chốt catchup watermark. |
| AC6.3-4 | PASS | H: max5 sockets/20 subscriptions/32KiB, quota HTTP+socket và typing cross-socket; rate unit kiểm20/min và TTL. |
| AC6.3-5 | PASS | H real network + compiled runtime; L cached catchup cursor revoke404 và upper watermark không nhận event mới ngoài snapshot. |

Ký hiệu P/C/S/L/H/F/G/R/U, kết quả gates và migration dev: [Progress Phase6](../../progress/phase%206/PHASE_6_PROGRESS.md#docker-acceptance-2026-10-26).
Không thay runtime API/quyền; dev database đã migrate theo yêu cầu user. Các điều khiển barrier/crash chỉ có trong fixture của dedicated HTTP-test DB.

## 1. Mục tiêu, đầu vào và đầu ra

Cùng message service có transport realtime, mất kết nối khôi phục được,
socket đã mất quyền không nhận thêm content. Phụ thuộc6.2; mở E1, join/leave/send/
typing và message-created/membership/access events. Read command/event chỉ được
định nghĩa ở đây, chưa đăng ký handler cho tới6.4.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
|---|---|
| 6.3-T01 | Pin dependencies tương thích đã chốt, cài gateway/adapter namespace `/chat`, path `/socket.io`, websocket-only. WS validation/error filter riêng, packet limit, config flag và Origin allowlist ở handshake. |
| 6.3-T02 | Cookie handshake qua Auth verified principal+exp; quản lý socket registry theo user/session/subscriptions, token expiry timer và max sockets/rooms. HTTP refresh rồi reconnect; không refresh qua socket, không token URL, tắt connection-state recovery. |
| 6.3-T03 | Join canRead, leave chỉ unsubscribe; send dùng service6.2 không bắt buộc join. Ack persisted sau commit; rate limit REST+WS dùng chung budget user để không lách quota bằng nhiều tabs/transport. |
| 6.3-T04 | Dispatcher consume event/job bền vững, page candidate recipients và authorize từng socket/session/source trước emit current DTO. Dedupe packet bằng eventId/messageId/version; sender tabs cũng sync. Không `io.to(room).emit` body sau chỉ kiểm sender. |
| 6.3-T05 | Nối logout/logoutAll, suspension/current-role changes nếu có writer, mentor/class/enrollment revoke vào disconnect/invalidate. Per-delivery source check vẫn là backstop; cleanup typing/timers/rooms và pending candidates khi revoke. |
| 6.3-T06 | E1 catchup page ASC, signed cursor giữ throughSequence, history visibility, current message projection/tombstone, retention410. Join+buffer→snapshot→catchup không gap; quyền đổi giữa pages thì dừng404. |
| 6.3-T07 | Typing start/stop giới hạn tần suất, joined+canSend, TTL5s, không DB/outbox/catchup; recipient check như content. Expiry/disconnect/revoke dọn state không để hiển thị mãi. |
| 6.3-T08 | Runnable harness hai users/tabs dùng real Socket.IO client, bounded waits/fault injection; cập nhật flow/contract và script chạy socket suite (tên script chốt khi code). Shutdown dừng claim/close sockets, job chưa complete có thể replay. |

**File dự kiến:** `chat/gateways/`, `chat/guards/`, `chat/filters/`,
`chat/services/chat-dispatch.worker.ts`, `chat-socket-registry.service.ts`,
`chat-event-read.service.ts`, `tools/chat/`; sửa Auth/Users writer cần thiết,
`configure-app.ts`/bootstrap theo adapter thực tế và test config nếu cần.

## 3. Tiêu chí nghiệm thu

- [x] `AC6.3-1`: origin missing/evil, cookie/JWT/session invalid và forged actor deny;
  expired token đóng socket im lặng; HTTP refresh/reconnect dùng được history.
- [x] `AC6.3-2`: passive recipient logout/suspend/reassign/CASH expire không nhận
  content/typing/read sau authorization đã thấy revoke; test có barrier ở điểm
  authorize để ghi rõ byte đã phát trước revoke không thể thu hồi.
- [x] `AC6.3-3`: crash sau commit trước ack, sau emit trước complete và server restart
  không mất message; packet trùng được dedupe, event catchup đủ và đúng watermark.
- [x] `AC6.3-4`: max5 sockets/user,20 subscriptions/socket, packet32KiB và shared send
  quota được enforce; typing TTL/rate limit không bypass bằng socket khác.
- [x] `AC6.3-5`: integration qua real network client và compiled application pass,
  không chỉ mock gateway; quyền đổi trong catchup không leak pages/cached DTO.

## 4. Kiểm thử và bàn giao

`test/http/phase63-chat-realtime.spec.ts` (suite real clients)
và `test/integration/phase63-chat-dispatch.spec.ts`. Socket suite cần startup/teardown
server/DB riêng, không giả `pnpm test` hiện tại đã tự chạy `test/http`.
