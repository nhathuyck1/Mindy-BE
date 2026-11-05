# Phase 7.2 — Inbox → durable push delivery

Runtime evidence: [Progress7](../../progress/phase%207/PHASE_7_PROGRESS.md#local-implementation-2026-10-27). Checkboxes trong slice này ghi local BE evidence; không đại diện Firebase/browser/VPS sign-off. Source hiện hành thay các source/test filenames dự kiến bên dưới; suite hợp nhất 'test/integration/phase7-push.spec.ts' và 'test/http/phase7-push.spec.ts'.


**2026-10-27 · Backend local implemented/verified.** [Plan tổng](PHASE_7_FIREBASE_NOTIFICATIONS.md) ·
[Flow](../../api_flow/PHASE_7_FLOW.md) ·
[Progress](../../progress/phase%207/PHASE_7_PROGRESS.md).

Phụ thuộc 7.1. Đầu ra: inbox và delivery commit atomic, chưa gọi Firebase.

| Task | Công việc |
|---|---|
| 7.2-T01 | Migration notification_push_deliveries + unique generation/status/lease/expiry constraints và index; DBML. |
| 7.2-T02 | Nối public enqueue provider vào ChatNotificationsService.fanout cùng EntityManager; ON CONFLICT replay vẫn đảm bảo delivery unique. |
| 7.2-T03 | Snapshot installation/generation active, chưa read, after cutoff/within TTL; sender/new joiner/history scope theo policy Phase6; không backfill push cũ. |
| 7.2-T04 | Barrier/crash tests trước/sau commit, read-before-fanout, delayed job, đăng ký mới sau fanout và flags off; giữ realtime độc lập. |

- [x] `AC7.2-1`: Rollback không để inbox/delivery mồ côi; retry sau commit không duplicate logical delivery.
- [x] `AC7.2-2`: Sender/late joiner/revoked/deleted/read/expired không enqueue; CASH pending hợp lệ vẫn nhận mà không mở materials.
- [x] `AC7.2-3`: Inbox trước cutoff và thiết bị đăng ký sau fanout không nhận push lịch sử; backfill membership không tạo push storm.
- [x] `AC7.2-4`: Provider down hoặc push flags off không cản message/inbox/socket; delayed read race không làm unread quay lại.

Source: push enqueue service, migration, ChatNotificationsService.fanout; không sửa business
writer payment/class để gọi FCM. Tests: `test/integration/phase72-push-outbox.spec.ts` và
Phase6 notification/read regressions. Gate: migration populated upgrade + transaction/race tests.
