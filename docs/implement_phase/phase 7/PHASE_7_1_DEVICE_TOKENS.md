# Phase 7.1 — Installation và token lifecycle

Runtime evidence: [Progress7](../../progress/phase%207/PHASE_7_PROGRESS.md#local-implementation-2026-10-27). Checkboxes trong slice này ghi local BE evidence; không đại diện Firebase/browser/VPS sign-off. Source hiện hành thay các source/test filenames dự kiến bên dưới; suite hợp nhất 'test/integration/phase7-push.spec.ts' và 'test/http/phase7-push.spec.ts'.


**2026-10-27 · Backend local implemented/verified.** [Plan tổng](PHASE_7_FIREBASE_NOTIFICATIONS.md) ·
[API](../../api_flow/PHASE_7_flow-api-breakdown.md) ·
[Progress](../../progress/phase%207/PHASE_7_PROGRESS.md).

Phụ thuộc 7.0. Bàn giao PUT/DELETE installation cho FE; chưa có delivery.

| Task | Công việc |
|---|---|
| 7.1-T01 | Migration push_installations + constraints/index/crypto version, DBML; verify FK auth_sessions và chính sách cleanup. |
| 7.1-T02 | PUT owner/session từ cookie, WEB/token validation/quota/rate limit, HMAC dedupe + AEAD; generation tăng atomic khi token/session đổi. |
| 7.1-T03 | DELETE conditional generation, logout/logout-all revoke đúng scope, session-expired/suspended deny; stale cleanup không đổi auth flow. |
| 7.1-T04 | HTTP guards/Origin/ownership tests, concurrent rotate/revoke, account-switch conflict; Swagger/Postman theo proposal đã chốt. |

- [x] `AC7.1-1`: Same PUT replay giữ binding/generation, refresh lastSeenAt; đổi token/session tăng generation đúng một transition.
- [x] `AC7.1-2`: Foreign installation/token conflict, foreign DELETE 404; user/session không lấy từ body; origin sai 403 và invalid DTO 422.
- [x] `AC7.1-3`: Rotate/revoke concurrent không xóa nhầm generation mới; logout chỉ current session, logout-all chặn mọi binding của user.
- [x] `AC7.1-4`: Token không plaintext DB/log/response, quota10/rate limit enforced; migration clean/upgrade/repeat không mất inbox/chat/auth dữ liệu.

Source dự kiến: push controllers/DTO/registry/crypto services, auth public revoke hook,
TypeORM additive migration và `document/mindy_center_full.dbml`.
Tests: `test/integration/phase71-push-installations.spec.ts`,
`test/http/phase71-push-installations.spec.ts`, crypto tests.
Gate: 2 routes runtime/Swagger/Postman parity, fake provider không được gọi từ API.
