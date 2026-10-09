# Phase 3 — File + Materials

Ngày lập: **2026-10-09**. Trạng thái: **đã lập kế hoạch; chưa triển khai**.
Tiến độ riêng: [PHASE_3_PROGRESS.md](../progress/PHASE_3_PROGRESS.md).

Ưu tiên trước Phase 3: [Phase 2.3 — My Classes + Personal Schedule](./PHASE_2_3_MY_CLASSES_SCHEDULE.md)
để Student có danh sách lớp và lịch tổng hợp dẫn tới nơi đọc tài liệu. Phase 2.3
hiện mới có plan; không coi API collection/calendar đã tồn tại.

## 1. Mục tiêu và phạm vi

Hoàn thành luồng Admin/Mentor upload file, gắn tài liệu vào nội dung học và
Student có quyền đọc/tải qua Class → Class Unit → Class Session. Binary nằm ở
MinIO private; PostgreSQL lưu định danh, vòng đời, metadata và quan hệ material.

Phase 3 gồm:

- Upload trực tiếp bằng URL ký tạm thời, xác minh file, xử lý metadata bất đồng bộ.
- Tài liệu dùng chung của Course Unit và tài liệu riêng của Class Unit/Session.
- Admin quản lý toàn bộ; Mentor quản lý tài liệu riêng của lớp đang được phân công.
- Student `ACTIVE` xem/tải theo điều kiện mở unit và thời điểm công bố material.
- Mở/khóa Class Unit, cấu hình thời điểm mở và API đọc phục vụ giao diện tài liệu.
- Thu hồi material, dọn upload bỏ dở, retry job và kiểm thử quyền/khả năng phục hồi.

Không gồm attendance, homework/assignment/submission/grading, chứng chỉ, chat/DM,
whiteboard, compiler/judge, avatar, thay course image hoặc video HLS/transcoding.
Video/source code được hỗ trợ như file tài liệu; không chạy source code.
External link và đồng bộ/snapshot tài liệu giữa các lớp là backlog riêng.

## 2. Căn cứ và khoảng trống hiện tại

| Nguồn | Điều cần giữ trong Phase 3 |
|---|---|
| [DBML](../../document/mindy_center_full.dbml) | `file_objects`, `file_metadata`; material hiện bắt buộc `course_unit_id` và `file_object_id`; `class_units` đã có `status`/`unlock_at`. |
| [Course flow](../../document/COURSE_FLOW.md), mục 5–8 | Phân biệt Course mẫu và Class delivery; material ownership/access còn cần quyết định; CASH pending chỉ preview tiêu đề/lịch. |
| [Use case](../../document/usecase-course.drawio) | Mentor → View class/unit → Manage class session → Upload materials; Student xem nội dung theo quyền. |
| [Flow.txt](../../document/Flow.txt) | Thanh toán đủ mới mở nội dung; giữ CASH preview, mentor confirm và online email; pending chat/DM thuộc phase Chat. |
| [Business rules](../CORE_BUSINESS_LOGIC.md) | Chỉ gắn file `READY`; role phải đi cùng ownership; binary ở MinIO. Catalog hiện được mô tả là owner của materials. |
| [DB design review](../../document/mindy_mvp_db_design_review.md) | Metadata chung, async extraction và đề xuất material theo Session/`available_at`; đây là đề xuất, không phải schema đang chạy. |

Đối chiếu workspace ngày 2026-10-09:

- Đã có Catalog, Classes, Enrollments, Commerce, Payments; chưa có Files/Materials
  module, entity hoặc migration tương ứng.
- `EnrollmentsService.hasActiveAccess()` chỉ chấp nhận enrollment `ACTIVE`.
  `StudentClassService` chặn Class `CANCELLED`; chưa có material access policy.
- Class Unit đang tham chiếu Course Unit; không phải snapshot độc lập hoàn toàn.
  Chưa có API chuyên dụng quản lý mở/khóa unit.
- MinIO/Redis có biến cấu hình nhưng mặc định tắt; Compose hiện chưa có MinIO.
  Có env không đồng nghĩa storage, upload hoặc metadata worker đã hoạt động.
- CASH preview/confirm đã được bổ sung theo progress 2026-10-05. Không dùng ghi
  chú cash còn mở trong progress Phase 2.2 cũ để kết luận code chưa có.
