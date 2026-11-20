# Phase 7 — Bài tập lập trình (CODE) chấm tự động sau buổi học

[Flow](../../api_flow/PHASE_7_CODE_FLOW.md) · [API](../../api_flow/PHASE_7_CODE_flow-api-breakdown.md) · [Progress](../../progress/phase%207/PHASE_7_CODE_PROGRESS.md)

**v2 · 02/11/2026 · IN PROGRESS — C1–C4 xong ở local (chưa deploy, chưa merge).** Tiến độ chi tiết: **§15**.
Mở rộng Phase 5 (Assignments) thêm loại `CODE`. Phase 5 ghi "Không compiler CODE v1"; owner đã mở phạm vi này ngày 02/11/2026.

Liên quan: [Phase 5 plan](../phase%205/PHASE_5_ASSIGNMENTS.md) · runner `../../../../compiler-runner/` · web `../../../../Mindy-FE2/` ·
app `../../../../MindyFlutter/docs/REMAINING_WORK_PLAN.md` (mục Bài tập code).

---

## 0. Tóm tắt

Sau mỗi buổi học, mentor ra **đề kiểu LeetCode**: học viên viết **một hàm** bằng **JavaScript hoặc Java**, bấm **Chạy thử**
với test ví dụ, rồi **Nộp bài**. Server chấm bằng test ẩn, tính điểm, và lấy **điểm cao nhất** làm điểm của bài.

Engine: **nâng cấp `compiler-runner`** (Docker container mỗi lần chấm), chạy **chung VPS** trong mạng nội bộ, có token.
**Không dùng Judge0.** Mindy-BE giữ toàn bộ nghiệp vụ (đề, test ẩn, chấm, quyền, deadline, lượt) và gọi engine
qua interface `CodeExecutor`, nên sau này đổi engine không phải sửa nghiệp vụ.

Lý do bỏ Judge0 (giữ để tra cứu): release cuối v1.13.1 (04/2024); bắt buộc cgroup v1 nên phải sửa GRUB và reboot
cả VPS, trong khi systemd 258 đã bỏ cgroup v1; từng có CVE thoát sandbox CVSS 10; chạy privileged, kèm Postgres + Redis riêng.

---

## 1. Quyết định đã chốt (owner, 02/11/2026)

| # | Chủ đề | Quyết định |
| --- | --- | --- |
| D1 | Engine | Nâng cấp compiler-runner, không Judge0 |
| D2 | Nơi chạy | Chung VPS hiện tại; runner chỉ ở Docker network internal, có token; tách VM sau |
| D3 | Ngôn ngữ v1 | **JavaScript (Node 22)** và **Java 21** |
| D4 | Kiểu đề | **Viết hàm như LeetCode**: mentor khai báo chữ ký hàm, hệ thống tự sinh code khởi đầu + driver cho JS và Java |
| D5 | Tính điểm | **Mentor chọn theo từng đề**: theo test đạt (có trọng số) hoặc đúng hết mới có điểm |
| D6 | Điểm của bài | **Lần cao nhất** (hoà thì lấy lần sớm nhất) |
| D7 | Lượt nộp | Mentor đặt **1–50** (mặc định 10); **lỗi biên dịch không tính lượt** |
| D8 | Nộp trễ | **Không nhận**; mentor gia hạn `due_at` có lý do + audit |
| D9 | Mở đề | **Ngay khi mentor publish** |
| D10 | Test ẩn | Hiện **trạng thái + thời gian từng test**, không input/output/stderr |
| D11 | Lời giải mẫu | **Bắt buộc ≥ 1** lời giải mẫu; output test do lời giải sinh ra; mọi lời giải đã lưu phải pass mọi test ở revision hiện tại mới được publish (làm rõ 02/11/2026) |
| D12 | Mobile | **Có editor đơn giản trên app Flutter**: chạy thử + nộp ngay trên app |
| D13 | Phạm vi | Làm cả 4 phần: compiler-runner v2, Mindy-BE, web Mindy-FE2, app MindyFlutter |

Các mặc định kỹ thuật (đổi được nếu owner yêu cầu): rate limit Chạy thử 10/phút + 300/ngày/học viên; tối đa 30 test/đề;
source ≤ 64 KiB; CPU limit 100–10000 ms; memory 64–512 MB; 1 bài đang chấm/học viên/đề.

---

## 2. Hiện trạng

**compiler-runner:** NestJS, `POST /api/code/run {code, stdin}`, chỉ chạy JS (`node -e`), container `node:22-alpine` với
`--network none --read-only --cap-drop ALL --no-new-privileges --memory 128m --pids-limit 64 --tmpfs /tmp:noexec --user node`.
Timeout wall 4 s, output 64 KiB/stream, 2 lượt đồng thời (quá thì 429). Kiểm `APP_ORIGIN` nhưng **đang mở anonymous**;
FE cũ gọi qua `COMPILER_API_URL`. Mount `docker.sock`. Có unit test dùng fake spawn.

**Mindy-BE `assignments`:** `assignments` (session owner, `type QUIZ/ZIP`, `purpose`, `due_at`, `max_attempts 1..10`,
`status`, `revision`), bảng câu hỏi/đáp án tách riêng, `assignment_submissions` (unique 1 dòng/học viên/đề), job table +
worker `setInterval`, audits append-only, receipts idempotency. `AssignmentAccessService` kiểm mentor chính/dạy thay
và enrollment ACTIVE. Không có Redis/throttler; có socket.io (Phase 6). JSON body toàn cục 64 KB.

**Mindy-FE2:** Next 16, React 19, TanStack Query, zod, Tailwind 4, gọi BE qua proxy server-side (`src/lib/api/*-proxy`).
**Chưa có UI assignment nào** (kể cả quiz).

**MindyFlutter:** đang làm role Mentor (MF1 xong). Chưa có phần bài tập.

---

## 3. Kiến trúc

```mermaid
flowchart LR
  subgraph Client
    W[Web Mindy-FE2<br/>Monaco editor]
    F[Flutter app<br/>re_editor]
  end
  subgraph VPS
    BE[Mindy-BE<br/>assignments: code authoring / run / submit]
    DB[(PostgreSQL<br/>code_* + job queue)]
    WK[CodeJudgeWorker<br/>trong Mindy-BE]
    R[compiler-runner v2<br/>internal network + token]
    D[[1 container / lần chạy<br/>network none, read-only, limits]]
  end
  W -- cookie, qua proxy Next --> BE
  F -- cookie --> BE
  BE <--> DB
  WK -- SKIP LOCKED + lease --> DB
  BE -- Chạy thử: đồng bộ --> R
  WK -- Nộp bài: bất đồng bộ --> R
  R --> D
  BE -- socket.io code_submission.updated --> W & F
```

1. Client chỉ gọi Mindy-BE. Đường FE → runner cũ sẽ tắt ở C7.
2. **Chạy thử**: BE gọi runner đồng bộ (timeout 20 s), chỉ test SAMPLE hoặc input tự nhập, không lưu bài, có rate limit.
3. **Nộp bài**: BE ghi `code_submissions` (QUEUED) + `code_judge_jobs` trong 1 transaction và trả `202`. Worker gọi runner
   **ngoài transaction**, rồi ghi kết quả + điểm trong 1 transaction và emit socket.
4. Runner stateless: không DB, không biết user, **không nhận expected output**.
5. Mọi mốc thời gian theo `now()` của DB.

---

## 4. Thiết kế đề "viết hàm" (D4)

### 4.1. Chữ ký hàm

Mentor khai báo trong `code_problems.signature`:

```json
{ "functionName": "twoSum",
  "params": [ { "name": "nums", "type": "int[]" }, { "name": "target", "type": "int" } ],
  "returnType": "int[]" }
```

Kiểu hỗ trợ v1: `int`, `long`, `double`, `boolean`, `string`, `int[]`, `long[]`, `double[]`, `boolean[]`, `string[]`,
`int[][]`, `string[][]`. Không hỗ trợ `void`, ListNode/TreeNode, class tuỳ ý (để v2).

- Tên hàm/tham số: identifier `^[a-zA-Z_][a-zA-Z0-9_]{0,39}$`, không trùng từ khoá JS/Java, 1–6 tham số, không trùng tên.
- `long` giới hạn trong ±(2^53 − 1) để JS biểu diễn chính xác; vượt thì báo lỗi khi lưu test.

### 4.2. Code khởi đầu tự sinh

JavaScript:

```js
/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number[]}
 */
function twoSum(nums, target) {

}
```

