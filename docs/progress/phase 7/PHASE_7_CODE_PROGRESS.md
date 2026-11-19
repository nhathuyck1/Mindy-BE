# Phase 7 progress — CODE assignments (bài tập lập trình chấm tự động)

## 16/11/2026 — Phát hành web và backend với hai ngôn ngữ tắt

- Sau merge `origin/dev` tại `a44d988`, BE `pnpm check` đạt 880 test, HTTP
  đạt 131 test và round-trip Docker đạt 50 test. HTTP local dùng thư mục
  scratch tạm có quyền ghi trên Mac.
- VPS chạy runner `20261116-python-csharp`, BE `a3001ad` và FE2 `b9600ea`.
  Đã kiểm tra bản sao lưu PostgreSQL trước khi chạy migration
  `CodeLanguagesPythonCsharp1794787200000`. Catalog còn 0 migration chờ.
- Smoke runner production đạt cả 4 ngôn ngữ. Backend production round-trip
  Python và C# đạt 12/12 kiểu mỗi ngôn ngữ. FE2 giữ alias Docker
  `mindy-frontend` cho Cloudflare. Hai key mới đang `enabled=false`.
- Flutter analyze sạch, 13 test CODE đạt. Bốn widget test Materials/lịch lỗi
  giống commit cha. Admin mobile type-check đạt. Chờ phát hành cả hai app
  mobile trước khi bật và nghiệm thu trên tài khoản mentor/học viên.

## 16/11/2026 — Python 3.13 và C# .NET 10

- Hoàn tất ở local (Claude): merge `origin/dev` (`a44d988`) vào nhánh
  `feat/phase7-python-csharp`, gỡ conflict `Progress.md` và
  `phase7-code-authoring.spec.ts`; migration đổi tên thành `1794787200000` để
  đứng sau migration mới nhất của dev và thêm vào `ASSIGNMENT_MIGRATIONS`. Sau
  merge: `tsc --noEmit` (src + test) sạch, 49 spec domain CODE pass; chưa chạy
  lại biome, full vitest/HTTP trên máy dev. FE2, MindyFlutter và MindyMobile_Admin (schema code block whiteboard) cùng tên nhánh;
  `compiler-runner/` được đưa vào git. Chưa push, chưa deploy.

- Backend và runner nhận bốn key. API preview trả bốn starter, danh sách
  ngôn ngữ theo thứ tự JavaScript, Java, Python, C#. Migration thêm hai hàng
  ở trạng thái tắt. Kiểm tra B0 chỉ đọc trên production trả về 0 chữ ký vướng
  từ khóa mới.
- Python/C# chạy driver với thread riêng và trả lỗi runtime khi lời giải ném
  exception. Image C# dùng Roslyn với reference assemblies trong image.
  Harness C# tăng giới hạn file riêng lên 64 MiB cho file nội bộ CoreCLR.
- Local: 48 ca round-trip qua Docker cho 12 kiểu và bốn ngôn ngữ, thêm hai ca
  đệ quy 100.000 tầng và exception. HTTP với runner thật qua luồng tạo bài,
  xác thực reference, giao bài, chạy thử và nộp Python/C#. Type-check/build,
  823 test BE, 17 test runner chạy với Docker và `go test` đều đạt.
- Diễn tập nâng cấp từ mã production `a44d988` trên PostgreSQL local. Sau 41
  migration của bản cũ, bản mới chỉ chạy migration Python/C# và tạo hai hàng
  tắt. Chạy lần nữa không có migration chờ.
- VPS: smoke cả bốn ngôn ngữ trên runner thử nghiệm riêng. Roslyn compile
  Hello World trong 0,38 giây, peak RSS 96.588 KiB. Đợt thử 8 bài trộn bốn
  ngôn ngữ với concurrency 2 đạt 8/8, p95 chờ kết quả 2,269 giây.
