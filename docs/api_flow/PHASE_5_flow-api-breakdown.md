# Phase 5 — API proposal assignment QUIZ/ZIP

2026-10-22 · **PLANNED, chưa route/DTO/migration runtime**.
[Plan](../implement_phase/phase%205/PHASE_5_ASSIGNMENTS.md) · [Flow](PHASE_5_FLOW.md).
Assignment là bài kiểm tra hoặc BTVN (`purpose=TEST|HOMEWORK`), khác hình thức
`type=QUIZ|ZIP`. QUIZ có timer phút tùy chọn; ZIP có deadline ngày giờ bắt buộc.

## 1. Contract đề xuất dùng chung

Prefix `/api/v1`, cookie access_token, active actor. Mentor scope primary toàn lớp
hoặc substitute đúng session, resolve provider Phase4.6; student own enrollment
ACTIVE + unit released/class writable cho start/draft/upload/submit. Own submitted
history/result giữ theo ownership/retention kể cả enrollment terminal; không mở
class content qua result. API trả typed DTO, không entity. Giữ envelope hệ thống;
JSON bên dưới chỉ payload. Cache-Control private,no-store; UTC ISO có offset trong
request, serverNow/timeZone trong timer/detail; FE dùng APP_TIME_ZONE để date picker.

UUIDv4 mọi path ID, unexpected body field reject422. Page1/pageSize20 (1..100),
stable sort dueAt/id hoặc position/id. Mutation state cần `expectedVersion`/revision
và UUIDv4 Idempotency-Key; receipt atomic với outcome, retry same key/body, hash
mismatch409. Read/filter trước pagination/count, empty vẫn authorize. Create201,
GET/PATCH/PUT/action POST200, draft delete204. Mutations dùng Origin guard baseline.
No hidden answer keys trong student DTO, draft validation lỗi, receipt public hay logs.

## 2. Mentor soạn và giao assignment

| Method + route | FE step / inputs | Payload/side effect dự kiến |
|---|---|---|
| POST `/mentor/class-sessions/:sessionId/assignments` | Trong buổi → tạo bài. Body purpose,type,title,description?,maxScore; ZIP dueAt bắt buộc/maxAttempts1..10 default1; QUIZ timeLimitMinutes null hoặc1..240,dueAt optional/maxAttempts cố định1 |201 assignment DRAFT/revision1. Creator audit, không student-visible. |
| GET `/mentor/class-sessions/:sessionId/assignments` | Tab bài của buổi; page/pageSize,status?,type?,purpose? |200 page AssignmentMentorDto, có counts/quyền, không toàn bài nộp inline. |
| GET `/mentor/classes/:classId/assignments` | Dashboard lớp; cùng filters, sessionId? UUID thuộc lớp |200 page scoped; substitute chỉ own sessions. |
| GET `/mentor/assignments/:assignmentId` | Edit/preview; ID từ list |200 full authoring detail; QUIZ gồm key đúng scope, ZIP dueAt; no student submissions. |
| PATCH `/mentor/assignments/:assignmentId` | Save draft, body expectedRevision + allowed changes |200 revision+1. Published chỉ ZIP dueAt tăng/maxAttempts tăng + reason; đề/key/QUIZ timer frozen. |
| PUT `/mentor/assignments/:assignmentId/questions` | QUIZ soạn câu hỏi; expectedRevision, questions1..200 [{id? UUID,prompt,options:[{label,text}] đủ4,correctOption}] |200 atomic replace draft set, stable IDs assigned/returned server. No per-question Student grade API. |
| POST `/mentor/assignments/:assignmentId/publish` | Preview → Giao bài; expectedRevision |200 PUBLISHED; QUIZ đủ4 options/1 key mỗi câu, timer config hợp lệ; ZIP deadline tương lai. |
| POST `/mentor/assignments/:assignmentId/archive` | Đóng bài; expectedRevision,reason1..2000 |200 ARCHIVED, active quiz attempts VOIDED dưới locks; giữ submitted result, không delete. |
| DELETE `/mentor/assignments/:assignmentId` | Draft chưa có attempts; body expectedRevision |204 soft delete. Published/started409. |

Một phiên bản draft questions tối đa200 prompt≤5000/options text≤2000; request JSON
body cap đề xuất2MiB, phải set route limit rõ khi code (không nới global material).
maxScore decimal string0.01..999999.99. description plain text≤20000. QUIZ timer
toggle map null=off, integer=on; ZIP timeLimitMinutes phải null, dueAt có offset
bắt buộc. QUIZ dueAt nếu đặt phải còn tương lai khi publish/start.