Java:

```java
class Solution {
    public int[] twoSum(int[] nums, int target) {

    }
}
```

Mentor sửa được code khởi đầu (vd thêm gợi ý), nhưng không đổi được tên/chữ ký. Khi lưu, BE kiểm code khởi đầu vẫn
chứa khai báo hàm (kiểm chuỗi đơn giản; chạy lời giải mẫu là chốt chặn thật).

### 4.3. Test và driver

- Test lưu dạng JSON: `input` = mảng đối số `[[2,7,11,15], 9]`, `expected` = giá trị trả về `[0,1]`. BE kiểm kiểu theo
  chữ ký khi lưu. UI hiển thị `nums = [2,7,11,15], target = 9`.
- Khi chạy, **BE sinh source hoàn chỉnh** = code học viên + driver theo ngôn ngữ (hàm thuần trong `domain/`, có unit test):
  - **JS** `main.js`: code học viên, rồi driver đọc stdin (dòng 1 là JSON mảng đối số), gọi hàm, in kết quả.
  - **Java** `Main.java`: code học viên (`class Solution` không public, được thêm class phụ và `import` ở đầu), rồi
    `public class Main` do driver sinh. Driver chỉ dùng tên đầy đủ (`java.io.…`), có parser/serializer JSON tối giản cho
    các kiểu ở §4.1, gọi `new Solution().twoSum(...)`.
- Driver in kết quả trên dòng riêng có **mã nonce ngẫu nhiên** do BE sinh mỗi lần chạy: `\u001eMINDY:<nonce>:<json>`.
  Mọi thứ học viên tự in (`console.log`, `System.out`) là **console output**, chỉ hiện ở test SAMPLE/Chạy thử.
- Không có dòng kết quả (crash, exit ≠ 0) → `RUNTIME_ERROR`. Kết quả không parse được hoặc sai kiểu → `WRONG_ANSWER`.

### 4.4. So sánh kết quả (`compare_mode`)

| Mode | Quy tắc |
| --- | --- |
| `EXACT` (mặc định) | So sâu (deep equal) giá trị JSON; số nguyên so tuyệt đối |
| `FLOAT` | Như EXACT nhưng số thực sai lệch ≤ `float_epsilon` (tuyệt đối hoặc tương đối) |
| `UNORDERED` | Mảng cấp ngoài cùng so như tập có lặp (không quan tâm thứ tự), phần tử bên trong so EXACT |

---

## 5. Luồng nghiệp vụ

### 5.1. Mentor ra đề (web; app không soạn đề)

1. Tạo assignment `type=CODE`, `purpose=HOMEWORK`, gắn buổi, `due_at` (bắt buộc), `max_score`, `max_attempts` (1–50, mặc định 10).
2. Soạn đề: mô tả markdown, ràng buộc, độ khó; khai báo chữ ký hàm.
3. Chọn ngôn ngữ (JS/Java, ít nhất 1). Hệ thống sinh code khởi đầu, mentor có thể chỉnh.
4. Thêm test (tối đa 30): SAMPLE (học viên thấy input/expected/giải thích) và HIDDEN; mỗi test có trọng số 1–100.
5. Chọn cách tính điểm (theo test / đúng hết), kiểu so sánh, CPU limit, memory limit.
6. Viết lời giải mẫu (ít nhất 1 ngôn ngữ) → **Kiểm tra đề**: chạy qua mọi test, phải 100% pass.
   Sửa bất kỳ thứ gì ở DRAFT đều tăng `revision` và yêu cầu kiểm lại.
7. **Publish**: đóng băng đề/test/giới hạn/cách tính điểm. Sau publish chỉ được gia hạn `due_at` và tăng `max_attempts`
   (có lý do + audit). Đề sai thì archive và tạo đề mới.

### 5.2. Học viên (web và app)

1. Danh sách bài của lớp/buổi → bài CODE: đề, ví dụ, ngôn ngữ, giới hạn, lượt còn lại, hạn nộp, điểm hiện tại.
2. Chọn ngôn ngữ: editor nạp nháp server hoặc code khởi đầu; autosave nháp (debounce 2 s, `expectedVersion`).
3. **Chạy thử**: chạy toàn bộ test SAMPLE, hoặc 1 input tự nhập (JSON đối số, UI có form theo từng tham số).
   Hiện kết quả, expected (SAMPLE), console output, lỗi.
4. **Nộp bài** (`Idempotency-Key`): BE kiểm quyền, `now() < due_at`, lượt, ngôn ngữ, kích thước, không có bài đang chấm.
5. "Đang chấm…" → nhận kết quả qua socket (fallback polling 1,5 s, tối đa 60 s).
6. Kết quả: verdict, số test đạt, điểm lần này, điểm của bài (cao nhất). SAMPLE chi tiết; HIDDEN chỉ trạng thái + thời gian.
   Lỗi biên dịch: log đã cắt ngắn + "Không tính lượt".

### 5.3. Mentor theo dõi (web; app xem tổng hợp)

- Bảng học viên × bài: chưa nộp / đang chấm / điểm cao nhất / số lượt / verdict gần nhất.
- Xem từng lần nộp: source, mọi test (cả HIDDEN), thời gian/memory, console.
- **Chấm lại** chỉ cho bài `FAILED` (lỗi hệ thống). **Huỷ bài nộp** (gian lận) bắt buộc lý do + audit; bài huỷ bị loại khỏi điểm.

---

## 6. Quy tắc chấm điểm

| Bước | Quy tắc |
| --- | --- |
| Compile (Java) / cú pháp (JS) | Lỗi → `COMPILE_ERROR`, điểm 0, `counts_as_attempt=false` (D7). JS: lỗi cú pháp phát hiện bằng `node --check` |
| Từng test | Runner trả `OK / TIME_LIMIT / MEMORY_LIMIT / RUNTIME_ERROR / OUTPUT_LIMIT`. Nếu `OK`: đọc dòng kết quả theo nonce, so sánh §4.4 → `PASSED` hoặc `WRONG_ANSWER` |
| `PER_TEST` | `score = round(Σ weight PASSED / Σ weight × max_score, 2)`, tính bằng cent, làm tròn 1 lần |
| `ALL_OR_NOTHING` | Mọi test PASSED → `max_score`, còn lại → 0 |
| Verdict | Đạt hết → `ACCEPTED`; đạt một phần → `PARTIAL`; không đạt test nào → verdict của test lỗi đầu tiên |
| Thời gian | CPU limit hiệu lực = `cpu_time_limit_ms × time_multiplier` (JS 1, Java 2) + phụ cấp khởi động runner tự cộng (JVM) |
| Điểm của bài | Max score trên các lần `GRADED` (bỏ `VOIDED`); hoà thì lấy lần sớm nhất (D6) |
| Lượt | Đếm `counts_as_attempt=true` + bài đang chấm; đạt `max_attempts` → 409 |
| Deadline | Nhận nộp khi `now() < due_at`; bài vào hàng đợi trước hạn vẫn được chấm sau hạn |
| Lỗi hệ thống | Không bao giờ thành 0 điểm: retry rồi `FAILED` để mentor chấm lại |

---

## 7. Database

### 7.1. Sửa `assignments` (migration additive mới)

Các CHECK hiện có là inline không tên. Migration **tra tên thật trong `pg_constraint`** (thường là `assignments_type_check`,
`assignments_max_attempts_check`, `assignments_check`), drop, rồi tạo lại có tên:

```sql
ALTER TABLE assignments ADD CONSTRAINT ck_assignments_type CHECK (type IN ('QUIZ','ZIP','CODE'));
ALTER TABLE assignments ADD CONSTRAINT ck_assignments_max_attempts CHECK (
  (type <> 'CODE' AND max_attempts BETWEEN 1 AND 10) OR (type = 'CODE' AND max_attempts BETWEEN 1 AND 50));
ALTER TABLE assignments ADD CONSTRAINT ck_assignments_type_rules CHECK (
  (type = 'QUIZ' AND max_attempts = 1) OR
  (type = 'ZIP'  AND time_limit_minutes IS NULL AND due_at IS NOT NULL) OR
  (type = 'CODE' AND time_limit_minutes IS NULL AND due_at IS NOT NULL));
```

Dùng lại: `assignment_audits` (action `CODE_VALIDATED`, `CODE_PUBLISHED`, `CODE_DEADLINE_EXTENDED`, `CODE_REJUDGED`,
`CODE_SUBMISSION_VOIDED`) và `assignment_receipts` (nộp bài). Không dùng `assignment_submissions` cho CODE.

