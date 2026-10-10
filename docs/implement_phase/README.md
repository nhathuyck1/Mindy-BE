# Implementation phases

Thư mục này chuyển các milestone cấp cao trong `CORE_FLOW_IMPLEMENTATION_PLAN.md`
thành kế hoạch triển khai có thể giao việc và nghiệm thu.

## Thứ tự thực hiện

1. [Phase 0 — Foundation, database và deployment baseline](./phase%201/PHASE_0_FOUNDATION.md)
2. [Phase 1 — Registration, users, Google/password authentication và authorization baseline](./phase%201/PHASE_1_IDENTITY_AUTH.md)
3. [Phase 2 — Course registration, checkout, payment và enrollment](./phase2/PHASE_2_COURSE_TO_PAYMENT.md)
4. [Phase 2.1 — Test webhook PayOS trên server, confirm đã pass](./phase2/PHASE_2_1_WEBHOOK_VPS_PAYOS.md)
5. [Phase 2.2 — Tích hợp payOS vào BE và nghiệm thu giao dịch thật](./phase2/PHASE_2_2_PAYOS_BE_REAL_PAYMENT.md)
6. [Phase 2.3 — My Classes + Personal Schedule](./phase2/PHASE_2_3_MY_CLASSES_SCHEDULE.md)
7. [Phase 3 — File + Materials](./phase%203/PHASE_3_FILES_MATERIALS.md)
8. [Phase 3.1 — Policy + Contract, D1–D6 đã code và test local](./phase%203/PHASE_3_1_POLICY_CONTRACT.md)
9. [Phase 3.2 — Upload private và xác minh file, đã nghiệm thu local](./phase%203/PHASE_3_2_SAFE_UPLOAD.md)

Phase 2.3 đã implement; các suite PostgreSQL/HTTP hiện có pass local ngày 2026-10-10.
Xem [contract FE](../PHASE_2_3_FE_CONTRACT.md) và progress bên dưới.

Điều phối hiện hành: người khác làm Phase 2.3, user làm Phase 3 song song;
thứ tự danh sách trên là roadmap, không yêu cầu chờ 2.3 để bắt đầu P3.
Phase 2.3 hoàn thiện Student đăng ký lớp → danh sách lớp → detail/preview → lịch;
xem [PHASE_2_3_PROGRESS.md](../progress/phase%202/PHASE_2_3_PROGRESS.md). Phase 3 ưu tiên
3.1 quyền/contract, 3.2 upload an toàn, 3.3 quản lý tài liệu, 3.4 Student đọc/tải,
3.5 metadata/cleanup và 3.6 nghiệm thu/tích hợp; 3.1 đã có role MANAGER,
policy/domain transitions và context providers. 3.2 có upload/storage/validation API;
review/material persistence API tiếp tục ở 3.3.

3.1 policy/contract đã hoàn tất và full local gates pass (171 tests/16 suites,
HTTP 5/5). 3.2 hoàn tất local: full check 217 tests, focused Files 42,
HTTP 19 pass; upload policy theo chiều Materials → Files giữ contract/errors 3.1.
Theo dõi tại [PHASE_3_2_PROGRESS.md](../progress/phase%203/PHASE_3_2_PROGRESS.md) và
[runbook](../PHASE_3_2_FILES_RUNBOOK.md). Chưa deploy/migrate dev hoặc VPS.

Phase 3 đã chốt D1–D6 ngày 2026-10-09: Course Unit 1–N Material, tài liệu chính
shared giữa các lớp; Manager quản lý/sửa/duyệt, Mentor upload chờ duyệt;
Student ACTIVE còn phải qua unit release/approval/publication. Theo dõi tại
[PHASE_3_PROGRESS.md](../progress/phase%203/PHASE_3_PROGRESS.md).

Kế hoạch tiếp nối sau checkout:
[Webhook VPS → PayOS BE → deploy test](./phase2/PHASE_2_WEBHOOK_VPS_PAYOS_PLAN.md).
Kế hoạch tiếp nối giữ thiết kế B–D và baseline lịch sử. Ngày 2026-10-05 webhook
server đã confirm pass; payment BE đã implement/test local theo Phase 2.2,
VPS payment/giao dịch thật chờ user thực hiện theo runbook. Các giới hạn test A1
vẫn được ghi riêng; xem progress riêng của Phase 2.2 để phân biệt evidence.

Mặc định các phase sau bắt đầu khi prerequisites/exit criteria liên quan đã đạt;
ngoại lệ và hạng mục còn mở phải ghi rõ. User đã yêu cầu lập Phase 2.2 sau confirm
webhook; các test A1 còn thiếu được kiểm chứng trước nghiệm thu live BE, không
đánh dấu toàn bộ Phase 0/1/2 đã hoàn tất. Mỗi phase phải là
một vertical slice chạy được từ migration đến API và test, không triển khai toàn bộ
entity trước rồi mới quay lại làm controller/service.

## Quy ước chung

- PostgreSQL là database duy nhất của core flow.
- TypeORM sở hữu entity và migration; `synchronize` luôn là `false`.
- Migration được commit vào Git và là nguồn sự thật thực thi của schema.
- Mỗi migration có đúng một người tạo trong một nhánh; người còn lại review SQL.
- Controller chỉ xử lý HTTP; business workflow nằm trong application service hoặc
  command/query handler.
- Không trả TypeORM entity trực tiếp ra API.
- Không dùng database production cho development hoặc integration test.
- Hoàn tất triển khai một phase phải cập nhật `docs/progress/Progress.md` và chạy
  `pnpm check`; thay đổi chỉ tài liệu kiểm tra diff/link, không ghi là đã chạy test BE.
- Đọc toàn bộ `document/Flow.txt` trước khi chốt rule nghiệp vụ; ghi rõ diễn giải
  triển khai và yêu cầu được hoãn, không bỏ cash preview/mentor confirmation/mail.

