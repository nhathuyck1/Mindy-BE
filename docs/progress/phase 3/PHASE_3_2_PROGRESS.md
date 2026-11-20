# Phase 3.2 — Tiến độ Upload private và xác minh file

Cập nhật: **2026-10-12**.
Plan: [PHASE_3_2_SAFE_UPLOAD.md](../../implement_phase/phase%203/PHASE_3_2_SAFE_UPLOAD.md).

## Hiện trạng

**Phase 3.2 đã chốt: triển khai/local checks hoàn tất; nghiệm thu VPS hoàn tất
theo xác nhận của user ngày 2026-10-12 ("chốt 3.2 đi xong r").** Bàn giao cho
3.3 CRUD/review nội dung. Giữ nguyên contract Files và metadata PENDING cho 3.5.
Ảnh đã nhận chứng minh PDF/MP4 READY và private final objects; các ca nghiệm thu
còn lại được ghi theo xác nhận user, không gán là agent tự chạy hoặc có log
từng ca. Lượt chốt chỉ cập nhật tài liệu, kiểm diff; không chạy lại BE tests/deploy.

Các mốc evidence và tiến độ trước lúc chốt (lịch sử):

- Evidence 2026-10-11: user cung cấp Postman status MP4 READY,
  fileId `91f575a9-df4b-4b33-b8c8-7680619244e2`, declaredSizeBytes = sizeBytes
  = 1583534, MIME video/mp4, kind VIDEO, errorCode null, metadataStatus PENDING.
  Ảnh MinIO Console qua SSH tunnel xác nhận bucket PRIVATE và object token
  trong final/<fileId>, size 1.5MiB, Content-Type video/mp4. PDF và MP4 happy
  paths pass theo evidence user. Còn invalid binary, complete retry/quyền/
  anonymous access và browser CORS; không coi toàn slice đã nghiệm thu.
  Chỉ cập nhật tài liệu/đối chiếu source, không chạy BE tests hoặc deploy.

- Evidence PDF trước đó 2026-10-11 từ ảnh Postman user trên VPS: PDF `1.pdf`,
  fileId `5118b974-64fc-44b0-826f-58c1f9ba6c90`, GET status HTTP200/READY;
  declaredSizeBytes = sizeBytes = 75758, MIME application/pdf, kind PDF,
  errorCode null, metadataStatus PENDING (extraction thuộc 3.5). PDF happy path
  đã pass theo evidence user; còn MP4, invalid binary, retry/quyền/private access
  và browser CORS trước khi chốt nghiệm thu. Không lưu signed URL/cookies.
  Các mục bên dưới là lịch sử trước evidence READY này.

- 2026-10-11: User cung cấp ảnh Postman VPS: intent201, declaration194470,
  PUT200 nhưng picker còn Select file, complete PROCESSING rồi status FAILED
  FILE_SIZE_MISMATCH. Hướng dẫn chọn đúng binary file trước Send và tạo intent
  mới; chưa chứng minh object bytes hoặc READY. Không lưu URL/cookies từ ảnh.
  Lượt này đối chiếu source + hướng dẫn/tài liệu, không chạy BE tests/deploy.

- 2026-10-11: User chưa có Manager để test upload. Đối chiếu POST admin/users
  (ADMIN-only), CreateUserDto password12..128, create ACTIVE và registration
  STUDENT-only; hướng dẫn Admin create →Manager login trong Postman. Chỉ hướng
  dẫn/tài liệu, chưa tự tạo user hoặc xác nhận upload VPS; không chạy BE tests.

- 2026-10-11: User báo public storage health200 sau route HTTP minio9000.
  Tiếp theo cấu hình public URL/bật flag/recreate đúng image với Files override
  và nghiệm thu upload. Bổ sung workflow tự chọn override khi VPS có root env
  provisioning để giữ scratch qua deploy sau; chưa deploy patch hoặc có evidence
  intent/PUT/READY/browser CORS trên VPS.
  Local lint/diff/Bash syntax và Compose model (scratch/base tmpfs/private ports)
  pass; không chạy lại BE tests hoặc deploy/kiểm upload từ local.

- 2026-10-11: User cung cấp output provisioning VPS:
  `MinIO private bucket, versioning and backend credentials are ready.`
  Ghi evidence script private/versioning/backend credential checks pass do user
  chạy. Tiếp theo network + Cloudflare storage route/public URL, rồi bật Files và
  nghiệm thu intent/PUT/complete/READY/CORS; chưa đánh dấu upload VPS pass.

- 2026-10-11: User thông báo deploy đã xong sau recovery; chưa có log release
  thành công để đối chiếu SHA/workflow. Tiếp tục hướng dẫn provisioning MinIO
  với flag false; chưa xác nhận storage/tunnel/browser upload READY.

