# Phase 4.1 — API handoff riêng cho frontend

**2026-10-13: API core có source/local evidence lịch sử; chưa deploy/nghiệm thu FE.**
[Plan](../implement_phase/phase%204/PHASE_4_1_MENTOR_SUBSTITUTION.md) ·
[Progress](../progress/phase%204/PHASE_4_1_PROGRESS.md) · [Flow](PHASE_4_1_FLOW.md).

## Contract implemented và nguồn chi tiết

Giữ một nguồn shape/examples/errors chi tiết ở
[API Phase4 mục14](PHASE_4_flow-api-breakdown.md#14-implemented41--contract-thực-tế-và-handoff).
Các mục đầu breakdown tổng hợp là thiết kế full Phase4; mục14 mới là contract
actual4.1. Tài liệu riêng này là entrypoint/handoff cho slice, không nhân bản
một full contract khác dễ drift.

Prefix `/api/v1`; management chỉ MANAGER/ADMIN; success200:

| Endpoint | Mục đích |
|---|---|
| GET `/management/classes` | Phân trang metadata/status/assignmentVersion |
| GET `/management/classes/:classId` | Class + paginated TeachingSessionDto |
| GET `/management/classes/:classId/available-mentors` | Candidates của tập affected + assignmentVersion |
| GET `/management/class-sessions/:sessionId/available-mentors` | Candidates + sessionVersion/checked interval/asOf |
| PATCH `/management/classes/:classId/mentor` | mentorId UUID/reason/expectedVersion/key |
| PATCH `/management/class-sessions/:sessionId/mentor` | mentorId UUID hoặc null clear/reason/version/key |
| GET `/mentor/schedule` | MENTOR only, own effective assignments/default tuần/range≤93 ngày |
| GET `/class-sessions/:sessionId/context` | Staff/effective MENTOR, scope SESSION, room/meeting |

Admin PATCH Class có mentorId vẫn ADMIN only, phải request mentor fields riêng
và audited command. GET private/no-store, pageSize≤100. Path UUID sai400;
DTO/header422; auth401/403; missing404; conflict/state/version/key409.
Patch required key UUIDv4; retry giữ key/body, success/replay refetch reads.
Candidate GET không giữ slot; write conflict thì refetch/cần chọn lại.

## Giới hạn FE phải hiển thị đúng

availabilityBasis hiện TEACHING_SCHEDULE_ONLY, chưa approved leave/qualification.
SessionView4.1 không có full permissions/makeup/attendance của planned contract.
Student mentor projection và substitute material read context chưa có; CASH
confirm vẫn theo Order snapshot. Gaps/coverage/server acceptance ở Progress4.1.

[Postman4.1](../../postman/Mindy-Teaching-Phase41.postman_collection.json).
2026-10-13: tách entrypoint, review contract/controllers/DTO; chỉ tài liệu,
không FE integration hoặc runtime test/deploy mới.

Revision thực thi: public context tự recheck ACTIVE/current role/assignment;
shape API giữ nguyên. Admin PATCH/candidates và actor revocation có tests mới,
core gap gates local pass (check359, HTTP33); Student/Materials/leave vẫn pending.