### 7.2. Bảng mới

```sql
CREATE TABLE code_languages (                       -- seed: javascript, java21
  key varchar(20) PRIMARY KEY CHECK (key ~ '^[a-z0-9_]+$'),
  display_name varchar(50) NOT NULL,                -- 'JavaScript', 'Java'
  runtime_version varchar(50) NOT NULL,             -- 'Node.js 22', 'Java 21'
  editor_mode varchar(20) NOT NULL,                 -- 'javascript', 'java'
  time_multiplier numeric(4,2) NOT NULL DEFAULT 1 CHECK (time_multiplier BETWEEN 1 AND 5),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE code_problems (                        -- 1-1 với assignment CODE
  assignment_id uuid PRIMARY KEY REFERENCES assignments(id) ON DELETE RESTRICT,
  statement_md text NOT NULL DEFAULT '' CHECK (length(statement_md) <= 50000),
  constraints_md text NOT NULL DEFAULT '' CHECK (length(constraints_md) <= 5000),
  difficulty varchar(6) CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
  signature jsonb NOT NULL,                         -- §4.1, validate ở domain
  compare_mode varchar(9) NOT NULL DEFAULT 'EXACT' CHECK (compare_mode IN ('EXACT','FLOAT','UNORDERED')),
  float_epsilon numeric(12,10),
  scoring_mode varchar(14) NOT NULL DEFAULT 'PER_TEST' CHECK (scoring_mode IN ('PER_TEST','ALL_OR_NOTHING')),
  cpu_time_limit_ms integer NOT NULL DEFAULT 2000 CHECK (cpu_time_limit_ms BETWEEN 100 AND 10000),
  memory_limit_mb integer NOT NULL DEFAULT 256 CHECK (memory_limit_mb BETWEEN 64 AND 512),
  validated_revision integer CHECK (validated_revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_code_problem_epsilon CHECK (
    (compare_mode = 'FLOAT' AND float_epsilon > 0) OR (compare_mode <> 'FLOAT' AND float_epsilon IS NULL))
);

CREATE TABLE code_problem_languages (
  assignment_id uuid NOT NULL REFERENCES code_problems(assignment_id) ON DELETE RESTRICT,
  language_key varchar(20) NOT NULL REFERENCES code_languages(key) ON DELETE RESTRICT,
  starter_code text NOT NULL CHECK (octet_length(starter_code) <= 65536),
  PRIMARY KEY (assignment_id, language_key)
);

CREATE TABLE code_test_cases (                      -- học viên chỉ đọc SAMPLE
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES code_problems(assignment_id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 30),
  visibility varchar(6) NOT NULL CHECK (visibility IN ('SAMPLE','HIDDEN')),
  input_args jsonb NOT NULL CHECK (jsonb_typeof(input_args) = 'array'),
  expected jsonb NOT NULL,
  weight integer NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 100),
  explanation_md text CHECK (length(explanation_md) <= 5000),
  CONSTRAINT uq_code_test_position UNIQUE (assignment_id, position),
  CONSTRAINT ck_code_test_explanation CHECK (visibility = 'SAMPLE' OR explanation_md IS NULL),
  CONSTRAINT ck_code_test_size CHECK (octet_length(input_args::text) <= 65536 AND octet_length(expected::text) <= 65536)
);

CREATE TABLE code_reference_solutions (             -- chỉ mentor đọc
  assignment_id uuid NOT NULL REFERENCES code_problems(assignment_id) ON DELETE RESTRICT,
  language_key varchar(20) NOT NULL REFERENCES code_languages(key) ON DELETE RESTRICT,
  source_code text NOT NULL CHECK (octet_length(source_code) BETWEEN 1 AND 65536),
  last_validation jsonb,
  validated_at timestamptz,
  PRIMARY KEY (assignment_id, language_key)
);

CREATE TABLE code_drafts (
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  language_key varchar(20) NOT NULL REFERENCES code_languages(key) ON DELETE RESTRICT,
  source_code text NOT NULL CHECK (octet_length(source_code) <= 65536),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, student_id, language_key)
);

CREATE TABLE code_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  enrollment_id uuid NOT NULL REFERENCES enrollments(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),       -- thứ tự mọi lần nộp
  assignment_revision integer NOT NULL CHECK (assignment_revision > 0),
  language_key varchar(20) NOT NULL REFERENCES code_languages(key) ON DELETE RESTRICT,
  runtime_version varchar(50),
  source_code text NOT NULL CHECK (octet_length(source_code) BETWEEN 1 AND 65536),
  source_sha256 char(64) NOT NULL,
  status varchar(7) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','GRADED','FAILED','VOIDED')),
  verdict varchar(14) CHECK (verdict IN ('ACCEPTED','PARTIAL','WRONG_ANSWER','TIME_LIMIT','MEMORY_LIMIT',
    'RUNTIME_ERROR','OUTPUT_LIMIT','COMPILE_ERROR')),
  counts_as_attempt boolean NOT NULL DEFAULT true,
  passed_count integer CHECK (passed_count >= 0),
  total_count integer CHECK (total_count > 0),
  score numeric(8,2),
  max_score numeric(8,2) NOT NULL CHECK (max_score > 0),
  compile_output varchar(8192),
  max_time_ms integer, max_memory_kb integer,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  judged_at timestamptz,
  voided_reason varchar(2000),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_code_submission_attempt UNIQUE (assignment_id, student_id, attempt_number),
  CONSTRAINT ck_code_submission_graded CHECK (
    status <> 'GRADED' OR (verdict IS NOT NULL AND score IS NOT NULL AND judged_at IS NOT NULL)),
  CONSTRAINT ck_code_submission_pending CHECK (
    status NOT IN ('QUEUED','RUNNING') OR (verdict IS NULL AND score IS NULL)),
  CONSTRAINT ck_code_submission_score CHECK (score IS NULL OR score BETWEEN 0 AND max_score),
  CONSTRAINT ck_code_submission_void CHECK ((status = 'VOIDED') = (voided_reason IS NOT NULL)),
  CONSTRAINT ck_code_submission_ce CHECK (verdict IS DISTINCT FROM 'COMPILE_ERROR' OR counts_as_attempt = false)
);
CREATE INDEX idx_code_submissions_student ON code_submissions(assignment_id, student_id, submitted_at DESC);
CREATE UNIQUE INDEX uq_code_submission_inflight ON code_submissions(assignment_id, student_id)
  WHERE status IN ('QUEUED','RUNNING');

CREATE TABLE code_submission_tests (               -- insert-only
  submission_id uuid NOT NULL REFERENCES code_submissions(id) ON DELETE RESTRICT,
  test_case_id uuid NOT NULL REFERENCES code_test_cases(id) ON DELETE RESTRICT,
  position integer NOT NULL,
  visibility varchar(6) NOT NULL CHECK (visibility IN ('SAMPLE','HIDDEN')),
  weight integer NOT NULL CHECK (weight > 0),
  status varchar(14) NOT NULL CHECK (status IN ('PASSED','WRONG_ANSWER','TIME_LIMIT','MEMORY_LIMIT',
    'RUNTIME_ERROR','OUTPUT_LIMIT')),
  time_ms integer, memory_kb integer,
  actual jsonb,                                     -- chỉ SAMPLE
  console_excerpt varchar(4096),                    -- chỉ SAMPLE
  PRIMARY KEY (submission_id, test_case_id),
  CONSTRAINT ck_code_test_private CHECK (visibility = 'SAMPLE' OR (actual IS NULL AND console_excerpt IS NULL))
);

CREATE TABLE code_judge_jobs (
  submission_id uuid PRIMARY KEY REFERENCES code_submissions(id) ON DELETE RESTRICT,
  run_after timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  locked_until timestamptz,
  last_error varchar(500),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_code_judge_jobs_due ON code_judge_jobs(run_after, submission_id) WHERE completed_at IS NULL;

CREATE TABLE code_runs (                            -- rate limit; không lưu source; dọn sau 30 ngày
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE RESTRICT,
  language_key varchar(20) NOT NULL,
  kind varchar(7) NOT NULL CHECK (kind IN ('SAMPLES','CUSTOM')),
  outcome varchar(20) NOT NULL,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_code_runs_student_time ON code_runs(student_id, created_at);
```

