# Compiler Mindy — luồng xử lý hiện tại và cơ sở mở rộng

Ngày kiểm tra: **04/11/2026**. Tài liệu mô tả **mã nguồn trong workspace tại thời điểm kiểm tra**, không khẳng định cấu hình này đã được triển khai lên production.

## 1. Kết luận chính

Compiler hiện tại gồm một hệ thống **bài tập CODE kiểu LeetCode**, hỗ trợ **JavaScript / Node.js 22** và **Java 21**:

1. Mentor tạo bài tập thuộc buổi học, khai báo hàm, ngôn ngữ, lời giải mẫu và test.
2. Backend chạy lời giải mẫu để sinh expected output hoặc kiểm tra test có sẵn.
3. Chỉ được publish khi đề đủ điều kiện và các lời giải mẫu đã lưu đều vượt qua toàn bộ test ở revision hiện tại.
4. Học viên đọc đề, soạn lời giải hàm, lưu nháp, chạy sample hoặc một input tự nhập.
5. Nộp bài tạo submission và job bền vững trong PostgreSQL; HTTP trả về trước khi chấm xong.
6. Worker lấy job, backend ghép code với driver, runner thực thi trong Docker, backend so sánh kết quả và lưu điểm.
7. Frontend hỏi lại kết quả; mentor xem thống kê, xem bài, chấm lại bài lỗi hạ tầng hoặc huỷ bài.

**Phân chia trách nhiệm quan trọng:** runner chỉ compile/run và đo tài nguyên. Expected output, phép so sánh, điểm số, lượt nộp, quyền truy cập và deadline do backend quyết định.

Ngoài luồng này, runner còn giữ **API JavaScript playground cũ** tại POST /api/code/run. Nó có contract, bộ giới hạn và nhóm concurrency riêng, không đi qua hệ thống assignments. Không tìm thấy lời gọi API cũ trong source các frontend hiện có đã rà soát.

## 2. Phạm vi và cách kiểm tra

| Thành phần | Đã kiểm tra | Ghi chú snapshot |
| --- | --- | --- |
| Mindy-BE | Controller, DTO, service, domain, queue/worker, migration, phân quyền, reporting, cấu hình và test | Nhánh dev, HEAD 37824e7; working tree sạch trước khi thêm tài liệu |
| Mindy-FE2 | Route, màn hình mentor/student, editor, query/mutation, proxy, schema và test | Nhánh compiler, HEAD 9f771ff; working tree sạch lúc bắt đầu |
| compiler-runner | API mới/cũ, registry, Docker executor, harness Go, slots, compose và test | Thư mục độc lập, không có Git repository riêng tại vị trí kiểm tra |
| MindyFlutter | API, models, Riverpod providers, màn hình đề/editor/kết quả, autosave, polling và test | Có implementation CODE thực tế trong checkout |
| MindyMobile / MindyMobile_Admin | Tìm kiếm source theo API và keyword compiler/CODE | Không tìm thấy client gọi code-runs/code-submissions hoặc legacy /api/code/run trong source ứng dụng đã tìm |

Phương pháp: lần theo lời gọi từ UI → API client/proxy → controller → service → domain/DB → runner → harness, sau đó lần theo đường trả kết quả. Có chạy các nhóm test tập trung, xem mục 16.

Các kết luận về code được tách khỏi rủi ro suy ra từ code ở mục 14. Không dùng thông tin trong tài liệu tiến độ cũ làm bằng chứng rằng runtime hiện tại đã chạy đúng.

## 3. Kiến trúc tổng thể

~~~mermaid
flowchart LR
    Web["Web Next.js / Mindy-FE2"] --> Proxy["Same-origin /api/v1 proxy\nallowlist + Zod + cookie"]
    Proxy --> BE["Mindy-BE /api/v1\nNestJS"]
    App["Flutter\nAPI client"] --> BE
    BE --> DB[("PostgreSQL\nassignments + code_*")]
    Worker["CodeJudgeWorker\npoll mỗi 1 giây"] --> DB
    Worker --> Judge["CodeJudgeService"]
    Judge --> Executor["HttpCodeExecutor"]
    BE --> Executor
    Executor --> Runner["compiler-runner\n/internal/v1/executions"]
    Runner --> Docker["Docker judge container"]
    Docker --> Harness["Go harness\ncompile một lần\nprocess mới cho mỗi test"]
    Harness --> Runtime["Node.js 22 / Java 21"]
    Judge --> Grade["Domain so sánh + tính điểm"]
    Grade --> DB
    Judge -. "hint ids/status" .-> Socket["code_submission.updated"]
    Web -. "poll GET kết quả" .-> BE
    App -. "poll GET kết quả" .-> BE
~~~

Có hai cách sử dụng executor:

- **Đồng bộ, priority interactive:** student chạy thử; mentor sinh output; mentor validate đề. Request chờ kết quả runner.
- **Bất đồng bộ, priority batch:** student nộp bài. Worker xử lý sau, frontend poll kết quả.

Queue thuộc **PostgreSQL của Mindy-BE**, không phải Redis/BullMQ. Runner không có durable queue: hết slot thì trả 429.

## 4. Bản đồ mã nguồn

Đường dẫn trong bảng tương đối với từng project.

| Nơi | File/chùm file | Trách nhiệm |
| --- | --- | --- |
| BE | src/modules/assignments/assignments.module.ts | Đăng ký CODE controllers/services/worker; bind CODE_EXECUTOR và CODE_SUBMISSION_NOTIFIER |
| BE | controllers/mentor-code-assignments.controller.ts | API soạn đề, thư viện, generate, validate, review, rejudge, void |
| BE | controllers/student-code-assignments.controller.ts | API xem đề, draft, run, submit, lịch sử/detail |
| BE | services/assignments.service.ts | Assignment chung: create, metadata, list, publish, archive, soft-delete draft |
| BE | services/code-authoring.service.ts | Nội dung CODE, ngôn ngữ, tests, reference, import, generate, validate, gia hạn |
| BE | services/code-submissions.service.ts | Student context, draft version, chạy thử, rate limit, submit idempotent, DTO ẩn dữ liệu |
| BE | services/code-judge.service.ts + code-judge.worker.ts | Claim job, lease, execution, chấm/lưu, retry và hoàn tất |
| BE | services/code-review.service.ts | Roster/thống kê, bài nộp, duplicate flag, rejudge, void |
| BE | domain/code-signature.ts | Kiểu dữ liệu, chữ ký hàm, starter code, kiểm tra input/expected |
| BE | domain/code-driver.ts | Source hoàn chỉnh, stdin JSON, marker kết quả, parser output |
| BE | domain/code-grading.ts + code-judge.ts | Comparator, verdict, score, giới hạn execution, retry constants |
| BE | domain/code-readiness.ts + services/code-readiness.query.ts | Publish blockers |
| BE | services/code-executor.service.ts | Adapter HTTP sang runner; kiểm tra response |
| BE | services/code-submission-notifier.ts | Socket hint cho chính student thông qua transport Chat |
| Runner | src/internal.controller.ts + execution.ts | Contract v2 và validate request |
| Runner | src/docker-executor.ts + languages.ts + slots.ts | Container, registry lệnh/image, giới hạn và phân bổ slot |
| Runner | harness/main.go | Compile, chạy từng test, đo CPU/RSS, phân loại lỗi |
| Runner | src/app.controller.ts + runner.ts + validation.ts | Legacy playground chỉ JavaScript |
| Web | src/features/code-assignments/ | UI, contract và API hooks của CODE |
| Web | src/lib/api/proxy.server.ts + assignment-rules.server.ts | Proxy chung và các endpoint assignment dùng chung |
| Flutter | lib/features/code_assignments/ | Client CODE cho học viên; mentor xem tổng hợp |

Các file BE ở cột giữa, trừ khi ghi đầy đủ, thuộc src/modules/assignments/.

## 5. Mô hình bài toán và dữ liệu

### 5.1. Loại bài hiện tại

Đây là **bài viết hàm có đầu vào/đầu ra JSON**:

- JavaScript: học viên viết function có đúng tên và tham số khai báo.
- Java: học viên viết class Solution và method tương ứng; driver sở hữu public class Main.
- Backend truyền các tham số theo thứ tự signature và lấy **giá trị return** để chấm.
- Console output được giữ riêng; in đáp án bằng console.log không thay thế cho việc return.
- Chưa có mode dự án nhiều file, input tương tác liên tục, bài SQL hoặc checker do mentor upload.

Ví dụ chữ ký:

~~~json
{
  "functionName": "twoSum",
  "params": [
    { "name": "nums", "type": "int[]" },
    { "name": "target", "type": "int" }
  ],
  "returnType": "int[]"
}
~~~

Test tương ứng:

~~~json
{
  "visibility": "SAMPLE",
  "inputArgs": [[2, 7, 11, 15], 9],
  "expected": [0, 1],
  "weight": 1
}
~~~

### 5.2. Signature và kiểu dữ liệu

Hỗ trợ 12 kiểu:

