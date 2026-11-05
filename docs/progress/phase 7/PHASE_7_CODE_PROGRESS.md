# Phase 7 progress — CODE assignments (bài tập lập trình chấm tự động)

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
