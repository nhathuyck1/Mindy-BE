# Phase 5 — Assignment API: QUIZ / ZIP backend

2026-11-02 — B0–B5 implemented locally, migration1793577600000. ZIP/file features
default OFF; deployment and environment smoke are separate. The current ZIP contract
is in section5 below; earlier dated restoration entries describe previous slices.

2026-11-02 — B1 bulk ABCD implemented locally: PUT questions accepts up to 8 MiB,
uses three batch INSERTs, and returns indexed validation fields. Global JSON remains
64 KiB; attendance recovery remains 256 KiB. ZIP upload/submit/grading/reports remain
pending. This does not establish proxy/VPS deployment evidence.

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
submission queues/history/report endpoints are described in section5.
JSON is limited to64KiB except PUT mentor assignment questions (1MiB/1048576 bytes)
and POST attendance recovery (256KiB). The questions limit counts decoded HTTP-body
bytes, including UTF-8 multibyte text, JSON escapes and whitespace, independently
of the 200-question/field limits. Even valid individual fields can exceed the total
request byte budget;413 does not save any part of the set.

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
| PUT /mentor/assignments/:assignmentId/questions | expectedRevision; questions1..200 [{id? UUIDv4,prompt1..5000 nonblank,options:[{label A/B/C/D,text1..2000 nonblank}] exactly4 unique labels,correctOption A/B/C/D}]; JSON <=1MiB |200 metadata + canonical questions/server IDs/revision+1. Atomic full replacement, existing IDs must belong to this draft; omitted IDs generated. |
| POST /mentor/assignments/:assignmentId/publish | expectedRevision; preview -> publish |200 PUBLISHED/revision+1. QUIZ requires>=1 valid question/key. ZIP requires ASSIGNMENT_ZIP_ENABLED and MINIO_ENABLED; disabled503. dueAt must be future. Bound instructions must be READY. Freezes content/config; ZIP extension has its own command. |
| POST /mentor/assignments/:assignmentId/archive | expectedRevision,reason1..2000 nonblank |200 ARCHIVED/revision+1; PUBLISHED only; active attempts VOIDED, pending expiry jobs completed atomically. Graded results retained. |
| DELETE /mentor/assignments/:assignmentId | JSON body expectedRevision; discard draft |204 soft delete/revision audit. DRAFT only. |

An empty list is valid after authorization; a foreign mentor scope returns403.
Published edits return409 ASSIGNMENT_CONTENT_FROZEN; use a new draft for correction.
Archive is irreversible in v1; refetch lists/detail afterward. Creation and every
transition write append-only audits without answer content or keys.

Bulk editing/import flow: FE parses/previews text locally, then sends the complete
merged questions array. This endpoint replaces all questions; it does not append
and does not accept raw text/Quizlet input. Loading state ends at200 or an error;
no jobs/polling. Replace local IDs/order/revision with the canonical200 response.
Questions omitted from a successful replacement are removed. Existing IDs are
compared as UUIDs (case-insensitive); duplicate/foreign IDs reject the whole set.

On422 INVALID_QUIZ_QUESTIONS, map `details[0].fields` to input fields using zero-based
paths. For example:

```json
{"statusCode":422,"code":"INVALID_QUIZ_QUESTIONS","message":"invalid quiz questions","details":[{"fields":[{"path":"questions.1.options.2.text","code":"matches"}]}]}
```

