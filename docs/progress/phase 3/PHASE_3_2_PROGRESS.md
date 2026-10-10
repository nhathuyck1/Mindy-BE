# Phase 3.2 — Tiến độ Upload private và xác minh file

Cập nhật: **2026-10-09**.
Plan: [PHASE_3_2_SAFE_UPLOAD.md](../implement_phase/PHASE_3_2_SAFE_UPLOAD.md).

## Hiện trạng

**Phase 3.2 đã hoàn tất triển khai và nghiệm thu local.**

- Tiếp tục từ lượt bị ngắt ở HTTP test/type-check; sửa lỗi nullable fixture,
  tăng kiểm cấu trúc Office/CRC, phân biệt lỗi parser và lỗi vận hành, bảo vệ
  pinned staging version/verified identity bằng DB trigger.
- Files API intent/complete/status, quyền Manager/Mentor, versioned private MinIO,
  worker VALIDATE có lease/fencing/retry/expiry, READY reference lock đã chạy thật.
- `pnpm check`: lint/type-check/build pass; **217 tests / 18 suites**, không skip.
  Sau đó bổ sung 2 ca copy reply lost + concurrent claim và siết trigger migration:
  `pnpm test:files` **42/42 pass**, gồm clean migration/down/up và regression mới.
- `pnpm test:http`: **19/19 / 2 suites pass**, không skip; 14 Files + 5 payment.
  Cả PDF/PNG/JPG/DOCX/PPTX/XLSX/MP3/MP4 chạy qua parser process bản build.
- Storage thật: anonymous GET/PUT/LIST bị chặn, versioning disabled trả 503,
  signed content-type không thể đổi, CORS preflight origin local pass; copy/read
  pinned version, staging overwrite, orphan history, stale worker/atomic rollback
  và quota/reference lock đều có evidence. Chưa nghiệm thu browser/VPS.
- Setup: `pnpm files:local:up`, `pnpm files:local:setup`,
  [runbook](../PHASE_3_2_FILES_RUNBOOK.md), env/DBML/Swagger/Postman đồng bộ.
- Docker runtime image `mindy-center-api:phase32-local` build thành công;
  chỉ tạo image local, không push/deploy. Lint/type-check kiểm lại sau cập nhật pass.
- Chỉ migrate database test riêng; chưa migrate development/VPS hoặc deploy.
  READY không cấp quyền Student; 3.3/3.4/3.5/3.6 còn theo roadmap.
- Migration author: Codex. Rà soát SQL/constraints/rollback/locks trong lượt này;
  human PR review trước merge còn riêng, không coi local tests là review đã merge.

Các ghi chú planning dưới đây là lịch sử trước triển khai, không phải trạng thái hiện tại.

- Scope: Manager/Mentor đúng assignment upload private cho Course Unit; intent,
  complete, status và VALIDATE job đưa file về READY/FAILED.
- Kế thừa D1–D6/contract 3.1; READY khác material approval/publication/access.
- Plan có schema, DTO/error, version pinning, bounded validation, lease/fencing,
  retry/crash recovery, expiry, reference provider, milestones và ma trận test.
- Metadata PENDING + EXTRACT job ghi atomic sau READY; extraction/cleanup/DELETE
  công khai ở 3.5. Material CRUD/review ở 3.3, Student download ở 3.4.
- Đã đối chiếu đầu ra 3.1: MANAGER, MaterialsModule/MaterialPolicyService,
  Catalog/Classes providers, declaration validator và domain access/review.
  Progress 3.1 ghi pnpm check 171 tests/16 suites + lint/type-check/build và HTTP
  5/5 pass, không skip; user xác nhận đã xong/pass. Không còn gate chờ bàn giao.
- Plan chọn chuyển upload policy/declaration sang Files-owned provider khi code
  3.2; facade Materials giữ chữ ký/errors và delegate. Tránh Files ↔ Materials cycle.
