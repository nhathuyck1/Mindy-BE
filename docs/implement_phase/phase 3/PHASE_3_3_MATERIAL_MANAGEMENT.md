# Phase 3.3 — Material management, review và Class Unit release

Cập nhật: **2026-10-13**. **Plan triển khai; chưa implement/nghiệm thu 3.3.**
3.2 đã nghiệm thu VPS theo xác nhận user ngày 2026-10-12; không còn gate chờ upload.
Plan này hợp nhất bản nháp 2026-10-11 và scope ARTICLE / FILE / VIDEO đã chốt.

Điều phối user2026-10-13: người khác triển khai **3.3–3.6**, user nhận bàn giao
deploy/nghiệm thu server. **FE là nhóm riêng; repo FE local chỉ để đọc, không sửa.**
[Plan 3.4 phối hợp](PHASE_3_4_MATERIAL_ACCESS_PREVIEW.md) đưa staff preview/asset
access vào cùng mốc review3.3.3, Student typed reader làm sau contract3.3.1;
không yêu cầu chờ hoàn tất toàn3.3 mới bắt đầu3.4.

Ngoại lệ thứ tự theo yêu cầu user2026-10-12: [ba Student FILE/VIDEO GET3.4](../../api_flow/PHASE_3_4_FLOW.md)
đã có read persistence tối thiểu + signed GET. CRUD/review/release/ARTICLE3.3
vẫn chưa implement; typed schema phải mở rộng bằng migration additive mới,
không tạo lại bảng materials hoặc sửa migration read đã chạy.

- Baseline: [3.1 policy](PHASE_3_1_POLICY_CONTRACT.md), [3.2 upload](PHASE_3_2_SAFE_UPLOAD.md).
- Theo dõi: [progress 3.3](../../progress/phase%203/PHASE_3_3_PROGRESS.md).
- Hành trình: [flow 3.3](../../api_flow/PHASE_3_3_FLOW.md),
  [API breakdown dự kiến](../../api_flow/PHASE_3_3_flow-api-breakdown.md).

## 1. Kết quả cần đạt và phạm vi

### Diễn giải trải nghiệm bài học ngày 2026-10-12

User muốn mở Unit để đọc kiến thức như một trang bài học, soạn bằng CKEditor ở
FE và lưu HTML ở BE. Dùng Course Unit 1–N Material hiện có: Unit giữ tên/thứ tự/
description tổng quan; mỗi bài đọc là Material ARTICLE với contentHtml TEXT.
Màn hình Unit lấy metadata + danh sách Material theo sortOrder, chọn bài để mở
detail và render canonical HTML. Không đề xuất bảng course_unit_details riêng
để lưu trùng bài học; một API/màn hình tổng hợp Unit detail có thể bổ sung khi
FE cần, nhưng chưa được tạo bằng lượt tư vấn này.

CKEditor xuất HTML cho contentHtml; BE sanitize theo allowlist trước khi lưu,
không tin việc editor giới hạn toolbar. Article chỉ có chữ không cần upload.
Ảnh inline đi qua Files và dùng data-file-id đã xác minh theo contract §3.1;
FE cần adapter/conversion cho CKEditor, không lưu signed URL/base64 trong HTML.

PDF dùng làm giáo trình, slide, bài tập hoặc tài liệu tham khảo có thể xem/tải.
Sau upload, binary nằm ở MinIO và Files trả fileId READY. File có thể trở thành
Material FILE độc lập trong Unit hoặc attachment của ARTICLE theo typed plan;
upload READY tự nó chưa tạo bài học, chưa publish và chưa cấp quyền Student.
PDF không tự chuyển thành HTML hay tự trích thành kiến thức. FILE/VIDEO Student
read đã có; ARTICLE, attachments và authoring vẫn là phần chưa implement của3.3.

