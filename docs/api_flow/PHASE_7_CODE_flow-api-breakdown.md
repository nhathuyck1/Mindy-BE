# Phase 7 — CODE assignment API: mentor authoring + student run/submit/judge implemented locally

2026-11-02 · Working tree `dev` (uncommitted). Local implementation only; no VPS/deployment evidence.
[Plan](../implement_phase/phase%207/PHASE_7_CODE_ASSIGNMENTS.md) · [Flow](PHASE_7_CODE_FLOW.md) · [Progress](../progress/phase%207/PHASE_7_CODE_PROGRESS.md).

Integration 02/11/2026: ZIP and Whiteboard runtime remain registered; CODE is additive.
Whiteboard keeps its [existing contract](PHASE_7_flow-api-breakdown.md). Apply the full
migration catalog, including CODE and ZIP, before using the combined assignment reports.

## 1. Shared contract

Prefix `/api/v1`, HttpOnly `access_token` cookie, MENTOR role for `/mentor`. Mutations need `Origin` in `CORS_ORIGINS`
(RequestOriginGuard). Scope = Phase 5 rules: primary mentor of the class or the effective substitute of the session.
Every authoring mutation takes `expectedRevision` and bumps `assignments.revision` (409 `ASSIGNMENT_VERSION_CONFLICT` when stale,
409 `ASSIGNMENT_CONTENT_FROZEN` after publish). CODE routes accept JSON bodies up to 256 KB (default 64 KB elsewhere).

## 2. Routes

| Status | Method | Route | Notes |
| --- | --- | --- | --- |
| Implemented (local) | POST | `/mentor/class-sessions/:sessionId/assignments` | `type=CODE`: `dueAt` required, no `timeLimitMinutes`, `maxAttempts` 1..50 (default 10) |
| Implemented (local) | GET | `/mentor/code-languages` | `[{key,displayName,runtimeVersion,editorMode}]` — `javascript`, `java21` |
| Implemented (local) | POST | `/mentor/code-signatures/preview` | `{signature}` → `{javascript, java21}` starter code |
| Implemented (local) | GET | `/mentor/assignments/:id/code` | `MentorCodeAuthoringDto` incl. HIDDEN tests, references, `validatedRevision`, `publishBlockers` |
| Implemented (local) | PUT | `/mentor/assignments/:id/code-problem` | statement, constraints, difficulty, signature, compareMode/floatEpsilon, scoringMode, cpuTimeLimitMs, memoryLimitMb |
| Implemented (local) | PUT | `/mentor/assignments/:id/code-languages` | `{languages:[{languageKey, starterCode?}]}`; omitted starter = generated |
| Implemented (local) | GET | `/mentor/code-library?page&pageSize&q` | CODE assignments **created by this mentor** (any class), newest first: title, status, class code, session, testCount, languages |
| Implemented (local) | POST | `/mentor/assignments/:id/code-import` | `{expectedRevision, sourceAssignmentId}` → copies problem, languages, tests, references into this DRAFT (replaces content); validation never copied. Source must be own work or within the mentor's scope |
| Implemented (local) | POST | `/mentor/assignments/:id/code-tests/generate` | `{languageKey, sourceCode, inputs: inputArgs[] (1..30)}` → runs the (unsaved) reference via runner (`interactive`) → `{compileStatus, compileOutput, outputs:[{index,status,expected,console,stderr,timeMs,memoryKb}]}`; `status=OK` means `expected` is the reference return value. Nothing stored |
| Implemented (local) | PUT | `/mentor/assignments/:id/code-tests` | `{expectedRevision, tests:[{visibility,inputArgs,expected,weight?,explanationMd?}] (1..30)}` replaces the whole table in one revision; errors carry `details[0].position` |
| Implemented (local) | PUT / DELETE | `/mentor/assignments/:id/code-tests/:position` | position 1..30; `{visibility, inputArgs, expected, weight?, explanationMd?}` |
| Implemented (local) | PUT | `/mentor/assignments/:id/code-reference/:languageKey` | `{sourceCode}` (≤ 64 KiB) |
| Implemented (local) | POST | `/mentor/assignments/:id/code-validate` | runs references on all tests via compiler-runner → `{validated, revision, results}` |
| Implemented (local) | POST | `/mentor/assignments/:id/publish` | CODE requires `publishBlockers = []` |
| Implemented (local) | POST | `/mentor/assignments/:id/code-extension` | published only; `{dueAt?, maxAttempts?, reason}` forward-only |
| Implemented (local) | POST | `/mentor/assignments/:id/archive` | also voids QUEUED/RUNNING code submissions |
| Implemented (local) | GET | `/me/assignments/:id/code` | STUDENT, ACTIVE enrollment, PUBLISHED: problem, samples, languages+starter, attempts, best score, `canSubmit` |
| Implemented (local) | GET/PUT | `/me/assignments/:id/code-drafts/:languageKey` | `{sourceCode, expectedVersion}`; 409 `CODE_DRAFT_VERSION_CONFLICT` |
| Implemented (local) | POST | `/me/assignments/:id/code-runs` | `{languageKey, sourceCode, customArgs?}` → `CodeRunResultDto`; not stored; 429 `CODE_RUN_RATE_LIMITED` |
| Implemented (local) | POST | `/me/assignments/:id/code-submissions` | `Idempotency-Key` (UUIDv4) required; 202 created / 200 replay |
| Implemented (local) | GET | `/me/assignments/:id/code-submissions` | own history, newest first (readable after archive) |
| Implemented (local) | GET | `/me/code-submissions/:id` | own detail; HIDDEN tests: position/status/time/memory only; `retryAfterMs` while pending |
| Implemented (local) | socket | `code_submission.updated` | `{submissionId, assignmentId, status}`; Phase 6 Socket.IO, only when `CHAT_ENABLED` |
| Implemented (local) C4 | GET/POST | `/mentor/assignments/:id/code-summary`, `/code-submissions`, `/mentor/code-submissions/:id(/rejudge,/void)` | |

