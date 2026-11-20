# Phase 6.2 — Lifecycle membership và REST text hoàn chỉnh

Tách thành plan riêng ngày **2026-10-26** từ slice 6.2 của kế hoạch Phase 6 ngày 2026-10-24.

[Plan Phase 6](PHASE_6_CHAT_NOTIFICATIONS.md) ·
[Progress Phase 6](../../progress/phase%206/PHASE_6_PROGRESS.md) ·
[Flow](../../api_flow/PHASE_6_FLOW.md) ·
[API](../../api_flow/PHASE_6_flow-api-breakdown.md) ·
[Runbook](../../PHASE_6_CHAT_RUNBOOK.md).

[Trước: 6.1](PHASE_6_1_SCHEMA_CRYPTO_FOUNDATION.md) · [Tiếp: 6.3](PHASE_6_3_REALTIME_RECOVERY.md)

**Cách đọc:** nội dung bên dưới giữ task, acceptance criteria và thứ tự triển khai của baseline planning.
Runtime đã có source local theo implementation revision ở plan tổng; tên file/provider và các mốc
“chưa mở” trong baseline là dự kiến tại thời điểm lập kế hoạch. Quyết định implementation hiện hành
xem plan tổng/API; evidence và phần chưa nghiệm thu xem Progress. Checkbox chưa tick không có nghĩa
source chưa tồn tại; việc tách tài liệu không xác nhận thêm AC hoặc thay đổi trạng thái triển khai.

Các quy tắc nghiệp vụ, schema, transaction và phạm vi chung tiếp tục nằm trong
[plan tổng](PHASE_6_CHAT_NOTIFICATIONS.md); đọc cùng plan này trước khi triển khai hoặc review.

## Nghiệm thu tự động — 2026-10-26 (Docker)

**6/6 AC PASS — local backend**. Đã có bằng chứng cho các tiêu chí bên dưới; deployment/VPS/FE/browser/load acceptance vẫn cần evidence riêng.

| AC | Kết quả | Evidence |
|---|---|---|
| AC6.2-1 | PASS | L: race first reconcile/backfill/ensureDirect hai chiều → một group/DM và hai DM members, repeat không reset window/read/inbox. H:4 POST direct concurrent trả cùng ID. |
| AC6.2-2 | PASS | L: CASH chat được nhưng learning/quiz404, confirm giữ chat/history; PayOS pending404 → verified settlement → ACTIVE chat. |
| AC6.2-3 | PASS | L: expiry theo DB time, class cancel/mentor reassignment/suspend/current-role/session revoke được chặn trước reconcile. |
| AC6.2-4 | PASS | L/H: send race/retry/lost ack, payload409, reply foreign/hidden/deleted404, sender injection422. |
| AC6.2-5 | PASS | L: GET không thay member state, actor-bound pagination, list chỉ2 scope hợp lệ, foreign message không lọt; group/DM rejoin history đúng. |
| AC6.2-6 | PASS | L: class/outbox/job/member rollback cùng fault; G/H: payment/commerce và compiled HTTP regression. |

