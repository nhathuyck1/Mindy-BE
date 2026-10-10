# Phase 3.1 — Planning quyền tài liệu và contract

Ngày lập/cập nhật: **2026-10-09**. Trạng thái: **D1–D6 đã duyệt; role, policy
và public context providers đã triển khai/test local. Chưa triển khai 3.2**.
Plan tổng: [Phase 3](./PHASE_3_FILES_MATERIALS.md).
Tiến độ: [Phase 3.1](../progress/PHASE_3_1_PROGRESS.md).

## 1. Mục tiêu và phạm vi

Chốt mô hình tài liệu chính của Course Unit, quyền upload/quản lý/đọc,
contract API/DTO, giới hạn file và biên module trước khi code. User đã duyệt
D1–D6 và yêu cầu hoàn thiện 3.1 trước 3.2. Đã triển khai role/migration,
domain policy/state transitions, facade truy vấn quyền thật và regression tests.
Chưa triển khai upload/storage hoặc HTTP CRUD/review/persistence của 3.2–3.3.

Sau duyệt, 3.1 ghi quyết định và đồng bộ tài liệu nghiệp vụ/contract. API,
migration, storage, worker và test runtime thực hiện ở 3.2–3.6 tương ứng.
Không triển khai assignment, Q&A, student code, attendance hoặc chat trong 3.1.

## 2. Quan hệ đã được user xác nhận và DBML

**Material là tài liệu chính của Course Unit. Course Unit 1–N Material.**

DBML hiện có:

- `materials.course_unit_id uuid [not null]` tại
  [bảng materials](../../document/mindy_center_full.dbml), dòng 607–619.
- `Ref: materials.course_unit_id > course_units.id` tại
  [quan hệ FK](../../document/mindy_center_full.dbml), dòng 984.
- Index `(course_unit_id, sort_order)`; không có bảng nối Course Unit–Material.
- `class_units.course_unit_id` tham chiếu Course Unit; Session thuộc Class Unit.

```text
Course Unit 1 ── N Material (tài liệu chính)
Course Unit 1 ── N Class Unit
Class Unit  1 ── N Session
File Object 1 ── N Material reference
```

Mỗi Material bắt buộc thuộc đúng một Course Unit. Giữ `course_unit_id NOT NULL`;
không thêm nhánh sở hữu `class_unit_id`, không dùng ba scope độc lập.

User chọn phương án 1: Material luôn thuộc Unit, có thể thêm sessionId để chỉ định
buổi học. Với clarification mới, Unit ở đây là **Course Unit**. Nếu bổ sung
`class_session_id`, đây chỉ là liên kết sử dụng tùy chọn, không đổi ownership và
không biến tài liệu chính thành tài liệu riêng của lớp. Session phải đi qua
Class Unit tham chiếu đúng Course Unit của Material. Material không cần Session
để tồn tại, công bố hoặc được Student đọc qua Course Unit của lớp.

Ảnh tham chiếu giải thích Session theo dõi công việc riêng của lớp: assignment,
Q&A, code của Student. Những phần này giữ quan hệ và policy riêng ở phase sau;
không suy ra ownership Material từ ownership assignment/Session.

## 3. Các quyết định D1–D6 đã được duyệt

| Mã | Thiết kế | Trạng thái |
|---|---|---|
| D1 | Course Unit 1–N Material; tài liệu chính, course_unit_id bắt buộc. Session chỉ là liên kết sử dụng tùy chọn, không phải owner. | User xác nhận. |
| D2 | Role MANAGER quản lý/sửa/duyệt tài liệu chính; Mentor được gán lớp có Course Unit được upload và gửi chờ Manager duyệt. Mentor không tự approve/publish hoặc sửa tài liệu đã duyệt. | User duyệt 2026-10-09. |
| D3 | Student ACTIVE đọc khi Class không hủy, Class Unit mở và đến unlockAt, Material được Manager duyệt/công bố và đến availableAt, file READY. | User duyệt. |
| D4 | Các lớp tham chiếu cùng Course Unit đọc chung tài liệu chính; không copy Material khi tạo Class. Manager sửa có tác động các lớp tham chiếu. | User duyệt. |
| D5 | Không tự mở entitlement cho enrollment COMPLETED; Class COMPLETED vẫn đọc nếu enrollment ACTIVE và các gate khác đạt. | User duyệt. |
| D6 | MVP file-only; chưa thêm external link, snapshot nội dung, streaming/transcoding hay thực thi source code. | User duyệt MVP. |

