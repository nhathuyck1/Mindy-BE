# Phase 3.3 — API breakdown cho FE

Cập nhật: **2026-10-13**. **Manager CRUD ở §3/4, Mentor context/submission ở §6/7/8 và review/publication ở §5 đã implement local3.3.1–3.3.3;
release ở §9 còn planned. Chưa deploy/nghiệm thu VPS3.3.1–3.3.3.**
Shapes Manager/Mentor/decision đã đối chiếu Swagger/source; phần release là đề xuất.
Upload 3.2 đã có, xem
[breakdown upload](PHASE_3_2_flow-api-breakdown.md).

Flow: [3.3](PHASE_3_3_FLOW.md). Plan:
[Material management](../implement_phase/phase%203/PHASE_3_3_MATERIAL_MANAGEMENT.md).

Ngoại lệ thứ tự2026-10-12: [ba Student FILE/VIDEO GET3.4](PHASE_3_4_flow-api-breakdown.md)
đã implement + materials read persistence tối thiểu. ARTICLE/refs/schema và Manager
CRUD3.3.1 đã mở rộng bằng migration additive mới, giữ Student FILE/VIDEO baseline.

## Contract ARTICLE / FILE / VIDEO

UX2026-10-12: mở Unit hiển thị danh sách Material, chọn ARTICLE gọi detail lấy
contentHtml; FE dùng CKEditor để soạn và render canonical HTML cho học viên.
Course Unit description là tổng quan; không bổ sung bảng course_unit_details
hoặc endpoint mới trong lượt tư vấn. PDF upload trả fileId READY, sau đó gắn
vào FILE hoặc attachment ARTICLE qua APIs authoring dự kiến bên dưới.
Upload không tự tạo Material/publish hay chuyển PDF thành HTML. Manager3.3.1 đã có
ARTICLE/attachments; Mentor authoring3.3.2 đã có; Student ARTICLE/assets còn planned.

User chọn **BE lưu HTML**; video private MP4/URL expiry, HLS làm sau. Contract
bên dưới áp dụng thống nhất cho Manager và Mentor create/PATCH/detail/list.
Không đọc screenshot JSON như yêu cầu buộc đổi sang Tiptap JSON. Files3.2 routes
vẫn unchanged; HTML string gửi vào Material body, không upload fileHTML tới Files.

POST Manager/Mentor create paths ở§3/6 dùng tagged DTO:
contentType required enum ARTICLE/FILE/VIDEO; title và metadata như cũ.
ARTICLE required contentHtml nonempty sau sanitize/UTF-8<=48 KiB,
contentSchemaVersion integer1 default1; fileId không được gửi.
FILE/VIDEO required fileId READY đúng kind; không contentHtml;
attachmentFileIds optional unique UUIDv4 array max50/default[].
Inline images dùng data-file-id UUID lấy từ upload READY IMAGE, không src/base64/
external URL; tối đa50 image nodes, BE derive unique refs từ canonical HTML.
Primary file không đồng thời là attachment; inline/attachment cùng file được phép.
Chốt DOM depth32/nodes5.000 (text node tính depth), kiểm input/canonical; image nodes50.
Input và canonical HTML đều <=48 KiB UTF-8. Body tổng64 KiB (kể cả JSON escaping);
body quá giới hạn413, invalid DTO/content/ref422
hoặc file status409/owner403 theo policy. Ví dụ Article request:

```json
{
  "contentType": "ARTICLE",
  "title": "Giới thiệu Unit 1",
  "contentHtml": "<h2>Mục tiêu</h2><p>Học về biến và kiểu dữ liệu.</p><img data-file-id=\"55555555-5555-4555-8555-555555555555\" alt=\"Sơ đồ\">",
  "contentSchemaVersion": 1,
  "attachmentFileIds": []
}
```

201 detail thêm contentType/contentHtml/contentSchemaVersion/file(nullable)/
attachments[]/inlineImages[] verified summaries; không signed URLs. BE canonicalize/
sanitize bằng parser+allowlist; author nhận HTML đã lưu, UI thông báo nội dung bị
loại khi cần. HTML-only không bắt buộc có file; ARTICLE có ảnh/file chỉ được ref
READY đúng Course Unit/quyền owner attach như3.2. FILE/VIDEO response
contentHtml null, file summary not null. Ví dụ Video request:

```json
{
  "contentType": "VIDEO",
  "title": "Video Unit 1",
  "fileId": "88888888-8888-4888-8888-888888888888"
}
```

PATCH expectedRevision + contentHtml/attachmentFileIds; attachmentFileIds
omitted giữ/null invalid/[] xóa; contentHtml chỉ ARTICLE/non-null; contentType
và contentSchemaVersion immutable ởMVP. Mọi sửa HTML/ref vẫn EDIT/tăng revision/reset approval/publication.
Queue/list giữ summary không HTML; Manager/Mentor detail trả HTML theo quyền và
view nhưcũ. Các command/canEdit/review flow không đổi vì loại nội dung.

