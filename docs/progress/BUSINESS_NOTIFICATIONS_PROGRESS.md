# Progress Phase 8–15 — Notification nghiệp vụ

## 20/11/2026 — Lập kế hoạch theo implement files hiện có

**Phase 8 COMPLETE (source/contract review); Phase 9–15 PLANNED — chưa business runtime/migration/deploy.**

- Branch: `codex/business-notifications`, base `origin/dev` tại `757be19`.
- Worktree riêng: `C:/Users/admin/.codex/worktrees/business-notifications/Mindy-BE`.
- Phạm vi đã thống nhất: noti ngoài message, ưu tiên lịch học → bài tập →
  thanh toán → nghỉ/bù → tài liệu; nền tảng inbox chung triển khai trước.
- Đã soạn roadmap chung, tám phase 8–15, 32 tasks/32 AC, flow và API proposal.
- Quy tắc chi tiết (reminder 24h, terminal retention, actor exclusion, FE fallback)
  là mặc định đề xuất trong plan; FE fallback đã được duyệt ở mục bên dưới,
  các quyết định chi tiết còn lại chưa được user chốt riêng.
- Chỉ đọc source và kiểm tài liệu; không chạy application tests, không sửa FE,
  không chạy migration, không bật cờ hoặc thay đổi dịch vụ đang chạy.
- Kiểm tài liệu ban đầu trước khi tách phase: 12 file mới, 54 relative links,
  32 tasks/32 AC; kiểm lại liên kết và IDs sau khi tổ chức thành Phase 8–15.

[Plan](../implement_phase/BUSINESS_NOTIFICATIONS_ROADMAP.md) ·
[Flow](../api_flow/BUSINESS_NOTIFICATIONS_FLOW.md) ·
[API proposal](../api_flow/BUSINESS_NOTIFICATIONS_flow-api-breakdown.md)

## Trạng thái phases

| Phase | Phạm vi | Trạng thái | AC / mức evidence |
| --- | --- | --- | --- |
| 8 | Contract, event, quyền | COMPLETE — source review | 4/4 review, không runtime |
| 9 | Inbox/worker chung | PLANNED | 0/4 |
| 10 | Lịch/mentor/hủy/bù | PLANNED | 0/4 |
| 11 | Publish/hạn bài/ZIP grade | PLANNED | 0/4 |
| 12 | Payment/reminder/expiry | PLANNED | 0/4 |
| 13 | Mentor leave/placement | PLANNED | 0/4 |
| 14 | Material published | PLANNED | 0/4 |
| 15 | FE/gates/ops | PLANNED | 0/4 |

## Bằng chứng khi implementation

Mỗi AC cần source revision + test case + kết quả/log + môi trường.
Theo dõi riêng: review contract, BE local, FE browser, migration readiness và
deployed acceptance. Test bị skip không được ghi PASS; nghiệm thu Phase 6 cũ
không thay thế bằng chứng các Phase 8–15.

## Bước triển khai đầu tiên

8 đối chiếu writer inventory và quyền theo revision lúc implement; sau đó 9
schema/adapter/worker, rồi 10 lịch học. Bật từng producer sau gate tương ứng.

## 20/11/2026 — Chuyển các slice thành phase riêng

Theo yêu cầu user, đổi 8.0–8.7 thành Phase 8–15. Mỗi phase có thư mục và
file implement riêng; task/AC đổi sang mã phase mới. Roadmap, flow, API và
progress dùng chung cho toàn bộ chuỗi. Giữ nguyên phạm vi và 32 tasks/32 AC,
chưa triển khai runtime.

Kiểm tra sau chuyển đổi PASS: 12 tài liệu notification và 2 index, 32 task/32 AC
đúng mã phase, liên kết nội bộ hợp lệ, không còn tên file hoặc mã task/AC cũ.

## 20/11/2026 — Duyệt phương án hoạt động và kênh thông báo

User trả lời “Duyệt” sau phần giải thích cách hoạt động. Đã chốt thông báo trong
app qua chuông/badge/inbox, durable delivery khi offline, Socket.IO + API cho
Student/Mentor và REST refresh cho Manager/Admin; click kiểm lại quyền resource.
Không thêm email/SMS/push mới; giữ email payment hiện có riêng.
Roadmap đã ghi nhận quyết định. Trạng thái runtime vẫn PLANNED, 0/32 AC có evidence;
phê duyệt này không được ghi thành đã implement hoặc đã deploy.

## 20/11/2026 — Hoàn tất Phase 8 R0

Theo yêu cầu triển khai Phase 8, đã hoàn thành 8-T01–T04 và AC8-1–4 ở mức
source/contract review. [Evidence](../implement_phase/phase%208/R0_REVIEW.md)
liên kết catalog 17 types/scenarios/templates, writer inventory, role/visibility
policy P01–P14, FE target mapping và unified API contract v1.

Đã sửa baseline theo source: leave approve cancel+successor; ZIP grade cần
re-release; CODE.extend là writer riêng; material APPROVE auto-publish/availableAt;
guest snapshot trước trigger NEEDS_REASSIGNMENT. Unified route/event tách legacy
để giữ compatibility, không cần thêm quyền chat cho Manager/Admin.

Kết quả hiện tại: 4/4 AC review hoàn tất, **0/28 AC phase runtime/handoff**.
Chưa thêm runtime module/migration, sửa FE hoặc bật producer. Bước tiếp: Phase 9.