- Mentor roster đã có bằng chứng deploy ngày 2026-10-09. Chưa có bằng chứng hoàn
  tất nghiệm thu PayOS tiền thật; không đánh dấu toàn bộ Phase 2 complete.

## 3. Các lựa chọn đề xuất để triển khai

Những lựa chọn dưới đây là **mặc định của kế hoạch**, chưa phải xác nhận của user
về các điểm mở trong COURSE_FLOW. Việc lập plan không tự cho phép đổi business rule
hoặc migration. Trước bước 3.1, ghi quyết định cuối cùng cho D1–D3 vào progress.

| Mã | Đề xuất | Hệ quả cần hiểu |
|---|---|---|
| D1 — Nơi sở hữu | Một material thuộc đúng một Course Unit, Class Unit hoặc Class Session. | Giữ tài liệu mẫu; hỗ trợ upload riêng trong buổi như use case; cần mở rộng DBML/migration. |
| D2 — Quản lý | Admin quản lý tất cả; mentor hiện được phân công quản lý material của Class Unit/Session trong lớp mình, kể cả do mentor trước tạo. | Mentor không sửa material Course Unit dùng chung; `created_by` phục vụ audit, không quyết định quyền của lớp. |
| D3 — Quyền đọc | Student `ACTIVE`, Class không hủy, Unit đã mở, material đã công bố và đến `available_at`; session material không đọc khi Session đã hủy. | Thanh toán cấp entitlement nhưng không mở ngay mọi unit; CASH pending tuyệt đối không nhận material hoặc download URL. |
| D4 — Tài liệu dùng chung | Course Unit material được đọc qua Class Unit đang tham chiếu nó; không tự sao chép material khi tạo Class. | Admin sửa/công bố tài liệu dùng chung sẽ ảnh hưởng các lớp liên quan; UI quản trị phải hiện cảnh báo phạm vi. Snapshot/versioning để riêng. |
| D5 — Sau hoàn thành | Giữ entitlement `ACTIVE` hiện hành; không tự cấp quyền cho enrollment `COMPLETED`. | Quyền học sau tốt nghiệp cần quyết định riêng; Class `COMPLETED` với enrollment vẫn `ACTIVE` không tự bị chặn. |
| D6 — Mức MVP | Material luôn tham chiếu file; không thêm link-only material ở Phase 3. | File kind phân biệt PDF/image/video/document/source; không cần thêm material type trùng với file kind. |

Nếu D1 chọn chỉ Course Unit thì phải ghi rõ use case mentor upload trong Session
chưa được đáp ứng và chuyển phần đó thành increment riêng; không ghi Phase 3 đã
đáp ứng đầy đủ use case. Các quyết định attendance/dạy bù/chứng chỉ giữ cho phase sau.

### Quy tắc mở nội dung

```text
canReadMaterial = authenticated active user
  AND enrollment ACTIVE thuộc Class đang truy cập
  AND Class.status != CANCELLED
  AND Class Unit thuộc Class, khớp Course Unit/Session của material
  AND Class Unit.status IN (OPEN, COMPLETED)
  AND (Class Unit.unlock_at IS NULL OR unlock_at <= serverNow)
  AND material.published_at IS NOT NULL AND material.deleted_at IS NULL
  AND (material.available_at IS NULL OR available_at <= serverNow)
  AND file.status = READY
  AND (material không gắn Session OR Session.status != CANCELLED)
```

`LOCKED` luôn chặn; `unlock_at` không tự đổi trạng thái. Muốn mở theo lịch, Admin/
Mentor đặt `OPEN` kèm `unlock_at` trong tương lai. Khóa lại đặt `LOCKED`; không cần
worker tự chuyển unit. `COMPLETED` ở đây là trạng thái Class Unit, không phải
enrollment. Không dùng progress percent, ngày bắt đầu Session hay điểm bài tập làm
điều kiện mở trong Phase 3. Kiểm tra bằng giờ server, lưu `timestamptz`.

Admin/Mentor có quyền quản lý được preview material chưa công bố hoặc unit đang
khóa. Quyền mentor dựa trên `classes.mentor_id` hiện tại, khác mentor snapshot dùng
để xác nhận CASH. Thay mentor không thay rule payment.