Ví dụ tạo quiz theo user flow:

```json
{"purpose":"TEST","type":"QUIZ","title":"Kiểm tra chương 1","description":"Chọn một đáp án mỗi câu.","maxScore":"100.00","timeLimitMinutes":45,"dueAt":null}
```

Ví dụ bài ZIP:

```json
{"purpose":"HOMEWORK","type":"ZIP","title":"Nộp project","maxScore":"10.00","dueAt":"2026-10-29T23:59:00+07:00","maxAttempts":1}
```

FE lấy sessionId từ workspace4.6, create rồi questions/save rồi publish. Sau mỗi
mutation refetch detail/list/revision;403 stop/refetch scope,409 không overwrite,
422 field errors/publish validation. No approve-material dependency cho bài theo lớp.

## 3. Student discovery và bắt đầu QUIZ

| Method + route | Inputs / FE step | Response dự kiến |
|---|---|---|
| GET `/me/classes/:classId/assignments` | page/pageSize,sessionId?,type?,purpose?,status? learning state |200 page **published visible only**, metadata title,type,purpose,dueAt,timeLimitMinutes,ownStatus/resultId. |
| GET `/me/assignments/:assignmentId` | Mở bài |200 metadata/instructions/capabilities. QUIZ chưa start không trả questions; ZIP instructions/deadline và own draft. No keys/grades draft. |
| POST `/me/assignments/:assignmentId/start` | QUIZ only; body expectedAssignmentRevision, key required |201 attempt mới hoặc200 resume same active attempt. `{attemptId,version,startedAt,expiresAt,serverNow,questions,answers,answeredCount,totalQuestions}`; không đáp án đúng. |
| GET `/me/assignment-submissions/:submissionId` | Reload/resume own attempt/draft |200 own saved answers/version, timer và same frozen questions nếu active; submitted snapshot no answer key trừ result endpoint authorized. |
| PUT `/me/assignment-submissions/:submissionId/answers` | Autosave batch QUIZ; `{expectedVersion,answers:[{questionId,selectedOption}]}`; key required |200 full replacement lựa chọn đã chọn (0..N), version+1/answeredCount/serverNow. Không score/isCorrect/correctOption. |

QuestionDto `{id,position,prompt,options:[{label:'A'|'B'|'C'|'D',text}]}`.
Mỗi câu một option, duplicate question IDs422. Lưu nháp có thể chưa chọn hết; final
POST submit phải có N câu. Start tiêu hao attempt duy nhất; resume/retry không reset
clock. Student GET key-free không dùng DTO mentor rồi xóa field bằng FE.
timeLimitMinutes null và dueAt null → expiresAt null, không worker timer. Có timer
thì expiry=min(started+minutes,dueAt nếu có), snapshot không đổi khi reload/đổi máy.

FE hiển thị progress ví dụ39/40, còn thiếu câu chưa cho nộp; countdown tính từ
serverNow/expiresAt và sync sau resume, không local timer authority. Autosave debounce,
hiển thị saved/saving/failed; final submit chặn autosave in-flight và gửi toàn bộ
answers hiện tại. Multi-tab409 refetch/resolve, không dùng expectedVersion giả.

## 4. Nộp cả bài QUIZ và trả đáp án

POST `/me/assignment-submissions/:submissionId/submit`, QUIZ body:

```json
{"expectedVersion":8,"answers":[{"questionId":"11111111-1111-4111-8111-111111111111","selectedOption":"B"}]}
```

Ví dụ body chỉ minh họa một phần tử; đề40 câu phải gửi đủ40 phần tử khác nhau.
Required UUID key. BE now<expiresAt nếu có, kiểm đúng frozen question set, đủN
options hợp lệ và ownership/eligibility; server mới tính. HTTP200 payload:

```json
{"submissionId":"22222222-2222-4222-8222-222222222222","status":"GRADED","submissionSource":"MANUAL","totalQuestions":40,"answeredCount":40,"correctCount":33,"wrongCount":7,"score":"82.50","maxScore":"100.00","resultUrl":"/api/v1/me/assignment-submissions/22222222-2222-4222-8222-222222222222/result","results":[{"questionId":"11111111-1111-4111-8111-111111111111","selectedOption":"B","correctOption":"A","isCorrect":false}]}
```

results phải đủ40 khi implementation; example rút gọn để minh họa shape.
BE cùng tx lưu immutable answers/snapshot/result/auto released grade/audit/receipt.
Không gọi mỗi câu để chấm, không tin score/isCorrect/client timestamps. Score câu
đồng trọng số, round decimal2 sau tổng. Student được xem đáp án ngay sau submit
thành công theo user requirement. QUIZ v1 maxAttempts1, không thi lại sau xem key.

