# Phase 3.4 — Student Material read, file access và staff preview

Cập nhật: **2026-10-15**. **Student list/detail/download ARTICLE / FILE / VIDEO,
scoped file access và Manager/Mentor binary preview đã implement, kiểm chứng local
ngày 2026-10-14. Chưa deploy/nghiệm thu VPS; browser CORS/MP4 seek/refresh và UI FE
còn pending.** Tài liệu này hệ thống hóa slice 3.4 theo cấu trúc plan 3.3;
không coi các API đã có là việc cần tạo lại.

3.2 đã nghiệm thu VPS theo xác nhận user ngày 2026-10-12. 3.3.1–3.3.4 đã implement
local; 3.3.5 đã chuẩn bị acceptance/handoff, VPS evidence và user sign-off còn chờ.
Ba Student FILE/VIDEO GET được làm trước 3.3 theo yêu cầu user ngày 2026-10-12;
ARTICLE/assets/staff preview được bổ sung sau typed authoring 3.3.

- Baseline: [3.1 policy](PHASE_3_1_POLICY_CONTRACT.md),
  [3.2 upload](PHASE_3_2_SAFE_UPLOAD.md),
  [3.3 management/review/release](PHASE_3_3_MATERIAL_MANAGEMENT.md).
- Tổng quan: [Phase 3](PHASE_3_FILES_MATERIALS.md).
- Theo dõi: [progress 3.4](../../progress/phase%203/PHASE_3_4_PROGRESS.md).
- Hành trình: [flow 3.4](../../api_flow/PHASE_3_4_FLOW.md),
  [API breakdown](../../api_flow/PHASE_3_4_flow-api-breakdown.md),
  [FE audit](../../api_flow/PHASE_3_4_FE_API_GAPS.md).

## 1. Kết quả cần đạt và phạm vi

Student có enrollment ACTIVE mở Class Unit đã release, xem danh sách Material
được công bố, đọc ARTICLE, xem/tải FILE và phát VIDEO MP4 private. Manager có thể
xem binary trước khi duyệt; Mentor preview đúng nội dung/quyền assignment hiện tại.
File READY tự nó không tạo quyền đọc: mọi request đều qua Material trong context
lớp hoặc staff được phép preview.

| Loại | Trải nghiệm và contract |
|---|---|
| ARTICLE | Detail trả canonical contentHtml/version1 đã sanitize ở 3.3; file=null. Ảnh dùng data-file-id, FE lấy URL từng file qua scoped access. Bài text-only không cần storage |
| FILE | Detail trả primary file summary; download/access cấp signed GET để viewer hoặc tải. Không tự chuyển PDF/Office thành HTML |
| VIDEO | Primary READY kind VIDEO, MIME video/mp4; signed GET hỗ trợ Range, seek và refresh URL. Không HLS/transcoding |
| Attachments | Cả ba loại có thể đính kèm; lấy URL theo Material/fileId, server chọn disposition attachment |

**3.4 bao gồm** typed Student list/detail, primary download giữ tương thích,
inline/attachment access, staff binary preview, signed GET đúng verified object
version, Swagger/Postman/FE contract, tests và nghiệm thu API/storage/browser.
Local API đã có; công việc còn lại tập trung server acceptance và phối hợp FE.

Giữ Course Unit **1–N Material**, shared live giữa các lớp; release thuộc từng
Class Unit. Session chỉ là liên kết sử dụng, không đổi owner hoặc giới hạn shared
content theo lớp tạo bài. Không thêm generic Student download theo fileId, Unit
content table, quyền ADMIN preview thay MANAGER, hoặc quyền học cho enrollment
COMPLETED. Không thay settlement/CASH/PayOS/seat holds/mail.

Authoring/sanitizer/review/release do 3.3 sở hữu; metadata extraction/cleanup/purge
ở 3.5; tích hợp toàn hành trình với 2.3/FE và full rollout ở 3.6. Manager inactive
catalog picker, learning progress/completion, assignment/chat/compiler và external
video ngoài slice này. Không chờ 3.6 mới nghiệm thu API 3.4 trên server.

## 2. Baseline source và evidence đầu vào

