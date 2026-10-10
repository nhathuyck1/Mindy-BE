# Phase 3 — File + Materials

Cập nhật: **2026-10-09**. 3.1 D1–D6 đã code policy/contract/providers và role
MANAGER, kiểm tra local pass; 3.2 upload/storage/validation API hoàn tất local.
Material persistence/review và Student download tiếp tục ở 3.3/3.4.
Contract chi tiết: [Phase 3.1](./PHASE_3_1_POLICY_CONTRACT.md).
Plan upload tiếp theo: [Phase 3.2](./PHASE_3_2_SAFE_UPLOAD.md), đã rà soát theo
baseline 3.1; đã nghiệm thu Files/storage local, chi tiết trong progress riêng.
Tiến độ: [Phase 3](../progress/PHASE_3_PROGRESS.md),
[Phase 3.1](../progress/PHASE_3_1_PROGRESS.md),
[Phase 3.2](../progress/PHASE_3_2_PROGRESS.md).

## 1. Mục tiêu và phạm vi đã chốt

Material là tài liệu chính của Course Unit: **Course Unit 1–N Material**, giữ
`materials.course_unit_id NOT NULL` theo DBML. Class Unit tham chiếu Course Unit;
các lớp dùng chung tài liệu của Course Unit. Không thêm material owner Class
Unit/Session. Optional Session link chỉ chỉ định sử dụng, không đổi owner/visibility.

User phụ trách Phase 3, người khác làm
[Phase 2.3](./PHASE_2_3_MY_CLASSES_SCHEDULE.md) song song. Thứ tự P3 là
3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6; không chờ calendar/navigation để bắt đầu,
nhưng tích hợp toàn hành trình FE là gate riêng trước nghiệm thu tích hợp.

- Manager role riêng quản lý/sửa/duyệt tài liệu chính dùng chung.
- Mentor được gán lớp upload draft của Course Unit trong lớp đó, submit chờ
  Manager duyệt; không tự approve/publish hoặc sửa tài liệu đã được duyệt.
- Student ACTIVE đọc/tải theo Class Unit release và material approval/publication.
- Upload private MinIO, xác minh binary, metadata async, cleanup/retry/audit.
- MVP file-only; không external link, HLS/transcoding hay thực thi source code.

Không gồm assignment/submission/grading, Q&A, student code, attendance, chứng chỉ,
chat/DM, board/compiler, avatar/course-image hoặc snapshot/versioning nội dung học.
Session giữ công việc riêng của lớp trong các phase đó, không phải owner Material.

## 2. Căn cứ và trạng thái thực thi

Nguồn: [Flow.txt](../../document/Flow.txt),
[Course flow](../../document/COURSE_FLOW.md),
[DBML](../../document/mindy_center_full.dbml),
[business logic](../CORE_BUSINESS_LOGIC.md), usecase-course.drawio và
[DB review](../../document/mindy_mvp_db_design_review.md).

Code có Catalog/Classes/Enrollments/Commerce/Payments và MaterialsModule export
policy facade/domain transitions. Chưa có Files hoặc Material persistence/API.
Class Unit có status/unlockAt, EnrollmentsService có hasActiveAccess() ACTIVE.
MinIO/Redis env không chứng minh storage/worker hoạt động. CASH preview/confirm và
mentor roster đã có; evidence roster deploy không chứng minh PayOS tiền thật đã pass.

Role MANAGER từng bị bỏ bằng migration cũ; nay khôi phục bằng migration mới
`1791504000000-restore-manager-role.ts`. Không sửa deployed migration, không
promote account hiện hữu. Admin tạo Manager qua POST /api/v1/admin/users.
Public registration vẫn STUDENT; MANAGER không tự có quyền Admin/payment/CASH.

## 3. D1–D6 và policy

D1–D6 theo [plan 3.1](./PHASE_3_1_POLICY_CONTRACT.md), được user duyệt 2026-10-09:
Course Unit owner; Manager quản lý/review, Mentor upload; ACTIVE + release;
shared live giữa lớp; không tự cấp quyền enrollment COMPLETED; MVP file-only.

Student canRead yêu cầu tất cả:

1. Active authenticated user và enrollment ACTIVE trong Class đang truy cập.
2. Class không CANCELLED, Class Unit thuộc Class và tham chiếu đúng Course Unit.
3. Unit OPEN/COMPLETED, unlockAt null hoặc <= serverNow; LOCKED luôn chặn.
4. Material chưa deleted, được Manager APPROVED đúng revision, đã published và
   availableAt null hoặc <= serverNow; file READY.

