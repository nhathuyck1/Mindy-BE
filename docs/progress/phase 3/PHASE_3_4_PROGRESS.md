# Phase 3.4 — Student Material read slice

Cập nhật **2026-10-14**. [Flow](../../api_flow/PHASE_3_4_FLOW.md) ·
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

2026-10-14: Nhận handoff3.3.5 providers/typed refs/policy/release/fixtures tại [§10 contract3.3](../../api_flow/PHASE_3_3_flow-api-breakdown.md). Manager/Mentor3.3.1–3.3.4 đã implement local. Không thêm Student API trong3.3.5; ARTICLE/assets và staff preview/video runtime còn pending.

## 2026-10-14 — ARTICLE/assets + staff preview (implement local)

Kế hoạch (plan 3.3 §1 "Bàn giao 3.4" + breakdown 3.3 §10): Student detail ARTICLE,
scoped asset access, Manager/Mentor binary preview, signed GET đúng version.

Đã làm (source):
- Student list/detail hỗ trợ ARTICLE: DTO `file` nullable, `attachmentCount`; detail
  `StudentMaterialDetailDto` thêm contentHtml/contentSchemaVersion/inlineImages/attachments.
  Visibility SQL: ARTICLE không primary + schema1; `NOT EXISTS` reference không READY/
  sai unit/inline không IMAGE trước count/page; batch refs + summaries, typed predicate
  `canReadMaterial` kiểm lại trong memory.
- POST `/me/classes/:classId/materials/:materialId/files/:fileId/access` (Student) và
  POST `/manager/materials/:materialId/files/:fileId/access`,
  `/mentor/classes/:classId/materials/:materialId/files/:fileId/access` (canPreview).
  Domain `material-file-access.ts`: resolve role từ refs server, disposition
  inline/attachment. `FileStorage.presignGet`/`FilesService.signReadReference` nhận
  disposition (default inline, không đổi download cũ). Origin guard cho POST.
- Download primary giữ contract; ARTICLE → 404. Không migration, env hay dependency mới.
- Swagger, Postman Phase33 (+2 preview) và Phase34 (+1 access), flow/API breakdown.

Local checks (Node 22.20.0, PostgreSQL `mindy_center_test`, MinIO local):
- `pnpm check`: **411/411 tests, 35 suites**, lint/type-check/build pass.
- Student integration: **18 tests** (2 mới: ARTICLE HTML/inline PNG/attachment
  disposition/foreign fileId404/recheck sau ký và broken reference ẩn trước total).
  Unit `material-file-access.spec.ts`: 3 tests.
- `pnpm test:http`: **48/48, 2 suites**; workflow 3.3.5 ba loại thêm staff preview khi
  PENDING_REVIEW/unpublished, Student 404 khi pending/unpublished, detail ARTICLE, list
  không lộ HTML, access Range206 + Content-Disposition, role403/Origin403/UUID400.

Chưa có / giới hạn:
- Chưa deploy/VPS, chưa browser CORS/Range/seek/refresh thực tế, chưa UI FE.
- Rate limiting/metrics cho access route chưa có hạ tầng chung (ghi nhận, không tự thêm).
- Manager inactive catalog picker vẫn planned; progress học (P2) ngoài 3.4.
