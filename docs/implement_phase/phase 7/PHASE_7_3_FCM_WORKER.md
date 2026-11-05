# Phase 7.3 — FCM worker, retry và vận hành

Runtime evidence: [Progress7](../../progress/phase%207/PHASE_7_PROGRESS.md#local-implementation-2026-10-27). Checkboxes trong slice này ghi local BE evidence; không đại diện Firebase/browser/VPS sign-off. Source hiện hành thay các source/test filenames dự kiến bên dưới; suite hợp nhất 'test/integration/phase7-push.spec.ts' và 'test/http/phase7-push.spec.ts'.


**2026-10-27 · Backend local implemented/verified.** [Plan tổng](PHASE_7_FIREBASE_NOTIFICATIONS.md) ·
[Flow](../../api_flow/PHASE_7_FLOW.md) ·
[Progress](../../progress/phase%207/PHASE_7_PROGRESS.md).

Phụ thuộc 7.2. Đầu ra: durable send với fake/live adapter qua cùng interface.

| Task | Công việc |
|---|---|
| 7.3-T01 | Claim SKIP LOCKED/lease/fencing, deadline/shutdown/flags; request provider ngoài DB transaction. |
| 7.3-T02 | Shared public eligibility check trước từng send: session/account/current scope/read/delete/TTL/owner/generation; skip reason có mã. |
| 7.3-T03 | Map provider success/error per delivery; invalid token khác invalid payload, Retry-After/backoff+jitter, max8/TTL; sanitized metrics/logs. |
| 7.3-T04 | CLI dry-run/limit/replay DEAD, stale/token/delivery retention và key rotation/restore runbook; crash và multi-worker tests. |

- [x] `AC7.3-1`: Concurrent workers không cùng sở hữu lease; stale worker không complete/fail; crash sau accept có thể retry nhưng không duplicate DB row.
- [x] `AC7.3-2`: Barrier revoke/logout/read/delete/rotate trước eligibility check ngăn provider call; nêu rõ giới hạn revoke sau provider accept.
- [x] `AC7.3-3`: Unregistered invalidate đúng token; bad payload không invalidate registry; 429 đợi >=60s, 503 tôn trọng Retry-After; TTL/max attempts dừng retry.
- [x] `AC7.3-4`: SENT chỉ provider accept; worker rollback flag/shutdown có hiệu lực; metrics/CLI/retention/rotation không lộ token hoặc làm hỏng inbox purge.

Source: push worker/jobs/eligibility adapter, `src/operations/push-maintenance.ts` dự kiến.
Tests: worker unit tests + `test/integration/phase73-push-worker.spec.ts`, fake provider
timeout/429/503/unregistered/auth-error. Gate: bounded replay và crash/lease evidence.