| Có sẵn | Tái dùng / giới hạn |
|---|---|
| StudentMaterialsService + StudentMaterialsController | Ba GET và POST scoped access; typed visibility SQL, read-only snapshot, batch refs/summaries, ký ngoài transaction rồi recheck |
| MaterialAuthoringService + Manager/Mentor controllers | Detail 3.3 và preview 3.4; Manager mọi Material chưa xóa có refs hợp lệ, Mentor theo canPreview; không dùng canEdit thay quyền preview |
| material-access.ts / material-content.ts | canReadMaterial/canPreviewMaterial, typed content, current approval, release/time và mọi refs READY |
| material-file-access.ts | Resolve PRIMARY/INLINE_IMAGE/ATTACHMENT từ refs server; chọn disposition, không tin role client |
| FilesService | readyReadProjection/readSummaries batch; signReadReference kiểm READY/scope/objectVersionId; không áp upload-owner policy vào Student read |
| ClassContentContextService / MaterialPolicyService / EnrollmentsService | Resolve Class Unit ↔ Course Unit; recheck current actor/assignment/ACTIVE enrollment và ancestry |
| Files storage adapter | presignGet pin version, filename UTF-8, response no-store; FILE_GET_TTL_SECONDS integer1..60, default60 |
| Schema 3.3 | Typed materials, primary nullable, material_file_references/audits, review/publication constraints; không thêm migration cho ARTICLE access/preview 3.4 |
| Fixtures / compiled HTTP | PDF/MP4/PNG thật, PostgreSQL *_test/private MinIO riêng; upload→authoring→review→release→read/preview đã có local workflows |

Nguồn implementation: `src/modules/materials/services/student-materials.service.ts`,
`material-authoring.service.ts`, domain/DTO/controllers cùng module và
`src/modules/files/services/files.service.ts`. Contract chi tiết request/response/
errors ở [breakdown 3.4](../../api_flow/PHASE_3_4_flow-api-breakdown.md).

Evidence gần nhất đã ghi trong progress ngày 2026-10-14: `pnpm check` **411/411 tests,
35 suites**, lint/type-check/build pass; `pnpm test:http` **48/48, 2 suites**;
Student integration **18 tests**, domain file-access **3 tests**. Đây là kết quả
lịch sử local, không phải lần chạy mới khi soạn plan, không phải VPS/browser pass.
Audit FE ngày 2026-10-12 là tham chiếu lịch sử; cần kiểm source FE hiện tại khi tích hợp.

## 3. Contract nội dung và quyền

### 3.1 Student visibility và context

Mỗi lần list/detail/download/access phải thỏa đồng thời:

1. Current user active, role STUDENT; enrollment **ACTIVE** trong classId truy cập.
2. Class không CANCELLED; Class Unit thuộc Class và tham chiếu đúng Course Unit.
3. Unit OPEN/COMPLETED, unlockAt null hoặc <= serverNow; LOCKED luôn chặn.
4. Material chưa deleted; APPROVED đúng revision, có reviewer/reviewedAt và
   firstApprovedAt hợp lệ; reviewedAt/publishedAt đã đến, availableAt null hoặc đã đến.
5. Typed content hợp lệ; primary/inline/attachments đều READY, chưa xóa, đúng
   Course Unit; inline chỉ IMAGE. metadataStatus PENDING/FAILED không chặn binary READY.

Class COMPLETED với enrollment ACTIVE vẫn dùng cùng gates; enrollment COMPLETED
không được cấp quyền. Pending CASH/PayOS, progress, accessMode FULL hoặc biết
fileId không thay entitlement. Session CANCELLED không thu hồi tài liệu chính.
Hai lớp dùng cùng Material có thể nhận kết quả khác nhau theo release/enrollment.

List lọc visibility **trước total/page**, sort `sortOrder ASC,id ASC`; page>=1,
pageSize1..100/default20. Trả `{items,page,pageSize,total,asOf}`; asOf là server
time dùng cho time gates của snapshot. Unit LOCKED/future trả empty200/total0;
page vượt phạm vi trả items rỗng nhưng giữ total visible. Thiếu ACTIVE trả403,
không giả empty; wrong-parent Unit404, hidden/foreign Material404.