| Nhóm | Kiểu |
| --- | --- |
| Scalar | int, long, double, boolean, string |
| Mảng một chiều | int[], long[], double[], boolean[], string[] |
| Ma trận | int[][], string[][] |

Quy tắc:

- Hàm có **1–6 tham số**; hiện không hỗ trợ hàm không tham số.
- Tên dài 1–40 ký tự, theo biểu thức [A-Za-z_][A-Za-z0-9_]{0,39}.
- Domain loại từ khoá JS/Java và các tên driver dùng; tên tham số phải duy nhất, khác tên hàm.
- int trong khoảng signed 32-bit.
- long phải là số nguyên an toàn của JavaScript, tức không bao phủ toàn bộ miền long 64-bit Java.
- double phải hữu hạn; string tối đa 65.536 ký tự; mỗi chiều mảng được kiểm tra giới hạn 100.000 phần tử.
- Không có object, map, tree, linked list, null, void, BigInt hay Promise trong contract signature hiện tại.
- Giới hạn JSON theo byte còn áp dụng riêng, nên không thể suy ra rằng mọi mảng đạt giới hạn phần tử đều được gửi.

### 5.3. Các bảng và view

Schema CODE nằm trong migration **1792886400000-code-assignments.ts**.

| Bảng/view | Nội dung |
| --- | --- |
| assignments | Buổi học, loại CODE, purpose, tiêu đề, điểm tối đa, deadline, số lượt, status, revision |
| code_languages | Danh mục ngôn ngữ, runtime_version, editor_mode, time_multiplier, enabled |
| code_problems | Statement, constraints, difficulty, signature JSONB, compare/scoring, CPU/memory, validated_revision |
| code_problem_languages | Ngôn ngữ được phép và starter_code của bài |
| code_test_cases | Position 1–30, SAMPLE/HIDDEN, input_args, expected, weight, explanation |
| code_reference_solutions | Reference theo ngôn ngữ, last_validation và thời điểm validate |
| code_drafts | Nháp theo assignment + student + language, source_code và version |
| code_submissions | Source snapshot, SHA-256, enrollment, attempt_number, assignment_revision, trạng thái, verdict, điểm và metadata |
| code_submission_tests | Kết quả từng test, tài nguyên; actual/console chỉ lưu cho SAMPLE |
| code_judge_jobs | Queue: run_after, attempts lỗi hạ tầng, locked_until, last_error, completed_at |
| code_runs | Metadata chạy thử: student, bài, ngôn ngữ, kind, outcome, duration; không lưu source/output của lần run |
| assignment_receipts | Receipt chống tạo submission trùng theo actor + route + Idempotency-Key |
| assignment_audits | Lịch sử thao tác assignment, validate, extension, rejudge, void |
| code_assignment_scores | View chọn bài GRADED có điểm cao nhất của mỗi student/assignment |

Các ràng buộc DB có ý nghĩa với việc mở rộng:

- Chỉ một submission QUEUED/RUNNING cho mỗi student/assignment, bằng partial unique index.
- attempt_number tăng duy nhất theo student/assignment, không phải số lượt đã bị trừ.
- Content của code_problems, languages, tests, references chỉ được sửa khi assignment là DRAFT; có trigger bảo vệ.
- Submission GRADED chỉ được chuyển VOIDED và giữ nguyên các trường kết quả được trigger bảo vệ; VOIDED bất biến.
- Kết quả test append-only: không UPDATE/DELETE.
- HIDDEN bắt buộc actual và console_excerpt là NULL.
- Các khóa ngoại chủ yếu ON DELETE RESTRICT; xoá draft qua service là soft-delete assignment.
- Migration down từ chối rollback nếu đã có bài CODE hoặc submission.

**Điểm cao nhất** được tính qua view, không phải một cột cache được worker tự cập nhật. Khi bằng điểm, chọn submitted_at sớm hơn, rồi id nhỏ hơn. Bài VOIDED rời khỏi tập ứng viên của view.

## 6. Luồng mentor: từ tạo đề đến publish

### 6.1. Tạo khung bài

Web mở block “Bài tập code” trong trang buổi học:

1. GET danh sách assignments của session, lọc type=CODE.
2. POST tạo assignment: purpose=HOMEWORK trên form web hiện tại, type=CODE, title, maxScore, dueAt, maxAttempts.
3. Mặc định form: 10 điểm, 10 lượt; BE cũng mặc định CODE là 10 lượt nếu không truyền.
4. BE kiểm tra mentor có quyền trên session, trạng thái lớp/buổi còn cho phép ghi, deadline có mặt, không có quiz timer, lượt 1–50.
5. Tạo assignment DRAFT; chưa có code_problem.
6. Web chuyển sang /mentor/assignments/:assignmentId.

API cho phép purpose TEST hoặc HOMEWORK; UI tạo CODE riêng hiện cố định HOMEWORK.

### 6.2. Wizard web bốn bước

| Bước | UI | Xử lý chính |
| --- | --- | --- |
| 1 | Đề bài | Statement, constraints, độ khó; với bài hoàn toàn mới dữ liệu được lưu cùng signature ở bước 2 |
| 2 | Hàm cần viết | Function name, params/return type, ngôn ngữ và cấu hình chấm/limits |
| 3 | Lời giải & test | Soạn reference, nhập từng input hoặc dán nhiều test, sinh expected, lưu tests và validate |
| 4 | Giao đề | Preview student, cấu hình đã lưu, blockers, publish |

Mọi write nội dung draft gửi **expectedRevision**. BE kiểm tra revision dưới transaction/lock; write thành công tăng revision. Chuỗi write trên web phải dùng revision của response trước.

PUT code-problem kiểm tra signature và FLOAT epsilon. Khi đổi signature:

- Tests đang lưu phải còn khớp kiểu; nếu không trả lỗi kèm positions.
- Chỉ starter còn đúng bằng starter tự sinh trước đó mới được tự tái tạo.
- Starter đã custom không tự bị ghi đè; reference cần mentor cập nhật và validate lại.

PUT code-languages thay thế danh sách, sinh starter nếu thiếu; reference của ngôn ngữ bị bỏ được xoá.

### 6.3. Sinh expected output

POST code-tests/generate nhận **languageKey + sourceCode + inputs**, có thể dùng lời giải chưa lưu.

1. Kiểm tra bài DRAFT, quyền mentor, ngôn ngữ thuộc bài.
2. Validate từng input theo signature và kích thước.
3. Ghép driver, chạy priority interactive ngoài DB transaction.
4. Parse return value, kiểm tra nó đúng kiểu returnType và kích thước.
5. Trả outputs theo index với expected, status, console, stderr, timeMs, memoryKb.
6. **Không lưu tests/reference hoặc tăng revision** tại endpoint này.

Các status sinh output: OK, TIME_LIMIT, MEMORY_LIMIT, RUNTIME_ERROR, OUTPUT_LIMIT, NO_RESULT, INVALID_RETURN. Lỗi compile trả compileStatus riêng và outputs rỗng.

Web cho nhập chuỗi trực tiếp; các kiểu khác parse JSON. Expected trên bảng là giá trị do reference chạy ra, không phải ô nhập tay. Nếu sửa input hoặc source reference, UI đánh dấu expected cũ là stale.

**Khác biệt UI/API:** API upsert/replace tests vẫn nhận expected trực tiếp. Việc bắt buộc sinh expected bằng reference là cách UI hiện tại dẫn luồng; backend vẫn validate lời giải với tests ở bước validate.

### 6.4. Lưu và validate

Nút “Lưu & kiểm tra” trên web:

1. Lưu reference đã thay đổi, dùng revision mới sau từng lần lưu.
2. PUT code-tests thay toàn bộ bảng, position là 1..n theo thứ tự array.
3. POST code-validate với revision cuối.

**Chỉ cần tối thiểu một reference** trong các ngôn ngữ được chọn. Reference ở ngôn ngữ còn lại là tuỳ chọn. Validate chạy **mọi reference đang lưu** trên **mọi test**, lần lượt từng reference, không chỉ reference đang chọn trên tab.

Validate lấy kế hoạch ở transaction đọc, gọi runner ngoài transaction, rồi kiểm tra lại trạng thái/revision ở transaction ghi. Nếu draft đã bị sửa trong lúc chạy, kết quả cũ không được xác nhận cho revision mới.

Nếu tất cả reference đều compile OK và pass hết test, code_problems.validated_revision được đặt bằng revision hiện tại. Nếu thất bại đặt NULL. Kết quả từng reference được lưu trong last_validation.

Sinh expected và validate cùng dựa vào lời giải mẫu: hệ thống chứng minh **tính nhất quán giữa reference và tests**, không tự chứng minh reference đúng với ý định của đề. Mentor vẫn cần review sample/expected.

### 6.5. Publish gate và đóng băng

POST publish yêu cầu:

- Có problem và statement không rỗng.
- Có ít nhất một ngôn ngữ.
- Có ít nhất một SAMPLE và một HIDDEN.
- Có ít nhất một reference.
- validated_revision bằng assignment.revision tại lúc publish.
- Deadline còn ở tương lai; quyền/trạng thái chung còn hợp lệ.

