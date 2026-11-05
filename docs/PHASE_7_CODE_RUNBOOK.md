# Phase 7 — Runbook deploy và vận hành bài tập lập trình (CODE)

Cập nhật 02/11/2026 · slice C7. [Plan](implement_phase/phase%207/PHASE_7_CODE_ASSIGNMENTS.md) ·
[Progress](progress/phase%207/PHASE_7_CODE_PROGRESS.md) · [API](api_flow/PHASE_7_CODE_flow-api-breakdown.md) ·
runner: `../compiler-runner/README.md`.

Trạng thái: **chưa deploy**. Các bước dưới đây do owner chạy trên VPS. Claude không đăng nhập VPS.

## 0. Thành phần và thứ tự

```text
FE2 / app ──HTTPS──> Mindy-BE (api) ──http, network mindy-compiler (internal)──> compiler-runner ──docker.sock──> container chấm
                         │                                                                    (network none, read-only)
                         └── Postgres: code_submissions, code_judge_jobs (worker SKIP LOCKED + lease)
```

Thứ tự bật: **đo VPS → image chấm → runner v2 → migration + BE (worker tắt) → smoke → bật worker → load test → FE2/app → tắt API cũ**.

## 1. Đo VPS trước khi chọn slot

```sh
nproc; free -h; stat -fc %T /sys/fs/cgroup; df -h /; docker version --format '{{.Server.Version}}'
```

| Kết quả | Hành động |
| --- | --- |
| `cgroup2fs` | Đúng; giới hạn memory/pids của container chấm có hiệu lực |
| `tmpfs` (cgroup v1) | Vẫn chạy được, nhưng kiểm OOM thủ công bằng load test (mục 6) |
| Đĩa trống < 5 GB | Dọn image cũ trước (`docker image prune`); image Java ~ 350 MB |

Chọn slot (mỗi slot = 1 container chấm cùng lúc, `JUDGE_CPUS=1`):

| VPS | `RUNNER_SLOTS_INTERACTIVE` | `RUNNER_SLOTS_BATCH` = `CODE_JUDGE_CONCURRENCY` |
| --- | --- | --- |
| 2 vCPU / 4 GB | 1 | 1 |
| 4 vCPU / 8 GB | 1 | 2 (mặc định) |
| 8 vCPU / 16 GB | 2 | 4 |

Java cần container ≥ 512 MB khi biên dịch. RAM rảnh tối thiểu ≈ (slot interactive + slot batch) × 600 MB cộng phần của API/Postgres.

## 2. Image chấm + runner v2

Trong thư mục runner trên VPS (bản cũ đang ở `/home/mindycode/mindycoding`):

```sh
# Backup bản đang chạy (rollback mục 9)
docker image tag mindy-compiler:20261002 mindy-compiler:rollback 2>/dev/null || true

# Token dùng chung với BE: >= 32 ký tự ngẫu nhiên. Ghi vào .env của runner, KHÔNG commit.
grep -q '^RUNNER_TOKEN=' .env || echo "RUNNER_TOKEN=$(openssl rand -hex 32)" >> .env
echo "RUNNER_SLOTS_INTERACTIVE=1" >> .env; echo "RUNNER_SLOTS_BATCH=2" >> .env

docker pull node:22-alpine && docker pull eclipse-temurin:21-jdk-alpine && docker pull golang:1.24-alpine
docker compose -f compose.production.yaml --profile judge-images build judge-node judge-java
docker compose -f compose.production.yaml build runner
docker compose -f compose.production.yaml up -d runner
docker compose -f compose.production.yaml ps            # runner healthy
docker images --digests | grep -E 'node|temurin|golang'  # ghi digest vào plan §15 để pin lần sau
```

Smoke runner (từ một container trong network `mindy-compiler`): xem `compiler-runner/README.md` mục *Deploy*. Kỳ vọng `t1` OK `42`,
vòng lặp vô hạn → `TIME_LIMIT`, sai token → `401`.

Giữ `LEGACY_RUN_ENABLED=true` tới mục 8.

## 3. Migration + BE (worker tắt)

