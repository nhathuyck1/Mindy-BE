# Phase 3.2 — API breakdown cho FE upload

Cập nhật: 2026-10-10. Các Files API bên dưới đã implement trong repo; chưa xác
minh release đang chạy trên VPS. [Flow FE](PHASE_3_2_FLOW.md).

## 1. Contract chung

- BE prefix `/api/v1`; xác thực bằng cookie `access_token`. Browser gọi BE với
  `credentials: 'include'` hoặc Axios `withCredentials: true`; không cần tự đọc token.
- MANAGER hoặc MENTOR có user/session active. Manager không kế thừa quyền Admin.
  Mentor phải là người được phân công hiện tại; quyền được kiểm lại ở mọi request.
- Success response là **DTO JSON trực tiếp**, không có wrapper `{ data: ... }`.
  Axios `response.data` là thuộc tính của client, không phải envelope của BE.
- Files responses có `Cache-Control: no-store`. Không cache hoặc chia sẻ uploadUrl.
- Không có query/filter/pagination cho ba Files API này.
- Body không cho unknown fields; không gửi checksum, bucket, object key, ownerUserId
  hoặc status từ FE. Backend giữ storage identity và quyết định state.
- API CORS dùng CORS_ORIGINS; MinIO cần CORS riêng. Không tự thêm CSRF/header
  token vào signed PUT. Browser tự gửi Origin, FE không tự đặt header này.

Error BE có dạng:

```json
{
  "statusCode": 503,
  "code": "FILE_STORAGE_DISABLED",
  "message": "The file operation cannot be completed in its current state",
  "requestId": "example-request-id"
}
```

requestId/details có thể không có. message có thể là string hoặc array đối với
validation; FE dùng statusCode/code và details phù hợp, không chỉ so sánh message.

## 2. POST /api/v1/files/upload-intents

**Làm gì:** xin một lần upload cho một file/scope; BE tạo record PENDING_UPLOAD
và ký URL PUT. API này chỉ nhận JSON declaration, chưa nhận bytes của file.

**FE gọi lúc:** người dùng đã chọn unit và file, bấm Upload. Khóa nút khi request
đang chạy để không tạo intent trùng; API không có idempotency key do FE cung cấp.

| Body field | Kiểu / yêu cầu | FE lấy từ đâu |
|---|---|---|
| courseUnitId | UUID v4, bắt buộc | Course Unit đã chọn; không phải courseId/classUnitId |
| classId | UUID v4, bắt buộc với Mentor | Class đang được Mentor phân công |
| classUnitId | UUID v4, bắt buộc với Mentor | Class Unit thuộc Class và trỏ đúng courseUnitId |
| originalFilename | String 1–250 ký tự | file.name; không slash, control chars hoặc khoảng trắng ngoài cùng |
| declaredMimeType | String 1–150 ký tự, thuộc allowlist | MIME hợp lệ của format; không gửi file.type rỗng |
| declaredSizeBytes | Integer dương | file.size, theo bytes; không đổi sang MiB rồi gửi |

Manager có thể bỏ cả classId/classUnitId; nếu gửi phải gửi đủ cặp và khớp ancestry.
Không có sessionId/materialId trong request này.

Request minh họa cho Manager; dùng ID thật của unit và file.size thật khi chạy:

```json
{
  "courseUnitId": "11111111-1111-4111-8111-111111111111",
  "originalFilename": "lesson.pdf",
  "declaredMimeType": "application/pdf",
  "declaredSizeBytes": 128000
}
```

**Success: HTTP 201**, DTO trực tiếp:

```json
{
  "fileId": "22222222-2222-4222-8222-222222222222",
  "uploadUrl": "https://storage.example.com/<signed-path-and-query>",
  "requiredHeaders": { "content-type": "application/pdf" },
  "uploadUrlExpiresAt": "2026-10-10T14:10:00.000Z",
  "intentExpiresAt": "2026-10-10T14:30:00.000Z"
}
```

URL, timestamps và UUID ở trên là giả minh họa. Dùng nguyên URL thật BE trả về.