### 3.2 DTO, HTML và file membership

List chỉ summary: identity/context/type/title/description/sortOrder/revision,
sessionId/availableAt/publishedAt/updatedAt, safe `file` nullable và attachmentCount.
Không HTML, refs arrays, review reason/audit/owner/storage internals hoặc signed URL.
File summary chỉ id/originalFilename/mimeType/sizeBytes/kind đã xác minh.

Detail giữ summary và thêm `contentHtml`, `contentSchemaVersion`, `inlineImages[]`,
`attachments[]`. ARTICLE có HTML/version1 và primary null; FILE/VIDEO có HTML/version
null, inlineImages rỗng. Mảng refs sort theo fileId, không chứa URL. Trả canonical
HTML đã lưu từ 3.3; không sanitize lại thành một bản nội dung khác mỗi lần đọc.

Ảnh là `<img data-file-id="UUID" alt="...">`, không src/base64/URL ngoài. FE map
ID đã có trong inlineImages sang scoped access và gán src trong DOM tạm; không ghi
signed URL trở lại HTML/DB/localStorage. Renderer giữ allowlist, không chèn script/style.

fileId phải là primary/inline/attachment của **chính Material** được authorize.
READY file khác cùng Unit, file của Material khác hoặc đã bị thay refs đều404.
Server chọn role theo thứ tự PRIMARY→INLINE_IMAGE→ATTACHMENT; file đồng thời inline
và attachment trả INLINE_IMAGE. PRIMARY/INLINE_IMAGE ký inline, ATTACHMENT ký
attachment; client không chọn role/disposition hoặc bucket/key/version.

### 3.3 Staff preview và URL lifecycle

| Actor | Điều kiện preview |
|---|---|
| MANAGER active | Material chưa xóa ở mọi reviewStatus/publication/release; typed content và mọi refs READY, đúng Course Unit |
| MENTOR active/current assignment | Class chưa CANCELLED, Course Unit thuộc lớp; Material APPROVED current + published, hoặc own submission đúng lớp với firstApprovedAt null, kể cả pending/rejected |
| STUDENT / ADMIN | Không được gọi staff preview; Student dùng class-scoped route với toàn bộ canRead gates |

Mentor không preview draft Mentor khác; bản đã từng approved rồi bị Manager sửa
về DRAFT không tự trở lại own draft của Mentor. Staff preview không áp Student
unlockAt/availableAt nhưng vẫn kiểm typed refs và quyền hiện tại. Manager có thể
đọc metadata lỗi để xử lý/withdraw, điều đó không cho phép ký binary lỗi.

Signed GET pin **verified final objectVersionId**, không latest/staging. TTL1..60s,
default60; API và storage response no-store, filename UTF-8 an toàn. URL chỉ giữ
trong memory, không log/chụp nguyên signature. Metadata đọc được khi MinIO disabled;
binary signing trả503 khi disabled/unavailable. Ký URL không chứng minh storage
hoặc ingress đang online; lỗi khi GET bytes cần được nghiệm thu riêng.

Unpublish/lock/revoke/edit chặn request URL mới và refresh; URL đã phát hành có
thể dùng tới TTL, không hứa thu hồi byte tức thì. Refetch detail khi revision đổi,
logout/đổi account thì abort requests và dọn HTML/assets/player private state.

## 4. Schema, audit và migration

Tái dùng schema hiện hữu, không tạo bảng Materials/read model mới. Migration
read slice `1791763200000-student-material-reads` đã có trước 3.3; typed content/
refs/audit được mở rộng qua `1791849600000-typed-manager-materials`, withdrawal qua
`1791853200000-material-publication-withdrawal`, release audit qua
`1791856800000-class-unit-release-audit`. Không sửa migration đã chạy.

ARTICLE/assets/staff preview 3.4 không thêm migration/env/dependency. Baseline
handoff 3.3.5 có 16 source migrations; lúc rollout đối chiếu artifact thực tế với
DB, không dùng count lịch sử làm bằng chứng schema hiện hành. Giữ UUIDv4,
synchronize=false, FK/typed CHECK/READY guards và indexes đã có.