## 4. Luồng triển khai

### 4.1 Upload → xác minh → metadata

1. Admin/Mentor chọn scope đích. Backend kiểm tra role, assignment và quan hệ
   Course/Class/Unit/Session trước khi cấp upload intent; Student chưa có upload.
2. Backend sinh UUID v4, final object key và staging key; lưu file `PENDING_UPLOAD`,
   owner, thông tin khai báo, scope intent và thời hạn. Không nhận bucket/key từ client.
3. Trả presigned PUT URL chỉ cho staging key, header bắt buộc và thời hạn ngắn.
   Client upload trực tiếp vào storage private.
4. Client gọi complete. Backend kiểm tra owner/scope/thời hạn, enqueue validation
   trong DB và trả `202`. Retry cùng file không tạo thêm job. Complete không làm
   file `READY` dựa trên lời khai client.
5. Worker claim job với lease, copy staging object sang final key mà client không
   có quyền PUT; giữ version ID của bản copy trong bucket bật versioning và xác
   minh chính version đó: size thực, extension/MIME/signature,
   checksum và allowlist. Không chỉ HEAD object hoặc tin `Content-Type` đã upload.
6. File hợp lệ → `READY`, `ready_at`, size/MIME/kind/checksum đã xác minh; enqueue
   extraction cùng transaction. File sai → `FAILED`, lỗi có kiểm soát, dọn object.
7. Extraction ghi `file_metadata`; lỗi metadata không đổi file `READY` về `FAILED`.
   Retry hữu hạn, timeout và giới hạn tài nguyên. Client poll file detail.

Không gọi MinIO hoặc công cụ extraction trong transaction PostgreSQL. Final key
không bao giờ nhận URL upload. Điều này ngăn PUT URL còn hạn sửa nội dung sau khi
file đã được xác minh. Copy/retry phải giữ final object đã xử lý, không overwrite
file `READY`; worker chết giữa copy và commit phải phục hồi qua job/lease. Lưu
`object_version_id` cùng kết quả xác minh; HEAD/GET/download luôn chỉ định version
đó, không đọc latest. Lease token ngăn worker cũ đổi version đã commit; bản copy
mồ côi được cleanup riêng. Versioning phải được kiểm tra khi bật storage feature.

Allowlist khởi đầu đề xuất: PDF, PNG/JPEG, DOCX/PPTX/XLSX, MP4/MP3 và plain-text
source code. Office ZIP containers cần kiểm tra cấu trúc đúng loại; source code
kiểm tra text/encoding thay vì đòi magic bytes không tồn tại. Không nhận executable,
HTML/SVG chủ động hoặc generic archive ở MVP. Default đề xuất: 25 MiB/file thường,
200 MiB/video, PUT TTL 10 phút, upload intent TTL 30 phút; chốt tại bước 3.1 và
đưa vào env có validation. Không giải nén không giới hạn.

### 4.2 File READY → material → Student đọc/tải

1. Admin tạo material Course Unit; Admin/Mentor tạo material Class Unit/Session.
2. Kiểm tra file `READY`, owner/scope intent và quyền gắn; lock file row cùng lúc
   ghi reference để không đua với delete. Không gắn file của người khác chỉ vì biết ID.
   Admin quản lý file/material hiện hữu qua thao tác quản trị được audit.
3. Material bắt đầu draft (`published_at = NULL`); chỉnh title, description,
   sort order và `available_at`, rồi publish/unpublish. File binary không sửa tại chỗ;
   thay nội dung bằng file mới và đổi reference có kiểm tra.
4. Student mở danh sách qua Class của mình. Backend resolve material Course Unit
   dùng chung và material Class Unit/Session tương ứng, lọc đúng policy mục 3.
5. Download endpoint kiểm tra lại toàn bộ policy và trạng thái file tại mỗi lần gọi,
   rồi cấp presigned GET tối đa 60 giây; response `Cache-Control: no-store`.
6. Unpublish/khóa unit/đổi quyền chặn cấp URL mới ngay. URL đã cấp còn dùng được
   đến hết TTL; nếu cần thu hồi tức thì mọi byte tải, phải thiết kế download proxy
   ở increment riêng, không tuyên bố presigned URL có khả năng đó.

