# Phase 3 — File + Materials

Cập nhật: **2026-10-15**. 3.1 D1–D6 đã code policy/contract/providers và role
MANAGER, kiểm tra local pass; 3.2 hoàn tất local và nghiệm thu VPS theo user.
3.3 authoring/review/release và 3.4 Student ARTICLE/FILE/VIDEO read/access/staff
preview đã implement local; VPS/user sign-off và browser/FE integration còn pending.
Contract chi tiết: [Phase 3.1](./PHASE_3_1_POLICY_CONTRACT.md).
Plan upload: [Phase 3.2](./PHASE_3_2_SAFE_UPLOAD.md), đã rà soát theo
baseline 3.1; đã nghiệm thu Files/storage local/VPS, chi tiết trong progress riêng.
Plan quản lý: [Phase 3.3](./PHASE_3_3_MATERIAL_MANAGEMENT.md),
Manager CRUD/review, Mentor draft/submit/context và Class Unit release đã có local;
3.3.5 đã chuẩn bị acceptance/handoff. [Flow 3.3](../../api_flow/PHASE_3_3_FLOW.md)
và [API breakdown](../../api_flow/PHASE_3_3_flow-api-breakdown.md).
Plan đọc/truy cập: [Phase 3.4](./PHASE_3_4_STUDENT_MATERIAL_ACCESS.md),
hệ thống hóa typed Student read/file access, staff preview và gate API/storage/
browser còn chờ; [flow 3.4](../../api_flow/PHASE_3_4_FLOW.md) và
[API breakdown](../../api_flow/PHASE_3_4_flow-api-breakdown.md).
Tiến độ: [Phase 3](../../progress/phase%203/PHASE_3_PROGRESS.md),
[Phase 3.1](../../progress/phase%203/PHASE_3_1_PROGRESS.md),
[Phase 3.2](../../progress/phase%203/PHASE_3_2_PROGRESS.md),
[Phase 3.3](../../progress/phase%203/PHASE_3_3_PROGRESS.md),
[Phase 3.4](../../progress/phase%203/PHASE_3_4_PROGRESS.md).

## 1. Mục tiêu và phạm vi đã chốt

**Cập nhật user2026-10-11:** mở rộng MVP file-only sang ARTICLE (BE lưu HTML đã
sanitize), FILE và VIDEO (MP4 private MinIO/URL có thời hạn); HLS làm sau.
Course Unit/review/revision/release/ACTIVE giữ nguyên. Content contract mới ở
[plan3.3](PHASE_3_3_MATERIAL_MANAGEMENT.md)
ưu tiên hơn mô tả file-only D6 cũ. Files3.2 vẫn không nhận fileHTML.
Mỗi slice cần API nghiệm thu trên server; user xác nhận nghiệm thu3.2 xong
2026-10-12, PDF/MP4 READY/private objects có evidence trong progress3.2.
Plan3.3 đã hợp nhất typed content/refs/sanitizer và gate local/server từng bước;
estimate BE provisional7–10 ngày, không chờ3.6 mới rollout.

Material là tài liệu chính của Course Unit: **Course Unit 1–N Material**, giữ
`materials.course_unit_id NOT NULL` theo DBML. Class Unit tham chiếu Course Unit;
các lớp dùng chung tài liệu của Course Unit. Không thêm material owner Class
Unit/Session. Optional Session link chỉ chỉ định sử dụng, không đổi owner/visibility.

Điều phối user2026-10-13: người khác triển khai **3.3–3.6**, user nhận bàn giao
deploy/server acceptance. **FE do nhóm riêng làm; repo FE local chỉ để đọc.**
[Plan3.4 phối hợp](PHASE_3_4_MATERIAL_ACCESS_PREVIEW.md) đưa staff preview/assets
cùng mốc review3.3.3; Student typed consumer sau contract3.3.1 và server cases sau
publication/release. Thứ tự P3 là roadmap với dependencies từng slice, không yêu
cầu chờ toàn3.3 mới bắt đầu3.4. Tích hợp/browser FE cần phối hợp nhóm riêng và
evidence riêng trước nghiệm thu toàn journey.

- Manager role riêng quản lý/sửa/duyệt tài liệu chính dùng chung.
- Mentor được gán lớp upload draft của Course Unit trong lớp đó, submit chờ
  Manager duyệt; không tự approve/publish hoặc sửa tài liệu đã được duyệt.
- Student ACTIVE đọc/tải theo Class Unit release và material approval/publication.
- Upload private MinIO, xác minh binary, metadata async, cleanup/retry/audit.
- MVP ARTICLE HTML/FILE/VIDEO MP4; không external video, HLS/transcoding hay thực thi source code.

Không gồm assignment/submission/grading, Q&A, student code, attendance, chứng chỉ,
chat/DM, board/compiler, avatar/course-image hoặc snapshot/versioning nội dung học.
Session giữ công việc riêng của lớp trong các phase đó, không phải owner Material.

## 2. Căn cứ và trạng thái thực thi

Nguồn: [Flow.txt](../../../document/Flow.txt),
[Course flow](../../../document/COURSE_FLOW.md),
[DBML](../../../document/mindy_center_full.dbml),
[business logic](../../core/CORE_BUSINESS_LOGIC.md), usecase-course.drawio và
[DB review](../../../document/mindy_mvp_db_design_review.md).

Code có Catalog/Classes/Enrollments/Commerce/Payments và MaterialsModule export
policy facade/domain transitions. Files upload/storage/validation đã có ở 3.2;
Material typed persistence/authoring/review/release 3.3 và Student read/access/
staff preview 3.4 đã có local. Chi tiết evidence theo progress từng slice,
không dùng local pass thay nghiệm thu VPS/browser.
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
shared live giữa lớp; không tự cấp quyền enrollment COMPLETED. D6 file-only lịch sử
được thay bằng ARTICLE/FILE/VIDEO theo scope2026-10-11; domain typed ở3.3.

Student canRead yêu cầu tất cả:

1. Active authenticated user và enrollment ACTIVE trong Class đang truy cập.
2. Class không CANCELLED, Class Unit thuộc Class và tham chiếu đúng Course Unit.
3. Unit OPEN/COMPLETED, unlockAt null hoặc <= serverNow; LOCKED luôn chặn.
4. Material chưa deleted, được Manager APPROVED đúng revision, đã published và
   availableAt null hoặc <= serverNow; typed content hợp lệ và mọi refs READY
   đúng owner Course Unit (ARTICLE text-only không bắt buộc file).

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
| [3.3](./PHASE_3_3_MATERIAL_MANAGEMENT.md) | Typed Course Unit Materials, Manager CRUD/review, Mentor context/draft/submit, release API; acceptance/handoff đã chuẩn bị local | Local verified; READY không bypass review; revision race/assignment/approval/soft-delete/audit tests. VPS/user sign-off pending. |
| [3.4](./PHASE_3_4_STUDENT_MATERIAL_ACCESS.md) | ACTIVE Unit list/detail/download ARTICLE/FILE/VIDEO, scoped assets/staff preview, Swagger/Postman/FE contract đã có local | Pending/locked/draft/rejected/foreign bị chặn; shared đọc theo quyền mỗi lớp; pinned-version/TTL/recheck local verified. VPS/browser CORS/seek/refresh và UI FE pending. |
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
