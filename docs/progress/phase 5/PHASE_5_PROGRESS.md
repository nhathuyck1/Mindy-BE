# Phase 5 progress — Assignment QUIZ / ZIP

## B0/B2–B5 — ZIP completion — 2026-11-02

Implementation covers the remaining backend plan. New migration1793577600000 adds
isolated ZIP submissions/files/instruction bindings and snapshots/grade revisions/
audits/receipts/durable jobs/copy tracking. QUIZ persistence and result schema remain
unchanged. ZIP starts as DRAFT; unique open draft, scoped FKs, immutable terminal
submissions/file bindings/revisions/audits/receipts and grade-release pointer guards
protect history. Populated down refuses data loss.

- Private purpose-scoped instruction upload (PDF/DOCX/PNG/JPEG,5 files,25MiB each)
  and student ZIP upload20MiB; server-derived ancestry/owner, pin staging version,
  complete/processing/READY/status/60s attachment download with post-sign auth check.
  No widening of material FilesController/student role or chat file-ID scope.
- Isolated ZIP parser streams actual sizes/CRC, bounds100MiB/1000 entries/ratio100,
  rejects encrypted/nested/signature-spoofed/symlink/unsafe or duplicate paths;
  heap128MiB/process35s/archive30s budgets. No extraction or execution.
- Durable jobs poll3s, lease180s/heartbeat15s, task90s/max5 attempts. Recover expired
  leases and final-attempt worker death; stale workers cannot publish READY. Worker
  rechecks source/student/deadline/state before committing. Storage IO outside tx.
- Cleanup rechecks expiry/grace/references under file lock; exact-key all-version
  deletion plus pre-recorded copy keys handles overwrite/crash. DELETED tombstones
  rechecked daily for late writes; FAILED cleanup is terminal for investigation.
  Submitted/instruction references are retained. Default cleanup grace24h, configurable.
- Published ZIP can extend dueAt/maxAttempts with reason/revision/audit, never reduce.
  Create/resume DRAFT does not consume attempts; attach one READY own ZIP; submit
  allocates next attempt under locks and rechecks DB clock in final write. Submitted
  title/description/maxScore/deadline/instruction/file version snapshots are immutable.
  Archive voids drafts atomically; worker voids other revoked drafts durably.
- Draft grade revisions, explicit current-version release, reason for corrections,
  optimistic locks and exact receipt replay. Students retain old released grade until
  new release and cannot infer draft grades using list filters. Mentor current scope
  is required even after source closure; createdBy is not a permanent grant.
- Student QUIZ/ZIP discriminated history, mentor latest-submitted queue with history
  filters, grade/audit history, roster/missing and scoped class metrics. Drafts/extra
  attempts do not inflate student counts. Terminal enrollment submissions retained;
  current eligibility denominator documented. Pending corrections count as unreleased
  while the old released result remains visible. assignmentSummary now AVAILABLE in
  compiled mentor progress endpoints through an assignment-owned read participant.
- Feature ASSIGNMENT_ZIP_ENABLED defaults false. Flag rollback preserves submitted
  reads/downloads/results and committed submit receipt replay; QUIZ remains usable.
  Environment examples, Swagger,37-request Postman collection, flow/API and
  [worker/rollout runbook](../../core/ASSIGNMENT_ZIP_RUNBOOK.md) updated. Provision script
  adds assignment-only ListBucketVersions/DeleteObjectVersion permissions; no material
  delete widening and no actual production provisioning was performed.

Focused local evidence:5 ZIP validator cases and10 PostgreSQL+MinIO tests, including
upgrade over a real graded QUIZ, cleanup/down guards, whole pipeline, multiple attempts,
grade privacy/corrections, concurrent submit/grade/release, stale leases, pinned staging
overwrite, revoke during copy, post-sign revoke, current substitute scope, audit/receipt
rollback, missing denominator/quota and late-PUT tombstone cleanup. Compiled HTTP5 tests
cover QUIZ/bulk plus a real isolated ZIP validator process and cookie/Origin/role/DTO/
OpenAPI/history/feature rollback. Final full regression/migration evidence recorded below.