Read/access không đổi Material revision, review/publication, enrollment/progress,
reference rows hoặc durable mutation audit. Không tạo audit event giả từ mỗi lần
GET/refresh. Không mở rộng metrics/rate limiting chung chỉ trong slice này khi
hạ tầng repo chưa có; ghi hạn chế hiện hữu trong handoff.

Nếu phát sinh schema fix sau nghiệm thu, làm migration additive riêng và chạy
clean/up/down/up trên dedicated DB *_test. Production rollback runtime giữ
schema/refs/audit/data; không down migration có dữ liệu thật. Cleanup/purge 3.5
phải giữ primary FK + reference rows của cả tombstone theo baseline 3.3.

## 5. Transactions, consistency và biên module

Materials→Files/Catalog/Classes/Enrollments/Users; dùng exported providers, không
đọc private repository của module khác, không import Materials ngược vào Classes.
Read không áp file upload-owner policy vì nội dung đã duyệt được shared theo Unit.

List/detail dùng **read-only REPEATABLE READ**; recheck actor/enrollment/context
trong cùng snapshot, resolve refs và Files summaries theo batch để tránh N+1.
SQL typed visibility phải khớp canReadMaterial, bao gồm `NOT EXISTS` reference
không READY/sai Course Unit/inline không IMAGE trước count/page. Không chỉ lọc
items sau phân trang khiến total rò nội dung ẩn hoặc page hụt.

Luồng phát hành URL hiện hữu:

1. Resolve detail/preview target đã authorize và membership fileId; giữ revision/role.
2. Đóng read transaction; Files kiểm READY/scope/version rồi ký GET ngoài transaction.
3. Mở snapshot mới, kiểm lại actor/enrollment hoặc assignment, release/current
   approval/content/refs và membership. Revision hoặc role đổi thì404, không trả URL.
4. Trả URL/expiresAt; access DTO thêm role/revision. Request refresh lặp lại toàn bộ gates.

Không giữ DB lock/transaction lúc gọi storage, không cần HEAD trước ký, không
stream bytes qua API. Recheck giảm race trong lúc ký, không khóa quyền suốt TTL;
authorization vẫn có thể đổi ngay sau response. Race tests cần covers EDIT/delete/
withdraw/release/revoke/role changes khi ký, giữ response không lộ URL khi bị chặn.

## 6. API và FE handoff

Mọi route dưới `/api/v1`; **sáu routes đã implement local**, shapes/examples/errors
chi tiết tại [breakdown 3.4](../../api_flow/PHASE_3_4_flow-api-breakdown.md).

| Nhóm | Route | Kết quả |
|---|---|---|
| Student list | GET /me/classes/:classId/units/:classUnitId/materials | 200 page summaries, không HTML/URL |
| Student detail | GET /me/classes/:classId/materials/:materialId | 200 typed detail, canonical HTML/refs không URL |
| Primary download | GET /me/classes/:classId/materials/:materialId/download | 200 JSON materialId/fileId/url/expiresAt; FILE/VIDEO inline; ARTICLE404 |
| Student file access | POST /me/classes/:classId/materials/:materialId/files/:fileId/access | 200 materialId/fileId/role/revision/url/expiresAt |
| Manager preview | POST /manager/materials/:materialId/files/:fileId/access | 200 access DTO sau canPreview |
| Mentor preview | POST /mentor/classes/:classId/materials/:materialId/files/:fileId/access | 200 access DTO sau current assignment/canPreview |

Cookie auth + role/object permissions; path UUIDv4 invalid400, paging invalid422.
Ba POST access bắt buộc Origin trong CORS_ORIGINS, body không dùng (`{}` hoặc bỏ
trống), không expectedRevision vì server resolve revision hiện tại. Không mutation
business state; vẫn trả200/no-store. CORS không thay Origin/CSRF protection.

