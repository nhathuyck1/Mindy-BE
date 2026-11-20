# Phase 4.6 progress — Mentor teaching workspace

2026-10-22: **IMPLEMENTED BE, VERIFIED LOCAL**.
Base `1e89579`, nhánh `codex/mentor-teaching-api-gaps`. Không deploy VPS/production.

| Slice | Trạng thái | Evidence |
|---|---|---|
| M1 access/discovery | DONE local | Classes exported typed scope; ANY/PRIMARY/SUBSTITUTE/BOTH, effective/historical mentor, legacy null, role/suspend/reassignment, scoped empty pages. |
| M2 detail/timetable/material scope | DONE local | Shell + counts, paginated units/sessions, mentor unit detail không nested timetable/links; substitute published read only, post-sign revalidation; candidate roster trước start. |
| M3 attendance/stored progress | DONE local | Shared AttendanceProjectionService/credit CTE, mentor/student equality trên makeup/history fixtures; per-enrollment summary; stored vs untracked, no completion command. |
| M4 teaching notes | DONE local | Additive migration1792627200000, internal mentor/staff routes, actor/Class/Session/note locks, version race one winner, same-key replay, window/revocation, atomic audit/receipt, append-only DB audit trigger. |
| M5 contract/handoff | DONE local | Swagger compiled HTTP, 25-request Postman collection, flow/API breakdown/rollout. Local gates được ghi riêng bên dưới. |

[Plan](../../implement_phase/phase%204/PHASE_4_6_MENTOR_TEACHING_WORKSPACE.md) ·
[Flow](../../api_flow/PHASE_4_6_FLOW.md) ·
[API contract](../../api_flow/PHASE_4_6_flow-api-breakdown.md) ·
[Postman](../../../postman/Mindy-Mentor-Workspace-Phase46.postman_collection.json).

## Implementation decisions

- Không sửa FE. Primary authoring policy giữ theo source, substitute không có grant mới.
- Class shell trả visibleUnitCount/visibleSessionCount; không inline units không giới hạn. Mentor unit detail trả sessions=[] và FE dùng timetable endpoint riêng.
- Reports class tách enrollment, student summary khai báo STUDENT_CLASS_HISTORY. Completed/cancelled class có readonly flag; cancelled mutations bị chặn.
- Stored progress read-only: missing row UNTRACKED/null, stored zero giữ decimal string; invalid stored percent được đánh dấu dataQuality, không sửa DB hoặc suy tỷ lệ học. CompletionPolicy UNDEFINED, policyVersion null. Phase5 assignment summary NOT_IMPLEMENTED/counts null.
- Notes persistence dùng SQL giống TeachingOperations leave, không thêm TypeORM entity/integration/config. Actor share lock rồi Class → Session → note; actor/key advisory lock chống key reuse qua session. Note/audit/receipt cùng transaction; audit trigger chặn UPDATE/DELETE. Staff correction reason required; plaintext chỉ hiển thị text.
- Hệ thống metrics/i18n/shared rate limiter không được thêm trong slice này; giữ hạ tầng hiện có, không ghi nhận đã triển khai các hạ tầng đó.

## Local evidence và các lượt kiểm tra

- PostgreSQL + MinIO local; chỉ database `_test`/bucket test. Migration notes rehearsal clean up/down/up bằng suite4.6; không chạy migration trên dev/prod.
- Integration tập trung gần nhất: `phase46-mentor-workspace.spec.ts`8 tests + `phase44-makeup.spec.ts`20 tests = **28 passed**. Có note rollback khi receipt lỗi, concurrent identical retry, stale version one winner, window/assignment recheck, guest roster eligibility không tạo snapshot.
- Material regression4.6 trong phase332: published-only substitute, không draft/edit/create, preview/file revision và revoke sau signing. Shared-credit assertions bổ sung phase44 attendance projections cho makeup/legacy/unmarked/no-denominator.
- Compiled HTTP4.6: **2 passed**, real cookies/roles/Origin, DTO validation, required UUID key, version/replay, notes staff/student boundaries, candidate preview và OpenAPI.
- `pnpm check` từng pass **66 files / 649 tests** ở snapshot trước thay đổi release/bulk song song; không dùng số này để khẳng định current snapshot đã nghiệm thu.
- Lượt đầu full regression bị Docker/PostgreSQL dừng (ECONNREFUSED/startup); restart stack test, không tính failed run là pass. Có lượt HTTP full còn kiểm release endpoints cũ trong lúc source bỏ release, nên không tính historical count69/82 là current acceptance.
- Workspace đồng thời có thay đổi bulk attendance và bỏ Class Unit release ngoài4.6. Giữ source đó; khởi tạo changed=[] cho bulk no-op, cập nhật các expectation student-material/policy không còn khóa unit. Các thay đổi ngoài4.6 không được trình bày là feature của phase này.
- Nghiệm thu cuối dùng DB riêng `mindy_phase46_validation_test` để tránh các chat cùng reset shared fixtures. **Final acceptance: `pnpm check` PASS (lint/type-check/unit/integration/build),64 files / 613 tests passed; `pnpm test:http` PASS (build + real-cookie HTTP),10 files / 79 tests passed, không skip. Cả hai dùng source hiện tại với migration notes và các thay đổi song song được giữ nguyên.**
- Static docs:4 documents,16 relative links,4 JSON examples và Postman25 requests hợp lệ; `git diff --check` passed.

## Rollout và còn lại

Chưa production migration/VPS/browser/live payment mới. Deploy phải chạy additive
migration trước binary; rollback code có thể giữ tables. Migration down xóa
note/audit/receipt history nên export trước khi rollback có data. Notes nội bộ
không xuất student/mail. Completion policy/certificate/student notes/Phase5 BTVN
và Phase4.5 release acceptance không được tự đánh dấu hoàn tất bởi4.6.