Download dùng attachment filename an toàn; không trả credentials, staging key,
storage topology hoặc URL ký trong list/log. Student không có endpoint tải file
chung bằng `fileId`; phải đi qua material + Class context. File owner cũng không
thay thế entitlement Student. Preview/thumbnail, nếu có, dùng cùng policy.

### 4.3 Thu hồi và cleanup

- Xóa material là soft delete, ghi người thực hiện/thời điểm; giữ audit.
- Xóa file đang được material hoặc preview reference dùng trả `409 FILE_IN_USE`.
  File delete và material attach khóa cùng file row; FK `RESTRICT` bảo vệ cuối cùng.
- File không còn reference: đánh dấu `DELETED` trước, enqueue purge, xóa binary
  sau commit, gồm các version không còn được dùng tại key đó. Purge retry được;
  tombstone ngăn cấp URL dù storage tạm lỗi.
- Upload bỏ dở quá hạn chuyển `FAILED`, dọn staging/final mồ côi sau khoảng đệm
  TTL/worker lease; không xóa object đang được validation xử lý.
- Soft-deleted material giữ FK đến khi retention cleanup gỡ reference có audit;
  không purge file còn được material sống khác dùng chung.

## 5. Schema và migration đề xuất

Không sửa migration đã chạy; TypeORM và migration là nguồn thực thi, giữ
`synchronize=false`. Cập nhật DBML khi triển khai, không ghi đề xuất thành schema
đã áp dụng trong lượt lập plan này.

| Bảng | Giữ theo DBML | Phần mở rộng cần thiết |
|---|---|---|
| `file_objects` | Identity, bucket/key unique, owner, MIME/kind/size/hash, status và timestamps. | `upload_expires_at`, staging key, `object_version_id` của bản đã xác minh, đúng một scope intent Course Unit/Class Unit/Session; lỗi validation được chuẩn hóa. Final key bất biến. |
| `file_metadata` | Một row/file, processing status và metadata theo loại; optional preview file. | Chỉ ghi dữ liệu extractor xác minh; không dùng properties JSON làm nơi chứa credentials/raw URL. |
| `materials` | File FK, title, sort order, creator, created_at. | `course_unit_id` nullable; thêm `class_unit_id`, `class_session_id`, description, `available_at`, `published_at`, `updated_at`, `updated_by`, `deleted_at`, `deleted_by`. |
| `file_processing_jobs` — bảng mới | Chưa có trong DBML. | `file_object_id`, kind `VALIDATE_UPLOAD/EXTRACT_METADATA/PURGE_OBJECT`, status, attempts, next_attempt_at, lease token/until, error code, timestamps; unique `(file_object_id, kind)`. |

Constraints/index phải có:

- Material và upload intent: `CHECK num_nonnulls(course_unit_id, class_unit_id,
  class_session_id) = 1`; mỗi scope có FK riêng. Không lưu dư `class_id` để tạo
  hai nguồn sự thật; derive qua unit/session. Không cho đổi scope material bằng PATCH.
- `file_objects.size_bytes >= 0`; giá trị bigint đưa ra DTO theo quy ước an toàn
  của repo; metadata duration/count/dimensions không âm hoặc phải dương theo loại.
- FK material → file, scope và creator có hành vi delete tường minh; ưu tiên
  `RESTRICT` cho dữ liệu được dùng, không cascade xóa binary qua DB.
- Index material theo `(scope_id, sort_order, id)` cho từng scope, lọc soft delete;
  sort order không unique, tie-break bằng ID. Index upload expiry và job claim.
- Worker claim bằng `FOR UPDATE SKIP LOCKED` và lease token; chỉ worker còn token
  hợp lệ được commit kết quả. Job unique và state checks bảo vệ retry/concurrency.

Tách migration theo slice: **files + metadata + jobs** tại 3.2; **materials scopes**
tại 3.3. Chạy up/down/up trên DB riêng và migration từ database trống. Rollback
schema không tự khôi phục binary đã purge; runbook phải nói rõ giới hạn này.

## 6. Biên module và API dự kiến

