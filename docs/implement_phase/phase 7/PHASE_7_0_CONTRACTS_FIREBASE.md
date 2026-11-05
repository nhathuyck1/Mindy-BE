# Phase 7.0 — Contract và Firebase foundation

Runtime evidence: [Progress7](../../progress/phase%207/PHASE_7_PROGRESS.md#local-implementation-2026-10-27). Checkboxes trong slice này ghi local BE evidence; không đại diện Firebase/browser/VPS sign-off. Source hiện hành thay các source/test filenames dự kiến bên dưới; suite hợp nhất 'test/integration/phase7-push.spec.ts' và 'test/http/phase7-push.spec.ts'.


**2026-10-27 · Backend local implemented/verified.** [Plan tổng](PHASE_7_FIREBASE_NOTIFICATIONS.md) ·
[API](../../api_flow/PHASE_7_flow-api-breakdown.md) ·
[Progress](../../progress/phase%207/PHASE_7_PROGRESS.md).

Đầu vào: inbox/auth Phase 6. Đầu ra: contract và adapter có thể chạy fake khi chưa có Firebase.

| Task | Công việc |
|---|---|
| 7.0-T01 | Chốt CHAT_MESSAGE/web v1, payload generic, inbox path với FE, quyền/cutoff/TTL và boundary DI; ghi defaults chưa xác nhận. |
| 7.0-T02 | Tạo PushNotificationsModule, typed FCM adapter injectable; pin firebase-admin tương thích Node/ESM và lockfile; fake adapter cho tests. |
| 7.0-T03 | Thêm env Joi/flags mặc định false, ADC/project/keyring config; disabled không init SDK, enabled sai config fail startup; cập nhật .env.example bằng placeholder. |
| 7.0-T04 | Contract tests config/payload/redaction; đề xuất source lock graph theo Auth/Chat và không network trong transaction. |

- [x] `AC7.0-1`: Contract nêu đúng inbox source hiện tại; DI không vòng import Chat↔Push.
- [x] `AC7.0-2`: Flags false chạy được không Firebase credentials hoặc network request.
- [x] `AC7.0-3`: Enabled thiếu/sai config fail rõ ràng; secrets không xuất log/Swagger/FE.
- [x] `AC7.0-4`: Adapter fake thay được qua DI; payload chỉ generic title/body + schemaVersion/notificationId, URL chỉ origin allowlist.

Source dự kiến: `src/modules/push-notifications/{push-notifications.module.ts,adapters,contracts}/`,
`src/config/environment.schema.ts`, `.env.example`, `package.json`, `pnpm-lock.yaml`.
Tests dự kiến: `src/modules/push-notifications/adapters/fcm.adapter.spec.ts` và config tests.
Gate: focused tests + lint/type-check/build; chưa ghi là đã cấu hình project thật.
