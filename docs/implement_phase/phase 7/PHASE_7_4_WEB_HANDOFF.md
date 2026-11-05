# Phase 7.4 — FE contract và web push

Runtime evidence: [Progress7](../../progress/phase%207/PHASE_7_PROGRESS.md#local-implementation-2026-10-27). Giữ AC browser/live pending; contract và runbook backend đã bàn giao. Source hiện hành thay các source/test filenames dự kiến bên dưới; suite hợp nhất 'test/integration/phase7-push.spec.ts' và 'test/http/phase7-push.spec.ts'.


**2026-10-27 · BE handoff/local gates; FE/VPS pending.** [Plan tổng](PHASE_7_FIREBASE_NOTIFICATIONS.md) ·
[API/FE breakdown](../../api_flow/PHASE_7_flow-api-breakdown.md) ·
[Progress](../../progress/phase%207/PHASE_7_PROGRESS.md).

Phụ thuộc 7.1 + 7.3. Repo này bàn giao BE contract/checklist; nhóm FE triển khai SDK/SW
trong repo FE. Không tự đánh dấu browser AC pass bằng fake-provider tests.

| Task | Công việc |
|---|---|
| 7.4-T01 | Chốt origin/inbox route, public Firebase config/VAPID, SDK version, service-worker scope/hosting và HTTPS/browser support. |
| 7.4-T02 | FE user gesture request permission → getToken → PUT; denied/unsupported vẫn dùng inbox; refresh token khi login/return focus và SDK báo token thay đổi. |
| 7.4-T03 | onMessage refetch/dedupe với socket; background display duy nhất; click inbox rồi auth/list/scope check, không mark read chỉ vì nhận push. |
| 7.4-T04 | FE DELETE expected generation trước logout/opt-out + deleteToken; clear SW pending UI khi switch account; multi-tab coordination và staging evidence. |

- [ ] `AC7.4-1`: Permission chỉ hỏi sau thao tác user; denied/unsupported không chặn login/chat/inbox và không hỏi lại liên tục.
- [ ] `AC7.4-2`: Foreground socket+FCM không hai toast, background không hai display do SW/SDK; duplicate notificationId được gộp theo khả năng browser.
- [ ] `AC7.4-3`: Click khi logged-out đi login rồi inbox; target revoked/deleted không mở nội dung, received/click không tự nâng read cursor.
- [ ] `AC7.4-4`: Rotate/logout/account switch không lộ nội dung account trước; nhiều tab/thiết bị hoạt động đúng và có evidence browser thật trên HTTPS.

Deliverables: FE contract, Swagger/Postman + browser matrix (browser/version/origin/SW,
foreground/background, accepted provider ID và timestamp). Browser đóng/OS hạn chế push
cần ghi điều kiện quan sát thực tế; không hứa browser luôn nhận được push.