| Response field | FE sử dụng |
|---|---|
| fileId | Lưu để gọi complete/status; không dùng courseUnitId thay fileId |
| uploadUrl | URL tới MinIO, giữ nguyên path/query; không ghép API base URL vào |
| requiredHeaders | Gửi đúng toàn bộ headers khi PUT |
| uploadUrlExpiresAt | Deadline sử dụng URL PUT |
| intentExpiresAt | Deadline complete; khác deadline của URL PUT |

Default hiện tại: URL PUT 600 giây, intent 1800 giây; FE dùng timestamp response,
không hardcode deadline. Quota mặc định 20 intent chưa hết hạn/PROCESSING mỗi actor.

Nếu request create bị mất response, không có API lookup theo request key để lấy
lại URL đó. Chỉ tạo mới sau thao tác retry rõ ràng, không tự retry vô hạn.

## 3. PUT uploadUrl — request trực tiếp tới MinIO

**Làm gì:** gửi bytes vào staging object. Đây là storage operation, không phải
route NestJS `/files`. Không cần cookie API; quyền nằm trong URL đã ký.

**FE gọi lúc:** đã nhận upload intent, URL còn hạn. body là raw File/Blob.
Không FormData, không JSON/base64, không sửa Content-Type, không tự thêm token.

```js
const putResponse = await fetch(intent.uploadUrl, {
  method: 'PUT',
  headers: intent.requiredHeaders,
  body: file,
  credentials: 'omit',
  signal,
});
if (!putResponse.ok) {
  throw new Error(`Storage upload failed: ${putResponse.status}`);
}
```

Success thông thường HTTP 200; kiểm response.ok, không chờ JSON từ PUT. Chỉ
gọi complete sau success. Nếu muốn phần trăm upload, dùng upload progress của
XHR/Axios; fetch cơ bản không có callback phần trăm. PUT xong 100% chưa nghĩa READY.

Failure có thể là network/CORS/TLS hoặc XML error của S3, không phải error envelope
của BE. Với 403, kiểm URL expiry và headers, không xử lý như lỗi session BE.

Khi PUT thất bại rõ ràng và chưa gọi complete, người dùng có thể retry cùng file
qua URL còn hạn. Nếu không rõ bytes đã tới storage hay chưa, giữ fileId và kiểm
trạng thái; đừng tự gọi complete hoặc upload lại trong vòng lặp. Một khi complete
được chấp nhận thì không overwrite staging để thay file: worker pin version.
URL hết hạn: tạo intent mới; hiện chưa có API refresh uploadUrl của intent cũ.

## 4. POST /api/v1/files/:fileId/complete

**Làm gì:** chuyển PENDING_UPLOAD sang PROCESSING và tạo một VALIDATE job trong
PostgreSQL. Worker đọc file từ storage và kiểm binary bất đồng bộ. Không gửi bytes
lần nữa, và complete không phải Manager approve Material.

**Input:** fileId UUID v4 từ intent; cookie auth; Content-Type application/json;
body `{}`. Không thêm size/hash/status vào body.

**Success:**

- HTTP 202, FileStatusDto trực tiếp: file đang PROCESSING. Gọi lại khi PROCESSING
  vẫn 202, không enqueue trùng.
- HTTP 200, FileStatusDto trực tiếp: file đã READY. Gọi lại không tạo job mới.
- Không coi 202 là upload đã hợp lệ; chuyển UI sang “Đang kiểm tra file”.

Nếu response complete bị mất, GET status bằng fileId trước: PROCESSING/READY
thì không cần POST lại; nếu còn PENDING_UPLOAD, PUT trước đó đã thành công và
intent còn hạn thì có thể retry complete. FAILED/DELETED không được complete lại.

## 5. GET /api/v1/files/:fileId

**Làm gì:** đọc status của một fileId đã biết. Không trả file bytes/download URL,
không list tất cả files. Mentor chỉ đọc intent mình sở hữu và còn đủ assignment;
Manager có thể xử lý intent của Mentor theo policy hiện hành.

**FE gọi lúc:** sau complete, khi mở lại upload đang theo dõi hoặc khôi phục sau
mất response. Input chỉ path UUID v4, không body. Success HTTP 200.

Ví dụ READY; tất cả giá trị bên dưới là minh họa:

