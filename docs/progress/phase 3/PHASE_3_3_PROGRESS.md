# Phase 3.3 — Tiến độ Material management

Cập nhật: **2026-10-11**.
Plan: [PHASE_3_3_MATERIAL_MANAGEMENT.md](../../implement_phase/phase%203/PHASE_3_3_MATERIAL_MANAGEMENT.md).
Flow: [PHASE_3_3_FLOW.md](../../api_flow/PHASE_3_3_FLOW.md).
API dự kiến: [breakdown 3.3](../../api_flow/PHASE_3_3_flow-api-breakdown.md).

## Hiện trạng

**Đã lập kế hoạch; chưa implement Phase 3.3.** User xác nhận 3.1/3.2 đã xong.
Policy/review domain, Files READY reference lock và Classes context có sẵn;
chưa có Material persistence/controllers hoặc release HTTP.

## Lượt planning — 2026-10-11

- Đọc Flow.txt, rules, plans/progress 3.1/3.2 và source policy/Files/Classes/schema.
- Chia 5 bước: Manager persistence/CRUD → Mentor context/draft/submit → Manager
  review/publication → Class Unit release → full checks và bàn giao 3.4.
- Kế thừa Course Unit owner/shared live/firstApprovedAt/revision và role đã chốt.
  Ghi schema/audit/ancestry guards, file/class lock ordering, visibility trước
  pagination, transaction actor/assignment checks, test matrix và rollout.
- Bổ sung kế hoạch Mentor unit/session picker; không thay roster/payment DTO.
  Item detail để FE refetch conflicts; API planned đều đánh dấu chưa triển khai.
- Ghi drift: ParseUUIDPipe path 400 khác body/query 422; chưa có global CSRF
  guard. Đề xuất Origin check cho mutation mới, không mô tả CORS là CSRF protection.
- Student read/download và Manager/Mentor binary preview ở 3.4; 3.3 nghiệm thu
  state/metadata review, không tuyên bố human binary review đã dùng được.
- Kiểm diff whitespace, liên kết cục bộ tài liệu mới/cập nhật và ví dụ JSON.
  Không chạy BE/HTTP/DB/MinIO tests; không migrate dev/VPS, deploy, sửa FE hoặc payment live.

## Theo dõi triển khai

| Bước | Trạng thái | Gate |
|---|---|---|
| Plan | Hoàn tất | Plan + flow/API + progress/index đồng bộ |
| 3.3.1 Manager persistence/CRUD | Chưa làm | Schema/READY attach/ancestry/audit atomic/locks |
| 3.3.2 Mentor context/submission | Chưa làm | Assignment + own draft + ID mapping + hidden pagination |
| 3.3.3 Review/publication | Chưa làm | Revision/races/no-op retry/firstApprovedAt |
| 3.3.4 Class Unit release | Chưa làm | Class/Unit locks, time semantics, Classes audit |
| 3.3.5 Acceptance/handoff | Chưa làm | Full local checks/actual FE contract; 3.4 handoff |

## Evidence và phần còn mở

Evidence 3.1/3.2 đã có trong progress riêng; không phải test pass 3.3.
Chưa có migration SQL review, Material DB/HTTP tests, preview binary, UI/VPS smoke.
Chốt SQL ancestry/parent locks và reviewer trước merge khi implement 3.3.1.
Manager picker inactive catalogue là gap UI riêng; không cấp quyền Admin tạm.
