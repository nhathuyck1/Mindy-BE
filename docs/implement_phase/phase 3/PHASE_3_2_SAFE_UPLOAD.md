# Phase 3.2 — Upload private và xác minh file

Ngày lập/cập nhật: **2026-10-09**. Trạng thái: **đã triển khai và nghiệm thu local**.
Full check 217 tests/18 suites; focused Files sau bổ sung 42/42; HTTP 19/19 pass.
Chi tiết thực tế/config/giới hạn: [runbook](../PHASE_3_2_FILES_RUNBOOK.md).
Các mục baseline và đề xuất dưới đây giữ lịch sử thiết kế trước triển khai;
progress/runbook ghi đầu ra hiện tại. Chưa deploy/migrate development hoặc VPS.
User xác nhận 3.1 đã xong và pass toàn bộ; progress 3.1 ghi full local gates
171 tests/16 suites và HTTP 5/5 pass, không skip. Đây là baseline đầu vào đã đạt.

Plan tổng: [Phase 3](./PHASE_3_FILES_MATERIALS.md).
Contract đầu vào: [Phase 3.1](./PHASE_3_1_POLICY_CONTRACT.md).
Tiến độ riêng: [Phase 3.2](../progress/PHASE_3_2_PROGRESS.md).

## 1. Mục tiêu và giới hạn slice

Manager hoặc Mentor đúng assignment có thể tạo upload intent, PUT file lên
private MinIO, complete và theo dõi kết quả **READY/FAILED**. Backend xác minh
binary thật, giữ đúng object version và phục hồi được khi worker/storage lỗi.

READY chỉ chứng minh binary hợp lệ theo policy upload. Không đồng nghĩa Manager
đã duyệt nội dung, Material đã công bố hoặc Student có quyền đọc.

| Làm trong 3.2 | Bàn giao phase sau |
|---|---|
| FilesModule, migration file_objects/file_metadata/file_processing_jobs | Materials migration/CRUD/draft/submit/review/release: 3.3 |
| Private MinIO local/test, adapter và ký PUT staging | Material preview/Student download theo policy: 3.4 |
| Intent/complete/detail; kiểm Manager/Mentor và Course Unit ancestry | Extractor, thumbnail, metadata chuyên sâu, purge/retention: 3.5 |
| Worker VALIDATE có lease, retry, fencing và version pinning | Staging/VPS rollout + hành trình tích hợp 2.3: 3.6 |
| Xác minh size/type/container/text/SHA-256; expire intent chưa complete | DELETE file công khai, cleanup staging/orphan/version tự động: 3.5 |
| Provider READY reference cho Materials và test race liên quan | Assignment, Q&A, student code, avatar/course image: ngoài slice |

Metadata tối thiểu và job EXTRACT được ghi cùng commit READY để 3.5 tiếp nối.
3.2 chỉ claim VALIDATE; không claim EXTRACT/PURGE khi chưa có handler, không báo
metadata đã extracted và không coi cleanup tự động đã hoàn thành.

## 2. Baseline 3.1 trước triển khai 3.2 và phần kế thừa

Nguồn nghiệp vụ: [Flow.txt](../../document/Flow.txt),
[Course flow](../../document/COURSE_FLOW.md),
[core business logic](../CORE_BUSINESS_LOGIC.md),
[DBML](../../document/mindy_center_full.dbml) và D1–D6 đã duyệt ở 3.1.
Khi roadmap cũ khác D1–D6, dùng contract 3.1 hiện hành cho slice này.

Đối chiếu source và [evidence 3.1](../progress/PHASE_3_1_PROGRESS.md):

- Role MANAGER, migration khôi phục role và policy/contract D1–D6 đã hoàn tất
  local. `pnpm check` pass 171 tests/16 suites + lint/type-check/build,
  `pnpm test:http` pass 5/5; có 61 domain + 6 PostgreSQL policy integration tests.
- MaterialsModule đã đăng ký trong AppModule và export MaterialPolicyService;
  có domain access/review/revision/audit và declaration allowlist. Chưa có
  Material entity/controller/persistence hoặc Files/MinIO adapter.
- `MaterialPolicyService.authorizeUpload(principal, scope, declaration, manager?)`
  đã kiểm current user/role, Manager/Mentor, Catalog/Class ancestry và declaration;
  trả `{ courseUnitId, classContext, fileRule }`. Tái dùng semantics này, không
  viết một bộ quyền/MIME/size khác cho upload.
- `CoursesService.getUnitContext(courseUnitId, manager?)` trả Course Unit/Course
  context hoặc null; đã có integration evidence qua facade 3.1.
