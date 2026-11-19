# Phase 8 — Contract, event và quyền

Ngày lập: **20/11/2026**. Trạng thái: **COMPLETE — R0 source/contract review**, chưa có business runtime.

[Roadmap chung](../BUSINESS_NOTIFICATIONS_ROADMAP.md) ·
[Flow](../../api_flow/BUSINESS_NOTIFICATIONS_FLOW.md) ·
[API proposal](../../api_flow/BUSINESS_NOTIFICATIONS_flow-api-breakdown.md) ·
[Progress](../../progress/BUSINESS_NOTIFICATIONS_PROGRESS.md)

## 1. Mục tiêu, đầu vào và đầu ra

Phụ thuộc: **Phase 6 và policy nguồn domain**. Quy tắc nghiệp vụ, schema, recipient cutoff,
terminal visibility, flags và rollout theo roadmap chung. Phase này là contract/source
review: AC được tick theo source đã đối chiếu, scenario/test design và kiểm tài liệu
thực chạy. Runtime acceptance thuộc Phase 9–15, chưa được nghiệm thu ở đây.

Đầu ra: event catalog + policy/writer matrix được lưu cùng implementation revision. R0 là review tài liệu/source, không phải runtime acceptance.

Artifacts hoàn tất:

- [Event catalog + scenario matrix](EVENT_CATALOG.md) — 8-T01.
- [Writer inventory + transaction/cause](WRITER_INVENTORY.md) — 8-T02.
- [Recipient/visibility policy](RECIPIENT_POLICY.md) — 8-T03.
- [API contract](../../api_flow/BUSINESS_NOTIFICATIONS_flow-api-breakdown.md) và
  [FE target mapping](FE_TARGET_MAPPING.md) — 8-T04.
- [R0 review evidence](R0_REVIEW.md) — kết quả và giới hạn kiểm chứng.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
| --- | --- |
| 8-T01 | Chốt event catalog ở plan tổng: trigger, revision/causeId, actor exclusion, template, snapshot, terminal notice và target; phân biệt ZIP release với QUIZ/CODE hiện có. |
| 8-T02 | Lập writer inventory cho từng mutation, bulk/worker/cascade/reconciliation; map event tại transaction boundary và cách chống hai producer phát cùng cause. |
| 8-T03 | Chốt recipient/visibility matrix Student/Mentor/Manager/Admin, CASH_PREVIEW, khóa tài khoản, mất enrollment, mentor cũ, hủy lớp và payment owner. |
| 8-T04 | Chốt API additive/versioned DTO, FE target mappings, activation watermark, flags và dedupe/replay retention; cập nhật flow/API proposal. |

## 3. Tiêu chí nghiệm thu

- [x] `AC8-1`: Mỗi type có ít nhất một happy path và một no-op/rollback case; không tạo noti từ draft hoặc trạng thái runner trung gian.

- [x] `AC8-2`: Writer inventory bao phủ reschedule trực tiếp/bulk/leave và settlement PAYOS/CASH/reconciliation; mỗi logical change có đúng một cause.

- [x] `AC8-3`: Matrix phân biệt active notice với terminal notice; cross-class/foreign-owner bị deny, mentor cũ chỉ thấy notice generic.

- [x] `AC8-4`: Contract xác định tương thích CHAT_MESSAGE cũ, role gates riêng và hành vi khi CHAT_ENABLED=false; không có route planned được ghi implemented.

## 4. Kiểm chứng và bàn giao

Review source/catalog/policy/contract, kiểm link và task/AC coverage; chưa gọi là runtime PASS.
Đã cập nhật progress chung Phase 8–15 và R0_REVIEW.md. Không suy test local thành FE hoặc deployed acceptance.