3.4 planned cần Student `GET /api/v1/me/classes/:classId/materials/:materialId`
detail body+refs sau ACTIVE/class/release/time/approval policy. Asset access
POST `/api/v1/me/classes/:classId/materials/:materialId/files/:fileId/access`
và Manager/Mentor preview tương ứng, body `{}`; fileId phải referenced và thuộc
Material, 200 `{url,expiresAt}`, TTL<=60s/no-store/version chính xác.
Inline image/video dùng signed GET inline, attachment dùng disposition attachment
do BE quyết định. Pending/locked/hidden404, entitlement/assignment403, không auth401,
storage disabled/outage503; không cấp URL chỉ vì biết fileId.
Read/asset3.4 chưa implement; breakdown3.4 phải mô tả đầy đủ DTO/errors/UI khi triển khai.

FE render HTML đã sanitize trong vùng đọc bài; resolve data-file-id bằng asset API,
không persist signed URLs trong HTML/editor. Video Range/seek/URL expiry cần
refresh URL qua BE và restore currentTime/play state, không assume URL60s đủ cho
mọi video dài. 3.2 tunnel có ingress limit riêng; xem
[VPS runbook](../PHASE_3_2_VPS_MINIO_RUNBOOK.md).
Không thêm endpoint stream/HLS/external video trong scope đã chọn.

## 1. Quy ước chung và dữ liệu nối bước

Route đầy đủ là `/api/v1` + path ghi dưới đây. Request tới **BE**, dùng cookie
`access_token` qua browser `credentials: include`/adapter cùng origin; không Bearer
token/localStorage. GET không body; POST/PATCH JSON cần `Content-Type: application/json`.
Manager mutation3.3.1 và Mentor mutation3.3.2 kiểm `Origin` allowlist từ CORS_ORIGINS, reject thiếu/sai
với **403 ORIGIN_NOT_ALLOWED**; release áp dụng khi triển khai. Browser tự gửi Origin;
adapter/server proxy phải bảo toàn header. DELETE cũng cần Origin, không JSON body.

MANAGER routes chỉ Manager; MENTOR routes chỉ Mentor đang assigned Class chưa
CANCELLED; ADMIN chỉ release route của Admin. Principal phải active/role hiện hành.
Role không thay object permission: Mentor material mutations kiểm createdBy,
createdInClassId, firstApprovedAt và ancestry; không nhận actor/context từ client.

Path IDs UUID v4. `unitId` trong Mentor/Admin route là **Class Unit ID**,
`courseUnitId` là owner Material; `materialId`/`fileId` là ID riêng. `sessionId`
phải lấy từ context đúng lớp/unit; không dùng title/position làm ID.
Path ParseUUIDPipe giữ **400** baseline; UUID trong body/query sai trả **422**.

List trả trực tiếp `{items, page, pageSize, total}`, không bọc `data`.
Query `page` integer>=1 default1; `pageSize` integer1..100 default20;
query enum/UUID sai/field lạ 422. Unit materials sort `(sortOrder ASC,id ASC)`;
queue `(createdAt DESC,id ASC)`. Chỉ rows visible/nondeleted trước count/page.
Timestamp ISO8601 có timezone/timestamptz, ví dụ `2026-10-11T09:00:00+07:00`;
response dùng UTC `Z`, FE hiển thị Asia/Bangkok theo UI. `null` khác omitted.
Metadata response `Cache-Control: private, no-store`, không signed URL.

ID nguồn: Manager từ Course Unit nguồn quản trị/public active Course detail;
Mentor classId từ `GET /api/v1/mentor/classes` đã có, unit/session từ APIs §8;
fileId từ 3.2 READY; materialId/revision từ create/list/detail.
Manager catalogue inactive picker còn thiếu, không dùng Admin cookie để thay quyền.
3.2 đã nghiệm thu VPS theo xác nhận user 2026-10-12; API3.3 cần triển khai và
nghiệm thu từng slice theo plan. Không dùng kết quả3.2 làm evidence API3.3.

## 2. Shapes Manager đã implement; Mentor dự kiến

Create body (Manager/Mentor dùng chung, owner do route/server resolve):

```json
{
  "contentType": "FILE",
  "fileId": "55555555-5555-4555-8555-555555555555",
  "title": "Bài đọc Unit 1",
  "description": "Tài liệu chuẩn bị cho buổi học",
  "sortOrder": 0,
  "availableAt": "2026-10-11T09:00:00+07:00",
  "sessionId": null
}
```

contentType/title required; title không null/whitespace-only/max250.
fileId required chỉ FILE/VIDEO và không null; ARTICLE required contentHtml,
không fileId. contentSchemaVersion chỉ ARTICLE, default1; FILE/VIDEO không nhận.
FILE primary kind khác VIDEO; VIDEO primary kind VIDEO/MIME video/mp4.
attachmentFileIds optional unique UUIDv4/max50/default[] cho cả ba loại.
description optional/null/max5.000, default null; sortOrder optional integer
0..2.147.483.647 default0; availableAt/sessionId optional/null default null,
date có timezone, session UUID v4. Field lạ (courseUnitId ở body, externalUrl,
createdBy, approvedRevision, file summary, storage key...) 422.