- `ClassContentContextService.getUnit(classUnitId, expectedClassId?, manager?)`
  đã có và được ClassesModule export. `getCourseUnitInClass()`/`getSession()`
  phục vụ context tương ứng, không lộ entity/meeting URL.
- `MaterialFileReference` đã chốt `{ id, ownerUserId, courseUnitId, status }`.
  File provider 3.2 trả đúng contract từ persistence server; verified summary
  bổ sung filename/MIME/size/kind, storage version giữ nội bộ.
- `MaterialSnapshot.firstApprovedAt` và `createdInClassId` đã có trong contract
  để bảo vệ bản từng duyệt/provenance. Files không ghi các field review này;
  Materials persistence 3.3 phải giữ chúng khi dùng READY file.
- DBML có file_objects/file_metadata, chưa có file_processing_jobs; enum
  file_status chưa có PROCESSING. Chưa có FilesModule/SDK storage trong package.
- Env hiện có MINIO_ENABLED/endpoint/port/SSL/credentials/bucket, nhưng compose
  local/production chưa có MinIO. Env không phải evidence storage hoạt động.
- App đang dùng ESM/import `.js`, UUID v4, TypeORM, `synchronize=false`, DTO/error
  envelope và cookie auth/Origin theo baseline. Giữ các quy ước này.

**Prerequisite 3.1 đã đạt; không còn bước chờ bàn giao.** 3.2 bắt đầu bằng storage
spike và tổ chức quyền upload theo mục 9 để giữ một nguồn policy, tránh vòng
phụ thuộc khi Materials dùng Files. Không đánh đồng code chưa commit với phase
chưa hoàn tất; giữ các thay đổi source hiện có và chạy regression khi tích hợp.
Evidence trên là kết quả 3.1 đã ghi nhận, không phải lượt review plan chạy lại tests.

Phase 2.3 tiếp tục song song. Không cần chờ My Classes/calendar để làm upload,
nhưng phối hợp trước khi sửa file Classes chung. Người làm 3.2 sở hữu Files,
schema files/jobs và adapter; chỉ một người tạo migration, ghi reviewer trước merge.

## 3. Quyền upload và scope bất biến

Material owner vẫn là **Course Unit**, shared giữa các Class Unit tham chiếu nó.
Upload intent lưu Course Unit scope và provenance của Mentor; class context không
biến file/material thành tài liệu riêng của lớp.

| Actor | Create intent | Complete/detail |
|---|---|---|
| Active MANAGER | Course Unit tồn tại; không bắt buộc class context | Mọi intent trong phạm vi quản lý tài liệu chính |
| Active MENTOR | Bắt buộc classId + classUnitId; lớp đang gán cho chính Mentor, không CANCELLED; ancestry khớp courseUnitId | Chỉ file của mình; vẫn có assignment tại đúng lớp đã tạo intent |
| ADMIN/STUDENT hoặc role khác | 403; không kế thừa quyền Manager | 403 |
| Chưa đăng nhập/principal không còn hợp lệ | Theo auth baseline, không cấp intent | Theo auth baseline |

- Manager có thể upload cho Course Unit của Course chưa active để chuẩn bị nội
  dung. Unit LOCKED/unlockAt tương lai không chặn quản lý upload; release gate
  áp dụng Student ở 3.4. Không lấy entitlement Student làm quyền upload Mentor.
- Nếu client gửi class context, phải gửi đủ hai ID và backend kiểm ancestry kể
  cả với Manager. Missing ID hoặc Class Unit không thuộc classId trả 404;
  context resolve được nhưng khác courseUnitId/courseId trả 422
  MATERIAL_SCOPE_MISMATCH theo facade/test 3.1; Mentor sai assignment trả 403.
- File owner_user_id luôn lấy từ principal tạo intent, không nhận owner/role từ
  body. Không PATCH đổi owner/courseUnitId/provenance sau khi intent đã tạo.
- Complete/detail của Mentor resolve lại class context đã lưu, không nhận context
  mới để chuyển sang lớp khác. Mất assignment mất quyền thao tác dù cùng Course
  Unit còn ở một lớp khác; Manager vẫn xử lý file theo contract quản lý.
- Kiểm scope trong transaction ghi intent/complete qua provider public. Nếu cần
  khóa Class để serialize với reassignment/cancel, bổ sung phương thức trong
  Classes và thống nhất lock order với bên sở hữu, không khóa repository private.