GET `/me/assignment-submissions/:submissionId/result`:200 own durable result như
trên, bao gồm question/option snapshot để UI render history; DRAFT/IN_PROGRESS409
`RESULT_NOT_AVAILABLE`, không key. Timed expired chưa worker commit trả200
`{status:'FINALIZING',result:null,retryAfterSeconds:2}`. Timer expiry finalizer dùng
**chỉ saved answers trước hạn**, missing selectedOption=null/isCorrect=false;
điểm và đáp án trả sau finalization. Không yêu cầu đủ40 cho timeout (chỉ manual).

No late manual overrides: now>=expiresAt →409 `ATTEMPT_EXPIRED`/resultUrl, body
không được persist. Durable worker finalize độc lập browser, restart recover jobs,
manual vs worker cùng lock chỉ một winner. GET không write. Retry committed manual
submit cùng key sau hạn trả receipt cũ; GET result không tạo attempt/grade mới.
Nếu tab mất mạng trước save, UI báo rõ các câu chưa lưu có thể không được chấm khi
hết giờ; final payload trước hạn vẫn có thể ghi và chấm atomically.

GET `/me/assignments/:assignmentId/submissions`:200 page own attempt history;
foreign assignment404. Primary/substitute scoped có mentor result route ở §6,
không reuse student route bằng studentId input.

## 5. ZIP: draft, upload và deadline ngày giờ

| Method + route | Request / thứ tự | Response/state |
|---|---|---|
| POST `/me/assignments/:assignmentId/submissions` | ZIP only; body expectedAssignmentRevision, key |201 own DRAFT/version1, existing active draft409(existingDraftId); không có timer. |
| POST `/me/assignment-submissions/:submissionId/upload-intents` | expectedVersion,originalFilename .zip,declaredSizeBytes,declaredMimeType; key |201 fileId/uploadUrl/expiresAt. Scoped student intent, chưa attach/submit. |
| POST `/me/assignment-submissions/:submissionId/files/:fileId/complete` | key, expectedVersion theo submission context |200/202 Files pipeline state; kiểm scope/deadline; promotion/scan async. |
| GET `/me/assignment-submissions/:submissionId/files/:fileId` | Poll authorized intent trạng thái |200 PENDING_UPLOAD/PROCESSING/READY/FAILED, safe errorCode; no storage secrets. |
| PUT `/me/assignment-submissions/:submissionId/files` | `{expectedVersion,fileIds:[UUID]}`, đúng1 READY ZIP, key |200 attached file summary/version+1. Wrong owner/purpose422/403; submit chưa xảy ra. |
| POST `/me/assignment-submissions/:submissionId/submit` | ZIP body `{expectedVersion}`, key; no answers |200 SUBMITTED immutable, server submittedAt/deadline snapshot; ngay tại now>=dueAt409, không nhận late. |
| POST `/me/assignment-submissions/:submissionId/files/:fileId/access` | Own submitted history hoặc mentor route riêng, expectedVersion, purpose download |200 `{url,expiresAt,filename}` no-store; file attached/current. Không cache signed URL trong receipt. |

Upload PUT bytes tới **object storage**, không POST file bytes vào JSON API; upload
intent expiry khác dueAt. Uploaded/READY trước dueAt không cho submit muộn. No
timeLimitMinutes ZIP. UI show exact deadline theo zone, disable submit khi pending
validation; check server vẫn là quyết định. Poll bounded theo intent expiry, dừng
READY/FAILED/403/expiry. FAILED yêu cầu upload mới; không retry submit vô hạn.

Giới hạn đề xuất ZIP1 file≤20MiB, expanded≤100MiB, entries≤1000, ratio≤100; reject
encrypted/nested/traversal/symlink/bomb/invalid ZIP. Files purpose/scope mới chỉ cho
assignment submission, không mở student material upload; source code không execute.
Files capability/policy/migration + scanner là prerequisite A3, không coi ZIP usable
chỉ vì thêm extension .zip vào allowlist. File access signing sau live permission và
revalidate, không network trong DB mutation tx.

## 6. Mentor nhận bài/chấm ZIP và đọc quiz results