Tham khảo: [CKEditor get/set data](https://ckeditor.com/docs/ckeditor5/latest/getting-started/setup/getting-and-setting-data.html),
[OWASP HTML sanitization](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).

Manager/Mentor tạo nội dung của Course Unit, Mentor gửi duyệt, Manager quyết định
đúng revision; Admin/Mentor release Class Unit. Nghiệm thu bằng API trên server
sau từng slice, ghi local checks và server acceptance riêng. 3.6 là tích hợp toàn
hành trình, không phải thời điểm đầu tiên deploy 3.3.

| Loại | Nội dung lưu | Điều kiện |
|---|---|---|
| ARTICLE | contentHtml đã sanitize, contentSchemaVersion=1; primary file NULL | Có text hoặc ảnh inline hợp lệ sau sanitize; bài chỉ có text không cần upload |
| FILE | Primary fileId READY, contentHtml/contentSchemaVersion NULL | Kind khác VIDEO theo allowlist Files 3.2 |
| VIDEO | Primary fileId READY VIDEO, MIME video/mp4; contentHtml/contentSchemaVersion NULL | MP4 private MinIO; phát qua signed GET ở 3.4, HLS làm sau |

Cả ba loại có title/description/sortOrder/availableAt/sessionId, optional
attachments và cùng workflow review/revision. ARTICLE có inline images tham chiếu
fileId READY IMAGE. Files 3.2 không nhận upload .html; nội dung bài viết là string
trong Material API. Không lưu base64, signed URL, bucket/key hoặc URL ảnh ngoài
trong HTML.

Giữ D1–D5 đã duyệt: Course Unit **1–N Material**, tài liệu shared live giữa lớp;
Session chỉ là liên kết sử dụng, không phải owner hoặc filter ẩn tài liệu lớp khác.
MANAGER quản lý Materials; ADMIN chỉ có release của Admin trong slice này.
Mentor không approve/publish và không lấy lại quyền sửa Material từng được duyệt.
D6 file-only được thay bằng ARTICLE/FILE/VIDEO theo yêu cầu user 2026-10-11.

**3.3 bao gồm** typed domain/schema, sanitizer/refs, CRUD, review/publication,
Mentor context picker, Class Unit release/audit, Swagger/Postman, tests và server
acceptance workflow. Manager đọc ARTICLE đã sanitize ở detail để duyệt ngay 3.3.

**Phối hợp 3.4** Student list/detail/asset access, Manager/Mentor binary preview,
signed GET đúng object version và MP4 Range/seek/expiry. Staff primary preview
triển khai sau draft persistence3.3.1, Mentor consumer sau context3.3.2;
staff inline/attachment access sau refs3.3.1. **Nghiệm thu human review3.3.3 cần
preview/asset access tương ứng**, cùng mốc thay vì đợi toàn3.3 xong.
Không dùng upload PUT hoặc Files status API làm download tạm.
Metadata extraction/cleanup/purge ở3.5; BE full journey ở3.6, FE do nhóm riêng làm.
Không thêm external video, HLS/transcode, snapshot nội dung, assignment/chat/compiler
hoặc quyền học cho enrollment COMPLETED; CASH/PayOS/holds/mail giữ baseline.

## 2. Baseline source và evidence đầu vào

| Có sẵn | Tái dùng / việc còn thiếu |
|---|---|
| MaterialsModule/MaterialPolicyService | Policy + Student FILE/VIDEO read entities/controller. actor(manager) đã có cho read; mutation paths cần đồng bộ khi implement3.3.1 |
| material-contract/review/access | Hiện bắt buộc một file; mở rộng typed content + refs và ARTICLE-only, giữ transitions/revision/firstApprovedAt |
| FilesService.assertReadyReference | Lock file + READY/owner/scope/current assignment, không gọi MinIO; bổ sung batch provider để khóa mọi file trước mọi Class |
| ClassContentContextService | getUnit/getCourseUnitInClass/getSession/lockContentClass có sẵn; bổ sung HTTP context/release trong Classes |
| GET /mentor/classes | Có classId; cần unit/session picker để lấy đúng classUnitId/courseUnitId/sessionId |
| EnrollmentsService.hasActiveAccess | ACTIVE giữ nguyên; Student read consumer3.4 đã dùng |
| FileStorage | presignGet đã có cho Student primary FILE/VIDEO; staff preview/ARTICLE assets còn planned |
| Migration hiện tại | materials FILE/VIDEO read slice đã có; typed ARTICLE/refs/audit cần migration additive tiếp theo |

3.2 đã chốt theo [progress](../../progress/phase%203/PHASE_3_2_PROGRESS.md):
PDF/MP4 READY và private final objects có ảnh user; những ca còn lại ghi theo
xác nhận user, không gán là agent tự chạy. Evidence local lịch sử gần nhất:
CI 243 tests/22 suites + 20 HTTP tests ngày 2026-10-11.
Không chạy lại ở lượt plan này và không dùng làm kết quả 3.3.
metadataStatus PENDING/FAILED không chặn attach nếu binary vẫn READY.

## 3. Contract nội dung và quyền

### 3.1 Nội dung và references

- Create bắt buộc contentType + title; ARTICLE required contentHtml, version default1;
  không nhận fileId. FILE/VIDEO required fileId, không nhận HTML/version.
- PATCH bắt buộc expectedRevision, ít nhất một content field; contentType/schema
  version bất biến trong MVP. contentHtml chỉ ARTICLE; fileId chỉ FILE/VIDEO.
- attachmentFileIds: unique UUID v4, tối đa50, create default[]; PATCH omitted giữ,
  [] xóa, null invalid. Mọi loại có attachments; HTML refs chỉ ARTICLE.
- Inline image dùng <img data-file-id="UUID" alt="...">, không src; tối đa50 image
  nodes, derive unique file IDs từ HTML đã sanitize. Không tin mảng inline refs client.
- Primary/inline/attachment đều READY, đúng Course Unit/quyền attach. Một file có
  thể dùng bởi nhiều Material; primary và attachment trùng cùng Material bị reject;
  inline và attachment cùng file được phép với hai role.
- HTML input và canonical output tối đa48 KiB UTF-8; JSON request tổng64 KiB.
  Giới hạn JSON tính cả escaping/metadata/refs; vượt limit trả413. Đề xuất DOM depth32,
  nodes5.000; chốt sau spike3.3.1 và ghi lại contract trước merge.
- Allowlist: headings/paragraph/bold/italic/underline/lists/table/blockquote/code/
  pre/link/image. Dùng parser + sanitizer, không regex; loại script/event handlers/
  iframe/object/embed và style. Link chỉ http/https/mailto, không javascript/data.
  Chốt library/config sau kiểm compatibility ESM và XSS tests trong3.3.1.
- Nội dung sau sanitize phải có text có nghĩa hoặc inline image hợp lệ; attachment
  đơn thuần không biến ARTICLE rỗng thành hợp lệ. Detail trả canonical HTML đã lưu.
- List/queue chỉ summary; detail/mutation trả contentHtml, file nullable,
  inlineImages[]/attachments[] verified summaries theo actor. Không storage secrets/URL.

### 3.2 Role, state và optimistic concurrency

| Actor/action | Điều kiện và kết quả |
|---|---|
| Manager create | Course Unit tồn tại, refs READY đúng owner Unit; có thể dùng file Mentor. DRAFT/revision1 + CREATE audit |
| Mentor create | Active role/current assignment, Class chưa CANCELLED, đúng ancestry, mọi file của mình còn upload scope. createdInClassId là provenance |
| Mentor edit/delete | Own submission đúng lớp, còn assignment, firstApprovedAt null, DRAFT/REJECTED; PENDING không sửa |
| Manager EDIT | Sửa mọi state còn sống; bất kỳ PATCH hợp lệ kể cả cùng giá trị tăng revision, về DRAFT, clear current review/approval/publication; giữ firstApprovedAt |
| SUBMIT | DRAFT→PENDING_REVIEW; kiểm typed content/refs. Retry pending cùng revision no-op; REJECTED phải EDIT trước |
| APPROVE | Manager; pending hoặc own Manager draft. Mentor draft chưa từng duyệt phải submit; bản Manager sửa sau từng duyệt được approve lại. Approve đồng thời publish |
| REJECT | Manager pending, trimmed nonempty reason/max2.000; clear approval/publication. Retry cùng reason/revision no-op, reason khác409 |
| PUBLISH/UNPUBLISH | Publish cần current approval/valid content/READY refs; unpublish giữ approval. Retry giữ timestamps, không audit trùng; approve retry sau unpublish không tự publish |
| DELETE | Soft delete, clear publication, giữ refs/binary/audit. Authorized retry cùng revision204; GET tombstone404 |

expectedRevision bắt buộc PATCH/DELETE/mọi command, integer1..2.147.483.647.
Chỉ EDIT tăng revision. Hai approve cùng revision no-op; approve/reject chỉ một
decision thắng; review revision cũ sau EDIT trả409. FE refetch sau conflict/mất
response, không tự rebase hoặc approve payload mới.

Mentor list/detail thấy Material chính APPROVED/published và own submission chưa
từng approved trong đúng lớp; filter trước count/page. Draft/rejectionReason người
khác không lộ. Không áp Student release/time gates cho Mentor metadata.
Manager sees mọi Material còn sống. Disabled/role-changed actor kiểm lại từ DB.

## 4. Schema, audit và migration

Migration additive mới, không sửa migration deployed. Materials sở hữu ba bảng:

| Bảng | Fields/constraints chính |
|---|---|
| materials | UUID v4, course_unit_id/created_by NOT NULL FK RESTRICT; content_type enum; file_object_id nullable FK; content_html nullable TEXT; content_schema_version nullable; title250/description<=5.000/sort_order>=0/available_at; session/provenance/review/revision/publication/deletion/timestamps |
| material_file_references | material_id/file_id FK RESTRICT, role INLINE_IMAGE/ATTACHMENT; unique(material_id,file_id,role), index file_id |
| material_audit_events | material_id/actor_id/action/revision/occurred_at, append-only service; index(material_id,occurred_at,id); không HTML/raw payload/storage secrets |

CHECK loại nội dung: ARTICLE có HTML/version1 và primary NULL; FILE/VIDEO có
primary NOT NULL và HTML/version NULL. Kind/scope/READY cross-table kiểm bằng
providers + DB protections; không chỉ bỏ NOT NULL ở file FK.
APPROVED yêu cầu approvedRevision=revision/reviewer/time/firstApprovedAt;
publication cần current approval; rejected có reason và không publication;
deleted không publication. firstApprovedAt bất biến sau approval đầu.
Không dùng CHECK so với serverNow; gate thời gian tính khi đọc.

Index còn sống (course_unit_id,sort_order,id), queue(review_status,created_at DESC,id),
own submissions(created_by,created_in_class_id,review_status), file/session FK.
sortOrder không unique. Audit không unique(material,action,revision) vì publish/
unpublish/publish cùng revision hợp lệ; no-op được quyết định dưới row lock.

Cross-table: mọi file cùng Course Unit và READY lúc attach; session ancestry
session→classUnit→courseUnit khớp, Mentor session cùng lớp provenance; provenance
phải có Class Unit của Course Unit đó. 3.3.1 thiết kế constraint triggers/row locks
cho attach, parent mutation và file state changes, review SQL + concurrency tests;
không tuyên bố FK đơn đã giải quyết race. Soft-delete giữ refs cho cleanup3.5.

Classes sở hữu class_unit_release_audit (actor, class/unit, before/after status/
unlockAt, occurredAt); update release + audit atomic, no-op không audit.
SQL reviewer được chỉ định trước merge theo repo rules, không chặn planning.
Test migration clean/up/down/up trên DB test; production rollback ứng dụng giữ
bảng/data/refs, không down bảng đã có dữ liệu thật.

## 5. Transactions, locks và biên module

Materials→Files/Catalog/Classes/Users/Auth; Classes không import Materials ngược.
Tái dùng application services/ESM .js và exported providers, không repository xuyên module.

Mutation: load/lock Material nếu có → actor cùng EntityManager → resolve/lock
mọi refs/context → policy → save state + refs + audit trong một transaction.
Không tin client snapshot/actor/file summary; không MinIO/SMTP trong transaction.
Sanitize/bound input trước transaction, revalidate typed snapshot/refs dưới locks.

Order dự kiến **Material→tất cả file rows UUID tăng dần→tất cả Class rows UUID tăng
dần**, create bỏ Material lock. Không loop assertReadyReference một cách mù quáng:
provider hiện authorize từng file có thể lock Class trước file tiếp theo. 3.3.1
bổ sung Files batch provider resolve IDs, lock toàn bộ files rồi Classes, re-read
scope và kiểm quyền; giữ single-file3.2 contract. Replacement khóa union old/new
refs, đừng chỉ khóa file mới. Review parent triggers/FK/User locks cùng protocol.
Retry hữu hạn deadlock/serialization toàn transaction; không retry domain conflict.

Release chỉ Class→Class Unit, không truy ngược file/Material. Assignment revoke/
cancel và disabled/role change có race tests. User lock protocol chốt theo source
trong3.3.1; actor(manager) đơn thuần không chứng minh đã serialize role revoke.

Reads dùng Files batch summary provider không áp upload-owner policy; lọc visibility
trước count/page, tránh N+1; existing metadata đọc được khi MinIO disabled.
canRead/canPreview có typed predicate dùng chung cho ARTICLE-only và mọi refs;
regression bảo toàn file-only fixtures3.1/3.2 và không cấp Student API ở3.3.

## 6. API dự kiến và FE handoff

Mọi route dưới /api/v1, **chưa implement**; chi tiết shapes/errors/UI trong
[breakdown](../../api_flow/PHASE_3_3_flow-api-breakdown.md).

| Nhóm | Routes |
|---|---|
| Manager | GET/POST /manager/course-units/:courseUnitId/materials; GET /manager/materials; GET/PATCH/DELETE /manager/materials/:materialId |
| Manager decisions | POST /manager/materials/:materialId/approve, /reject, /publish, /unpublish |
| Mentor context | GET /mentor/classes/:classId/units và /units/:unitId/sessions |
| Mentor content | GET/POST /mentor/classes/:classId/units/:unitId/materials; GET/PATCH/DELETE /mentor/classes/:classId/materials/:materialId; POST .../submit |
| Release | PATCH /admin/classes/:classId/units/:unitId/release; PATCH /mentor/classes/:classId/units/:unitId/release |

Cookie auth/role + object permission; mutation có Origin allowlist check (planned
403 ORIGIN_NOT_ALLOWED), không coi CORS là CSRF protection. Path UUID baseline400;
body/query invalid422. no-store metadata, no signed URLs.
Manager inactive catalogue picker còn thiếu; API acceptance dùng Course Unit fixture
hợp lệ, không cấp quyền Admin tạm hoặc đánh dấu UI picker đã xong.

Release body status LOCKED/OPEN required, unlockAt optional timezone/null; omitted
giữ lịch cũ, null xóa. COMPLETED input422; completed Unit/cancelled Class409
UNIT_RELEASE_CONFLICT. Same payload no-op, class/unit locks serialize; không
expectedRevision, FE không tự replay release sau refetch. Release không đổi enrollment/
progress/payment. LOCKED luôn chặn; OPEN + future unlockAt đợi serverNow, không worker.

## 7. Thứ tự triển khai và nghiệm thu từng slice

| Bước | Công việc | Local gate | Server acceptance dự kiến |
|---|---|---|---|
| 3.3.1 Typed Manager draft | Spike sanitizer/locks; typed domain; migrations/entities/refs/audit; Files batch summary/reference provider; Manager create/list/detail/PATCH/delete | ARTICLE-only/XSS/bounds, FILE/VIDEO kind/scope, replacement rollback, DB constraints/migration/locks, safe list/detail | Manager tạo/đọc/sửa ARTICLE; attach PDF/MP4 READY3.2; stale PATCH409; soft-delete; refs ngoại scope bị chặn |
| 3.3.2 Mentor submission | Unit/session context; assigned list/detail/own create/edit/delete/submit | Mapping/ancestry, hidden count, assignment/cancel race, rejected-resubmit fixtures, Files regression | Mentor lấy IDs→draft ARTICLE/FILE/VIDEO→submit; khóa pending edit; Mentor khác không thấy draft; revoke chặn access |
| 3.3.3 Review/publication + mốc preview3.4 | Queue filters, approve/reject/publish/unpublish, safe DTO/canEdit; phối hợp3.4.1 primary preview và3.4.3 staff assets | Decision/PATCH races, idempotency audit, firstApprovedAt, edit revoke approval; preview/review cùng revision | Manager xem ARTICLE/PDF/MP4 và refs→reject/resubmit/approve; unpublish/publish; sửa published về DRAFT; human review cần evidence preview riêng |
| 3.3.4 Class Unit release | Classes service/controller/DTO/release audit | Class/unit lock, assignment race, null/omitted/time bounds, completed/cancelled, audit rollback | Admin/Mentor OPEN/LOCKED/lịch; release hai lớp độc lập, không ảnh hưởng Material/enrollment; conflict completed |
| 3.3.5 Acceptance/handoff | Full regressions; Swagger/Postman/DBML/flow/progress; providers/fixtures3.4 và handoff deploy cho user | pnpm check + test:http + test:files, no critical skips; migration gate | Workflow3.2→3.3 cả3 loại + preview review; ghi release SHA/migration IDs/cases/results; user deploy/nghiệm thu, nhóm FE tích hợp riêng |

Mỗi slice gồm migration/service/API/tests/docs phù hợp, build reviewable trước
rollout. Khi deploy: backup DB, migrations additive, deploy app, health/auth smoke,
chạy cases slice, ghi evidence riêng. Sau mỗi slice cập nhật plan/progress/flow/API;
không ghi server pass khi chỉ local pass.

Thứ tự chung A–E và API preview/asset đề xuất nằm ở [plan3.4](PHASE_3_4_MATERIAL_ACCESS_PREVIEW.md).
3.3.1 sở hữu migration/entity/typed policy/refs;3.4 sở hữu readers/access consumers.
Một người sửa schema/policy chung tại một thời điểm, bàn giao nullable primary,
canonical HTML/refs và fixtures trước merge reader. Không tạo thêm bảng materials3.4.
Student reader/assets có thể phát triển bằng fixtures sau3.3.1; server happy path
phải có approve/publication3.3.3 và release3.3.4 thực sự.

Ước lượng **7–10 ngày công BE**, provisional:3.3.1 2,5–3,5;3.3.2 1–1,5;
3.3.3 1–1,5;3.3.4 0,5–1;3.3.5 1–1,5. Chốt lại sau spike sanitizer/batch locks.
Bao gồm tài liệu/checks và chuẩn bị acceptance; chưa tính chờ môi trường/user,
FE hoặc signed GET/video playback3.4. Preview phối hợp vẫn tính effort3.4 riêng;
không cộng chồng hoặc suy ra thời gian lịch giảm một nửa khi một người làm cả hai.
Estimate5–7 ngày bản file-only đã thay thế.

## 8. Test matrix và Definition of Done

| Nhóm | Ca bắt buộc |
|---|---|
| Typed content/sanitize | ARTICLE text-only/image-only, empty after sanitize, XSS/unsafe URLs/attrs, canonical output, depth/nodes/UTF-8/JSON limits, FILE/VIDEO mismatch, immutable contentType |
| Reference | Missing/foreign/FAILED file, inline IMAGE only, count/unique bounds, owner/assignment, primary/attachment duplicate, two Materials share file, metadata FAILED nhưng binary READY |
| RBAC/scope | Anonymous401, Admin/Student denied, inactive actor, Origin; wrong unit/session/provenance; assignment revoke/cancel/role race |
| Review/retry | Rejected→EDIT→submit, pending Mentor cannot edit, firstApprovedAt, all edits revoke publish; approve/approve, approve/reject, PATCH/review, DELETE/review, no duplicate audit |
| Transaction/DB | Audit failure rollback state/refs, SQL constraints/parent mutation/file state protection, reversed file swaps/multi-class refs lock order |
| Read/release | Summary không HTML, own reason only, visibility trước total/page, safe batched summaries; LOCKED/OPEN future/exact boundary/null/omitted; release audit rollback |
| Regression | Files3.2/auth/classes/My Classes/schedule/CASH/PayOS/mail; boot/metadata khi MinIO disabled; migrations dedicated DB |

Chạy pnpm check, pnpm test:http, pnpm test:files khi implement, dedicated DB *_test
và bucket fixture riêng; báo suites/tests/skips thực tế. Có MinIO thật cho
READY→Material happy path; tests phối hợp preview3.4 có signed GET riêng. Student pending/locked
body/assets leak và video Range/seek/expiry là runtime acceptance **3.4**.

- [x] 3.2 nghiệm thu xong; plan ARTICLE/FILE/VIDEO thống nhất, flow/API/progress đồng bộ.
- [ ] Typed domain/sanitizer/schema/refs/audits/lock protocol và migration SQL được review/test.
- [ ] Manager/Mentor APIs + release chạy đúng quyền/revision/visibility, full local gates pass.
- [ ] Review3.3.3 + staff preview/assets3.4 nghiệm thu cùng mốc; evidence API và human/browser review ghi riêng.
- [ ] Mỗi slice có server evidence riêng; không skip critical cases hoặc claim binary review từ metadata tests.
- [ ] Swagger/Postman/DBML/API breakdown phản ánh source thực; user nghiệm thu3.3.
- [ ] Bàn giao3.4 typed read view/verified refs/policy/release/fixtures/error contracts.

3.4 tái dùng signed GET FILE/VIDEO đã có, mở rộng staff preview và scoped assets
đúng verified version, TTL<=60s/no-store; recheck quyền/revision/ref khi refresh URL.
fileId của asset phải thuộc Material. MP4 kiểm Range206/seek/expiry/refresh
giữ play state và ingress cap thực tế theo runbook3.2. 3.5 dùng primary FK +
reference table + soft-delete/audit để không purge binary còn reference.
Lượt này chỉ lập plan; chưa migration/source/FE/runtime tests/deploy3.3.

## 9. Điều phối planning — 2026-10-13

Theo user, 3.3–3.6 do người khác triển khai; user nhận deploy/server acceptance,
FE do nhóm riêng. Thêm plan3.4 phối hợp và đưa preview/asset access vào mốc
review3.3.3; Student ARTICLE consumer sau typed contract3.3.1, server journey
sau approve/release. Chỉ cập nhật tài liệu, không sửa source/FE, migrate hoặc deploy.