Trigger `protect_finalized_code_submission`: chặn UPDATE/DELETE khi `status IN ('GRADED','VOIDED')`, trừ `GRADED → VOIDED`
có `voided_reason`. Trigger chặn UPDATE/DELETE trên `code_submission_tests`. Trigger chặn sửa `code_test_cases`,
`code_problem_languages`, `code_problems` (trừ `updated_at`) khi assignment đã PUBLISHED.

Điểm của bài: view `code_assignment_scores` (max score GRADED, hoà lấy sớm nhất), không lưu bảng riêng.

### 7.3. Kiểm ở service

- **Publish CODE:** chữ ký hợp lệ; ≥ 1 ngôn ngữ; ≥ 1 SAMPLE và ≥ 1 HIDDEN; mô tả không rỗng; mọi test đúng kiểu;
  `validated_revision = assignments.revision`.
- **Nộp:** assignment PUBLISHED; enrollment ACTIVE (khoá `pessimistic_read`); ngôn ngữ thuộc đề; `now() < due_at`;
  lượt còn; không có bài đang chấm (unique index cũng chặn race); source ≤ 64 KiB.
- **Worker:** kiểm lại dưới khoá; archive đề / enrollment hết ACTIVE / lớp huỷ → `VOIDED` (lý do hệ thống), không chấm.

### 7.4. Lỗ hổng phát hiện trong DB hiện tại

| # | Vấn đề | Đề xuất |
| --- | --- | --- |
| G1 | `assignment_submissions` unique `(assignment_id, student_id)` chặn ZIP nộp nhiều lần | Xử lý khi làm ZIP A3/A4 |
| G2 | Chưa có bảng điểm (`grades`/`grade_revisions`) để mentor sửa điểm | v1 CODE chỉ VOID + audit; v2 bảng điểm chung ZIP + CODE |
| G3 | CHECK inline không tên trên `assignments` | Phase 7 đặt lại tên `ck_*` |
| G4 | Thông báo chỉ có `CHAT_MESSAGE` | Backlog: `ASSIGNMENT_PUBLISHED`, `CODE_GRADED` |
| G5 | A5 (báo cáo assignment) còn TODO | Summary CODE làm cùng shape để gộp sau |
| G6 | JSON body toàn cục 64 KB | Route code nâng riêng lên 256 KB; test lưu từng cái |

---

## 8. API Mindy-BE (`/api/v1`)

Mọi route ghi: `AccessTokenGuard + RolesGuard`, Origin guard như các route assignment. Nộp bài có `Idempotency-Key`.

**Mentor**

| Method | Route | Mô tả |
| --- | --- | --- |
| POST | `/mentor/class-sessions/:sessionId/assignments` | (có sẵn) thêm `type=CODE` |
| PUT | `/mentor/assignments/:id/code-problem` | Mô tả, chữ ký, so sánh, tính điểm, giới hạn (DRAFT) |
| PUT | `/mentor/assignments/:id/code-languages` | Danh sách ngôn ngữ + code khởi đầu (DRAFT) |
| GET | `/mentor/code-languages` | Ngôn ngữ đang bật (key, tên, version, editor mode) |
| POST | `/mentor/code-signatures/preview` | Sinh code khởi đầu JS/Java từ chữ ký (không lưu) |
| GET | `/mentor/assignments/:id/code` | Toàn bộ dữ liệu soạn đề: đề, ngôn ngữ, test (cả HIDDEN), lời giải mẫu, `publishBlockers` |
| GET | `/mentor/assignments/:id/code-tests` | Mọi test |
| PUT/DELETE | `/mentor/assignments/:id/code-tests/:position` | Thêm-sửa / xoá 1 test (DRAFT) |
| PUT | `/mentor/assignments/:id/code-reference/:languageKey` | Lời giải mẫu |
| POST | `/mentor/assignments/:id/code-validate` | Chạy lời giải mẫu qua mọi test → `validated_revision` |
| POST | `/mentor/assignments/:id/publish` | (có sẵn) CODE cần đã validate |
| POST | `/mentor/assignments/:id/code-extension` | Sau publish: gia hạn `dueAt` (chỉ lùi về sau) và/hoặc tăng `maxAttempts`, bắt buộc `reason` |
| GET | `/mentor/assignments/:id/code-summary` | Học viên × điểm/lượt/verdict (phân trang) |
| GET | `/mentor/assignments/:id/code-submissions` | Lịch sử nộp (lọc `studentId`) |
| GET | `/mentor/code-submissions/:id` | Source + mọi test |
| POST | `/mentor/code-submissions/:id/rejudge` | Chỉ `FAILED` |
| POST | `/mentor/code-submissions/:id/void` | Bắt buộc `reason` |

**Học viên**

| Method | Route | Mô tả |
| --- | --- | --- |
| GET | `/me/classes/:classId/assignments` | (có sẵn) có item CODE |
| GET | `/me/assignments/:id/code` | Đề, chữ ký, SAMPLE, ngôn ngữ + code khởi đầu, giới hạn, `attemptsUsed`, `bestScore`, `dueAt`, `canSubmit` |
| GET/PUT | `/me/assignments/:id/code-drafts/:languageKey` | Nháp (`expectedVersion`) |
| POST | `/me/assignments/:id/code-runs` | `{languageKey, sourceCode, customArgs?}` → kết quả đồng bộ |
| POST | `/me/assignments/:id/code-submissions` | `{languageKey, sourceCode}` + `Idempotency-Key` → `202 {submissionId}` |
| GET | `/me/assignments/:id/code-submissions` | Lịch sử nộp |
| GET | `/me/code-submissions/:id` | Trạng thái, verdict, test (HIDDEN không input/output) |
| socket | `code_submission.updated` | `{submissionId, assignmentId, status}` vào room của user |

Mã lỗi mới: `CODE_SIGNATURE_INVALID` 422, `CODE_TEST_TYPE_MISMATCH` 422, `CODE_LANGUAGE_NOT_ALLOWED` 422,
`CODE_SOURCE_TOO_LARGE` 422, `CODE_REFERENCE_NOT_VALIDATED` 409, `CODE_ATTEMPTS_EXHAUSTED` 409,
`CODE_SUBMISSION_IN_FLIGHT` 409, `ASSIGNMENT_DEADLINE_PASSED` 409, `CODE_RUN_RATE_LIMITED` 429,
`CODE_RUNNER_BUSY` 429 (`retryAfterSeconds`), `CODE_RUNNER_UNAVAILABLE` 503.

Env mới: `CODE_RUNNER_URL`, `CODE_RUNNER_TOKEN`, `CODE_JUDGE_JOB_ENABLED`, `CODE_RUN_PER_MINUTE=10`, `CODE_RUN_PER_DAY=300`.

---

## 9. compiler-runner v2

### 9.1. Contract nội bộ

```http
POST /internal/v1/executions
Authorization: Bearer <RUNNER_TOKEN>
X-Request-Id: <uuid>

{ "executionId": "uuid", "language": "javascript" | "java21",
  "source": "<code học viên + driver>",
  "limits": { "compileTimeoutMs": 10000, "cpuTimeMs": 2000, "wallTimeMs": 6000, "memoryMb": 256, "outputBytes": 65536 },
  "tests": [ { "id": "t1", "stdin": "[[2,7,11,15],9]\n" } ] }

200 { "runtimeVersion": "Java 21.0.5",
      "compile": { "status": "OK" | "ERROR" | "TIMEOUT", "output": "<= 8 KiB" },
      "tests": [ { "id": "t1", "status": "OK|TIME_LIMIT|MEMORY_LIMIT|RUNTIME_ERROR|OUTPUT_LIMIT",
                   "stdout": "...", "stderr": "<= 4 KiB", "exitCode": 0, "timeMs": 41, "memoryKb": 38000 } ] }
401 sai token · 422 sai body · 429 { "status": "busy" } · 503 { "status": "infrastructure_error" }
```

- Runner giữ **registry ngôn ngữ**: image (pin digest), tên file, lệnh check/compile/run, phụ cấp thời gian khởi động.
  BE chỉ gửi key; không bao giờ gửi lệnh shell.
- `/api/code/run` cũ giữ tới C7 (FE cũ), sau đó tắt. Bỏ anonymous ngay khi có token.

### 9.2. Thực thi

1. **1 container / execution** (compile 1 lần, chạy mọi test bên trong):
   `docker run --pull=never --rm -i --network none --read-only --cap-drop ALL --security-opt no-new-privileges
   --memory <limit + 128m> --memory-swap <same> --pids-limit 128 --cpus 1 --user 65534:65534
   --tmpfs /work:rw,exec,nosuid,size=64m -v harness:/judge:ro <image> /judge/harness`.
   Source + test truyền qua stdin dạng JSON cho harness.