Lỗi trả blocker đầu tiên làm code và danh sách đầy đủ tại details[0].blockers. CODE_REFERENCE_NOT_VALIDATED dùng 409; các blocker thiếu dữ liệu dùng 422.

Publish tăng assignment revision và đổi PUBLISHED. Việc validatedRevision không bằng revision mới sau publish là hệ quả của bước chuyển trạng thái; gate này phục vụ draft.

Sau publish:

- Nội dung signature/test/reference/scoring/limits bị đóng băng ở service và DB.
- code-extension chỉ tăng deadline và/hoặc tăng maxAttempts, có reason và expectedRevision.
- Không được giảm lượt; không cho extension không thay đổi gì.
- Archive chuyển ARCHIVED; submission QUEUED/RUNNING bị VOIDED với reason ASSIGNMENT_ARCHIVED, job chưa xong được hoàn tất.
- Submission đã GRADED được giữ lại; lịch sử student vẫn có API đọc riêng.
- Không có luồng mở lại ARCHIVED hoặc sửa đề đã publish trong implementation hiện tại.

### 6.6. Template và thư viện

Web có quick-start template cục bộ và import từ thư viện:

- Apply template thực hiện nhiều request: lưu problem → chọn JavaScript → lưu reference → generate expected → lưu tests → validate.
- Chuỗi này **không atomic trên toàn bộ thao tác**; request sau lỗi thì các bước đã lưu trước đó vẫn còn.
- Thư viện liệt kê bài CODE do mentor hiện tại tạo, có tìm kiếm tiêu đề/mã lớp và phân trang.
- Import thay problem, languages, tests và references vào draft đích; không sao chép trạng thái validation.
- Source do mình tạo được tái sử dụng; source của mentor khác cần còn có quyền đọc.
- Không import trực tiếp deadline/lượt/điểm tối đa của assignment nguồn; description chỉ được bổ sung nếu đích còn rỗng.

## 7. Luồng student trên web

### 7.1. Mở bài

/user/assignments lấy lớp từ workspace học viên, chọn enrollment ACTIVE, rồi GET assignments của lớp có type=CODE. Màn hình hiện lấy pageSize=50, chưa có UI phân trang danh sách CODE riêng.

/user/assignments/:assignmentId dùng trang assignment chung để phân loại rồi chuyển sang StudentCodePage nếu type CODE.

GET /me/assignments/:id/code trả:

- Metadata, deadline, serverNow, deadlinePassed.
- maxAttempts, attemptsUsed, attemptsRemaining, canSubmit.
- bestScore, bestSubmissionId, inFlightSubmissionId.
- Problem, signature, starter/ngôn ngữ.
- SAMPLE input/expected/explanation và số lượng HIDDEN.

canSubmit được BE tính theo PUBLISHED + chưa quá hạn + còn lượt + chưa có bài đang chấm. Khi submit thật, BE kiểm tra lại đầy đủ.

Quyền student dựa vào account ACTIVE, enrollment ACTIVE, lớp/session được truy cập; các legacy unit-release/LOCKED gates đã bị bỏ khỏi access policy hiện tại. Class COMPLETED chặn thao tác ghi; lớp/session CANCELLED chặn truy cập student theo quy tắc access.

### 7.2. Editor và lưu nháp

Editor web là **textarea + line numbers**, không dùng Monaco/CodeMirror. Có Tab/Shift+Tab, auto-indent và ghép cặp dấu ngoặc/nháy; chưa có syntax highlighting, autocomplete theo ngôn ngữ, breakpoint hoặc debug runtime.

Draft phân biệt theo assignment/student/language:

1. GET code-drafts/:language: nếu chưa lưu trả starter và version=0.
2. Sau khi code đổi, debounce **2 giây**.
3. PUT sourceCode + expectedVersion.
4. expectedVersion=0 tạo lần đầu; các lần sau UPDATE theo version đang giữ.
5. Version không khớp trả CODE_DRAFT_VERSION_CONFLICT; tránh ghi đè nháp từ tab/web/app khác.

Nháp và submission là dữ liệu riêng: Run/Submit gửi code đang hiển thị trực tiếp, không lấy source từ draft trong DB và không đợi autosave thành công.

Backend saveDraft kiểm tra PUBLISHED và quyền ghi, **không gọi kiểm tra deadline trong open()**. Vì vậy ở cấp API nháp có thể tiếp tục lưu sau deadline nếu bài/lớp vẫn cho phép ghi. Run và Submit có kiểm tra deadline.

### 7.3. Chạy thử

POST code-runs:

~~~json
{
  "languageKey": "javascript",
  "sourceCode": "function twoSum(nums, target) { return [0, 1]; }",
  "customArgs": [[2, 7, 11, 15], 9]
}
~~~

- Không có customArgs: chạy tất cả SAMPLE của bài.
- Có customArgs: chạy **một** bộ tham số tự nhập; không chạy HIDDEN.
- BE kiểm tra source ≤64 KiB UTF-8, đúng kiểu customArgs, trạng thái và deadline.
- Rate limit theo student trên tất cả bài, dùng advisory lock và lịch sử code_runs: mặc định 10 lần/phút và 300 lần/24 giờ trượt.
- Một run được ghi metadata STARTED trước khi gọi runner; cập nhật outcome/duration sau. Source/output không lưu trong bảng này.
- Hết slot hoặc runner lỗi vẫn có run metadata, nên có thể góp vào quota lần run.
- Priority interactive, xử lý đồng bộ.
- SAMPLE được so với expected; CUSTOM không có expected, kết quả hợp lệ trả COMPLETED.
- Response có compileStatus, compileOutput, runtimeVersion và tests gồm actual/console/stderr/tài nguyên.
- Run không tạo submission, không cộng điểm và không tiêu lượt nộp.

“Không lưu run” trong comment/controller cần hiểu là **không lưu bài làm/kết quả chấm**; code_runs vẫn lưu metadata phục vụ quota/audit.

### 7.4. Nộp bài

Web hiển thị modal xác nhận rồi POST code-submissions với source hiện tại và **Idempotency-Key UUID v4**.

BE xử lý trong transaction:

1. Kiểm tra student/source/key và tải context có quyền ghi.
2. Khoá advisory theo actor + route + key.
3. Nếu receipt cùng key đã có: cùng fingerprint trả submission cũ; khác fingerprint trả IDEMPOTENCY_KEY_REUSED.
4. Với request mới: kiểm tra PUBLISHED/deadline/ngôn ngữ.
5. Khoá advisory theo assignment + student để serialize việc đếm lượt.
6. Từ chối nếu có QUEUED/RUNNING hoặc đã hết lượt.
7. Ghi submission QUEUED, snapshot source/hash/revision/max_score/enrollment; attempt_number = max cũ + 1.
8. Ghi code_judge_jobs và assignment_receipts trong cùng transaction.
9. Trả **202** cho submission mới; replay cùng key trả **200**.

Fingerprint gồm languageKey và SHA-256 của source; route có assignmentId. Replay receipt diễn ra sau kiểm tra context/quyền, nhưng trước kiểm tra deadline/lượt của request mới.

Web giữ key cho request cùng fingerprint khi gặp lỗi mạng/5xx; 4xx được coi là câu trả lời xác định và xoá key. Key chưa xác định chỉ giữ trong useRef của component, không bền qua reload/unmount.

### 7.5. Theo dõi và lịch sử

- View bài poll **1.500 ms** khi có inFlightSubmissionId.
- Lịch sử poll **1.500 ms** khi props hoặc dữ liệu cho biết còn submission pending.
- Detail student poll **1.500 ms** khi QUEUED/RUNNING.
- DTO backend cung cấp retryAfterMs=1500 cho pending; web hiện dùng số 1500 cố định.
- Màn hình hiển thị status/verdict, điểm, số test pass, reason void, compile output và source đã nộp.
- Chi tiết HIDDEN chỉ có position, visibility, status, timeMs, memoryKb.
- GET lịch sử/detail riêng chỉ cần account ACTIVE và ownership, nên vẫn đọc được sau archive hoặc kết thúc enrollment. View đề/draft vẫn đi qua context của bài.

## 8. Worker, queue và trạng thái submission

~~~mermaid
stateDiagram-v2
    [*] --> QUEUED: submit
    QUEUED --> RUNNING: claim job
    RUNNING --> GRADED: có báo cáo hợp lệ và chấm xong
    RUNNING --> QUEUED: runner busy / lỗi hạ tầng còn retry
    RUNNING --> FAILED: lỗi hạ tầng lần thứ 5
    FAILED --> QUEUED: mentor rejudge
    QUEUED --> VOIDED: archive / mentor void
    RUNNING --> VOIDED: archive / enrollment inactive / mentor void
    GRADED --> VOIDED: mentor void
    FAILED --> VOIDED: mentor void
~~~

### 8.1. Claim và lease