OPEN + unlockAt tương lai mở theo giờ; không cần worker đổi status.
Class COMPLETED với enrollment ACTIVE áp dụng gate bình thường. Session CANCELLED
không thu hồi tài liệu chính Course Unit. CASH/PayOS pending không material/URL;
progress/accessMode/file owner không thay entitlement. Giữ cash snapshot rule và email.

Manager preview draft/locked. Mentor preview draft của mình khi còn assignment,
đọc tài liệu công bố của Course Unit trong lớp; không đọc draft Mentor khác.
Manager sửa nội dung/file đã approved → draft, xóa approval/publication, duyệt
lại trước khi Student đọc bản mới. MVP không giữ bản cũ public trong lúc review.

## 4. Upload, review và download

1. Manager hoặc Mentor có assignment chọn Course Unit; backend kiểm quyền trước
   intent, không nhận bucket/key từ client. Mentor có class context đúng ancestry.
2. UUID v4, staging/final keys backend sinh; PENDING_UPLOAD + owner/intent/expiry.
3. Presigned PUT chỉ staging, TTL 10 phút; intent TTL 30 phút, headers tường minh.
4. Complete enqueue validation DB job idempotent, trả 202; không tin client để READY.
5. Worker lease/token copy staging → final, validate đúng version: actual size,
   MIME/signature/container/text/SHA-256. READY commit + extraction job atomic;
   invalid → FAILED. Metadata lỗi không thu hồi READY.
6. Attach file READY dưới row lock; Mentor draft → PENDING_REVIEW, Manager
   approve/reject theo expectedRevision. Approve công bố, reject ghi lý do.
7. Student list qua Class Unit, lọc policy trước count/pagination. Download kiểm
   lại policy và cấp presigned GET đúng version tối đa 60s, no-store.

Final key không cấp PUT. Versioning phải được kiểm chứng, download không lấy
latest. Lease token chặn worker cũ commit. Crash sau copy/trước commit phục hồi
qua job lease; orphan version cleanup riêng. Không gọi MinIO/extractor/SMTP trong
DB transaction. Không chỉ HEAD hoặc Content-Type để xác minh payload.

Allowlist/limits theo 3.1: PDF/image/Office/MP3/text source 25 MiB, MP4 200 MiB;
không executable/HTML/SVG/generic archive. Office kiểm đúng ZIP container,
text UTF-8 không thực thi. Không giải nén vô hạn hoặc đọc video toàn bộ vào RAM.

Publish chỉ đúng approved revision. Row lock/expectedRevision chống PATCH đua
review và hai Manager review; retry cùng revision idempotent, không tạo audit trùng.
Unpublish/lock chặn URL mới; URL đã cấp có thể dùng đến TTL, không hứa thu hồi byte tức thì.
Download filename attachment an toàn; không lộ keys, secrets hoặc URL ký trong list/log.
Student không có tải chung theo fileId.

## 5. Schema/module/API

FilesModule sở hữu file_objects/file_metadata/file_processing_jobs, storage và
worker. MaterialsModule sở hữu materials/review/audit/reference/access; Classes
sở hữu context/release. Materials → Files/Catalog/Classes/Enrollments; Files →
Catalog/Classes để scope authorization; không import ngược hoặc expose private repository.

Migration slice 3.2: files/metadata/jobs. Slice 3.3: materials với Course Unit FK
bắt buộc, file FK, metadata release/soft delete/audit và review status/revision.
Optional Session association phải khớp Course Unit qua Class Unit, cần DB protection
phù hợp; không khẳng định FK session đơn đã bảo đảm quan hệ xuyên bảng.

Jobs unique (file_object_id, kind), validate/extract/purge; lease/attempt/backoff/error.
Worker FOR UPDATE SKIP LOCKED + token. FK RESTRICT; attach/delete lock cùng file row;
file size/metadata bounds và index sort/expiry/claim. UUID v4/synchronize=false,
không sửa migration đã deploy; clean DB và up/down/up ở test DB riêng.

