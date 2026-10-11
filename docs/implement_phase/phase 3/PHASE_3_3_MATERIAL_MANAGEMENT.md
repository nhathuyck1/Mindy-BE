# Phase 3.3 — Material management, review và Class Unit release

Cập nhật: **2026-10-11**. **Kế hoạch, chưa triển khai**.
User xác nhận 3.1/3.2 đã xong; không còn gate chờ policy/upload.

- Baseline: [3.1 policy/contract](PHASE_3_1_POLICY_CONTRACT.md),
  [3.2 upload](PHASE_3_2_SAFE_UPLOAD.md).
- Theo dõi: [progress 3.3](../../progress/phase%203/PHASE_3_3_PROGRESS.md).
- Hành trình: [flow 3.3](../../api_flow/PHASE_3_3_FLOW.md),
  [API breakdown dự kiến](../../api_flow/PHASE_3_3_flow-api-breakdown.md).

## 1. Kết quả cần đạt và phạm vi

Manager/Mentor dùng `fileId` READY từ 3.2 để tạo Material của Course Unit.
Mentor sửa draft của mình → submit; Manager đọc thông tin, approve/reject,
sửa/công bố/ngừng công bố/xóa mềm. Admin hoặc Mentor đúng assignment thay
LOCKED/OPEN và lịch unlock của Class Unit. Mọi thay đổi có transaction/audit,
không thể công bố revision chưa được duyệt.

Giữ D1–D6 đã duyệt: Course Unit **1–N Material**, shared live giữa lớp; Session
link tùy chọn chỉ chỉ định sử dụng. Material không thuộc Class Unit/Session.
MANAGER quản lý Materials; ADMIN không được kế thừa quyền đó. Mentor không được
approve/publish và không lấy lại quyền sửa Material đã từng được duyệt.

Trong 3.3 có persistence, CRUD/review/publication, context đọc cho Mentor,
release Class Unit, Swagger/Postman, DB/HTTP tests và bàn giao access view.
Student list/download và URL preview Manager/Mentor triển khai ở **3.4** để dùng
chung cơ chế ký GET đúng version. 3.3 nghiệm thu workflow trạng thái/metadata;
nghiệm thu Manager thực sự mở binary để duyệt nội dung cần 3.4. Không dùng upload
PUT hoặc `/files/:fileId` làm download tạm.

Metadata extraction/cleanup/purge ở 3.5; FE UI và staging/VPS/full journey ở 3.6.
Không thêm external link, material snapshot, assignment, chat, compiler hoặc
COMPLETED enrollment entitlement. CASH preview/mentor confirmation, verified
PayOS settlement, holds và mail outbox giữ nguyên.

## 2. Baseline đã đối chiếu source

| Có sẵn | Cách tái dùng / khoảng trống |
|---|---|
| `MaterialPolicyService.createDraft/applyCommand/canRead/canPreview` | Tái dùng facade/domain; snapshot phải lấy từ DB, không nhận JSON snapshot của client. `actor()` hiện chưa nhận transaction manager: sửa để dùng cùng manager ở mutation. |
| `material-review.ts` | Có CREATE/EDIT/SUBMIT/APPROVE/REJECT/PUBLISH/UNPUBLISH/DELETE và audit output; chưa lưu DB, chưa chứng minh review race. |
| `FilesService.assertReadyReference(principal, fileId, courseUnitId, manager)` | Đã khóa file, kiểm READY/owner/scope/current assignment và trả verified summary. Không gọi MinIO; dùng trong transaction caller. |
| `ClassContentContextService` | Có getUnit/getCourseUnitInClass/getSession và lockContentClass; ClassesService đổi assignment/cancel dưới class lock. Chưa có release HTTP. |
| `EnrollmentsService.hasActiveAccess` | Giữ nguyên ACTIVE; consumer Student ở 3.4. |
| Mentor roster `GET /mentor/classes` | Có classId; chưa có read API đầy đủ classUnitId → courseUnitId/sessionId cho picker. Bổ sung context ở Classes, giữ nguyên roster DTO. |
| FileStorage | Chỉ presignPut/head/copy/read, chưa presignGet. Không ghi preview/download là có sẵn. |
| Schema | Migration hiện tại chưa tạo materials; DBML materials chỉ là thiết kế, thiếu review/revision/release/audit fields. |

Evidence cũ: 3.1 full local 171 tests/16 suites + HTTP 5/5; 3.2 full 217,
focused Files 42/42 + HTTP 19/19. Sau ghép 2.3, progress tổng ghi full 243/243,
HTTP 20/20 ngày 2026-10-10. Đây là kết quả đã ghi, **không chạy lại ở lượt plan**.
Không suy ra migrations dev/VPS, storage browser hoặc payment live đã nghiệm thu.