Ký hiệu P/C/S/L/H/F/G/R/U, kết quả gates và migration dev: [Progress Phase6](../../progress/phase%206/PHASE_6_PROGRESS.md#docker-acceptance-2026-10-26).
Không thay runtime API/quyền; dev database đã migrate theo yêu cầu user. Các điều khiển barrier/crash chỉ có trong fixture của dedicated HTTP-test DB.

## 1. Mục tiêu, đầu vào và đầu ra

Mentor/student đủ quyền tự có group/DM, gửi/reply và đọc text bằng REST.
Phụ thuộc6.1; không cần gateway để kiểm chứng. Contract được mở: C1–C5, M1–M2;
M2 chỉ TEXT và `canAttach=false`. Chưa mở M3/M4/R1/N1–N4/F1–F4.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
|---|---|
| 6.2-T01 | Ghi outbox cùng transaction class create/open/start/complete/cancel và primary mentor reassignment. Phân biệt class primary assignment với session substitute; session override không tự cấp class chat. |
| 6.2-T02 | Tích hợp CASH checkout hold, CASH confirm, verified PayOS settlement, order expiry/cancel và enrollment mutations thực sự có trong source. Event idempotent; settlement giữ Order PAID/Payment SUCCEEDED/Enrollment ACTIVE và mail outbox cũ. Không tạo group trực tiếp trong payment transaction. |
| 6.2-T03 | Consumer đọc current source, ensure unique group và DM sorted pair/hai member. Reconcile event sai thứ tự không phục hồi quyền cũ. CASH pending→ACTIVE giữ conversation/member/window/read/key; late activation không recreate hold. |
| 6.2-T04 | Group initial join/rejoin cập nhật visibleFromSeq/lastReadSeq; revoke để leftAt và tăng entitlementVersion. DM cùng pair giữ history theo policy; completed chỉ mở history existing, không tạo DM mới từ read-only context. |
| 6.2-T05 | Hoàn thiện backfill/reconcile apply: paging/checkpoint/restart/idempotent, SYSTEM actor, không notification. Lớp DRAFT có thể provision group kín, cancelled không cấp thành viên; DM chỉ ensure cặp writable hợp lệ. |
| 6.2-T06 | C1–C5/M1: auth+Origin phù hợp, source-aware list/members/history, keyset cursor bound actor/scope, snapshot highWatermark; no GET writes. C3 đủ source nhưng thiếu projection503; outside scope404 trước xem provisioning. |
| 6.2-T07 | M2 chung service cho REST/socket sau này: lock/authorize → receipt → reply check → encrypt → message/event/job/recipient snapshot atomic → response sau commit. Same ID/body replay current DTO; different body409; chưa READY/attachments disabled xử lý đúng contract. |
| 6.2-T08 | Cập nhật DTO/Swagger/Postman REST và flow minh họa CASH pending→confirm/expiry; API rows đánh local implemented chỉ sau tests. Ghi trạng thái notification consumer chưa bật, giữ pending notification work tới6.5 hoặc có cutoff rollout rõ ràng. |

**Điểm sửa thực tế:** Class service/teaching assignment; checkout/order expiry;
CASH/PayOS settlement; enrollment owner; module imports/exports; chat controllers,
`chat-lifecycle.service.ts`, `chat-access.service.ts`, `chat-read.service.ts`,
`chat-message.service.ts`. Chỉ nối writers hợp lệ đã rà soát, không tạo endpoint
commerce mới chỉ để thuận tiện cho chat.

## 3. Tiêu chí nghiệm thu

- [x] `AC6.2-1`: concurrent provision/backfill/POST direct chỉ một group/lớp, một
  DM/cặp và đúng hai DM members; chạy lại không reset read/history hoặc tạo inbox.
- [x] `AC6.2-2`: CASH pending hợp lệ chat được nhưng materials/quiz vẫn deny;
  PayOS pending deny, verified activation cấp chat; confirm CASH không reset chat.
- [x] `AC6.2-3`: expiry deny theo DB time dù cron/consumer dừng; class cancel/mentor
  reassignment/current account đổi chặn quyền dù membership projection stale.
- [x] `AC6.2-4`: send concurrent/lost response/retry cho một message/event/job;
  khác payload409; reply foreign/hidden/deleted deny; senderId injection422.
- [x] `AC6.2-5`: GET không ghi rows/read state, pagination không leak count/lastMessage
  từ scope khác; group rejoin không thấy old window, DM valid trở lại giữ lịch sử.
- [x] `AC6.2-6`: focused PostgreSQL + compiled HTTP pass, commerce/payment regression
  pass; source transaction+event rollback cùng nhau khi fault injection.

## 4. Kiểm thử và bàn giao

`test/integration/phase62-chat-lifecycle.spec.ts`,
`phase62-chat-messages.spec.ts`, `test/http/phase62-chat.spec.ts`.
Bàn giao R1 có thể dùng REST text, chưa ghi nhận realtime/inbox đã hoạt động.