| Method + route | Input / FE step | Result/transition |
|---|---|---|
| GET `/mentor/assignments/:assignmentId/submissions` | page/pageSize,status?,studentId? scoped |200 page attempts summary, không đáp án/zip bytes inline. |
| GET `/mentor/assignments/:assignmentId/roster` | page/pageSize, filter ALL/MISSING/UNSUBMITTED/UNGRADED |200 per eligible enrollment, latest attempt/result state. Không gán MISSING trước due; không late filter v1. |
| GET `/mentor/assignment-submissions/:submissionId` | ID từ queue |200 scoped submitted snapshot, QUIZ graded result hoặc ZIP file summary/grade revisions; no contact/payment. |
| POST `/mentor/assignment-submissions/:submissionId/files/:fileId/access` | expectedVersion; download button |200 short-lived signed ZIP URL sau current scope/attached validation. |
| PUT `/mentor/assignment-submissions/:submissionId/grade` | ZIP SUBMITTED/GRADED; `{expectedGradeVersion,score,feedback,reason?}`, key |200 grade draft revision+1, score0..maxScore; correction sau released reason required. Student vẫn thấy released trước. |
| POST `/mentor/assignment-submissions/:submissionId/grade/release` | `{expectedGradeVersion}`, key |200 released grade version, submission GRADED; atomic score+feedback publish. |

Grade expectedGradeVersion là grade version (0 khi chưa có), khác submission version.
QUIZ auto
grade không qua PUT grade/release manual v1; nếu sai key cần explicit correction
feature v2, không sửa key silent chấm lại history.
Feedback≤10000 plain text; score chuỗi decimal≤2 lẻ, không NaN/Infinity. Draft grade
không lộ student. File retry/access authorization và grade correction có audit.
Sau save/release refetch queue/detail và Student result (khi mở lại), không gửi email
hoặc websocket nếu chưa có notification implementation.

## 7. Errors và xử lý FE đề xuất

| HTTP / code dự kiến | Cách xử lý |
|---|---|
|401 auth|Refresh theo flow hiện có, failed về login; không reset timer.|
|403 ASSIGNMENT_SCOPE_REQUIRED / SUBMISSION_ACCESS_DENIED|Dừng retry, refetch scope; không lộ foreign content/key.|
|404 ASSIGNMENT_NOT_FOUND / SUBMISSION_NOT_FOUND|Quay list, foreign student IDs cùng404.|
|409 ASSIGNMENT_VERSION_CONFLICT / SUBMISSION_VERSION_CONFLICT|Refetch; không tự ghi đè answers hoặc đề.|
|409 ASSIGNMENT_CLOSED / ASSIGNMENT_DEADLINE_PASSED|Dừng submit/upload, hiển thị archive/deadline, history vẫn đúng quyền.|
|409 ATTEMPT_EXPIRED|Mở result/poll FINALIZING bounded; không gửi lựa chọn mới sau hạn.|
|409 ATTEMPT_LIMIT_REACHED / ALREADY_SUBMITTED|Mở result/history; không tự tạo lượt mới.|
|409 RESULT_NOT_AVAILABLE|Chưa nộp thì quay attempt; expired FINALIZING không trả key, theo result state.|
|409 IDEMPOTENCY_KEY_REUSED|Giữ payload của retry; intent khác dùng key mới khi còn đủ quyền.|
|422 SUBMISSION_INCOMPLETE|Chỉ missing IDs/count; quay câu chưa chọn, không gợi ý key.|
|422 QUIZ_ANSWER_INVALID / QUIZ_QUESTIONS_INVALID|Chỉ field/ancestry errors, không answer key.|
|409 FILE_NOT_READY / 422 ZIP_INVALID, ZIP_LIMIT_EXCEEDED|Chờ pipeline bounded hoặc upload mới theo error; không submit file quarantine.|
|409 GRADE_VERSION_CONFLICT / 422 GRADE_INVALID|Refetch grade, sửa score/feedback; không tự overwrite grader khác.|
|503 storage unavailable|Metadata/result QUIZ độc lập; ZIP upload/access báo tạm lỗi, retry bounded.|

Codes trên là proposal; khi code phải map với exception existing cho401/422/files,
không tạo wrapper/error shape khác. Empty eligible roster/list/saved answers là
trạng thái hợp lệ; loading/saving/finalizing/graded phân biệt. Không chấm hoặc tính
score ở FE như nguồn kết quả chính thức.

## 8. Handoff/gates

Mỗi route cần DTO/validation/role/origin/ownership tests, OpenAPI/Postman cùng source.
Critical40-question test + timeout (timer off/on, exact boundary, reload, worker
restart, autosave/submit race), ZIP scanner/MinIO/purpose isolation, grade release
history và migration rehearsal. pnpm lint/type-check/test/build + compiled HTTP.
Timer worker/config/health phải triển khai cùng QUIZ timer; không chỉ frontend clock.
Chưa có runtime/deploy evidence trong lượt planning này, không sửa repo FE.