2. **Harness** (Go, build tĩnh, ~2 MB, mount read-only):
   - Ghi source vào `/work`.
   - JS: `node --check main.js`. Java: `javac -J-Xmx256m Main.java` (timeout compile).
   - Mỗi test: fork `node main.js` hoặc `java -Xmx<mem>m -Xss64m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Xshare:auto Main`
     với `setrlimit` (CPU, FSIZE, NPROC), stdin từ test, cắt stdout/stderr theo `outputBytes`, `wait4` lấy CPU time + `maxrss`,
     kill khi quá wall time.
   - In 1 JSON kết quả ra stdout.
3. Memory cứng: cgroup của container (Docker, chạy được với cgroup v2). OOM-kill hoặc `maxrss` ≥ limit → `MEMORY_LIMIT`.
4. Semaphore: `RUNNER_SLOTS_RUN=1`, `RUNNER_SLOTS_SUBMIT=2` (env). Hết slot → 429.
5. Images: `node:22-alpine` (có sẵn) và `eclipse-temurin:21-jdk-alpine`, pull trước, pin digest.
6. Ước tính Java: JVM khởi động ~0,2–0,4 s/test, 30 test ≈ 8–12 s/bài. Tối ưu sau nếu cần (AppCDS, hoặc chạy cả bộ
   test trong 1 JVM).

### 9.3. Worker chấm (`CodeJudgeWorker`, cờ `CODE_JUDGE_JOB_ENABLED`)

1. Tx1: lấy 1 job (`FOR UPDATE SKIP LOCKED`, `run_after <= now()`, lease hết hạn) → `locked_until = now()+2m`,
   submission → `RUNNING`.
2. Ngoài tx: đọc test, sinh source + driver + nonce, gọi runner.
3. Tx2: khoá submission, còn `RUNNING` và còn hợp lệ → so sánh → ghi `code_submission_tests`, điểm, `GRADED`, job `completed_at`,
   audit. Sau commit thì emit socket.
4. Lỗi hạ tầng: `attempts+1`, lùi 5 s → 15 s → 45 s → 2 m → 5 m; quá 5 lần → `FAILED`.
5. Restart giữa chừng: lease hết hạn → chấm lại (runner stateless nên an toàn).

---

## 10. Bảo mật

| Rủi ro | Biện pháp |
| --- | --- |
| Lộ test ẩn | Query học viên không select HIDDEN/expected; DB cấm lưu actual/console cho HIDDEN; lỗi validate không trích test; không log source/test |
| Dò test ẩn qua verdict | Giới hạn lượt (1–50); chỉ hiện trạng thái; mentor xem lịch sử nộp |
| Thoát sandbox | Flags §9.2, uid 65534, image pin digest, seccomp mặc định; thử `--runtime=runsc` (gVisor) nếu VPS hỗ trợ |
| `docker.sock` trong runner | Runner không có host port, chỉ network internal, token; giai đoạn sau tách VM |
| Fork bomb / đầy đĩa / spam output / vòng lặp vô hạn | pids-limit, tmpfs có size, RLIMIT_FSIZE, cắt output, CPU + wall timeout, kill container khi hết hạn tổng |
| Gọi mạng | `--network none` |
| Lạm dụng | Rate limit Chạy thử, 1 bài đang chấm, source ≤ 64 KiB, body route ≤ 256 KB |
| Chép bài | `source_sha256` phát hiện trùng y hệt; mentor huỷ bài + audit; so độ giống để v2 |
| Mentor ngoài phạm vi | `AssignmentAccessService.session()` cho mọi route |

---

## 11. Frontend

### 11.1. Web Mindy-FE2

- Editor: v1 dùng **textarea tự viết** (`code-editor.tsx`: số dòng, Tab/Shift+Tab, tự thụt dòng), không thêm dependency. Muốn dùng Monaco
  thì cài `@monaco-editor/react` (kiểm peer React 19, bundle local, không tải CDN) và thay bên trong component, API giữ nguyên.
- Thực tế code nằm ở `src/features/code-assignments/` (một feature chung cho học viên + mentor), xem §15.8.
- **Học viên** (`src/features/learning/code-assignment/`): danh sách bài trong trang lớp/buổi; trang làm bài 2 cột
  (đề | editor). Chọn ngôn ngữ, autosave, Chạy thử (SAMPLE / input tự nhập theo form tham số), Nộp bài, tab Kết quả /
  Lịch sử, countdown hạn nộp, lượt còn lại, điểm cao nhất.
- **Mentor** (`src/features/mentor/code-assignment/`): wizard 5 bước (Thông tin → Chữ ký & ngôn ngữ → Test → Lời giải mẫu &
  Kiểm tra → Publish); bảng tổng hợp; xem bài nộp (source read-only + test); gia hạn, chấm lại, huỷ bài.
- Theo pattern FE2: zod schema contract, proxy server-side, TanStack Query; vitest cho schema/logic, Playwright cho luồng chính.

### 11.2. App MindyFlutter (D12)

- Editor: v1 là **editor tự viết** (`lib/features/code_assignments/code_editor.dart`: số dòng, cuộn ngang, tự thụt lề, thanh phím phụ,
  Undo/Redo), chưa tô màu cú pháp. `re_editor` + `re_highlight` hoãn lại (ghi ở `REMAINING_WORK_PLAN.md` §15) vì chưa chạy được `pub get`.
- **Học viên:**
  - Danh sách bài trong Chi tiết lớp/buổi.
  - Màn đề (markdown, ví dụ).
  - Màn editor toàn màn hình: số dòng, tô màu, thanh phím phụ trên bàn phím (Tab, `{ }`, `( )`, `[ ]`, `;`, `"`, `=`,
    Undo/Redo), chọn ngôn ngữ, autosave nháp.
  - Chạy thử / Nộp bài, sheet kết quả, lịch sử nộp.
- **Mentor:** xem tổng hợp nộp bài của buổi trong Chi tiết lớp/buổi (chỉ đọc). Soạn đề chỉ trên web.
- Dùng hệ Học viên / Staff theo `MindyFlutter/docs/UI.md`; cập nhật bảng màn ở đó.

---

## 12. Lộ trình và checklist

Thứ tự: C1 → C2 → C3 → C4 → C5 → C6 → C7. Mỗi slice có test và cập nhật docs/progress của repo tương ứng.

### C1. compiler-runner v2 — 5–7 ngày

- [x] Harness Go: compile/check, chạy từng test với rlimit, đo CPU/maxrss, cắt output, JSON kết quả; unit test.
- [x] Registry ngôn ngữ `javascript`, `java21`; image pin digest; phụ cấp JVM.
- [x] Endpoint `/internal/v1/executions` + validate body + token (so sánh constant-time) + semaphore 2 loại slot.
- [x] Compose: image chấm build sẵn harness (thay cho volume), env `RUNNER_TOKEN`, slots; giữ network internal.
- [x] Test (fake spawn như hiện tại) + harness test với Node/Java thật: đúng/sai, TLE (vòng lặp + chờ), MLE, spam output,
      lỗi compile Java, lỗi cú pháp JS, exception. Smoke trong Docker thật: **chưa** (môi trường không tải được image, xem §15).

### C2. Mindy-BE schema + soạn đề — 5–6 ngày

- [x] Migration Phase 7 (§7) + seed `code_languages` + triggers; rollback guard khi đã có bài nộp.
- [x] Domain thuần: validate chữ ký, validate test theo kiểu, sinh code khởi đầu, **sinh driver JS/Java**, so sánh 3 mode,
      tính điểm 2 mode, verdict tổng — unit test đầy đủ.
- [x] Port `CodeExecutor` + adapter HTTP runner (timeout, map 429/503).
- [x] API mentor soạn đề + preview chữ ký + validate + publish CODE + gia hạn.
- [x] Nâng body limit 256 KB cho route code.

### C3. Chạy thử + Nộp bài + chấm — 5–7 ngày

- [x] API học viên: đọc đề CODE, nháp, Chạy thử (rate limit `code_runs`), Nộp bài (receipts, in-flight, lượt, deadline).
- [x] `CodeJudgeWorker` (lease, retry, FAILED) + ghi kết quả + view điểm cao nhất.
- [x] Socket event `code_submission.updated` (qua socket Phase 6, chỉ chạy khi `CHAT_ENABLED`; polling là đường chính).
- [x] Integration (PostgreSQL thật) với runner giả: PER_TEST, compile error không tính lượt, bài huỷ vẫn tính, hết lượt, quá hạn,
      retry cùng key, busy/lỗi hạ tầng → FAILED, archive → VOIDED. HTTP E2E qua app build: để C4 cùng Swagger/Postman.

