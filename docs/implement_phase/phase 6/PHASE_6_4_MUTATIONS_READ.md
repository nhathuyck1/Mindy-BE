# Phase 6.4 — Edit/delete, read cursor và unread đa thiết bị

Tách thành plan riêng ngày **2026-10-26** từ slice 6.4 của kế hoạch Phase 6 ngày 2026-10-24.

[Plan Phase 6](PHASE_6_CHAT_NOTIFICATIONS.md) ·
[Progress Phase 6](../../progress/phase%206/PHASE_6_PROGRESS.md) ·
[Flow](../../api_flow/PHASE_6_FLOW.md) ·
[API](../../api_flow/PHASE_6_flow-api-breakdown.md) ·
[Runbook](../../PHASE_6_CHAT_RUNBOOK.md).

[Trước: 6.3](PHASE_6_3_REALTIME_RECOVERY.md) · [Tiếp: 6.5](PHASE_6_5_NOTIFICATION_INBOX.md)

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
| AC6.4-1 | PASS | L: edit boundary900000ms/+1ms, foreign/completed deny, edit/delete một winner, version409. |
| AC6.4-2 | PASS | L/H: edit receipt replay sau16 phút/delete giữ current tombstone và version. |
| AC6.4-3 | PASS | L: concurrent devices max/no-op timestamp, future/out-window422; group rejoin lastRead baseline >= old message seq và unread0. |
| AC6.4-4 | PASS | L: edit/own/delete/hidden unread đúng, history/catchup không mark read; H giữ created packet tới sau delete chỉ phát body null/version2. |
| AC6.4-5 | PASS | H: mutation/read packets bị chặn ở cả4 revoke causes tại delivery authorization barrier; L/HTTP/socket cùng assert DTO/version/sequence và tombstone. |

Ký hiệu P/C/S/L/H/F/G/R/U, kết quả gates và migration dev: [Progress Phase6](../../progress/phase%206/PHASE_6_PROGRESS.md#docker-acceptance-2026-10-26).
Không thay runtime API/quyền; dev database đã migrate theo yêu cầu user. Các điều khiển barrier/crash chỉ có trong fixture của dedicated HTTP-test DB.

## 1. Mục tiêu, đầu vào và đầu ra

Mutation retry không ghi đè sai version, read chỉ tăng và tombstone
không phục hồi body. Phụ thuộc6.3; mở M3/M4/R1, `message:read`, message updated/
deleted và conversation read events. R1 chưa có notifications vẫn hoạt động;
side effect cập nhật inbox được nối thêm ở6.5 qua interface, tránh vòng module.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
|---|---|
| 6.4-T01 | Edit own message trong15 phút DB time, expectedVersion+mutation key; chỉ body/caption. Check receipt đã commit sau authorize trước window/version mới; encrypt IV mới, version/event/job cùng transaction. |
| 6.4-T02 | Soft delete own message khi canSend, version/receipt/event/job atomic; trả tombstone không body/file/reply. Identity/receipt giữ lại; khác key với current tombstone no-op theo contract, không tạo thêm event. |
| 6.4-T03 | R1 và socket read cùng service: validate existing sequence trong history scope, atomic max lastReadSeq, lastReadAt chỉ đổi khi tăng. Read watermark không tạo durable message event/notification mới. |
| 6.4-T04 | Tính unread bằng eligible nondeleted messages của người khác sau read cursor; edit không tăng unread; delete cập nhật list/count. lastMessage projection và reply reference dùng current state, không quote body đã xóa. |
| 6.4-T05 | E1/dispatcher hỗ trợ update/delete current projection; packets tới đảo thứ tự không downgrade version. read events gửi người đủ quyền và own tabs, không expose read của member đã mất scope. |
| 6.4-T06 | Định nghĩa hook read→notification cutoff theo creation sequence, thực thi ở6.5; message:read handler chỉ bật khi R1 service có runtime. Cập nhật contracts/harness/Postman và read-only UI capability. |

## 3. Tiêu chí nghiệm thu

- [x] `AC6.4-1`: edit đúng biên trước/tại15 phút, completed/foreign author deny;
  concurrent edit/delete một winner,409 version cho loser, không lost update.
- [x] `AC6.4-2`: retry edit sau15 phút trả current DTO nếu receipt hợp lệ và còn quyền;
  send/edit retry sau delete chỉ tombstone, không body gốc/event mới.
- [x] `AC6.4-3`: read12 rồi7 giữ12; future/out-of-window422; multi-device concurrent
  max đúng, timestamp không đổi khi no-op; initial read baseline rejoin hợp lệ.
- [x] `AC6.4-4`: edit không cộng unread; own/deleted/hidden messages không tính;
  history/read event không tự nâng cursor; delayed create packet không resurrect delete.
- [x] `AC6.4-5`: revoked recipient không nhận mutation/read events; REST/real-socket/
  PG tests cùng kiểm DTO/version/sequence, không chỉ assert status200.

## 4. Kiểm thử và bàn giao

`test/integration/phase64-chat-mutations-read.spec.ts`,
`test/http/phase64-chat-mutations-read.spec.ts`, bổ sung real-client harness6.3.
Bàn giao R2 đầy đủ realtime text; inbox/file vẫn chưa sẵn sàng.
