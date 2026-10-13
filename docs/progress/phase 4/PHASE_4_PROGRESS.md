# Phase 4 — Progress

Cập nhật **2026-10-13**. Trạng thái: **Planning complete; implementation pending**.

[Plan](../../implement_phase/phase%204/PHASE_4_ATTENDANCE_OPERATIONS.md) ·
[Flow](../../api_flow/PHASE_4_FLOW.md) ·
[API breakdown](../../api_flow/PHASE_4_flow-api-breakdown.md).

## Nghiệp vụ user đã duyệt

- Mentor bắt đầu Session, tick Có mặt, chốt chưa tick thành Vắng.
- Chưa bắt đầu/Chưa điểm danh khác Vắng; manual ONLINE/OFFLINE.
- Mentor sửa trong24h từ actual start đầu tiên; Manager sửa bất kỳ lúc nào có audit.
- Manager tìm mentor trống lịch và phân công dạy thay khi bận đột xuất.
- Phase4 bắt đầu song song trong khi người khác tiếp tục Phase3.

## Kế hoạch đã ghi

- [x] Đối chiếu Flow.txt/COURSE_FLOW/DBML/source Classes/Users/StudentLearning/Payments.
- [x] Phân công buổi riêng với mentor chủ nhiệm; đổi giữa buổi giữ deadline.
- [x] Candidate theo Session/Class, effective mentor, overlap và mutation recheck.
- [x] Slice4.1–4.5, migration/ownership/lock/version/audit và regression gates.
- [x] Roster snapshot/CASH activation/cutoff, historical reads, summary và makeup.
- [x] Flow/API dự kiến chi tiết + đồng bộ index/combined flow/core progress.

## Implementation và evidence

| Hạng mục | Trạng thái |
|---|---|
| 4.1 Mentor availability/substitution | Chưa implementation |
| 4.2 Session lifecycle/attendance roster | Chưa implementation |
| 4.3 Correction/audit/deadline | Chưa implementation |
| 4.4 Student/operations/reschedule/makeup | Chưa implementation |
| 4.5 Integration/release | Chưa implementation |
| Migration local / database tests / pnpm check / HTTP gate | Chưa chạy Phase4 |
| Staging/VPS / browser smoke | Chưa deploy/nghiệm thu |

2026-10-13: chỉ thay tài liệu; kiểm diff/relative links/coverage endpoint và
đối chiếu contract với source baseline. Không coi test lịch/payment cũ là test
attendance mới, không chạy BE tests cho thay đổi chỉ Markdown.

## Bước triển khai tiếp theo

4.1 trước: session override/effective mentor provider, management discovery,
availability và assignment commands, integrate mọi schedule writer với locks
chung. Mỗi migration một người tạo/reviewer phối hợp Phase3. Giữ giới hạn MVP:
trống lịch chưa qualification/leave, substitute không tự có cash confirm/material
authoring; notification/chứng chỉ/request nghỉ có duyệt còn hoãn.