DTO codes are class-validator constraint names (e.g. isString,isIn,isUuid,matches,
maxLength,arrayMaxSize,nestedValidation,whitelistValidation). Business codes are
DUPLICATE_QUESTION_ID,FOREIGN_QUESTION_ID,DISTINCT_ABCD_REQUIRED,OPTION_REQUIRED.
Unknown property names use `$unknown` in the path; error responses contain neither
rejected values nor answer keys. Missing correctOption is an error; no inference.
Keep the draft locally while fixing fields; refetch/reconcile on409 revision conflict.
On413 INVALID_JSON_BODY reduce serialized bytes before retrying. Network uncertainty
requires GET authoring detail to determine the current revision before another PUT;
this mutation uses optimistic revision protection and has no idempotency receipt.

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
|503 ASSIGNMENT_ZIP_DISABLED / ASSIGNMENT_STORAGE_UNAVAILABLE|Feature/storage unavailable; preserve local work, retry only after availability changes.|
|422 INVALID_ASSIGNMENT_CONFIG / INVALID_ASSIGNMENT_DEADLINE / INVALID_QUIZ_QUESTIONS / QUIZ_QUESTIONS_REQUIRED / ASSIGNMENT_TYPE_MISMATCH|Correct input/configuration; do not retry unchanged body.|
|422 IDEMPOTENCY_KEY_REQUIRED / INVALID_QUIZ_ANSWERS / SUBMISSION_INCOMPLETE|Supply UUID key/valid distinct answers/all required answers.|
|400 path UUID /422 global DTO validation|Correct request fields; unexpected score/key injection is rejected.|
|400 INVALID_JSON_BODY|Fix malformed JSON; no replacement committed.|
|413 INVALID_JSON_BODY|Reduce JSON bytes; questions PUT 1MiB, attendance recovery 256KiB, global 64KiB. Do not retry unchanged body.|

Error details follow existing AppHttpException array: details:[{missingQuestionIds:...}]
or details:[{resultId:...}], not a new envelope. UI distinguishes loading/empty,
saving, conflict, finalizing, graded and voided; refetch after authoring mutations.

## 5. ZIP, instruction files, grading and reporting — implemented

All mutations below require the existing cookie/role/Origin guards AND an
Idempotency-Key UUIDv4. Reuse the exact key/body after a network failure; a changed
body with the same key409 IDEMPOTENCY_KEY_REUSED. Durable receipts return the same
committed outcome. Upload receipts retain only fileId and re-sign the same live
intent after authorization; signed URLs are never stored in receipts. GETs do not
submit, grade, create jobs or alter state. Responses are private,no-store.

New writes require ASSIGNMENT_ZIP_ENABLED=true; storage mutations additionally
require MINIO_ENABLED and a private versioned bucket. Reads of own submitted history,
released grades and bound downloads remain available when the ZIP flag is OFF.
Grade/release allow a scoped current mentor to grade submitted history even when the
source class/session has closed; createdBy never grants permanent access.

IDs below: assignmentId comes from existing create/list/get; submissionId comes
from ZIP draft/history; fileId comes from upload intent. A file version is distinct
from the submission version, assignment revision and grade version.