- PUT đã ký là capability tồn tại đến TTL. Mất assignment chặn API tiếp theo;
  không hứa thu hồi PUT tức thì. Validation đã nhận hợp lệ có thể hoàn tất để
  giữ lifecycle nhất quán; READY không cấp quyền thao tác hoặc quyền Student.

## 4. Contract HTTP/DTO

Prefix `/api/v1`; cookie auth + active principal + role + Origin/CSRF baseline.
UUID v4, whitelist/forbid unknown fields, 422 validation. Controller chỉ gọi
application service, không trả entity hoặc storage response nguyên bản.

| Endpoint | Request | Response |
|---|---|---|
| POST `/files/upload-intents` | courseUnitId; classId/classUnitId theo quyền; originalFilename, declaredMimeType, declaredSizeBytes | 201 `{ fileId, uploadUrl, requiredHeaders, uploadUrlExpiresAt, intentExpiresAt }` |
| POST `/files/:fileId/complete` | Không có body nghiệp vụ; không nhận key/bucket/version/checksum | 202 status DTO nếu mới enqueue/đang PROCESSING; 200 nếu đã READY |
| GET `/files/:fileId` | Không nhận scope override | 200 status DTO sau kiểm owner/Manager và assignment hiện tại |

Create intent retry là intent mới, không hứa idempotency chưa có key contract.
Complete retry cùng fileId là idempotent và không tạo job mới.

Status DTO dự kiến: `id, status, originalFilename, courseUnitId, kind,
declaredSizeBytes, sizeBytes, mimeType, intentExpiresAt, readyAt,
metadataStatus, errorCode`. Trước READY, sizeBytes/mimeType/kind xác minh có thể
null; không trình bày declared MIME/size như kết quả đã xác minh. Date ISO 8601,
bigint chuyển JSON number nguyên an toàn. MetadataStatus null nếu chưa có row.

Filename 1–250 ký tự, không path separator/control character/CRLF và không khoảng
trắng đầu/cuối; reject thay vì tự trim declaration theo validator 3.1. Chỉ dùng
để hiển thị, không sinh object key từ tên file. declaredSizeBytes là số nguyên
an toàn > 0, trong giới hạn đúng loại. declaredMimeType dùng đúng allowlist
`material-file-policy.ts` đã pass; text/source đang dùng chung tập MIME ở mục 7,
không tự siết thành mapping MIME riêng cho từng extension trong 3.2.

Required headers phải đúng các header adapter thực sự ký/yêu cầu, được kiểm bằng
PUT từ browser/test client thật. Không giả định Content-Length luôn được SDK ký
hoặc browser tự đặt được; hard size limit được worker kiểm độc lập.

Upload response `Cache-Control: no-store`; GET status cũng no-store. Chỉ trả PUT
URL ở create intent, không lưu URL trong DB, không trả lại URL qua GET. Không có
GET download theo fileId trong 3.2. Final key/version, credentials, signed query
và extractor diagnostics không nằm trong DTO/log/Swagger examples.

| Lỗi | HTTP/code dự kiến |
|---|---|
| Body/UUID/filename/declared MIME-size không hợp lệ | 422 theo ValidationPipe |
| Không đủ role/ownership/assignment | 403 |
| ID không tồn tại hoặc Class Unit không thuộc classId | 404 theo Catalog/Classes provider |
| Context tồn tại nhưng khác Course Unit/Course; gửi thiếu cặp class context | 422 MATERIAL_SCOPE_MISMATCH theo policy 3.1; thiếu cặp cũng có thể bị DTO chặn 422 |
| Complete intent quá hạn, FAILED hoặc DELETED | 409 UPLOAD_EXPIRED / UPLOAD_FAILED / FILE_DELETED |
| Feature storage tắt | 503 FILE_STORAGE_DISABLED sau auth/authorization |
| Storage không sẵn sàng khi cần ký/cấp intent | 503 FILE_STORAGE_UNAVAILABLE |
| Validation async thất bại | GET 200, status FAILED + errorCode an toàn; complete tiếp theo 409 |

Error envelope theo baseline `{ statusCode, code, message, details?, requestId? }`.
Phân biệt lỗi payload vĩnh viễn với lỗi storage tạm thời; không trả stack/secret.

## 5. State machine và schema đề xuất

```text
PENDING_UPLOAD ── complete trước expiry ──> PROCESSING ── valid ──> READY
       │                                      └── invalid/retry exhausted ──> FAILED
       └── intent expired, chưa complete ──> FAILED (UPLOAD_EXPIRED)

DELETED là tombstone cho lifecycle 3.5; không có public DELETE trong 3.2.
```