### C4. Mentor theo dõi — 3–4 ngày

- [x] Summary, lịch sử, chi tiết bài nộp, chấm lại FAILED, huỷ bài + audit; phạm vi mentor chính/dạy thay.
- [x] Swagger, Postman, `docs/api_flow/PHASE_7_*`, `docs/progress/phase 7/`, HTTP E2E `test/http/phase7-code-assignments.spec.ts`.

### C5. Web Mindy-FE2 — 7–10 ngày

- [x] Contract zod + proxy + query hooks.
- [x] Màn học viên (danh sách, làm bài, kết quả, lịch sử).
- [x] Trang soạn đề mentor (các khối theo thứ tự wizard) + tổng hợp + chi tiết bài nộp.
- [x] Vitest proxy + format. [ ] Playwright (nộp → điểm), production build, owner duyệt UI: **chưa** (xem §15.8).

### C6. App MindyFlutter — 6–8 ngày

- [x] Models/API/providers theo `codeRule.md`; polling theo `retryAfterMs` (socket để sau).
- [x] Màn danh sách/đề/editor (editor tự viết + thanh phím phụ)/kết quả/lịch sử cho học viên.
- [x] Màn tổng hợp chỉ đọc cho mentor.
- [x] Test unit + widget (320×640 chữ ×1,3) đã viết. [ ] `bash tool/check.sh` trên máy owner, owner duyệt UI: **chưa** (xem §15.9).

### C7. Hardening + deploy — 3–4 ngày

- [x] Runbook deploy + vận hành + rollback: `docs/PHASE_7_CODE_RUNBOOK.md`; `compose.code-runner.yaml` cho API join network runner.
- [x] Script load test `compiler-runner/scripts/load-test.mjs` (30–50 bài, p95 ≤ 2 phút, 0 sai, 0 FAILED).
- [x] Quy trình tắt `/api/code/run` cũ (runbook §8).
- [ ] Owner: đo VPS, pull image, deploy runner v2 + migration + BE, chạy load test, tắt API cũ (chưa làm, cần quyền VPS).

**Tổng ước lượng: ~7–9 tuần công.** C5 và C6 làm song song được nếu có thêm người.

**Lưu ý môi trường:** môi trường làm việc của Claude không chạy được Docker, Postgres hay Flutter build. Code và unit test
viết đầy đủ; bạn chạy `pnpm check`, smoke Docker của runner, `bash tool/check.sh` (Flutter) và báo log để sửa.

---

## 13. Test bắt buộc

1. Domain: driver JS/Java đúng với mọi kiểu §4.1 (gồm mảng rỗng, chuỗi có Unicode/ký tự escape, số âm, `long` biên);
   so sánh 3 mode; điểm 2 mode làm tròn 1 lần.
2. Quyền: học viên lớp khác, enrollment không ACTIVE, mentor ngoài phạm vi, dạy thay đúng buổi.
3. Lộ dữ liệu: mọi response/lỗi/log của học viên không chứa test HIDDEN, expected, lời giải mẫu.
4. Nộp: biên `now() = due_at`, hết lượt, compile error không tính, in-flight 409, retry cùng key, key khác.
5. Worker: runner 429/503/timeout → retry → FAILED; lease; 2 worker không chấm trùng.
6. Đổi trạng thái khi đang chấm: archive, huỷ enrollment, huỷ lớp → VOIDED.
7. Runner: vòng lặp vô hạn, cấp phát lớn, fork bomb, ghi file, spam output, socket, Java nhiều thread, in giả dòng kết quả
   (sai nonce → không được tính).
8. Migration: chạy sạch + upgrade DB có quiz; CHECK mới không phá QUIZ/ZIP.

---

## 14. Rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| Java chậm, hàng đợi dài lúc sát hạn | 30 test tối đa, slot cấu hình, đo ở C7; tối ưu AppCDS / 1 JVM nhiều test nếu cần |
| VPS yếu | Đo trước C7; giảm slot; tách VM judge khi cần |
| Driver Java tự viết parser JSON lỗi kiểu biên | Test domain kỹ (§13.1); chỉ hỗ trợ tập kiểu nhỏ ở §4.1 |
| `docker.sock` | Internal network + token + runner tối giản; lộ trình VM riêng / gVisor |
| Test sai làm hỏng điểm | Bắt buộc lời giải mẫu (D11); đóng băng sau publish; mentor huỷ bài + đề mới |
| Phình phạm vi | Ngoài v1: thêm ngôn ngữ, ListNode/TreeNode, contest/xếp hạng, so độ giống, special checker, chấm tay kết hợp |

---

## 15. Tiến độ (cập nhật 02/11/2026)

| Slice | Trạng thái | Ghi chú |
| --- | --- | --- |
| C1 compiler-runner v2 | **Xong (local)** | Chưa build image / deploy VPS |
| C2 Mindy-BE schema + soạn đề | **Xong (local)** | Chưa chạy `pnpm check` / integration trên máy owner |
| C3 Chạy thử + Nộp bài + chấm | **Xong (local)** | Chưa chạy integration trên máy owner |
| C4 Mentor theo dõi | **Xong (local)** | Chưa chạy integration/HTTP trên máy owner |
| C5 Web Mindy-FE2 | **Xong (local)** | Chưa chạy `npm run check` (build, Vitest, E2E) trên máy owner |
| C6 App MindyFlutter | **Xong (code)** | Chưa chạy `flutter analyze/test` (không có Flutter SDK) |
| C7 Hardening + deploy | **Tài liệu + script xong** | Deploy/load test thật do owner chạy theo runbook |

### 15.1. C1 — đã làm (`compiler-runner/`)

- `harness/` (Go, binary tĩnh ~2,4 MB, build được amd64 + arm64): đọc 1 JSON từ stdin, ghi source vào `/work`, compile 1 lần,
  chạy từng test bằng tiến trình con riêng (RLIMIT_CPU/FSIZE/CORE, kill cả process group khi quá wall time/output), đo CPU time + RSS
  qua `wait4`, env tối giản cho code học viên, nhận biết MLE qua OOM-kill hoặc dấu hiệu ở đuôi stderr.
- `judge-images/node.Dockerfile`, `java.Dockerfile` → `mindy-judge-node:1`, `mindy-judge-java:1` (harness là ENTRYPOINT, user 65534).
- `src/languages.ts` (registry `javascript`, `java21`), `src/execution.ts` (validate request), `src/docker-executor.ts` (cờ cô lập container,
  payload harness, timeout tổng, parse report chặt), `src/slots.ts` (slot `interactive`/`batch`), `src/runner-token.ts` (Bearer, so sánh
  constant-time), `src/internal.controller.ts` (`POST /internal/v1/executions`, `GET /internal/v1/health`).
- API cũ `/api/code/run` chỉ bật khi `LEGACY_RUN_ENABLED=true` (compose để `true` tới C7).
- `compose.production.yaml`: `RUNNER_TOKEN` bắt buộc, slot, image chấm (profile `judge-images` để build), healthcheck mới. README viết lại.

**Đã kiểm tra:** `go vet` + `go test` harness với Node 22 và Java 21 thật (pass); `tsc` strict (pass); `node --test` 14/14 gồm contract test
TS → harness thật → Node/Java thật.
**Chưa kiểm tra:** build image và chạy trong Docker thật (Docker Hub bị chặn ở môi trường làm việc).

### 15.2. C2 — đã làm (`Mindy-BE/`)

- Migration `1792886400000-code-assignments.ts`: thêm `CODE` vào `assignments` (tra và đặt lại tên 3 CHECK cũ), 10 bảng `code_*`,
  seed 2 ngôn ngữ, view `code_assignment_scores` (điểm cao nhất, bỏ bài huỷ), trigger khoá nội dung đề sau publish, trigger bất biến
  cho bài đã chấm (chỉ được huỷ) và kết quả test (append-only), down có guard khi đã có dữ liệu CODE.
- Domain thuần + spec: `code-signature` (12 kiểu, validate chữ ký/test, sinh code khởi đầu JS/Java), `code-driver` (driver JS/Java,
  parser/serializer JSON cho Java, dòng kết quả gắn nonce), `code-grading` (EXACT/FLOAT/UNORDERED, verdict, điểm theo cent, limits),
  `code-readiness` (điều kiện publish).