| HTTP/code | Hành vi và FE xử lý |
|---|---|
| 401 AUTHENTICATION_REQUIRED | Recover session/login, dọn private state nếu thất bại |
| 403 INSUFFICIENT_ROLE / ORIGIN_NOT_ALLOWED | Sai actor hoặc cấu hình Origin; không retry tự động |
| 403 MATERIAL_ACCESS_DENIED | Thiếu ACTIVE, lớp hủy/mất assignment hoặc actor không còn hợp lệ theo service; refetch quyền và dừng viewer |
| 404 CLASS_UNIT_NOT_FOUND / MATERIAL_NOT_FOUND | Wrong parent/hidden/deleted/foreign file/stale target lúc ký; refetch context/detail, không dò IDs |
| 422 MATERIAL_SCOPE_MISMATCH | Ancestry dữ liệu không nhất quán; dừng và báo lỗi |
| 409 FILE_NOT_READY | Reference mất READY/thiếu verified metadata lúc signing hoặc staff preview; dừng file cũ/refetch, không dùng URL thay thế |
| 503 FILE_STORAGE_DISABLED / FILE_STORAGE_UNAVAILABLE | Metadata còn đọc được; báo tạm thời, retry hữu hạn |

FE lấy classId từ My Classes, **classUnitId=class detail.units[].id**, không lấy
courseUnitId vào path list. FULL chỉ giúp navigation; BE vẫn kiểm quyền mỗi request.
Allowlist đúng sáu method/path trong proxy; runtime schemas hỗ trợ MANAGER,
ARTICLE/file=null và detail refs. Trước khi làm cần rà FE hiện tại vì audit cũ
không chứng minh proxy/roles hôm nay còn thiếu.

PDF/image/MP4 chọn viewer theo verified MIME/kind; định dạng không hỗ trợ thì tải.
GET bytes trực tiếp storage, không gửi BE cookies/token. Download cũ giữ inline
để tương thích, không tự thêm query disposition; attachment route mới đã ký
attachment. Cross-origin download attribute không đảm bảo cưỡng chế tải primary.

MP4 player lưu currentTime/paused state, refresh URL gần expiry hoặc lỗi expiry
rồi khôi phục vị trí. Storage403 có thể do expiry hoặc cấu hình: refresh qua BE
một lần, còn lỗi thì dừng/báo lỗi; không lặp vô hạn. Ảnh inline lazy-load, không
prefetch URL toàn bộ nội dung; fail thì placeholder/refetch hữu hạn. Full FE journey
thuộc gate 3.6 nhưng browser CORS/Range/seek/expiry cần evidence riêng cho 3.4.

## 7. Thứ tự triển khai và nghiệm thu từng slice

Các mã 3.4.x dưới đây dùng để tổ chức/đối chiếu phần việc; không khẳng định đã
có năm đợt deploy trước đây. Mọi phần có gate local và server evidence riêng.

| Bước | Công việc / trạng thái | Local gate | Server acceptance còn cần |
|---|---|---|---|
| 3.4.1 Student visibility/read | Đã có list/detail FILE/VIDEO, mở rộng ARTICLE/refs, filter trước total/page, safe DTO | ACTIVE/release/time/current approval/typed refs, hidden count, wrong parent, shared classes, batch queries | Workflow 3.3 tạo/duyệt thật → Student chỉ thấy đúng nội dung trong lớp đã release; text-only ARTICLE đọc không cần storage |
| 3.4.2 Primary download | Đã có GET FILE/VIDEO, pin verified version, TTL<=60s, no-store/recheck | Pinned-version/overwrite, expiry403/refresh, disabled/outage, quyền/revision đổi lúc ký | PDF/MP4 GET200/Range206 qua public HTTPS, denied cases không có URL; ARTICLE download404 |
| 3.4.3 ARTICLE assets/attachments | Đã có scoped Student POST access và role/disposition server resolve | Inline PNG, attachments cả ba loại, foreign file404, duplicate role priority, broken ref ẩn cả Material | HTML không src/secret → ảnh được authorize; attachment đúng disposition; refresh sau lock/unpublish/revoke bị chặn |
| 3.4.4 Staff binary preview | Đã có Manager/Mentor POST access theo canPreview, Origin/no-store/recheck | Pending/unpublished preview, Mentor own/other/ever-approved, assignment/role/revision change | Manager xem PDF/MP4/PNG trước review; Mentor chỉ preview đúng quyền; Student/Admin không vào staff route |
| 3.4.5 Acceptance/handoff | Swagger/Postman/flow có local; VPS/browser/UI evidence pending | Full checks phù hợp, contract/source alignment, checklist và evidence không secret | Browser CORS/seek/expiry/refresh, hai lớp shared/release độc lập, user sign-off và handoff 3.5/3.6 |

