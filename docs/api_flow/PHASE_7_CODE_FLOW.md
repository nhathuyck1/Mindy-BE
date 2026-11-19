# Phase 7 — CODE assignments flow

03/11/2026 PR validation: both env examples include CODE settings; full local
backend790 tests and compiled HTTP/WS125 tests pass, with36 verified migration
artifacts and a zero-change repeat migration. Existing Materials/attendance test
fixtures now wait for eligible jobs and use the Vietnam calendar. API workflow
and production rules are unchanged; no deployment or new real-runner acceptance.

[Plan](../implement_phase/phase%207/PHASE_7_CODE_ASSIGNMENTS.md) ·
[API contract](PHASE_7_CODE_flow-api-breakdown.md) ·
[Progress](../progress/phase%207/PHASE_7_CODE_PROGRESS.md)

## Python và C# — 16/11/2026

Mentor xem trước starter của bốn ngôn ngữ từ cùng một chữ ký hàm. Sau khi bật
Python và C#, mentor có thể chọn cả bốn khi ra đề, chạy lời giải mẫu và kiểm tra
reference. Danh sách mentor và học viên theo thứ tự JavaScript, Java, Python, C#.
Học viên dùng cùng luồng chạy mẫu, nộp bài và nhận điểm với hai ngôn ngữ mới.

Đã kiểm tra hợp đồng API trên PostgreSQL test và runner Docker. Đã chạy smoke cả
bốn ngôn ngữ trên runner production. BE production đã chạy migration tạo hai
ngôn ngữ ở trạng thái tắt và kiểm tra round-trip Python/C# qua runner mới.
FE2 tương thích đã được phát hành. Bật hai key sau khi MindyFlutter và
MindyMobile_Admin tương thích đã phát hành. Xem [API contract](PHASE_7_CODE_flow-api-breakdown.md)
và [runbook](../PHASE_7_CODE_RUNBOOK.md#phát-hành-python-và-c).

## Backend integration — 02/11/2026

The existing `dev` ZIP/Whiteboard implementation is the integration baseline.
The CODE feature is added to the shared assignments module without replacing
ZIP controllers, storage/file workers, reporting, or Whiteboard runtime.
Whiteboard documentation retains its original paths; CODE uses separate files.

1. Mentor creates a CODE draft in an authorized class session, sets a future
   deadline, problem signature, languages, sample/hidden tests and reference solution.
2. Mentor validates the saved references through compiler-runner, then publishes
   only when the current revision has no CODE readiness blockers. ZIP retains its
   own feature/storage/READY-file checks; only QUIZ requires quiz questions.
3. An ACTIVE student opens the published problem, saves a versioned draft and
   optionally runs samples/custom inputs. The client only calls Mindy-BE.
4. Submit with a UUIDv4 Idempotency-Key stores a QUEUED submission and judge job
   atomically. The worker calls the runner outside the database transaction and
   commits the result. Students poll detail; chat may send an own-user update.
5. The assignment score is the highest surviving GRADED attempt, earliest on ties.
   Class reports count the student once, including while later attempts are pending.
   CODE has no ZIP-style manual grade release. Voided results do not contribute.
6. Archive voids queued/running CODE work and completes its jobs. QUIZ expiry and
   ZIP draft/history/grading continue using their existing paths and rules.

Scope, stale revisions, hidden-test privacy, deadline, rate-limit, runner failure,
rejudge and void behavior are documented in the linked API contract and runbook.
CODE history uses its own endpoints; the QUIZ/ZIP history DTO remains unchanged.

Verification for this integration is recorded in CODE progress, separately from
earlier feature evidence. Local checks do not imply deployment or a real-runner
acceptance run. No frontend changes or development/production database migrations.

## Đồng bộ Git và server — 19/11/2026

Theo yêu cầu trực tiếp của người dùng, đưa toàn bộ thay đổi local đã deploy vào
nhánh `feat/phase7-python-csharp` của remote BE và FE2. Compiler được lưu riêng tại
<https://github.com/Quanhpm/mindy-compiler-runner>, nhánh `main`, chế độ private.
Không thay đổi API, flow chấm điểm, migration hoặc cấu hình production trong lượt
đồng bộ này; Python/C# vẫn tuân theo điều kiện bật ngôn ngữ của mục phát hành ở trên.

Đã đối chiếu checksum toàn bộ source với release `web-20261119T141416Z`;
495 file JavaScript đã build trong API và 12 file trong runner trùng bản local
đã kiểm thử. FE đang chạy đúng image đã nghiệm thu. Chỉ các ghi chép Markdown
được bổ sung sau triển khai; server nhận thêm source Git và thông tin commit để
đối chiếu. Kiểm chứng runtime ngày 19/11: năm dịch vụ healthy, HTTP public/auth
đúng trạng thái, cả bốn ngôn ngữ compile và chạy đúng. Contract FE giữ nguyên.

### Tích hợp nhánh mới nhất trước khi chốt đồng bộ

Release tiếp theo `sync-20261119T145234Z` gộp `origin/dev` đến `829cad6` và FE2
`origin/main` đến `a2c1c3d`, giữ các thay đổi Python/C#, validation và auth đã deploy.
Bao gồm seed demo mới, whiteboard presenter viewport và trang chi tiết buổi học
Student. Contract viewport kế thừa [whiteboard flow](PHASE_7_FLOW.md) và
[API breakdown](PHASE_7_flow-api-breakdown.md); không thêm migration, không chạy seed
hoặc bật thêm ngôn ngữ trên production trong lượt phát hành này.

Gate bản kết hợp: BE 911 unit/integration và 131 compiled HTTP đạt; FE 379 unit,
565 E2E distinct đạt qua full run và recheck 32 ca Admin, 5 skip theo viewport.
FE nâng Next.js/eslint-config-next lên 16.4.6 và sửa debounce giữ URL filter mới
nhất, có regression desktop/mobile. Dockerfile FE được version control để build
lại cùng cấu hình. Source Git và metadata commit được đồng bộ trên server;
runtime nghiệm thu và backup được ghi riêng trong biên bản triển khai.
