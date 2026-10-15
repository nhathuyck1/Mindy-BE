# Phase 4.2 — Attendance API handoff riêng cho frontend

**2026-10-13: API regular có source/local evidence lịch sử; chưa deploy/nghiệm thu FE.**
[Plan](../implement_phase/phase%204/PHASE_4_2_SESSION_ATTENDANCE.md) ·
[Progress](../progress/phase%204/PHASE_4_2_PROGRESS.md) · [Flow](PHASE_4_2_FLOW.md).

## Contract implemented và nguồn chi tiết

Giữ full shape/examples/errors ở
[API Phase4 mục15](PHASE_4_flow-api-breakdown.md#15-implemented42--contract-thực-tế-và-handoff).
Không lấy correction/guest/Student endpoints planned làm API actual4.2.
Prefix `/api/v1`, actor Staff/effective MENTOR, success200:

| Endpoint | Input và output chính |
|---|---|
| GET `/class-sessions/:sessionId/attendance` | page/pageSize≤100 → regular snapshot, session permissions, whole totals/pending count |
| POST `/class-sessions/:sessionId/start` | expectedVersion; Staff reason/optional actualStartedAt → WriteView |
| POST `/class-sessions/:sessionId/attendance/sync-roster` | expectedVersion/reason Staff → admitted regular rows |
| PUT `/class-sessions/:sessionId/attendance` | expectedVersion/records1–100 enrollmentId/status/reason Staff → changed rows |
| POST `/class-sessions/:sessionId/finalize` | expectedVersion; Staff reason/optional actualEndedAt → COMPLETED/UNMARKED→ABSENT |

Mọi write required key UUIDv4; expectedVersion integer≥1, reason Staff trim1–1000.
Mentor không gửi actual time. Header/DTO422, path UUID400, ownership403,
missing404, state/day/deadline/version/key409. Replay trả outcome đã commit,
asOf/permissions có thể cũ; refetch để lấy state hiện hành.

Roster item entryType REGULAR/makeupPlacementId null; WriteView guest changes=[];
không có guest admission hoặc Student own result endpoint. Mark chỉ IN_PROGRESS,
status UNMARKED/PRESENT/ABSENT; COMPLETED/CANCELLED correction chưa có4.2.
Staff outside-day start vẫn cần Session SCHEDULED/Class OPEN hoặc IN_PROGRESS;
đây chưa là legacy recovery. permissions là UI hint, backend luôn recheck.

## FE sequence và nhánh lỗi

Context4.1 → roster → start → refetch → mark/unmark → confirm whole totals →
finalize → refetch. CASH confirmation từ mentor Order snapshot đã commit rồi
sync, không chuyển quyền tiền cho substitute. Network retry giữ key/body;
stale409 refetch và xác nhận lại; deadline/state closed chuyển Staff xử lý.
Student/correction/legacy/cancel/guest và coverage/server gaps ở Progress4.2.

[Postman4.2](../../postman/Mindy-Attendance-Phase42.postman_collection.json).
2026-10-13: entrypoint riêng và source/DTO review; chỉ tài liệu, không FE hoặc
runtime/migration/deploy evidence mới.

Revision thực thi: Mentor deadline00:00 ngày startsAt trên lịch+2 theo
APP_TIME_ZONE, không cộng24h từ actual start; không overnight. Start clock lấy
sau mentor lock. Migrate1791849600002 với APP_TIME_ZONE giống API để sửa hạn cũ/
version; GET refetch sau upgrade hoặc cached replay. Shape/errors hiện hữu giữ
nguyên; overnight add/time/start422 CLASS_SESSION_OVERNIGHT_NOT_ALLOWED.
Staff recovery/sync HTTP gate mới pass; correction/legacy/Student vẫn chưa có4.2.
