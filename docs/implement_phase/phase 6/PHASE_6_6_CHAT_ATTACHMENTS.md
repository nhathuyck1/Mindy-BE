# Phase 6.6 — Image/PDF attachments theo conversation

Tách thành plan riêng ngày **2026-10-26** từ slice 6.6 của kế hoạch Phase 6 ngày 2026-10-24.

[Plan Phase 6](PHASE_6_CHAT_NOTIFICATIONS.md) ·
[Progress Phase 6](../../progress/phase%206/PHASE_6_PROGRESS.md) ·
[Flow](../../api_flow/PHASE_6_FLOW.md) ·
[API](../../api_flow/PHASE_6_flow-api-breakdown.md) ·
[Runbook](../../PHASE_6_CHAT_RUNBOOK.md).

[Trước: 6.5](PHASE_6_5_NOTIFICATION_INBOX.md) · [Tiếp: 6.7](PHASE_6_7_HANDOFF_OPERATIONS.md)

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
| AC6.6-1 | PASS | F/H: real image/PDF pipeline; PROCESSING/FAILED/not-ready, foreign owner/conversation/material purpose đều deny; READY version update23514. |
| AC6.6-2 | PASS | H student material upload403; F READY material file không gắn được chat; U giữ legacy READY file qua upgrade; CHAT owner table riêng. |
| AC6.6-3 | PASS | F: MIME/oversize/unsupported, pinned version giữ bytes cũ sau overwrite; intent/complete/send retry giữ một file/upload job/message/notification job. |
| AC6.6-4 | PASS | F: deleted/hidden/revoked sign404; completed đọc file, upload403; signed GET60s, URL cũ còn dùng trong TTL sau revoke. |
| AC6.6-5 | PASS | F: lock barrier send xếp trước cleanup giữ live file; DELETING commit trước send thì deny409; delete requeue cleanup; G regression Files/Materials/Assignments, ZIP Phase5 vẫn pending. |

Ký hiệu P/C/S/L/H/F/G/R/U, kết quả gates và migration dev: [Progress Phase6](../../progress/phase%206/PHASE_6_PROGRESS.md#docker-acceptance-2026-10-26).
Không thay runtime API/quyền; dev database đã migrate theo yêu cầu user. Các điều khiển barrier/crash chỉ có trong fixture của dedicated HTTP-test DB.

## 1. Mục tiêu, đầu vào và đầu ra

STUDENT/MENTOR đủ quyền gửi file qua private storage, download chỉ từ
message được phép đọc. Phụ thuộc6.5 và Files baseline. Mở F1–F4, M2 FILE/IMAGE và
capability attachment **sau khi** migration/validator/access tests đã pass.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
|---|---|
| 6.6-T01 | Rà schema Files/Assignments tại thời điểm code. Thêm CHAT purpose/binding conversation/owner và nullable CourseUnit có CHECK đúng discriminator, hoặc mapping model đã review; legacy file được backfill purpose rõ ràng. Giữ mọi material reference chỉ nhận material-purpose. |
| 6.6-T02 | Public Files provider cho chat intents/status/complete/access/cleanup; Chat resolve scope, Files sở hữu objects/jobs/storage. Không sửa guard cũ thành Student blanket, không truyền CourseUnit giả hoặc import Chat ngược vào Files. |
| 6.6-T03 | F1 idempotent declaration fingerprint/owner/conversation/quota; F2 chốt immutable object version và validation job unique; F3 status visibility owner khi unattached, visible message khi attached. Complete lúc mất quyền gửi bị deny. |
| 6.6-T04 | Allowlist IMAGE JPEG/PNG/WebP<=5MiB, FILE PDF<=10MiB, actual MIME/size/binary validation. Cấm SVG/HTML/ZIP/executable, forged extension/MIME và object version thay thế. No bytes/base64 socket. |
| 6.6-T05 | M2 validate READY+own+CHAT-purpose+conversation+immutable version, attach reference trong message transaction; caption encrypt nullable, TEXT cấm file. Retry cùng clientMessageId không attach/send lần2; upload chưa tự tạo message. |
| 6.6-T06 | F4 current canRead+visible nondeleted message, signed URL<=60s, kiểm quyền trước và sau sign; no network trong DB tx. Không lộ bucket/key/version; completed được đọc file attached nhưng không upload/complete/send. |
| 6.6-T07 | Delete6.4 deactivate attachment reference cùng commit; orphan cleanup grace+claim/recheck active refs, không xóa object vừa được message attach. Storage failure/retry giữ idempotency và tombstone identity. |
| 6.6-T08 | Test MinIO isolated, migrations upgrade cùng material/assignment fixtures; mở flag/canAttach khi gates pass. Cập nhật `.env.example` nếu thêm flags/limits, Postman upload flow, HTTP/socket/harness và runbook cleanup. |

## 3. Tiêu chí nghiệm thu

- [x] `AC6.6-1`: intent→PUT→complete→PROCESSING→READY→send→file-access đi được;
  failed/not READY/foreign owner/purpose/conversation/stale version đều deny.
- [x] `AC6.6-2`: Student chat upload không dùng được Files material routes, mentor
  material file không tự gắn vào chat; purpose isolation giữ sau upgrade/backfill.
- [x] `AC6.6-3`: MIME giả/oversize/unsupported/replace-after-complete bị reject;
  retries không tạo duplicate object jobs/message/ref/notification.
- [x] `AC6.6-4`: deleted/hidden/revoked file-access deny, completed read-only đúng;
  signed URL đã phát sống tối đa TTL, không hứa revoke storage URL tức thì.
- [x] `AC6.6-5`: cleanup vs attach/delete races không xóa live file; MinIO và
  materials/assignment tests pass theo scope đã tồn tại, không giả ZIP Phase5 đã xong.

## 4. Kiểm thử và bàn giao

`test/integration/phase66-chat-files.spec.ts`,
`phase66-chat-files-migration.spec.ts`, `test/http/phase66-chat-files.spec.ts`.
Nếu storage/validator chưa sẵn sàng, giữ canAttach=false và slice TODO; không đổi
full Phase6 thành text-only done.