- `CodeExecutor` port + `HttpCodeExecutor` (fetch có timeout, 429 → busy, lỗi khác → unavailable, validate response chặt).
- `CodeAuthoringService` + `MentorCodeAssignmentsController`: các route ở §8 phần Mentor, trừ summary/submissions/rejudge/void (C4).
- `AssignmentsService`: tạo CODE (bắt buộc hạn nộp, không timer, 1–50 lượt, mặc định 10), publish CODE qua `publishBlockers`,
  archive huỷ bài CODE đang chờ/chấm. Env `CODE_RUNNER_URL`, `CODE_RUNNER_TOKEN`, `CODE_RUNNER_TIMEOUT_MS`. Body 256 KB cho route code.
- `test/integration/phase7-code-authoring.spec.ts` (runner giả, PostgreSQL thật).

**Đã kiểm tra:**
- `tsc --noEmit` toàn dự án (= `pnpm type-check`) pass.
- 35 case spec domain chạy pass (bằng shim vitest).
- Driver sinh ra chạy thật với Node + `javac`/`java`: 26/26 kiểm tra pass (đủ 12 kiểu, escape/Unicode, `long` biên, console tách khỏi kết quả).
- Migration chạy trên PostgreSQL 16 thật: up, kiểm từng CHECK/trigger/view, down guard, down/up lặp lại.

**Chưa kiểm tra (owner chạy trên Mac):** `pnpm check` (Biome lint + vitest + build), `pnpm test:http`, integration spec với `TEST_DATABASE_URL`.
Code đã format theo `biome.json` bằng Prettier; nếu Biome còn báo thì chạy `pnpm lint:fix`.

### 15.3. Lệnh owner cần chạy

```sh
# Mindy-BE
cd Mindy-BE
pnpm lint:fix && pnpm check
TEST_DATABASE_URL=postgresql://mindy:mindy@127.0.0.1:5433/mindy_center_test pnpm vitest run test/integration/phase7-code-authoring.spec.ts

# compiler-runner
cd ../compiler-runner
npm ci && npm test
(cd harness && go test ./...)        # cần Go + node/java trên máy, thiếu thì test tự skip

# VPS (khi sẵn sàng deploy runner, xem compiler-runner/README.md)
nproc; free -h; stat -fc %T /sys/fs/cgroup; df -h /
```

### 15.4. Ghi chú C3 (đã xử lý)

- Worker **không** so `assignment_revision` (gia hạn làm tăng revision; nội dung đề bị trigger khoá).
- Owner chốt 02/11/2026: bài bị mentor huỷ (VOIDED) **vẫn tính** lượt.

### 15.5. C3 — đã làm (`Mindy-BE/`)

- **Luật đếm lượt** (`COUNTED` trong `code-submissions.service.ts`): `counts_as_attempt AND status <> 'FAILED'`. Tức là tính bài đang
  chờ/chấm, đã chấm, **bị huỷ**; không tính lỗi biên dịch và lỗi hệ thống (FAILED, chờ mentor chấm lại ở C4).
- `CodeSubmissionsService` + `StudentCodeAssignmentsController` (`/me/...`):
  - `GET assignments/:id/code`: đề, SAMPLE, ngôn ngữ, lượt đã dùng/còn lại, điểm cao nhất, bài đang chấm, `canSubmit`.
  - `GET/PUT assignments/:id/code-drafts/:languageKey`: nháp có version (0 = lần đầu).
  - `POST assignments/:id/code-runs`: chạy SAMPLE hoặc 1 input tự nhập. Rate limit theo học viên (`CODE_RUN_PER_MINUTE`, `CODE_RUN_PER_DAY`),
    chặn sau hạn nộp.
  - `POST assignments/:id/code-submissions` + `Idempotency-Key`: `202` khi tạo, `200` khi gửi lại cùng key. Kiểm hạn, lượt, 1 bài đang chấm.
  - `GET assignments/:id/code-submissions`, `GET code-submissions/:id`: lịch sử (vẫn đọc được sau archive). Test ẩn chỉ có trạng thái + thời gian.
- `CodeJudgeService` + `CodeJudgeWorker`:
  - Claim `FOR UPDATE SKIP LOCKED` + lease (so tới micro giây), gọi runner ngoài transaction, chấm bằng `gradeSubmission`, chỉ commit
    khi còn giữ lease.
  - Runner bận → lùi lại, không tính lỗi. Lỗi hạ tầng → lùi 5 s / 15 s / 45 s / 2 phút / 5 phút, quá 5 lần → `FAILED`.
  - Archive đề hoặc enrollment hết ACTIVE → `VOIDED`. Worker chỉ chạy khi `CODE_RUNNER_URL` có giá trị.
- Đẩy realtime `code_submission.updated` (chỉ id + status) qua `ChatSocketService.own` (ChatModule export thêm service này).
  Client vẫn polling `GET code-submissions/:id` theo `retryAfterMs`.
- Env mới: `CODE_JUDGE_JOB_ENABLED`, `CODE_JUDGE_CONCURRENCY` (= slot batch của runner), `CODE_RUN_PER_MINUTE`, `CODE_RUN_PER_DAY`.
- `test/integration/phase7-code-submissions.spec.ts` (6 kịch bản, runner giả, PostgreSQL thật).

**Đã kiểm tra:**
- `tsc --noEmit` toàn dự án pass.
- Spec `code-judge` 6/6 pass.
- SQL của claim / lease / đánh số lượt / đếm lượt / reschedule / chi tiết bài chạy đúng trên PostgreSQL 16.
- **End-to-end** logic BE → runner (`DockerExecutor`) → harness → Node/Java thật cho đúng verdict và điểm: ACCEPTED 10.00,
  PARTIAL 4.00, TIME_LIMIT, COMPILE_ERROR (JS + Java), RUNTIME_ERROR.

**Chưa kiểm tra:** 2 integration spec Phase 7 trên máy owner, `pnpm check`, HTTP E2E, socket thật.

### 15.6. Việc tiếp theo: C4

Summary học viên × điểm, lịch sử nộp và chi tiết (mentor xem source + test ẩn), chấm lại bài `FAILED`, huỷ bài (có lý do + audit).
Kèm Swagger, Postman và HTTP E2E cho toàn bộ route CODE.

### 15.7. C4 — đã làm (`Mindy-BE/`)

- `CodeReviewService` + 5 route mentor:
  - `GET assignments/:id/code-summary`: roster = học viên ACTIVE + người đã nộp. Mỗi dòng có lượt đã dùng (cùng luật với học viên),
    điểm cao nhất, bài mới nhất, số bài FAILED. Totals: số đã nộp, chưa nộp, số ACCEPTED, điểm TB.
  - `GET assignments/:id/code-submissions` (lọc `studentId`, phân trang): mỗi bài có cờ `duplicateOfOtherStudent` (cùng SHA-256 với học viên khác).
  - `GET code-submissions/:id`: source + mọi test, cả input/expected test ẩn (output test ẩn không bao giờ được lưu), `lastError` khi FAILED.
  - `POST code-submissions/:id/rejudge`: chỉ bài FAILED, đề còn PUBLISHED; reset job; audit `CODE_REJUDGE`.
  - `POST code-submissions/:id/void` `{reason}`: lý do hiện cho học viên; vẫn tính lượt, bị loại khỏi điểm cao nhất; audit `CODE_VOID`.
- Học viên được đẩy `code_submission.updated` khi bị huỷ hoặc được chấm lại.
- Test: `test/integration/phase7-code-review.spec.ts` (4 kịch bản), `test/http/phase7-code-assignments.spec.ts` (toàn luồng qua app build +
  runner giả bằng HTTP có kiểm token), helper `test/helpers/code-assignment-fixture.ts`.
- Postman `postman/Mindy-Code-Phase7.postman_collection.json` (26 request) + README.

**Đã kiểm tra:** `tsc` toàn dự án pass; SQL summary/duplicate chạy đúng trên PostgreSQL 16 (roster gồm học viên đã huỷ ghi danh nhưng có bài nộp,
đếm lượt bỏ FAILED/lỗi biên dịch, TB điểm, cờ trùng code).
**Chưa kiểm tra:** chạy các spec trên máy owner.

### 15.8. C5 — đã làm (`Mindy-FE2/`)