```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "status": "READY",
  "originalFilename": "lesson.pdf",
  "courseUnitId": "11111111-1111-4111-8111-111111111111",
  "declaredSizeBytes": 128000,
  "sizeBytes": 128000,
  "mimeType": "application/pdf",
  "kind": "PDF",
  "intentExpiresAt": "2026-10-10T14:30:00.000Z",
  "readyAt": "2026-10-10T14:01:00.000Z",
  "metadataStatus": "PENDING",
  "errorCode": null
}
```

Complete trả cùng FileStatusDto. Status response dùng `id`, intent response dùng
`fileId`; hai field cùng chỉ file đang upload.

| Field | Ý nghĩa |
|---|---|
| id/courseUnitId/originalFilename | Identity và scope/nhãn hiển thị |
| status | State machine của upload, xem bảng dưới |
| declaredSizeBytes | Kích thước FE đã khai báo |
| sizeBytes/mimeType/kind | Kết quả xác minh; nullable trước READY; kind là PDF/IMAGE/DOCUMENT/PRESENTATION/SPREADSHEET/AUDIO/VIDEO/SOURCE_CODE |
| intentExpiresAt | Deadline complete, không phải deadline xử lý job đã được chấp nhận |
| readyAt | ISO UTC timestamp hoặc null |
| metadataStatus | Nullable; PENDING sau READY trong 3.2, không cần chờ extraction |
| errorCode | Nullable; lỗi terminal của file nếu có |

| status | UI / hành động FE |
|---|---|
| PENDING_UPLOAD | Chưa complete; không hiển thị upload thành công chỉ vì có record |
| PROCESSING | Poll tiếp; không PUT lại file hoặc tạo intent mới tự động |
| READY | Dừng poll, lưu fileId và báo file hợp lệ |
| FAILED | Dừng poll, báo errorCode; người dùng chọn retry bằng intent mới |
| DELETED | Dừng poll; trạng thái được định nghĩa cho lifecycle, chưa có public DELETE ở 3.2 |

Polling đề xuất của FE, không phải contract BE: 2–3 giây/request, không chồng
request; dừng khi terminal, unmount hoặc mất quyền. Có thể đặt giới hạn chờ UI
và cho “Kiểm tra lại” thay vì kết luận FAILED. Intent deadline không hủy PROCESSING.
GET 200 + status FAILED là lỗi nghiệp vụ file, không phải HTTP success của upload.

## 6. Error handling

| HTTP/code | FE xử lý |
|---|---|
| 401 AUTHENTICATION_REQUIRED | Dừng polling; dùng flow refresh/login hiện có, không retry vô hạn |
| 403 INSUFFICIENT_ROLE | Không hiển thị uploader cho ADMIN/STUDENT |
| 403 MATERIAL_ACCESS_DENIED | Assignment/ownership/user role hiện tại không đủ; dừng và refetch context |
| 404 MATERIAL_NOT_FOUND / FILE_NOT_FOUND / CLASS_NOT_FOUND / CLASS_UNIT_NOT_FOUND | Scope/file không tồn tại hoặc ancestry lookup không khớp; yêu cầu chọn lại |
| 422 HTTP_ERROR | UUID/body/unknown fields/DTO sai; hiển thị message array phù hợp |
| 422 MATERIAL_SCOPE_MISMATCH | Kiểm lại cặp classId/classUnitId và courseUnitId |
| 422 MATERIAL_CONTENT_INVALID | Tên/MIME/size/extension không hợp lệ; sửa lựa chọn file |
| 429 FILE_UPLOAD_QUOTA_EXCEEDED | Quá nhiều upload đang mở; không tự tạo thêm intent |
| 503 FILE_STORAGE_DISABLED | Môi trường chưa bật storage; báo tính năng chưa sẵn sàng |
| 503 FILE_STORAGE_UNAVAILABLE | Storage/bucket/versioning/config có vấn đề; cho retry có giới hạn và báo BE |
| 409 UPLOAD_EXPIRED | Không complete được intent quá hạn; upload lại bằng intent mới |
| 409 UPLOAD_FAILED / FILE_DELETED | Record terminal, không complete lại |
| Network/5xx không rõ kết quả complete | GET status trước khi quyết định POST lại; giữ fileId |