MANAGER là role riêng, không alias ADMIN. Admin vẫn sở hữu quản trị tài khoản,
Course/Class/payment theo baseline; tài liệu chính được giao Manager. Role
MANAGER không tự có quyền quản trị users/payment hoặc xác nhận CASH. Public
registration vẫn tạo STUDENT; Admin tạo Manager qua POST /admin/users.

### Luồng Mentor upload → Manager duyệt (thiết kế cho 3.2–3.3)

1. Mentor đang được phân công chọn Class Unit; backend resolve Course Unit tương
   ứng, kiểm assignment/ancestry trước khi cấp intent. Material owner vẫn Course Unit.
2. Upload/validation tạo file READY. READY không phải phê duyệt nội dung.
3. Mentor tạo draft của mình với file READY; submit chuyển PENDING_REVIEW.
   Chỉ Manager thấy hàng chờ toàn bộ; Mentor thấy draft/review của mình và tài liệu
   đã công bố trong lớp được gán, không đọc draft của mentor khác.
4. Manager approve/reject, ghi reviewedBy/reviewedAt/rejectionReason/revision.
   MVP approve đồng thời công bố; reject không công bố và cần lý do.
5. Mentor sửa draft/rejected của mình và submit lại. PENDING_REVIEW không cho
   sửa payload; APPROVED không cho Mentor sửa/xóa/unpublish. Mentor mất assignment
   mất quyền thao tác pending upload/draft, Manager vẫn xử lý được.
6. Manager upload trực tiếp tạo draft; tự approve/publish bằng thao tác tường minh
   có audit. Sửa file/nội dung Material đã công bố đưa về draft, xóa publishedAt
   và approval cũ; duyệt lại trước khi Student đọc phiên bản mới. MVP không giữ
   phiên bản công bố cũ trong lúc duyệt bản mới.

State đề xuất: DRAFT → PENDING_REVIEW → APPROVED/REJECTED; REJECTED → DRAFT.
File lifecycle và review lifecycle là hai state riêng. Publish chỉ khi APPROVED
đúng revision; unpublish giữ approval nếu nội dung không đổi. Review/PATCH khóa
row hoặc dùng expectedRevision; approve payload đã thay đổi trả 409. Approve
lặp cùng revision không tạo audit trùng/reset publishedAt. Manager không approve
file chưa READY, thiếu ancestry hoặc material đã bị xóa.

`sessionId` không được dùng làm bộ lọc để giấu tài liệu chính khỏi lớp khác cùng
Course Unit. Nếu cần tài liệu riêng từng buổi/lớp, phải có yêu cầu và policy riêng;
không tự thêm vào mô hình Material chính trong lượt này.

## 4. Schema đề xuất và invariant

- Giữ bảng `materials`: id, course_unit_id, file_object_id, title, sort_order,
  created_by, created_at; mỗi row có đúng một Course Unit owner.
- Thêm description, available_at, published_at, updated_at/updated_by,
  deleted_at/deleted_by để draft/release/soft delete/audit khi làm 3.3.
- Review fields: review_status, revision, approved_revision, reviewed_by,
  reviewed_at, rejection_reason; audit submission/review/change, không lộ lý do
  reject hoặc draft cho Student. Phê duyệt gắn với nội dung/revision đã review.
- Contract thêm `first_approved_at` và `created_in_class_id`: mốc từng được duyệt
  và provenance lớp khi Mentor tạo draft; không phải owner hay quyền riêng của lớp.
  Giữ first_approved_at sau Manager edit để Mentor không lấy lại quyền sửa bản đã
  từng duyệt khi status quay về DRAFT. Hai field này chưa có migration Materials.