- `FilesModule` sở hữu file/metadata/jobs và storage adapter; không phụ thuộc
  MaterialsModule. Job PostgreSQL dùng pattern lease tương tự payment email,
  không cần thêm Redis/BullMQ chỉ để có async.
- `MaterialsModule` sở hữu materials và điều phối quyền gắn/đọc; export provider
  phục vụ Catalog/Classes. Đây là thay đổi ownership so với core doc hiện tại,
  phải cập nhật `CORE_BUSINESS_LOGIC.md` cùng lúc triển khai.
- Classes/Enrollments export policy/query cần thiết về class assignment, ancestry,
  unit release và active access; không đọc repository private xuyên module hoặc
  dùng `forwardRef` để che vòng phụ thuộc.
- Scope authorization nằm ở application use case trước Files upload intent;
  Files nhận scope đã được xác thực qua provider có kiểu rõ. Chốt sơ đồ import
  trước khi code để Catalog/Classes không import ngược Materials nếu gây cycle.
- Giữ UUID v4 theo code hiện hành; không chuyển UUIDv7 chỉ vì note DBML cũ.

Prefix tất cả endpoint: `/api/v1`. Bảng dưới là **contract dự kiến**, chưa phải
route đã có. DTO tách entity; mutation dùng cookie auth + kiểm tra Origin/CSRF
theo baseline của repo.

| API | Quyền và hành vi |
|---|---|
| `POST /files/upload-intents` | Admin/Mentor, scope có quyền; nhận filename/MIME/size, trả fileId + URL/header/expiry. |
| `POST /files/:fileId/complete` | Owner còn quyền với scope hoặc Admin; enqueue validation, idempotent; 202 khi xử lý, 200 khi READY. |
| `GET /files/:fileId` | Owner còn quyền với scope hoặc Admin; trạng thái/metadata/error code; Student không dùng để bypass material. |
| `DELETE /files/:fileId` | Owner còn quyền hoặc Admin; chỉ file không còn reference, 202 khi purge pending. |
| `GET/POST /admin/course-units/:courseUnitId/materials` | Admin, tài liệu dùng chung. |
| `GET/POST /admin/class-units/:classUnitId/materials` và `/admin/class-sessions/:sessionId/materials` | Admin, tài liệu riêng. |
| `GET/POST /mentor/classes/:classId/units/:unitId/materials` và `/mentor/classes/:classId/sessions/:sessionId/materials` | Mentor hiện được gán; path IDs phải cùng lớp. GET quản lý hiện cả shared material read-only và material riêng. |
| `PATCH/DELETE /admin/materials/:materialId`, `POST /admin/materials/:materialId/publish` hoặc `/unpublish` | Admin; PATCH metadata/file reference, DELETE soft delete. |
| `PATCH/DELETE /mentor/classes/:classId/materials/:materialId`, `POST .../publish` hoặc `/unpublish` | Mentor hiện được gán, chỉ material riêng của lớp; không sửa shared template. |
| `PATCH /admin/classes/:classId/units/:unitId/release` và `/mentor/classes/:classId/units/:unitId/release` | Gửi `status: LOCKED/OPEN`, `unlockAt`; không dùng API này đánh dấu COMPLETED hoặc ghi progress. |
| `GET /me/classes/:classId/units/:unitId/materials` | Student ACTIVE; shared Course Unit + Class Unit material được phép, phân trang. |
| `GET /me/classes/:classId/sessions/:sessionId/materials` | Student ACTIVE; chỉ material riêng Session được phép. Giao diện lấy unit materials qua API unit. |
| `POST /me/classes/:classId/materials/:materialId/download` | Student, kiểm tra entitlement/scope/release rồi trả `{ url, expiresAt }`. |
| `POST /admin/materials/:materialId/download`, `/mentor/classes/:classId/materials/:materialId/download` | Preview quản lý qua material; mentor được đọc shared material của lớp, không có quyền sửa. |

Contract cần chốt thêm: page DTO theo repo, bigint serialization, error envelope,
401 unauthenticated; 403 không có quyền; 404 target không tồn tại hoặc không thuộc
parent path; 409 file chưa READY/đang được dùng; 400 payload không hợp lệ;
503 storage disabled/unavailable. Student list không trả draft, hidden material,
external_url hoặc download URL. Class CASH preview không thêm field material.
Không bổ sung auto-progress khi chỉ tải một file.