## 3. Errors (new)

422: `CODE_SIGNATURE_INVALID`, `CODE_TEST_TYPE_MISMATCH` (details `{field,param}` or `{positions}` — never test values),
`CODE_FLOAT_EPSILON_INVALID`, `CODE_LANGUAGE_DUPLICATE`, `CODE_LANGUAGE_NOT_ALLOWED`, `CODE_SOURCE_TOO_LARGE`,
`CODE_TEST_POSITION_INVALID`, `CODE_TEST_TOO_LARGE`, `CODE_TEST_EXPLANATION_SAMPLE_ONLY`, `CODE_TESTS_REQUIRED`,
`CODE_REFERENCE_REQUIRED`, publish blockers (`CODE_STATEMENT_REQUIRED`, `CODE_LANGUAGES_REQUIRED`, `CODE_SAMPLE_TEST_REQUIRED`,
`CODE_HIDDEN_TEST_REQUIRED`), `CODE_ATTEMPTS_DECREASE_FORBIDDEN`, `CODE_EXTENSION_EMPTY`, `INVALID_ASSIGNMENT_DEADLINE`.
409: `CODE_PROBLEM_REQUIRED`, `CODE_REFERENCE_NOT_VALIDATED`. Wizard (02/11): 422 `CODE_IMPORT_SELF`, `CODE_IMPORT_SOURCE_EMPTY`, `ASSIGNMENT_TYPE_MISMATCH`; generate output statuses `NO_RESULT`, `INVALID_RETURN` (not errors). 404: `CODE_TEST_NOT_FOUND`.
429: `CODE_RUNNER_BUSY` (`details[0].retryAfterSeconds`), `CODE_RUN_RATE_LIMITED` (`details[0].scope`, `retryAfterSeconds`).
503: `CODE_RUNNER_UNAVAILABLE`. Student (C3): 422 `CODE_CUSTOM_INPUT_INVALID`, `IDEMPOTENCY_KEY_REQUIRED`;
409 `ASSIGNMENT_DEADLINE_PASSED`, `ASSIGNMENT_CLOSED`, `CODE_SUBMISSION_IN_FLIGHT` (`details[0].submissionId`),
`CODE_ATTEMPTS_EXHAUSTED`, `IDEMPOTENCY_KEY_REUSED`; 404 `CODE_SUBMISSION_NOT_FOUND`.

## 4. Configuration

`CODE_RUNNER_URL` (e.g. `http://compiler-runner:4000`; empty disables validation → 503), `CODE_RUNNER_TOKEN` (= runner
`RUNNER_TOKEN`, ≥ 32 chars, required when URL set), `CODE_RUNNER_TIMEOUT_MS` (default 120000), `CODE_JUDGE_JOB_ENABLED` (default true; idles without URL),
`CODE_JUDGE_CONCURRENCY` (default 2 = runner batch slots), `CODE_RUN_PER_MINUTE` (10), `CODE_RUN_PER_DAY` (300). Mindy-BE must join the
`mindy-compiler` Docker network.

## 5. Submission lifecycle

`QUEUED` → (worker claim) `RUNNING` → `GRADED` (verdict ACCEPTED/PARTIAL/WRONG_ANSWER/TIME_LIMIT/MEMORY_LIMIT/RUNTIME_ERROR/OUTPUT_LIMIT,
or COMPILE_ERROR with `countsAsAttempt=false`). Runner busy → back to `QUEUED` (no failure counted). Infrastructure failure ×5 →
`FAILED` (not counted; mentor rejudge in C4). Archive / inactive enrollment → `VOIDED` (system reason). Mentor void (C4) → `VOIDED`
(still counted). Score of the assignment = best `GRADED` score (ties: earliest).

## 6. Authoring rule: reference solution (D11, clarified 02/11/2026)

At least **one** reference solution is required. Expected outputs are produced from it (`code-tests/generate`), so they are never
hand-computed. Publishing requires that every saved reference passes every test at the current revision (`code-validate`).
Other enabled languages may have no reference; when one exists it is validated too.

## 7. Combined reports — integration 02/11/2026

The existing mentor class assignment metrics and `assignmentSummary` include CODE
alongside QUIZ/ZIP. Each assignment/student pair with at least one non-VOIDED code
submission counts once, including queued/running/failed work. Any surviving GRADED
attempt makes the pair graded/released; later pending or failed attempts do not hide
that result. CODE has no separate manual grade-release step. Only-VOIDED attempts
are excluded. Missing remains limited to currently eligible students after deadline.
Score selection stays in `code_assignment_scores` (highest score, earliest on ties).

Use the CODE-specific history, detail and summary routes in section 2 for code
submissions; the Phase 5 QUIZ/ZIP history payloads keep their existing contract.
No Whiteboard, ZIP upload/grading, or authentication route changes are introduced.
