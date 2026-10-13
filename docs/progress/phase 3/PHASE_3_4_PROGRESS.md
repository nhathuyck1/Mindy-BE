# Phase 3.4 — Material access và staff preview

Cập nhật **2026-10-13**. [Flow](../../api_flow/PHASE_3_4_FLOW.md) ·
[API breakdown](../../api_flow/PHASE_3_4_flow-api-breakdown.md) ·
[FE audit](../../api_flow/PHASE_3_4_FE_API_GAPS.md).

Plan: [3.4 phối hợp3.3](../../implement_phase/phase%203/PHASE_3_4_MATERIAL_ACCESS_PREVIEW.md).

## Planning phối hợp — 2026-10-13

- User giao người khác triển khai3.3–3.6; user nhận handoff deploy/server acceptance.
  FE do nhóm riêng làm; repo FE local chỉ đọc. Lượt này chỉ tài liệu trong BE.
- Lập plan3.4 với mốc3.3.1 typed schema/refs → staff primary preview3.4.1,
  Mentor consumer sau context3.3.2; staff asset access3.4.3 nghiệm thu cùng
  review3.3.3. Student typed reader/assets có thể code bằng fixtures sau3.3.1,
  server happy path chờ publication/release thật3.3.3/3.3.4.
- Contract mới đều planned: hai staff primary preview GET và ba actor-scoped
  asset access GET, required expectedRevision, Material membership/revision/READY
  và signer recheck. Ba Student FILE/VIDEO endpoints hiện có giữ contract.
- Định nghĩa PDF FILE xem/tải, MP4 VIDEO phát qua signed GET, ARTICLE canonical
  HTML + optional refs; ownership Course Unit và ACTIVE/release/approval giữ nguyên.
- Chốt một chủ schema/migration/policy3.3; additive mở rộng read schema hiện có,
  không tạo lại materials. Bàn giao SHA/migrations/config/local checks/Postman/
  smoke/rollback cho user; browser evidence phối hợp nhóm FE và ghi riêng.
- Không sửa source/FE, thêm/chạy migration, BE/HTTP/MinIO runtime tests hoặc deploy.
  Kiểm chứng lượt planning là diff, local links/anchors, JSON examples và consistency.
  Kết quả: git diff --check pass; 14 tài liệu, 152 local links, 1 anchor và
  14 JSON examples hợp lệ; code fences cân bằng. Không chạy runtime tests.

## Theo dõi phần bổ sung

| Slice | Trạng thái | Gate phối hợp |
|---|---|---|
| 3.4.1 Staff primary preview | Planned, chưa implement | Manager draft persistence3.3.1; Mentor context3.3.2; cùng review3.3.3 |
| 3.4.2 Typed Student reader | Planned; FILE/VIDEO baseline đã có | ARTICLE/refs/policy3.3.1; publication/release cho server cases |
| 3.4.3 Scoped asset access | Planned, chưa implement | Typed refs3.3.1; staff cùng review, Student theo ACTIVE/release/approval |
| 3.4.4 BE/server/browser handoff | Planned; local FILE/VIDEO evidence bên dưới | Người triển khai kiểm local, user deploy/API acceptance, nhóm FE làm browser integration |

## Đã implement theo yêu cầu làm ba API trước

- GET `/api/v1/me/classes/:classId/units/:classUnitId/materials`.
- GET `/api/v1/me/classes/:classId/materials/:materialId`.
- GET `/api/v1/me/classes/:classId/materials/:materialId/download`.
- Material persistence read slice FILE/VIDEO; migration additive mới, review/
  revision/publication/deletion constraints, live pagination index.
- ACTIVE/account/class/unit/time/current approval/READY/scope/kind gates; safe
  DTO, visibility trước total/page, read-only snapshot và batch Files summaries.
- Files presigned GET pin object version, TTL1..60s/default60, inline UTF-8 filename,
  no-store; quyền/revision/file được kiểm lại sau ký trước trả response.
- Swagger, env examples, Postman collection, flow/API và rà FE sau implementation.

## Local checks

- `pnpm check`: **291 tests/27 suites**, lint/type-check/build pass với dedicated
  PostgreSQL và MinIO thật, không skip. Count là toàn workspace, gồm schedule
  changes đồng thời; không gán mọi test mới cho Materials.
- Focused Student integration: **15 tests**, gồm migration clean/up/down/up,
  hidden count/page, wrong parent/scope, stale role/suspension, pending/revoke,
  shared class gates, storage disabled/signing failure/recheck, verified version,
  Range206, URL expiry403 và refresh.
- Built-app Files+Materials HTTP: **16 tests pass**, bao gồm2 test mới cho ba
  routes/Swagger/roles/validation và CASH confirm → PDF/MP4 signed GET.
- Full HTTP ban đầu phát hiện hai assertions ở test schedule thay đổi cùng
  workspace: giờ session bị đặt ở My Classes row và chọn nhầm sessions theo
  thứ tự display. Đã chuyển assertion giờ sang schedule event và chọn đúng
  sessions theo ngày/time fixture và kiểm rollback theo ID. Full `pnpm test:http`
  run cuối: **23/23 tests, 2/2 suites pass**, không skip.
- Test databases đều `_test` và bucket fixture riêng; không migrate/reset DB
  development/VPS, không payment live.

## Chưa hoàn thành / evidence chưa có

- Chưa deploy/nghiệm thu VPS ba API; chưa smoke UI/browser/CORS/seek thực tế.
- Manager/Mentor CRUD/review/audit/context/release HTTP3.3 chưa implement.
  READY file không tự thành Material; local fixtures insert approved rows trong
  DB test, không phải production workflow tạo/duyệt nội dung.
- ARTICLE/canonical HTML/inline images/attachments/asset routes và staff binary
  preview vẫn planned; không đánh dấu toàn phase3.3/3.4 complete.
- FILE/VIDEO schema này cần mở rộng bằng migration mới khi triển khai3.3 typed
  content, không sửa migration đã chạy. Parent-mutation/file-ref write concurrency
  và durable audits thuộc authoring3.3; Student reader luôn kiểm ancestry hiện tại.
- FE proxy chưa allowlist ba routes; roles chưa MANAGER; My Classes/schedule/
  roster chưa tích hợp. Không sửa FE ở lượt source audit này.
- Metrics/rate limiting/i18n chưa hạ tầng đầy đủ theo baseline repo; không bổ sung
  hạ tầng cross-cutting trong ba read endpoints này.