- Worker khởi động cùng app NestJS nếu CODE_JUDGE_JOB_ENABLED=true.
- Nếu CODE_RUNNER_URL rỗng lúc bootstrap: worker không đặt timer, submission vẫn nằm queue; cần cấu hình rồi restart app để worker bắt đầu.
- Poll mỗi **1 giây**, giữ tối đa CODE_JUDGE_CONCURRENCY task đang chạy trong mỗi process.
- Claim dùng UPDATE với SELECT FOR UPDATE SKIP LOCKED; chỉ lấy job đến run_after, chưa completed và chưa có lease còn hiệu lực.
- Lease dài **ceil(CODE_RUNNER_TIMEOUT_MS / 1000) + 60 giây**.
- Claim chuyển submission QUEUED/RUNNING thành RUNNING và tăng version.
- Lease token là text locked_until với độ chính xác microsecond; worker chỉ ghi kết quả khi vẫn giữ token đó.

Process bị crash hoặc lỗi DB bất ngờ có thể để job đang lease; sau khi lease hết, worker khác claim lại. Không có heartbeat gia hạn lease trong code hiện tại.

### 8.2. Execution và finalize

1. Transaction REPEATABLE READ lấy submission, problem, tests và time multiplier.
2. Sinh nonce ngẫu nhiên; ghép source và stdin.
3. Gọi runner priority batch **ngoài transaction**.
4. Chấm từng test bằng domain.
5. Transaction finalize khoá job đúng lease và submission.
6. Nếu lease đã mất hoặc submission không còn RUNNING: không ghi kết quả chấm cũ.
7. Nếu assignment ARCHIVED hoặc enrollment không ACTIVE: chuyển VOIDED.
8. Nếu hợp lệ: ghi test results, tổng điểm/verdict/runtime, judged_at và hoàn tất job.
9. Gửi socket hint tốt nhất có thể; lỗi push không làm mất kết quả DB.

Không kiểm tra lại deadline ở finalize: bài đã được nhận đúng hạn vẫn được chấm sau hạn. Không yêu cầu assignment_revision vẫn bằng snapshot vì content published bị đóng băng; extension chỉ đổi deadline/lượt.

### 8.3. Retry

| Loại lỗi | Cách xử lý |
| --- | --- |
| Runner trả 429 | Đưa QUEUED, chờ retryAfterSeconds; không tăng attempts lỗi hạ tầng |
| Mất mạng, timeout HTTP, response không đúng contract, runner trả lỗi khác | Tăng attempts lỗi hạ tầng, backoff |
| Lần lỗi hạ tầng 1–4 | Chờ lần lượt 5, 15, 45, 120 giây |
| Lần lỗi hạ tầng thứ 5 | FAILED, hoàn tất job; không trả verdict “code sai” |
| Exception ngoài nhánh xử lý runner / lỗi DB | Worker log; lease hết sẽ cho claim lại |

Domain còn khai báo mốc backoff 300 giây, nhưng nhánh hiện tại kết thúc ở lỗi thứ 5 nên mốc đó không được dùng cho một job retry bình thường.

Busy có thể lặp lại không giới hạn theo attempts. Lỗi invariant/bug ngoài nhánh reschedule cũng không tự được tính vào ngưỡng 5 lỗi.

### 8.4. Lượt nộp và trạng thái

Rule đếm lượt thực tế:

~~~sql
counts_as_attempt AND status <> 'FAILED'
~~~

- QUEUED/RUNNING tạm chiếm một lượt và chặn nộp thêm.
- GRADED/COMPILE_ERROR được đặt counts_as_attempt=false: điểm 0, không trừ lượt.
- Compile TIMEOUT cũng đi qua nhánh COMPILE_ERROR khi chấm submission.
- FAILED do hạ tầng không tính lượt qua điều kiện status; cờ countsAsAttempt trên DTO có thể vẫn là true.
- VOIDED giữ cờ counts_as_attempt; bài bình thường bị mentor huỷ vẫn tính lượt. Bài vốn compile error có cờ false vẫn giữ ngoại lệ đó.
- Một bài FAILED được void có thể trở thành lượt được đếm do status đổi khỏi FAILED nếu cờ vẫn true.
- attempt_number không giảm hoặc được dùng lại sau các lần miễn lượt.

## 9. Driver, chấm output và tính điểm

### 9.1. Protocol giữa backend và chương trình

stdin của mỗi test là JSON array + newline:

~~~text
[[2,7,11,15],9]
~~~

JavaScript driver nối sau source học viên, đọc stdin rồi gọi trực tiếp twoSum(...args). Driver JS **không await Promise**.

Java driver:

- Điều chỉnh public class Solution thành class Solution bằng regex.
- Sinh public class Main và helper MindyJson đọc/ghi đúng các kiểu được hỗ trợ.
- Đọc stdin → chuyển tham số theo signature → new Solution().method(...) → serialize kết quả.

Dòng return trong stdout có định dạng:

~~~text
<newline><U+001E>MINDY:<nonce>:<JSON return value><newline>
~~~

Backend tìm marker cuối cùng đúng nonce, parse JSON; phần stdout còn lại thành console. Marker giúp phân biệt return với log thông thường, **không phải cơ chế chứng thực chương trình học viên**.

Lưu ý: JS undefined được driver chuyển thành null. Đối với chấm hiện tại, thiếu marker/JSON không parse được thì WRONG_ANSWER nếu process chạy OK. Với CUSTOM input, thiếu kết quả được chuyển thành RUNTIME_ERROR.

### 9.2. Compare modes

| Mode | Cách so |
| --- | --- |
| EXACT | Scalar theo equality; array đệ quy, có thứ tự |
| FLOAT | So số với abs(a-b) ≤ epsilon × max(1, abs(a), abs(b)); đi đệ quy trong array |
| UNORDERED | Nếu cả hai là array: JSON.stringify từng phần tử rồi sort, so như multiset ở cấp ngoài cùng |

UNORDERED không tự bỏ qua thứ tự mọi cấp của ma trận, không kết hợp FLOAT tolerance; số lượng phần tử lặp vẫn quan trọng.

Đường judgeTest so giá trị parsed với expected, không gọi lại matchesType(returnType, actual). Vì vậy nếu muốn cưỡng chế kiểu return nghiêm ngặt, cần bổ sung ở đường chấm; ví dụ EXACT hiện so 1 và 1.0 như cùng một number.

### 9.3. Test verdict và submission verdict

Test có PASSED, WRONG_ANSWER, TIME_LIMIT, MEMORY_LIMIT, RUNTIME_ERROR, OUTPUT_LIMIT.

- Runner status khác OK được dùng làm verdict tài nguyên/runtime tương ứng.
- Runner OK nhưng thiếu kết quả hoặc kết quả khác expected → WRONG_ANSWER.
- Pass tất cả → ACCEPTED.
- Pass ít nhất một nhưng chưa tất cả → PARTIAL, kể cả test còn lại lỗi runtime/tài nguyên.
- Không pass test nào → verdict của test lỗi đầu tiên theo thứ tự tests.
- Compile ERROR/TIMEOUT → COMPILE_ERROR, không ghi các kết quả test riêng.

### 9.4. Điểm

- PER_TEST: passedWeight / totalWeight × maxScore; SAMPLE và HIDDEN đều góp trọng số.
- ALL_OR_NOTHING: chỉ nhận maxScore khi pass tất cả, ngược lại 0.
- Tính bằng BigInt theo đơn vị phần trăm điểm, half-up một lần, trả decimal string hai số lẻ.
- Verdict độc lập với mode điểm: ALL_OR_NOTHING vẫn có thể PARTIAL nhưng score=0.
- maxTimeMs/maxMemoryKb của submission là **max trên các test**, không phải tổng.
- Điểm bài cuối cùng chọn lần GRADED có score cao nhất qua view; không bắt buộc lần nộp mới nhất.

## 10. compiler-runner v2 và sandbox thực thi

### 10.1. Contract nội bộ

POST /internal/v1/executions cần Bearer token chung, tối thiểu 32 ký tự. So token bằng digest và timingSafeEqual. Caller không được gửi Docker image hoặc lệnh shell tùy ý.

~~~json
{
  "executionId": "0f8fad5b-d9cb-469f-a165-70867728950e",
  "language": "javascript",
  "priority": "batch",
  "source": "...source đã ghép driver...",
  "limits": {
    "compileTimeoutMs": 20000,
    "cpuTimeMs": 2000,
    "wallTimeMs": 5000,
    "memoryMb": 256,
    "outputBytes": 65536
  },
  "tests": [{ "id": "t1", "stdin": "[[2,7],9]\n" }]
}
~~~

Runner nhận source và input, **không nhận expected**, signature nghiệp vụ hoặc thang điểm.

Response 200 gồm executionId, language, runtimeVersion, compile, tests, durationMs. Mỗi test có id, status, stdout/stderr, exitCode, timeMs, memoryKb. BE adapter hiện sử dụng runtime/compile/tests, không giữ exitCode và durationMs trong report nghiệp vụ.