## 7. Các bước triển khai và đầu ra nghiệm thu

| Bước | Công việc | Tiêu chí hoàn thành | Ước lượng ngày công |
|---|---|---|---|
| **3.1 — Chốt policy/contract** | Ghi D1–D6, scope diagram, DTO/error, file allowlist/limits, threat cases và storage config. | Rule nhất quán với Course flow/Flow.txt; quyền quản lý và quyền học phân biệt rõ; hết điểm mơ hồ D1–D3. | 1–2 |
| **3.2 — Upload slice** | Files migration/entity, adapter, private MinIO dev/test, intent/complete/detail, durable validation jobs. | Upload thật tới MinIO test → READY hoặc FAILED; retry/restart/overwrite kiểm chứng; feature tắt không phá payment. | 3–4 |
| **3.3 — Material management slice** | Materials migration/entity, CRUD, publish/unpublish, ba scope, release API và scope authorization. | Admin shared + Mentor session material chạy xuyên API; không gắn sai lớp/file hoặc sửa shared template. | 3–4 |
| **3.4 — Student access slice** | Query material theo class context, download URL, DTO/Swagger/Postman và contract FE. | ACTIVE tải đúng tài liệu mở; pending/cross-class/locked/draft/future bị chặn ở list lẫn download. | 2–3 |
| **3.5 — Metadata/lifecycle** | Extraction worker theo allowlist, retry/lease, cleanup staging, soft delete/purge và audit. | Restart/job duplicate không nhân dữ liệu; metadata failure không mất file; file có reference không bị purge. | 2–3 |
| **3.6 — Quality gate/rollout** | Regression, HTTP/integration thật, storage runbook, staging smoke, cập nhật docs/progress. | Local check pass không skip critical suite; staging có evidence auth+MinIO end-to-end; production còn thiếu được ghi riêng. | 2–3 |

Tổng dự kiến **13–19 ngày công cho một BE developer**, sau khi chốt policy;
chưa tính FE implementation, chờ hạ tầng hoặc nghiệm thu tiền thật. Đây là ước
lượng theo scope của plan, không phải cam kết lịch. Thực hiện 3.1 → 3.2 → 3.3 →
3.4 → 3.5 → 3.6; mỗi bước có API/test chạy được, không tạo tất cả entity trước.

Điều kiện bắt đầu code: auth/role/active-user checks và PostgreSQL test DB dùng
được; có fixture ACTIVE/CASH pending và class/session từ Phase 2. Test có thể dùng
settlement fixture, không cần nhận tiền thật. Điều kiện release: kiểm chứng gate
Phase 0/1 liên quan, access/payment regression và evidence storage staging. PayOS
live còn mở được ghi là dependency nghiệm thu toàn flow, không tự đánh dấu pass.

## 8. Kiểm thử bắt buộc

| Nhóm | Ca kiểm thử có giá trị nghiệm thu |
|---|---|
| Upload thật | PUT/complete/READY trên MinIO riêng; file thiếu, quá hạn, size sai, MIME giả, payload sai định dạng/Office ZIP không đúng; client đổi staging sau complete không đổi final file READY. |
| Retry/concurrency | Complete lặp/đồng thời, lease hết hạn, worker chết sau copy/trước commit, hai worker claim, MinIO timeout; không có READY trỏ object chưa xác minh. |
| Scope/role | Student upload bị chặn; mentor lớp A không sửa/xem file intent của B; path unit/session sai class; mentor không sửa Course Unit material; đổi mentor thu hồi quyền người cũ. |
| Entitlement | ACTIVE đúng lớp; pending CASH/PayOS; EXPIRED/CANCELLED; COMPLETED enrollment không được tự mở; class cancelled; cùng course nhưng lớp khác không đọc material riêng. |
| Release | Unit LOCKED/OPEN/future unlock; draft/unpublished/deleted material; available_at trước/đúng/sau mốc; session cancelled; quản trị preview không làm lộ cho Student. |
| Shared material | Course Unit material chỉ đọc qua Class Unit hợp lệ; sửa shared có tác động đúng các lớp liên quan; session material không tự lan sang lớp khác. |
| Download | Biết fileId/materialId không bypass; URL TTL/no-store; tên file an toàn; GET URL thực tải đúng binary; không có URL private trong cash preview/public catalog/log. |
| Lifecycle | Attach đua delete; file dùng chung/ref preview trả 409; purge lỗi được retry; abandoned upload cleanup không đụng worker đang chạy hoặc file có reference. |
| Metadata | Extraction thành công/timeout/FAILED + retry; giới hạn CPU/memory/output/temp; file vẫn READY khi optional metadata fail; preview kế thừa quyền. |
| Regression | Checkout giữ chỗ, settlement ACTIVE/progress/mail, CASH confirm idempotent, expiry, mentor roster và student class detail giữ contract. |