Final gates on dedicated local test infrastructure:

- `pnpm check` PASS:80 files/709 tests,0 skipped, lint/type-check and build33 verified
  migration artifacts. Log `tmp/assignment-verified-check.log`.
- Compiled HTTP PASS:12 files/120 tests,0 skipped. Includes40-question quiz/bulk,
  ZIP subprocess validator/whole flow, real mentor assignmentSummary aggregate and
  flag rollback, materials/chat/teaching/payments regressions. Log
  `tmp/assignment-complete-http.log`. An existing Files Swagger assertion originally
  rejected all paths ending /release; scoped it to the removed class-unit release
  routes because /grade/release is now a valid distinct command. The old routes
  remain404 and absent from Swagger. Earlier run119/120 is retained in
  `tmp/assignment-verified-http.log`; final full run is120/120.
- Compiled migration smoke PASS: fresh dedicated database applies33 migrations,
  repeat applies0/no pending. Log `tmp/assignment-verified-rollout.log`.
- Final repository lint/type-check/diff whitespace PASS;37 Postman request bodies
  parse as JSON,27 local links validated, production MinIO script shell syntax PASS.
  A preliminary check without TEST_DATABASE_URL failed fixture setup/skipped DB
  tests; it is not counted as evidence. Configured final checks above have0 skips.

No frontend changes, development/production migrations, deployment, commit or push.
Production IAM/CORS/scratch/proxy/load/browser acceptance requires environment smoke;
local fixtures only use dedicated *_test DBs and private -test MinIO buckets.

## B1 — Bulk ABCD — 2026-11-02

Started the [remaining backend plan](../../implement_phase/phase%205/PHASE_5_REMAINING_BE_PLAN.md)
with the independent B1 slice. B0/B2–B5 (ZIP schema/storage/submit/grades/reports)
remain pending; ZIP publication still returns409 ZIP_PIPELINE_NOT_IMPLEMENTED.

- PUT mentor assignment questions has its own 1MiB JSON parser before the global
  parser (adjusted from 8MiB to 1MiB). Global 64KiB and attendance recovery 256KiB remain unchanged. Source review
  corrected the plan's reference to a chat 256KiB parser: chat uses global 64KiB.
- Full replacement,1..200 questions, current mentor scope and expectedRevision
  semantics retained. UUID comparisons normalize case; duplicate/foreign IDs,
  repeated labels, missing keys and nested/unknown fields reject the whole set.
- 422 INVALID_QUIZ_QUESTIONS now supplies details[0].fields[{path,code}], zero-based
  question/option indexes. Unknown field names become $unknown; no rejected values,
  answer values or validation targets are serialized. Other DTO errors retain
  the existing global exception format.
- Three parameterized batch INSERTs replace1200 sequential question/option/key
  INSERTs for200 questions; all deletes/inserts/revision/audit remain in one tx.
  Local PostgreSQL measurement:22 total SQL queries,129.5ms for200 questions.
  This is a small local fixture, not a production latency benchmark.
- Updated Swagger, Postman, flow/API breakdown and proxy rollout guidance. Repo
  does not manage active reverse-proxy config; standard reverse-proxy defaults (1m)
  now cover this route directly. App 413 is INVALID_JSON_BODY.

Focused local evidence: 17/17 domain+PostgreSQL tests and 4/4 compiled assignment
HTTP tests PASS. Covers 40-question regression, 200-question multilingual import
above 64KiB, exact 1MiB and +1 byte (413), UTF-8/JSON escaping, parser isolation including
attendance256KiB, field mapping/no private values, stale revisions, ID/order/key
retention, replace-all removal and audit-failure rollback.

Full `pnpm check` PASS: lint/type-check,78 files/694 tests, zero skips; production
build verified32 migration artifacts. Uses dedicated `*_test` PostgreSQL databases
and test MinIO. Log: `tmp/assignment-b1-check.log` (ignored local evidence).
Postman16 requests/raw bodies and17 local Markdown links validate; diff whitespace
and final repository lint/type-check pass.