## 3. Quyền và state transition phải giữ

| Actor/action | Điều kiện và kết quả |
|---|---|
| Manager create | Course Unit tồn tại, file READY đúng Course Unit; có thể tiếp quản file Mentor dù Mentor mất assignment. Tạo DRAFT revision 1, CREATE audit. |
| Mentor create | Active role, lớp chưa CANCELLED, đang assigned; unit/session ancestry đúng; file của mình còn đủ upload scope. Ghi createdInClassId nhưng owner vẫn Course Unit. |
| Mentor edit/delete | createdBy chính mình + createdInClassId đúng lớp hiện tại + còn assignment + firstApprovedAt null + DRAFT/REJECTED. Không sửa PENDING_REVIEW. |
| EDIT bởi Manager | Được sửa pending/approved và các trạng thái còn sống. Bất kỳ PATCH hợp lệ, kể cả sortOrder/availableAt hoặc cùng giá trị, tăng revision; về DRAFT, xóa approval/publication/review hiện tại, giữ firstApprovedAt. |
| SUBMIT | DRAFT → PENDING_REVIEW, kiểm file READY; không tăng revision. Gọi lại khi pending cùng revision không tạo audit. REJECTED phải EDIT về DRAFT rồi submit. |
| APPROVE | Manager; PENDING_REVIEW hoặc DRAFT do Manager tạo. DRAFT Mentor chưa từng duyệt không được bỏ qua submit; sau firstApprovedAt, Manager có thể duyệt lại bản mình sửa theo domain 3.1. Ghi approvedRevision/reviewer/firstApprovedAt và publish cùng commit. |
| REJECT | Manager, PENDING_REVIEW; reason trim không rỗng/max 2.000. REJECTED, không approval/publication. Retry cùng reason/revision không tạo audit; khác reason trả 409. |
| PUBLISH/UNPUBLISH | Manager; publish chỉ APPROVED đúng revision/READY. Unpublish giữ approval; publish lại mở lại. Retry không reset publishedAt/không audit trùng. Retry APPROVE bản đã unpublish không tự publish lại. |
| DELETE | Soft delete, giữ file FK/audit, xóa publication. Retry hợp lệ cùng revision trả 204, không audit trùng; route tombstone vẫn kiểm quyền. |

`expectedRevision` bắt buộc với PATCH, DELETE và mọi command; create không có.
EDIT tăng revision, các command khác giữ revision theo baseline. Revision kiểm
nội dung, không phải version cho toàn bộ state; sau mất response FE refetch state
trước quyết định tiếp. Hai approve cùng revision được idempotent; approve/reject
đua nhau chỉ một decision thành công, request còn lại 409. Manager A edit làm
Manager B đang review revision cũ bị 409.

Manager cần item detail để refetch, Mentor dùng item detail trong class context.
GET không expose tombstone. Trước pagination/count lọc visibility: Manager thấy
mọi Material còn sống; Mentor thấy Material chính APPROVED/published và submission
chưa từng duyệt của mình trong đúng lớp. Mentor thấy own PENDING/REJECTED để theo
dõi nhưng không thấy draft Mentor khác. Không áp Student release/availableAt cho
Mentor preview metadata; dùng đúng `canPreviewMaterial` baseline.

## 4. Schema và bảo vệ database dự kiến

Migration additive mới cho `materials` + `material_audit_events`; đăng ký entity
vào TypeORM/module/data source theo convention. Không sửa migration deployed.
Codex tạo migration; human reviewer SQL chỉ định trước merge theo repo rule,
không phải gate chặn lập plan hoặc code local.

`materials`:

- UUID v4; `course_unit_id`, `file_object_id`, `created_by` NOT NULL/FK RESTRICT.
- `title varchar(250)`, `description text NULL` (CHECK <= 5.000),
  `sort_order integer >= 0`, `available_at timestamptz NULL`.
- `class_session_id NULL`, `created_in_class_id NULL`, FK RESTRICT.
  createdBy/createdInClassId/courseUnitId immutable; Mentor ghi provenance lúc create.
- `review_status` enum DRAFT/PENDING_REVIEW/APPROVED/REJECTED;
  `revision integer >= 1`, `approved_revision integer NULL`;
  `reviewed_by`, `reviewed_at`, `first_approved_at`, `rejection_reason` nullable.
- `published_at`, `deleted_at`, `deleted_by` nullable;
  createdAt/updatedAt + updatedBy; timestamp dùng timestamptz.
