# Phase 4.6 — Mentor teaching workspace: API contract

2026-10-22 · **IMPLEMENTED locally; chưa deploy VPS**.
[Plan](../implement_phase/phase%204/PHASE_4_6_MENTOR_TEACHING_WORKSPACE.md) ·
[Flow](PHASE_4_6_FLOW.md) · [Progress](../progress/phase%204/PHASE_4_6_PROGRESS.md).
Source controllers/DTO/services là contract; phần dưới thay thế proposal ngày 22/10.

## 1. Quy ước và quyền

- Prefix `/api/v1`. Cookie `access_token` từ `POST /api/v1/auth/login`; refresh theo auth flow hiện có. Actor được kiểm lại active/role trong DB. Không truyền mentorId để chọn quyền.
- GET/PUT200, GET không ghi dữ liệu; response là JSON DTO trực tiếp (không có wrapper `data`). GET workspace/notes/reports/candidates trả `Cache-Control: private, no-store`.
- ID mới UUIDv4; path sai400, body/query sai422. Page `page=1`, `pageSize=20`, tối đa100; `{items,total,page,pageSize}`, thứ tự ổn định theo ID sau sort chính.
- `from` và `to` optional nhưng phải đi cùng nhau, ISO8601 có timezone; `from<to`, tối đa93 ngày, overlap `[from,to)`. Không truyền thì toàn timetable/history, không tự giới hạn tuần. Chỉ sessions và attendance hỗ trợ range. Progress chỉ page/pageSize/unitId.
- Primary hiện tại có scope CLASS: detail, timetable, roster lớp, reports/progress. Substitute chỉ scope SESSION: shell, units có buổi mình và các session của mình. IN_PROGRESS/COMPLETED dùng teachingMentorId; SCHEDULED dùng override/primary; legacy null không tự cấp teaching credit.
- Class CANCELLED/COMPLETED có `readonly=true` trên workspace và mentor reports. Reports lịch sử vẫn đọc cho primary hiện tại. Cancellation chặn note mutations; completed không mở lại lớp, nhưng note còn trong editableUntil vẫn sửa được bởi người thực dạy.
- Assignment mặc định ANY là thay đổi có chủ đích của `GET /mentor/classes`; PRIMARY giữ khả năng lọc hành vi cũ. BOTH là primary đồng thời có explicit/historical session assignment. Không lặp class rows.
- Không có BTVN/completion command/certificate trong 4.6. Không suy % học từ điểm danh/tải file.

Lỗi JSON theo global filter, business `code` nằm trong error response hiện hữu:
401: refresh/login;403 `MENTOR_SCOPE_REQUIRED`: dừng retry, refetch assignment; material APIs giữ403 `MATERIAL_ACCESS_DENIED`;404 `CLASS_NOT_FOUND`, `CLASS_UNIT_NOT_FOUND`, `CLASS_SESSION_NOT_FOUND`, `CLASS_STUDENT_NOT_FOUND` hoặc `MATERIAL_NOT_FOUND`: về list/refetch.422 sửa input.409 refetch version/window/state, không tự ghi đè. Network/5xx: GET retry giới hạn, PUT retry đúng key/body sau khi xác minh còn quyền. Không lưu meeting/file URL vào cache bền vững.

## 2. Discovery, shell và timetable

### GET `/api/v1/mentor/classes`

MENTOR active. FE mở workspace sau auth; query `page`, `pageSize`, `status?` (ClassStatus), `assignment=PRIMARY|SUBSTITUTE|ANY` defaultANY. Mỗi row giữ ClassDto cũ (id, courseId, code/name, start/end date, deliveryMode, maxStudents/availableSeats, mentor) + `status`, `assignmentType=PRIMARY|SUBSTITUTE|BOTH`, `accessScope=CLASS|SESSION`. Không meeting/contact/payment.

