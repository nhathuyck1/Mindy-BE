# Compiler v2 — triển khai server 04/11/2026

Đã được người dùng cho phép nâng cấp runner, cấu hình hai bên, nối network và restart.

## Trạng thái đã triển khai

- Backend: /home/mindycode/mindycoding/Mindy-BE/.env.production.
- Runner: /home/mindycode/mindycoding/compiler-runner/.
- Runner image mới: mindy-compiler:20261104-v2.
- Judge images: mindy-judge-node:1 và mindy-judge-java:1.
- Giữ backend image đang chạy: mindy-center-api:b6b69768875fa642665008a3ae8370a65e94e872.
- Backend và runner đã cùng network mindy-compiler; cả hai healthy.
- Runner legacy còn bật để phục vụ frontend cũ.
- Không chạy migration và không tạo/sửa dữ liệu assignment/submission trong lần triển khai này.

## Cấu hình

| Backend variable | Giá trị |
| --- | --- |
| CODE_RUNNER_URL | http://compiler-runner:4000 |
| CODE_RUNNER_TOKEN | Đã sinh ngẫu nhiên 64 ký tự, khớp RUNNER_TOKEN của runner; không ghi secret vào tài liệu |
| CODE_RUNNER_TIMEOUT_MS | 80000 |
| CODE_JUDGE_JOB_ENABLED | true |
| CODE_JUDGE_CONCURRENCY | 2 |
| CODE_RUN_PER_MINUTE | 10 |
| CODE_RUN_PER_DAY | 300 |

Runner dùng một slot interactive, hai slot batch và JUDGE_CPUS=1.
Hai file env chứa token được đặt quyền 600.

## Kiểm tra đã chạy trên server

- Validate toàn bộ env bằng schema của backend image: PASS.
- Build runner có chạy unit tests bên trong Dockerfile: thành công.
- Tám smoke check thực tế từ container backend: JavaScript/Java trả 42, compile error, timeout, output limit, runtime error, sai token, ngôn ngữ không hỗ trợ — tất cả PASS.
- Dùng chính driver, HttpCodeExecutor và grading domain trong backend đang triển khai để chạy một HIDDEN test: JavaScript và Java đều ACCEPTED 10.00.
- Backend live/ready và runner health trả HTTP 200.
- Legacy API vẫn hoạt động ở boundary, request thiếu code trả HTTP 400 như trước.
- Chưa chạy UAT tạo/nộp bài qua giao diện người dùng.

## Backup và rollback

Backup trên server:

    /home/mindycode/mindycoding/backups/compiler-v2-20261104T103323Z/

Thư mục này chứa cấu hình/source runner cũ, env backend cũ, deployment record và rollback.sh.
Backup có thông tin nhạy cảm, chỉ lưu trên server; không tải về repo.
Rollback script đã được tạo nhưng chưa thực thi.

## Deploy backend các lần sau

Cần dùng cả ba Compose file:

    compose.production.yaml
    compose.files-production.yaml
    compose.code-runner.yaml

Đặt IMAGE_TAG đúng release muốn chạy. Không mặc định dùng latest để restart.

Đã chuẩn bị thay đổi .github/workflows/deploy.yml trong workspace local: khi CODE_RUNNER_URL có giá trị, workflow thêm compose.code-runner.yaml cho rollout và diagnostics.
Thay đổi này **chưa commit/push**, cần đưa vào nhánh dev trước lần deploy tự động tiếp theo; workflow đang tồn tại trên GitHub chưa có thay đổi này.
Không sửa tracked files trong checkout backend trên server để tránh làm hỏng preflight yêu cầu Git working tree sạch.

Tài liệu [COMPILER_CURRENT_FLOW.md](COMPILER_CURRENT_FLOW.md) mô tả source snapshot trước khi triển khai; thông tin server trong tài liệu này là kết quả kiểm tra mới hơn.
