# Test compiler trên máy Mac — 02/11/2026

## Kết quả đã xác minh

- BE: `pnpm check` với PostgreSQL test riêng: **748/748 test pass**, lint/type-check/build pass.
- Phase 7 integration: **16/16 pass** trên PostgreSQL thật.
- HTTP toàn bộ: **118/118 pass**, 13 suite, sau khi rebuild bản đã sửa.
- Phase 7 HTTP: luồng mentor tạo đề → kiểm tra lời giải → publish → học viên chạy thử → nộp có idempotency → worker chấm → mentor xem/hủy đã pass với **runner + container Docker thật**. Suite mặc định dùng runner giả cũng pass.
- Runner: **12/12 unit test**, **2/2 contract test** với harness và Node/Java thật; Go harness **3/3 test pass** trong Linux container. Không cài Go lên Mac.
- Smoke runner thật: **8/8 pass** (JS/Java trả 42, syntax error, vòng lặp vô hạn, output limit, runtime error, token sai, ngôn ngữ không hỗ trợ).
- Load thật, 2 batch slot, 10 test/bài, 50% Java: **30/30** (p95 23.969 ms), **50/50** (p95 14.300 ms), không WRONG/FAILED/infra retry. Đây là số đo Docker Desktop trên Mac, **không phải benchmark VPS**.
- FE: `npm run check` pass toàn bộ: lint/format/types, **207 unit test**, production build, **365 Playwright pass / 5 skip**; test compiler mới pass cả desktop/mobile 320px: lưu nháp, input tự nhập, chạy, xác nhận nộp, polling kết quả, cập nhật điểm/lượt/nút nộp/lịch sử, không tràn ngang.
- Flutter: `bash tool/check.sh` pass analyze và **341 test**, 1 skip. **Checkout hiện tại không có C6**: thiếu `lib/features/code_assignments/` và `test/code_assignments_test.dart`; `docs/UI.md` mục 6.3b vẫn ghi “Chưa làm”. Vì vậy chưa thể nghiệm thu compiler trên app.

Log và ảnh nghiệm thu: thư mục `../../.local-runtime/phase7-validation/` (ngoài các repo, không commit).

## Những lỗi đã sửa khi chạy test

1. TypeORM/PostgreSQL trả `[rows, affectedCount]` cho raw `UPDATE`: worker đọc sai ID, không chấm được; sửa cả claim/move và cập nhật nháp lần thứ hai.
2. Archive chỉ thao tác bảng code khi assignment có type CODE; giữ luồng QUIZ cũ hoạt động.
3. FE trước đó hiện điểm ở chi tiết nhưng nút nộp/điểm cao nhất/lịch sử có thể giữ trạng thái cũ. Poll assignment khi có bài đang chấm; poll lịch sử tới khi mọi bài hết pending. Test E2E mới kiểm tra lại tình huống này.
4. Sửa import/format và ghi chú ngoại lệ lint cho tùy chọn `then` bắt buộc của Joi.
5. Bộ Playwright Manager nghỉ dạy dùng deadline tháng 10 nhưng đọc ngày thật tháng 11. Cố định giờ browser theo `asOf` của fixture để test không hết hạn theo ngày chạy.

Không commit/push hoặc deploy VPS. Runner và PostgreSQL test do lượt kiểm tra này tạo đã được tắt sau nghiệm thu; image/container còn để chạy lại theo hướng dẫn dưới đây.

## Chạy lại nhanh trên chính máy này

Tất cả lệnh dưới đây chạy trong **Terminal trên Mac**, không phải VPS. Các URL/credential là dữ liệu test local.

### 1. Bật Docker Desktop và PostgreSQL test

Container test riêng đã được tạo, port `25437`, không dùng DB dev/UAT:

```sh
docker start mindy-code-phase7-test-pg
```

Nếu container đã bị xóa, tạo lại:

```sh
docker run -d --name mindy-code-phase7-test-pg \
  -e POSTGRES_USER=mindy -e POSTGRES_PASSWORD=mindy \
  -e POSTGRES_DB=mindy_phase7_agent_test \
  -p 127.0.0.1:25437:5432 postgres:16-alpine
```

Test tự tạo các DB có hậu tố `_test`. Không thay bằng DB dev/production.

### 2. Terminal A — bật runner

```sh
cd "/Users/FPTU/Ki 8/WDP/MINDY-BE/compiler-runner"
npm ci
docker build -f judge-images/node.Dockerfile -t mindy-judge-node:1 .
docker build -f judge-images/java.Dockerfile -t mindy-judge-java:1 .
npm run build
RUNNER_TOKEN=mindy-phase7-local-test-token-0123456789 \
  HOST=127.0.0.1 PORT=14000 LEGACY_RUN_ENABLED=false node dist/main.js
```

Giữ Terminal A chạy. Nếu port 14000 đã bận, kiểm tra runner đang chạy bằng:

```sh
curl http://127.0.0.1:14000/internal/v1/health
```