- Sửa HTTP ancestry 404/422 và declaration MIME/filename theo code/test 3.1;
  bổ sung bounded candidate history để không mất orphan provenance qua retry.
- Giữ source/config/DBML/migration và thay đổi hiện có; lượt này chỉ sửa tài liệu.

## Theo dõi triển khai

| Bước | Trạng thái | Evidence/đầu ra |
|---|---|---|
| Plan 3.2 | Đã soạn và rà soát | Baseline 3.1 pass; API/module/policy/recovery đã đối chiếu source |
| Dependency 3.1 | Đã đạt | Progress 3.1: full local gates 171 tests/16 suites, HTTP 5/5, không skip |
| 3.2.1 Storage spike | Pass local | SDK 3.1148.0, MinIO release pin; private/versioning/presign/copy/read |
| 3.2.2 Intent + policy integration | Pass local | Files-owned policy; Materials delegate; 3.1 regression giữ pass |
| 3.2.3 Complete/status/jobs | Pass local | Unique job/concurrent complete, expiry, no-store safe DTO |
| 3.2.4 Validation worker | Pass local | Allowlist binary, bounded isolated parser, SHA-256/pinned version |
| 3.2.5 Recovery/reference | Pass local | Retry/orphan/stale lease/atomic READY rollback/reference locks |
| 3.2.6 Acceptance/handoff | Hoàn tất local | Full gates + 42 storage tests + 19 HTTP; runbook/config/schema/contracts |

## Rà soát sau 3.1 hoàn tất — 2026-10-09

- Xác nhận trạng thái và số tests từ progress 3.1; đọc facade upload, file
  declaration rules, domain contracts/errors và PostgreSQL assertions đã pass.
- Bỏ dependency pending; cập nhật plan/index/progress tổng theo baseline đã đạt.
- Chốt chiều Materials → Files khi triển khai, giữ upload contract/errors qua
  facade delegation; không copy rules hoặc thêm forwardRef.
- Chỉnh mismatch Course Unit trả 422 theo policy; missing/wrong Class parent 404;
  giữ MIME tập chung cho source, reject whitespace thay vì trim, không cấm mọi
  filename nhiều dấu chấm hoặc yêu cầu source/JSON hợp lệ cú pháp.
- Bổ sung lưu lịch sử copy candidates bounded qua retries để 3.5 tìm orphan.
- Kiểm diff whitespace và Markdown links; không chạy lại BE/DB/MinIO tests trong
  lượt sửa plan. Evidence 171/5 là kết quả 3.1 đã có, không phải test 3.2.

## Kiểm tra lượt planning ban đầu — 2026-10-09 (lịch sử)

- Đọc toàn bộ Flow.txt, plan/progress 3/3.1, DBML và source/provider/config/test
  convention có liên quan; ghi rõ dependency đang triển khai và gate bàn giao.
- Kiểm diff whitespace và liên kết Markdown cục bộ của tài liệu mới/chỉnh sửa.
- Không chạy pnpm check, HTTP/DB/MinIO tests vì chỉ thay tài liệu; không có evidence
  triển khai, migration dev/VPS, staging/deploy hoặc payment live mới.

## Điểm cần chốt lúc implementation

1. Baseline 3.1 đã đạt; thực hiện storage spike rồi tích hợp upload policy theo
   chiều Materials → Files, giữ regression và public contract 3.1.
2. Chọn/pin SDK + MinIO image sau storage capability spike; endpoint/CORS theo môi trường.
3. Review schema/provenance ancestry, chỉ định người tạo/reviewer migration trước merge.
4. Chốt numeric bounds parser/worker/scratch/open intents bằng tests; phân biệt
   binary validation 3.2 với metadata extraction/cleanup 3.5.
5. Ghi riêng evidence local, staging/VPS và payment live; không kế thừa trạng thái
   pass của role 3.1 để nhận Files/storage đã hoàn tất.