Final compiled HTTP:12 files/119 tests PASS, zero skips, including34 chat tests and
4 assignment tests. Log: `tmp/assignment-b1-http-final.log`. Earlier HTTP run overlapped
the check's clean-dist build and finished118/119 with a chat fixture `reconciled`
IPC timeout (`tmp/assignment-b1-http.log`). Running only that chat test is not a
valid isolation because it depends on an earlier restart fixture (`workers-stopped`
timeout, `tmp/assignment-b1-chat-recheck.log`). The final full HTTP run after the build
passed with no chat source/test changes; build and compiled HTTP must run sequentially.

No FE changes, production migrations, commit/push or deployment in this slice.

## Restoration — 2026-10-23

- Branch `codex/restore-phase5-assignments`, base dev `569bfcb`; reversed removal
  commit `7f50985` from PR #21 to restore PR #20's QUIZ slice.
- Previous PR #20 CI failed the first mentor-leave migration test with
  LEAVE_NOTICE_TOO_SHORT at 00:15 Vietnam time: the shared fixture scheduled
  dates using UTC, leaving only one local calendar day of notice.
- Fixture now uses APP_TIME_ZONE (Asia/Ho_Chi_Minh). The migration/history test
  simulates 00:15 Vietnam time to cover the UTC date boundary. Leave policy and
  production code remain unchanged by this fix.
- QUIZ restored; ZIP upload/submission/manual grading and A5 reports stay TODO.
- Current compiled HTTP verification: 11 files / 83 tests PASS, including the
  40-question authoring/start/autosave/submit/result flow with private-key checks.
- Compiled rollout: 29 migrations on a fresh isolated test database; repeat
  applies 0, no pending migrations. Production build verified 29 artifacts.
- Final `pnpm check` PASS: lint/type-check, 69 files / 637 tests, production build
  with 29 verified migration artifacts. Dedicated PostgreSQL and test MinIO used;
  logs: tmp/restore-final-check.log, tmp/restore-http.log, tmp/restore-rollout.log
  (ignored local files). The 00:15 Vietnam regression passes with the date fix.
- No VPS migration, merge or deployment has been performed by this restoration task.

### CI media dependency timeout — 2026-10-23

- User-supplied logs_108139096828.zip matches Check run 39898049364 on 2206bdf.
  Ensure media validation dependency timed out after 5 minutes downloading
  FFmpeg (81 packages / 66.4 MB) from Ubuntu 26.04 mirrors. The run never
  reached pnpm install, lint or tests; this is separate from the fixed leave date.
- Workflow now runs frozen pnpm install first, copies the existing pinned
  ffprobe-static binary to /usr/bin/ffprobe and verifies its version. No apt
  download or dependency/version change; production Docker still uses its
  existing FFmpeg package. Test FFmpeg remains the existing ffmpeg-static fixture.
- Local Linux smoke PASS for MP3 and H.264 MP4 using the actual validator's
  protocol/format whitelist, packet count, duration and JSON flags. Lint and
  git diff --check PASS. Previous full 637-test and 83-HTTP-test local results
  remain applicable to unchanged application code. GitHub rerun pending.

2026-10-22 — IN PROGRESS, branch codex/phase5-assignments.
[Plan](../../implement_phase/phase%205/PHASE_5_ASSIGNMENTS.md) ·
[Flow](../../api_flow/PHASE_5_FLOW.md) ·
[Current API](../../api_flow/PHASE_5_flow-api-breakdown.md).

| Slice | Current status |
|---|---|
| Planning / relationships | Plan reviewed against current source. Assignment owns ClassSession. |
| A0 scope/schema | QUIZ implemented; additive migration1792713600000, private key tables, snapshot/answer/result JSONB, append-only audits, receipts, durable jobs. ZIP file binding/grade revisions deferred. |
| A1 authoring | QUIZ draft/create/list/detail/edit/question replacement/publish/archive/delete implemented; scoped primary/substitute. ZIP draft metadata only; publication explicitly409. |
| A2 attempt / grading | Start/resume, optional timer/deadline, full-answer autosave, complete-paper submit, atomic grading/result and durable timeout worker implemented and locally tested. |
| A3 ZIP pipeline | TODO — no student upload,complete,status,attach/download; no storage purpose widening. |
| A4 ZIP grading | TODO — no ZIP submit/manual grade/grade revisions/release. |
| A5 metrics / full handoff | TODO — mentor submission queue/detail/roster, student history-list, class metrics and assignmentSummary aggregation. QUIZ Swagger/Postman/flow/API handoff included in this slice. |
| Compiler/CODE / FE / deployment | Outside this slice; no FE edits or deployment. |