| Method + route after /api/v1 | Input / FE step | Success / effects |
|---|---|---|
| POST /mentor/assignments/:id/instruction-upload-intents | expectedRevision,originalFilename,declaredMimeType,declaredSizeBytes; current mentor, assignment DRAFT |201 upload intent. PDF/DOCX/PNG/JPEG only, <=25MiB each. |
| PUT /mentor/assignments/:id/instruction-files | expectedRevision,fileIds[] ordered0..5; own READY files from this assignment |200 {revision,instructionFiles}; replace all in tx, revision+1/audit. Empty array removes all while DRAFT. |
| POST /mentor/assignments/:id/extend | expectedRevision,reason1..2000 nonblank,dueAt? ISO with timezone,maxAttempts?1..10 |200 {revision,dueAt,maxAttempts}; published ZIP only, no decreases, at least one strict increase; existing submission snapshots unchanged. |
| POST /me/assignments/:id/zip-submissions | expectedAssignmentRevision>=1; ACTIVE own enrollment, class writable, published ZIP, DB now<dueAt |201 ZIP draft (create or resume), version1 on create. One open DRAFT per student/assignment. No attempt consumed. |
| POST /me/zip-submissions/:id/upload-intents | expectedVersion (submission),originalFilename,declaredMimeType="application/zip",declaredSizeBytes1..20971520 |201 scoped upload intent; owner/assignment/enrollment/storage keys server-derived. |
| POST /assignment-files/:id/complete | expectedVersion (FILE version); owner and current source permission |200 PROCESSING, file version+1, pins staging object version and inserts one durable validation job. Does not attach or submit. |
| GET /assignment-files/:id | owner/scoped binding/history authorization |200 id,status,version,purpose,originalFilename,mimeType,sizeBytes,errorCode. No storage locator. |
| GET /assignment-files/:id/download | own draft or bound submitted history; currently scoped mentor; student instructions require current assignment access or own submitted snapshot |200 {url,expiresAt}; 60s private attachment URL, recheck scope/binding after signing. Issued URL remains valid until TTL. |
| PUT /me/zip-submissions/:id/file | expectedVersion (submission),fileId; one own READY ZIP from the same draft |200 ZIP view, submission version+1; replaces previous draft file, no attempt consumed. |
| POST /me/zip-submissions/:id/submit | expectedVersion (submission); one READY bound verified version |200 SUBMITTED, version+1, next attemptNumber allocated1..maxAttempts; immutable title/description/maxScore/dueAt/instruction snapshot, audit+receipt in same commit. DB time rechecked in final UPDATE. |
| GET /me/zip-submissions/:id | own current draft or retained history with ACTIVE account |200 student ZIP view; released grade only, grade:null until release; no gradeVersion/releasedVersion/private draft feedback. |
| GET /mentor/zip-submissions/:id | current primary/scoped substitute; submitted only |200 mentor ZIP view plus gradeVersion (0 before first grade),releasedVersion nullable; grade is current mentor draft revision. |
| PUT /mentor/zip-submissions/:id/grade | expectedVersion (GRADE,0 on first save),score decimal string0..snapshot.maxScore with<=2 fractional digits,feedback<=10000,reason?<=2000 |200 mentor ZIP view. New immutable grade revision; any correction requires nonblank reason. Old released grade remains visible to student. |
| POST /mentor/zip-submissions/:id/grade/release | expectedVersion (GRADE),gradeVersion; both must equal current grade revision>=1 |200 mentor ZIP view; stale/already released409. Exact replay returns original outcome. |
| GET /mentor/zip-submissions/:id/grade/history | page,pageSize (defaults1/20,max100) |200 {items,total,audits,totalAudits,page,pageSize}. Revisions version DESC; audits GRADE/RELEASE createdAt DESC,id; each list paginated independently by the same page options. |
| GET /me/assignments/:id/submissions | page/pageSize,attemptNumber?,status? SUBMITTED/RELEASED |200 discriminated QUIZ/ZIP history, newest submittedAt DESC,id. All submitted attempts retained; new draft does not replace current result. Other grade-state filters422 to prevent draft-grade inference. |
| GET /mentor/assignments/:id/submissions | page/pageSize,studentId?,attemptNumber?,history? string true/false,status? SUBMITTED/UNGRADED/GRADED/RELEASED/UNRELEASED |200 page; latest submitted per student by default, history=true exposes older attempts. GRADED includes released; UNRELEASED includes pending corrections. No drafts in queue. |
| GET /mentor/assignments/:id/roster | page/pageSize,studentId? |200 {items,total,page,pageSize,denominator:"CURRENT_ACTIVE_ENTITLEMENTS"}; studentId,enrollmentId,displayName,submissionId nullable,submitted/graded/released/missing booleans. |
| GET /mentor/classes/:id/assignment-metrics | type? QUIZ/ZIP,purpose? TEST/HOMEWORK,sessionId?; current mentor scope |200 assignment/student-pair counts described below; substitute session scope applied before aggregating. |

Upload declaration example for an open submission at version1:

```json
{"expectedVersion":1,"originalFilename":"solution.zip","declaredMimeType":"application/zip","declaredSizeBytes":2048}
```

Upload response adds fileId,uploadUrl,requiredHeaders{"content-type":...},
uploadUrlExpiresAt (<=300s),intentExpiresAt (15min), and file status/version1.
PUT raw bytes to uploadUrl with requiredHeaders (storage call, no BE cookie).
POST complete using FILE expectedVersion1; poll GET file every2s until READY/FAILED,
stop automatic polling after60s and allow refresh. Worker continues independently.
READY is not submitted. Attach file using SUBMISSION expectedVersion1, then submit
using returned submission version2. Stop polling on401/403/404; fix FAILED input by
creating a new intent. Uploading before the deadline never reserves a submission.

ZIP view: type="ZIP",id,assignmentId,studentId,status DRAFT/SUBMITTED/VOIDED,version,
attemptNumber nullable until submit,submittedAt nullable,snapshot nullable,file nullable,
grade nullable. Snapshot contains title,description,maxScore,dueAt,instructionFiles.
file contains id,originalFilename,mimeType,sizeBytes; no object keys/version locator.
Student grade contains only released version,score,feedback; mentor additionally gets
gradeVersion and releasedVersion and sees current draft grade. History QUIZ items
contain type="QUIZ",id,assignmentId,studentId,attemptNumber,submittedAt,status="GRADED",
result (existing QuizResultDto unchanged),instructionFiles. A latest ungraded/unreleased
ZIP result is pending even when an older attempt has a released grade.

