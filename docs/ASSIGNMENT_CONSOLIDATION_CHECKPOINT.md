# Assignment consolidation — hoàn tất code và kiểm thử

Ngày 2026-11-05. Đã tiếp tục sau khi người dùng khởi động lại Docker.

## Kết quả

Schema assignment giảm từ **19 xuống 10 bảng riêng**. Audit dùng chung audit_events; receipt dùng chung mutation_receipts. Không tạo bảng/view audit hay receipt assignment riêng.

Migration mới: src/database/migrations/1793836800002-consolidate-assignments.ts.
Tài liệu schema, mapping và rollout: [ASSIGNMENT_CONSOLIDATION.md](core/ASSIGNMENT_CONSOLIDATION.md).

- Lựa chọn A–D và đáp án đúng nằm trong assignment_questions; projection học sinh không có đáp án đúng.
- File binding và trạng thái điểm nằm trong assignment_zip_submissions; giữ riêng lịch sử sửa điểm và snapshot đề tại lúc nộp.
- Danh sách copy_candidates nằm trong assignment_file_jobs; retry/stale lease và cleanup đã được kiểm thử với MinIO.
- Tracking API hỗ trợ lọc sự kiện assignment theo source/class/session/entity.
- Giữ nguyên migration lịch sử. Migration mới sao chép dữ liệu cũ trong một transaction và chủ động từ chối down; triển khai cần dùng phiên bản backend phù hợp.

## Kiểm chứng đã pass

- Type-check: pnpm exec tsc --noEmit.
- Biome: 22 file code/test/tool thuộc task; git diff --check không báo lỗi.
- Build: 38 migration artifacts được build và xác minh.
- 301 unit tests, 49 files: pnpm exec vitest run src.
- 28 integration tests trong phase5-assignments, phase5-zip, assignment-consolidation và tracking-consolidation.
- 5 compiled HTTP tests trong phase5-assignments.
- tools/check-migration-rollout.mjs: catalog 38 migrations chạy thành công trên DB test riêng; chạy lần hai không còn migration pending; đúng 10 bảng assignment.
- Upgrade test dùng dữ liệu QUIZ đã chấm, ZIP đã nộp/công bố điểm, audit, receipt cũ và file copies. Có kiểm tra rollback toàn bộ khi migration lỗi giữa chừng, giữ nguyên dữ liệu, sửa/công bố điểm sau upgrade, FK và tính append-only.

## Trạng thái môi trường

- PostgreSQL và MinIO test local đã chạy bằng Docker Compose.
- Các kiểm thử dùng TEST_DATABASE_URL trỏ tới PostgreSQL localhost:5433, DB tên kết thúc _test; helper tạo các DB fixture tách biệt.
- **Chưa chạy migration lên DB ứng dụng/development/production.** Lệnh triển khai và giới hạn forward-only được ghi trong tài liệu rollout.
- Repository có nhiều thay đổi khác trước task (classes/materials/whiteboards/chat/dashboard/docs...). Không revert hoặc ghi đè chúng.