- CHECK APPROVED yêu cầu approvedRevision = revision, reviewer/time/firstApprovedAt;
  publication yêu cầu approval hiện hành. DRAFT/PENDING không review hiện tại;
  REJECTED có reviewer/time/reason và không approval/publication. Deleted không publication.
- firstApprovedAt không bị xóa/đổi sau lần duyệt đầu, kể cả Manager EDIT.
  Không dùng CHECK để so với thời gian hiện tại; release/time tính khi đọc.
- Partial index còn sống `(course_unit_id, sort_order, id)`;
  review queue `(review_status, created_at DESC, id ASC)`;
  own submissions `(created_by, created_in_class_id, review_status)`;
  index file FK/session FK. sortOrder không unique.

`material_audit_events`: UUID, materialId FK RESTRICT, actorId FK, action,
revision, occurredAt. Append-only qua service, action/revision bounds, index
`(material_id, occurred_at, id)`. Lưu reason/reviewer ở Material; không lưu signed
URLs/storage keys trong audit. Không unique `(materialId, action, revision)`:
publish → unpublish → publish cùng revision là ba thay đổi hợp lệ. Chống duplicate
retry bằng row lock + domain `audit === null`, không bằng constraint sai semantics.

Cross-table invariants không thể chỉ dùng FK đơn:

1. material.courseUnitId = file.courseUnitId và file READY lúc attach;
   application dùng Files public provider + file row lock. DB trigger kiểm scope/
   trạng thái attach và bảo vệ file reference khi cập nhật trạng thái trong tương lai.
2. Session link resolve qua session → classUnit → courseUnit phải khớp Material.
   Mentor session phải thuộc lớp provenance; Manager có thể gắn session một lớp
   khác cùng Course Unit. Link không lọc quyền/material list của lớp khác.
3. createdInClassId phải có Class Unit tham chiếu owner Course Unit.
   Bảo vệ ancestry cả INSERT/UPDATE Material lẫn thay đổi parent được phép.

Ở 3.3.1 chọn constraint triggers + row locks/public Classes provider cho ancestry;
SQL cụ thể phải review và test parent mutation/concurrent update. Không tuyên bố
FK đơn hoặc deferred trigger không khóa đã loại được race. Down/up ở DB test
riêng; rollback production giữ dữ liệu, không down bảng có Material/audit thật.
Soft-delete vẫn giữ reference: binary chưa được xóa, retention/purge để 3.5.

## 5. Transaction, locks và biên module

MaterialsModule sở hữu Material/audit, read/write services và controllers.
Materials → Files/Catalog/Classes/Users/Auth (Enrollments dùng policy hiện tại).
Classes sở hữu context picker/release; không import Materials ngược,
không dùng private repository xuyên module hoặc `forwardRef`.

Mutation chạy một DB transaction: load/lock Material (nếu đã tồn tại), resolve
actor hiện hành trong cùng EntityManager, lock reference/context, gọi policy,
save Material + audit atomic. Rollback audit lỗi phải rollback state.
Không bind file summary/actor/reviewer/revision state từ request; client chỉ gửi
fileId/expectedRevision và content được phép. Không gọi MinIO/SMTP trong transaction.

Thứ tự cần chốt tại 3.3.1 theo code 3.2: **Material → file rows (UUID tăng dần)
→ Class rows (UUID tăng dần)**; create bỏ Material lock. Files provider hiện khóa
file rồi khóa intent Class khi authorize, nên không khóa Class trước file.
Khi thay file hoặc file provenance khác lớp tạo Material, resolve đầy đủ file/Class
IDs qua public providers trước và giữ cùng thứ tự; bổ sung provider method cần
thiết mà không expose repository. Re-read scope dưới lock; retry hữu hạn lỗi
deadlock/serialization toàn transaction, không retry domain conflict.

Release/context mutations chỉ Class → Class Unit/Session, không truy ngược
Material/file. Review parent triggers/FK locks cùng order để tránh cycle; concurrency
tests là gate cho quyết định này, không chỉ kiểm read tuần tự. User disable/role
change và assignment revoke cần test; `MaterialPolicyService.actor()` phải nhận
manager và theo protocol khóa User hiện có nếu cần serialize role revoke.

Reads lấy file summary qua provider Files mới không áp upload-owner policy:
Manager/Mentor được đọc Material đã công bố do người khác upload khi Material
policy cho phép. Không gọi `assertReadyReference` cho list (nó khóa và dùng upload
scope); không yêu cầu MinIO đang bật để đọc metadata đã lưu. Query batched và
filter trước count/pagination, không N+1; predicate SQL đối chiếu domain policy.

