# Phase 3.4 — Material access và staff preview

## 2026-10-16 — Hợp nhất Student assets

Giữ DTO/list/detail/download và POST access từ dev, thêm GET assets expectedRevision
đi chung policy/signing/disposition. Không tạo thêm schema. Các số test/migration
trong nhật ký stash dưới đây mô tả phiên bản trước tích hợp;
[evidence mới](../Progress.md#2026-10-16--hợp-nhất-stash-api-local-sau-cập-nhật-feat4).

Cập nhật **2026-10-15** (bổ sung plan; evidence implementation gần nhất 2026-10-14).
[Plan 3.4](../../implement_phase/phase%203/PHASE_3_4_STUDENT_MATERIAL_ACCESS.md) ·
[Flow](../../api_flow/PHASE_3_4_FLOW.md) ·

### Nhật ký local trước tích hợp (giữ từ stash)

## Implementation update — 2026-10-16

Student ARTICLE list/detail, verified inline/attachment signed access và
Manager/Mentor primary preview/scoped assets đã implement cùng authoring3.3.
Giữ ACTIVE/class release/current approval/publication/time gates; detail trả
canonical HTML, list không body HTML. Binary sign đúng version, recheck quyền/
revision/membership trước trả URL<=60s, MP4 Range; không persist URL vào HTML.
Hai migrations additive3.3 phải chạy trước rollout. Local full backend468/468,
targeted domain63/63 sau thêm2 cases, full HTTP51/51 (8 suites), trong đó
Files/material19/19; lint/type-check/build pass. Chưa migrate DB development/
production, deploy/VPS hoặc sửa/tích hợp FE.
[Contract hiện hành](../../api_flow/PHASE_3_4_flow-api-breakdown.md).
Các mục dưới là lịch sử trước implementation ngày2026-10-16.

Cập nhật **2026-10-13**. [Flow](../../api_flow/PHASE_3_4_FLOW.md) ·
[API breakdown](../../api_flow/PHASE_3_4_flow-api-breakdown.md) ·
[FE audit](../../api_flow/PHASE_3_4_FE_API_GAPS.md).

Plan: [3.4 phối hợp3.3](../../implement_phase/phase%203/PHASE_3_4_MATERIAL_ACCESS_PREVIEW.md).

## Planning phối hợp — 2026-10-13 (lịch sử)

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

## Theo dõi phần bổ sung — trạng thái sau implementation14/10

Số slice ở bảng này theo planning13/10. Plan hiện hành15/10 dùng các mục3.4.1–3.4.5;
không đồng nhất số slice của hai bản thành các feature chưa làm thêm lần nữa.

| Slice lịch sử | Trạng thái hiện hành | Gate còn lại |
|---|---|---|
| 3.4.1 Staff primary preview | Implemented local bằng POST files/access | VPS/human/browser review |
| 3.4.2 Typed Student reader | ARTICLE/FILE/VIDEO list/detail implemented local | Server/browser/FE acceptance |
| 3.4.3 Scoped asset access | Student/Manager/Mentor POST files/access implemented local | Ingress/CORS/browser viewer/refresh |
| 3.4.4 BE/server/browser handoff | BE local checks và contract đã có | Release candidate sau tích hợp; user deploy, nhóm FE browser integration |

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

## Giới hạn tại thời điểm ba Student GET ban đầu (lịch sử)

Các mục authoring/ARTICLE/assets bên dưới phản ánh thời điểm trước handoff 3.3;
trạng thái mới hơn ở nhật ký 2026-10-14. VPS/browser/UI vẫn chưa nghiệm thu.

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

## 2026-10-15 — Hệ thống hóa kế hoạch slice 3.4

- Thêm [plan 3.4](../../implement_phase/phase%203/PHASE_3_4_STUDENT_MATERIAL_ACCESS.md)
  theo cấu trúc plan 3.3: phạm vi/baseline/contract/schema/transactions/API,
  các bước 3.4.1–3.4.5, test matrix/DoD và quy trình acceptance server/browser.
- Đối chiếu source hiện có để ghi đúng sáu routes đã implement local; phần còn
  chờ là release-candidate checks, VPS workflow/storage, browser/FE và sign-off.
- Chỉ soạn/đồng bộ tài liệu, không thêm API/schema/migration, không chạy lại
  BE/DB/MinIO tests hoặc deploy. Evidence 411 tests/48 HTTP tests vẫn là ngày 2026-10-14.

## 2026-10-15 — Tích hợp dev/Phase4

Giữ sáu routes3.4 và coverage implementation14/10. Planning13/10 được ghi lịch sử;
plan15/10 là tài liệu hiện hành. Hợp nhất ClassesModule với4.1–4.3, giữ quyền
Materials/CASH độc lập substitute teaching. Hai migration bridge xử lý constraint
trùng giữa attendance4.2 và release3.3.4; source22, không sửa migration đã chạy.
Clean22/upgrade16→22/17→22, data/FK/down-up đã pass3/3 trên DB test riêng.
Quyết định và rollout ở [progress3.3](PHASE_3_3_PROGRESS.md).
Full local gates sau tích hợp ghi bên dưới; VPS/browser/FE vẫn pending.

### Kết quả kiểm chứng cuối sau tích hợp — 2026-10-15

- Node22.20.0/pnpm12.6.0, dedicated PostgreSQL17 test tại localhost:15433 và MinIO
  test local: **pnpm check513/513,48 suites; lint/type-check/build pass**.
- **pnpm test:http60/60,5 suites**, dùng cấu hình mặc định đã nhận từ dev
  (fileParallelism:false), built Nest runtime/cookies/guards và migrations đầy đủ22.
  Không critical skip hoặc unhandled errors trong hai lượt cuối.
- Sau khi rút gọn suffix DB fixture để không bị PostgreSQL truncate mất _test,
  chạy lại lint/type-check và focused migration compatibility: **3/3 pass**.
  Thay đổi cuối này chỉ ở tên/guard DB test, không đổi production code/migrations.
- Lượt trước bridge có HTTP startup fail vì constraint trùng; kết quả60/60 ở trên
  là lượt chạy sau sửa, không dùng skip ở lượt thất bại làm evidence pass.
- 14 conflict đã giải quyết; không sửa migration lịch sử, không migrate DB
  development/VPS hoặc FE. Giữ ngày13/10 planning/Phase4,13–14/10 implementation
  Materials,15/10 integration như các mục riêng. Server/browser/user sign-off còn pending.