PATCH dùng title/description/sortOrder/availableAt/sessionId, contentHtml chỉ
ARTICLE, fileId chỉ FILE/VIDEO và attachmentFileIds + **expectedRevision required**
integer1..2.147.483.647; cần ít nhất một content field. contentHtml/fileId/title/
sortOrder không null; description/availableAt/sessionId omitted giữ, null xóa.
attachmentFileIds omitted giữ, [] xóa, null invalid. Không đổi owner/contentType/
contentSchemaVersion; field immutable trong PATCH trả422.
Các command body `{ "expectedRevision": 1 }`; reject thêm reason required
string trimmed nonempty/max2.000. DELETE dùng query expectedRevision cùng bounds.

Manager item response dự kiến (201 create, 200 detail/mutation):

```json
{
  "id": "44444444-4444-4444-8444-444444444444",
  "courseUnitId": "33333333-3333-4333-8333-333333333333",
  "contentType": "FILE",
  "contentHtml": null,
  "contentSchemaVersion": null,
  "inlineImages": [],
  "attachments": [],
  "title": "Bài đọc Unit 1",
  "description": "Tài liệu chuẩn bị cho buổi học",
  "sortOrder": 0,
  "availableAt": "2026-10-11T02:00:00.000Z",
  "sessionId": null,
  "file": {
    "id": "55555555-5555-4555-8555-555555555555",
    "originalFilename": "unit-1.pdf",
    "mimeType": "application/pdf",
    "kind": "PDF",
    "sizeBytes": 2048
  },
  "reviewStatus": "DRAFT",
  "revision": 1,
  "approvedRevision": null,
  "reviewedBy": null,
  "reviewedAt": null,
  "firstApprovedAt": null,
  "rejectionReason": null,
  "publishedAt": null,
  "createdBy": "66666666-6666-4666-8666-666666666666",
  "createdInClassId": null,
  "createdAt": "2026-10-11T01:00:00.000Z",
  "updatedAt": "2026-10-11T01:00:00.000Z",
  "canEdit": true
}
```

file.kind dùng 3.2 enum PDF/IMAGE/DOCUMENT/PRESENTATION/SPREADSHEET/AUDIO/VIDEO/
SOURCE_CODE; sizeBytes safe JSON integer đã verified. file không có ownerUserId,
bucket/key/version/hash hoặc upload/download URL. canEdit là hint, BE kiểm lại.
ARTICLE detail có file=null, contentHtml canonical, contentSchemaVersion=1;
inlineImages/attachments là các verified summaries cùng safe shape với file.
FILE/VIDEO có file, contentHtml/contentSchemaVersion null, inlineImages=[].
Manager3.3.1 list dùng summary **omit contentHtml/contentSchemaVersion/inlineImages/attachments**;
queue review và Mentor view dự kiến cũng omit contentHtml, không trả toàn bài trong collection.
Các field review và safe ref summaries giữ theo actor view; create/mutation/detail
trả detail. ARTICLE có thể chỉ text, refs arrays rỗng vẫn hợp lệ.
Review fields nullable; firstApprovedAt giữ sau edit. updatedAt phản ánh mutation
thực, no-op retry không reset timestamps. DTO Manager có audit metadata trên;
không trả toàn lịch sử audit không phân trang.

Mentor own submission DTO dùng các field trên; rejectionReason chỉ trả cho chủ
submission. Published Material của người khác: content/file/reviewStatus/revision/
publishedAt/canEdit=false, **omit** rejectionReason/createdInClassId/reviewer/creator
audit fields; không được lộ draft metadata của người khác. Implementation cần
Swagger DTO rõ hai view; không coi nullable là quyền đọc mọi field.

Page example (cùng item view tương ứng actor, `items: []` là empty hợp lệ):

```json
{ "items": [], "page": 1, "pageSize": 20, "total": 0 }
```

## 3. Manager Course Unit create/list

**Đã implement3.3.1, verified local; chưa deploy.**

### GET `/api/v1/manager/course-units/:courseUnitId/materials`

Màn hình quản lý Unit; Manager cookie, Unit phải tồn tại (có thể Course inactive).
Path courseUnitId; query page/pageSize/contentType/reviewStatus (courseUnitId query bị owner path ghi đè), không body. Ví dụ:
`GET /api/v1/manager/course-units/33333333-3333-4333-8333-333333333333/materials?page=1&pageSize=20`.
200 page Manager items mọi review status chưa deleted; total sau filter.
Không side effect/polling. 404 MATERIAL_NOT_FOUND nếu owner Unit thiếu;
401/403/400/422 theo §10. Loading/success/empty; refetch sau create/PATCH/delete/review.

### POST `/api/v1/manager/course-units/:courseUnitId/materials`

Manager editor: ARTICLE có thể chỉ HTML; assets/FILE/VIDEO cần upload READY.
Path courseUnitId + body §2, cookie/JSON/Origin.
201 Manager detail DRAFT/revision1/publishedAt null; state + mọi refs + CREATE audit atomic.
ARTICLE-only không cần file; nếu có primary/inline/attachment đều READY đúng
Course Unit. Manager có thể dùng file Mentor upload. Sync.
Create **chưa có idempotency key**: mỗi successful POST tạo Material mới, shared
file không bị unique cấm. Mất response không tự retry POST; refetch list và đối
chiếu trước tạo lại. 409 FILE_NOT_READY; 404 FILE_NOT_FOUND/MATERIAL_NOT_FOUND;
422 MATERIAL_SCOPE_MISMATCH/content invalid; 403 permission/Origin.
Giữ form khi lỗi, không poll Material; successful response cung cấp materialId/revision.