- Production đang chờ triển khai runner và BE rồi phát hành FE tương thích
  trước khi bật hai ngôn ngữ. [Flow](../../api_flow/PHASE_7_CODE_FLOW.md) ·
  [Runbook](../../PHASE_7_CODE_RUNBOOK.md#phát-hành-python-và-c).

## 03/11/2026 — Validation for compiler PR

- Both `.env.example` and `.env.production.example` now document CODE runner,
  worker and run rate-limit settings. Existing CODE migration timestamp is retained.
- Node22.20.0 / pnpm12.6.0 frozen install, `pnpm lint:fix`, lint/type-check PASS.
  `pnpm check` PASS:91 suites /790 tests and36 compiled migration artifacts.
- `pnpm test:http` final full run PASS:14 suites /125 tests,0 skipped. Compiled
  migration rollout applies36 migrations; repeat applies0 on an isolated test DB.
- Fixed pre-existing test timing assumptions: Materials validation waits for an
  eligible worker claim (small application/DB clock skew), including compiled HTTP;
  attendance HTTP fixtures derive dates in Asia/Ho_Chi_Minh instead of UTC so their
  correction window remains valid after local midnight. No production rules changed.
- `files:local:up` found port19000 already occupied by the existing local MinIO
  fixture; tests reused that healthy container with private generated test buckets.
  PostgreSQL uses the isolated25437 test service. CODE HTTP uses the fake runner;
  this run does not establish real-runner or VPS acceptance.
- Frontend companion [PR14](https://github.com/nhathuyck1/Mindy-FE2/pull/14)
  targets main and retains its QUIZ/ZIP/chat/Whiteboard work. Flutter deferred.
  Logs are outside the repositories in `.local-runtime/compiler-pr-validation/`.

## Backend integration — 02/11/2026

Resolved the six stash conflicts using current `dev` ZIP/Whiteboard behavior as
baseline and adding CODE configuration, controllers, services and judge workers.
ZIP publish feature/storage/READY-file gates and QUIZ question validation remain.
Archive keeps both ZIP and CODE cleanup paths. Whiteboard runtime and deployed
migration sources are unchanged; the existing Whiteboard API document is preserved.
CODE flow/API/progress now have separate filenames, with runbook/Postman links fixed.

Combined reports include non-VOIDED CODE submissions once per assignment/student;
any surviving GRADED attempt counts as released while later attempts are pending.
Added three PostgreSQL compatibility tests for publish gates, reports and archive.
The ZIP fixture applies the additive CODE migration as well as its existing schema.

Local validation on Node 22.20.0 / pnpm 12.6.0, isolated PostgreSQL at loopback25437
and private MinIO test buckets:

- Focused QUIZ/ZIP/CODE/Whiteboard integration: 7 suites, 57/57 tests PASS.
- `pnpm check`: lint/type-check PASS, 91 suites / 790 tests PASS, no skips;
  build verifies 36 migration artifacts.
- Compiled HTTP/WS: `pnpm exec vitest run --config vitest.http.config.ts` after
  the build above: 14 suites / 125 tests PASS, no skips, including ZIP, CODE and
  Whiteboard. CODE uses the suite's fake runner; no new real-engine/load acceptance.
- Dependency install uses the unchanged lockfile (`pnpm install --frozen-lockfile`).
  Manifest/lockfile and existing ZIP registrations/Whiteboard preservation checked.

Pre-resolution files and index stages, `check.log` and `http.log` are retained in
workspace `.local-runtime/backend-conflicts-before-integration/` outside this repo.
No frontend edits, development/production migrations, deployment, commit or push.
Earlier dated evidence below belongs to the original feature work.

[Plan](../../implement_phase/phase%207/PHASE_7_CODE_ASSIGNMENTS.md) ·
[API breakdown](../../api_flow/PHASE_7_CODE_flow-api-breakdown.md) ·
[Flow](../../api_flow/PHASE_7_CODE_FLOW.md)

| Slice | Status |
| --- | --- |
| C1 compiler-runner v2 | Verified locally with real Docker judge images, JS/Java smoke, harness and contract tests. VPS deploy pending. |
| C2 schema + mentor authoring | Integrated into current `dev` working tree (uncommitted). No deploy. |
| C3 student run + submit + judge worker | Implemented locally (uncommitted). |
| C4 mentor review / rejudge / void / summary | Implemented locally (uncommitted). |
| C5 web Mindy-FE2 | Implemented locally (uncommitted in Mindy-FE2). |
| C6 MindyFlutter | Missing from the current Mac checkout: no feature directory/test; UI.md 6.3b says not implemented. Flutter SDK works; existing app checks pass. Handoff discrepancy needs recovery. |
| C7 runbook + load test | Real local Docker load: 30/30 and 50/50 pass. VPS deploy/load pending (owner). |

## 2026-11-02 — Kiểm tra thật trên máy Mac

[Hướng dẫn chạy lại, kết quả và UAT](../../PHASE_7_LOCAL_TESTING.md).

- BE `pnpm check`: 748/748 test, lint/type-check/build pass với DB test riêng port 25437 và MinIO fixture local.
- Phase 7 integration 16/16; HTTP với runner giả và runner Docker thật đều pass luồng tạo đề/validate/publish/run/submit/worker/review/void.
- `pnpm test:http` toàn bộ: 13 suite, 118/118 pass.
- Runner unit 12/12, contract thật 2/2, Go harness 3/3 trong Linux container; 8 smoke check thật pass.
- Docker load test: 30/30 (p95 23.969 ms), 50/50 (p95 14.300 ms), 2 batch slot, 50% Java, 10 test/bài, không sai/FAILED/retry hạ tầng. Không suy ra năng lực VPS từ số đo Mac.
- FE `npm run check`: 207 unit, 365 Playwright pass, 5 skip; gồm test compiler mới desktop/mobile 320px. Đã xem screenshot.
- Flutter analyze + 341 test pass, 1 skip; C6 không có trong checkout hiện tại. Các ghi chú “đã làm C6” bên dưới là lịch sử bàn giao, chưa khớp file thực tế.
- Sửa raw UPDATE tuple của TypeORM ở worker/draft; archive CODE không ảnh hưởng QUIZ; polling FE cập nhật lại điểm/lượt/nút nộp/lịch sử sau khi chấm.
- Chưa deploy, commit hoặc push. Log/ảnh ở workspace `.local-runtime/phase7-validation/`.

## 2026-11-02 — C1 + C2 local implementation

Planned work: see plan §12 (C1, C2 checklists ticked).

Local checks actually run (Claude workspace, Linux):

- Runner harness: `go vet`, `go test` with real Node 22 + Java 21 — PASS (OK, syntax/compile error, runtime error,
  CPU TLE, idle wall TLE, output limit, JS heap OOM, Java OOM).
- Runner TypeScript: `tsc` strict — PASS; `node --test` 14/14 — PASS, including the contract test
  DockerExecutor → real harness → real Node/Java (Docker replaced by direct spawn).
- Mindy-BE: `tsc --noEmit -p tsconfig.json` (same as `pnpm type-check`) — PASS, run with the repository's own
  node_modules.
- Domain specs (`code-signature`, `code-driver`, `code-grading`, `code-readiness`): 35/35 cases PASS via a minimal
  vitest shim (vitest itself could not be installed: npm registry blocked in the workspace).
- Generated drivers executed with real `node`, `javac`, `java`: 26/26 checks PASS (all 12 value types, string escapes and
  Unicode, empty arrays, long bounds, `public class Solution`, console output separated from the result).
- Migration `1792886400000-code-assignments` on PostgreSQL 16.15: up after the Phase 5 migration, every CHECK/trigger/view
  exercised (including the NULL-epsilon bug found and fixed), down guard with data, down/up repeat on empty data restores
  the original constraint names.

Not run (owner to run on macOS):

- `pnpm check` (Biome lint, vitest, build manifest), `pnpm test:http`.
- `test/integration/phase7-code-authoring.spec.ts` with `TEST_DATABASE_URL`.
- Judge image build and Docker smoke test (Docker Hub blocked in the workspace).

Decisions recorded: owner decisions D1–D13 in the plan §1 (02/11/2026). Implementation choices:

- Judge images bundle the harness (no shared volume). Runner owns language commands; BE sends only a language key.
- Post-publish changes use `POST /mentor/assignments/:id/code-extension` (not PATCH): deadline later only, attempts up only,
  reason required, revision bumped and audited.
- Publish gate returns the first blocker as the error code and the full list in `details[0].blockers`
  (409 only for `CODE_REFERENCE_NOT_VALIDATED`, otherwise 422).

No VPS migration, deployment or real-runner evidence exists for Phase 7 yet.

## 2026-11-02 — C3 local implementation

Owner decision: mentor-voided submissions still count as used attempts. Attempt rule:
`counts_as_attempt AND status <> 'FAILED'` (compile errors and system failures are free).

Implemented: `CodeSubmissionsService` (view, drafts, runs with per-student rate limit, idempotent submit, history, detail),
`CodeJudgeService` + `CodeJudgeWorker` (SKIP LOCKED claim, microsecond lease token, runner outside transactions, busy back-pressure,
infrastructure back-off to FAILED after 5 failures, VOIDED on archive / inactive enrollment), `ChatSocketCodeSubmissionNotifier`
(`code_submission.updated`, ids/status only; ChatModule now exports ChatSocketService), env `CODE_JUDGE_*`, `CODE_RUN_*`.

Local checks actually run:

- `tsc --noEmit -p tsconfig.json` with the repository's node_modules — PASS.
- `code-judge` spec 6/6 via vitest shim — PASS.
- C3 SQL on PostgreSQL 16.15: claim/second-claim, lease match vs 1 µs-stale lease, attempt numbering, attempt counting
  (graded + voided counted; compile error + failed not), reschedule back-off, sample-only detail projection — PASS.
- End-to-end without Docker: BE domain (source, limits, grading) → runner DockerExecutor → real harness → real Node 22 / Java 21:
  JS accepted/partial/TLE/syntax error and Java accepted/runtime error/compile error produce the expected verdicts and scores.

Not run: `test/integration/phase7-code-submissions.spec.ts` and `phase7-code-authoring.spec.ts` (need TEST_DATABASE_URL on the
owner machine), `pnpm check`, HTTP E2E, live Socket.IO delivery. No deployment.

## 2026-11-02 — C4 local implementation

Implemented `CodeReviewService` (summary roster CTE, submissions page with cross-student duplicate flag, detail with hidden inputs,
rejudge FAILED only, void with reason + audit + student push), Postman collection, integration spec `phase7-code-review`, HTTP E2E
`phase7-code-assignments` (built app + fake HTTP runner with bearer check, real worker).
Local checks run: `tsc --noEmit` PASS; summary/duplicate SQL on PostgreSQL 16.15 PASS. Not run: the specs (owner machine).

## 2026-11-02 — C5 web (Mindy-FE2)

Feature `src/features/code-assignments/` (contracts, proxy allowlist, query hooks, student and mentor pages); routes under
`/user/assignments` and `/mentor/assignments`, `/mentor/code-submissions`. Details: plan §15.8.

Checks run: FE2 `tsc --noEmit`, ESLint and Prettier `--check` on the owner's VM — PASS. `code-proxy.test.ts` 5/5,
`code-format.test.ts` 4/4 and 11 existing proxy suites PASS through a vitest shim (npm blocked in the workspace).
Not run: `npm run test`, `npm run build`, Playwright, live BE.

## 2026-11-02 — C6 app (MindyFlutter) + C7 runbook

- C6: feature `lib/features/code_assignments/` + mentor read-only summary; details plan §15.9. Checks: i18n keys vi/en verified by script.
  Not run: `flutter analyze`, `flutter test` (owner: `bash tool/check.sh`).
- C7: [runbook](../../PHASE_7_CODE_RUNBOOK.md), `compose.code-runner.yaml`, `compiler-runner/scripts/load-test.mjs`. Checks: load test
  against a mock runner (429/503/latency) 30/30 OK with correct exit codes; embedded JS/Java programs verified with Node 22/Java 21;
  monitoring SQL ran on PostgreSQL 16 with the Phase 7 schema. Not run: VPS deploy and real load test.

## 2026-11-02 — Authoring wizard (reference-first)

Owner asked for an easier, standard way to write problems. BE: `code-tests/generate`, bulk `PUT code-tests`, `GET code-library`,
`POST code-import` (no schema change); D11 clarified to "at least one reference". FE2: 4-step wizard with templates and reuse.
Details: plan §15.12. Checks: BE `tsc`; FE2 `tsc`/ESLint/Prettier on the owner's machine; FE2 unit tests via vitest shim.
Not run: new integration specs on PostgreSQL, `pnpm check`, `npm run check`.

## 2026-11-19 — Publish deployed sources to Git remotes

- User explicitly requested both remote Git and server receive the latest sources, including uncommitted work. BE/FE2 publish on `feat/phase7-python-csharp`; compiler uses private `Quanhpm/mindy-compiler-runner` on `main`.
- Application source matches the tested deployment `web-20261119T141416Z`. Verified 495 compiled API JavaScript files and 12 runner files against production containers, plus complete source-file checksums. Only Markdown records changed after deployment; existing test evidence remains applicable.
- Local verification already completed for the same application source: BE 894 unit/integration and 131 HTTP pass; FE 376 unit and 553 distinct E2E scenarios pass across full run/recheck, with 5 viewport skips and one retry-passed flaky scenario. Production four-language execution smoke passed. This sync does not claim a fresh full test run or real payment/email acceptance.
- No API, migration, data, feature-flag or runtime-secret changes. Server keeps its verified runtime artifacts and records the published commit mapping. Git publication does not enable Python/C# for older mobile clients.

### Final integrated release — sync-20261119T145234Z

- After the initial publication, fetched the latest integration branches and merged BE `origin/dev` at `829cad6` and FE2 `origin/main` at `a2c1c3d` into the feature branches. Resolved the progress-only conflict by preserving both records. Included upstream seed-demo helpers, whiteboard viewport and Student session details; production seeding and language flags remain unchanged.
- Fresh backend gates: types/build PASS with 42 migration artifacts; lint zero errors/11 existing warnings; 911 unit/integration PASS, 50 real-runner driver cases skipped; all 131 compiled HTTP PASS.
- FE updated Next.js/eslint-config-next from 16.4.1 to 16.4.6 following the official security advisories. Lint/format/types/build and 379 unit PASS. Full E2E exposed an Admin URL/debounce race; fixed the stale filter snapshot and added regression coverage. 565 distinct E2E scenarios PASS across the full run and the final 32-case Admin rerun, with 5 viewport skips.
- Built new API/FE images for the integrated source. Production preflight validates existing database/storage volumes, private API binding, environment, 42 migration artifacts/zero pending, login 200 and protected API 401. Source commits are published before runtime cutover; final runtime/remote equality is recorded by the deployment evidence.


## Owner chốt bật production — 19/11/2026 23:25:52 UTC+7

- Owner yêu cầu dừng nghiệm thu và chỉ public Python/C# trên production; chấp nhận app mobile cũ lỗi với các bài dùng hai ngôn ngữ này.
- Đã thực thi `UPDATE code_languages SET enabled = true WHERE key IN ('python3','csharp');` trên production và SELECT lại. Đủ 4 key đều enabled: javascript=1, java21=2, python3=3, csharp=2 (time_multiplier). Không xóa dòng hoặc sửa multiplier. Trạng thái trước bật: Python/C# false, JS/Java true.
- Dừng kiểm tra giao diện theo chỉ đạo mới; chưa nghiệm thu toàn bộ tạo đề/lời giải/làm mẫu/nộp bài/verdict/rejudge/whiteboard/chat trong lượt này. Không ghi các luồng đó là PASS. Chưa tạo thành công bài thử, không có bài thử đã giao cần archive.
- Lượt này chỉ thay cờ dữ liệu production; chưa mở/merge PR vào dev/main. Log trước/sau và timestamp ở server: `/home/mindycode/mindycoding/mindy-backups/final-python-csharp-20261119/`.
