# Phase 4.2 — Flow Session lifecycle và roster attendance

**2026-10-13: core BE có source/evidence local lịch sử; recovery đầy đủ/release mở.**
[Plan](../implement_phase/phase%204/PHASE_4_2_SESSION_ATTENDANCE.md) ·
[Progress](../progress/phase%204/PHASE_4_2_PROGRESS.md) ·
[API](PHASE_4_2_flow-api-breakdown.md) · [Flow tổng hợp](PHASE_4_FLOW.md).

## Flow regular hiện có

1. Effective Mentor/Staff GET roster/permissions/version/totals. Trước start
   items rỗng, pending CASH chưa là attendance.
2. Mentor POST start trong ngày lịch APP_TIME_ZONE; Staff reason + actualStartedAt
   phục hồi ngoài ngày. Class phải OPEN/IN_PROGRESS, Session SCHEDULED.
3. Atomic Session IN_PROGRESS/Class OPEN→IN_PROGRESS, snapshot ACTIVE same-Class
   với createdAt/enrolledAt cutoff, teaching mentor/start/deadline hết ngày học kế tiếp và audit.
4. PUT chỉ rows thay đổi, PRESENT/UNMARKED hoặc ABSENT explicit; sai snapshot
   rollback cả batch. No-op giữ version. Request mới lấy version mới từ outcome.
5. FE xác nhận totals toàn roster, POST finalize. Server đổi UNMARKED→ABSENT,
   giữ PRESENT/ABSENT, ghi actual end/completedBy/audit/receipt và COMPLETED.
6. Quá giờ lịch không tự ABSENT/COMPLETED. Mentor đúng deadline hết quyền;
   Staff có reason chốt sau hạn. Replay key/body cũ không reset roster/clocks.

## Nhánh CASH và recovery hiện có

CASH pending → mentor snapshot Order confirm commit → effective teaching mentor
sync → admit ACTIVE hold trước start. Late PayOS/new enrollment không admit.
Staff sync sau COMPLETED đã start tạo ABSENT có reason/audit; chưa correction
sau chốt ở4.2. Student không được GET cả roster.

Staff historical start hiện chỉ Session SCHEDULED của Class OPEN/IN_PROGRESS,
không suy roster từ ACTIVE kích hoạt sau actual start. End phải start<end<=now.
Legacy COMPLETED/terminal Class recovery, correction/audit reader thuộc4.3;
cancel/guest/Student summary/history/backlog thuộc4.4. Không coi regular-only
response có null makeup field là guest implementation.

## Ghi chép công việc

2026-10-13: lập flow riêng, review migration/roster/lifecycle/cutoff/auth/version/
assertions; gap register GAP42-01–10 ở progress. Đồng bộ current-state combined
flow; chỉ Markdown diff/link, không BE gates/DB migration/FE/deploy mới.

2026-10-13 — Sửa theo plan: clock/day validation sau mentor lock; không overnight;
deadline Mentor00:00 ngày học+2 từ startsAt (thứ Ba→thứ Năm00:00), không actual
start+24h. Migration1791849600002 backfill old deadline/version giữ history.
PG edge/mixed-flow, Staff recovery/sync HTTP và midnight/DST/rollback rehearsal
pass; check359/359/36 suites và HTTP33/33/4 suites, không skip. GAP42-07–09 đóng
local;4.3–4.5 dependencies còn mở. Chỉ test DB, không dev/VPS/FE/deploy.