## 4. Manager queue/detail/edit/delete

**Global list/detail/edit/delete đã implement3.3.1; decision queue flow đã implement3.3.3 local.**

### GET `/api/v1/manager/materials`

Queue Manager, cookie. Query page/pageSize + reviewStatus optional enum
DRAFT/PENDING_REVIEW/APPROVED/REJECTED + courseUnitId optional UUID v4
và contentType optional ARTICLE/FILE/VIDEO;
omitted status = mọi Material còn sống. FE queue gửi
`GET /api/v1/manager/materials?reviewStatus=PENDING_REVIEW&page=1&pageSize=20`.
200 Manager page, sort createdAt DESC/id ASC; item có owner/submitter provenance
để chọn detail, không signed URLs. Không side effect; invalid filter 422.
Refresh sau decision/PATCH/delete; empty = không có item khớp filter, không lỗi.

### GET `/api/v1/manager/materials/:materialId`

Manager chọn item hoặc refetch sau 409/response mất; path materialId, không query/
body. Ví dụ dùng `44444444-4444-4444-8444-444444444444`. 200 Manager item §2;
missing/deleted 404 MATERIAL_NOT_FOUND, UUID400/auth errors. Không side effect.
FE dùng revision mới để cập nhật editor; **không tự approve revision mới**.

### PATCH `/api/v1/manager/materials/:materialId`

Manager edit, JSON/Origin + path ID. Ví dụ body:
`{ "expectedRevision": 1, "title": "Bài đọc đã cập nhật", "availableAt": null }`.
200 item revision2 DRAFT, xóa approval/review hiện tại/publication, giữ
firstApprovedAt nếu đã từng approve. Bất kỳ content PATCH kể cả cùng giá trị
cũng tăng revision. Thay fileId cần READY đúng owner Unit; session phải ancestry đúng.
Sync state+EDIT audit atomic; stale expectedRevision409, max revision409;
invalid content/scope422, file not READY409, missing404.
Retry PATCH revision cũ sau success trả409; FE refetch đối chiếu, không đổi
expectedRevision tự động rồi retry edit. Refetch item/unit list/queue.

### DELETE `/api/v1/manager/materials/:materialId?expectedRevision=1`

Manager xóa mềm, cookie/Origin, query required, không body. 204 no content;
giữ FK/binary/audit, xóa publication. Same revision repeat authorized tombstone
204/no new audit. Missing404, stale409, query422, role/Origin403.
FE đóng detail, invalidate list/queue; không gọi DELETE Files sau Material delete.
Không async purge/polling ở API này.

## 5. Manager decision/publication commands

**Đã implement3.3.3 local; chưa deploy/nghiệm thu VPS.**

Tất cả Manager cookie/JSON/Origin, path materialId và expectedRevision §2;
sync 200 Manager detail. Trước gọi GET detail lấy revision, sau gọi invalidate
detail/unit list/queue. 409 refetch và yêu cầu người dùng quyết định lại; không
retry decision cho revision mới. 404 item missing/deleted; 403 role/Origin;
422 DTO/content/scope, 409 FILE_NOT_READY khi có reference chưa READY.
ARTICLE-only qua gate typed content không cần file; các bước kiểm nội dung
(submit/approve/reject/publish) kiểm mọi refs nếu có. Unpublish/delete không
yêu cầu storage network hoặc phát signed URL.

| Full route | Ví dụ body | Transition/response và lặp |
|---|---|---|
| POST `/api/v1/manager/materials/:materialId/approve` | `{ "expectedRevision": 1 }` | PENDING→APPROVED, approvedRevision1, reviewedAt/firstApprovedAt/publishedAt serverNow. Manager own DRAFT hoặc bản Manager sửa sau từng duyệt cũng hợp lệ; Mentor draft chưa submit409. Same current approved revision no-op; approve retry sau unpublish giữ publishedAt null. |
| POST `/api/v1/manager/materials/:materialId/reject` | `{ "expectedRevision": 1, "reason": "Cần bổ sung ví dụ thực hành" }` | Chỉ pending→REJECTED, reviewedAt/reason, approval/publication null. Repeat cùng revision + trimmed reason no-op; khác reason/state409. Blank/overlong reason422. |
| POST `/api/v1/manager/materials/:materialId/publish` | `{ "expectedRevision": 1 }` | Current APPROVED + typed content hợp lệ + mọi refs READY nếu có; set publishedAt nếu đang null, repeat giữ timestamp. Future availableAt/release vẫn trì hoãn Student3.4; không worker. |
| POST `/api/v1/manager/materials/:materialId/unpublish` | `{ "expectedRevision": 1 }` | Xóa publishedAt, giữ approval/revision; repeat no-op. Không thu hồi byte đã tải/URL cũ3.4 trước TTL. |

