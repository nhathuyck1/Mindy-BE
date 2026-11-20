# Phase 14 — Tài liệu phát hành

20/11/2026: publication/review producers và delayed delivery đã có BE local qua [Phase16](../phase%2016/PHASE_16_BELL_NOTIFICATIONS_WEBSOCKET.md).
Baseline PLANNED bên dưới và AC14 giữ nghiệm thu formal riêng; source/tests hiện hành xem Progress16.

Ngày lập: **20/11/2026**. Trạng thái: **PLANNED**.

[Roadmap chung](../BUSINESS_NOTIFICATIONS_ROADMAP.md) ·
[Flow](../../api_flow/BUSINESS_NOTIFICATIONS_FLOW.md) ·
[API proposal](../../api_flow/BUSINESS_NOTIFICATIONS_flow-api-breakdown.md) ·
[Progress](../../progress/BUSINESS_NOTIFICATIONS_PROGRESS.md)

## 1. Mục tiêu, đầu vào và đầu ra

Phụ thuộc: **Phase 9**. Quy tắc nghiệp vụ, schema, recipient cutoff,
terminal visibility, flags và rollout theo roadmap chung. Phase này chưa có runtime
hoặc evidence nghiệm thu; chỉ tick AC khi có source + test + kết quả thực chạy.

Nguồn: materials/services/material-authoring.service.ts, material-policy.service.ts, student-materials.service.ts và class-content references. Không dùng quyền chat để quyết định ai được đọc tài liệu.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
| --- | --- |
| 14-T01 | Nối MATERIAL_PUBLISHED vào transition thật trở thành Student-visible: approved revision + publishedAt, APPROVE hiện auto-publish; chụp event tại publication, notBefore theo availableAt, tới hạn kiểm full policy trước giao inbox. |
| 14-T02 | Resolve course-unit/class-session references thành audience có quyền theo materials/student-learning policy; dedupe một user nếu resource được tham chiếu nhiều nơi. |
| 14-T03 | Dedupe theo material/content revision: unpublish rồi publish lại cùng revision không spam; revision nội dung mới được publish tạo event mới. |
| 14-T04 | Revalidate unpublish/delete/quyền file trước inbox và target; payload không mang HTML, file bytes, storage key hoặc signed URL. |

## 3. Tiêu chí nghiệm thu

- [ ] `AC14-1`: Draft/submit/approve chưa visible không phát; publish nội dung approved thực sự tạo đúng một notice cho Student eligible.

- [ ] `AC14-2`: Course material có nhiều class references vẫn một row/user/material revision; late enrollment và CASH_PREVIEW bị loại theo quyền material.

- [ ] `AC14-3`: Retry/re-publish cùng revision không sinh thêm row; revision mới published gửi một notice mới; failed review/rollback không gửi.

- [ ] `AC14-4`: Unpublish/delete/mất quyền ẩn notice active khỏi list/count/read/socket; deep link không bypass material/file entitlement.

## 4. Kiểm chứng và bàn giao

Bộ kiểm dự kiến: `test/integration/phase14-notifications.spec.ts` và
`test/http/phase14-notifications.spec.ts`, bổ sung unit policy/clock và
barrier/socket tests nơi phù hợp. Đây là file dự kiến, chưa được tạo.
Dùng DB test riêng; ghi rõ skipped/failed và source revision.
Cập nhật progress chung Phase 8–15 sau khi có kết quả. Không suy test local thành FE hoặc deployed acceptance.