Complete khóa file row, kiểm quyền/deadline/state, chuyển PROCESSING và ghi
VALIDATE job trong cùng transaction. PROCESSING lặp trả 202, READY lặp trả 200.
FAILED/DELETED terminal; muốn upload lại phải tạo intent mới.

Dùng serverNow/timestamptz; tại `now >= intentExpiresAt` không nhận complete mới.
Job được nhận trước deadline không bị expire chỉ vì đang retry sau deadline.
Expiry sweep tối thiểu của 3.2 chỉ chuyển PENDING_UPLOAD quá hạn thành FAILED,
serialize với complete bằng cùng file lock; chưa purge binary.

| Bảng | Field/invariant cần có |
|---|---|
| file_objects | id UUID v4, owner_user_id NOT NULL cho use case này, course_unit_id NOT NULL, intent_class_id/intent_class_unit_id nullable cùng nhau; declared MIME/size tách verified MIME/size; original name/extension/kind/status; bucket, staging key, pinned staging version, final key/version; SHA-256; intent expiry, processing/ready/deleted/updated timestamps, sanitized error code |
| file_metadata | Một row/file, FK RESTRICT; processing_status PENDING sau READY; giữ schema type-specific DBML nhưng nullable/bounded; không tạo preview ở 3.2 |
| file_processing_jobs | id/file_object_id/kind/status, attempts/max_attempts, available_at, lease_until/lease_token, current candidate key/version; bounded copy_candidates history lưu token/key/version của mọi attempt, error_code, created_at/updated_at/completed_at; unique `(file_object_id, kind)` |

- Bổ sung PROCESSING vào file_status trong DBML và migration mới; schema thực
  thi chưa có bảng files nên tạo bảng/enum mới theo migration thực tế, không sửa
  migration cũ hoặc assume DBML đã được apply.
- Đề xuất job kind VALIDATE/EXTRACT/PURGE; job status PENDING/PROCESSING/SUCCEEDED/
  FAILED. Retry cùng row, không thêm row để lách unique constraint.
- FK users/Course Unit/Class context RESTRICT. Composite ancestry/constraint
  trigger phải bảo vệ provenance Class Unit → đúng Class/Course Unit tại DB;
  FK từng ID riêng lẻ không chứng minh ancestry. Review SQL với owner Classes.
- CHECK declared size > 0; verified size > 0 khi READY; giới hạn bigint/metadata,
  attempts >= 0; PROCESSING job có lease/token; READY có verified MIME/size/SHA-256,
  final key/version và ready_at. Index status/intent expiry, owner/created_at,
  scope, job claim `(kind, status, available_at)` và lease expiry.
- Bucket/key do backend sinh, staging/final namespace khác nhau; final key unique.
  SHA-256 không unique, không tự deduplicate giữa users/Course Units.
- Copy candidate history là JSONB bounded theo max_attempts, ghi key/token trước
  I/O; không overwrite mất candidate cũ khi claim lại. Nếu copy timeout chưa biết
  version, vẫn giữ key để inventory đúng prefix/version ở 3.5, kể cả worker cũ
  hoàn tất copy sau khi lease đã bị thay. Không chỉ lưu candidate cuối cùng.
- Đồng bộ DBML/entity/migration với schema đã review khi implement; plan này
  chưa đổi DBML. Chạy clean DB + up/down/up trên DB test riêng; rollback production
  có binary/refs mới theo 3.6, không dùng down phá dữ liệu.

## 6. Storage adapter và luồng xác minh

FileStorage là token/interface trong Files, DI adapter MinIO; business service
không import SDK. Adapter phải hỗ trợ presign staging PUT, resolve object version,
copy từ source version cụ thể, đọc stream đúng version và trả version copy đích.
Chọn SDK/image pin phiên bản sau storage spike; package hiện tại chưa có SDK,
không ghi mặc định API SDK hỗ trợ version nếu chưa kiểm bằng integration thật.

1. **Intent:** validate DTO/role/scope; sinh UUID và staging key từ backend; lưu
   intent PENDING_UPLOAD. Ký URL ngoài transaction. Nếu ký thất bại, đóng intent
   thành FAILED có error code thay vì để API 503 nhưng DB có intent dùng được.
2. **PUT:** client upload trực tiếp staging trong private bucket, TTL 600s;
   intent TTL 1.800s. PUT không đồng nghĩa backend đã nhận/xác minh file.