Ví dụ `GET /api/v1/mentor/classes?assignment=SUBSTITUTE&page=1&pageSize=20` →200 `{items:[{id:"<classId>",assignmentType:"SUBSTITUTE",accessScope:"SESSION",...ClassDto}],total:1,page:1,pageSize:20}`. Đây là mô tả shape, không JSON literal để gửi lên BE. Empty hợp lệ; revoked actor403. Không ghi dữ liệu/idempotency key. ClassId dùng cho shell và units; assignment/filter đổi thì reset page, không polling.

### GET `/api/v1/mentor/classes/:classId`

MENTOR có assignment primary hoặc effective session. FE click list/schedule, classId từ discovery. Không query/body.200:

```json
{"id":"11111111-1111-4111-8111-111111111111","classId":"11111111-1111-4111-8111-111111111111","code":"PY-01","name":"Python","course":{"id":"22222222-2222-4222-8222-222222222222","title":"Python"},"status":"IN_PROGRESS","accessScope":"SESSION","assignmentType":"SUBSTITUTE","readonly":false,"capabilities":{"readClass":true,"readClassRoster":false,"readClassReports":false,"authorMaterials":false},"visibleUnitCount":1,"visibleSessionCount":1,"asOf":"2026-10-22T03:00:00.000Z","timeZone":"Asia/Ho_Chi_Minh"}
```

Counts được scope trước aggregate. **Không inline units/sessions** để tránh danh sách không giới hạn; FE gọi units và sessions riêng. Không có class-wide meetingUrl. Primary có thể xem toàn timetable nhưng từng session phải authorize riêng khi vào context/start/note. Empty timetable vẫn authorize shell. Không assignment403, foreign class404. Loading skeleton; không coi403 là empty. Không side effects; refetch khi phân công thay đổi.

### GET `/api/v1/mentor/classes/:classId/sessions`

MENTOR assigned; query page/pageSize + `unitId?` UUIDv4 + paired from/to. Path classId luôn là authoritative. Ví dụ `...?unitId=<unitId>&page=1&pageSize=20`. Foreign/out-of-scope unit404 kể cả page rỗng.

200 page `MentorWorkspaceSessionDto`: TeachingSessionDto hiện có (`sessionId,classId,classUnitId,title,startsAt,endsAt,status,primaryMentor,effectiveMentor,assignmentType,version,actualStartedAt,actualEndedAt,editableUntil,makeupForSessionId,makeupRootSessionId,asOf,timeZone`) + `capabilities:{readSessionContext,writeTeachingNotes}`. Meeting URL không nằm trong page. `writeTeachingNotes` chỉ hint theo actor/state/deadline hiện tại; PUT kiểm lại. `readSessionContext=false` cho primary ở buổi đã giao người khác.

Thứ tự startsAt/id, filter/count trước page; không range là mọi buổi trong quyền. FE chọn sessionId → context/attendance-candidates/attendance/notes. Trạng thái loading/empty/error riêng; không poll. Sau assignment/start/finalize/cancel refetch. Range invalid422; revoked403; không side effects.

## 3. Units, material và session roster

Các route dưới giữ cookie MENTOR, status200, material authoring policy/Origin/expectedRevision theo Phase3.3/3.4 hiện hành. Metadata không cần MinIO; binary access cần integration enabled và file READY. [Contract gốc](PHASE_3_3_flow-api-breakdown.md).

| GET path sau `/api/v1` | Request / response / cách dùng |
|---|---|
| `/mentor/classes/:classId/units` | page/pageSize; page `{id,classId,courseUnitId,title,position,status,unlockAt}`. Substitute chỉ units có buổi được giao. Dùng id tiếp cho unit sessions/material list. |
| `/mentor/classes/:classId/units/:unitId` | Không query; ClassUnitManagementDto (`id,courseUnitId,position,title,status,unlockAt,sessions`). **Mentor nhận `sessions:[]`**, timetable qua route phân trang. Admin management detail giữ behavior cũ. |
| `/mentor/classes/:classId/units/:unitId/sessions` | page/pageSize; page `{id,classUnitId,title,sessionNumber,status}`; substitute không thấy session khác trong cùng unit. |
| `/mentor/classes/:classId/units/:unitId/materials` | page/pageSize, contentType/reviewStatus theo DTO cũ; ManagerMaterialPageDto. Primary: published + own unapproved; substitute: current approvedRevision + published only. Filter trước count/page. |
| `/mentor/classes/:classId/materials/:materialId` | ManagerMaterialDetailDto; substitute `canEdit=false`, không đọc nháp của primary hoặc nháp cũ của chính mình khi chỉ còn scope SESSION. |
| `/mentor/classes/:classId/materials/:materialId/preview` | required query expectedRevision integer≥1; MaterialFileAccessDto cho primary binary. |
| `/mentor/classes/:classId/materials/:materialId/assets/:fileId/access` | required expectedRevision; referenced inline/attachment binary. |