FileStatusDto.errorCode không phải HTTP code. Các lỗi terminal đáng chú ý:
FILE_BINARY_INVALID, FILE_SIZE_MISMATCH, FILE_RETRY_EXHAUSTED, UPLOAD_EXPIRED.
Đối với FILE_RETRY_EXHAUSTED, báo lỗi xử lý/storage và cho người dùng kiểm tra lại;
không khẳng định người dùng gửi sai format. Worker retry lỗi tạm thời ở phía BE;
FE không POST complete mỗi lần poll.

## 7. File, scope và UI

- PDF application/pdf; PNG image/png; JPG/JPEG image/jpeg; DOCX/PPTX/XLSX MIME
  Office tương ứng; MP3 audio/mpeg; MP4 video/mp4. PDF/image/Office/MP3 tối đa 25 MiB;
  MP4 tối đa 200 MiB. Không nhận file rỗng.
- Text/source extensions: txt/md/csv/json/js/ts/py/java/c/cpp/h/css/sql, tối đa 25 MiB.
  Declared MIME cho nhóm này có thể là text/plain, text/markdown, text/csv,
  application/json, text/javascript, application/javascript hoặc text/css.
- Browser file.type có thể rỗng hoặc không đúng allowlist; FE cần mapping declaration
  đã kiểm tra. MIME khai báo không bỏ qua kiểm binary của backend.
- courseUnitId khác classUnitId. Manager có thể lấy units[].id từ public Course
  active detail. Mentor assigned class list chưa có unit mapping đầy đủ;
  xem [phần context còn thiếu](PHASE_3_2_FLOW.md#chỗ-còn-thiếu-để-có-ui-chọn-unit-đầy-đủ).
- Chưa có endpoint nội bộ Mentor detail cung cấp classUnitId/courseUnitId để
  bảo đảm UI chọn unit cho mọi trạng thái lớp. Không ghép bằng title/position,
  không dùng Admin route cho Manager/Mentor. Có thể test uploader bằng scope IDs
  được chuẩn bị hợp lệ, nhưng đó không phải UI lựa chọn hoàn chỉnh.
- Không có list Files, cancel/delete upload hoặc download API ở 3.2. Hủy UI/polling
  không hủy job phía server. Khi còn pending, intent expiry sẽ xử lý theo worker.
- Sau READY, refetch trạng thái cục bộ/record theo fileId. Không invalidate hoặc
  gọi Material list/create chưa tồn tại. Không đợi metadataStatus chuyển SUCCEEDED.
- Khi mất fileId và reload, chưa có Files collection để tìm lại toàn bộ upload;
  FE cần giữ reference của session upload phù hợp, không lưu signed URL dài hạn.

## 8. Checklist FE/BE trước tích hợp

1. BE deploy code/migrations, provision private versioned MinIO, cấu hình public
   HTTPS/CORS và scratch/ffprobe, bật MINIO_ENABLED + FILE_JOB_ENABLED.
2. Account Manager/Mentor hợp lệ; scope selection có nguồn IDs đúng quyền.
3. FE có file picker + declaration validation + gọi create/PUT/complete/status.
4. Kiểm browser thực tế: PUT preflight, cookie BE, MP3/MP4, READY/FAILED, expiry,
   assignment bị thu hồi và trường hợp response complete bị mất.
5. Tạo/gắn Material bằng fileId READY ở 3.3; Student xem/tải ở 3.4.

## Nguồn đối chiếu

- [Controller](../../src/modules/files/controllers/files.controller.ts)
- [Input DTO](../../src/modules/files/dtos/create-upload-intent.dto.ts)
- [Status/intent DTO](../../src/modules/files/dtos/file-status.dto.ts)
- [Files service](../../src/modules/files/services/files.service.ts)
- [Upload policy](../../src/modules/files/services/file-upload-policy.service.ts)
- [Allowlist](../../src/modules/files/domain/file-upload-policy.ts)
- [Worker](../../src/modules/files/services/file-processing.worker.ts)
- [Validation jobs](../../src/modules/files/services/file-processing.service.ts)
- [HTTP configuration](../../src/configure-app.ts)
- [Error envelope](../../src/filters/global-exception.filter.ts)
- [Public Course detail](../../src/modules/course-browse/dtos/public-course-detail.dto.ts)
- [Mentor class DTO](../../src/modules/payments/dtos/mentor-class-roster.dto.ts)
