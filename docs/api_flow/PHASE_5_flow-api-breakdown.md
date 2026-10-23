# Phase 5 — Assignment API: QUIZ local implementation, ZIP planned

2026-10-23 restoration: `codex/restore-phase5-assignments` restores the QUIZ
routes removed by PR #21. No new route, DTO or business-rule change beyond
PR #20; the date correction affects test fixtures only. ZIP publication remains
409 ZIP_PIPELINE_NOT_IMPLEMENTED. PR checks do not establish a VPS deployment.

CI follow-up 2026-10-23: media tool provisioning now uses the existing locked
ffprobe-static dependency instead of apt. No API/DTO/authorization change.

2026-10-22 · Branch codex/phase5-assignments. QUIZ routes below are implemented;
ZIP upload/submit/grading and reports remain planned. No VPS/deployment evidence.
[Plan](../implement_phase/phase%205/PHASE_5_ASSIGNMENTS.md) · [Flow](PHASE_5_FLOW.md) ·
[Progress](../progress/phase%205/PHASE_5_PROGRESS.md).

## 1. Shared contract

Prefix /api/v1. Login using existing /auth/login; HttpOnly access_token cookie.
MENTOR for /mentor, STUDENT for /me; account must still be ACTIVE with its current
role. Each mutation requires Origin in CORS_ORIGINS. UUIDv4 path IDs; unknown body
fields and invalid nested DTOs return422. No content/password/token in these docs.

Primary mentor manages every session of their class. Substitute only manages their
currently effective sessions (scheduled override or teaching snapshot). Reassignment
revokes authoring/key access even for createdBy. Completed/cancelled class is read
only; cancelled session blocks mutation. Student needs an ACTIVE own enrollment;
CASH_PENDING/guest makeup is insufficient. Legacy unit LOCKED/unlockAt does not gate
content in current source. New work in completed/cancelled classes is blocked.
Own submitted result survives terminal enrollment, cancelled session/class and
assignment archive; ownership/current ACTIVE account are still required.

Assignment mutations lock actor -> Class -> Session -> Assignment; attempt writes
also lock enrollment and submission. Server clock is PostgreSQL clock_timestamp().
Reads do not finalize attempts. GET/quiz mutations and mentor key detail use
Cache-Control: private, no-store. No automatic completion/certification changes.

JSON below is the response payload (existing app response/error handling retained).
Assignment metadata: id,sessionId,purpose,type,title,description,maxScore (decimal
string),dueAt (UTC ISO/null),timeLimitMinutes (int/null),maxAttempts,status,revision,
publishedAt (UTC ISO/null). Mentor detail/questions additionally include questions
with id,position,prompt,options[{label,text}],correctOption. Student metadata and
lists do not include questions or keys. Student start provides questions without
correctOption, score or isCorrect. OpenAPI has separate student metadata schemas.

Page payload: items,total,page,pageSize. Default page1/pageSize20, max100; stable
created_at DESC,id ASC; scope/filters apply before count/pagination. Growable
submission queues/history/report endpoints are not implemented in this slice.
Request JSON limit remains the existing64KiB; individual field limits do not
promise that every field can reach its maximum in a single question-set request.

## 2. Mentor authoring — implemented

IDs: classId/sessionId come from mentor workspace/session APIs. Assignment ID and
revision come from create/list/get. Re-fetch after409; never overwrite newer work.

| Method + route (after /api/v1) | Input and UI step | Success / state |
|---|---|---|
| POST /mentor/class-sessions/:sessionId/assignments | Create draft. purpose TEST/HOMEWORK; type QUIZ/ZIP; title1..250 nonblank; description optional<=20000; maxScore decimal string0.01..999999.99; dueAt optional ISO with Z/offset for QUIZ, required ZIP; timeLimitMinutes null or int1..240 for QUIZ, null ZIP; maxAttempts1 QUIZ,1..10 default1 ZIP |201 metadata, DRAFT/revision1; append audit. No idempotency receipt: reload list before recreating after uncertain network failure. |
| GET /mentor/class-sessions/:sessionId/assignments | Session tab; page,pageSize,status DRAFT/PUBLISHED/ARCHIVED?,type QUIZ/ZIP?,purpose TEST/HOMEWORK?,sessionId? |200 page metadata, no keys/submissions inline. |
| GET /mentor/classes/:classId/assignments | Class tab, same filters |200 page; substitute sessions only. |
| GET /mentor/assignments/:assignmentId | Edit/preview; ID from list |200 metadata plus questions/private correctOption; current scoped mentor only. |
| PATCH /mentor/assignments/:assignmentId | expectedRevision>=1; title?,description?,dueAt? (explicit null removes QUIZ due date),timeLimitMinutes? (null disables QUIZ timer) |200 metadata/revision+1; DRAFT only. type/purpose/maxScore/maxAttempts immutable in this slice; published edits409. |
| PUT /mentor/assignments/:assignmentId/questions | expectedRevision; questions1..200 [{id? UUIDv4,prompt1..5000 nonblank,options:[{label A/B/C/D,text1..2000 nonblank}] exactly4 unique labels,correctOption A/B/C/D}] |200 metadata + canonical questions/server IDs/revision+1. Atomic full replacement, existing IDs must belong to this draft; omitted IDs generated. |
| POST /mentor/assignments/:assignmentId/publish | expectedRevision; preview -> publish |200 PUBLISHED/revision+1. Requires QUIZ with>=1 valid question/key and optional dueAt in future. Freezes all content/config. ZIP409 ZIP_PIPELINE_NOT_IMPLEMENTED. |
| POST /mentor/assignments/:assignmentId/archive | expectedRevision,reason1..2000 nonblank |200 ARCHIVED/revision+1; PUBLISHED only; active attempts VOIDED, pending expiry jobs completed atomically. Graded results retained. |
| DELETE /mentor/assignments/:assignmentId | JSON body expectedRevision; discard draft |204 soft delete/revision audit. DRAFT only. |