Phải thấy `ok:true`, hai ngôn ngữ và số slot. Token ví dụ này chỉ dùng local.

### 3. Terminal B — test engine thật

```sh
cd "/Users/FPTU/Ki 8/WDP/MINDY-BE/compiler-runner"
export RUNNER_URL=http://127.0.0.1:14000
export RUNNER_TOKEN=mindy-phase7-local-test-token-0123456789

```

Kỳ vọng smoke có 8 dòng PASS; load có `ok:50`, `wrong:0`, `failed:0`, p95 <120.000 ms và dòng “ĐẠT ngưỡng nghiệm thu”. Lệnh thoát mã 1 khi không đạt.

### 4. Test BE + DB + runner thật

Repo cần Node 22.20 và pnpm 12.6. Wrapper có sẵn trong workspace, dùng để tránh pnpm fallback chạy nhầm Node 24:

```sh
cd "/Users/FPTU/Ki 8/WDP/MINDY-BE/Mindy-BE"
export PATH="/Users/FPTU/Ki 8/WDP/MINDY-BE/.local-runtime/bin:/usr/local/bin:$PATH"
node --version
pnpm --version
export TEST_DATABASE_URL=postgresql://mindy:mindy@127.0.0.1:25437/mindy_phase7_agent_test
pnpm vitest run test/integration/phase7-*.spec.ts
pnpm build
TEST_CODE_RUNNER_URL=http://127.0.0.1:14000 \
  TEST_CODE_RUNNER_TOKEN=mindy-phase7-local-test-token-0123456789 \
  pnpm vitest run --config vitest.http.config.ts test/http/phase7-code-assignments.spec.ts
```

Kỳ vọng 16 integration test pass và 1 HTTP test pass. HTTP test tự bật/tắt API test, seed tài khoản/lớp, chạy worker và dọn phiên; không cần tự chạy API khác.

`pnpm check` và `pnpm test:http` toàn bộ cần thêm MinIO fixture port 19000 theo `compose.files-test.yaml`. Trong lần nghiệm thu này, MinIO local đang có sẵn và các test dùng bucket ngẫu nhiên hậu tố `-test`.

### 5. Test giao diện web tự động

```sh
cd "/Users/FPTU/Ki 8/WDP/MINDY-BE/Mindy-FE2"
npm run build
npm run test:e2e -- tests/e2e/code-assignments.e2e.ts
```

Playwright tự bật production frontend port 3103. Test này dùng API fixture trong browser; test ở mục 4 mới xác minh API + DB + compiler thật. Không coi hai kiểm tra này là UAT toàn bộ browser nối backend thật.

## Duyệt tay khi FE đã nối vào BE có Phase 7

1. Mentor đăng nhập → buổi dạy thuộc lớp mình → **Bài tập** → tạo bài CODE, hạn nộp tương lai, 3 lượt, 10 điểm.
2. Đề Two Sum; function `twoSum`, tham số `nums: int[]`, `target: int`, trả `int[]`; chọn JavaScript. Thêm SAMPLE `[[2,7,11,15],9]` → `[0,1]` và HIDDEN `[[3,2,4],6]` → `[1,2]`.
3. Nhập lời giải bên dưới → kiểm tra lời giải, cần đạt toàn bộ test → publish.
4. Học viên có enrollment ACTIVE trong lớp → menu **Bài tập lập trình** → mở đề. Nhập code, chờ lưu nháp, reload kiểm tra còn code.
5. Chạy ví dụ rồi bật input tự nhập: `nums=[3,2,4]`, `target=6`, kết quả `[1,2]`. Nộp → xác nhận → đợi Đã chấm/Đúng hết, điểm 10, còn 2/3 lượt; nút Nộp bài bật lại và lịch sử hết chờ chấm.
6. Thử code `return []`, lỗi cú pháp, và `while(true){}`. Kỳ vọng sai đáp án, lỗi biên dịch không tốn lượt, quá thời gian. Nên dùng bài/tài khoản test mới để không hết lượt trước khi kiểm tra đủ.
7. Mentor mở bảng bài nộp, kiểm tra điểm và test ẩn; học viên không được thấy input/expected của test ẩn. Hủy bài cần lý do; bài hủy vẫn tính lượt. Chấm lại chỉ áp dụng bài FAILED do hệ thống.

```js
function twoSum(nums, target) {
  for (let i = 0; i < nums.length; i++) {
    for (let j = i + 1; j < nums.length; j++) {
      if (nums[i] + nums[j] === target) return [i, j];
    }
  }
  return [];
}
```

## Phần còn lại

- App: cần khôi phục đúng phần C6 từ bản bàn giao/nhánh chứa code, rồi mới analyze/test và UAT compiler trên thiết bị. Không cần cài lại Flutter SDK: máy này đã có SDK hoạt động.
- VPS: chưa deploy, chưa đo CPU/RAM và chưa load test VPS. Thực hiện [runbook](PHASE_7_CODE_RUNBOOK.md) mục 1–8 sau khi chuẩn bị bản deploy; ghi số đo VPS riêng.