## 6. API và context tối thiểu

Tất cả route dưới `/api/v1`, **đều dự kiến cho 3.3**. Chi tiết request/response,
quyền, lỗi và cách FE nối bước tại [breakdown](../../api_flow/PHASE_3_3_flow-api-breakdown.md).

| Nhóm | Routes |
|---|---|
| Manager | GET/POST `/manager/course-units/:courseUnitId/materials`; GET `/manager/materials`; GET/PATCH/DELETE `/manager/materials/:materialId`; POST `approve/reject/publish/unpublish` |
| Mentor | GET/POST `/mentor/classes/:classId/units/:unitId/materials`; GET/PATCH/DELETE `/mentor/classes/:classId/materials/:materialId`; POST `submit` |
| Context Mentor (Classes) | GET `/mentor/classes/:classId/units`; GET `/mentor/classes/:classId/units/:unitId/sessions`; paginated ID/title/status mapping đúng assignment |
| Release (Classes) | PATCH `/admin/classes/:classId/units/:unitId/release` và `/mentor/classes/:classId/units/:unitId/release` |

Manager có thể bắt đầu từ Course Unit UUID trong nguồn quản trị hoặc public
active Course detail. Public chỉ có Course active; chưa có Manager catalogue
picker cho mọi inactive Course, không mượn Admin session. UI toàn catalogue
inactive là integration gap cần giải quyết riêng trước rollout UI, không cần thêm
quyền CRUD Course cho Manager để implement Material API nhận UUID.

Release: `{ status: LOCKED|OPEN, unlockAt?: ISO8601|null }`; omitted giữ giờ cũ,
null xóa lịch, quá khứ hợp lệ; server time. Unit COMPLETED trả
`409 UNIT_RELEASE_CONFLICT`; Class CANCELLED cũng conflict. Class COMPLETED nhưng
unit chưa completed giữ gate bình thường theo 3.1; không sửa enrollment/progress.
Khóa Class và Unit trước read/update; hai release tuần tự, giá trị request cuối
được nhận thắng, retry cùng payload no-op. Audit release thuộc Classes, lưu actor,
before/after/status/time cùng transaction (bảng `class_unit_release_audit_events`
mới); không dùng material audit cho release. Manager không có release quyền Admin.

Input bounds: title không trắng/max 250, description max 5.000/null, sortOrder
0..2.147.483.647, expectedRevision 1..2.147.483.647; EDIT ở max revision trả 409.
Date phải ISO có timezone; UUID v4; field lạ 422. PATCH có >=1 content field ngoài
expectedRevision. Lists page>=1/pageSize default20/max100. No signed URL trong DTO.

Code drift cần ghi rõ: ValidationPipe body/query trả **422**, nhưng
`ParseUUIDPipe()` mặc định ở controller hiện tại trả **400** cho path lỗi.
Plan chọn giữ baseline 400 path, không ghi 422 mọi UUID như bảng cũ 3.1.
Auth cookie/access principal + RolesGuard. Source chưa có global Origin/CSRF
guard; không tuyên bố CORS đã bảo vệ CSRF. Rà soát và bổ sung Origin check cho
cookie-auth mutations mới, allowlist theo CORS_ORIGINS, fail closed; route mới
không chấp nhận thiếu/untrusted Origin. Không đổi callback PayOS/auth hiện có.

## 7. Thứ tự triển khai và gate

| Bước | Công việc từ DB/service tới API | Gate |
|---|---|---|
| 3.3.1 Manager draft slice | Review migration/material audit/ancestry/lock order; entity, file summary provider, create/list/detail/PATCH/soft delete Manager | Clean/up/down/up; attach READY đúng scope; concurrent attach/state; audit rollback; body/query/path status đúng source |
| 3.3.2 Mentor submission slice | Context unit/session picker thuộc Classes; list/detail/own draft edit/delete/submit; transactional actor/assignment checks | Lost assignment/cancel race; hidden draft không lọt count; wrong ancestry; rejected edit rồi resubmit; Files regression |
| 3.3.3 Manager review/publication slice | Queue filters/context; approve/reject/publish/unpublish đúng domain; safe DTO/canEdit; no-op retry audit | Hai Manager và PATCH/review race; firstApprovedAt không reset; own approved không lấy lại quyền sửa; file reference swap rollback |
| 3.3.4 Class Unit release slice | Admin/Mentor release service/controller/DTO + Classes audit; time semantics | Completed unit/cancelled class bị chặn; null/omitted/date bounds; lock/unlock không đổi payment/progress; assignment race |
| 3.3.5 Acceptance/handoff | Swagger/Postman/DBML/schema docs; API flow/progress; full local gates | Không skip critical DB/storage/HTTP; metadata flow READY→draft→submit→approve pass; snapshot/providers bàn giao 3.4 |