## Implementation decisions

- Defaults from plan retained for QUIZ:1..200 ABCD single-correct questions,
  one official attempt, full manual submit, timer optional1..240 minutes;
  timeout grades saved answers only and blanks wrong. Purpose TEST/HOMEWORK
  independent of QUIZ/ZIP type. Score integer cents, equal weights, round once.
- Entitlement follows current source, superseding old planning release wording:
  ACTIVE enrollment; legacy unit LOCKED/unlockAt is not a content gate. Pending
  cash/guest makeup does not grant assignment rights. Class COMPLETED/CANCELLED
  blocks writes; cancelled session blocks work. Own graded history stays readable
  with current ACTIVE account after enrollment terminal and source archive/cancel.
- Typed module-owned SQL follows teaching-notes style; no entity mirrors added.
  Quiz answer/snapshot/result JSONB enables atomic full-answer replacement;
  keys normalized separately, never projected before committed grading.
  Separate grades/grade_revisions wait for ZIP slice; no fake mentor grader ID.
- Quiz result is nested in QuizAttemptDto.result. Student metadata schema excludes
  questions/private keys; result DTO documents every per-question field.
- Published content/config frozen, ZIP publish409 ZIP_PIPELINE_NOT_IMPLEMENTED.
  Existing assignmentSummary stays NOT_IMPLEMENTED until actual aggregate exists.
- Mutation locks coordinate Class/Session with existing writers. Receipts contain
  only resource references and request hashes. Terminal quiz submissions immutable
  in DB; audit failure rolls back final answers/result/receipt together.
- ASSIGNMENT_TIMEOUT_JOB_ENABLED defaults true. Worker polls2s/batch20, persistent
  jobs survive restart, capped retry2..300s. GET does not perform writes.
- Request size remains existing64KiB. No dependency updates, payment rule changes,
  frontend UI, production migrations or deployment.

## Local evidence — 2026-10-22

- Domain suite:5/5 pass, including33/40 ->82.50, incomplete manual paper,
  timeout blanks, duplicate/foreign answers, decimal rounding and expiry limits.
- PostgreSQL suite:9/9 pass on isolated mindy_center_phase5_test. Includes clean
  migration/down-up, guard against populated rollback, paid access, no draft keys,
  concurrent idempotent start/submit/timeout, durable result, terminal history,
  stale/foreign/duplicate answers, substitute revoke, archive VOIDED, audit failure
  rollback, class-cancel recheck after waiting for writer lock and durable untimed
  attempt voiding after enrollment revocation.
- Compiled HTTP feature suite:2/2 pass on isolated phase5_http_test. Real cookie,
  role/Origin/UUID/nested DTO/unknown-field guards, OpenAPI and40-question journey.
- Final pnpm check PASS: lint/type-check,69 files/637 tests, build29 migration artifacts.
  PostgreSQL and local MinIO enabled. Log: tmp/phase5-check.log (ignored local log).
- Final full compiled HTTP regression PASS11 files/83 tests, no skips. Includes
  untimed cleanup and explicit OpenAPI no-key assertions. Log: tmp/phase5-http.log.
- Static handoff validation PASS:4 documents,13 relative links,1 JSON example,
  Postman16 requests and every request body parsed; lint and git diff --check pass.
- Compiled rollout smoke PASS:29 migrations on a fresh isolated database, repeat
  rollout applies0 migrations. Populated assignment rollback guard tested separately.

No development/VPS/production database migrated by this task. Test schemas and
isolated MinIO buckets only. No browser acceptance, real payment or deployment
evidence. Phase5 overall incomplete until A3-A5 are delivered.
