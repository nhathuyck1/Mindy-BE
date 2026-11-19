# Phase 13 — Nghỉ và xếp học bù

Ngày lập: **20/11/2026**. Trạng thái: **PLANNED**.

[Roadmap chung](../BUSINESS_NOTIFICATIONS_ROADMAP.md) ·
[Flow](../../api_flow/BUSINESS_NOTIFICATIONS_FLOW.md) ·
[API proposal](../../api_flow/BUSINESS_NOTIFICATIONS_flow-api-breakdown.md) ·
[Progress](../../progress/BUSINESS_NOTIFICATIONS_PROGRESS.md)

## 1. Mục tiêu, đầu vào và đầu ra

Phụ thuộc: **Phase 10**. Quy tắc nghiệp vụ, schema, recipient cutoff,
terminal visibility, flags và rollout theo roadmap chung. Phase này chưa có runtime
hoặc evidence nghiệm thu; chỉ tick AC khi có source + test + kết quả thực chạy.

Nguồn: teaching-operations/services/mentor-leave.service.ts và attendance/services/makeup-placement.service.ts. Mentor leave và placement hiện hữu là hai use case riêng.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
| --- | --- |
| 13-T01 | Nối MENTOR_LEAVE_REQUESTED từ create PENDING; recipients Manager/Admin phải qua đúng quyền xử lý, không có role STAFF mới. |
| 13-T02 | Nối APPROVED/REJECTED tới mentor gửi request; filter action/revision replay; không gửi nguyên văn lý do nghỉ/từ chối. |
| 13-T03 | Correlate leave approval với schedule cause để Student chỉ nhận lịch liên quan; withdrawal/expiry không giả thành reject và không sinh type ngoài catalog. |
| 13-T04 | Nối MAKEUP_PLACEMENT_CREATED/CANCELLED cho Student được xếp và mentor session đích; không tạo thêm workflow xin/duyệt placement. |

## 3. Tiêu chí nghiệm thu

- [ ] `AC13-1`: Create leave tạo notice cho đúng người có quyền xử lý; actor excluded; Mentor khác/Student không thấy request hoặc private reason.

- [ ] `AC13-2`: Approve/reject transition thật tạo một result notice cho requester; replay/version conflict/expired request không tạo kết quả sai.

- [ ] `AC13-3`: Approval đổi nhiều buổi tạo schedule events đúng phạm vi cùng cause; Student không nhận thêm noti nội bộ leave hoặc reason riêng tư.

- [ ] `AC13-4`: Create/cancel placement retry không trùng; target-class peers không nhận; requester/cancel recipient terminal vẫn nhận generic notice mà không mở lại quyền session.

## 4. Kiểm chứng và bàn giao

Bộ kiểm dự kiến: `test/integration/phase13-notifications.spec.ts` và
`test/http/phase13-notifications.spec.ts`, bổ sung unit policy/clock và
barrier/socket tests nơi phù hợp. Đây là file dự kiến, chưa được tạo.
Dùng DB test riêng; ghi rõ skipped/failed và source revision.
Cập nhật progress chung Phase 8–15 sau khi có kết quả. Không suy test local thành FE hoặc deployed acceptance.