Assignment metadata now includes instructionFiles and capabilities
{zipMutationsEnabled,instructionFilesEnabled}. Capabilities describe feature/storage
configuration; access, lifecycle, deadline and versions are always enforced by commands.
Instruction bindings freeze at publish for QUIZ and ZIP. Own graded QUIZ history also
permits downloading the immutable bound instructions after source/enrollment closure.

Metrics: assignments = nondeleted PUBLISHED/ARCHIVED assignments in scope; eligible =
current ACTIVE account/enrollment + writable class + noncancelled session + PUBLISHED
assignment student pairs; submitted = latest valid submitted ZIP or graded QUIZ pair,
including terminal enrollment history; missing = eligible pairs with dueAt<=DB now and
no submitted attempt. No historical eligibility is inferred. ungraded = submitted
without any grade; unreleased = current grade version newer than released (including
corrections); released = a public grade exists. A pending correction can count in both
unreleased and released. Drafts and extra attempts never inflate student counts.
`denominator="CURRENT_ACTIVE_ASSIGNMENT_STUDENT_PAIRS"`,
historyIncludesTerminalEnrollments=true,missingIsHistorical=false document this choice.
Primary mentor stored-progress endpoints now expose assignmentSummary
{availability:"AVAILABLE",counts:{assignments,eligible,submitted,missing,ungraded,unreleased,released}}
through the assignment-owned public read participant, within the same read snapshot.
No unit completion, certificate, completionPolicy or attendance rule is inferred.

ZIP errors:404 FILE_SCOPE_MISMATCH/ASSIGNMENT_FILE_NOT_FOUND for foreign IDs;
409 FILE_NOT_READY/SUBMISSION_ALREADY_SUBMITTED/ATTEMPT_LIMIT_REACHED/
GRADE_VERSION_CONFLICT/ASSIGNMENT_UPLOAD_EXPIRED for state conflicts; refetch before
retry, do not overwrite automatically.422 INVALID_ASSIGNMENT_FILE/
ASSIGNMENT_FILE_SIZE_MISMATCH/INVALID_GRADE_SCORE/GRADE_CORRECTION_REASON_REQUIRED/
INVALID_SUBMISSION_FILTER for invalid input.429 ASSIGNMENT_UPLOAD_LIMIT_REACHED:
max10 live pending/processing intents per owner,50 new intents/hour per owner,
500 live intents per assignment; stop repeated intent creation. FAILED file errorCode
ZIP_INVALID/ZIP_LIMIT_EXCEEDED/ASSIGNMENT_FILE_INVALID/FILE_ACCESS_REVOKED or
JOB_ATTEMPTS_EXHAUSTED is safe to display; never render raw parser errors.

Migration1793577600000 adds isolated ZIP/file/grade/receipt/job tables and DB guards;
it does not alter QUIZ persistence. New writes lock actor -> class -> session ->
assignment -> enrollment/submission -> file/grade; storage IO is outside transactions.
Archive voids ZIP drafts atomically; worker durably voids drafts after source/account/
enrollment revocation. Submission and grade revisions/audits/snapshots are immutable.
Down refuses file/submission/audit data; roll back app/flag and retain schema/history.
See [ZIP rollout/worker runbook](../core/ASSIGNMENT_ZIP_RUNBOOK.md).

Verification: domain rules, isolated PostgreSQL migration up/down, concurrent
start/submit/timeout, audit-failure rollback, cancellation/reassignment and compiled
HTTP cookie/Origin/DTO/OpenAPI/40-question journey. Final gate results live in
[Progress](../progress/phase%205/PHASE_5_PROGRESS.md). No FE changes or VPS evidence.

Bulk rollout: see [reverse proxy runbook](../core/VPS_DEPLOYMENT.md#3-reverse-proxy).
The repository has no active Nginx/Caddy config to apply or verify. Ensure upstream
body limits permit 1MiB on this route before rollout (standard reverse proxy default);
upstream 413 can have a different error body. App-level boundaries are verified directly
against compiled HTTP locally.