An empty list is valid after authorization; a foreign mentor scope returns403.
Published edits return409 ASSIGNMENT_CONTENT_FROZEN; use a new draft for correction.
Archive is irreversible in v1; refetch lists/detail afterward. Creation and every
transition write append-only audits without answer content or keys.

## 3. Student metadata and QUIZ — implemented

Get classId from My Classes; then list -> assignmentId -> metadata -> start.
GET metadata before start deliberately has no questions. Timer may be disabled;
purpose TEST does not force a timer. Expiry=min(start+minutes,dueAt), ignoring null
limits. Both null means no expiry. Reload/tab changes never reset the server clock.

Every start/answers/submit requires Idempotency-Key UUIDv4. Reuse exact key/body for
network retry. Different body with same actor/route/key409 IDEMPOTENCY_KEY_REUSED.
Start creates201, same active attempt/resume200. Start consumes the single quiz
attempt; there is no reset/restart after grading or voiding. Keys are route scoped.

| Method + route (after /api/v1) | Input and UI step | Success / effects |
|---|---|---|
| GET /me/classes/:classId/assignments | page/pageSize,sessionId?,type?,purpose?,status? (assignment lifecycle enum) |200 metadata page, PUBLISHED only. No ownStatus/resultId aggregate yet. |
| GET /me/assignments/:assignmentId | Open instructions before starting |200 student metadata; no questions/keys. |
| POST /me/assignments/:assignmentId/start | expectedAssignmentRevision>=1, required key |201 new attempt or200 resume; returns frozen questions/saved answers/version/timer, no keys or result. |
| GET /me/assignment-submissions/:submissionId | Reload own attempt using attemptId returned by start |200 attempt payload; terminal own history readable without active enrollment. Result stays null on this route; use /result. |
| PUT /me/assignment-submissions/:submissionId/answers | expectedVersion>=1,answers0..200 [{questionId UUIDv4,selectedOption A/B/C/D}], required key |200 full replacement/version+1; no grading. Replaying save returns current state without overwriting newer answers; expired replay409. |
| POST /me/assignment-submissions/:submissionId/submit | expectedVersion, full answers array, required key; stop in-flight autosaves then submit once |200 GRADED, immutable answers/result/audit/receipt committed together. Requires exactly all distinct question IDs. Result immediately available inside result field. |
| GET /me/assignment-submissions/:submissionId/result | Open result/reload lost response |200 graded payload with result, or200 FINALIZING +result:null/retryAfterSeconds2 if expired and awaiting worker. Unsubmitted nonexpired409 RESULT_NOT_AVAILABLE. |

Attempt payload: attemptId,assignmentId,status,version,startedAt,expiresAt,
submittedAt,submissionSource (MANUAL/TIMEOUT/null),serverNow,totalQuestions,
answeredCount,questions,answers,result,retryAfterSeconds. Status IN_PROGRESS,
FINALIZING (derived read state),GRADED,VOIDED. VOIDED hides questions/answers and
has no result. result is null except successful submit, its exact replay and
GET /result after committed grading. Questions never include keys before result.

Example submit body (two-question example; real quiz must answer every question):

```json
{"expectedVersion":1,"answers":[{"questionId":"11111111-1111-4111-8111-111111111111","selectedOption":"B"},{"questionId":"22222222-2222-4222-8222-222222222222","selectedOption":"A"}]}
```

Result fields: totalQuestions,answeredCount,correctCount,wrongCount,score,maxScore,
results[{questionId,selectedOption (null when unanswered timeout),correctOption,
isCorrect}]. 33/40 at maxScore100.00 yields82.50. Equal question weights, one
round after summing using integer cents. No score/key accepted from client.
Unlike the earlier proposal, result is nested in QuizAttemptDto.result, not flat
at submit response top level; resultUrl and graderId are not response fields.