3. **Complete:** transaction ngắn khóa file + enqueue unique VALIDATE; trả 202.
   Không HEAD/copy/extract trong transaction và không nhận checksum client để READY.
4. **Claim:** worker nhận lease token; resolve staging version một lần và lưu
   pinned version dưới fencing. Không tự chuyển sang staging latest khi retry.
5. **Preflight/copy:** HEAD đúng source version để reject size rõ ràng quá giới
   hạn/không khớp declared size. HEAD không thay binary validation. Ghi candidate
   final key theo fileId/attempt token vào history trước copy; copy đúng pinned source version
   sang namespace final không cấp PUT cho client, ghi destination version.
6. **Validate:** đọc đúng candidate final version, đếm bytes thực, kiểm MIME/
   signature/container/text và tính SHA-256 bằng stream có giới hạn. Vượt hard
   cap/timeout phải ngắt; verified size phải bằng declared size và đúng allowlist.
7. **Commit:** transaction kiểm lease token chưa hết hạn/file còn PROCESSING;
   ghi final key/version + verified metadata + READY, job VALIDATE SUCCEEDED,
   metadata PENDING và unique EXTRACT job cùng commit. Không có khoảng READY
   thiếu thông tin version hoặc mất extraction job.
8. **Failure:** payload sai → FAILED ngay; lỗi tạm thời retry có giới hạn. Đích
   copy chưa được commit phải còn provenance để 3.5 tìm orphan, không purge tùy
   ý object đang được worker khác dùng.

**Bảo vệ overwrite:** PUT staging lần hai không đổi version đã pin; final key
không cấp PUT và READY không bị complete lại làm đổi binary. Backend lưu final
version đã validate; provider download 3.4 bắt buộc ký đúng version đó, không lấy
latest. Versioning bucket là startup/capability gate phải kiểm, không fallback
âm thầm về latest nếu storage không đáp ứng.

**Crash recovery:** crash sau copy/trước lưu version phải recover candidate của
attempt được lưu, hoặc copy lại từ pinned source sang candidate mới có provenance;
luôn validate version sẽ commit. Worker cũ không được commit/tạo thêm EXTRACT job
sau khi mất lease. Không yêu cầu storage và PostgreSQL atomic transaction.

Presigned PUT không được coi là hard ingress size cap nếu chưa có evidence.
Trước enable upload ở staging, phải kiểm giới hạn request/storage capacity và
giới hạn intent đang mở theo actor để tránh staging tăng vô hạn. Cơ chế cleanup
tự động ở 3.5; local test có teardown bucket/volume riêng và danh sách orphan.

## 7. Allowlist và validation bắt buộc trong 3.2

| Loại | Extension | Giới hạn | Xác minh tối thiểu |
|---|---|---|---|
| PDF | .pdf | 25 MiB | Signature + cấu trúc parse được trong resource bounds |
| Image | .png, .jpg, .jpeg | 25 MiB | Type thực và decode/header cấu trúc hợp lệ, giới hạn dimensions |
| Office | .docx, .pptx, .xlsx | 25 MiB | ZIP structure + loại Office đúng extension/MIME, required entries/content types |
| Audio | .mp3 | 25 MiB | MP3 container/frames hợp lệ; không chỉ dựa ID3 prefix |
| Video | .mp4 | 200 MiB | MP4 container parse hợp lệ; không chỉ chuỗi ftyp |
| Source/text | .txt/.md/.csv/.json/.js/.ts/.py/.java/.c/.cpp/.h/.css/.sql | 25 MiB | UTF-8 hợp lệ, không NUL/binary; không thực thi source hoặc bắt buộc code/JSON phải hợp lệ cú pháp |

MiB = 1.048.576 bytes; giới hạn là inclusive. File rỗng, extension cuối ngoài
allowlist, extension/MIME/signature không khớp, executable/HTML/SVG/generic archive
bị từ chối. Tên nhiều dấu chấm như `lesson.v1.pdf` vẫn hợp lệ nếu binary đúng PDF;
không suy ra binary an toàn chỉ từ extension cuối.

SOURCE_CODE/text kế thừa tập declared MIME chung đã pass ở 3.1:
`text/plain`, `text/markdown`, `text/csv`, `application/json`, `text/javascript`,
`application/javascript`, `text/css`. Không chờ detector xác định đúng ngôn ngữ
hoặc tự đòi source phải compile/JSON phải parse được. Verified MIME cho nhóm này
do validator UTF-8 xác nhận cùng mapping đã test, không lấy nhãn detector đơn lẻ
làm lý do reject declaration hợp lệ. SHA-256 server tính; ETag không thay checksum.

