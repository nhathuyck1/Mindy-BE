# Phase 7 — CODE assignments flow

03/11/2026 PR validation: both env examples include CODE settings; full local
backend790 tests and compiled HTTP/WS125 tests pass, with36 verified migration
artifacts and a zero-change repeat migration. Existing Materials/attendance test
fixtures now wait for eligible jobs and use the Vietnam calendar. API workflow
and production rules are unchanged; no deployment or new real-runner acceptance.

[Plan](../implement_phase/phase%207/PHASE_7_CODE_ASSIGNMENTS.md) ·
[API contract](PHASE_7_CODE_flow-api-breakdown.md) ·
[Progress](../progress/phase%207/PHASE_7_CODE_PROGRESS.md)

## Backend integration — 02/11/2026

The existing `dev` ZIP/Whiteboard implementation is the integration baseline.
The CODE feature is added to the shared assignments module without replacing
ZIP controllers, storage/file workers, reporting, or Whiteboard runtime.
Whiteboard documentation retains its original paths; CODE uses separate files.

1. Mentor creates a CODE draft in an authorized class session, sets a future
   deadline, problem signature, languages, sample/hidden tests and reference solution.
2. Mentor validates the saved references through compiler-runner, then publishes
   only when the current revision has no CODE readiness blockers. ZIP retains its
   own feature/storage/READY-file checks; only QUIZ requires quiz questions.
3. An ACTIVE student opens the published problem, saves a versioned draft and
   optionally runs samples/custom inputs. The client only calls Mindy-BE.
4. Submit with a UUIDv4 Idempotency-Key stores a QUEUED submission and judge job
   atomically. The worker calls the runner outside the database transaction and
   commits the result. Students poll detail; chat may send an own-user update.
5. The assignment score is the highest surviving GRADED attempt, earliest on ties.
   Class reports count the student once, including while later attempts are pending.
   CODE has no ZIP-style manual grade release. Voided results do not contribute.
6. Archive voids queued/running CODE work and completes its jobs. QUIZ expiry and
   ZIP draft/history/grading continue using their existing paths and rules.

Scope, stale revisions, hidden-test privacy, deadline, rate-limit, runner failure,
rejudge and void behavior are documented in the linked API contract and runbook.
CODE history uses its own endpoints; the QUIZ/ZIP history DTO remains unchanged.

Verification for this integration is recorded in CODE progress, separately from
earlier feature evidence. Local checks do not imply deployment or a real-runner
acceptance run. No frontend changes or development/production database migrations.
