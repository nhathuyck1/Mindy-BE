# Phase 5 progress — Assignment QUIZ / ZIP

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
