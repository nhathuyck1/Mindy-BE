# Phase 4.1 — Flow mentor availability và dạy thay

**2026-10-13: core BE có source/evidence local lịch sử; dependencies/release mở.**
[Plan](../implement_phase/phase%204/PHASE_4_1_MENTOR_SUBSTITUTION.md) ·
[Progress](../progress/phase%204/PHASE_4_1_PROGRESS.md) ·
[API](PHASE_4_1_flow-api-breakdown.md) · [Flow tổng hợp](PHASE_4_FLOW.md).

## Flow core hiện có

1. Manager/Admin đọc management Class/detail để lấy sessionId/version.
2. GET candidates theo buổi hoặc tập SCHEDULED chưa override của Class. GET
   không giữ slot; availabilityBasis hiện TEACHING_SCHEDULE_ONLY.
3. PATCH mentor với reason/version/key. Transaction kiểm actor, version, ACTIVE
   mentor và effective schedule sau lock; conflict/stale409 thì refetch.
4. Commit override/teaching snapshot hoặc Class primary cùng audit/receipt.
   Assignment IN_PROGRESS giữ start/startedBy/deadline; Class assignment giữ overrides.
5. Substitute thấy `/mentor/schedule` và Session context; mentor cũ context403.
   Quyền CASH vẫn theo Order snapshot. Session terminal ẩn meeting URL.
6. Nối attendance4.2 qua GET roster→start→mark→finalize; substitute không nhận
   material authoring/review/release hoặc quản lý toàn Class từ quyền buổi.

## Những bước flow tổng hợp chưa thể gọi là có

Student timetable hiện vẫn dùng Class mentor; mentor hiệu lực Student thuộc4.4c.
Approved leave check thuộc4.4a, material read context cần Phase3 phối hợp.
Server/browser journey4.5 pending. Các khoảng trống/test coverage có mã GAP41-01–07
trong Progress4.1; mixed-writer race matrix chưa có đầy đủ dedicated tests.

## Ghi chép công việc

2026-10-13: lập flow entrypoint riêng sau khi tách detailed plan/progress4.1 và
review source/tests. Giữ combined flow và API actual mục14 làm nguồn chi tiết
chung. Verification Markdown diff/link; không chạy lại BE gates, sửa source/FE,
migrate hoặc deploy trong lượt này.

2026-10-13 — Sửa theo plan: provider context recheck ACTIVE/current role;
PG mixed-writer/candidate/audit rollback/staff replay và Admin PATCH HTTP tests
đã bổ sung. T41-10–12/GAP41-04–06 đóng local, current gates check359/359,
HTTP33/33. No overnight và calendar deadline4.2 thay rule cũ; dependencies4.3–4.5
vẫn mở. Không FE/dev/VPS migration/deploy; evidence mới ở progress mục8.