- 2026-10-11: User gửi ảnh SSH recovery: `.env.production` có một dòng
  `MINIO_ENABLED=false`; recreate API bằng image tag `8aafd5a` trả Healthy.
  `.git` là directory, env/base compose tồn tại. Đây là evidence API recovery
  do user thực hiện; release `1258e24` chưa xác nhận deploy pass, checkout failure
  condition còn chưa chốt. MinIO vẫn disabled, chưa có upload READY/CORS evidence.

- 2026-10-11: Screenshot deploy kế tiếp fail ở checkout preflight, trước rollout;
  chưa rõ condition. Thêm named errors thay silent tests, dirty status paths và
  fast-forward diagnostics; giữ check safety, không reset/clean/stash. Chỉ log
  API khi bước rollout fail để tránh nhầm log cũ với nguyên nhân checkout failure.
  User gửi ảnh SSH: `dev`, status rỗng. Log `logs_103361230819` release `1258e24`
  vẫn dùng silent tests, không chốt condition tại thời điểm fail. Diagnostics
  thấy API image cũ `8aafd5a` restarting vì keys rỗng, chưa load env mới.
  Lint/diff/Bash syntax và 6 mock preflight cases pass; chưa SSH/deploy/khôi phục
  hoặc xác minh upload READY trên VPS.

- 2026-10-11: Đọc log deploy user cung cấp (`logs_103358883936`, release
  `8aafd5a`): CI lint/type-check/build và 243 tests/22 suites + 20 HTTP tests/2
  suites pass theo log; đây là evidence CI, không phải tests chạy lại local.
  VPS image build/backup check/migration pass (`No migrations are pending`), API
  recreate/start rồi unhealthy. Runtime logs user cung cấp xác nhận MinIO bật
  nhưng access/secret key rỗng làm ConfigModule fail. Probe schema local:
  omitted/false + key rỗng pass, true + key rỗng fail đúng hai fields. Thêm env
  preflight trước backup/migrate/API switch và failure diagnostics vào workflow;
  runbook hướng dẫn false/recreate đúng release. Không đổi schema/API/health gate.
  Lint/diff và Bash syntax pass; chưa redeploy/khôi phục/xác minh VPS.

- 2026-10-11: User cho biết code 3.2 đã có trên server, mục tiêu mỗi slice là API
  dùng được trên server. Chuẩn bị override `compose.files-production.yaml`,
  provisioning image/script và [VPS runbook](../../PHASE_3_2_VPS_MINIO_RUNBOOK.md)
  cho private bucket/versioning, backend user có policy riêng, CORS, scratch và
  route tunnel. Lint, shell syntax, Compose model và tài liệu kiểm local;
  Docker daemon chưa chạy nên chưa build/run artifacts mới. Chưa SSH/deploy hoặc
  có evidence upload READY trên VPS; không coi code deployed là storage pass.

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
  [runbook](../../PHASE_3_2_FILES_RUNBOOK.md), env/DBML/Swagger/Postman đồng bộ.
- Docker runtime image `mindy-center-api:phase32-local` build thành công;
  chỉ tạo image local, không push/deploy. Lint/type-check kiểm lại sau cập nhật pass.
- Chỉ migrate database test riêng; chưa migrate development/VPS hoặc deploy.
  READY không cấp quyền Student; 3.3/3.4/3.5/3.6 còn theo roadmap.
- Migration author: Codex. Rà soát SQL/constraints/rollback/locks trong lượt này;
  human PR review trước merge còn riêng, không coi local tests là review đã merge.

## Hướng dẫn tích hợp FE — 2026-10-10

- Bổ sung [flow FE upload](../../api_flow/PHASE_3_2_FLOW.md) và
  [API breakdown](../../api_flow/PHASE_3_2_flow-api-breakdown.md): request/response,
  raw PUT MinIO, complete async, polling READY/FAILED, quyền/error/retry và config VPS.
- Đối chiếu source: public Course active detail có Course Unit IDs; Mentor class
  list chưa có đầy đủ mapping Class Unit → Course Unit cho màn hình chọn unit.
  Không dùng role Admin hoặc title/position để thay nguồn context đúng quyền.
- Lượt này chỉ viết tài liệu; không triển khai read API còn thiếu, không sửa FE,
  source/env hoặc deploy. Chưa xác minh browser/VPS; kiểm liên kết và diff tài liệu.

## Ghi chú planning lịch sử

Các ghi chú dưới đây là lịch sử trước triển khai, không phải trạng thái hiện tại.

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
| 3.2.6 Acceptance/handoff | Hoàn tất local + VPS | Local gates đã ghi; PDF/MP4 READY có ảnh; user xác nhận chốt VPS 2026-10-12; bàn giao 3.3 |

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