| HTTP | Ý nghĩa |
| --- | --- |
| 200 | Có report thực thi, có thể chứa compile/runtime error |
| 401 | Bearer sai/thiếu khi token đã cấu hình |
| 422 | Execution request không hợp lệ |
| 429 | Không còn slot của priority, hiện retryAfterSeconds=2 |
| 503 | Token chưa cấu hình hoặc lỗi hạ tầng Docker/harness |

GET /internal/v1/health không yêu cầu token, trả registry ngôn ngữ và số slot. Nó không thực thi container thử hay kiểm tra sâu image/compiler/Docker daemon.

executionId dùng định danh container và report; runner chưa có receipt/cache bảo đảm idempotency execution.

### 10.2. Registry và limits

| Thuộc tính | JavaScript | Java |
| --- | --- | --- |
| key | javascript | java21 |
| runtime | Node.js 22 | Java 21 |
| file | main.js | Main.java |
| compile/check | node --check | javac |
| compile timeout tối thiểu registry | 10 giây | 20 giây |
| run | node với --max-old-space-size | java với -Xmx, cấu hình JVM trong registry |
| time multiplier seed trong BE | 1 | 2 |
| startupAllowanceMs | 200 | 1000 |
| container memory | max(memoryMb+64,128) MB | max(memoryMb+192,512) MB |

BE runnerLimits:

~~~text
cpu = clamp(round(problem.cpuTimeLimitMs × language.timeMultiplier), 100, 20000)
wall = min(60000, cpu × 2 + 1000)
compileTimeout = 20000 ms
outputBytes = 65536
~~~

Runner cộng startup allowance vào CPU, và **2 × startup allowance** vào wall. Compile timeout dùng max(request, registry).

Memory đề là mức heap cấu hình cho Node/JVM; container được cấp thêm overhead. Harness hiện nhận rssLimitKb=0 nên không áp một ngưỡng RSS riêng bằng đúng memoryMb của đề.

### 10.3. Vòng đời một execution

1. Acquire slot interactive hoặc batch.
2. Spawn docker run, tên mindy-judge-{executionId}.
3. Gửi JSON harness qua stdin gồm source file, lệnh compile/run đã định nghĩa ở server, tests và limits.
4. Harness ghi source trong /work; compile đúng một lần.
5. Mỗi test tạo process mới, stdin riêng; chạy tuần tự toàn bộ tests, không dừng sớm khi một test sai.
6. Harness đo CPU user+system và max RSS của process bằng rusage.
7. Tổng hợp một JSON report; executor kiểm tra shape và test IDs theo thứ tự.
8. Finally cố gắng xoá container và trả slot.

Process mới cho mỗi test giúp reset trạng thái trong process; các test của một execution vẫn dùng chung container và thư mục /work. Không nên coi đây là sandbox filesystem mới hoàn toàn cho từng test.

Container có network none, read-only rootfs, user 65534, cap-drop ALL, no-new-privileges, CPU/memory cap, memory-swap bằng memory, pids-limit 128, nofile 256, tmpfs /work 64 MB và /tmp 16 MB. Judge container không được mount Docker socket; service runner có mount socket để tạo container.

Harness áp CPU rlimit, wall timer và giới hạn output, dọn process group sau test. Việc phân loại MEMORY_LIMIT dựa vào tín hiệu SIGKILL không do wall/output handler, marker OOM của runtime, hoặc RSS limit nếu có cấu hình; đây không phải phép đo chính xác lượng heap dùng bởi lời giải.

stdout quá hạn mức làm kill process; stderr được cap 4 KiB. Compile output cap 8 KiB. Các giới hạn excerpt ở BE còn cắt thêm sau khi nhận report.

Timeout bao toàn container:

~~~text
min(compileTimeout + số test × (wallMs đã cộng allowance + 300 ms) + 15000 ms,
    10 phút)
~~~

Startup runner cố cleanup container có label mindy-judge=true và legacy js-runner-mvp=true. Nếu sau này nhiều runner replica dùng chung Docker daemon, cơ chế cleanup theo label chung cần được thiết kế lại để tránh xoá execution của replica khác.

### 10.4. Hai nhóm slot

Mặc định **interactive=1**, **batch=2**, độc lập trong bộ nhớ của một runner process. Không mượn slot rảnh của nhóm kia và không có hàng đợi chờ slot trong runner.

Các thao tác generate/validate của mentor dùng cùng pool interactive với Run của student. Validate nhiều reference gọi lần lượt, mỗi reference là một execution.

### 10.5. Cấu hình và giới hạn xuyên tầng

| Cấu hình | Mặc định/giá trị mẫu trong source | Ý nghĩa |
| --- | --- | --- |
| BE CODE_RUNNER_URL | Rỗng trong schema/dev example | Không có URL: run/validate lỗi 503, worker không khởi động vòng poll |
| BE CODE_RUNNER_TOKEN | Rỗng nếu chưa cấu hình; URL có giá trị thì token phải ≥32 ký tự | Phải bằng RUNNER_TOKEN của runner |
| BE CODE_RUNNER_TIMEOUT_MS | Schema/dev 120.000 ms; production example 80.000 ms | Timeout mỗi lời gọi HTTP tới runner, không phải tổng cả bước validate nhiều reference |
| BE CODE_JUDGE_JOB_ENABLED | true | Bật worker trong app process |
| BE CODE_JUDGE_CONCURRENCY | 2; range 1–8 | Task batch tối đa mỗi BE process |
| BE CODE_RUN_PER_MINUTE | 10 | Quota run trên mỗi student, không phải mỗi bài |
| BE CODE_RUN_PER_DAY | 300 | Quota run trong 24 giờ trượt |
| Runner RUNNER_SLOTS_INTERACTIVE | 1 | Pool Run/generate/validate |
| Runner RUNNER_SLOTS_BATCH | 2 | Pool chấm submission |
| Runner JUDGE_NODE_IMAGE / JUDGE_JAVA_IMAGE | mindy-judge-node:1 / mindy-judge-java:1 | Image thực thi do registry kiểm soát |
| Runner JUDGE_CPUS | 1 | CPU quota của mỗi judge container |
| Runner HOST / PORT | Code: 127.0.0.1:4000; compose: 0.0.0.0:4000 | Bind của service runner |
| Runner LEGACY_RUN_ENABLED | Code: tắt; production compose: true | Bật legacy playground |

BE nối network external **mindy-compiler** bằng compose.code-runner.yaml; compose của runner tạo network này dưới dạng internal và alias **compiler-runner**. Production env mẫu BE dùng URL **http://compiler-runner:4000**. Đây là cấu hình mẫu được đọc từ repo, chưa kiểm tra env production thực tế.

| Tầng | Giới hạn đáng chú ý |
| --- | --- |
| BE assignment CODE | 1–50 lượt; CPU đề 100–10.000 ms, memory đề 64–512 MB |
| BE source/draft/reference/starter | Tối đa 65.536 byte UTF-8; một số DTO/Zod có kiểm tra chiều dài ký tự trước kiểm tra byte của service |
| BE tests | Tối đa 30; JSON input và expected mỗi phần tối đa 65.536 byte; weight 1–100 |
| Web/BE JSON parser cho CODE | Tổng request thường tối đa 256 KiB; route assignment dùng chung có policy riêng |
| Runner request | Source sau ghép driver ≤192 KiB; 1–50 tests; stdin ≤256 KiB/test, tổng ≤4 MiB |
| Runner limits contract | CPU 100–20.000 ms; wall 200–60.000 ms và ≥CPU; memory 32–1024 MB; output 1 KiB–1 MiB |
| Runner parser/harness | JSON API executions 6 MB; harness input tối đa 8 MiB |

Các mức rộng hơn ở runner là contract hạ tầng; UI/BE không tự được quyền dùng hết những mức đó. Đặc biệt, thêm ngôn ngữ vào registry runner chưa đủ để backend và client chấp nhận language key mới.

## 11. API legacy playground

| Mục | Hiện tại |
| --- | --- |
| Endpoint | POST /api/code/run trên compiler-runner |
| Auth | Không có user/token guard |
| Feature flag | Chỉ chạy nếu LEGACY_RUN_ENABLED đúng chuỗi true, ngược lại 404 |
| Default trong code | Tắt nếu không có env |
| Default compose.production.yaml | Bật: LEGACY_RUN_ENABLED mặc định true |
| Body | code, stdin tùy chọn |
| Ngôn ngữ | JavaScript, chạy node -e theo CommonJS |
| Limits | Code 64 KiB, stdin 32 KiB; 4 giây, 128 MB container, 0.5 CPU, 2 concurrent, output 64 KiB mỗi stream |
| Kết quả | ok, status, stdout, stderr, exitCode, durationMs, truncated, error tùy chọn |
| Status | success, user_error, timeout, output_limit, infrastructure_error; hết concurrency trả HTTP 429 |
| Không có | Assignment, draft, tests ẩn, expected, score, deadline, durable queue |

Compose hiện chỉ khai báo network Docker internal, không publish port của runner ra host. Việc API legacy không có auth **không tự chứng minh rằng endpoint đang public trên Internet**; cần kiểm tra reverse proxy/deployment thật nếu muốn kết luận exposure.

