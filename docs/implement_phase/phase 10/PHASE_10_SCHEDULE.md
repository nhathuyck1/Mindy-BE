# Phase 10 — Lịch học và mentor

20/11/2026: schedule producers đã có BE local qua [Phase16](../phase%2016/PHASE_16_BELL_NOTIFICATIONS_WEBSOCKET.md).
Baseline PLANNED bên dưới và AC10 giữ nghiệm thu formal riêng; source/tests hiện hành xem Progress16.

Ngày lập: **20/11/2026**. Trạng thái: **PLANNED**.

[Roadmap chung](../BUSINESS_NOTIFICATIONS_ROADMAP.md) ·
[Flow](../../api_flow/BUSINESS_NOTIFICATIONS_FLOW.md) ·
[API proposal](../../api_flow/BUSINESS_NOTIFICATIONS_flow-api-breakdown.md) ·
[Progress](../../progress/BUSINESS_NOTIFICATIONS_PROGRESS.md)

## 1. Mục tiêu, đầu vào và đầu ra

Phụ thuộc: **Phase 9**. Quy tắc nghiệp vụ, schema, recipient cutoff,
terminal visibility, flags và rollout theo roadmap chung. Phase này chưa có runtime
hoặc evidence nghiệm thu; chỉ tick AC khi có source + test + kết quả thực chạy.

Nguồn: classes/services/session-operations.service.ts, class-schedule.service.ts, teaching-assignment.service.ts, classes.service.ts và teaching-operations/services/mentor-leave.service.ts. Gate R2: ưu tiên triển khai và bàn giao lịch học trước.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
| --- | --- |
| 10-T01 | Nối SESSION_RESCHEDULED vào SessionOperationsService.reschedule và ClassScheduleService.updateSessionTimes và WeeklyScheduleService.apply/swap; event chỉ khi giờ đổi thật. |
| 10-T02 | Nối SESSION_MENTOR_CHANGED cho assignSession/assignClass và writer swap tương ứng; so sánh effective mentor trước/sau, giữ override; snapshot mentor cũ/mới. |
| 10-T03 | Nối SESSION_CANCELLED/CLASS_CANCELLED và MAKEUP_SESSION_SCHEDULED vào mọi cancellation/replacement path; cùng cause hủy lớp chỉ một notice/người. |
| 10-T04 | Batch fanout Student có quyền lịch, effective mentor, placement participants đúng session; test CASH_PREVIEW theo schedule policy và thông tin terminal notice. |

## 3. Tiêu chí nghiệm thu

- [ ] `AC10-1`: Đổi giờ một buổi/bulk và weekly apply/swap tạo đúng event mỗi buổi bị đổi; leave approval tạo cancellation + successor theo catalog, không giả reschedule; conflict/rollback/no-op không tạo noti.

- [ ] `AC10-2`: Đổi mentor lớp không phát cho buổi override không đổi; mentor cũ/mới đúng recipient và bị actor-exclusion; old mentor không đọc resource mất quyền.

- [ ] `AC10-3`: Hủy lớp gửi một notice/người dù hủy nhiều buổi; buổi bù chỉ gửi sau commit và đúng audience, retry không trùng.

- [ ] `AC10-4`: Late enrollment không nhận event cũ; mất quyền ẩn active notice; người bị hủy vẫn thấy generic cancellation và target unavailable khi domain deny.

## 4. Kiểm chứng và bàn giao

Bộ kiểm dự kiến: `test/integration/phase10-notifications.spec.ts` và
`test/http/phase10-notifications.spec.ts`, bổ sung unit policy/clock và
barrier/socket tests nơi phù hợp. Đây là file dự kiến, chưa được tạo.
Dùng DB test riêng; ghi rõ skipped/failed và source revision.
Cập nhật progress chung Phase 8–15 sau khi có kết quả. Không suy test local thành FE hoặc deployed acceptance.
