# Phase 15 — FE, gates và vận hành

Ngày lập: **20/11/2026**. Trạng thái: **PLANNED**.

[Roadmap chung](../BUSINESS_NOTIFICATIONS_ROADMAP.md) ·
[Flow](../../api_flow/BUSINESS_NOTIFICATIONS_FLOW.md) ·
[API proposal](../../api_flow/BUSINESS_NOTIFICATIONS_flow-api-breakdown.md) ·
[Progress](../../progress/BUSINESS_NOTIFICATIONS_PROGRESS.md)

## 1. Mục tiêu, đầu vào và đầu ra

Phụ thuộc: **Phase 8–14**. Quy tắc nghiệp vụ, schema, recipient cutoff,
terminal visibility, flags và rollout theo roadmap chung. Phase này chưa có runtime
hoặc evidence nghiệm thu; chỉ tick AC khi có source + test + kết quả thực chạy.

Đầu ra khi implementation: Swagger/Postman, env examples, notification runbook, logs an toàn và checklist deployment. Planning lượt này không chạy các runtime gates này.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
| --- | --- |
| 15-T01 | Bàn giao/triển khai FE inbox đa type: filter, badge, đọc từng/all, dedupe socket, pagination, unknown type fallback, unavailable target, đa tab/offline/refetch; route mapping theo role. |
| 15-T02 | Chạy local gates lint/type-check/unit/PG integration/build/compiled HTTP/real sockets, migration fresh/upgrade/repeat; map mỗi AC với source/test/log/môi trường. |
| 15-T03 | Viết runbook flags/watermark/retry/dead-letter/replay bounded/retention/backup-restore; đo lag p95, duplicates, unauthorized delivery và list/count theo fixture plan tổng. |
| 15-T04 | Rollout schema → API/adapter → FE → business worker/delivery từng producer; diễn tập disabled/restore/rollback bảo toàn dữ liệu; cập nhật progress và phân biệt BE local/FE/deployed. |

## 3. Tiêu chí nghiệm thu

- [ ] `AC15-1`: Student/Mentor/Manager/Admin thấy đúng inbox của mình; read sync/refetch đa tab và mất socket không mất noti; unknown type không làm hỏng danh sách.

- [ ] `AC15-2`: 32 AC có evidence hoặc pending rõ; critical suite không skip; regression CHAT_MESSAGE/read receipt, payment và assignment privacy pass.

- [ ] `AC15-3`: Crash/restart/dead-letter replay/restore không mất event đã commit hoặc trùng row; quá replay window bị từ chối; p95 được đo và so với mục tiêu.

- [ ] `AC15-4`: OFF/ON không backfill lịch sử hay gửi reminder stale; BE local, FE browser và production có trạng thái riêng, không đánh complete nếu chưa có evidence tương ứng.

## 4. Kiểm chứng và bàn giao

Bộ kiểm dự kiến: `test/integration/phase15-notifications.spec.ts` và
`test/http/phase15-notifications.spec.ts`, bổ sung unit policy/clock và
barrier/socket tests nơi phù hợp. Đây là file dự kiến, chưa được tạo.
Dùng DB test riêng; ghi rõ skipped/failed và source revision.
Cập nhật progress chung Phase 8–15 sau khi có kết quả. Không suy test local thành FE hoặc deployed acceptance.