Nếu phát triển playground tự do, cần quyết định rõ tách thành feature mới hay chuẩn hoá legacy. Không thể coi code-runs của assignment là playground: endpoint đó cần assignment đã publish, enrollment và deadline hợp lệ.

## 12. Frontend web, Flutter và realtime

### 12.1. Web API boundary

- Browser chỉ gọi same-origin /api/v1.
- apiRequest dùng cookie, cache no-store, validate response bằng Zod; refresh phiên đăng nhập đi qua coordinator chung.
- Proxy server chuyển tới API_BASE_URL, chọn cookie access_token, kiểm tra Origin khi ghi, UUID/path/method, schema body/query và Idempotency-Key.
- CODE-specific body limit 256 KiB, timeout thông thường 10 giây; code-runs/generate/validate tăng 90 giây.
- Browser-side timeout thông thường 15 giây; Run/generate/validate đặt 95 giây.
- resolveAssignmentRule được xét trước codeProxyRule. Các route dùng chung như create/list assignment, publish/archive/delete đi qua policy assignment chung; không phải tất cả đều dùng CODE_BODY_LIMIT.
- TanStack Query giữ server state, key chứa session user và path.
- useCodeCommand không auto retry mutation; sau mỗi command invalidate cả prefix code và assignments.

### 12.2. Mentor review web

- /mentor/assignments/:id/review: roster 20 student/trang; danh sách submission lấy 50 bản đầu, có filter student.
- Danh sách submission refetch mỗi **5 giây**; summary không có refetchInterval riêng.
- /mentor/code-submissions/:id: source, tests gồm hidden input/expected, lastError nếu FAILED; detail pending poll mỗi **2 giây**.
- Rejudge chỉ cho FAILED và assignment còn PUBLISHED; reset job về queue. Không chấm lại bài đã GRADED.
- Void cần reason, thông báo cho student và audit; không có chấm điểm tay trong CODE review hiện tại.
- Duplicate flag là **SHA-256 trùng source byte-for-byte của student khác trong cùng assignment**, không phải thuật toán nhận diện đạo văn. Query hiện không lọc language hay trạng thái của bài đối chiếu.
- Summary gồm enrollment ACTIVE và cả người đã có submission. averageBestScore chỉ trung bình trên người có best score, không tự tính người chưa nộp là 0.

Reporting assignment chung cũng đã gộp CODE: mỗi assignment/student tính một bản tổng hợp từ submission không VOIDED; có một GRADED còn tồn tại thì được coi đã graded/released dù lần mới nhất đang pending.

### 12.3. Flutter

Checkout hiện tại có đầy đủ thư mục lib/features/code_assignments/ và test/code_assignments_test.dart:

- API gọi cùng me/... của backend; không qua proxy Next.js. ApiClient dùng cookie jar/secure storage và thêm Origin từ APP_ORIGIN khi ghi; giá trị này phải nằm trong CORS_ORIGINS của backend.
- Màn hình danh sách → /code/:assignmentId → /code/:assignmentId/editor.
- Student xem đề, sample, số test ẩn, lịch sử; soạn code, đổi ngôn ngữ, run sample/custom và submit.
- Editor dùng Flutter text field và helper chỉnh sửa; có undo/redo và phím phụ.
- Autosave debounce **1.500 ms**; provider serialize save và giữ source mới nhất trong queue nếu đang có save.
- Có thao tác flush khi rời/đổi ngôn ngữ/trước submit, nhưng lời gọi flush được phát đi không chờ hoàn tất; submission vẫn gửi source hiện tại.
- Conflict version chặn lưu đè và cung cấp nút reload.
- Run timeout **95 giây**.
- Submit dùng IdempotentCall giữ cùng key + body khi kết quả không xác định; chặn tạo request submit mới đến khi retry được xử lý.
- Poll theo retryAfterMs, kẹp **1–5 giây**, tối đa **60 giây** rồi cho refresh tay; timeout này không tự làm submission FAILED.
- Models từ chối response HIDDEN có input/expected/actual; đây là lớp kiểm tra thêm ở client.
- Nhánh mentor trên app hiện chỉ đọc danh sách CODE theo session và summary 100 student đầu; soạn đề/rejudge/void vẫn là luồng web.
- Countdown sử dụng serverNow cộng thời gian trôi kể từ lúc nhận response.

### 12.4. Realtime

BE notifier đẩy **code_submission.updated** tới kết nối của chính student thông qua ChatSocketService, hoạt động theo khả năng transport Chat.

Payload chỉ có submissionId, assignmentId, status; client cần refetch detail để có kết quả.

Trong các client CODE đã kiểm tra, đường cập nhật thực tế là **polling**. Không tìm thấy subscription handler cho event này trong source web/Flutter đã rà soát; comment Flutter nói đây là tín hiệu phụ không có nghĩa đã có listener.

## 13. Bảng API để mở rộng

Tất cả endpoint BE dưới đây có prefix **/api/v1**. Browser web dùng cùng đường dẫn qua proxy Next.js.

### 13.1. Assignment dùng chung

| Method | Path | Chức năng |
| --- | --- | --- |
| GET/POST | /mentor/class-sessions/:sessionId/assignments | Danh sách/tạo draft; type CODE |
| GET/PATCH/DELETE | /mentor/assignments/:id | Đọc/sửa metadata draft/soft-delete draft |
| POST | /mentor/assignments/:id/publish | Publish với expectedRevision |
| POST | /mentor/assignments/:id/archive | Archive với expectedRevision + reason |
| GET | /me/classes/:classId/assignments | Student list, lọc type CODE |
| GET | /me/assignments/:id | Assignment detail chung, dùng để route đúng loại |

### 13.2. Mentor CODE

| Method | Path sau /mentor | Chức năng |
| --- | --- | --- |
| GET | /code-languages | Ngôn ngữ enabled |
| POST | /code-signatures/preview | Sinh starter JS/Java, không lưu |
| GET | /code-library | Bài do mentor tạo, q/page/pageSize |
| GET | /assignments/:id/code | Authoring detail, có hidden tests/reference |
| PUT | /assignments/:id/code-problem | Lưu statement/signature/settings |
| PUT | /assignments/:id/code-languages | Thay ngôn ngữ/starter |
| POST | /assignments/:id/code-import | Copy nội dung sourceAssignmentId |
| POST | /assignments/:id/code-tests/generate | Source + inputs → expected, không lưu |
| PUT | /assignments/:id/code-tests | Thay toàn bộ tests |
| PUT/DELETE | /assignments/:id/code-tests/:position | Upsert/xoá một test |
| PUT | /assignments/:id/code-reference/:languageKey | Lưu reference |
| POST | /assignments/:id/code-validate | Validate reference ở expectedRevision |
| POST | /assignments/:id/code-extension | Gia hạn/tăng lượt có reason |
| GET | /assignments/:id/code-summary | Thống kê/roster có page/pageSize/studentId |
| GET | /assignments/:id/code-submissions | Danh sách submissions có bộ lọc/phân trang |
| GET | /code-submissions/:submissionId | Source + test detail cho mentor |
| POST | /code-submissions/:submissionId/rejudge | Chỉ FAILED |
| POST | /code-submissions/:submissionId/void | Huỷ, có reason |

Các write nội dung draft, import, validate và extension dùng expectedRevision; generate không có revision token. Rejudge/void không nhận expectedRevision của assignment.

### 13.3. Student CODE

| Method | Path sau /me | Chức năng |
| --- | --- | --- |
| GET | /assignments/:id/code | Đề, sample, limits, lượt và best score |
| GET/PUT | /assignments/:id/code-drafts/:languageKey | Đọc/lưu nháp theo version |
| POST | /assignments/:id/code-runs | Run sample hoặc customArgs |
| POST | /assignments/:id/code-submissions | Submit, cần Idempotency-Key v4 |
| GET | /assignments/:id/code-submissions | Lịch sử của chính student, chưa phân trang |
| GET | /code-submissions/:submissionId | Detail của chính student |

Controller có AccessTokenGuard, RolesGuard và RequestOriginGuard. BE service kiểm tra thêm account, session/class/enrollment/ownership; proxy web không thay thế quyền backend.

### 13.4. Lỗi nghiệp vụ thường gặp

| Nhóm | Codes tiêu biểu |
| --- | --- |
| Sửa dữ liệu cũ | ASSIGNMENT_VERSION_CONFLICT, CODE_DRAFT_VERSION_CONFLICT |
| Đề đóng/hết hạn | ASSIGNMENT_CONTENT_FROZEN, ASSIGNMENT_CLOSED, ASSIGNMENT_DEADLINE_PASSED |
| Input/source | CODE_SIGNATURE_INVALID, CODE_TEST_TYPE_MISMATCH, CODE_CUSTOM_INPUT_INVALID, CODE_SOURCE_TOO_LARGE |
| Publish | CODE_PROBLEM_REQUIRED, CODE_SAMPLE_TEST_REQUIRED, CODE_HIDDEN_TEST_REQUIRED, CODE_REFERENCE_REQUIRED, CODE_REFERENCE_NOT_VALIDATED |
| Submit | IDEMPOTENCY_KEY_REQUIRED, IDEMPOTENCY_KEY_REUSED, CODE_SUBMISSION_IN_FLIGHT, CODE_ATTEMPTS_EXHAUSTED |
| Runner/quota | CODE_RUNNER_BUSY, CODE_RUNNER_UNAVAILABLE, CODE_RUN_RATE_LIMITED |
| Review | CODE_REJUDGE_NOT_ALLOWED, CODE_SUBMISSION_ALREADY_VOIDED |

