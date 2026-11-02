# Phase 5 — Assignment: QUIZ / ZIP backend

## ZIP completion — 2026-11-02

B0/B2–B5 implemented: isolated additive ZIP/file/grade schema, durable validation/
cleanup worker, private instruction files, immutable ZIP submission attempts,
grade revisions/release/history, queue/roster/class metrics and actual assignmentSummary.
Feature ASSIGNMENT_ZIP_ENABLED defaults false; reads of submitted history/released
grades and bound downloads survive a flag rollback. Quiz remains independent.
Current contracts are in [API section5](PHASE_5_flow-api-breakdown.md#5-zip-instruction-files-grading-and-reporting--implemented);
[runbook](../core/ASSIGNMENT_ZIP_RUNBOOK.md) covers worker/IAM/scratch/retention/rollout.

```mermaid
flowchart LR
  D[Mentor draft] --> I[Optional private instruction files READY]
  I --> P[Publish freezes instructions and max score]
  P --> Z[Student create or resume ZIP draft]
  Z --> U[Upload intent and PUT bytes]
  U --> C[Complete pins staging version]
  C --> W[Durable worker validates streamed ZIP and copies verified version]
  W --> R[READY]
  R --> A[Attach one ZIP]
  A --> S[Submit before DB deadline allocates immutable attempt]
  S --> G[Mentor grade revision]
  G --> L[Release current revision]
  L --> H[Student released result and retained history]
  L --> E[Correction requires reason]
  E --> G
  S --> N[New draft if attempts remain]
  N --> U
```

Only successful submit consumes a ZIP attempt; new drafts do not supersede the last
submitted result. Submit rechecks deadline in its final SQL write. Upload/READY
before dueAt does not reserve a submission. Archive voids drafts atomically;
source/account/enrollment revocation blocks writes immediately and worker maintenance
durably voids drafts. Grade mutations require current mentor scope even after source
closure. Students see the old released grade until a corrected revision is released.
History survives terminal enrollment/source archive; current account/ownership remain
required. Download rechecks binding/access after signing; issued URL TTL is60s.

Queue/report counts use latest submitted per student, excluding drafts. Missing is
computed only for currently eligible pairs after deadline; historical eligibility is
not inferred. Pending corrections may count in both released and unreleased. Stored
progress consumes the assignment-owned read participant; no unit/certificate policy
is inferred. Local evidence and full gate results live in
[progress](../progress/phase%205/PHASE_5_PROGRESS.md). No FE/deployment/production DB work.
Earlier dated sections below describe previous partial slices.

## Bulk ABCD — 2026-11-02

B1 of the [remaining backend plan](../implement_phase/phase%205/PHASE_5_REMAINING_BE_PLAN.md)
is implemented locally. Mentor prepares the entire merged question set, then PUTs
questions with expectedRevision. Up to 200 questions and 1MiB JSON are accepted;
three parameterized batch INSERTs run in one transaction with revision/audit.
Success returns canonical IDs/order/revision; any invalid question rolls back the
whole replacement.422 details[0].fields gives zero-based field paths without rejected
values/private keys;409 requires refetch/reconcile;413 requires reducing JSON bytes.
No raw-text parser or FE changes. Existing global64KiB and attendance recovery256KiB
parsers are preserved (the new plan initially misidentified the latter as chat).

Local verification includes multilingual200-question import, exact 1MiB/+1 byte,
parser isolation, duplicate/foreign IDs, ID/order retention, stale revision and
audit-failure rollback. Scope/quiz grading/history remain unchanged. Runtime gates
and measurements are in [progress](../progress/phase%205/PHASE_5_PROGRESS.md);
proxy/VPS limits still require environment verification. ZIP remains draft-only;
B0/B2–B5 are pending.

## Restoration — 2026-10-23

Branch `codex/restore-phase5-assignments` starts from dev `569bfcb` and reverses
the removal in PR #21, restoring PR #20's QUIZ implementation. ZIP and A3-A5
remain pending. The API and business rules match the restored implementation.
The shared payment test fixture now derives scheduled dates in APP_TIME_ZONE
(Asia/Ho_Chi_Minh), with a leave migration regression at 00:15 Vietnam time;
this fixes the UTC/local calendar discrepancy without changing leave policy.
Validation and deployment evidence are recorded in Phase 5 progress.

CI follow-up: run 39898049364 stopped before dependency installation/tests while
apt downloaded FFmpeg on Ubuntu 26.04, exceeding the five-minute step limit.
The workflow now installs the lockfile-pinned ffprobe-static Linux binary at
/usr/bin/ffprobe after pnpm install. All validation/test gates remain enabled;
no assignment flow, API or production container behavior changes.

2026-10-22 · codex/phase5-assignments. QUIZ vertical slice implemented; A3-A5 pending.
[Plan](../implement_phase/phase%205/PHASE_5_ASSIGNMENTS.md) ·
[Current API](PHASE_5_flow-api-breakdown.md) · [Progress](../progress/phase%205/PHASE_5_PROGRESS.md).

```mermaid
flowchart LR
  M[Mentor primary or scoped substitute] --> D[Session assignment DRAFT]
  D --> Q[ABCD questions and private keys]
  Q --> P[PUBLISH freezes content]
  P --> E[Student ACTIVE enrollment]
  E --> S[Start once or resume frozen attempt]
  S --> A[Save choices without grading]
  A --> F[Submit complete paper]
  S --> T[Durable timeout job]
  F --> G[Atomic grading and result]
  T --> G
  P --> X[Archive voids active attempts]
  D --> Z[ZIP draft only: upload and grading pending]
```

Assignments belong to ClassSession, inherited class through session. Primary manages
whole class; substitute only current effective sessions. No createdBy permanent
grant. Current source removed legacy unit-release gates: ACTIVE enrollment grants
student content access, pending cash/guest makeup does not. Completed/cancelled
class blocks writes, cancelled session blocks new work. Revoke/archive/cancel is
rechecked under Class -> Session -> Assignment -> Submission locks.

QUIZ timer optional1..240 minutes, optional absolute dueAt. Expiry is the earlier
non-null limit; both null means untimed. Start/resume cannot reset clock or consume
a second attempt. Autosave replaces selected answers with expectedVersion and
UUID key; never returns correctness. Manual submit requires every question exactly
once; final payload is authoritative. BE computes score with integer cents and
commits immutable result/answers/audit/receipt in one transaction, then returns
correct answers immediately under result. 33/40 ->82.50 at max100.00.

At now>=expiresAt manual payload rejected, PostgreSQL durable worker grades only
saved answers; blanks wrong. GET only observes FINALIZING until commit, then result.
Worker starts at bootstrap when ASSIGNMENT_TIMEOUT_JOB_ENABLED=true (default),
polls2s with batch20 and capped retry. Archive voids active attempts atomically;
worker rechecks active attempts every30s (or at their earlier expiry), including
untimed attempts, and voids them after enrollment revoke/session/class cancel. Graded
own results survive terminal enrollment/archive; current active account required.
No notifications/certificates/automatic unit completion changes in this slice.

Implementation choice: module-owned typed SQL and JSONB quiz snapshot/answers/result
follow existing teaching-notes style; private keys normalized separately. Audits
append only; GRADED/VOIDED submissions immutable; migration down refuses populated
history. The ZIP completion above adds the separate file/grade schema and real
assignmentSummary aggregates without changing QUIZ result persistence.

New APIs: mentor create/list/detail/draft edit/question replace/publish/archive/delete;
student published list/instructions/start/resume/save/submit/result. Each route is
specified in current API breakdown; ZIP/reporting routes now appear in section5.
Postman collection contains only implemented routes and does not auto-run mutations.

Local verification includes isolated PostgreSQL, migration clean/down-up/guard,
40-question flow, concurrent idempotent start/submit/timeout, stale/foreign answers,
rollback on audit failure, cancellation/reassignment and real compiled HTTP guards,
DTO validation and OpenAPI. Final full-gate counts are recorded in progress.
No development/production migration applied, no VPS/deploy/browser/live payment
claim. FE repositories are unchanged. ZIP/reporting local implementation is recorded above.