- `class_session_id` nullable là mở rộng tùy chọn đã chọn, DBML hiện chưa có;
  việc đưa field này vào migration cần ghi rõ đó là association, không scope.
- Khi có Session, kiểm `session.class_unit.course_unit_id = material.course_unit_id`.
  Application kiểm trong transaction; migration phải có bảo vệ DB phù hợp
  (constraint trigger cho quan hệ qua nhiều bảng, hoặc mô hình association được
  review trước khi thực thi). Không ghi một FK đơn là đã bảo đảm ancestry này.
- Không PATCH đổi Course Unit owner. Session link không cấp quyền đọc hay sửa.
- Gắn file phải READY và thuộc intent Course Unit được người thao tác quản lý;
  khóa file row khi attach/delete. Không gắn file bất kỳ chỉ vì biết fileId.
- FK `RESTRICT`, size >= 0, index material `(course_unit_id, sort_order, id)` và
  lọc soft delete; sortOrder không unique, tie-break id.
- Migration files/metadata/jobs ở 3.2; migration materials ở 3.3. Không sửa
  migration đã chạy; `synchronize=false`. DBML chưa thay đổi trong lượt planning.

## 5. Policy đọc và release

```text
canRead = active authenticated user
  AND enrollment ACTIVE của student trong classId
  AND Class.status != CANCELLED
  AND Class Unit thuộc classId
  AND Class Unit.courseUnitId = Material.courseUnitId
  AND Class Unit.status IN (OPEN, COMPLETED)
  AND (unlockAt IS NULL OR unlockAt <= serverNow)
  AND Material.publishedAt IS NOT NULL AND Material.deletedAt IS NULL
  AND Material.reviewStatus = APPROVED
  AND Material.approvedRevision = Material.revision
  AND (availableAt IS NULL OR availableAt <= serverNow)
  AND File.status = READY
```

Giờ server, lưu timestamptz, API ISO 8601; đúng mốc thời gian được đọc. LOCKED
luôn chặn; OPEN + unlockAt tương lai mở theo giờ mà không cần worker đổi status.
Session bị hủy không thu hồi tài liệu chính của Course Unit; liên kết sử dụng
không thay quyền Course Unit. Không suy quyền từ progress, accessMode trên FE,
file ownership hoặc thời điểm Session bắt đầu.

CASH/PayOS pending không có materials/download URL. Enrollment CANCELLED hoặc
COMPLETED không tự có quyền. Manager preview draft/locked để review; Mentor đọc
tài liệu công bố theo lớp và preview draft do mình tạo khi còn assignment.
Mentor assignment hiện tại khác snapshot xác nhận CASH; giữ payment baseline.

Release API nhận LOCKED/OPEN và unlockAt; không ghi progress/COMPLETED.
Đề xuất Unit COMPLETED trả 409 khi gọi release, chờ use case mở lại riêng.

## 6. Module và phối hợp Phase 2.3

```text
FilesModule     → CatalogModule, ClassesModule, AuthModule
MaterialsModule → FilesModule, CatalogModule, ClassesModule, EnrollmentsModule, AuthModule
ClassesModule   → CatalogModule, EnrollmentsModule (giữ chiều hiện tại)
```

Files sở hữu file/metadata/job/storage, kiểm quyền Manager hoặc Mentor assignment
với Course Unit. Materials sở hữu reference/review/publish/access, route
manager/mentor/student; Classes sở hữu release
Unit và provider context. Không import ngược Materials từ Catalog/Classes,
không đọc repository private xuyên module hoặc dùng forwardRef để che cycle.

| Provider | Contract dự kiến |
|---|---|
| Catalog read | Resolve Course Unit → `{ courseUnitId, courseId }`; public method rõ kiểu trên CoursesService hoặc provider riêng. |
| Classes content context | Resolve classId/classUnitId, trả `{ classId, mentorId, classStatus, classUnitId, courseUnitId, unitStatus, unlockAt }`; nếu context là Session phải resolve qua Class Unit. Sai ancestry trả 404. |
| EnrollmentsService | Tái dùng `hasActiveAccess(studentId, classId, manager?)`, không sửa settlement. |
| Material access evaluator | Principal + context + material/file view + entitlement + serverNow → allow/deny; độc lập HTTP/entity/storage. |
| Files reference provider | Assert READY/owner/intent Course Unit dưới transaction/row lock; không expose repository. |