Office validation dùng bounded ZIP parser: giới hạn entry count, tổng bytes
decompressed, compression ratio và thời gian; không extract path client vào
filesystem. Reject encrypted/password-protected hoặc macro-enabled format ngoài
allowlist; lỗi parser không được fallback READY. Numeric parser/resource limits
phải ghi vào config/test trước merge. Đây là validation cấu trúc; metadata sâu/
thumbnail ở 3.5 không được dùng làm lý do hoãn kiểm binary ở 3.2.

Không giữ toàn bộ MP4 200 MiB trong RAM. Nếu validator cần seek/scratch thì stream
ra volume/tmpfs worker bounded riêng; `/tmp` production hiện 64 MiB không đủ.
Không thêm compiler/judge hoặc chạy nội dung upload.

## 8. Worker, config và vận hành local

- PostgreSQL jobs là nguồn durable truth, không cần bật Redis cho 3.2. Claim
  `FOR UPDATE SKIP LOCKED` trong transaction ngắn; bỏ qua job kind chưa có handler.
- Defaults kế thừa 3.1: poll 5s, concurrency 2, lease 300s, heartbeat 30s,
  tối đa 5 attempts cho lỗi tạm thời. Backoff exponential có jitter/cap; cấu hình
  retry/validation timeout phải hữu hạn và kiểm bằng test crash/outage.
- Heartbeat/commit đều WHERE lease_token đúng và lease chưa hết hạn. Lease mất
  thì dừng I/O nếu có thể và không ghi kết quả. Worker shutdown ngừng claim,
  hoàn tất trong grace hoặc để lease phục hồi; không reset mọi job khi API restart.
- Thiết kế có thể chạy nhiều replica mà không nhân job/READY; không chỉ dựa cờ
  in-memory. Worker lỗi không làm chết API/payment worker.
- Log/audit fileId, actorId, courseUnitId, jobId, transition/attempt/errorCode;
  không log presigned URL/credentials/payload. Đếm queue depth, lease expired,
  retry/failure và thời gian validate; status DTO có errorCode đủ để vận hành.

Giữ MINIO_ENABLED mặc định false và env keys hiện có. Config mới dự kiến:
public endpoint/base URL riêng để ký PUT đúng host/path/TLS; TTL PUT/intent;
limits bytes theo loại; worker enable/poll/concurrency/lease/heartbeat/attempts;
validation timeout/scratch/parser bounds và giới hạn open intents. Tên env cuối
cùng đồng bộ environment.schema.ts, env examples và runbook lúc implement.
Khi MINIO_ENABLED=true, validate credentials/endpoint và kiểm private bucket +
versioning; capability fail đóng upload feature với 503. Khi false, không cần
MinIO/credentials và auth/catalog/payment/health baseline tiếp tục hoạt động.

Local/test compose thêm MinIO image pin, data volume và bucket riêng; provisioning
bucket/versioning/CORS làm bằng setup task rõ ràng, không tự dùng root credentials
trong API. Test tenant/bucket/DB riêng, CORS origins/headers cụ thể; anonymous
GET/PUT/LIST phải bị chặn. Public/internal endpoint tách để URL dùng được từ
browser, không sửa host URL sau khi ký. Không tự đặt domain hoặc sửa production
compose/deploy trong lượt planning.

## 9. Biên module và đầu ra code dự kiến

```text
FilesModule -> AuthModule, UsersModule, CatalogModule, ClassesModule
MaterialsModule -> FilesModule (tích hợp facade upload ngay 3.2; refs/CRUD ở 3.3)

Files không import Materials; Catalog/Classes không import Files.
```

**Tái dùng policy 3.1 mà không tạo cycle:** không để FilesModule import
MaterialsModule để gọi facade hiện tại, vì Materials sẽ cần Files khi attach/
download. Trong 3.2 chuyển phần upload declaration/scope authorization sang
Files-owned `FileUploadPolicyService` và public file-policy contracts; giữ nguyên
semantics/return shape/errors. `MaterialPolicyService.authorizeUpload()` giữ
chữ ký public hiện tại và delegate provider mới; review/access domain vẫn ở
Materials. MaterialsModule import FilesModule, chiều phụ thuộc duy nhất.

