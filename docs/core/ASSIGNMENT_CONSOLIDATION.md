# Assignment schema consolidation — 2026-11-05

Assignment dùng **10 bảng riêng**, giảm từ 19. Audit và receipt dùng các bảng chung của hệ thống; HTTP contract của QUIZ/ZIP giữ nguyên.

| Bảng giữ lại | Dữ liệu |
|---|---|
| `assignments` | Đề bài, loại bài, deadline, revision |
| `assignment_questions` | Câu hỏi, lựa chọn A–D trong `options` JSONB, `correct_option` |
| `assignment_submissions` | Lần làm QUIZ, câu trả lời, kết quả và snapshot |
| `assignment_finalization_jobs` | Tự chốt QUIZ hết giờ và xử lý mất quyền truy cập |
| `assignment_zip_submissions` | Lần nộp ZIP, file/version đã gắn, `grade_id`, phiên bản điểm hiện tại và đã công bố |
| `assignment_files` | Upload intent, trạng thái xác minh và phiên bản bytes |
| `assignment_instruction_files` | Tài liệu đề bài và thứ tự |
| `assignment_zip_instruction_snapshots` | Phiên bản tài liệu đề tại thời điểm nộp |
| `assignment_zip_grade_revisions` | Các lần chấm/sửa điểm, feedback, người sửa và lý do |
| `assignment_file_jobs` | Xác minh/dọn file và danh sách `copy_candidates` cần dọn |

## Bảng đã gộp

- `assignment_question_options`, `assignment_answer_keys` → `assignment_questions`.
- `assignment_zip_submission_files`, `assignment_zip_grades` → `assignment_zip_submissions`.
- `assignment_file_copies` → `assignment_file_jobs.copy_candidates`.
- `assignment_audits`, `assignment_zip_audits` → `audit_events`, giữ nguyên hai tên này dưới dạng `source` để lọc lịch sử. Không tạo bảng hay view audit assignment riêng.
- `assignment_receipts`, `assignment_zip_receipts` → `mutation_receipts`, namespace `assignment_quiz` và `assignment_zip`. Namespace tách biệt để giữ cả các khóa actor/route/key từng trùng giữa hai bảng cũ. Hash và cách replay từng luồng được giữ nguyên.

## Ràng buộc còn giữ

Lựa chọn phải có label A–D duy nhất và nội dung hợp lệ; đáp án đúng phải thuộc các lựa chọn. Migration giữ được cả draft cũ chưa có đáp án, không tự điền đáp án giả. API học sinh chỉ đọc projection không chứa `correct_option`.

File gắn vào lần nộp phải đúng assignment/student/submission, đã READY và đúng object version. Sau khi nộp, nội dung lần nộp và file bị khóa; chỉ con trỏ phiên bản điểm hiện tại/đã công bố được cập nhật. Revision điểm vẫn append-only, có kiểm tra điểm tối đa và khóa ngoại đến phiên bản tồn tại. Học sinh tiếp tục thấy điểm đã công bố cũ cho đến khi mentor công bố bản sửa.

Audit dùng trigger append-only của hệ thống và các cột FK sinh từ payload để giữ bảo vệ tham chiếu. API tracking nhận hai source assignment và xác định class/session qua assignment. Bản chụp tài liệu và các file đã được tham chiếu tiếp tục được giữ khỏi cleanup.

## Triển khai

Migration: `1793836800002-consolidate-assignments.ts`. Giữ nguyên các migration lịch sử; migration mới sao chép dữ liệu cũ trước khi bỏ bảng cũ, trong một transaction có khóa ghi. Cần chạy migration cùng phiên bản backend này.

1. Backup DB; dừng backend cũ và worker ghi assignment. Migration khóa các bảng liên quan, bao gồm bảng tracking chung, nên cần cửa sổ bảo trì phù hợp dữ liệu thực tế.
2. Build bằng `pnpm build`.
3. Chạy `pnpm migration:run:build` với `DATABASE_URL` của môi trường cần nâng cấp.
4. Khởi động backend/worker mới; kiểm tra tạo/sửa đề, nộp QUIZ/ZIP, chấm/công bố điểm, download và tracking.

Migration là **forward-only**: `migration:revert` chủ động báo lỗi. Backend cũ còn ghi các bảng đã bỏ nên không thể rollback riêng application sau khi nâng cấp schema; dùng migration sửa tiếp hoặc khôi phục backup đi cùng phiên bản backend tương ứng.

## Kiểm chứng

- `test/integration/assignment-consolidation.spec.ts`: nâng cấp dữ liệu đã có bài nộp/điểm công bố; rollback toàn bộ khi copy audit lỗi; receipt cũ và namespace trùng; sửa/công bố điểm; FK, tính bất biến và tracking.
- Các suite `phase5-assignments`, `phase5-zip` và HTTP phase5 kiểm tra contract nghiệp vụ sau khi gộp.
- `tools/check-migration-rollout.mjs`: chạy catalog đã build hai lần trên DB test tách biệt và xác nhận còn đúng 10 bảng assignment.