Missing manual answers422 SUBMISSION_INCOMPLETE with missingQuestionIds in error
details; selection duplicates/foreign IDs422 INVALID_QUIZ_ANSWERS. No draft writes
on failed submit. At serverNow>=expiresAt, manual payload is rejected409
ATTEMPT_EXPIRED. Durable worker grades only choices saved before expiry; unanswered
questions count wrong. No client-side grading or late answer acceptance.

Poll result every2s only while FINALIZING, stop when GRADED/VOIDED/access revoked;
stop automatic polling after60s and allow refresh. Server job continues independently
of browser/restart. Enrollment revoke/archive/cancel before timeout causes VOIDED.
ASSIGNMENT_TIMEOUT_JOB_ENABLED defaults true; disabling it pauses timeout processing
and must not be used for a live timed-quiz deployment. Active attempts also receive
durable entitlement rechecks every30s or at their earlier expiry, including untimed
quizzes, so cancellation/revocation cannot leave an immortal active draft.
Jobs use capped exponential
retry2..300s and terminal submissions are immutable at the database boundary.

## 4. Errors / FE handling — current implementation

| Status/code | Handling |
|---|---|
|401 existing auth error|Refresh/login through existing adapter; timer does not pause.|
|403 ORIGIN_NOT_ALLOWED|Use configured FE Origin; do not retry unchanged request.|
|403 ASSIGNMENT_SCOPE_REQUIRED / SUBMISSION_ACCESS_DENIED|Stop writes/key reads; refetch scope.|
|404 ASSIGNMENT_NOT_FOUND / SUBMISSION_NOT_FOUND|Unknown/foreign/unavailable student resource; return to list.|
|409 ASSIGNMENT_VERSION_CONFLICT / SUBMISSION_VERSION_CONFLICT|Refetch and reconcile; no automatic overwrite.|
|409 ASSIGNMENT_CLOSED / ASSIGNMENT_DEADLINE_PASSED / ASSIGNMENT_STATE_CONFLICT|Stop new work; retain permitted own result.|
|409 ASSIGNMENT_CONTENT_FROZEN|Published content cannot change; make a new draft.|
|409 QUIZ_ALREADY_STARTED / SUBMISSION_ALREADY_FINALIZED|Use details resultId/attemptId from start; GET own result.|
|409 ATTEMPT_EXPIRED / RESULT_NOT_AVAILABLE|Poll only expired FINALIZING; otherwise resume unfinished attempt.|
|409 IDEMPOTENCY_KEY_REUSED|Retry original key/body or use new key for a new valid mutation.|
|409 ZIP_PIPELINE_NOT_IMPLEMENTED|ZIP is draft-only; no upload UI yet.|
|422 INVALID_ASSIGNMENT_CONFIG / INVALID_ASSIGNMENT_DEADLINE / INVALID_QUIZ_QUESTIONS / QUIZ_QUESTIONS_REQUIRED / ASSIGNMENT_TYPE_MISMATCH|Correct input/configuration; do not retry unchanged body.|
|422 IDEMPOTENCY_KEY_REQUIRED / INVALID_QUIZ_ANSWERS / SUBMISSION_INCOMPLETE|Supply UUID key/valid distinct answers/all required answers.|
|400 path UUID /422 global DTO validation|Correct request fields; unexpected score/key injection is rejected.|

Error details follow existing AppHttpException array: details:[{missingQuestionIds:...}]
or details:[{resultId:...}], not a new envelope. UI distinguishes loading/empty,
saving, conflict, finalizing, graded and voided; refetch after authoring mutations.

## 5. Planned, unavailable routes and remaining work

ZIP: upload-intents,complete,status,attach,submit,download and mentor grade/release.
Mentor submissions queue/detail/roster, student attempt-history list, summary metrics
and integration into stored-progress assignmentSummary remain unavailable. Existing
assignmentSummary stays NOT_IMPLEMENTED until real class aggregation is provided.
ZIP dueAt/maxAttempts increases with audit are also deferred; all published edits
are currently frozen. No promise of grant via unit release, source execution,
weighted gradebook or certification. See original plan A3-A5 for remaining contracts.

Migration1792713600000 is additive. Apply through normal migration runner before
app rollout; do not run automatically against production from this task. Down is
allowed only with an empty assignments table; populated environments roll back app
and preserve data. Quiz result/snapshot/answers are module-owned typed SQL/JSONB,
following teaching-notes transaction style; separate ZIP grade revisions/entities
will be delivered with A3/A4. No new entity export or cross-module repository read.

Verification: domain rules, isolated PostgreSQL migration up/down, concurrent
start/submit/timeout, audit-failure rollback, cancellation/reassignment and compiled
HTTP cookie/Origin/DTO/OpenAPI/40-question journey. Final gate results live in
[Progress](../progress/phase%205/PHASE_5_PROGRESS.md). No FE changes or VPS evidence.
