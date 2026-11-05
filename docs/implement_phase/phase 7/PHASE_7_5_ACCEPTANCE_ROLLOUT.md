# Phase 7.5 — Nghiệm thu và rollout

Runtime evidence: [Progress7](../../progress/phase%207/PHASE_7_PROGRESS.md#local-implementation-2026-10-27). Giữ AC browser/live pending; contract và runbook backend đã bàn giao. Source hiện hành thay các source/test filenames dự kiến bên dưới; suite hợp nhất 'test/integration/phase7-push.spec.ts' và 'test/http/phase7-push.spec.ts'.


**2026-10-27 · BE handoff/local gates; FE/VPS pending.** [Plan tổng](PHASE_7_FIREBASE_NOTIFICATIONS.md) ·
[Progress](../../progress/phase%207/PHASE_7_PROGRESS.md) ·
[Flow](../../api_flow/PHASE_7_FLOW.md).

Phụ thuộc 7.0–7.4. Đầu ra: local và môi trường staging/VPS được nghiệm thu riêng.

| Task | Công việc |
|---|---|
| 7.5-T01 | Full pnpm check/test:http, dedicated PG/MinIO fixtures, migration clean/populated upgrade/repeat; Phase6/payment/materials regression. |
| 7.5-T02 | Runtime/Swagger/Postman parity 2 routes mới và 4 inbox routes giữ nguyên; redaction canary, DTO/error/Origin/role contract verification. |
| 7.5-T03 | Runbook deploy ADC/IAM/secret mount/project isolation, flags/cutoff/canary, quota metrics/dead-letter/retention/rotation và rollback rehearsal. |
| 7.5-T04 | Ghi evidence 24 AC, staging browser matrix và VPS live-send; cập nhật flow/API/progress, phân biệt provider accept với browser received. |

- [x] `AC7.5-1`: Full local gates pass có log/revision/zero unintended skips; migrations giữ dữ liệu Phase6 và repeat no-op.
- [x] `AC7.5-2`: Swagger/Postman/source cùng contract; tokens/credentials/chat content không vào logs/fixtures/report artifacts.
- [ ] `AC7.5-3`: Staging project gửi thật với credentials server; rollback dừng sends mới, inbox/socket vẫn hoạt động; queue/DEAD có thể kiểm tra.
- [ ] `AC7.5-4`: 24 AC đủ evidence, FE/VPS sign-off ghi riêng; không đánh whole phase complete nếu browser hoặc môi trường thật còn pending.

Các test filenames trong planning đã được hợp nhất thành `test/integration/phase7-push.spec.ts`,
`test/http/phase7-push.spec.ts` và `src/modules/push-notifications/push.spec.ts`.
[Runbook hiện hành](../../PHASE_7_FIREBASE_RUNBOOK.md) đã có config/CLI/browser matrix.
Không cần Firebase live credentials cho CI; live-send chỉ thực hiện môi trường staging đã cấu hình và ghi evidence.