POST `/api/v1/mentor/classes/:classId/materials/:materialId/files/:fileId/access` giữ body rỗng, Origin allowlist required, trả200 `MaterialFileAccessDto` (`materialId,fileId,role,revision,url,expiresAt`). GET binary access cùng DTO; revision conflict409, no reference/not visible404, storage unavailable503. Sign ngoài transaction rồi kiểm lại assignment/publication/file reference/revision; URL tối đa60s theo contract cũ. Hết URL thì gọi lại đúng revision, không retry mãi khi revoked. Không có grant authoring mới. Published content có thể chuẩn bị trước unit unlock/availableAt như primary; student publication/entitlement theo Materials policy hiện hành.

`GET /api/v1/mentor/classes/:classId/students` vẫn primary-only, query/DTO/payment metadata như Phase2.4; substitute403 trước truy vấn roster. Đọc metadata units/material của cancelled class giữ403 theo contract cũ. Class shell/reports history riêng vẫn đọc được.

### GET `/api/v1/class-sessions/:sessionId/attendance-candidates` — mới

Active assigned effective MENTOR hoặc staff ADMIN/MANAGER. FE dùng trước start để xem tên học viên; query page/pageSize, không body. Chỉ SCHEDULED thuộc lớp OPEN/IN_PROGRESS, không phù hợp422. Không tạo snapshot/start/ABSENT.200:

```json
{"items":[{"enrollmentId":"33333333-3333-4333-8333-333333333333","student":{"id":"44444444-4444-4444-8444-444444444444","displayName":"Học viên mẫu"},"entryType":"REGULAR","makeupPlacementId":null}],"total":1,"page":1,"pageSize":20,"provisional":true,"asOf":"2026-10-22T03:00:00.000Z"}
```

Chỉ enrollment ACTIVE đã enrolled/created trước asOf; cash pending không hiện. Guest phải ASSIGNED đúng target session, enrollment ACTIVE và source class OPEN/IN_PROGRESS, placement/enrollment trước asOf. Không cấp quyền class-wide cho guest. Tên + enrollment/placement ID tối thiểu, không contact/payment.

Sort displayName/enrollmentId/entryType; pagination trước response, total là toàn scope. `provisional=true` không bảo đảm admission khi start: command kiểm lại entitlement/cutoff. Empty là không có người đủ điều kiện lúc đọc. Sau start dùng GET `/api/v1/class-sessions/:sessionId/attendance` hiện có (AttendanceRosterDto: actual regular + guest snapshots, totals/permissions/page); mark/sync/finalize giữ contract4.2/4.4. Không start chỉ để đọc roster. Refetch sau thanh toán/start/placement; không poll liên tục.

## 4. Mentor attendance reports — primary-only

MENTOR primary hiện tại, class history allowed. Substitute403; student không thuộc class404, kể cả page rỗng. Credit dùng đúng AttendanceProjectionService/ATTENDANCE_CREDIT_CTE/attendanceSummary; không công thức riêng. Metadata UTC `asOf` và configured `timeZone`, `readonly` true khi class completed/cancelled.