Mỗi phần kiểm chứng được thì ghi kết quả vào progress 3.4 và cập nhật breakdown/
flow nếu contract đổi; không dồn toàn bộ acceptance tới cuối Phase 3. Source đã
pass local không có nghĩa production đã có route/schema hoặc FE đã tích hợp.

Không ước lượng lại phần code đã hoàn tất thành ngày công mới. Effort còn lại
phụ thuộc staging/VPS, FE viewer và cấu hình storage thực tế; chốt sau smoke
public endpoint và kiểm trạng thái FE, tách thời gian BE fix khỏi chờ môi trường.

## 8. Test matrix và Definition of Done

| Nhóm | Ca bắt buộc |
|---|---|
| Entitlement/context | Anonymous401, role403, stale account/role, CASH/PayOS pending, enrollment COMPLETED/revoked/outsider, class CANCELLED; class COMPLETED + ACTIVE còn gate bình thường |
| Release/time/shared | LOCKED dù unlockAt quá khứ; OPEN future/exact boundary/null, COMPLETED Unit, availableAt/reviewedAt/publishedAt; cùng Course Unit hai lớp release độc lập, session không giới hạn shared |
| Typed reads | ARTICLE text-only/image-only, canonical HTML/version1/file=null, FILE/VIDEO mismatch, metadata FAILED + binary READY, mọi refs READY đúng scope; broken ref ẩn trước count/page |
| DTO/paging | page bounds, total visible/asOf/sort ổn định; list không HTML/refs/URL/review secrets; detail refs an toàn, không N+1; storage disabled vẫn đọc metadata |
| Membership/preview | Primary/inline/attachment, file cùng Unit nhưng không thuộc Material404, inline+attachment priority; Manager pending/unpublished, Mentor own pending/rejected/other/ever-approved/revoke |
| Signing/races | Final version đã verify, overwrite latest không đổi bytes, TTL/expiry/recheck; EDIT/delete/unpublish/lock/enrollment/assignment/role thay lúc ký không trả URL trái quyền |
| Storage/browser | Anonymous private object denied, signed GET200/Range206/Content-Range đúng, invalid range phù hợp storage; filename UTF-8/disposition/no-store, HTTPS/CORS, MP4 seek/refresh giữ play state và lỗi retry hữu hạn |
| Regression | Files upload/complete/reference guards, authoring/review/release, auth/My Classes/schedule/roster/CASH/PayOS/mail; startup migrations và Swagger/Postman alignment |

Khi sửa code/chuẩn bị release chạy `pnpm check`, `pnpm test:http`,
`pnpm test:files` với dedicated PostgreSQL *_test/private MinIO và fixture riêng.
Ghi suites/tests/skips thực tế, không dùng focused pass thay full gate hoặc coi
critical skip là pass. Test migration khi thay schema; không migrate/reset DB
development/VPS từ test runner. Local HTTP Range206 chưa thay browser/VPS evidence.

- [x] Student ARTICLE/FILE/VIDEO list/detail và typed visibility đã implement local.
- [x] Primary download + scoped access/staff preview pin version, TTL<=60s/no-store,
  membership/recheck/Origin; local evidence ngày 2026-10-14 có trong progress.
- [x] Swagger/Postman/flow/API breakdown đã có cho sáu routes theo source hiện tại.
- [ ] Release candidate được chạy full local gates và ghi kết quả thực tế khi rollout.
- [ ] Workflow upload→authoring→submit/review→release→Student read/access trên VPS
  pass, gồm pending/locked/draft/rejected/foreign/revoked và shared classes.
- [ ] Browser HTTPS/CORS/PDF/MP4 Range/seek/expiry/refresh và inline/attachment pass;
  FE handoff ghi rõ phần đã tích hợp/phần còn chờ 3.6.