Phân biệt **status** của submission với **verdict**: FAILED là lỗi hệ thống; WRONG_ANSWER là kết quả chấm; COMPILE_ERROR vẫn là status GRADED với verdict tương ứng.

## 14. Điểm cần lưu ý trước khi phát triển thêm

Đây là nhận xét từ source, không phải tất cả đã được tái hiện bằng browser/production.

| Mức ưu tiên đề xuất | Hiện trạng quan sát được | Tác động và việc nên xử lý |
| --- | --- | --- |
| Cao | Giới hạn tổng execution có thể dài hơn timeout HTTP | Proxy web 90s, browser 95s, BE mặc định 120s, production env mẫu 80s, runner có thể chạy tới 10 phút. Cần thống nhất budget hoặc chuyển generate/validate/run dài sang async |
| Cao | Request bị abort không có đường huỷ execution tương ứng ở runner | Client/BE ngừng chờ nhưng container có thể còn chạy tới overall timeout, giữ slot. Cân nhắc deadline truyền xuyên suốt/cancel và reconcile execution |
| Cao | Web autosave dùng timer và version ref, không serialize request và không flush khi đổi ngôn ngữ/rời trang | Có thể mất phần sửa chưa tới debounce hoặc tự gặp conflict nếu nhiều save chồng khi mạng chậm. Flutter đã có queue serialize để tham khảo |
| Cao | Poll web view chỉ bật khi response đã có inFlight; summary mentor không poll riêng; Flutter chỉ invalidate đề/lịch sử ngay lúc submit | Có tình huống dữ liệu điểm/lượt chưa cập nhật ngay khi submission đã xong. Nên invalidate phụ thuộc khi detail chuyển terminal, test cả job hoàn tất rất nhanh |
| Vừa | Nút Run trên web không dựa vào deadlinePassed/canRun | Sau hạn UI vẫn có thể cho bấm rồi nhận lỗi BE. Tách canRun khỏi canSubmit để không chặn run chỉ vì hết lượt, nhưng vẫn tôn trọng deadline |
| Vừa | Deadline web hiển thị từ serverNow của lần fetch, không có tick timer | Nhãn thời gian/nút có thể cũ khi ngồi lâu trên trang. BE vẫn giữ quyền quyết định; có thể dùng elapsed time giống Flutter |
| Vừa | Cờ countsAsAttempt của FAILED có thể true trong DTO, nhưng SQL vẫn miễn lượt | UI chỉ nhìn cờ có thể mô tả sai. Nên có trường effective attempt hoặc rule chung cho client |
| Vừa | Limits per-test 64 KiB × 30 lớn hơn body tổng 256 KiB | Một bộ tests hợp lệ từng dòng có thể không gửi cả bảng được; cần thiết kế size budget và bulk upload nhất quán |
| Vừa | Một reference đủ publish cho nhiều ngôn ngữ | Nếu thêm ngôn ngữ cần quyết định có bắt validate starter/driver hoặc reference cho từng ngôn ngữ hay giữ quy tắc hiện tại |
| Vừa | Memory limit là heap/runtime + container overhead; RSS riêng đang tắt | UI đang ghi MB chung có thể khiến người dùng hiểu là hard RSS limit đúng giá trị. Cần định nghĩa lại nếu cần chấm tài nguyên nghiêm |
| Vừa | Runner health chỉ báo tiến trình/slots, không test Docker/image/harness | Health xanh vẫn có thể execute 503. Có thể bổ sung readiness và smoke sau deploy |
| Vừa | Không có tổng thời gian chờ tối đa cho QUEUED/busy; lỗi invariant ngoài reschedule chỉ chờ lease | Có thể pending lâu vô hạn. Cần metric, cảnh báo job già, cách xử lý job lỗi lặp và SLA |
| Vừa | Scale nhiều BE process cộng dồn concurrency; slots runner là local process | Phải tính tổng worker so với năng lực runner; queue DB chống claim trùng nhưng không tự phân bổ tài nguyên toàn cụm |
| Vừa | Startup cleanup runner dùng label chung | Không an toàn để thêm replica cùng Docker daemon mà giữ nguyên cleanup |
| Vừa | Rejudge chỉ FAILED; content/result published bất biến | Tính năng sửa test hoặc regrade toàn lớp đòi mô hình version đề/lần chấm và thay trigger/schema; không chỉ thêm nút gọi worker |
| Vừa | HIDDEN actual/console không lưu kể cả mentor; stderr của submission không lưu | Muốn debug hidden chi tiết cần thiết kế lưu trữ/retention/quyền riêng, hiện không thể đọc lại từ DB |
| Thấp | Web lists bị giới hạn 50 bản và chưa có đầy đủ phân trang UI | Dữ liệu nhiều có thể bị bỏ khỏi màn hình dù backend có phân trang một số endpoint |
| Thấp | Markdown renderer web chỉ hỗ trợ paragraph, inline code và block code đơn giản | Không phải renderer Markdown đầy đủ cho bảng, danh sách, công thức, ảnh |
| Thấp | Metadata code_runs chỉ ghi COMPILE_ERROR khi compile.status=ERROR; TIMEOUT đi vào COMPLETED | Response vẫn có compileStatus=TIMEOUT, nhưng thống kê từ outcome có thể hiểu sai; nên chuẩn hoá nếu làm dashboard vận hành |
| Cần chốt | Legacy compose còn bật endpoint anonymous | Xác minh client/deployment thật trước khi tắt hoặc phát triển tiếp; không dùng nó cho bài chấm điểm |
| Cần cập nhật tài liệu | PHASE_7_CODE_PROGRESS.md ghi C6 chưa có ở một số mục | Source hiện có Flutter CODE và 13 test tập trung pass; dùng source làm mốc khi lập kế hoạch tiếp |

Hai chi tiết sâu cần lưu ý:

- parseRunnerReport kiểm tra shape, compile/test status và IDs, nhưng không đối chiếu executionId/language của response; các số timeMs/memoryKb mới được kiểm tra typeof number. Nếu chuẩn hoá adapter, nên validate finite/range và correlation ID.
- Marker return/nonce là protocol phân tách output. Nếu yêu cầu chống gian lận cao hơn, cần đánh giá riêng việc code chạy cùng driver, cùng user và cùng filesystem trong container; không xem nonce là ranh giới an ninh.

## 15. Mở rộng chức năng: phải tác động những đâu?

Đây là gợi ý thiết kế cho lần phát triển tiếp theo, chưa phải tính năng đã triển khai.

| Mục tiêu mới | Các phần cần sửa | Quyết định cần chốt |
| --- | --- | --- |
| Python/C++ hoặc ngôn ngữ khác | Runner registry/image; BE language keys/DB seed hoặc migration/driver/starter; DTO; web Zod/UI; Flutter enum/models | Phiên bản runtime, ABI input/output, time/memory multiplier, reference validation |
| Monaco/CodeMirror, completion | Web CodeEditor và các props editorMode; tests UI | Bundle size, mobile, tải lazy, giữ contract source/draft |
| Playground không gắn assignment | Feature/API riêng ở BE; quota/auth; UI riêng; tái dùng executor | Login hay anonymous, lưu lịch sử hay không, JS-only hay nhiều ngôn ngữ, quan hệ với legacy |
| Hỗ trợ nhiều file/package | Execution contract, sandbox payload, source DB/storage, editor workspace | Entry point, dependency policy, giới hạn file/dung lượng, build cache |
| Nhập stdin tương tác | Runner lifecycle/transport mới và UI terminal | Một lần stdin hay session stream, idle timeout, cancel, auth session |
| Object/tree/list/custom type | Signature domain, validation, serializer/driver JS/Java, UI input và client model | Schema kiểu, nullable, recursive structures, compatibility |
| Sửa test sau publish/regrade | Problem/test version snapshots, judge run history, DB triggers, queue, review UI | Submission dùng bộ test cũ hay mới, giữ điểm cũ, audit, ai được regrade |
| Hidden debug cho mentor | Kết quả lưu thêm hoặc object storage, API phân quyền, UI review | Dữ liệu được lưu, thời gian giữ, giới hạn log, ảnh hưởng student projection |
| Feedback realtime | Listener code_submission.updated ở web/app và invalidation đúng query | Poll fallback, reconnect, cập nhật view/history/summary khi terminal |
| Chấm tay/comment/AI feedback | Review schema/service/API/UI riêng; có thể tái dùng kết quả judge | Điểm tự động và điểm cuối, revision, điều kiện phát hành, tách dữ liệu ẩn |
| Tăng tải nhiều lớp | Worker deployment, runner routing, distributed capacity, observability | Tổng slots, queue wait SLA, tài nguyên Java, cleanup isolation |