Mỗi bước có HTTP/DB test tương ứng, không đợi tạo toàn bộ entities rồi mới expose
API. Ước lượng **5–7 ngày công**: Manager persistence 1,5–2; Mentor/context 1–1,5;
review/races 1–1,5; release 0,5–1; full gates/docs 0,5–1. Chốt lại sau migration/
lock spike; không là cam kết lịch, chưa gồm FE, preview/download 3.4 hoặc VPS.

## 8. Test matrix và nghiệm thu

| Nhóm | Ca cần chứng minh |
|---|---|
| RBAC/actor | Manager/Mentor đúng scope; Admin/Student không Materials; anonymous 401; disabled/role-changed principal; Origin thiếu/sai |
| Scope | Course Unit khác/sai Class Unit/Session; session cùng Course Unit nhưng khác lớp; provenance bất biến; Mentor mất assignment/cancel sau upload |
| File reference | PENDING/PROCESSING/FAILED/DELETED bị chặn; foreign owner; Manager takeover; two Materials share file; file replacement atomic; metadata FAILED vẫn READY attach được |
| Review | Manager own draft approve; Mentor draft phải submit; rejected edit→resubmit; pending Mentor edit bị chặn; firstApprovedAt giữ qua Manager edit; all content edits revoke publication |
| Race/idempotency | approve/approve, approve/reject, PATCH/approve, submit/submit, DELETE/approve; no audit duplicate/no reset timestamps; repeated publish/unpublish cycles có audit đúng |
| Transaction/DB | audit insert rollback state; direct SQL invalid approval/scope/ancestry; parent mutation race; class revoke/file attach lock; reversed file swaps không deadlock vô hạn |
| Read | sort tie-break, page boundaries/total đúng visibility; không draft người khác/rejectionReason người khác/storage key/version/URL; bounded queries/N+1 |
| Release/time | LOCKED luôn chặn; OPEN với unlockAt future không tự đổi status; exact time boundary; omitted/null; completed unit conflict; không progress/enrollment side effect |
| Migration/regression | Clean migration + down/up; MINIO_ENABLED=false metadata APIs không phá boot; Files 3.2, auth, course/classes, My Classes/schedule, CASH/PayOS/mail suites |

Unit mở rộng domain khi có bounds/transition thay đổi cần thiết; PostgreSQL tests
cho persistence/constraints/locks/audit; built-app HTTP test cookie/roles/DTO/Origin/
routes/visibility. Upload fixture MinIO thật để tạo READY cho một happy path
3.2→3.3; fake storage không thay evidence đã có. Attachment đọc metadata không
cần MinIO network, không tạo signing trong test 3.3.

Khi implement chạy `pnpm check`, `pnpm test:http`, `pnpm test:files` trên dedicated
DB `_test` và bucket fixture riêng; clean migration/down/up ở DB riêng. Báo đúng
suites/tests/skips, prerequisites thiếu không tính pass; không reset dev/prod.
Không chạy lại BE tests chỉ để nghiệm thu lượt planning này.

## 9. Definition of done và bàn giao

- [x] Baseline 3.1/3.2 đã đạt; plan/code đã đối chiếu, không chờ upload policy.
- [ ] Material + audit/release audit migrations, entities/DBML, constraints và lock protocol có evidence.
- [ ] Manager CRUD/review/publication, Mentor picker/draft/submit và release routes chạy ở local.
- [ ] Expected revision, retries, assignment/approval races và visibility pagination pass.
- [ ] Không Student access/GET URL bypass; không đổi payment/CASH/mail/COMPLETED policy.
- [ ] Swagger/Postman, flow/breakdown/progress đồng bộ implementation thật.
- [ ] Full local gates/DB/MinIO/HTTP không skip critical suites; evidence deployment ghi riêng.

Bàn giao 3.4: Material immutable read view (content/review/revision/provenance/
publication/deletion + verified file summary), safe read provider, class release
API, actual DTO/error contract và fixtures. 3.4 bổ sung Student list/download cùng
Manager/Mentor binary preview; presign đúng verified object version, TTL<=60s.
3.5 nhận FK/reference/soft-delete/audit lifecycle; không purge binary còn reference.
3.6 nhận rollout additive migration, backup DB/object volume, runtime rollback giữ
refs và test flow tích hợp 2.3. Lượt này chỉ lập plan, chưa tạo migration/source/FE.
