# Phase 3.2 — Flow FE upload file

Cập nhật: 2026-10-10. Đã đối chiếu source trong checkout hiện tại;
chưa xác minh deployment hoặc browser upload trên VPS.

API chi tiết: [PHASE_3_2_flow-api-breakdown.md](PHASE_3_2_flow-api-breakdown.md).
Liên hệ với các phase khác: [flow 2.3 → 3.2](PHASE_2_3_TO_3_2_FLOW.md).

## Mục đích sản phẩm

Manager/Mentor chọn một file cho Course Unit → gửi bytes tới storage private →
backend xác minh file thật → FE nhận fileId READY hoặc trạng thái FAILED.
Đây là bước chuẩn bị file. Tạo Material, Manager duyệt và Student tải tài liệu
chưa có HTTP/persistence trong checkout này; nằm ở 3.3/3.4.

## Thứ tự FE thực hiện

1. Đăng nhập bằng MANAGER hoặc MENTOR; ADMIN/STUDENT không được gọi Files API.
2. Chọn Course Unit. Mentor cần thêm Class và Class Unit đúng assignment, cùng
   mapping classUnitId → courseUnitId. Không ghép unit theo title/position.
3. Chọn file, kiểm allowlist/kích thước để báo lỗi sớm; kiểm tra cuối cùng thuộc BE.
4. `POST /api/v1/files/upload-intents` với thông tin file/scope.
   Lưu fileId, uploadUrl, requiredHeaders và hai deadline trả về.
5. PUT raw File trực tiếp tới uploadUrl, đúng requiredHeaders; không FormData,
   không cookie/token API. Trong UI: “Đang tải file”.
6. Chỉ khi PUT thành công mới gọi `POST /api/v1/files/:fileId/complete` với `{}`.
   Response 202 nghĩa backend đã nhận yêu cầu xác minh, chưa phải file hợp lệ.
7. Poll `GET /api/v1/files/:fileId`. Trong UI: “Đang kiểm tra file”.
8. READY: dừng poll, lưu fileId, báo “File đã được xác minh”. Metadata PENDING
   không cản hoàn tất upload 3.2. FAILED: dừng poll, hiển thị lỗi và tạo intent mới
   nếu người dùng muốn upload lại. Không gọi complete lặp để sửa file FAILED.

## Điều kiện để FE gọi trên VPS

- Release có code/migrations Files và role MANAGER đã được deploy.
- MinIO thực sự chạy, bucket private có versioning và credentials của API hợp lệ.
- `MINIO_ENABLED=true`; worker tự chạy cần thêm `FILE_JOB_ENABLED=true`.
- MINIO_PUBLIC_URL là endpoint storage HTTPS mà browser truy cập được; BE và
  MinIO phải cho phép đúng origin FE. Không dùng localhost của container làm URL FE.
- Worker có scratch directory ghi được và đủ dung lượng; Linux có ffprobe.
- Account upload có role/assignment hợp lệ và FE có đúng scope IDs.

VPS đang MINIO_ENABLED=false theo thông tin user: uploader chưa dùng được ở đó.
Bật flag là một phần provisioning, không tự tạo MinIO/bucket/credentials.

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

- 2026-10-10: Viết hướng dẫn FE upload và breakdown ba API cùng PUT MinIO; ghi
  rõ state, error handling, polling và prerequisite VPS. Đối chiếu context IDs và
  phát hiện phần read API cho Mentor chưa đủ mapping. Không thay source/API/env,
  không kiểm chứng browser/VPS hoặc chạy lại runtime tests; kiểm link và diff tài liệu.