API/DTO/error contract đầy đủ tại mục 7 plan 3.1: Manager material CRUD/review/
publish/preview; Mentor intent/draft/submit; Student Unit list/download; release
Admin/Mentor theo baseline. Cookie auth + Origin/CSRF, pageSize <= 100, DTO tách
entity, 422 validation theo code hiện hành, 401/403/404/409/503 tường minh.
Session navigation resolve Course Unit để hiện tài liệu chính, không tạo owner mới.

## 6. Các slice triển khai

| Slice | Công việc | Gate |
|---|---|---|
| 3.1 | D1–D6, Manager role, domain policy, context providers và contract | Hoàn tất local: 171 tests/16 suites + build, HTTP 5/5; upload và review persistence/API chưa triển khai. |
| [3.2](./PHASE_3_2_SAFE_UPLOAD.md) | Files migration/adapter/private MinIO, intent/complete/detail, validation jobs; plan đã rà soát sau 3.1 pass, giữ policy/errors và chiều Materials → Files | Manager/Mentor đúng scope upload thật → READY/FAILED; overwrite/retry/restart tests. |
| 3.3 | Course Unit Materials, Manager CRUD/review, Mentor draft/submit, release API | READY không bypass review; revision race/assignment/approval/soft-delete tests. |
| 3.4 | ACTIVE Unit list/download, Swagger/Postman/FE contract | Pending/locked/draft/rejected/cross-class bị chặn; shared đọc đúng mỗi lớp. |
| 3.5 | Metadata extraction/retry, cleanup/retention/purge/audit | Metadata fail giữ READY; không purge file có ref hoặc job live. |
| 3.6 | Full gates, migration/storage runbook, staging + 2.3 integration | Evidence local/staging/VPS/payment live ghi riêng; không skip critical test. |

Ước lượng cũ 13–19 ngày công chưa tính review workflow mới; cần hiệu chỉnh theo
scope 3.3, không dùng như cam kết lịch. Mỗi slice có API/test chạy được, không
làm toàn bộ entities trước. Validation/test quyền làm ngay slice tương ứng.

## 7. Lifecycle, hạ tầng và regression

Material soft delete giữ audit/FK đến retention. File còn material/preview reference
trả FILE_IN_USE. Tombstone DELETED trước rồi purge async/version cleanup sau commit;
retry outage, không xóa object đang validation hoặc file shared còn được dùng.
Upload quá hạn FAILED + grace trước cleanup. Đề xuất retention/grace tại 3.1.

Private MinIO test bucket/versioning và volume riêng; pin image/dependency tại
implementation, internal/public endpoint ký đúng host/path HTTPS, CORS cụ thể,
console không public, service credentials quyền tối thiểu/env validation.
MINIO_ENABLED=false không phá payment/auth/catalog. Extraction non-root,
timeout/CPU/memory/output/scratch bounded; /tmp 64 MiB hiện tại không chứa video lớn.

Rollout additive migration → API/worker → feature enable sau smoke. Backup cả DB
và object volume. Rollback runtime tắt upload mới/giữ refs/binary; không down production
khi có dữ liệu mới. Role rollback từ chối nếu còn Manager accounts, không tự demote.

Tests: unit policy/review/state/limits; PostgreSQL FK/transaction/review race/attach
race; MinIO presign/version/copy/get/delete; built-app HTTP auth/DTO/assignment.
Fake outage không thay storage evidence thật. pnpm check/test:http, clean migration
+ up/down/up. Regression checkout/settlement/CASH/expiry/mail/roster/detail và 2.3;
không dùng targeted pass thay full gate, không coi suite skip là pass.

Phân chia P2.3: người khác sở hữu /me/classes,/me/schedule/context navigation;
P3 sở hữu Files/Materials/review/release. Phối hợp public providers/DTO/file Classes
và reviewer migration trước sửa chung. FULL trên FE không thay material gate.

## 8. Definition of done

- [x] User duyệt D1–D6, Course Unit 1–N và Manager/Mentor review workflow.
- [ ] Manager/Mentor upload → file READY → pending review → approve → Student
  ACTIVE tải chạy end-to-end trên storage test thật.
- [ ] Pending/cross-class/locked/rejected/stale-review không material/URL.
- [ ] Review race/idempotency, lease/version/retry, attach/delete/purge tests có evidence.
- [ ] Schema/DBML/Swagger/Postman/FE contract đồng bộ với slice thực thi.
- [ ] Full local gates + migration/MinIO checks + staging smoke pass.
- [ ] 2.3 integration, VPS rollout và payment live được ghi riêng đúng evidence.
