# Phase 9 — Inbox và worker dùng chung

Cập nhật 20/11/2026: foundation inbox/outbox/worker và REST đã có source qua
[Phase16](../phase%2016/PHASE_16_BELL_NOTIFICATIONS_WEBSOCKET.md); dùng lại bảng
notifications và shared read state. Trạng thái PLANNED bên dưới là baseline.
Không tự đóng AC9: unified CHAT-created adapter/review toàn bộ compatibility và
release chung vẫn cần gate riêng; evidence business local xem Progress16.

Ngày lập: **20/11/2026**. Trạng thái: **PLANNED**.

[Roadmap chung](../BUSINESS_NOTIFICATIONS_ROADMAP.md) ·
[Flow](../../api_flow/BUSINESS_NOTIFICATIONS_FLOW.md) ·
[API proposal](../../api_flow/BUSINESS_NOTIFICATIONS_flow-api-breakdown.md) ·
[Progress](../../progress/BUSINESS_NOTIFICATIONS_PROGRESS.md)

## 1. Mục tiêu, đầu vào và đầu ra

Phụ thuộc: **Phase 8**. Quy tắc nghiệp vụ, schema, recipient cutoff,
terminal visibility, flags và rollout theo roadmap chung. Phase này chưa có runtime
hoặc evidence nghiệm thu; chỉ tick AC khi có source + test + kết quả thực chạy.

File dự kiến: src/modules/notifications/{controllers,services,dtos,domain}/, migration mới và composition adapters; không dùng tên file dự kiến để khẳng định đã có source.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
| --- | --- |
| 9-T01 | Tách NotificationsModule và scope providers; migration additive generalize notifications, business outbox/jobs/recipient snapshot, index và unique; giữ chat FK/unique/read state. |
| 9-T02 | Implement capture transaction và leased worker với checkpoint, bounded retries/dead-letter/replay window; activation không backfill lịch sử. |
| 9-T03 | Implement /api/v1/notification-inbox list/count/read/read-all chung, giữ legacy /notifications chat-only; cursor/DTO/events tách version theo contract R0; theo batch policy, typed targets, nullable business refs và ownership; nối chat adapter/conversation read một chiều. |
| 9-T04 | Giữ legacy chat socket protocol, dùng notification-inbox:* cho unified; business notifications tới Mentor/Student dùng own authenticated delivery khi chat transport bật; Manager/Admin và CHAT_OFF dùng REST refetch. Không phụ thuộc socket để persist inbox. |

## 3. Tiêu chí nghiệm thu

- [ ] `AC9-1`: Fresh/upgrade từ schema baseline thực tế/repeat no-op pass; CHAT_MESSAGE cũ giữ id/readAt và contract fields, business rows không vi phạm chat FK.

- [ ] `AC9-2`: Crash trước/sau insert và trước job complete rồi retry vẫn đúng một row/user/event; rollback mutation không có event; account revoke trước emit không nhận packet.

- [ ] `AC9-3`: Read-all snapshot giữ late fanout unread; read/read-all không nâng conversation cursor; count/list/read cùng visibility, foreign read trả 404.

- [ ] `AC9-4`: Business REST/fanout hoạt động khi CHAT_ENABLED=false; chat flags/roles vẫn giữ nguyên; Manager/Admin không join /chat; client cũ không nhận business DTO/event; reconnect/refetch khôi phục inbox.

## 4. Kiểm chứng và bàn giao

Bộ kiểm dự kiến: `test/integration/phase9-notifications.spec.ts` và
`test/http/phase9-notifications.spec.ts`, bổ sung unit policy/clock và
barrier/socket tests nơi phù hợp. Đây là file dự kiến, chưa được tạo.
Dùng DB test riêng; ghi rõ skipped/failed và source revision.
Cập nhật progress chung Phase 8–15 sau khi có kết quả. Không suy test local thành FE hoặc deployed acceptance.
