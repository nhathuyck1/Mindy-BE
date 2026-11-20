# Phase 6.1 — Schema, mã hóa, receipt và job foundation

Tách thành plan riêng ngày **2026-10-26** từ slice 6.1 của kế hoạch Phase 6 ngày 2026-10-24.

[Plan Phase 6](PHASE_6_CHAT_NOTIFICATIONS.md) ·
[Progress Phase 6](../../progress/phase%206/PHASE_6_PROGRESS.md) ·
[Flow](../../api_flow/PHASE_6_FLOW.md) ·
[API](../../api_flow/PHASE_6_flow-api-breakdown.md) ·
[Runbook](../../PHASE_6_CHAT_RUNBOOK.md).

[Trước: 6.0](PHASE_6_0_CONTRACTS_ACCESS.md) · [Tiếp: 6.2](PHASE_6_2_MEMBERSHIP_REST.md)

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
| AC6.1-1 | PASS | U: Phase5 có order/enrollment/READY material file → cả3 migrations Chat, snapshot cũ giữ nguyên, repeat no-op. S thêm duplicate sequence23505/reply foreign23503; dev Docker migrate32/repeat no-op. |
| AC6.1-2 | PASS | C + R: Unicode/tamper/nonce/key rotation/old receipt key, compiled rotate và restored decrypt. |
| AC6.1-3 | PASS | S/H/source: không plaintext DB/receipt/jobs hoặc crypto DTO; fingerprint HMAC; runtime logs chỉ IDs/codes. |
| AC6.1-4 | PASS | S: rollback messages/events/jobs/receipt, concurrent retry, lease reclaim/fencing và consumer independence. |
| AC6.1-5 | PASS | L backfill dry-run/apply/repeat; H disabled restart giữ messages/receipts/auth; S chặn destructive down. |

Ký hiệu P/C/S/L/H/F/G/R/U, kết quả gates và migration dev: [Progress Phase6](../../progress/phase%206/PHASE_6_PROGRESS.md#docker-acceptance-2026-10-26).
Không thay runtime API/quyền; dev database đã migrate theo yêu cầu user. Các điều khiển barrier/crash chỉ có trong fixture của dedicated HTTP-test DB.

## 1. Mục tiêu, đầu vào và đầu ra

Lưu được message mã hóa và đủ hạ tầng để mutation/event/job cùng commit.
Phụ thuộc6.0; chưa bật gateway/REST chat. Backfill ở đây xây tool/khung dry-run;
membership thật và apply kiểm chứng sau khi có lifecycle consumer6.2.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
|---|---|
| 6.1-T01 | Migration additive cho conversations/members/messages/events, receipt mapping đã chốt, domain outbox/dispatch jobs. Index/FK/CHECK theo mục 4 của plan tổng; timestamp lớn hơn migration mới nhất lúc code, đăng ký entity/catalog/compiled artifacts; cập nhật DBML ở implementation. |
| 6.1-T02 | Bổ sung cấu trúc snapshot recipient refs/cutoff và trạng thái xử lý riêng cho realtime/notification. Domain event có dedupe theo consumer; một consumer complete không làm consumer khác mất việc. Recipient set lớn phải page/batch có checkpoint, không nhét body vào JSON job. |
| 6.1-T03 | `ChatCryptoService` AES-GCM, canonical AAD/HKDF-HMAC/versioned keyring; validate key32/IV12/tag16, secrets/environment config. Enabled thiếu key fail startup; disabled không buộc secrets hoặc chạy chat workers. |
| 6.1-T04 | Xây transaction helper cấp event sequence dưới conversation row lock; bigint string xuyên DTO; message sequence immutable, lastChangedSeq/event seq tăng. Không cấp sequence bằng MAX+1 ngoài lock. |
| 6.1-T05 | Receipt service canonical request/fingerprint version, lookup/insert và xử lý concurrent conflict an toàn. Tách replay current DTO khỏi snapshot body; receipt send sống cùng message, không bị job retention xóa nhầm. |
| 6.1-T06 | Worker nền tảng claim SKIP LOCKED, lease token/expiry, capped backoff/dead-letter, checkpoint và shutdown; không giữ DB transaction trong network emit/storage. Chưa bật consumer chưa triển khai. |
| 6.1-T07 | Chuẩn bị operations entry point backfill/reconcile dry-run với scope/limit/cursor/report; mặc định không ghi. Key rotation/re-encryption theo batch/version-check, có dry-run/checkpoint; lưu dependencies của receipts/backup trước retire key. |

**File dự kiến:** `src/modules/chat/entities/`, `services/chat-crypto.service.ts`,
`services/chat-receipt.service.ts`, `services/chat-event.service.ts`,
`src/shared/domain-outbox/` (tên dự kiến, không module owner business),
`src/operations/` cho backfill/rotation; thêm config ở environment schema và
`.env.example`. Không thêm secret thật hoặc dùng khóa JWT cho chat.

## 3. Tiêu chí nghiệm thu

- [x] `AC6.1-1`: migration fresh DB test/upgrade dữ liệu cũ/migration runner lần2 no-op;
  constraints reject duplicate group/DM/sequence, reply khác conversation, body sai type.
- [x] `AC6.1-2`: Unicode roundtrip; sửa IV/tag/ciphertext/AAD/identity/key đều fail closed;
  edit/rotation dùng IV mới, đọc được key cũ khi active key đổi.
- [x] `AC6.1-3`: DB message/job/receipt/log không có plaintext mẫu; không expose crypto
  columns qua DTO; receipt không lưu hash SHA thuần của body dễ đoán.
- [x] `AC6.1-4`: rollback injected trước commit không còn message/event/receipt/job;
  expired lease được reclaim và stale token không complete job; duplicate claim không mất việc.
- [x] `AC6.1-5`: disabled giữ auth/payment startup; backfill dry-run không đổi rows;
  rollback notes giữ dữ liệu/khóa, không destructive down trên history đã sử dụng.

## 4. Kiểm thử và bàn giao

Domain crypto/canonical-request specs cạnh code;
`test/integration/phase61-chat-migration.spec.ts`,
`phase61-chat-storage.spec.ts` và worker lease tests trên DB `_test` riêng.