- `src/features/code-assignments/`:
  - `schemas/code-contracts.ts`: zod cho mọi DTO/input CODE của BE.
  - `api/code-proxy-policy.ts`: allowlist từng route mentor/học viên (UUID, `languageKey`, vị trí test 1–30), body 256 KB, timeout 90 s
    cho `code-runs`/`code-validate`, Idempotency-Key bắt buộc khi nộp. `proxy.server.ts` nhận `bodyLimit`/`timeoutMs` theo rule;
    `client.ts` nhận `timeoutMs`.
  - `api/code-queries.ts` (TanStack Query), `lib/code-format.ts` (nhãn verdict/blocker, lỗi tiếng Việt, parse tham số tự nhập, đếm ngược).
  - Component: `code-editor`, `code-ui`, `student-assignments-page`, `student-code-page`, `mentor-session-assignments`,
    `mentor-code-authoring-page`, `mentor-code-review-page`.
- Route: `/user/assignments`, `/user/assignments/[assignmentId]`, `/mentor/assignments/[assignmentId]` (soạn đề),
  `/mentor/assignments/[assignmentId]/review`, `/mentor/code-submissions/[submissionId]`. Menu học viên "Bài tập lập trình";
  khối "Bài tập" trong trang buổi dạy của mentor.
- Học viên: autosave nháp theo version (2 s), chạy thử SAMPLE hoặc tham số tự nhập, nộp bài có xác nhận, lịch sử, chi tiết tự refresh
  theo `retryAfterMs` tới khi có kết quả.
- Mentor: đề + chữ ký (preview starter code), ngôn ngữ, test, lời giải mẫu + validate, publish, gia hạn, archive; review gồm bảng điểm,
  bài nộp (cờ trùng code), chi tiết, chấm lại, huỷ.
- Docs FE2: `docs/progress.md`, `docs/api-contracts.md`.

**Đã kiểm tra:**
- `tsc --noEmit`, ESLint (file mới/đổi) và Prettier `--check` pass trên máy owner (VM).
- `code-proxy.test.ts` 5/5 và `code-format.test.ts` 4/4 pass.
- 11 suite proxy cũ vẫn pass: test chạy bằng shim Vitest + zod v4 do không cài được npm.

**Chưa kiểm tra (owner chạy):** `npm run test`, `npm run build`, Playwright luồng nộp → điểm, duyệt UI với BE thật.

### 15.9. C6 — đã làm (`MindyFlutter/`)

- `lib/features/code_assignments/`: `code_models.dart` (parse chặt; từ chối response lộ dữ liệu test ẩn; điểm giữ chuỗi server),
  `code_api.dart`, `code_providers.dart` (danh sách, đề, lịch sử, theo dõi bài nộp có polling, nháp autosave theo version, lệnh Chạy thử/Nộp
  có Idempotency-Key và gửi lại đúng yêu cầu khi lỗi mạng), `code_editing.dart` (hàm thuần: chèn ký tự, tự thụt lề), `code_editor.dart`,
  các màn `code_assignments_screen`, `code_problem_screen`, `code_editor_screen`, `code_result_sheet`.
- Mentor: `lib/features/mentor/code/mentor_session_code_screen.dart` (chỉ đọc), mở từ "Công cụ buổi dạy" → "Bài tập code".
- Route: `/classes/:classId/code`, `/code/:assignmentId`, `/code/:assignmentId/editor`, `/mentor/sessions/:sessionId/code`.
  Nút "Bài tập" ở chân Chi tiết lớp (chỉ khi quyền FULL). `Json.raw()` thêm vào `core/network/json.dart` để đọc tham số/kết quả tuỳ ý.
- i18n `code.*`, `mentor.code.*` đủ vi/en. Docs: `docs/UI.md` §6.3b + mục 9, `docs/REMAINING_WORK_PLAN.md` §10b, §15.
- Test `test/code_assignments_test.dart`: model, soạn code, API (idempotency, body, timeout, id sai), 3 widget test.

**Đã kiểm tra:** khoá i18n (vi/en cùng key, mọi key dùng trong code tồn tại) bằng script; rà soát thủ công API Riverpod 3/Flutter.
**Chưa kiểm tra:** `flutter analyze`, `flutter test` (môi trường Claude không có Flutter SDK và không tải được pub). Owner chạy
`bash tool/check.sh`, gửi `check.log` nếu có lỗi.

### 15.10. C7 — đã làm (tài liệu + công cụ)

- `Mindy-BE/docs/PHASE_7_CODE_RUNBOOK.md`: đo VPS và chọn slot, build image chấm, deploy runner v2, migration + BE (worker tắt), smoke,
  bật worker, SQL theo dõi hàng đợi/FAILED/p95, load test, FE2/app, tắt API cũ, rollback, xử lý sự cố.
- `Mindy-BE/compose.code-runner.yaml`: override thêm network `mindy-compiler` (external) cho service `api`.
- `compiler-runner/scripts/load-test.mjs` + mục *Load test* trong README.

**Đã kiểm tra:** load test chạy với runner giả lập (429, 503, độ trễ): 30/30 OK, đếm retry đúng, thoát mã 0/1/2 đúng; chương trình JS/Java
trong script chạy đúng với Node 22/Java 21; SQL theo dõi chạy trên PostgreSQL 16 có schema Phase 7.
**Chưa kiểm tra:** chạy thật trên VPS (cần owner).

### 15.11. Việc owner cần làm để hoàn tất Phase 7

1. Mindy-BE: `pnpm lint:fix && pnpm check`; 3 integration spec Phase 7 với `TEST_DATABASE_URL`; `pnpm test:http`.
2. compiler-runner: `npm ci && npm test`; `(cd harness && go test ./...)`.
3. Mindy-FE2: `npm run check` (lint, format, types, Vitest, build, Playwright).
4. MindyFlutter: `bash tool/check.sh`.
5. VPS: làm theo `docs/PHASE_7_CODE_RUNBOOK.md` mục 1→8; ghi kết quả load test vào đây.
6. Duyệt UI web + app; UAT một bài thật (mentor ra đề → học viên nộp JS và Java → điểm đúng).

### 15.12. Soạn đề dễ hơn — wizard (02/11/2026, owner giao Claude tự quyết)

Owner thấy cách ra đề khó hiểu. Đã chuyển sang cách "lời giải mẫu là chuẩn": mentor nhập input, máy chạy lời giải để sinh output.

- **BE** (`code-authoring.service.ts`, `mentor-code-assignments.controller.ts`), không đổi bảng dữ liệu:
  - `POST assignments/:id/code-tests/generate`: chạy lời giải (chưa lưu) trên danh sách input, trả output; không lưu gì.
  - `PUT assignments/:id/code-tests`: lưu cả bảng test trong một revision; lỗi có `position`.
  - `GET code-library`: các bài CODE mentor đã tạo (mọi lớp), tìm theo tên/mã lớp.
  - `POST assignments/:id/code-import`: chép đề/hàm/ngôn ngữ/test/lời giải từ bài khác vào bản nháp; không chép trạng thái đã kiểm tra.
  - `AssignmentRow.created_by` được khai báo (cột đã có). Test: 2 kịch bản mới trong `test/integration/phase7-code-authoring.spec.ts`.
- **Web FE2**: trang soạn đề thành wizard 4 bước (Đề bài → Hàm cần viết → Lời giải & test → Giao đề), thanh tiến độ, checklist có nút
  "Sửa" tới đúng bước. Kiểu dữ liệu hiện tên tiếng Việt ("Mảng số nguyên (int[])"); xem trước code khởi đầu trực tiếp; mặc định 1 ngôn
  ngữ JavaScript, so khớp chính xác, điểm theo test, 1 s / 256 MB (gom vào "Nâng cao"). Test nhập dạng bảng, chuỗi gõ không cần nháy,
  dán nhiều dòng; cột kết quả chỉ do lời giải điền. "Bắt đầu nhanh": 7 đề mẫu (`lib/code-templates.ts`) hoặc dùng lại bài đã soạn.
  Bài đã giao: chỉ hiện gia hạn/đóng bài + bản xem trước.
- Postman thêm 4 request.

**Đã kiểm tra:** BE `tsc` pass; SQL `code-library` chạy trên PostgreSQL 16. FE2 `tsc`, ESLint, Prettier pass trên máy owner;
`code-authoring.test.ts` 8/8 (gồm chạy lời giải 7 đề mẫu), `code-proxy.test.ts` 6/6, các bộ proxy cũ pass (shim Vitest).
**Chưa kiểm tra:** integration spec mới trên PostgreSQL thật, `pnpm check` (Biome), `npm run check` (build, Playwright), duyệt UI.
