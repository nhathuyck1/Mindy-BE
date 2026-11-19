# Phase 11 — Bài tập và công bố điểm

Ngày lập: **20/11/2026**. Trạng thái: **PLANNED**.

[Roadmap chung](../BUSINESS_NOTIFICATIONS_ROADMAP.md) ·
[Flow](../../api_flow/BUSINESS_NOTIFICATIONS_FLOW.md) ·
[API proposal](../../api_flow/BUSINESS_NOTIFICATIONS_flow-api-breakdown.md) ·
[Progress](../../progress/BUSINESS_NOTIFICATIONS_PROGRESS.md)

## 1. Mục tiêu, đầu vào và đầu ra

Phụ thuộc: **Phase 9**. Quy tắc nghiệp vụ, schema, recipient cutoff,
terminal visibility, flags và rollout theo roadmap chung. Phase này chưa có runtime
hoặc evidence nghiệm thu; chỉ tick AC khi có source + test + kết quả thực chạy.

Nguồn: assignments/services/assignments.service.ts, zip-submissions.service.ts, code-authoring.service.ts, code-review.service.ts, assignment-access.service.ts. Khi nghiệp vụ QUIZ/CODE công bố điểm thay đổi phải bổ sung type/AC riêng trước nối.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
| --- | --- |
| 11-T01 | Nối ASSIGNMENT_PUBLISHED vào transition publish thực; audience theo session assignment access, không lấy roster chat. |
| 11-T02 | Nối ASSIGNMENT_DEADLINE_CHANGED cho published assignment ở ZIP extend và CodeAuthoringService.extend; AssignmentsService.update chỉ DRAFT nên không phát; lưu revision/cause. |
| 11-T03 | Nối ASSIGNMENT_GRADE_RELEASED cho ZIP release và re-release bản điểm đã sửa theo releasedVersion; grade() chỉ tạo draft nên không phát; không gửi điểm nháp hoặc tự thêm quy trình release QUIZ/CODE. |
| 11-T04 | Chốt behavior archive/delete/revoke và target refetch; giữ code_submission.updated như realtime hiện tại, không biến worker status thành inbox spam. |

## 3. Tiêu chí nghiệm thu

- [ ] `AC11-1`: Publish hợp lệ tạo một notice/Student eligible; draft/edit/replay publish không tạo thêm; CASH_PREVIEW/cross-class không nhận.

- [ ] `AC11-2`: Đổi hạn thực sự cho bài published tạo notice mới; update không đổi deadline, revision conflict và transaction rollback không tạo notice.

- [ ] `AC11-3`: Release/re-release điểm gửi riêng chủ submission theo revision; grade draft không gửi; payload không chứa điểm/đáp án/nhận xét riêng tư.

- [ ] `AC11-4`: Archive/delete làm active notification unavailable/ẩn theo policy; click không mở tài nguyên mất quyền; CODE rejudge không tự tạo grade-release notice.

## 4. Kiểm chứng và bàn giao

Bộ kiểm dự kiến: `test/integration/phase11-notifications.spec.ts` và
`test/http/phase11-notifications.spec.ts`, bổ sung unit policy/clock và
barrier/socket tests nơi phù hợp. Đây là file dự kiến, chưa được tạo.
Dùng DB test riêng; ghi rõ skipped/failed và source revision.
Cập nhật progress chung Phase 8–15 sau khi có kết quả. Không suy test local thành FE hoặc deployed acceptance.