Thứ tự triển khai đề xuất:

1. Chốt **loại sản phẩm**: mở rộng CODE assignment hiện tại hay thêm playground độc lập.
2. Thống nhất timeout, trạng thái pending/terminal và refresh của cả web/app; xử lý autosave web.
3. Nếu thay nghiệp vụ đề/test/điểm, thiết kế version dữ liệu và migration trước UI.
4. Nếu thêm ngôn ngữ/kiểu dữ liệu, làm contract/driver/runner và test xuyên tầng trước khi mở lựa chọn trên frontend.
5. Chạy lại full flow mentor create → generate → validate → publish → student draft/run/submit → worker → review/void; thêm ca lỗi hạ tầng và mất kết nối.

Những hành vi cần giữ khi mở rộng: source snapshot của submission, idempotency, một bài in-flight/student/assignment, bảo vệ hidden tests, không coi lỗi hạ tầng là bài sai, và quyền đọc lịch sử sau khi bài đóng.

## 16. Kiểm chứng đã thực hiện trong lần kiểm tra này

### 16.1. Kết quả chạy mới ngày 04/11/2026

| Nhóm | Lệnh/phạm vi | Kết quả |
| --- | --- | --- |
| BE domain | Vitest: code-signature, code-driver, code-grading, code-readiness, code-judge | **5 file, 41 test pass** |
| Web helpers/proxy | Vitest: code-authoring.test.ts, code-format.test.ts, code-proxy.test.ts | **3 file, 22 test pass** |
| Runner | npm test: build NestJS + node --test test/*.test.mjs | **12 pass, 2 skip**, build thành công |
| Flutter CODE | flutter test test/code_assignments_test.dart | **13 test pass** |

Runner 2 test skip là contract với harness thật vì không đặt HARNESS_BIN. Runner unit dùng fake child process, không chứng minh Docker/image/runtime đang chạy được.

Flutter test pass có một warning thao tác tap vào vị trí nằm ngoài viewport trong test editor 320×640. Cần kiểm tra tương tác thực tế nếu thay editor/mobile layout; pass hiện tại không phủ nhận warning này.

Lệnh pnpm exec ban đầu trên BE bị launcher của môi trường chọn sai Node/pnpm (Node 24/pnpm 11 so với yêu cầu Node 22/pnpm 12.6). Đã chạy cùng các test bằng **node node_modules/vitest/vitest.mjs** với Node 22.20.0 sẵn có; không thay manifest/lockfile hay cài dependency để né lỗi.

### 16.2. Các test có sẵn nhưng không chạy lại ở lượt này

- BE integration: phase7-code-authoring, code-submissions, code-review, code-zip-compatibility; cần database test riêng.
- BE HTTP: phase7-code-assignments.spec.ts có flow tạo/validate/publish/run/submit/worker/review; có fake runner mặc định và tùy chọn TEST_CODE_RUNNER_URL/TOKEN để dùng runner thật.
- Web Playwright: tests/e2e/code-assignments.e2e.ts kiểm autosave, custom input, submit và nhận điểm không reload; test dùng route mocks.
- Runner real harness contract, Go harness tests, Docker smoke và load scripts.
- Full lint/type-check/build của cả backend/frontend, test toàn hệ thống và xác minh trên VPS.

Không chạy migration hoặc integration test lên database đang dùng; không deploy, commit hoặc push trong lần kiểm tra này. Thay đổi bàn giao là tài liệu Markdown này.

### 16.3. Lệnh tham khảo cho lần phát triển tiếp

Chạy trong đúng thư mục project và với runtime của repo:

~~~sh
# Mindy-BE: domain
node node_modules/vitest/vitest.mjs run \
  src/modules/assignments/domain/code-signature.spec.ts \
  src/modules/assignments/domain/code-driver.spec.ts \
  src/modules/assignments/domain/code-grading.spec.ts \
  src/modules/assignments/domain/code-readiness.spec.ts \
  src/modules/assignments/domain/code-judge.spec.ts

# Mindy-FE2
npm run test -- src/features/code-assignments/lib/code-authoring.test.ts \
  src/features/code-assignments/lib/code-format.test.ts \
  src/lib/api/code-proxy.test.ts

# compiler-runner
npm test

# MindyFlutter
flutter test test/code_assignments_test.dart
~~~

## 17. Nguồn đối chiếu

Các link dưới đây dẫn vào source local, tương đối từ thư mục docs này.

- [BE assignment module](../src/modules/assignments/assignments.module.ts), [mentor controller](../src/modules/assignments/controllers/mentor-code-assignments.controller.ts), [student controller](../src/modules/assignments/controllers/student-code-assignments.controller.ts).
- [Assignment lifecycle](../src/modules/assignments/services/assignments.service.ts), [access policy](../src/modules/assignments/services/assignment-access.service.ts), [authoring](../src/modules/assignments/services/code-authoring.service.ts), [readiness query](../src/modules/assignments/services/code-readiness.query.ts).
- [Student service](../src/modules/assignments/services/code-submissions.service.ts), [worker](../src/modules/assignments/services/code-judge.worker.ts), [judge service](../src/modules/assignments/services/code-judge.service.ts), [executor adapter](../src/modules/assignments/services/code-executor.service.ts), [review](../src/modules/assignments/services/code-review.service.ts), [reporting](../src/modules/assignments/services/assignment-reporting.service.ts).
- [Signature/starter](../src/modules/assignments/domain/code-signature.ts), [driver/output parser](../src/modules/assignments/domain/code-driver.ts), [comparison/scoring](../src/modules/assignments/domain/code-grading.ts), [submission grading](../src/modules/assignments/domain/code-judge.ts), [publish blockers](../src/modules/assignments/domain/code-readiness.ts).
- [CODE migration](../src/database/migrations/1792886400000-code-assignments.ts), [input DTO](../src/modules/assignments/dtos/code-input.dto.ts), [HTTP setup/body limits](../src/configure-app.ts), [env schema](../src/config/environment.schema.ts), [socket notifier](../src/modules/assignments/services/code-submission-notifier.ts).
- [Runner internal API](../../compiler-runner/src/internal.controller.ts), [execution contract](../../compiler-runner/src/execution.ts), [Docker executor](../../compiler-runner/src/docker-executor.ts), [language registry](../../compiler-runner/src/languages.ts), [slot pools](../../compiler-runner/src/slots.ts), [Go harness](../../compiler-runner/harness/main.go).
- [Legacy controller](../../compiler-runner/src/app.controller.ts), [legacy execution](../../compiler-runner/src/runner.ts), [runner deployment](../../compiler-runner/compose.production.yaml), [BE compiler network](../compose.code-runner.yaml).
- [Web student](../../Mindy-FE2/src/features/code-assignments/components/student-code-page.tsx), [mentor wizard](../../Mindy-FE2/src/features/code-assignments/components/mentor-code-authoring-page.tsx), [tests step](../../Mindy-FE2/src/features/code-assignments/components/code-tests-step.tsx), [review](../../Mindy-FE2/src/features/code-assignments/components/mentor-code-review-page.tsx), [editor](../../Mindy-FE2/src/features/code-assignments/components/code-editor.tsx).
- [Web mutation/query](../../Mindy-FE2/src/features/code-assignments/api/code-queries.ts), [authoring commands](../../Mindy-FE2/src/features/code-assignments/api/code-authoring-actions.ts), [CODE proxy policy](../../Mindy-FE2/src/features/code-assignments/api/code-proxy-policy.ts), [shared proxy](../../Mindy-FE2/src/lib/api/proxy.server.ts), [shared assignment rules](../../Mindy-FE2/src/lib/api/assignment-rules.server.ts), [Zod contracts](../../Mindy-FE2/src/features/code-assignments/schemas/code-contracts.ts).
- [Flutter API](../../MindyFlutter/lib/features/code_assignments/code_api.dart), [providers/autosave/polling](../../MindyFlutter/lib/features/code_assignments/code_providers.dart), [editor screen](../../MindyFlutter/lib/features/code_assignments/code_editor_screen.dart), [models](../../MindyFlutter/lib/features/code_assignments/code_models.dart), [CODE tests](../../MindyFlutter/test/code_assignments_test.dart).
- Tài liệu hiện có để tham khảo bổ sung: [CODE API breakdown](api_flow/PHASE_7_CODE_flow-api-breakdown.md), [flow](api_flow/PHASE_7_CODE_FLOW.md), [runbook](PHASE_7_CODE_RUNBOOK.md), [local testing](PHASE_7_LOCAL_TESTING.md), [progress lịch sử](progress/phase%207/PHASE_7_CODE_PROGRESS.md). Những phần không khớp snapshot source đã được ghi chú trong báo cáo này.