Không copy allowlist/role rules thành hai bộ. Chuyển validator hiện có sang public
Files boundary; cập nhật import/DI fixture 3.1 mà giữ toàn bộ assertions và mã lỗi
đã pass. Các error codes MATERIAL_CONTENT_INVALID/MATERIAL_SCOPE_MISMATCH/
MATERIAL_ACCESS_DENIED của contract upload giữ tương thích bằng mapping adapter;
không để domain Files import private exception/type của Materials. Test Nest DI
và app boot để phát hiện module cycle, không dùng forwardRef hoặc fake provider.
Đây là refactor có kiểm chứng trong implementation 3.2, chưa làm ở lượt review plan.

File layout dự kiến theo convention repo:

- `src/modules/files/files.module.ts`, `controllers/files.controller.ts`.
- `dtos/create-upload-intent.dto.ts`, `upload-intent.dto.ts`, `file-status.dto.ts`.
- Public contracts/exports cho policy/file summary; `domain/file-storage.ts`,
  `file-upload-policy.ts` (chuyển declaration validator 3.1), `file-validation.ts` và enums.
- `entities/file-object.entity.ts`, `file-metadata.entity.ts`, `file-processing-job.entity.ts`.
- `services/files.service.ts`, `file-upload-policy.service.ts`, `file-reference.service.ts`, `file-processing.worker.ts`.
- `storage/minio-file-storage.ts`, `validation/` cho validator theo loại thật sự cần.
- Migration mới, app/module registration, config/env examples, DBML, local/test
  MinIO setup, Swagger/Postman upload examples và test fixtures.

Public file reference provider nhận principal + Course Unit + fileId + transaction
manager, khóa file row và assert READY/verified version/scope. Mentor chỉ attach
file của mình đúng provenance và assignment; Manager được dùng READY file cùng
Course Unit theo quyền quản lý. Trả immutable summary, không export repository.
Materials 3.3 phải insert FK/reference trong cùng transaction giữ file lock;
file READY không bỏ qua material review. Test READY/scope/lock tại 3.2 bằng
transaction fixture; test attach/delete/purge end-to-end nằm ở 3.3/3.5 khi có refs.

## 10. Thứ tự triển khai và gate từng bước

| Bước | Công việc | Đầu ra/gate |
|---|---|---|
| 3.2.1 Storage spike | Baseline 3.1 đã đạt; test SDK/image, private bucket, versioning, presign/copy/read version | Bằng chứng storage thật; pin dependency/image sau kiểm; không triển khai latest fallback |
| 3.2.2 Intent vertical slice + policy integration | Migration/FilesModule/adapter/config/DTO; chuyển upload policy và facade delegation theo mục 9 | Manager/Mentor tạo intent/PUT thật; mã lỗi/declaration 3.1 giữ tương thích; app DI không cycle |
| 3.2.3 Complete + status + jobs | Row lock/state/deadline/unique job/expiry sweep; controller GET/complete | Complete lặp/concurrent chỉ một job; status DTO không lộ storage internals |
| 3.2.4 Validation worker | Claim/lease/version snapshot/copy/validators/hash/fenced commit/retry | Mỗi loại allowlist có valid + invalid fixture; READY đúng bytes/version |
| 3.2.5 Recovery + reference provider | Crash/outage/staging overwrite/worker race; READY attach scope | Retry không đổi READY, stale worker không commit, orphan có provenance |
| 3.2.6 Slice acceptance + handoff | Full checks, clean migration, MinIO/HTTP tests, tài liệu evidence | Bàn giao file/reference contract cho 3.3; chưa đánh dấu 3.4–3.6 hoàn tất |

Ước lượng sơ bộ **5–8 ngày công** từ baseline 3.1 đã pass: spike/schema/intent 1–2,
jobs/complete 1, validators/recovery 2–3, gates/docs 1–2. Chốt lại sau storage
spike; chưa là cam kết lịch, chưa gồm staging/VPS hoặc extractor 3.5.

## 11. Ma trận test và nghiệm thu

