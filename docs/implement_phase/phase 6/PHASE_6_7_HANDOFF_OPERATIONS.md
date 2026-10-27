# Phase 6.7 — Full gates, handoff và vận hành

Tách thành plan riêng ngày **2026-10-26** từ slice 6.7 của kế hoạch Phase 6 ngày 2026-10-24.

[Plan Phase 6](PHASE_6_CHAT_NOTIFICATIONS.md) ·
[Progress Phase 6](../../progress/phase%206/PHASE_6_PROGRESS.md) ·
[Flow](../../api_flow/PHASE_6_FLOW.md) ·
[API](../../api_flow/PHASE_6_flow-api-breakdown.md) ·
[Runbook](../../PHASE_6_CHAT_RUNBOOK.md).

[Trước: 6.6](PHASE_6_6_CHAT_ATTACHMENTS.md)

**Cách đọc:** nội dung bên dưới giữ task, acceptance criteria và thứ tự triển khai của baseline planning.
Runtime đã có source local theo implementation revision ở plan tổng; tên file/provider và các mốc
“chưa mở” trong baseline là dự kiến tại thời điểm lập kế hoạch. Quyết định implementation hiện hành
xem plan tổng/API; evidence và phần chưa nghiệm thu xem Progress. Checkbox chưa tick không có nghĩa
source chưa tồn tại; việc tách tài liệu không xác nhận thêm AC hoặc thay đổi trạng thái triển khai.

Các quy tắc nghiệp vụ, schema, transaction và phạm vi chung tiếp tục nằm trong
[plan tổng](PHASE_6_CHAT_NOTIFICATIONS.md); đọc cùng plan này trước khi triển khai hoặc review.

## Nghiệm thu tự động — 2026-10-26 (Docker)

**4/4 AC PASS — local backend**. Đã có bằng chứng cho các tiêu chí bên dưới; deployment/VPS/FE/browser/load acceptance vẫn cần evidence riêng.

| AC | Kết quả | Evidence |
|---|---|---|
| AC6.7-1 | PASS | G691/691 và H toàn bộ117 tests không skip; Node22/pnpm12/PostgreSQL17.11 Docker/MinIO test; final source fingerprint/logs ở Progress. |
| AC6.7-2 | PASS | H:19 REST method/routes,6 socket commands/ack success+422/429,9 server events/capability DTOs khớp runtime/docs; captured child logs không có body canary/cookie/JWT/key/signed URLs. Đã sửa drift mô tả event/ack/typing quota. |
| AC6.7-3 | PASS | R: compiled metrics/backfill dry/apply/bounded replay dry/apply + rotate/DB/key restore; H abrupt restart/disabled rollback giữ message/receipt; L reconcile. |
| AC6.7-4 | PASS | Local backend39/39 AC complete; dev đã migrate32; deployment readiness/VPS/FE/browser/load smoke vẫn là trạng thái riêng có evidence riêng, không suy từ test local. |

Ký hiệu P/C/S/L/H/F/G/R/U, kết quả gates và migration dev: [Progress Phase6](../../progress/phase%206/PHASE_6_PROGRESS.md#docker-acceptance-2026-10-26).
Không thay runtime API/quyền; dev database đã migrate theo yêu cầu user. Các điều khiển barrier/crash chỉ có trong fixture của dedicated HTTP-test DB.

## 1. Mục tiêu, đầu vào và đầu ra

R4 có đủ evidence local và gói triển khai/recovery có thể review.
Phụ thuộc tất cả slices trước; deployment hoặc FE browser chỉ ghi PASS khi thật
sự thực hiện, không suy từ test backend. Không thêm nghiệp vụ chat mới ở slice này.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
|---|---|
| 6.7-T01 | Đối chiếu 19 REST proposals và mọi socket event/ack/error/capability với code/DTO/Swagger/Postman/harness. Mỗi AC6.x map source+test+evidence; ghi deferred/default đã chốt, không còn route planned bị trình bày implemented. |
| 6.7-T02 | Chạy `pnpm check`, `pnpm test:http`, real Socket.IO suite và MinIO-focused suite; ghi pass/fail/skip/DB vars môi trường test riêng. Các DB/MinIO/socket suites bị skip là gate còn mở, không tính all pass. |
| 6.7-T03 | Migration fresh/upgrade từ baseline deployed thực tế, compiled manifest+runner repeat no-op; backfill dry-run/apply/repeat trên fixture. Rollback code test giữ additive data/keyring và disabled mode, không down phá history. |
| 6.7-T04 | Runbook one-instance: secrets/origins/TLS/proxy WS timeout, flags/worker ordering, DB+key backup/restore, rotate/re-encrypt/receipt dependencies, events retention90d/cursor410/jobs30d/notifications90d. |
| 6.7-T05 | Ops metrics và safe logs: outbox lag/retries/dead letters, delivery/auth/rate rejects, crypto key usage/failure, resync/orphan backlog. Tool dry-run/replay/reconcile bounded, không tự replay fanout vô hạn hoặc log content. |
| 6.7-T06 | Scenario handoff hai tài khoản/tabs: CASH preview→chat→confirm, expiry/reassign/logout passive socket, reconnect/lost ack/edit/delete/read/inbox, image/PDF upload/download. Chuẩn bị checklist FE/VPS; chỉ ghi thực chạy theo môi trường. |
| 6.7-T07 | Cập nhật phase plan/flow/API/progress/index và regression status Phase2/3/4/5; chốt remaining gaps. Không mở nhiều replicas trước distributed routing/fanout, không đánh complete nếu thiếu revoke/attachment/evidence gates. |

## 3. Tiêu chí nghiệm thu

- [x] `AC6.7-1`: full local gates pass không skip critical suites; evidence ghi rõ
  commit/source revision, môi trường, suites và phạm vi, không chứa credentials.
- [x] `AC6.7-2`: Swagger/Postman/harness và flow/API đúng runtime, không còn event
  bật sớm so với slice; log/error scan không plaintext/token/key/URL nhạy cảm.
- [x] `AC6.7-3`: DB+key restore/rotation/replay/reconcile được diễn tập trên môi
  trường test; shutdown/restart/disabled rollback bảo toàn messages/receipts.
- [x] `AC6.7-4`: local complete, deployment readiness và deployed/FE acceptance là
  ba trạng thái có evidence riêng; thiếu evidence thì ghi pending đúng mục đó.