Đã có `classes/services/class-content-context.service.ts`,
`materials/domain/material-access.ts`, `material-review.ts`, `material-contract.ts`,
`material-file-policy.ts` và `materials/services/material-policy.service.ts`.
MaterialsModule đăng ký/export policy trong app, chưa có entity/controller.
Catalog export `CoursesService.getUnitContext()`; Classes export getUnit/
getCourseUnitInClass/getSession; facade dùng EnrollmentsService và UsersService
kiểm ACTIVE/role hiện tại. Giao tiếp module không cần private repository/entity.

Files service/adapter và Materials CRUD/read controllers/persistence là các slice
sau. Không tạo DTO/controller giả rồi công bố là route đã chạy. HTTP DTO ở mục 7
là contract; snapshot/file reference truyền vào policy phải do server resolve,
không bind trực tiếp JSON client. Principal phải đi qua auth/session guard khi có API.

Phase 2.3 cung cấp navigation classId/classUnitId/sessionId. P3 tự resolve quyền;
FULL của 2.3 không bảo đảm Material đã mở. CASH preview không thêm nội dung/file.
P3 sở hữu Files/Materials/migration; phối hợp người làm 2.3 trước khi sửa Classes.
Reviewer migration cụ thể cần chỉ định trước merge.

## 7. Contract HTTP/DTO dự kiến

Prefix `/api/v1`, UUID v4, cookie auth/active-user/role, Origin/CSRF theo baseline.
List `{ items, page, pageSize, total }`; page từ 1, pageSize default 20/max 100;
sort `(sortOrder ASC, id ASC)`, lọc visibility trước pagination/count.

| API | Semantics |
|---|---|
| POST `/files/upload-intents` | Manager hoặc Mentor có assignment; `{ courseUnitId, classId?, classUnitId?, originalFilename, declaredMimeType, declaredSizeBytes }`; Mentor bắt buộc có class context đúng Course Unit. 201 `{ fileId, uploadUrl, requiredHeaders, uploadUrlExpiresAt, intentExpiresAt }`. |
| POST `/files/:fileId/complete` | Owner còn quyền hoặc Manager; 202 processing, lặp READY trả 200; không nhận bucket/key/client checksum xác nhận. FAILED/DELETED/expired trả 409. |
| GET `/files/:fileId` | Owner còn quyền hoặc Manager; status/verified metadata/errorCode; không trả key/version/storage secret. |
| DELETE `/files/:fileId` | 202 tombstone/purge; còn reference 409; lặp DELETED idempotent. |
| GET/POST `/manager/course-units/:courseUnitId/materials` | Manager quản trị tài liệu chính; create 201 draft với fileId/title/description?/sortOrder?/availableAt?/sessionId?. |
| PATCH/DELETE `/manager/materials/:materialId` | Metadata/file reference, không đổi Course Unit; sửa nội dung thu hồi approval/publication. DELETE soft delete 204. |
| GET `/manager/materials?reviewStatus=PENDING_REVIEW` | Hàng chờ phân trang theo createdAt/id; có Course Unit và submitter context, không trả signed URL. |
| POST `/manager/materials/:materialId/approve` hoặc `/reject` | expectedRevision bắt buộc; reject thêm reason. Approve công bố, reject không công bố; 200 DTO, stale review 409. |
| POST `/manager/materials/:materialId/publish` hoặc `/unpublish` | Publish chỉ APPROVED đúng revision; idempotent, không reset publishedAt khi lặp. |
| GET/POST `/mentor/classes/:classId/units/:unitId/materials` | Mentor được gán đọc published + draft của mình; create draft với Course Unit owner. |
| PATCH/DELETE `/mentor/classes/:classId/materials/:materialId` | Chỉ draft/rejected do mình tạo và còn assignment; không sửa/xóa approved hoặc pending review. |
| POST `/mentor/classes/:classId/materials/:materialId/submit` | Chỉ draft của mình, file READY; 200 PENDING_REVIEW, lặp cùng revision idempotent. |
| PATCH `/admin/classes/:classId/units/:unitId/release` và `/mentor/classes/:classId/units/:unitId/release` | Đề xuất Admin/Mentor đúng lớp; `{ status: LOCKED/OPEN, unlockAt?: ISO/null }`; omitted giữ giờ cũ, null xóa lịch. |
| GET `/me/classes/:classId/units/:unitId/materials` | Student ACTIVE, đọc Material chính của Course Unit tương ứng qua policy. |
| POST `/me/classes/:classId/materials/:materialId/download` | Resolve Class Unit tham chiếu Course Unit, kiểm policy lại; 200 `{ url, expiresAt }`, Cache-Control no-store. |
| POST `/manager/materials/:materialId/download` hoặc `/mentor/classes/:classId/materials/:materialId/download` | Manager review preview; Mentor published hoặc draft của mình, phải còn assignment đúng Course Unit. |

