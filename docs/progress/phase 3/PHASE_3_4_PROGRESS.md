# Phase 3.4 — Student Material read slice

Cập nhật **2026-10-12**. [Flow](../../api_flow/PHASE_3_4_FLOW.md) ·
[API breakdown](../../api_flow/PHASE_3_4_flow-api-breakdown.md) ·
[FE audit](../../api_flow/PHASE_3_4_FE_API_GAPS.md).

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
