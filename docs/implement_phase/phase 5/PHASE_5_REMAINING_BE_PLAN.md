# Phase 5 — Kế hoạch hoàn thiện backend Assignment

Ngày: 2026-11-02. Trạng thái: **B0–B5 COMPLETE LOCAL — check709/HTTP120/migration33 PASS; chưa deploy**.

Phạm vi chỉ Mindy-BE: giao đề, nộp ZIP, chấm và công bố điểm, lịch sử/thống kê;
rà soát API bulk ABCD để nhận bộ câu hỏi đã được tách từ text.
Không sửa FE, không viết parser text/Quizlet, không deploy hoặc chạy migration production.

Tài liệu này cụ thể hóa phần còn lại A3–A5 của [plan gốc](PHASE_5_ASSIGNMENTS.md).
Trạng thái đã triển khai xem [progress](../../progress/phase%205/PHASE_5_PROGRESS.md).
Các mục bên dưới giữ thiết kế ban đầu; contract sau implementation được đối chiếu
với source/tests và ghi trong API breakdown ở cập nhật kế tiếp.

Cập nhật implementation2026-11-02: schema1793577600000 và toàn bộ routes đã có;
[API breakdown](../../api_flow/PHASE_5_flow-api-breakdown.md#5-zip-instruction-files-grading-and-reporting--implemented)
là contract hiện hành. ZIP mặc định tắt. Schema dùng `assignment_zip_receipts`
riêng để giữ exact committed outcome/version cho retry grade/release/submit; không
lưu signed URL. Thêm `assignment_file_copies` để dọn copy crash và
`assignment_zip_instruction_snapshots` để pin file đề theo history. Grade revision
bất biến; release lưu pointer/audit riêng. Worker poll3s, timeout90s, lease180s,
heartbeat15s, tối đa5 attempts; cleanup tombstones được kiểm lại mỗi ngày.
Mentor vẫn được chấm/release bài đã nộp trong scope hiện tại sau khi lớp/buổi đóng;
student chỉ còn own submitted history. Missing dùng current eligibility, không hồi tố.

## 1. Hiện trạng ban đầu đã đối chiếu source (trước B0–B5)

| Thành phần | Đã có | Việc còn lại |
|---|---|---|
| Assignment | Thuộc ClassSession; TEST/HOMEWORK; QUIZ/ZIP; draft/revision/audit | Cho publish ZIP khi pipeline hoàn chỉnh |
| QUIZ | Soạn đề, bulk replace câu, publish, start/resume, autosave, submit, timeout, result | Bulk payload size, reporting và handoff |
| ZIP | Tạo draft metadata; deadline bắt buộc; maxAttempts 1..10 | Upload, validation, submit, history, grading/release |
| Files | Private MinIO, presigned upload, processing, versioned storage | Policy riêng cho đề và bài nộp; ZIP validator |
| Mentor workspace | Phân quyền primary/substitute theo session | Queue, roster, thống kê và assignmentSummary thật |

Nguồn kiểm chứng:

- `src/modules/assignments/controllers/mentor-assignments.controller.ts`.
- `src/modules/assignments/controllers/student-assignments.controller.ts`.
- `src/modules/assignments/services/assignments.service.ts`.
- `src/database/migrations/1792713600000-assignments-quiz.ts`.
- `src/modules/files/services/file-upload-policy.service.ts` và `files.contracts.ts`.
- `src/modules/files/validation/binary-validation.ts`.
- `src/configure-app.ts`.

Các điểm cần xử lý đúng với schema hiện tại:

- `publish()` đang trả 409 `ZIP_PIPELINE_NOT_IMPLEMENTED`.
- `assignment_submissions` hiện chuyên cho quiz: unique assignment/student,
  status IN_PROGRESS/GRADED/VOIDED, check submitted/result và trigger khóa terminal.
  Không thể chỉ thêm SUBMITTED rồi dùng trực tiếp cho ZIP nhiều lượt.
- Files upload hiện dành cho Manager/Mentor theo CourseUnit; chưa có quyền Student.
- Allowlist file chưa có ZIP. Validator Office ZIP không phải validator bài nộp ZIP.
- JSON limit toàn cục đang 64 KiB; giới hạn 200 câu trong DTO không bảo đảm request
  chứa được 200 câu. Attendance recovery có parser riêng 256 KiB, phải giữ nguyên
  khi chỉnh parser; chat hiện dùng global 64 KiB (đã đối chiếu source 2026-11-02).

## 2. Quyết định phạm vi và nghiệp vụ

1. Giữ hai loại QUIZ và ZIP. V1 bài làm là đúng một ZIP, không mở thêm loại FILE
   hoặc PDF/DOCX thay ZIP. Trong ZIP có thể chứa bài làm theo policy được kiểm tra.
2. Đề bài gồm description plain text và file đính kèm tùy chọn của mentor:
   PDF/DOCX/PNG/JPEG, tối đa 5 file, mỗi file 25 MiB. Đây là mặc định đề xuất mới
   để hỗ trợ giao đề bằng file; tái dùng validators hiện có, policy/binding riêng.
3. ZIP bắt buộc dueAt có timezone, không timer phút, không nộp muộn.
   Chỉ nhận submit khi DB clock `now < dueAt`; upload trước hạn không giữ suất nộp.
4. Mỗi học viên tối đa một draft đang mở cho mỗi assignment. Chỉ submit thành công
   mới tiêu hao một lượt ZIP; retry/resume draft không tiêu hao lượt.
5. `maxAttempts` mặc định 1, tối đa 10. Bài nộp sau tạo attempt mới, không ghi đè
   bài cũ. Attempt đã SUBMITTED bất biến; grade có lịch sử riêng.
6. Kết quả hiện hành lấy latest submitted attempt; draft mới không thay kết quả.
   Latest submitted chưa công bố điểm thì kết quả hiện hành pending, điểm cũ còn
   trong history của attempt cũ.
7. Mentor lưu điểm nháp rồi release. Student chỉ đọc bản đã release; sửa điểm tạo
   revision mới và cần reason; bản released cũ giữ hiển thị đến release bản mới.
8. Assignment published khóa nội dung/đề/maxScore/type. Cho ZIP gia hạn deadline
   hoặc tăng maxAttempts bằng command riêng có reason/revision/audit; không giảm.
9. Quyền theo access provider hiện tại: account active, enrollment ACTIVE để làm bài,
   lớp còn cho phép ghi, session không cancelled. Không thêm legacy unit release gate.
   Primary/substitute theo scope hiện tại; createdBy không tạo quyền vĩnh viễn.
10. Own submitted history và released results còn đọc được với account active sau
    enrollment terminal hoặc source archive/cancel. Không từ history mở quyền đề mới.

## 3. Thiết kế dữ liệu và module

Chọn **bảng ZIP riêng**, giữ nguyên bảng và trigger quiz hiện tại để giảm rủi ro hồi quy.
Assignments sở hữu persistence bằng typed SQL theo pattern module hiện tại;
không tạo entity chỉ để mirror bảng, không truy cập repository riêng của module khác.

| Bảng mới | Nội dung/constraint |
|---|---|
| assignment_zip_submissions | Assignment/student/enrollment; attempt_number nullable khi draft, cấp lúc submit; assignment revision/snapshot; DRAFT/SUBMITTED/VOIDED; version; submitted_at; timestamps |
| assignment_files | Metadata upload riêng, owner, assignment, optional zip_submission, purpose INSTRUCTION/SUBMISSION; staging/verified object version; status/error/intent expiry |
| assignment_instruction_files | Assignment + file, position; chỉ own mentor upload đúng scope và READY; tối đa 5 file |
| assignment_zip_submission_files | Submission + file; unique submission để đúng một ZIP; file thuộc chính draft và student; giữ version verified |
| assignment_zip_grades | Unique ZIP submission; current_version, released_version nullable |
| assignment_zip_grade_revisions | Grade/version unique; decimal score, feedback, actor, reason, timestamps; nội dung revision bất biến |
| assignment_zip_audits | Append-only, assignment/ZIP submission/grade reference, actor/action/version/reason/time |
| assignment_file_jobs | Durable validation/cleanup jobs, retries, lease và terminal status |

- Partial unique một DRAFT cho assignment/student; unique assignment/student/attempt_number
  với attempt_number khác null. Lock assignment và student-attempt scope trước cấp số lượt.
- FK RESTRICT giữ bài làm/điểm. Không sửa migration đã áp dụng; thêm migration mới.
- Reuse `assignment_receipts` nếu đáp ứng outcome/version replay; nếu cần mở rộng thì
  additive, không dùng `assignment_audits.submission_id` FK quiz cho ZIP.
- Snapshot title/description/maxScore/deadline/instruction file versions tại submit;
  không copy quiz answer keys. Deadline gia hạn không viết lại snapshot bài đã nộp.
- FileStorage là hạ tầng dùng lại; metadata/policy của assignment độc lập với materials
  và chat. Đây là lựa chọn cụ thể thay cho phương án mở rộng material-purpose trong plan gốc.
- Không thêm STUDENT vào FilesController hiện tại. Không cho material/chat dùng ID
  assignment file, cũng không cho assignment nhận file ID từ hai module đó.

## 4. Pipeline upload và download

Luồng bài làm: tạo/resume draft → intent → PUT storage → complete → processing → READY
→ attach → submit. READY chỉ nói file hợp lệ, chưa phải nộp bài.

- Intent resolve assignment/session/class/student/enrollment phía server; client chỉ
  gửi tên/MIME/kích thước. Không nhận ownerId, bucket, key hoặc courseUnitId tự chọn.
- Intent, complete, attach và submit đều kiểm lại quyền, deadline, state/version.
  Worker không được biến intent đã bị thu hồi quyền thành bài nộp hợp lệ.
- Upload vào staging; complete chốt object version; worker kiểm bytes rồi đưa sang
  verified object/version. Ghi READY theo điều kiện state, tránh ghi đè do retry.
- Storage/network IO ngoài transaction; trước khi commit kết quả phải kiểm lại state
  và object version. Job có lease/retry bounded, recover sau restart.
- ZIP: compressed tối đa 20 MiB; expanded tối đa 100 MiB; tối đa 1000 entries;
  ratio tối đa 100; chặn encrypted, nested archive, symlink, absolute/drive path,
  traversal, trùng tên và tên bất thường. Kiểm signature, central directory,
  actual streamed size/CRC, timeout và tổng resource budget; không chỉ tin metadata.
- Nhận diện nested archive bằng nội dung/signature khi kiểm entries, không chỉ đuôi.
  Không giải nén vào public filesystem, không thực thi hoặc biên dịch nội dung ZIP.
- Rate/quota theo student và assignment; giới hạn intent chưa hoàn tất; cleanup
  staging hết hạn/FAILED/file không còn reference sau grace period cấu hình.
  Không xóa file thuộc submitted history hoặc instruction snapshot đang được giữ.
- Đề đính kèm: cùng pipeline nhưng purpose INSTRUCTION và validator file tương ứng;
  chỉ attach/remove lúc DRAFT, kiểm READY trước publish.
- Download kiểm quyền hiện tại và binding trước cấp URL private ngắn hạn (60 giây),
  trả attachment disposition. Recheck quyền sau presign trước trả response.
  URL đã cấp vẫn dùng được tới hết TTL; nếu cần revoke tức thì phải dùng streaming
  gateway, không hứa presigned URL có thể thu hồi ngay.
- Student chỉ tải file own draft/history và file đề theo quyền; mentor chỉ tải bài
  trong scope được chấm. Không công khai storage locator hoặc URL dài hạn.

## 5. API dự kiến

Tất cả nằm dưới `/api/v1`, cookie auth/role/Origin guards theo conventions hiện tại.
Mutations dùng expectedVersion/expectedRevision và Idempotency-Key cho thao tác có
retry/tạo tài nguyên. Read không phát sinh submit/grade/validation jobs.

| Method/path | Mục đích |
|---|---|
| POST /mentor/assignments/:id/instruction-upload-intents | Upload file đề, chỉ assignment DRAFT |
| PUT /mentor/assignments/:id/instruction-files | Replace ordered instruction file IDs + expectedRevision |
| POST /mentor/assignments/:id/publish | Mở ZIP publish sau khi pipeline sẵn sàng, kiểm đề/deadline |
| POST /mentor/assignments/:id/extend | Tăng dueAt/maxAttempts + reason + expectedRevision |
| POST /me/assignments/:id/zip-submissions | Tạo/resume draft, trả current draft/version |
| POST /me/zip-submissions/:id/upload-intents | Upload bài làm ZIP đúng draft |
| POST /assignment-files/:fileId/complete | Complete cho owner hợp lệ, queue validation |
| GET /assignment-files/:fileId | Status READY/FAILED và mã lỗi công khai |
| GET /assignment-files/:fileId/download | Cấp quyền tải theo purpose/binding/history |
| PUT /me/zip-submissions/:id/file | Attach/replace đúng một ZIP READY + expectedVersion |
| POST /me/zip-submissions/:id/submit | Chốt file/snapshot/attempt, immutable SUBMITTED |
| GET /me/zip-submissions/:id | Own draft/submitted detail + released grade projection |
| GET /me/assignments/:id/submissions | Own history QUIZ/ZIP, có type rõ và pagination |
| GET /mentor/assignments/:id/submissions | Queue/filter student/status/attempt, pagination |
| GET /mentor/zip-submissions/:id | Bài làm, file, grade draft/released trong scope |
| PUT /mentor/zip-submissions/:id/grade | Tạo revision điểm nháp + expectedVersion |
| POST /mentor/zip-submissions/:id/grade/release | Release revision cụ thể, chống stale release |
| GET /mentor/zip-submissions/:id/grade/history | Lịch sử điểm và audit trong scope |
| GET /mentor/assignments/:id/roster | Eligible student, missing/submitted/graded/released |
| GET /mentor/classes/:id/assignment-metrics | Tổng hợp theo lớp/session/type/purpose |

Response metadata bổ sung instructionFiles và capabilities; không sửa schema result
quiz hiện có. History dùng discriminated union `type`, không giả QuizAttemptDto cho ZIP.
List/queue trả latest submitted mặc định; có filter history nhưng không đếm draft
hoặc nhiều attempt thành nhiều học viên.

Submit transaction: khóa theo thứ tự thống nhất với access/class/session writers;
recheck quyền/state/deadline/maxAttempts/version/file READY và binding; cấp attempt;
chốt snapshot; ghi audit + receipt cùng commit. Archive/thu hồi quyền cạnh tranh với
submit phải có một thứ tự quyết định, không commit bài nộp sau khi revoke đã thắng lock.

Archive void ZIP drafts, chặn upload/attach/submit mới, giữ submitted history.
Class/session cancel và enrollment terminal theo cùng nguyên tắc; thao tác chấm/release
phải kiểm scope hiện tại, không cấp quyền chỉ vì từng tạo assignment.

Điểm là decimal string, tối đa 2 chữ số lẻ, từ 0 đến maxScore snapshot; feedback
tối đa 10000 ký tự. Correction phải có reason. Release dùng grade version cụ thể;
replay trả cùng outcome, payload khác cùng key trả conflict.

Mã lỗi cần chuẩn hóa: ZIP_INVALID, ZIP_LIMIT_EXCEEDED, FILE_NOT_READY,
FILE_SCOPE_MISMATCH, ASSIGNMENT_DEADLINE_PASSED, ATTEMPT_LIMIT_REACHED,
SUBMISSION_VERSION_CONFLICT, SUBMISSION_ALREADY_SUBMITTED, GRADE_VERSION_CONFLICT,
GRADE_NOT_RELEASED; 404 cho tài nguyên ngoài quyền, 409 cho state/version,
413 cho body quá lớn, 422 cho nội dung/config, 503 cho storage/feature unavailable.

## 6. ABCD bulk — phần BE cần làm

**Đã có bulk**, không cần endpoint nhận nguyên khối text:
`PUT /mentor/assignments/:id/questions`, body gồm `expectedRevision` và `questions[]`.
Mỗi câu có prompt, bốn options label A/B/C/D, correctOption; id tùy chọn cho câu cũ.
API hiện replace toàn bộ bộ câu trong transaction, chỉ cho DRAFT, tối đa 200 câu.

Phần tách text thành câu/ABCD và preview nằm ngoài kế hoạch BE này. BE nhận JSON
chuẩn và luôn validate lại; không suy đáp án khi thiếu correctOption, không tự chấm
đáp án từ text, không thêm AI/Quizlet integration.

Công việc BE:

- Giữ semantics replace-all; ghi rõ không phải append. Import bổ sung gửi toàn bộ
  bộ câu đã hợp nhất; expectedRevision ngăn ghi đè thay đổi từ người khác.
- Parser JSON riêng cho đúng questions route, trần 1 MiB (điều chỉnh từ 8 MiB); giữ global 64 KiB
  và attendance recovery 256 KiB. Parser order đã kiểm thử local; cấu hình proxy
  chuẩn mặc định 1m phù hợp trực tiếp với trần này.
- Trần body byte độc lập với limit 200 câu và giới hạn từng field. UTF-8/JSON escaping
  có thể làm request vượt trần dù từng field hợp lệ; document 413 rõ ràng.
- Giữ kiểm tra đúng 4 labels distinct, key thuộc options, prompt/options không trắng,
  duplicate/foreign IDs, unknown fields và stale revision. Trả validation errors có
  question index/field path để client ánh xạ câu lỗi; không phản chiếu private keys
  trong message/log lỗi. Một câu lỗi phải rollback toàn bộ replacement.
- Đo query count/thời gian ở 200 câu; hiện service insert tuần tự từng question/option/key.
  Nếu vượt budget thì batch insert bằng parameterized SQL trong cùng transaction,
  giữ question IDs/order/answer-key constraints và response contract.
- Test full 200 câu thực tế, tiếng Việt/nhiều dòng, payload >64 KiB, exact byte limit,
  >200 câu và UTF-8 escaping. Không viết BE parser text trong slice này.

## 7. Thứ tự triển khai và nghiệm thu

| Slice | Công việc | Điều kiện hoàn tất |
|---|---|---|
| B0 — Contracts/schema | Chốt DTO, state, schema ZIP/file/grade, migrations, locks và access facade | Migration clean/upgrade giữ quiz; constraints chặn cross-binding/duplicate draft |
| B1 — ABCD bulk | Route body limit, validation errors, contract và kiểm tra tải 200 câu | Bulk atomic, stale revision 409, invalid 422, oversized 413; quiz regression pass |
| B2 — ZIP và đề storage | Purpose riêng, intent/complete/status, validators, durable jobs, download, cleanup | READY chỉ sau verified bytes; isolation/revoke/restart tests pass |
| B3 — Publish/nộp/lịch sử | Instruction binding, ZIP publish/extend, draft/attach/submit/multiple attempts, archive | Một lần submit = một immutable attempt; deadline/attempt/races pass |
| B4 — Chấm/công bố | Mentor queue/detail, grade revisions, release/correction/history | Student không thấy draft grade; concurrent grade/release không mất lịch sử |
| B5 — Reports/handoff | Roster/missing/pending/released metrics, assignmentSummary, Swagger/Postman/runbook | Scoped aggregates khớp dữ liệu và đủ full checks/evidence |

Dependency: B0 → B2 → B3 → B4 → B5; B1 có thể hoàn tất độc lập sau rà soát contract.
Chỉ bỏ chặn ZIP publish khi B2/B3 sẵn sàng và feature enabled. Feature ZIP mặc định
tắt trong rollout đầu; quiz tiếp tục hoạt động dù ZIP/storage feature bị tắt.

Reporting: eligible theo entitlement; missing chỉ khi published đã qua deadline và
không có submitted attempt hợp lệ. `ungraded` và `unreleased` là hai số riêng.
Student đã nộp nhưng enrollment terminal vẫn có submitted history, không tính là
eligible hiện tại; document tập mẫu số. Không suy missing lịch sử từ roster hiện tại
nếu chưa có eligibility snapshot/event history đáng tin cậy.
Không biến score/submitted thành hoàn thành unit/chứng chỉ. assignmentSummary bỏ
NOT_IMPLEMENTED chỉ khi có aggregate thật và contract kiểm thử.

## 8. Kiểm thử và bàn giao

- Unit: ZIP limits/signature/paths/nested/encrypted/CRC, deadline, attempts, decimal
  grading, grade release projection, validation/bulk mapping, access transitions.
- PostgreSQL: migration sạch và upgrade có quiz history; unique draft/attempt;
  submit song song; audit/receipt fail rollback; archive/revoke/extend vs submit;
  grade edit/release races; submitted file immutable và released history bền vững.
- MinIO/worker: upload giả MIME/oversize, overwrite staging version, storage lỗi,
  complete retry, worker restart/lease/retry, READY không tự submit, wrong owner,
  cross-material/chat/assignment IDs, cleanup không xóa referenced versions.
- HTTP compiled: cookie/role/Origin/UUID/nested DTO/unknown fields, private key và
  draft grade không leak, download scope, body parser isolation và 413, pagination.
- Regression: quiz 40 câu, timeout/one attempt/result immutability; materials/chat
  upload/download; teaching scope primary/substitute và revoke history.
- Gates khi implement: `pnpm check`, `pnpm test:http`, PostgreSQL/MinIO integration
  và migration smoke trên database test riêng. Không chạy suite cho tài liệu-only.
- Cập nhật PHASE_5_FLOW, API breakdown, Postman, progress, runbook và env mẫu nếu thêm
  config. Ghi rõ proposed/implemented/local verified/deployed, không đánh dấu done
  theo việc mới viết plan.
- Rollout additive: migrate schema → deploy app/worker với ZIP tắt → smoke test riêng
  → bật feature. Rollback tắt ZIP mutations, giữ history/read tương thích; không
  destructive down khi có bài nộp, không xóa object đang referenced.

## 9. Ngoài phạm vi

FE/parser text/preview import; OCR/import ảnh/Word thành câu hỏi; nhiều đáp án đúng;
PDF/DOCX thay ZIP bài làm; chạy code/judge; late submission; sửa đề published;
weighted gradebook/chứng chỉ; notification mới; clone/template đề; triển khai VPS.

## 10. Checklist theo dõi

- [x] B0: contract/schema/access/locking đã implement và kiểm thử local.
- [x] B1: bulk ABCD với payload thực tế 200 câu đã nghiệm thu local (2026-11-02).
- [x] B2: file đề + ZIP private pipeline đã nghiệm thu local.
- [x] B3: publish/nộp/nhiều lượt/history đã nghiệm thu local.
- [x] B4: grade draft/release/correction/history đã nghiệm thu local.
- [x] B5: reports/assignmentSummary và tài liệu bàn giao đã nghiệm thu local.
- [x] Full regression/migration/worker/storage evidence local được ghi trong progress.

Tại thời điểm tạo tài liệu, tất cả checklist trên còn TODO. B1 được làm trước;
B0/B2–B5 đã được implement tiếp cùng ngày. Evidence/checklist nghiệm thu local và
giới hạn triển khai xem [progress](../../progress/phase%205/PHASE_5_PROGRESS.md).
Publish ZIP yêu cầu feature/storage enabled; không có FE, production migration
hoặc deployment trong công việc này.