| Nhóm | Ca bắt buộc | Kết quả |
|---|---|---|
| RBAC | Manager/Mentor/Student/Admin, không auth, principal bị vô hiệu | Chỉ Manager/Mentor đủ scope có intent/status/complete |
| Scope | Sai class/Unit/Course Unit, Mentor khác, mất assignment hoặc class CANCELLED | 403/404/422 đúng facade 3.1; không đổi provenance bằng input mới |
| Policy compatibility/DI | Validator/facade chuyển sang Files; text MIME chung, filename nhiều dấu chấm/case/whitespace; Nest app boot | Assertions 3.1 giữ pass, một nguồn allowlist; không module cycle |
| DTO | UUID sai, field lạ, size 0/negative/fraction/unsafe/over-limit, filename/extension/MIME sai | 422, không tạo intent/URL |
| Storage | Private bucket, CORS/browser PUT, public/internal signer, versioning thiếu, feature off/outage | PUT đúng URL; anonymous bị chặn; thiếu capability trả 503 |
| Binary | Valid + truncated/mismatched fixture cho mọi loại; text binary/UTF-8 lỗi, Office wrong container/ZIP bomb | Chỉ binary hợp lệ READY; failure hữu hạn/resource bounded |
| Bounds | Đúng giới hạn và hơn 1 byte, actual khác declared, stream dài hơn HEAD, timeout | Đếm bytes thật; abort/fail, không READY |
| Idempotency | Complete lặp và hai request đồng thời, READY complete lại | Một VALIDATE job, không thay readyAt/version/hash |
| Deadline | Complete trước/đúng/sau expiry; expiry sweep đua complete; PROCESSING qua expiry | Đúng deadline/row lock; job đã nhận không bị sweep làm FAILED |
| Version | PUT staging A rồi B trước/sau pin; overwrite sau READY; storage latest khác version đã validate | READY luôn chỉ đúng snapshot đã pin/validate |
| Worker race | Hai worker claim, heartbeat, lease hết hạn, stale commit | Một winner; token cũ không ghi READY/metadata/job |
| Crash/outage | Dừng sau claim/copy/validate, trước/sau commit; restart DB/MinIO tạm thời; copy cũ hoàn tất muộn | Retry hữu hạn, không mất job; history giữ mọi candidate/orphan qua retry |
| Atomic READY | Transaction rollback khi tạo metadata/EXTRACT job | Không READY nửa chừng; retry đúng pinned version |
| Reference | File chưa READY, sai Course Unit/owner/provenance, row lock đồng thời | Provider chặn attach sai; lock giữ đến caller commit |
| Regression | MINIO_ENABLED=false; auth/role, catalog/classes, checkout/CASH/PayOS/mail; 2.3 khi đã merge | Full gates không bị Files phá; không coi fixture là payment live |

Test levels: unit policy/state/validator, PostgreSQL transaction/migration/jobs,
MinIO thật với versioning và built-app HTTP. Fake storage chỉ dùng unit/outage
control; không thay evidence presign/copy/version thật. Critical suites thiếu
DB/MinIO phải báo thiếu prerequisite/fail gate, không silently skip để nhận pass.

Khi implement chạy `pnpm check`, `pnpm test:http`, clean migrations + up/down/up
và storage integration gate với fixture DB/bucket riêng. Test hiện tại chưa có
storage command riêng: thêm setup/command rõ ràng khi triển khai, ghi số tests/
suites/skips và lỗi đã sửa. Chỉ đổi plan thì kiểm diff/link, không ghi test BE pass.

## 12. Definition of done và bàn giao

- [x] Dependency 3.1 hoàn tất và full local gates pass theo progress/User xác nhận.
- [x] Tích hợp/refactor upload policy giữ semantics/error/assertions 3.1; không module cycle.
- [x] Manager/Mentor đúng scope upload thật → complete → READY/FAILED trên private MinIO.
- [x] Complete concurrent/expiry/recovery/outage/lease/version tests có evidence local.
- [x] Binary allowlist/limits/structure/hash được kiểm trước READY, resource bounded.
- [x] Migration/entity/DBML/config/API DTO/Swagger/Postman đồng bộ; không lộ key/secret/URL trong status.
- [x] READY commit có metadata PENDING + EXTRACT job atomic; 3.2 chưa chạy extractor.
- [x] File reference provider bàn giao cho 3.3, row lock/scope test pass.
- [x] Full local gates và test DB/MinIO pass, không skip critical case.
- [x] Progress riêng/tổng ghi rõ local evidence và phần thiếu; Codex tạo/rà soát SQL, human PR review trước merge còn riêng.

Bàn giao 3.3: fileId READY, immutable verified summary, Course Unit/owner/provenance,
provider assert/lock reference và error contract; READY vẫn phải qua draft/review.
Bàn giao 3.5: metadata/jobs PENDING, candidate/orphan provenance, expiry/error data,
cleanup/retention còn mở. Bàn giao 3.6: setup local/test, image/SDK pin và capability
evidence; staging endpoint/HTTPS/CORS/capacity/VPS rollout chưa nghiệm thu ở 3.2.

Lượt planning ban đầu không tạo Files code/migration. Implementation hiện có
evidence trong progress riêng. CASH pending chỉ preview, assigned mentor cash confirm,
verified PayOS settlement và online email giữ theo baseline.
