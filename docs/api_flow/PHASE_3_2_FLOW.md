# Phase 3.2 — Flow FE upload file

Cập nhật: 2026-10-12. Phase 3.2 đã chốt theo xác nhận user nghiệm thu VPS xong.
Ảnh Postman/MinIO đã cung cấp cho PDF/MP4 READY; các ca còn lại ghi theo xác nhận
user, không nhận là agent tự chạy. Flow/Files API giữ nguyên, bàn giao cho 3.3.

API chi tiết: [PHASE_3_2_flow-api-breakdown.md](PHASE_3_2_flow-api-breakdown.md).
Liên hệ với các phase khác: [flow 2.3 → 3.2](PHASE_2_3_TO_3_2_FLOW.md).

## Mục đích sản phẩm

Manager/Mentor chọn một file cho Course Unit → gửi bytes tới storage private →
backend xác minh file thật → FE nhận fileId READY hoặc trạng thái FAILED.
Đây là bước chuẩn bị file. Tạo Material/Manager duyệt vẫn chờ3.3;
[ba Student FILE/VIDEO GET3.4](PHASE_3_4_FLOW.md) đã implement local ngày12/10,
cần Material approved và Class Unit released, không chỉ file READY.

## Thứ tự FE thực hiện

Account prerequisite: public registration chỉ tạo STUDENT. Khi chưa có Manager,
ADMIN login rồi POST `/api/v1/admin/users` với role MANAGER, password6..128,
email/displayName (phone optional) →201 ACTIVE. Login lại bằng Manager để dùng
cookie uploader; không cần email verify cho managed account, không dùng Admin
cookie gọi Files hoặc gửi role vào public register.

1. Đăng nhập bằng MANAGER hoặc MENTOR; ADMIN/STUDENT không được gọi Files API.
2. Chọn Course Unit. Mentor cần thêm Class và Class Unit đúng assignment, cùng
   mapping classUnitId → courseUnitId. Không ghép unit theo title/position.
3. Chọn file, kiểm allowlist/kích thước để báo lỗi sớm; kiểm tra cuối cùng thuộc BE.
4. `POST /api/v1/files/upload-intents` với thông tin file/scope.
   Lưu fileId, uploadUrl, requiredHeaders và hai deadline trả về.
5. PUT raw File trực tiếp tới uploadUrl, đúng requiredHeaders; không FormData,
   không cookie/token API. Trong UI: “Đang tải file”.
   Postman: binary picker phải hiện filename trước Send; chỉ bật binary nhưng
   còn `Select file` có thể gửi body rỗng và vẫn nhận200, sau đó size mismatch.
6. Chỉ khi PUT thành công mới gọi `POST /api/v1/files/:fileId/complete` với `{}`.
   Response 202 nghĩa backend đã nhận yêu cầu xác minh, chưa phải file hợp lệ.
7. Poll `GET /api/v1/files/:fileId`. Trong UI: “Đang kiểm tra file”.
8. READY: dừng poll, lưu fileId, báo “File đã được xác minh”. Metadata PENDING
   không cản hoàn tất upload 3.2. FAILED: dừng poll, hiển thị lỗi và tạo intent mới
   nếu người dùng muốn upload lại. Không gọi complete lặp để sửa file FAILED.

## Điều kiện để FE gọi trên VPS

User xác nhận nghiệm thu VPS xong ngày 2026-10-12. MinIO đã provision và upload
create intent → signed PUT → complete → READY có ảnh PDF/MP4 trên server.
[VPS runbook](../PHASE_3_2_VPS_MINIO_RUNBOOK.md) có compose override và một lệnh
tạo private bucket/versioning/backend user. Các điều kiện dưới đây là baseline
vận hành cần giữ sau nghiệm thu. API contract không đổi.

- Release có code/migrations Files và role MANAGER đã được deploy.
- MinIO thực sự chạy, bucket private có versioning và credentials của API hợp lệ.
- `MINIO_ENABLED=true`; worker tự chạy cần thêm `FILE_JOB_ENABLED=true`.
- MINIO_PUBLIC_URL là endpoint storage HTTPS mà browser truy cập được; BE và
  MinIO phải cho phép đúng origin FE. Không dùng localhost của container làm URL FE.
- Worker có scratch directory ghi được và đủ dung lượng; Linux có ffprobe.
- Account upload có role/assignment hợp lệ và FE có đúng scope IDs.

Files trên VPS đã hoạt động theo evidence READY. Bật flag là một phần
provisioning, không tự tạo MinIO/bucket/credentials.

## Chỗ còn thiếu để có UI chọn unit đầy đủ

- Manager có thể lấy courseUnitId từ `GET /api/v1/courses/:courseId`, trường
  `units[].id`, đối với Course active mà public browse cho phép xem.
- Mentor có `GET /api/v1/mentor/classes` để lấy classId/courseId của lớp được
  phân công. Endpoint này chưa trả units hoặc mapping sang Course Unit.
- Public class detail chỉ cho Class OPEN và `units[]` không chứa courseUnitId.
  Nó không thay thế màn hình nội bộ cho lớp đang dạy hoặc mapping upload.
- Admin detail có mapping nhưng chỉ role ADMIN được gọi; ADMIN lại không được
  upload. FE không dùng account Admin để vượt quyền chọn scope cho Mentor/Manager.
- Cần bổ sung read API/context đúng quyền cho các trường hợp còn thiếu để FE
  chọn unit tự nhiên. Chưa triển khai API đó trong lượt tài liệu này.