- [ ] Ghi release SHA/migrations/fixtures/status/code/evidence đã loại secret;
  user sign-off 3.4 và bàn giao 3.5/3.6.

## 9. Quy trình nghiệm thu server và bàn giao

1. Ghi release SHA/image, môi trường, thời điểm Asia/Bangkok/người chạy. Đối chiếu
   migration artifact với DB; backup DB/object volume trước rollout có thay đổi.
   Health live/ready và login/auth/me pass. 3.4 hiện không có migration riêng mới.
2. Xác minh public storage HTTPS/private/versioning, signer host/path đúng, quyền
   GetObject/GetObjectVersion; CORS đúng FE origin cho GET/Range và các headers
   viewer cần. Dùng [runbook VPS MinIO 3.2](../../PHASE_3_2_VPS_MINIO_RUNBOOK.md)
   và [Files runbook](../../PHASE_3_2_FILES_RUNBOOK.md), kiểm lại giới hạn ingress
   thực tế; không coi upload MP4 nhỏ pass là toàn bộ mức tối đa 200 MiB đã pass.
3. Import Files Phase32, Materials Phase33/Phase34 Postman; origin khớp config,
   đổi cookie jar đúng actor. Dùng accounts/lớp/Unit và file fixture nghiệm thu
   riêng; không dùng thanh toán thật để tạo entitlement cho smoke.
4. Qua API 3.2→3.3 tạo ARTICLE text-only, ARTICLE inline PNG + PDF attachment,
   FILE PDF và VIDEO MP4; Mentor submit, Manager preview/reject/edit/resubmit/
   approve. Admin/assigned Mentor release lớp A; lớp B cùng Course Unit giữ locked.
   Không seed APPROVED SQL trên production thay bằng evidence workflow API.
5. Student ACTIVE lớp A list/detail/access đúng cả ba loại; lớp B chưa release
   không thấy nội dung. Kiểm hidden cases và foreign fileId, body không có URL
   khi denied; availableAt/unlockAt theo server time, không chỉnh đồng hồ server.
6. GET signed bytes qua public host: PDF/MP4 Range206, đúng version/disposition/
   filename/no-store; private anonymous GET bị chặn. Qua browser thật kiểm preflight/
   CORS, ảnh inline, PDF, MP4 seek rồi expiry→refresh giữ vị trí. Sau unpublish/
   LOCKED/revoke, URL mới bị chặn; ghi nhận URL cũ có thể sống tới TTL.
7. Ghi từng case PASS/FAIL/BLOCKED với HTTP/business code và evidence đã loại cookie/
   secrets/query signature; không lưu URL ký nguyên vẹn. Lỗi storage GET tách khỏi
   API signing; lỗi browser tách khỏi server HTTP. Rollback code tương thích khi
   cần, giữ schema/refs/data; metadata còn đọc được khi storage tắt.

| Nhóm evidence | Release SHA/migrations | Kết quả hiện tại |
|---|---|---|
| API local typed read/access/preview | Theo progress 2026-10-14 | PASS lịch sử; chưa chạy lại ở lượt soạn plan |
| VPS deploy/health/auth/contract | Chưa ghi | PENDING |
| Workflow 3.2→3.3→3.4 + denied/shared cases | Chưa ghi | PENDING |
| Public storage/private/version/Range/disposition/expiry | Chưa ghi cho 3.4 trên VPS | PENDING |
| Browser CORS/PDF/ARTICLE/MP4 seek/refresh | Chưa ghi | PENDING |
| User sign-off 3.4 / full FE journey 3.6 | Chưa xác nhận | PENDING |

Bàn giao 3.5: refs/primary/tombstones tiếp tục bảo vệ binary còn dùng; metadata
FAILED không thu hồi READY; URL ngắn hạn không phải reference bền vững.
Bàn giao 3.6/2.3/FE: sáu routes/schemas/errors, Class Unit ID mapping, renderer/
viewer/refresh/logout behavior và checklist browser, nêu rõ evidence local/VPS.
Learning completion không được suy từ download/seek hoặc session đã kết thúc.