| GET path sau `/api/v1` | Params/query và payload200 |
|---|---|
| `/mentor/classes/:classId/attendance-summary` | page/pageSize/from/to optional; page per-enrollment `{enrollmentId,student:{id,displayName},present,absent,unmarked,excluded,makeupPending,finalizedEligibleCount,rate}` + classId/asOf/timeZone/readonly. Không gộp các enrollment vào một row. |
| `/mentor/classes/:classId/students/:studentId/attendance` | studentId từ roster/summary, page/pageSize/from/to. AttendanceHistoryPageDto + readonly; rows giữ enrollmentId, physical attendanceStatus, creditedAttendanceStatus, attendanceApplicability, excluded, effectiveMentor, source root/makeup IDs. |
| `/mentor/classes/:classId/students/:studentId/attendance-summary` | paired from/to optional, không page; AttendanceSummaryDto + readonly + `aggregationScope='STUDENT_CLASS_HISTORY'`. Đây là tổng credit lịch sử cùng student/class giống Student API; muốn tách lần đăng ký dùng class-summary per-enrollment. |

`rate=100*present/finalizedEligibleCount`, null nếu denominator0; excluded/unmarked/legacy/pending chưa finalized không tự thành ABSENT. Makeup source root counted once theo projection có sẵn. Các API chỉ đọc, không side effects/key. FE mở tab gọi class-summary; click student → history/summary; lấy studentId từ row.student.id. Sau mark/finalize/correction/makeup refetch. Empty history hợp lệ, null rate hiển thị chưa có dữ liệu, không hiển thị0%.422 range lỗi;403/404 dừng retry và refetch scope.

## 5. Stored progress — primary-only

Không có completion write API. Enrollments sở hữu read projection; Classes authorize class/student/unit trước count/page. Scope chính là stored tracking, không tỷ lệ học thực tế. Cả hai responses có `completionPolicy='UNDEFINED'`, `policyVersion=null`, `assignmentSummary={availability:'NOT_IMPLEMENTED',counts:null}`, `readonly=true`, `asOf,timeZone`.

### GET `/api/v1/mentor/classes/:classId/progress`

Query page/pageSize + `unitId?` UUIDv4 (phải thuộc lớp); không date range. FE tab tiến độ.200 page summaries `{enrollmentId,studentId,displayName,storedUnitCount,untrackedUnitCount,invalidStoredUnitCount}`. Unit filter áp dụng counts từng enrollment; total là số enrollment. Không inline units không giới hạn, không overall percent. Chưa tracking thì untrackedUnitCount bằng số unit trong scope.

### GET `/api/v1/mentor/classes/:classId/students/:studentId/progress`

Query page/pageSize, studentId từ summary.studentId/roster.200 page phẳng **enrollment × class unit** với `{enrollmentId,classUnitId,trackingStatus,status,progressPercent,completedAt,dataQuality}`. Thứ tự enrollmentId/unit.position/unitId; total đếm cả missing progress rows. `STORED` là row có thật; `UNTRACKED` là missing row, status/percent/completedAt null. Stored zero trả decimal string `"0.00"`, không nói học viên học0%. Percent đọc phải là số0..100; dữ liệu sai trả percent null, `dataQuality='INVALID_PERCENT'`, không sửa DB. DataQuality `VALID|UNTRACKED|INVALID_PERCENT`.

Không student history404, unit ngoài lớp404, substitute403. GET không ghi row tracking và không cấp chứng nhận. Loading/empty/unknown khác nhau; unit/student selection reset page. Refetch sau thay đổi tracking trong milestone sau; Phase5 chưa có counts. Không polling.

## 6. Teaching notes — nội bộ

| Method/path sau `/api/v1` | Actor / input / behavior |
|---|---|
| GET `/class-sessions/:sessionId/teaching-notes` | Active MENTOR: current primary hoặc effective mentor đúng session.200 TeachingNoteResponseDto. |
| PUT `/class-sessions/:sessionId/teaching-notes` | Effective mentor; required UUIDv4 `Idempotency-Key`, Origin allowlist; body expectedVersion/content/nextSteps. |
| GET `/management/class-sessions/:sessionId/teaching-notes` | Active ADMIN/MANAGER, same response. |
| PUT `/management/class-sessions/:sessionId/teaching-notes` | Active ADMIN/MANAGER; cùng body + reason bắt buộc trim1..2000, key/Origin như mentor. Audit correction riêng, không giả danh mentor. |