Không tạo CRUD material với Class Unit/Session là owner. Giao diện Session có thể
resolve Course Unit rồi dùng API Unit để hiển thị tài liệu chính; không cần list
material riêng của Session cho MVP.

Material DTO: id, courseUnitId, title, description, sortOrder, availableAt,
publishedAt, optional sessionId và file summary
`{ id, originalFilename, mimeType, kind, sizeBytes }`. Quản trị thêm audit/canEdit;
Student không nhận draft/deleted hoặc signed URL trong list. Manager/Mentor DTO
thêm reviewStatus/revision/review audit theo quyền; Student chỉ nhận bản APPROVED.
Filename/title tối đa 250 ký tự, description 5.000, sortOrder integer >= 0;
sizeBytes JSON number nguyên an toàn, kiểm range khi chuyển bigint. PATCH cần
ít nhất một field; field lạ bị từ chối.

Error envelope `{ statusCode, code, message, details?, requestId? }`:
400 JSON hỏng; **422 DTO/UUID/size/type không hợp lệ theo ValidationPipe hiện có**;
401 unauthenticated; 403 role/assignment/entitlement; 404 missing/sai ancestry/
hidden material; 409 FILE_NOT_READY/FILE_IN_USE/UPLOAD_EXPIRED/UPLOAD_FAILED/
UNIT_RELEASE_CONFLICT/MATERIAL_REVIEW_CONFLICT; 503 FILE_STORAGE_DISABLED/FILE_STORAGE_UNAVAILABLE.
Unit locked/future list trả 200 rỗng sau entitlement/ancestry; hidden download 404.

## 8. Upload/storage/limits đề xuất

- PDF, PNG/JPEG, DOCX/PPTX/XLSX, MP3: 25 MiB/file; MP4: 200 MiB/file.
- Source UTF-8: .txt/.md/.csv/.json/.js/.ts/.py/.java/.c/.cpp/.h/.css/.sql,
  25 MiB/file; không thực thi. Không nhận executable, HTML/SVG/generic archive.
- Size > 0; PUT TTL 600s, intent TTL 1.800s, GET TTL tối đa 60s.
- Kiểm actual size/MIME/signature/container/text/SHA-256; không tin HEAD/ETag hoặc
  Content-Type là đủ. Office phải kiểm đúng loại ZIP container.
- Lifecycle PENDING_UPLOAD → PROCESSING → READY/FAILED, DELETED tombstone;
  READY là binary đã xác minh, metadata FAILED không thu hồi file READY.
- Complete enqueue DB job idempotent; worker copy staging → final riêng, validate
  đúng object version, commit theo lease token; download đúng version đã xác minh.
  Không cấp PUT final, không gọi MinIO trong transaction PostgreSQL.
- Private bucket/versioning, internal/public endpoint tách biệt, HTTPS staging,
  CORS giới hạn origins/headers. Domain thực chưa có, không tự đặt.
- Giữ MINIO_ENABLED; thêm file limits/TTL/job/cleanup config khi làm 3.2/3.5.
  Feature tắt không phá auth/catalog/payment.