1. Backup DB (`pg_dump -Fc`) theo quy trình [VPS_DEPLOYMENT](VPS_DEPLOYMENT.md); thử restore vào DB tạm.
2. Thêm vào `.env.production` của BE:

   ```dotenv
   CODE_RUNNER_URL=http://compiler-runner:4000
   CODE_RUNNER_TOKEN=<giống RUNNER_TOKEN của runner>
   CODE_RUNNER_TIMEOUT_MS=90000
   CODE_JUDGE_JOB_ENABLED=false
   CODE_JUDGE_CONCURRENCY=2          # = RUNNER_SLOTS_BATCH
   CODE_RUN_PER_MINUTE=10
   CODE_RUN_PER_DAY=300
   ```

3. Deploy BE kèm file override để API join network của runner (network phải có sẵn từ mục 2):

   ```sh
   docker compose -f compose.production.yaml -f compose.code-runner.yaml build
   docker compose -f compose.production.yaml -f compose.code-runner.yaml up -d   # migration chạy trước api
   docker compose -f compose.production.yaml logs migration | tail -20           # có 1792886400000-code-assignments
   ```

   `compose.code-runner.yaml` chỉ thêm network `mindy-compiler` (external) cho service `api`. Không có file này thì API không gọi được runner,
   Chạy thử trả `503 CODE_RUNNER_UNAVAILABLE`, bài nộp nằm ở hàng đợi.

4. Reverse proxy (Nginx/Caddy) trước API: body ≥ **256 KB** cho `/api/v1/` (Nginx `client_max_body_size 1m;`), read timeout ≥ **100 s**
   (Chạy thử/validate chờ runner tới 90 s).

## 4. Smoke BE

Dùng `postman/Mindy-Code-Phase7.postman_collection.json` với tài khoản mentor + học viên của môi trường test (không lưu mật khẩu vào repo):

1. Mentor tạo bài CODE → đề → ngôn ngữ → ≥ 1 SAMPLE + ≥ 1 HIDDEN → lời giải mẫu → validate (`validated: true`) → publish.
2. Học viên: đọc đề, lưu nháp, Chạy thử (`compileStatus: OK`).
3. Học viên nộp bài: `202 QUEUED`. Vì worker đang tắt, bài ở `QUEUED` là đúng.

## 5. Bật worker

```dotenv
CODE_JUDGE_JOB_ENABLED=true
```

Restart API (ConfigModule không tự đọc lại `.env`). Bài ở bước 4.3 phải chuyển `GRADED` trong vài giây. Kiểm hàng đợi:

```sql
-- Hàng đợi và job quá hạn
SELECT count(*) FILTER (WHERE completed_at IS NULL)                         AS pending,
       count(*) FILTER (WHERE completed_at IS NULL AND run_after < now() - interval '2 minutes') AS late,
       max(attempts) FILTER (WHERE completed_at IS NULL)                    AS max_attempts
FROM code_judge_jobs;

-- Bài lỗi hệ thống chấm 24h qua (mentor chấm lại trên web)
SELECT s.id, s.assignment_id, s.submitted_at, j.attempts, j.last_error
FROM code_submissions s JOIN code_judge_jobs j ON j.submission_id = s.id
WHERE s.status = 'FAILED' AND s.submitted_at > now() - interval '24 hours'
ORDER BY s.submitted_at DESC LIMIT 50;

-- Thời gian chờ chấm (p95) 24h qua
SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM judged_at - submitted_at)) AS p95_seconds
FROM code_submissions WHERE judged_at IS NOT NULL AND submitted_at > now() - interval '24 hours';
```

## 6. Load test

Script `compiler-runner/scripts/load-test.mjs` giả lập 30–50 bài nộp cùng lúc như worker của BE (429 → chờ, 503 → lùi dần, quá 5 lần → FAILED),
gửi thẳng tới runner. Chạy trong container cùng network `mindy-compiler`, ví dụ container API (có Node 22):

```sh
# API container là read-only nên truyền script qua stdin; tên container theo `docker ps`.
docker exec -i -e RUNNER_URL=http://compiler-runner:4000 -e RUNNER_TOKEN="$RUNNER_TOKEN" \
  -e SUBMISSIONS=50 -e CONCURRENCY=2 -e JAVA_RATIO=0.5 \
  mindy-center-api-1 node --input-type=module - < compiler-runner/scripts/load-test.mjs
```