- Chưa có Files collection/list hoặc public DELETE/download route ở 3.2. FE chỉ
  theo dõi fileId đã biết; không hứa có thư viện file đầy đủ chỉ từ ba API này.

## Nhật ký công việc

- 2026-10-12: Chốt 3.2 theo xác nhận user nghiệm thu VPS xong. Bằng chứng ảnh
  PDF/MP4 READY giữ nguyên; các ca còn lại theo xác nhận user, không có log riêng
  trong chat. Không đổi flow/API/source, không chạy BE tests/deploy mới. Các mốc
  chưa chốt bên dưới là lịch sử; bàn giao fileId READY/reference contract cho 3.3.

- 2026-10-11: ảnh Postman MP4 VPS READY, fileId
  `91f575a9-df4b-4b33-b8c8-7680619244e2`, khai báo/thực tế 1583534 bytes,
  video/mp4, kind VIDEO, errorCode null, metadataStatus PENDING. Ảnh Console
  hiện object token tại final/<fileId>, bucket PRIVATE; truy cập Console qua
  SSH tunnel thành công theo user. PDF/MP4 happy paths pass; còn invalid binary,
  complete retry/quyền/anonymous access và browser CORS để chốt toàn slice.

- 2026-10-11, evidence PDF trước đó: ảnh Postman user VPS PDF `1.pdf` READY/HTTP200,
  fileId `5118b974-64fc-44b0-826f-58c1f9ba6c90`, khai báo/thực tế 75758 bytes,
  application/pdf, errorCode null, metadataStatus PENDING. PDF happy path pass;
  các mốc chưa READY bên dưới là lịch sử. Còn kiểm MP4, invalid binary,
  retry/quyền/private access và browser CORS; không coi toàn 3.2 đã nghiệm thu.
  GET files/:fileId chỉ trả trạng thái; download/read thuộc 3.4. Host storage
  là S3 endpoint private, không phải trang liệt kê file hoặc MinIO Console.

- 2026-10-11: User cung cấp ảnh VPS intent201/PUT200/complete PROCESSING/status
  FAILED FILE_SIZE_MISMATCH với declaration194470; PUT picker chưa hiện file.
  Hướng dẫn chọn binary file + retry intent mới; chưa xác nhận bytes nhận hoặc
  READY. Không lưu signed URL/cookies từ ảnh vào evidence.

- 2026-10-11: Đối chiếu managed users API/DTO/service và public registration để
  hướng dẫn tạo Manager bằng ADMIN trong Postman; không tự tạo user/đổi DB trên VPS.

- 2026-10-11: User báo public storage health200; hướng dẫn bật/recreate với
  matching public URL và giữ image hiện tại. Workflow chọn Files override nếu
  root env provisioning tồn tại để giữ scratch qua deploy sau. Contract giữ
  nguyên, public PUT/READY/browser CORS còn chờ nghiệm thu.

- 2026-10-11: User gửi output VPS provisioning ready (private/versioning/backend
  credentials). Tiếp tục hướng dẫn shared network + published storage route và
  health HTTP200; flag vẫn false tới khi route sẵn sàng. Chưa upload READY/CORS.

- 2026-10-11: User thông báo deploy xong; tiếp tục hướng dẫn tạo root/backend
  env, dựng/provision private versioned MinIO trước khi bật flag. Files API giữ
  nguyên, chưa có evidence storage/tunnel/browser upload READY.

- 2026-10-11: User gửi ảnh SSH: MINIO_ENABLED=false và recreate image `8aafd5a`
  Healthy, .git directory/env/base compose tồn tại. Ghi evidence API recovery;
  chưa upload READY hoặc browser CORS, không thay API/khẳng định release mới pass.

- 2026-10-11: Screenshot deploy kế tiếp fail ở checkout preflight trước rollout;
  thêm named condition errors và dirty status paths, giữ ff-only/clean checkout.
  Runtime diagnostics chỉ khi rollout fail. Ảnh SSH user dev/status clean; log
  mới `1258e24` chưa nêu condition, API cũ còn restarting. Probe 6 preflight
  mock cases/lint/diff/syntax pass; không đổi Files API hoặc đánh dấu VPS pass.

- 2026-10-11: Rà soát log deploy release `8aafd5a`: CI/build/migration pass,
  API bị báo unhealthy sau recreate. Runtime logs user cung cấp xác nhận MinIO
  bật nhưng access/secret key rỗng làm ConfigModule fail. Thêm env preflight
  trước migrate/API switch và diagnostics khi workflow thất bại; hướng dẫn tắt
  flag/recreate đúng image để khôi phục. Contract/API Files giữ nguyên; chưa
  SSH/khôi phục/xác minh runtime VPS.

- 2026-10-11: Chuẩn bị MinIO production override/provision/root env template/
  scratch/tunnel runbook; server acceptance thuộc slice 3.2 theo yêu cầu user.
  Kiểm lint/shell/Compose/diff/link, không chạy Docker image hoặc upload server.
  Không đổi route/request/response Files, không deploy hoặc migration mới.

- 2026-10-10: Viết hướng dẫn FE upload và breakdown ba API cùng PUT MinIO; ghi
  rõ state, error handling, polling và prerequisite VPS. Đối chiếu context IDs và
  phát hiện phần read API cho Mentor chưa đủ mapping. Không thay source/API/env,
  không kiểm chứng browser/VPS hoặc chạy lại runtime tests; kiểm link và diff tài liệu.