Unit test cho policy/state/limit; PostgreSQL integration cho FK/transaction/race;
MinIO integration cho presign/copy/GET/delete; built-app HTTP tests cho cookie guard,
DTO và ownership. Adapter fake dùng cho outage tests, không thay bằng chứng storage
thật. Dùng DB/bucket test riêng; không đụng development/VPS/production data.

Chạy `pnpm check` và `pnpm test:http` khi triển khai. Nếu suite bị skip hoặc lỗi
baseline như CRLF lint, ghi đúng trạng thái, xử lý trong scope phù hợp trước khi
nghiệm thu; không lấy targeted pass thay full gate. Lượt lập plan chỉ kiểm tra docs.

## 9. Hạ tầng và rollout

- Thêm MinIO local/test với volume riêng và private bucket bật versioning; CORS chỉ các FE origin
  cần dùng, đúng PUT/GET headers. Pin storage image/dependencies tại bước triển khai
  sau kiểm tra compatibility; không nâng runtime cả dự án để làm Phase 3.
- Tách internal storage endpoint cho worker và public HTTPS endpoint để ký URL
  trình duyệt; host/path ký phải khớp gateway, không rewrite làm hỏng signature.
- Không public MinIO console; TLS, service credentials quyền tối thiểu, secret qua
  env đã validate. Không log presigned query hoặc credentials.
- Metadata tools chạy non-root, timeout/CPU/memory/output limits. Runtime hiện có
  `/tmp` 64 MiB; stream/copy file lớn, bố trí worker scratch có giới hạn thay vì
  đọc toàn bộ video vào RAM hoặc ghi vượt tmpfs. Không tự fetch external link.
- Bổ sung upload/download TTL, max size/type, job interval/attempt/lease và cleanup
  retention vào `.env.example`, schema và runbook. `MINIO_ENABLED=false` trả lỗi
  có kiểm soát ở Files; auth/catalog/checkout/payment vẫn khởi động bình thường.
- Migrate additive trước, deploy API/worker rồi mới bật feature sau smoke test.
  Backup/restore cần cả PostgreSQL lẫn object volume; backup DB riêng không đủ.
- Theo dõi job pending/failed/lease, storage failure, orphan count và audit mutation.
  Rollback tắt cấp upload mới; giữ binary/reference và ghi rõ ảnh hưởng download,
  không chạy down production để chữa lỗi runtime khi còn dữ liệu mới.

## 10. Definition of done

- [ ] D1–D6 có quyết định ghi lại; DBML, Course flow và business/module docs khớp.
- [ ] Admin upload + publish Course Unit material; Mentor upload + publish Session
      material của lớp mình chạy end-to-end trên storage thật trong môi trường test.
- [ ] Student ACTIVE tải tài liệu đã mở; CASH pending/PayOS pending không có material
      hoặc download URL, kể cả đoán ID.
- [ ] Scope/FK/READY checks, lease/retry, delete/attach race và cleanup có test.
- [ ] Metadata lỗi không hủy quyền tải file hợp lệ; extractor chạy có giới hạn.
- [ ] API DTO/Swagger/Postman và FE contract đầy đủ, không trả entity/storage secrets.
- [ ] Migration clean DB + up/down/up, `pnpm check`, HTTP và MinIO tests pass;
      không bỏ qua critical integration suite.
- [ ] Staging smoke/runbook có evidence; trạng thái production và PayOS live ghi riêng.
- [ ] Cập nhật progress Phase 3 và progress chung theo từng increment; không ghi
      attendance/chat/assignment/board/compiler/chứng chỉ đã triển khai.