Nghiệm thu: script in `ĐẠT ngưỡng nghiệm thu.` (0 sai, 0 FAILED, p95 thời gian chờ ≤ 120 s). Ghi kết quả JSON vào plan §15.
Không đạt: giảm `TESTS`/tăng slot nếu RAM cho phép, hoặc xem `docker stats` lúc chạy; p95 Java cao là dấu hiệu cần tăng `RUNNER_SLOTS_BATCH`
(đồng thời tăng `CODE_JUDGE_CONCURRENCY`). Chạy ngoài giờ học; script tạo container chấm thật.

## 7. FE2 và app

- FE2: deploy bản có `src/features/code-assignments` (proxy body 256 KB, timeout 90 s đã cấu hình trong code). Không cần env mới.
- App Flutter: build sau khi `bash tool/check.sh` sạch; không cần env mới (dùng `API_URL`/`APP_ORIGIN` hiện có).

## 8. Tắt API cũ `/api/code/run`

Điều kiện: không còn client gọi trực tiếp runner (FE cũ đã chuyển sang Mindy-BE). Kiểm log 7 ngày:

```sh
docker logs --since 168h mindy-compiler 2>&1 | grep -c '/api/code/run'
```

Bằng 0 (hoặc chỉ còn request từ công cụ nội bộ đã biết) thì:

```sh
sed -i 's/^LEGACY_RUN_ENABLED=.*/LEGACY_RUN_ENABLED=false/' .env || echo LEGACY_RUN_ENABLED=false >> .env
docker compose -f compose.production.yaml up -d runner
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://compiler-runner:4000/api/code/run   # từ container cùng network: 404
```

Sau đó sửa default trong `compose.production.yaml` thành `false` và gỡ port public của runner nếu reverse proxy còn route tới nó.
Runner chỉ còn nhận request có Bearer token qua network nội bộ.

## 9. Rollback

| Sự cố | Cách lùi | Dữ liệu |
| --- | --- | --- |
| Chấm sai / runner lỗi | `CODE_JUDGE_JOB_ENABLED=false` + restart API | Bài nộp giữ `QUEUED`, chấm tiếp khi bật lại |
| Runner v2 hỏng | `image: mindy-compiler:rollback` trong compose runner, `up -d runner`; BE tạm trả 503 cho Chạy thử | Không mất dữ liệu |
| BE mới hỏng | Deploy lại image BE cũ (`IMAGE_TAG`). Migration Phase 7 là additive: BE cũ bỏ qua bảng `code_*` | Không revert migration khi đã có bài CODE (down có guard, sẽ dừng) |
| FE2/app | Deploy lại bản trước; API BE không đổi | — |

## 10. Sự cố thường gặp

| Triệu chứng | Nguyên nhân thường gặp | Xử lý |
| --- | --- | --- |
| Chạy thử luôn `503 CODE_RUNNER_UNAVAILABLE` | API chưa join `mindy-compiler`, sai `CODE_RUNNER_URL`/token | `docker network inspect mindy-compiler`; so token hai bên |
| `429 CODE_RUNNER_BUSY` nhiều | Hết slot interactive | Tăng `RUNNER_SLOTS_INTERACTIVE` nếu RAM đủ |
| Bài nộp `FAILED` hàng loạt | Runner/Docker lỗi > 5 lần (≈ 8 phút) | Sửa runner, rồi mentor bấm *Chấm lại* trên web (chỉ bài FAILED; không tính lượt) |
| Java luôn `TIME_LIMIT` | VPS chậm, JVM khởi động lâu | Tăng giới hạn CPU của đề (mentor) hoặc phụ cấp Java trong `src/languages.ts` |
| `MEMORY_LIMIT` bất thường | cgroup v1 hoặc giới hạn đề quá thấp | Mục 1; mentor tăng `memoryLimitMb` (bài chưa publish) |

Không bao giờ sửa tay `code_submissions` đã `GRADED` (trigger chặn); huỷ bài dùng API *void* có lý do + audit.