SessionId lấy từ timetable/context. GET trước khi soạn form: chưa có note200 `{sessionId,note:null,version:0}`. Sau khi có note:

```json
{"sessionId":"55555555-5555-4555-8555-555555555555","version":1,"note":{"content":"Đã dạy vòng lặp.","nextSteps":"Ôn tập.","version":1,"createdBy":"66666666-6666-4666-8666-666666666666","updatedBy":"66666666-6666-4666-8666-666666666666","createdAt":"2026-10-22T03:00:00.000Z","updatedAt":"2026-10-22T03:00:00.000Z"}}
```

PUT example (JSON body, không nhận userId/contact/HTML schema):

```json
{"expectedVersion":0,"content":"Đã dạy vòng lặp.","nextSteps":"Ôn tập."}
```

Body chịu giới hạn JSON64KiB chung của app (vượt tổng kích thước413, kể cả khi từng field trong giới hạn); FE giữ draft và rút gọn nội dung thay vì retry. expectedVersion required integer0..2147483646. content plain text0..10000, nextSteps plain text0..5000, không nullable; client render as text. Staff thêm reason. Reject unknown body fields422; invalid/missing key422; invalid/missing Origin403 `ORIGIN_NOT_ALLOWED`. Student403 kể cả biết ID.

Mentor ghi từ IN_PROGRESS/COMPLETED và trước editableUntil; null deadline đóng window. Primary đã override không sửa note người dạy thay. Staff không bị deadline nhưng session phải thực sự bắt đầu; CANCELLED session chỉ correction existing note đã started, không tạo note mới. CANCELLED class chặn mọi note writes. Completed class không tự reopen.

Transaction: active actor share lock → Class → Session → note; actor/key advisory lock serialize key reuse across sessions. Note unique session, increment version; audit append-only và receipt cùng commit. Không raw note content trong application logs. Receipt replay chỉ sau recheck actor/assignment/state/window; cùng actor/key/body200 đúng kết quả cũ, không increment; changed payload/session/route409 `IDEMPOTENCY_KEY_REUSED`. Khác key cùng expectedVersion: đúng một winner, loser409 `TEACHING_VERSION_CONFLICT`.

409 `TEACHING_NOTE_WINDOW_CLOSED`: dừng autosave, staff correction nếu cần;409 `TEACHING_NOTE_STATE_CONFLICT`: refetch session, không retry;409 `TEACHING_VERSION_CONFLICT`: refetch note và merge có người quyết định, không tự overwrite. Loading save disable duplicate UI; lưu xong giữ version mới. Không polling. Ghi notes không sửa attendance/session status; audit không xuất qua student APIs/mail.

## 7. Handoff, kiểm chứng và rollout

[Postman collection](../../postman/Mindy-Mentor-Workspace-Phase46.postman_collection.json) có discovery/detail/timetable/content/reports/progress/candidate/notes/staff requests; không tự chạy writes. Swagger được kiểm qua built HTTP tests. Migration mới `1792627200000-teaching-notes.ts` additive, module TeachingOperations sở hữu notes/audits/receipts bằng SQL giống leave flow, không cần integration/config mới.

Apply migrations trên môi trường triển khai trước khi chạy binary mới; rollback code có thể để các bảng additive. `down` xóa note/audit/receipt history: phải export trước khi rollback môi trường có dữ liệu. Không sửa migration đã deploy. Gates và số test thực chạy ghi trong progress; không suy từ local sang VPS, browser hoặc real payments. Phase4.5 release và Phase5 assignments vẫn độc lập.

Final local evidence 2026-10-22: pnpm check PASS613 tests; compiled HTTP PASS79 tests (10 suites), bao gồm4.6. Không skip; chưa deploy/VPS/browser/live payment.
