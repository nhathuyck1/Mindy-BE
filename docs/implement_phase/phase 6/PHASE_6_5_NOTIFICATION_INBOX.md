# Phase 6.5 — Notification inbox bền vững

Tách thành plan riêng ngày **2026-10-26** từ slice 6.5 của kế hoạch Phase 6 ngày 2026-10-24.

[Plan Phase 6](PHASE_6_CHAT_NOTIFICATIONS.md) ·
[Progress Phase 6](../../progress/phase%206/PHASE_6_PROGRESS.md) ·
[Flow](../../api_flow/PHASE_6_FLOW.md) ·
[API](../../api_flow/PHASE_6_flow-api-breakdown.md) ·
[Runbook](../../PHASE_6_CHAT_RUNBOOK.md).

[Trước: 6.4](PHASE_6_4_MUTATIONS_READ.md) · [Tiếp: 6.6](PHASE_6_6_CHAT_ATTACHMENTS.md)

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
| AC6.5-1 | PASS | L: replay fanout đã commit nhưng job chưa complete không duplicate, sender/late-joiner excluded; generic payload không chứa body. |
| AC6.5-2 | PASS | L: skip delete/revoke-before, hide list/count/read sau revoke và group rejoin; H: notification đã fanout trước revoke vẫn không phát socket sau barrier, đủ4 revoke causes. |
| AC6.5-3 | PASS | L: read-before/Promise.all read+fanout/read-after không resurrect unread; N3 không nâng cursor; read tới first seq giữ second unread. |
| AC6.5-4 | PASS | L: read-all snapshot barrier giữ late fanout unread/readAt idempotent/foreign404; H own tabs read sync và missed-event reconnect/refetch count. |
| AC6.5-5 | PASS | L/S: REALTIME complete không chặn NOTIFICATION, cutoff không nhận late joiner, backfill/reconcile repeat không sinh inbox hàng loạt. |

Ký hiệu P/C/S/L/H/F/G/R/U, kết quả gates và migration dev: [Progress Phase6](../../progress/phase%206/PHASE_6_PROGRESS.md#docker-acceptance-2026-10-26).
Không thay runtime API/quyền; dev database đã migrate theo yêu cầu user. Các điều khiển barrier/crash chỉ có trong fixture của dedicated HTTP-test DB.

## 1. Mục tiêu, đầu vào và đầu ra

Tin mới tạo một thông báo generic cho mỗi recipient hợp lệ, đồng bộ
đọc giữa inbox và conversation theo đúng một chiều. Phụ thuộc6.4; mở N1–N4,
`notification:created`, `notifications:read`. V1 chỉ CHAT_MESSAGE.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
|---|---|
| 6.5-T01 | Thêm notifications schema/index/unique bằng migration additive ở slice này; dựng NotificationsModule và scope provider interface được composition layer nối Chat. Không import Chat↔Notifications lẫn nhau. |
| 6.5-T02 | Notification consumer có trạng thái/checkpoint riêng từ6.1; message-created fanout theo recipients eligible tại send và còn current rights khi xử lý. Exclude sender/new joiners, skip deleted message; mỗi recipient insert unique chống duplicate. |
| 6.5-T03 | Chống delayed fanout sau read: nếu message.creationSeq<=member.lastReadSeq khi insert thì read_at có giá trị, không làm badge xuất hiện lại. Serialize insert/read bằng khóa/state chung đã chốt; retry race không rollback read cursor. |
| 6.5-T04 | N1/N2 list/count cùng owner+resource visibility; current role/account/class/window, message deleted đều lọc. Pagination/count không lấy raw unread rows rồi trả số sai khi rights bị revoke. |
| 6.5-T05 | N3 read set-once, không nâng conversation cursor. N4 read-all cutoff theo statement snapshot, tin tới sau vẫn unread, không tự replay lost response thành lệnh read-all mới. |
| 6.5-T06 | Nối R1 cập nhật own notifications tới creation sequence; realtime inbox event tới own active authorized sockets sau commit. Offline/online đều tạo inbox, reconnect refetch list/count để bù missed events. |
| 6.5-T07 | Chốt activation cutoff/replay các notification jobs còn chờ từ6.2, không bootstrap bão inbox lịch sử/backfill. Consumer retry/dead-letter không phụ thuộc realtime job đã complete; docs/Postman/harness theo cùng revision. |

**File dự kiến:** `src/modules/notifications/{controllers,services,dtos,entities}/`,
public visibility-provider contract, chat notification consumer/composition wiring,
read coordinator/hook. Không copy raw MessageDto hoặc signed file URL vào inbox/job.

## 3. Tiêu chí nghiệm thu

- [x] `AC6.5-1`: fanout crash/retry cho một notification/user/message, không sender,
  không late joiner, không plaintext chat trong title/body/data/logs.
- [x] `AC6.5-2`: revoke/delete trước xử lý skip; revoke sau insert ẩn ở list/count/read
  và không deliver socket packet; group rejoin không lộ inbox ngoài history window.
- [x] `AC6.5-3`: conversation read trước/during/after fanout không làm unread quay lại;
  N3 không tự nâng lastReadSeq; R1 chỉ read notifications tới mốc đã yêu cầu.
- [x] `AC6.5-4`: read-all snapshot giữ notification mới unread; N3 lặp giữ readAt;
  hidden/foreign IDs404; own tabs sau missed events refetch ra cùng count.
- [x] `AC6.5-5`: job realtime complete trước notification consumer không mất fanout;
  dữ liệu trước activation cutoff/backfill không tạo notification hàng loạt.

## 4. Kiểm thử và bàn giao

`test/integration/phase65-chat-notifications.spec.ts`,
`test/http/phase65-notifications.spec.ts` và passive-socket tests trong harness.
Bàn giao R3 giữ `canAttach=false`; không mở notification assignment/payment.
