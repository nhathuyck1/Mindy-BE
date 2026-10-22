# Phase 5 progress — Assignment QUIZ / ZIP

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