Command giữ revision; audit chỉ ghi transition thực. Hai approve cùng revision
no-op retry; approve/reject đua: một decision thắng, còn lại409. PATCH đua review:
review không được duyệt payload revision cũ sau EDIT. Sau mất response FE GET
detail; nếu state đã đúng không cần gọi lại. UI nút disabled trong request,
hiển thị approval/rejection/published là trạng thái riêng.

## 6. Mentor Unit create/list

**Đã implement3.3.2 local; chưa deploy.**

### GET `/api/v1/mentor/classes/:classId/units/:unitId/materials`

Mentor assigned cookie; context từ §8, classId+unitId đúng ancestry; page/pageSize
(default1/20, pageSize tối đa100), optional reviewStatus/contentType như Manager.
Không nhận courseUnitId query; scope resolve từ path. Sort sortOrder ASC/id ASC.
Ví dụ class `11111111-1111-4111-8111-111111111111`, unit
`22222222-2222-4222-8222-222222222222`. 200 page Mentor view:
APPROVED/published Material chính + own submission chưa từng approved trong
đúng createdInClassId; filter visibility trước total. Own pending/rejected visible;
draft người khác hidden. Không áp Student lock/time gates cho Mentor metadata.
Wrong parent/not found404; nonassignment/cancel403; UUID400/query422. Loading/
empty/success; refresh sau mutation, không polling worker.

### POST `/api/v1/mentor/classes/:classId/units/:unitId/materials`

Sau picker: ARTICLE có thể chỉ HTML; assets/FILE/VIDEO cần upload3.2 READY.
Cookie/JSON/Origin, path class/unit, body create §2;
BE resolve courseUnitId, không nhận owner từ client. 201 own Mentor detail
DRAFT/revision1/createdInClassId=classId. ARTICLE-only không cần file; mọi primary/
inline/attachment nếu có phải own READY đúng Course Unit, intent scope còn quyền;
optional session phải cùng lớp/unit. State+CREATE audit+mọi references atomic.
Create không tự retry khi mất response, giống Manager §3.
403 MATERIAL_ACCESS_DENIED/FILE_OWNER_MISMATCH, 404 ancestry/file,
409 FILE_NOT_READY, 422 scope/content. Assignment revoke sau upload chặn create,
FE giữ form/thông báo hết quyền, không đổi IDs để attach.

## 7. Mentor item/edit/delete/submit

**Đã implement3.3.2 local; chưa deploy.**

Mọi route có classId+materialId, phải resolve class Unit tham chiếu owner Course
Unit và kiểm assignment hiện tại; UUID400. Own draft/rejected chưa từng approved
mới canEdit=true; Mentor không dùng Manager endpoints. Metadata GET người khác
chỉ được nếu Material chính đã APPROVED/published. 404 hidden material,
403 assignment/action denied; DTO422; revision conflict409.

| Full route | Inputs/ví dụ | Response/side effect/retry/UI |
|---|---|---|
| GET `/api/v1/mentor/classes/:classId/materials/:materialId` | Path IDs, không query/body | 200 Mentor view §2; dùng sau chọn item/409/mất response. Own pending/rejected hiện reason; người khác không audit/draft. No side effect; hidden/deleted404 đóng editor. |
| PATCH `/api/v1/mentor/classes/:classId/materials/:materialId` | JSON/Origin; `{ "expectedRevision": 1, "description": "Đã bổ sung ví dụ" }` | 200 own item revision2 DRAFT, clear rejection/review/publication. Own DRAFT/REJECTED + firstApprovedAt null; pending/ever-approved403. FileId replacement owner/scope/READY kiểm lại. Retry cũ409/refetch; không tự rebase. |
| DELETE `/api/v1/mentor/classes/:classId/materials/:materialId?expectedRevision=1` | Origin/query required, không body | 204 soft delete own draft/rejected, binary giữ. Retry cùng revision nếu vẫn authorized204/no audit; pending/ever-approved403; stale409. Đóng editor/refetch unit list, không Files purge. |
| POST `/api/v1/mentor/classes/:classId/materials/:materialId/submit` | JSON/Origin; `{ "expectedRevision": 1 }` | 200 own item PENDING_REVIEW, revision giữ; verify READY/scope; audit SUBMIT atomic. Same pending revision no-op; rejected chưa EDIT409; ever-approved403. Khóa editor và refresh item/list, không poll worker. |

Mentor mất assignment sau submit: không còn list/detail/edit/submit; Manager vẫn
có thể duyệt. Lỗi403 dừng retry/refetch roster; dữ liệu form local không cấp quyền.

## 8. Mentor context APIs (Classes, implemented3.3.2 local)

### GET `/api/v1/mentor/classes/:classId/units`

Màn hình chọn unit sau roster. Mentor assigned cookie, classId UUID v4;
page/pageSize, sort position ASC/id ASC, no body. Ví dụ `.../units?page=1&pageSize=20`.
200 page items shape đã implement:

```json
{
  "items": [{
    "id": "22222222-2222-4222-8222-222222222222",
    "classId": "11111111-1111-4111-8111-111111111111",
    "courseUnitId": "33333333-3333-4333-8333-333333333333",
    "title": "Unit 1",
    "position": 1,
    "status": "LOCKED",
    "unlockAt": null
  }],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

id truyền thành unitId/classUnitId; courseUnitId truyền upload3.2; status
LOCKED/OPEN/COMPLETED và unlockAt phục vụ release UI, không Student entitlement.
No side effect. 404 CLASS_NOT_FOUND, 403 MATERIAL_ACCESS_DENIED,
path400/query422/auth401. Empty = không units;
disable upload cho đến có ID mapping. Refetch sau release/assignment change.

### GET `/api/v1/mentor/classes/:classId/units/:unitId/sessions`

Optional session picker; cookie + current assignment, ancestry đúng; page/pageSize,
sort sessionNumber ASC/id ASC. No body. 200 page, item đã implement:

```json
{
  "items": [{
    "id": "77777777-7777-4777-8777-777777777777",
    "classUnitId": "22222222-2222-4222-8222-222222222222",
    "title": "Buổi 1",
    "sessionNumber": 1,
    "status": "SCHEDULED"
  }],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

status từ enum hiện có Classes (SCHEDULED/COMPLETED/CANCELLED);
sessionNumber theo entity Classes, không dùng position của Class Unit.
Unit title ở §8 resolve từ Catalog public provider vì Class Unit không có title.
Không meeting URL/enrollment/material content.
id truyền sessionId; list sessions không tạo Material owner. Session CANCELLED
không thu hồi tài liệu chung. 404 CLASS_UNIT_NOT_FOUND nếu wrong parent,
403 assignment, path400/query422. Empty cho phép bỏ sessionId/null; không tạo
Session mới trong flow Materials. Sync/no side effect/no polling; refresh context
khi ancestry404/assignment403, không fallback Admin API.

## 9. Release APIs (Classes, planned)

PATCH `/api/v1/admin/classes/:classId/units/:unitId/release` (ADMIN) và
PATCH `/api/v1/mentor/classes/:classId/units/:unitId/release` (MENTOR assigned).
UI mở/khóa Unit, path classId/unitId từ context hoặc Admin class detail đã có.
Cookie/JSON/Origin, không query; ví dụ:

```json
{ "status": "OPEN", "unlockAt": "2026-10-11T09:00:00+07:00" }
```

status required chỉ LOCKED/OPEN; unlockAt optional ISO có timezone/null,
omitted giữ giờ cũ/null xóa; past time hợp lệ. COMPLETED input422;
Unit đang COMPLETED hoặc Class CANCELLED409 UNIT_RELEASE_CONFLICT (code mới).
200 cùng unit context DTO §8 (không nested sessions): status/unlockAt mới.
Sync Class→Unit lock, release audit actor/before/after trong cùng commit;
không đổi enrollment/progress/Material approval. Retry same payload no-op;
concurrent changes serialize, last accepted request thắng. Không expectedRevision
trong release contract này; FE refetch unit sau response/mất response, không
tự replay release cũ nếu người khác vừa thay đổi.

404 CLASS_NOT_FOUND/CLASS_UNIT_NOT_FOUND; Mentor assignment403
MATERIAL_ACCESS_DENIED; auth401/Origin403/path400/DTO422. UI giữ field date khi422,
409 disabled action+refetch; successful invalidate context/unit detail, khi3.4
tích hợp refetch Student list. LOCKED+unlockAt past vẫn locked; OPEN+future chưa
mở Student content. Manager không được gọi release bằng role MANAGER.

## 10. Error handling, loading/cache và prerequisites

Error envelope hiện có `{statusCode, code, message, details?, requestId?}`;
codes mới §8/9/Origin là dự kiến, test mapping trước FE integration. Ví dụ:

```json
{
  "statusCode": 409,
  "code": "MATERIAL_REVIEW_CONFLICT",
  "message": "The material action is not allowed in its current context"
}
```

| Status/code | FE xử lý |
|---|---|
| 400 path UUID/JSON malformed | Sửa request/router; không retry. Code path từ filter baseline, không bịa tên code mới. |
| 401 auth | Login/refresh theo auth adapter, dừng thao tác nếu session hết hạn. |
| 403 MATERIAL_ACCESS_DENIED/FILE_OWNER_MISMATCH | Dừng retry, refetch assignment/role; bỏ quyền editor, không đổi owner để bypass. |
| 403 ORIGIN_NOT_ALLOWED (Manager3.3.1/Mentor3.3.2 đã có) | Kiểm adapter/proxy/header allowlist; không gửi lại vô hạn. |
| 404 MATERIAL_NOT_FOUND/FILE_NOT_FOUND/CLASS_NOT_FOUND/CLASS_UNIT_NOT_FOUND/CLASS_SESSION_NOT_FOUND | Item missing/hidden/wrong ancestry; refetch context/đóng item. Không phân biệt hidden qua UI. |
| 422 DTO/MATERIAL_CONTENT_INVALID/MATERIAL_SCOPE_MISMATCH | Giữ form, field error khi details có; sửa IDs/fields. Không tự upload lại vì scope sai. |
| 409 FILE_NOT_READY | Nếu file đang PROCESSING, quay status polling3.2; FAILED/DELETED không attach. Không retry Material mutation khi chưa READY. |
| 409 MATERIAL_REVIEW_CONFLICT | Refetch item/queue, so revision/state; người dùng quyết định lại, không approve tự động bản mới. |
| 409 UNIT_RELEASE_CONFLICT (new planned) | Refetch Unit/Class, disable completed/cancelled action. |
| 503 FILE_STORAGE_DISABLED/UNAVAILABLE | Thuộc bước upload3.2/preview3.4; metadata3.3 không gọi MinIO. Hiển thị upload tạm ngừng, retry hữu hạn cho unavailable. |
| 5xx/network/response mất | GET retry hữu hạn; mutation refetch trước retry; create không auto retry, không coi timeout là chưa commit. |

Loading/empty/success/errors cho mọi GET; mutation disable duplicate click và
không optimistic approve/publish. Cache key gồm role/classId/unitId/materialId/
filter/page; invalidation sau mutation như các mục trên. Không persist signed
URLs trong cache (3.3 không phát URL). Không polling vô hạn cho pending review.

Prerequisites: implement+migrate3.3, cookie auth roles, proxy Origin/CORS đúng;
upload3.2 MinIO/versioning/worker bật nếu tạo/thay file. Không có claims deploy/
VPS trong lượt này. Human preview3.4 và Manager inactive catalogue picker còn
thiếu trước nghiệm thu UI toàn flow. Chạy local DB/HTTP/full gates khi implement;
happy paths ARTICLE-only hoặc upload READY→Mentor typed draft→submit→Manager approve→release,
error branches/revision/assignment tests theo plan.

## 11. Nhật ký planning — 2026-10-11

Tạo breakdown dự kiến tương ứng flow/plan; đối chiếu policy/transitions/Files
reference/Class locks, phân biệt planned với APIs3.2 đã có. Kiểm links/diff và
ví dụ JSON; chưa source/API change, BE tests, migrations, deploy hoặc binary review.

## 12. Đồng bộ plan sau nghiệm thu3.2 — 2026-10-12

Chuẩn hóa examples và shapes cho contentType required, fileId theo loại, HTML-only
không file, refs bounds/duplicate rules và summary omit HTML; workflow review/
release không đổi. Thêm baseline3.2 đã nghiệm thu theo user và gate server từng
slice trong plan. Kiểm diff/link/JSON tài liệu, chưa source/API runtime change,
BE tests, migration hoặc deploy3.3.

## Triển khai 3.3.1 — 2026-10-13

**Phạm vi hiện hành:** chỉ §3/4 Manager create/list/detail/PATCH/delete đã implement
local. Các §5+ Mentor/review/release tiếp tục planned; các ghi chú lịch sử phía trên
không thay trạng thái này. Canonical ARTICLE/refs/audit đã có additive schema.
Responses Manager có `Cache-Control: no-store`, không envelope bọc data; page có
items/page/pageSize/total. Unit list sortOrder/id ASC, global list createdAt DESC/id ASC.
DELETE nhận query expectedRevision (không body), integer1..2147483647; thiếu422.
POST không idempotency key; PATCH stale409; DELETE same revision204/no duplicate audit.

Sanitizer: `sanitize-html2.18.0` + `htmlparser2 12.0.0` ESM. Hrefs chỉ http/https/mailto
tuyệt đối; strip target/style/events/src/unsafe embeds/svg/math; CKEditor figure/table
markup cho phép nhưng class/style bị loại. Input/canonical48 KiB UTF-8, depth32,
5.000 nodes, 50 image nodes, attachment unique UUIDv4 max50. File status/scope
verified dưới lock; ARTICLE không text/ảnh hợp lệ422 MATERIAL_CONTENT_INVALID.
HTML quá limit413 MATERIAL_CONTENT_TOO_LARGE; body JSON64 KiB quá limit413
INVALID_JSON_BODY. Missing ref404 FILE_NOT_FOUND; non-READY409 FILE_NOT_READY;
foreign scope422 MATERIAL_SCOPE_MISMATCH; primary kind/inline non-IMAGE422
MATERIAL_CONTENT_INVALID. File metadata PENDING/FAILED không chặn binary READY.

FE: sau create lấy id/revision từ detail; list là summary, mở editor phải GET detail;
render canonical HTML đã trả về và giữ data-file-id. Chưa gọi asset API planned3.4
hoặc dùng Files status làm download. Invalid422 giữ form; 409 giữ form/refetch,
người dùng đối chiếu trước sửa; 401 login; 403 dừng retry/thông báo hết quyền;
404 đóng editor/refetch list. Loading/empty/success dùng page total sau filter,
mutation invalidate unit/global lists và detail. Không poll Material.

Postman: [Phase33 collection](../../postman/Mindy-Materials-Phase33.postman_collection.json).
Gán Origin đúng CORS_ORIGINS kể cả khi gọi bằng Postman; cookie jar từ login Manager.
Local: check332/332, HTTP32/32, Files42/42, 0 skip; server cases ở [progress3.3](../progress/phase%203/PHASE_3_3_PROGRESS.md).
Không có deploy/server evidence trong lượt này.

## Triển khai 3.3.2 — 2026-10-13

**Phạm vi hiện hành:** §3/4 Manager CRUD3.3.1 và §6/7/8 Mentor context/content/submit3.3.2
đã implement local; §5 Manager decisions/publication và §9 release chưa implement.
Các ghi chú triển khai3.3.1 là lịch sử. Không có migration mới3.3.2; cần schema3.3.1.

Hai GET context trả no-store, page items/page/pageSize/total (default1/20, max100).
Unit id là Class Unit ID truyền `unitId`/upload `classUnitId`, courseUnitId dùng Files;
session id truyền sessionId optional. Unit title batch từ Catalog, không private URL.
Mentor list nhận page/pageSize/reviewStatus/contentType; không courseUnitId query.
List sortOrder/id ASC, visibility SQL trước total; own pending visible/canEdit false.
Detail/mutation dùng cùng shape ManagerMaterialDetailDto §2 nhưng canEdit/own reason
được tính theo actor/current class; summary bỏ HTML/schema version/refs arrays.

Ví dụ Mentor submit với `{"expectedRevision":1}` trả200, no envelope bọc data,
có `reviewStatus:"PENDING_REVIEW"`, `revision:1`, `canEdit:false`, canonical contentHtml,
file nullable/inlineImages/attachments summaries. No-op repeat giữ updatedAt/audit;
missing/null/fraction/out-of-range/string expectedRevision422 (JSON integer required).
DELETE query chuyển number và required1..2147483647; same revision authorized204.
ARTICLE input/canonical48 KiB và JSON64 KiB như Manager; immutable type/version.
Every mutation cần Origin allowlist, thiếu/sai403 ORIGIN_NOT_ALLOWED; GET không cần Origin.

Mentor published shared content vẫn đọc được khi Unit LOCKED/availableAt future,
không dùng session làm ownership filter. Own draft lớp khác/other Mentor draft404;
nonassignment/cancel/inactive/current role mismatch403. PATCH/SUBMIT không auto rebase;
refetch revision rồi người dùng quyết định. Pending edit/delete và ever-approved
edit/delete/submit403; rejected submit trước EDIT409. Mutation+refs+audit atomic,
no storage signing/network; FILE upload intent quyền hiện tại kiểm lại trước attach.

FE sequence: roster→context→ARTICLE hoặc Files3.2 READY→create→detail/edit→submit;
editor khóa sau pending. Cache key có class/unit/material/filters; invalidate list/detail
sau mutation, stop retry khi403; Manager review/binary preview/release chờ slice sau.
Postman collection có22 requests, thêm Mentor login/context/typed create/list/detail/
PATCH/submit/delete, lưu material_id/expected_revision từ200/201; create không auto retry.

Local Node22.20.0: check348/348 (31 suites), HTTP36/36 (2 suites), Files42/42 (1 suite),
0 skip, gồm real MinIO PDF/MP4→Mentor submit. [Progress](../progress/phase%203/PHASE_3_3_PROGRESS.md)
ghi chi tiết tests và server cases; chưa deploy/nghiệm thu VPS.

## Triển khai 3.3.3 — 2026-10-13

§5 bốn Manager commands đã có source/controller/DTO và Swagger; route đầy đủ như
bảng §5. Trả200 ManagerMaterialDetailDto trực tiếp, không bọc data, no-store.
Manager canEdit=true ở mọi state còn sống; Mentor canEdit chỉ own DRAFT/REJECTED
trong lớp đang assigned và firstApprovedAt=null, pending/ever-approved false.
APPROVE DRAFT chưa từng duyệt chỉ khi createdInClassId=null và createdBy=current
Manager; các Manager khác cần submission pending, hoặc bản đã từng approved.
REJECT reason JSON string nonempty/max2.000 ký tự trước trim; whitespace-only422.
JSON expectedRevision không coercion: missing/null/string/fraction/out-of-range422;
unknown body fields422; UUID400; auth401/role hoặc Origin403; tombstone404.

Queue GET giữ filters/page/summary/sort ở §4. Detail đọc canonical HTML, verified
file metadata; không signed URL. Staff có thể thấy metadata file không còn READY,
nhưng approve/reject/publish kiểm mọi refs READY dưới khóa. Unpublish/delete không
đòi READY hay gọi storage. Primary FILE/VIDEO không human preview trong slice này.
FirstApprovedAt bất biến; Manager PATCH dù cùng giá trị về DRAFT/revision+1, clear
review/publication, Mentor không được sửa lại. Approve/unpublish/publish giữ revision.

FE: disable nút khi đang gọi; invalidate detail/unit list/queue sau success; giữ form
khi422, refetch khi409 và yêu cầu quyết định lại. Mất response: GET detail trước retry;
no-op không audit/timestamp trùng. Approve retry sau unpublish giữ publishedAt=null.
Postman Phase33 có27 requests, bổ sung queue và bốn decisions; login Manager lại sau
Mentor submit để cookie jar đúng actor, expected_revision lấy từ detail/mutation.

Deploy cần migration1791853200000 sau typed schema1791849600000; không sửa migration
đã chạy. Chưa migrate dev/VPS hoặc nghiệm thu server. Release§9 và ARTICLE assets/
binary preview3.4 vẫn planned. Rollback app giữ data; migration down chỉ khôi phục
trigger cũ (withdrawal có thể lại bị READY guard chặn), không xóa Materials/audit.
