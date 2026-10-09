# Phase 3 — Tiến độ File + Materials

Cập nhật: **2026-10-09**.
Kế hoạch: [PHASE_3_FILES_MATERIALS.md](../implement_phase/PHASE_3_FILES_MATERIALS.md).

## Hiện trạng

**Đã lập kế hoạch; chưa triển khai BE, migration hoặc hạ tầng storage.**

- Đã đọc DBML, toàn bộ Flow.txt, COURSE_FLOW, usecase-course.drawio, DB design
  review và đối chiếu source/config/progress hiện có.
- Chốt phạm vi plan: File + Materials; đề xuất Course Unit shared material và
  Class Unit/Session material riêng để đáp ứng use case Mentor upload trong buổi.
- D1–D3 (scope, quản lý, access) và D4–D6 là đề xuất được ghi rõ trong plan;
  chưa có xác nhận cuối cùng, chưa áp dụng thành business rule/schema.
- Giữ CASH pending preview, xác nhận mentor theo order snapshot, verified PayOS
  settlement và online email; Phase 3 không thay payment hoặc cấp quyền từ progress.
- Code có CASH confirm/preview và mentor roster; evidence roster deploy không
  chứng minh nghiệm thu thanh toán PayOS tiền thật đã hoàn tất.

## Theo dõi từng bước

| Bước | Trạng thái | Evidence/đầu ra |
|---|---|---|
| Lập plan | Hoàn tất | Plan, tiến độ riêng và index; schema/policy/API/milestone/test/rollout dự kiến. |
| 3.1 Policy + contract | Chưa thực hiện | Chờ ghi quyết định D1–D6, allowlist/limits và contract cuối cùng. |
| 3.2 Upload slice | Chưa thực hiện | Chưa có Files module/migration/MinIO test evidence. |
| 3.3 Material management | Chưa thực hiện | Chưa có Materials module/scopes/release API. |
| 3.4 Student access | Chưa thực hiện | Chưa có material list/download hoặc FE contract Phase 3. |
| 3.5 Metadata/lifecycle | Chưa thực hiện | Chưa có worker/cleanup/purge evidence. |
| 3.6 Quality gate/rollout | Chưa thực hiện | Chưa test BE/MinIO, staging hoặc deploy Phase 3. |

## Kiểm tra tài liệu — 2026-10-09

- Kiểm tra diff whitespace và liên kết Markdown cục bộ của tài liệu mới/chỉnh sửa.
- Không chạy `pnpm check`, HTTP/DB/MinIO tests vì lượt này chỉ lập kế hoạch.
- Không đổi source, DBML, deployed migration, cấu hình production hoặc gửi giao dịch.
- Giữ các chỉnh sửa đã có trong `docs/progress/Progress.md`; thêm entry mới riêng.

## Điểm mở khi bắt đầu triển khai

1. Ghi quyết định cuối cùng về ba scope, mentor quyền quản lý và unit/material release.
2. Xác nhận shared material live ảnh hưởng lớp hiện hữu; snapshot/versioning không nằm MVP.
3. Chốt MinIO public/internal endpoint, file limits/allowlist và extractor resource limits.
4. Giữ vấn đề quyền học sau enrollment COMPLETED để quyết định riêng.
5. Khi nghiệm thu, phân biệt local test, storage staging, production và payment live;
   các thiếu hụt Phase 0/1/2 không tự được đánh dấu hoàn tất nhờ Phase 3.