- Worker defaults đề xuất poll 5s/concurrency 2/lease 300s/heartbeat 30s/5 attempts
  cho lỗi tạm thời; invalid payload fail ngay. Extraction timeout 120s, scratch
  512 MiB/worker, output 1 MiB/job; stream video, không dùng /tmp 64 MiB để chứa
  file lớn. CPU/memory chốt qua test 3.5 trước rollout.
- Cleanup grace 1h sau intent/lease, material retention 30 ngày chờ duyệt;
  không purge file còn reference. Soft-deleted material vẫn giữ FK tới retention.
- URL đã cấp còn hiệu lực đến TTL dù unpublish/lock; chặn URL mới ngay.

## 9. Ma trận nghiệm thu dự kiến

| Ca | Kết quả |
|---|---|
| Một Course Unit có nhiều Material | Nhiều row cùng course_unit_id; mỗi row có đúng một Course Unit owner. |
| Hai lớp cùng Course Unit | Đọc chung tài liệu chính nhưng kiểm entitlement/release riêng của từng lớp. |
| Session link thuộc Course Unit khác | Từ chối; link không làm thay ownership hoặc cấp quyền. |
| Session bị hủy | Không tự mất quyền tài liệu chính ở Unit; công việc riêng Session có policy riêng. |
| Mentor upload đúng/sai lớp | Đúng lớp tạo draft; sai lớp bị chặn, không tự approve/publish. |
| File READY, material PENDING_REVIEW/REJECTED | Student không nhận material hoặc URL. |
| Manager approve hoặc sửa material APPROVED | Approve đúng revision mở nội dung theo D3; sửa thu hồi approval cho đến duyệt lại. |
| Hai Manager review đồng thời/PATCH đua approve | Không công bố revision chưa review; stale revision trả 409. |
| ACTIVE/open/published/đến giờ/READY | List và download đúng binary/version. |
| Pending CASH/PayOS, cancelled/completed enrollment | Không materials/URL, kể cả đoán ID. |
| Locked/future/draft/deleted, Class cancelled | Không cấp nội dung/URL. |
| PUT staging lại, complete lặp, worker lease hết hạn | Không đổi version READY hoặc nhân job; phục hồi/retry hữu hạn. |
| Attach đua delete, file shared/preview reference | Row lock/FK bảo vệ; FILE_IN_USE. |
| Metadata failure, MinIO outage | Metadata fail giữ READY, outage retry có giới hạn. |

Ca trên là tiêu chí test cho 3.2–3.6, chưa phải evidence pass. Migration clean DB
+ up/down/up, DB/MinIO real-test riêng, pnpm check và HTTP gate khi triển khai;
không skip critical suites hoặc coi payment live đã pass nhờ test fixture.

## 10. Gate 3.1 và bước tiếp theo

- [x] Course Unit 1–N Material, tài liệu chính theo DBML/user.
- [x] Lựa chọn 1: Session link tùy chọn, không thay Course Unit owner.
- [x] User duyệt Manager quản lý, Mentor upload chờ duyệt (D2), release/ACTIVE/shared live (D3–D5).
- [x] User chọn phạm vi MVP (D6).
- [x] Role MANAGER bổ sung qua enum/migration mới; Admin tạo account qua API hiện có.
- [x] D1–D6 có policy/types/error/transition trong source, provider ancestry/entitlement dùng được.
- [x] Domain và PostgreSQL tests cho access/review/role/assignment/shared/time/MVP; full local gates pass.
- [x] Đồng bộ tài liệu nghiệp vụ/plan tổng theo scope 3.1.

3.1 hoàn tất phần policy/contract local, evidence tại progress riêng. Các gate
chuyển sang slice sau: upload/validation/storage (3.2), CRUD/review persistence
với row lock/audit (3.3), Student list/download HTTP (3.4). Domain transition
không tự ghi DB hoặc chứng minh concurrency review đã nghiệm thu. Reviewer migration
Materials cần chỉ định trước merge migration đó. Chưa có evidence storage/live.
