# Phase 2.3 — Tiến độ My Classes + Personal Schedule

Cập nhật: **2026-10-09**.
Kế hoạch: [PHASE_2_3_MY_CLASSES_SCHEDULE.md](../implement_phase/PHASE_2_3_MY_CLASSES_SCHEDULE.md).

## Hiện trạng

**Đã lập kế hoạch; chưa triển khai API, DTO hoặc migration Phase 2.3.**

- User ưu tiên hoàn thiện luồng đăng ký lớp → My Classes → detail → lịch trước
  Phase 3 File + Materials; lượt này chỉ yêu cầu planning vào Markdown.
- Đã đọc Flow.txt, FE contract, nguồn class/enrollment/CASH/order và đối chiếu
  DBML/Course flow với progress hiện có.
- Tái dùng full detail ACTIVE và CASH preview; đề xuất collection `/me/classes`,
  calendar `/me/schedule`, current/history/all và access context.
- Giữ entitlement hiện tại, không mở quyền enrollment COMPLETED hoặc pending
  PAYOS; CASH pending còn hạn có title/timetable. Metadata/list lịch sử có quyền
  riêng với private learning content, không dùng Order PAID thay enrollment.
- Bước 2.3.1 còn cần chốt contract/policy đề xuất; plan không làm rule thành code.

## Các bước

| Bước | Trạng thái | Evidence/đầu ra |
|---|---|---|
| Planning | Hoàn tất | Plan + progress riêng, index/backlog liên kết theo thứ tự 2.3 → 3. |
| 2.3.1 Contract/policy | Chưa thực hiện | FE contract cuối cùng/access/range/read projection chưa implement. |
| 2.3.2 My Classes | Chưa thực hiện | Chưa có collection API/DTO/query. |
| 2.3.3 Detail continuity | Chưa thực hiện | Chưa bổ sung context; hai detail/preview endpoints cũ vẫn là baseline. |
| 2.3.4 Personal Schedule | Chưa thực hiện | Chưa có calendar API nhiều lớp. |
| 2.3.5 Quality gate/rollout | Chưa thực hiện | Chưa có BE/DB/HTTP hoặc deploy evidence Phase 2.3. |

## Kiểm chứng lượt planning

- Kiểm tra whitespace/diff, code fences và local Markdown link targets.
- Không chạy `pnpm check`, DB/HTTP tests vì chỉ thay đổi tài liệu.
- Không sửa source, deployed migration hoặc dữ liệu/cấu hình production; không
  gửi payment thật. Giữ mọi chỉnh sửa Phase 3/progress có sẵn trong workspace.
- PayOS live và các gate cũ giữ trạng thái riêng; không đánh dấu complete nhờ plan.
