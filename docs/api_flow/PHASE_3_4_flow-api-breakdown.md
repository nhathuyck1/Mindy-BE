# Phase 3.4 — API handoff: Student Materials và staff preview

Cập nhật **2026-10-13**. Ba endpoints đã implement, local verified FILE/VIDEO;
chưa deploy. [Flow](PHASE_3_4_FLOW.md) · [Progress](../progress/phase%203/PHASE_3_4_PROGRESS.md).
ARTICLE/attachments/inline assets và staff authoring/review/release HTTP chưa có.

[Plan phối hợp3.3/3.4](../implement_phase/phase%203/PHASE_3_4_MATERIAL_ACCESS_PREVIEW.md).
§1–3 mô tả source Student FILE/VIDEO hiện có. §4–7 là **contract đề xuất chưa
implement**, không đưa vào client production trước khi Swagger/source xác nhận.
Người khác triển khai3.3–3.6; user nhận deploy/server acceptance. FE là nhóm riêng;
breakdown để bàn giao, repo FE local chỉ đọc và không sửa trong lượt này.

## Contract chung đã implement cho ba Student GET

Prefix `/api/v1`. Actor STUDENT, cookie `access_token`; browser FE dùng authenticated
same-origin adapter và `credentials` theo session client hiện có. Không gửi
studentId/role/fileId/bucket/key. Cả ba trả `Cache-Control: private, no-store`.
GET không có body/side effects/payment transition; response JSON trực tiếp,
không bọc `{data}`. UUID path **v4**, invalid400 HTTP_ERROR; query invalid422
HTTP_ERROR. Ví dụ IDs bên dưới là giả.

Prerequisites: migration3.2 + `StudentMaterialReads1791763200000`, Material đã
APPROVED/published đúng revision, ACTIVE enrollment và Class Unit đã release.
Không có authoring/review/release HTTP trong slice này; fixture tests không phải
workflow production. FILE là kind khác VIDEO; VIDEO là verified MP4 ở Files3.2.

List/detail hoạt động khi MINIO_ENABLED=false; download cần MINIO_ENABLED=true,
credentials/bucket private versioned và MINIO_PUBLIC_URL truy cập được từ browser.
FILE_GET_TTL_SECONDS integer1..60, default60; không thay PUT TTL.
Production provisioning hiện có s3:GetObject/GetObjectVersion. Proxy/CORS của
storage phải cho GET/Range và HTTPS origin FE; browser nghiệm thu còn chờ.

## 1. GET /api/v1/me/classes/:classId/units/:classUnitId/materials

Mục đích: tài liệu/nội dung được phép đọc của chương thuộc lớp đang học.
FE gọi sau GET `/me/classes` chọn accessMode FULL → GET `/me/classes/:classId`.
`classId` từ enrollment; **classUnitId = detail.units[].id**, không courseUnitId.

| Input | Type/required/default/limits |
|---|---|
| classId, classUnitId (path) | Required UUID v4; unit phải thuộc class |
| page (query) | Optional integer >=1, default1 |
| pageSize (query) | Optional integer1..100, default20 |

Ví dụ request:

```http
GET /api/v1/me/classes/11111111-1111-4111-8111-111111111111/units/22222222-2222-4222-8222-222222222222/materials?page=1&pageSize=20
Cookie: access_token=<session-cookie>
```

200 trả `{items,page,pageSize,total,asOf}`. `asOf` là ISO UTC server time dùng cho
mọi time gate; sort `sortOrder ASC,id ASC`, không phụ thuộc sessionId. total chỉ
đếm các Material đã được phép xem; draft/future/deleted/not-READY không lộ qua total.

```json
{
  "items": [{
    "id": "33333333-3333-4333-8333-333333333333",
    "classId": "11111111-1111-4111-8111-111111111111",
    "classUnitId": "22222222-2222-4222-8222-222222222222",
    "courseUnitId": "44444444-4444-4444-8444-444444444444",
    "contentType": "FILE", "title": "Bài học", "description": null,
    "sortOrder": 0, "revision": 1, "sessionId": null, "availableAt": null,
    "publishedAt": "2026-10-12T08:00:00.000Z", "updatedAt": "2026-10-12T08:00:00.000Z",
    "file": { "id": "55555555-5555-4555-8555-555555555555", "originalFilename": "lesson.pdf", "mimeType": "application/pdf", "sizeBytes": 4096, "kind": "PDF" }
  }],
  "page": 1, "pageSize": 20, "total": 1, "asOf": "2026-10-12T09:00:00.000Z"
}
```

`id` dùng mở detail/download; classUnitId trong DTO là context lớp đang truy cập.
`contentType` FILE/VIDEO chọn viewer; `file.id` là metadata, không phải quyền gọi
generic Files API. `file.kind` PDF/IMAGE/DOCUMENT/PRESENTATION/SPREADSHEET/AUDIO/
VIDEO/SOURCE_CODE; mimeType/sizeBytes là verified, dùng chọn viewer/hiển thị dung lượng.
`description`, `sessionId`, `availableAt` nullable; publishedAt/updatedAt có giá trị.
`sessionId` chỉ là optional usage association, có thể thuộc lớp khác dùng shared unit.
`revision` hỗ trợ phát hiện nội dung mới khi refetch; không dùng tăng quyền.
Không có URL signed hoặc review/audit/owner/storage internals trong item.

Empty200 khi chưa có tài liệu visible, unit LOCKED/future unlockAt, hoặc page ngoài
phạm vi (total vẫn tổng visible). FE phân biệt unit lock từ class detail nếu cần;
không suy ra empty đồng nghĩa không có tài liệu trong DB. Loading skeleton, empty
state đúng tình trạng; paging dựa total. Refetch khi đổi unit/lớp, quay lại tab hoặc
sau thông báo publish/release; không polling vô hạn. Cần tải trang tiếp theo nếu total lớn.

## 2. GET /api/v1/me/classes/:classId/materials/:materialId

FE click item từ danh sách; classId từ lớp đã chọn, materialId từ item.id. Deep
link/reload có thể gọi trực tiếp khi đã bootstrap phiên. Hai path required UUIDv4,
không query nghiệp vụ/body. 200 trả **một item cùng shape ở trên**, không page wrapper.
Ví dụ request hợp lệ:

```http
GET /api/v1/me/classes/11111111-1111-4111-8111-111111111111/materials/33333333-3333-4333-8333-333333333333
Cookie: access_token=<session-cookie>
```

Context được resolve lại; Material phải thuộc Course Unit được dạy trong class,
current approval/release/publication/availability/READY phải còn hiệu lực.
Không trả raw HTML ARTICLE trong slice này. FILE/VIDEO detail gồm metadata;
FE gọi download ở bước tiếp theo để có bytes/viewer URL.

Loading trong viewer, success hiển thị title/description/file; hidden404 hiển thị
“Tài liệu chưa khả dụng”, quay về/refetch list; không dò URL hoặc retry liên tục.
Khi đổi account/logout, abort request và xóa dữ liệu/private player trong memory.
Refetch detail trước tiếp tục học sau tab focus để cập nhật revision/quyền.

## 3. GET /api/v1/me/classes/:classId/materials/:materialId/download

FE bấm xem/tải hoặc chuẩn bị player; IDs từ detail/list. Hai path required UUIDv4,
không nhận fileId/body/query nghiệp vụ. 200 JSON, **không redirect**:

```http
GET /api/v1/me/classes/11111111-1111-4111-8111-111111111111/materials/33333333-3333-4333-8333-333333333333/download
Cookie: access_token=<session-cookie>
```

```json
{
  "materialId": "33333333-3333-4333-8333-333333333333",
  "fileId": "55555555-5555-4555-8555-555555555555",
  "url": "https://storage.example.test/private/verified-object?versionId=verified-version&X-Amz-Expires=60&X-Amz-Signature=example",
  "expiresAt": "2026-10-12T09:01:00.000Z"
}
```

url là bearer capability, chỉ giữ trong memory, không log/lưu DB/localStorage.
expiresAt ISO UTC là hạn dự kiến; clock/latency của storage có thể khiến hết hạn sớm.
FE GET trực tiếp **storage**, không chuyển BE cookies/token sang storage. URL pin
version đã kiểm chứng, không latest/staging. Trả inline filename UTF-8 và no-store;
viewer hỗ trợ thì xem, download button có thể tải bytes từ URL trong giới hạn CORS.
Browser cross-origin `download` attribute có thể không cưỡng chế tải; contract hiện
tại không có query chọn attachment, không tự thêm `?disposition=attachment`.

MP4/PDF Range request tới storage trả206; URL hỗ trợ full GET200. Player refresh URL
khi gần hết hạn/lỗi expiry rồi khôi phục currentTime/play state; không refresh bằng
upload URL hoặc tự kéo dài query signature. Storage403 có thể do expiry **hoặc**
permission/config: refresh qua BE một lần, còn lỗi thì báo lỗi, không lặp vô hạn.
Issued URL có thể vẫn dùng đến expiry khi unpublish/revoke; refresh bị kiểm quyền lại.

GET lặp không đổi state; mỗi lần phát hành URL có hạn ngắn sau authorization. Signing
ngoài transaction, recheck Material/quyền trước trả, revision/file thay đổi thì404.
API không HEAD/storage health probe trước ký; ký thành công không chứng minh object
hoặc ingress đang online. Network/storage failure khi dùng URL cần feedback riêng.

## Errors và UI cho cả ba API

Envelope `{statusCode,code,message,requestId?,details?}`. Ví dụ hidden detail:

```json
{"statusCode":404,"code":"MATERIAL_NOT_FOUND","message":"The material action is not allowed in its current context"}
```

| HTTP/code | Khi nào | FE xử lý |
|---|---|---|
| 400 HTTP_ERROR | Invalid path UUID v4 | Dừng, sửa link/ID, không retry |
| 401 AUTHENTICATION_REQUIRED | Cookie/session hết hiệu lực, account bị khóa qua guard | Session recovery hiện có; thất bại → login và dọn private state |
| 403 INSUFFICIENT_ROLE | Guard role khác STUDENT | Không hiển thị controls học viên |
| 403 MATERIAL_ACCESS_DENIED | Thiếu ACTIVE/pending/completed/outsider, lớp hủy; service cũng rechecks account/role | Refetch My Classes/order, dừng download, không retry cùng quyền |
| 404 CLASS_UNIT_NOT_FOUND | List unit không có hoặc sai parent class | Refetch class detail/chọn lại unit |
| 404 CLASS_NOT_FOUND | Context parent mất | Quay về My Classes |
| 404 MATERIAL_NOT_FOUND | Detail/download missing/foreign/hidden/revision thay đổi lúc ký | Refetch list/detail; không dò file khác |
| 422 HTTP_ERROR | Query paging sai/thừa field | Sửa query/input |
| 422 MATERIAL_SCOPE_MISMATCH | Catalogue ancestry không khớp | Dừng, báo dữ liệu không nhất quán |
| 409 FILE_NOT_READY | File mất READY giữa authorize và signer load | Refetch detail, dừng dùng file cũ |
| 503 FILE_STORAGE_DISABLED | Download storage disabled | Báo chưa khả dụng, metadata vẫn đọc được |
| 503 FILE_STORAGE_UNAVAILABLE | Không ký được URL | Retry hữu hạn theo thao tác user |

Quyền có thể thay đổi ngay sau một response. FE không dùng FULL/item/file READY như
bằng chứng quyền lâu dài. Không gửi mutation để tự mở unit hay xác nhận thanh toán.

## Handoff FE và nghiệm thu

FE repo hiện chặn các route này ở `src/shared/lib/http/proxy-policy.ts`; cần mở
đúng GET paths, thêm runtime schemas/client và viewer. Học viên phải có đường vào
My Classes/lịch thay vì tìm lớp qua order. Schema class cần giữ unit.status/unlockAt/
courseUnitId nếu UI hiển thị nguyên nhân lock. Bản thân schema BE có dữ liệu đó.

Local integration/compiled HTTP đã kiểm cookie roles, query/path, paging, safe DTO,
CASH pending→confirm, unit release, shared classes, revoke/unpublish, MinIO pinned
version/expiry/Range/PDF/MP4. Browser Range/seek/refresh/CORS và deployed acceptance
còn chờ; production authoring/review/release là phụ thuộc3.3.

## 4. Typed Student list/detail — đề xuất sau contract3.3.1

Tái dùng routes/auth/path/paging/no-store và errors ở§1–3. FILE/VIDEO giữ fields
cũ; contentType thêm ARTICLE, file nullable cho ARTICLE. List không trả contentHtml
hoặc signed URLs. Detail thêm contentHtml/contentSchemaVersion cho ARTICLE;
FILE/VIDEO có hai fields này null. inlineImages[]/attachments[] là safe verified
file summaries `{id,originalFilename,mimeType,sizeBytes,kind}`, default[].
List typed summary và detail cần DTO riêng; source hiện cùng shape FILE/VIDEO.
Nhóm FE cập nhật typed schema theo Swagger trước publish ARTICLE trên môi trường.

Ví dụ **detail200 dự kiến**, không phải response hiện có:

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "classId": "11111111-1111-4111-8111-111111111111",
  "classUnitId": "22222222-2222-4222-8222-222222222222",
  "courseUnitId": "44444444-4444-4444-8444-444444444444",
  "contentType": "ARTICLE", "title": "Bài kiến thức Unit 1", "description": null,
  "sortOrder": 0, "revision": 1, "sessionId": null, "availableAt": null,
  "publishedAt": "2026-10-13T08:00:00.000Z", "updatedAt": "2026-10-13T08:00:00.000Z",
  "file": null,
  "contentHtml": "<p>Kiến thức cơ bản</p><img data-file-id=\"66666666-6666-4666-8666-666666666666\" alt=\"Sơ đồ\">",
  "contentSchemaVersion": 1,
  "inlineImages": [{"id":"66666666-6666-4666-8666-666666666666","originalFilename":"diagram.png","mimeType":"image/png","sizeBytes":2048,"kind":"IMAGE"}],
  "attachments": [{"id":"55555555-5555-4555-8555-555555555555","originalFilename":"lesson.pdf","mimeType":"application/pdf","sizeBytes":4096,"kind":"PDF"}]
}
```

ARTICLE text-only trả file=null, inlineImages/attachments=[], vẫn visible nếu
approval/publication/release/ACTIVE/time gates đạt. HTML đã canonical sanitize
bởi3.3; không chứa storage URL. Client render bài và lấy image/attachment URLs
từ§6 bằng IDs do detail trả. FILE là tài liệu xem/tải; VIDEO dùng player MP4.
Primary `/download` ở§3 chỉ FILE/VIDEO; gọi cho ARTICLE dự kiến422
MATERIAL_CONTENT_INVALID sau authorization, dùng detail/assets thay primary.
Ba GET hiện có không thêm expectedRevision query; new preview/asset routes ở§5/6
mới bắt buộc nó. Không đổi FILE/VIDEO shape cũ khi thêm typed DTO.

SQL/policy validate typed content và mọi READY refs trước count/page; không lộ
HTML/ref khi pending/locked/future/deleted/unpublished. List vẫn empty200 cho
unit locked/future. Metadata đọc được khi storage disabled. Loading bài → detail
→ resolve references; asset loading/error riêng theo ảnh/file.403/404 dừng/refetch
list/quyền; revision đổi cần refetch detail. GET không ghi progress/completion.

## 5. Staff primary preview — hai GET đề xuất cùng review3.3.3

| Full route | Actor/quyền | Bước gọi và ID nguồn |
|---|---|---|
| GET `/api/v1/manager/materials/:materialId/preview` | Active MANAGER; typed content/primary READY đúng owner, Material chưa deleted; DRAFT/PENDING_REVIEW/REJECTED/APPROVED đều có thể preview | Queue/unit list3.3 → Manager detail → preview trước approve/reject; materialId/revision từ detail |
| GET `/api/v1/mentor/classes/:classId/materials/:materialId/preview` | Active MENTOR hiện assigned lớp chưa CANCELLED/đúng ancestry; own submission trong lớp chưa từng approved hoặc current APPROVED/published shared Material | Mentor list/detail3.3 → xem own draft/pending/rejected hoặc published; classId từ roster, materialId/revision từ detail |

Manager không áp Student enrollment/release/availableAt; Mentor không xem draft
người khác. Primary shared published không bắt buộc file là của Mentor đang xem.
ADMIN/STUDENT bị role guard từ chối. Deleted/hidden/wrong parent không preview.

Inputs cho **cả hai**: cookie access_token qua authenticated adapter; path UUIDv4;
required query `expectedRevision` integer1..2.147.483.647, không default.
GET không body; không fileId/role/studentId/bucket/key/version/disposition inputs.
Invalid path400 HTTP_ERROR; invalid/missing/unknown query422 HTTP_ERROR.

```http
GET /api/v1/manager/materials/33333333-3333-4333-8333-333333333333/preview?expectedRevision=1
Cookie: access_token=<session-cookie>
```

```http
GET /api/v1/mentor/classes/11111111-1111-4111-8111-111111111111/materials/33333333-3333-4333-8333-333333333333/preview?expectedRevision=1
Cookie: access_token=<session-cookie>
```

200 JSON trực tiếp cho cả hai, `Cache-Control: private, no-store`, không redirect:

```json
{
  "materialId": "33333333-3333-4333-8333-333333333333",
  "fileId": "55555555-5555-4555-8555-555555555555",
  "revision": 1,
  "url": "https://storage.example.test/private/verified-object?versionId=verified-version&X-Amz-Expires=60&X-Amz-Signature=example",
  "expiresAt": "2026-10-13T09:01:00.000Z"
}
```

materialId/fileId là primary server resolve; revision là bản được authorize,
client gửi revision này khi approve/reject3.3. expiresAt/url có semantics§3: pin
verified version, TTL<=60s, private bearer URL, bytes/Range từ storage, inline
verified filename. ARTICLE primary preview422 MATERIAL_CONTENT_INVALID; dùng
canonical detail/§6. Repeat chỉ cấp URL mới sau check; không ghi review/ref/progress/audit.

Service: snapshot/quyền/revision → signReadReference ngoài transaction → recheck
actor/assignment/ancestry/Material state/revision/file/version → trả URL.
Authorize trước so expectedRevision; hidden403/404 ưu tiên để tránh leak.
Revision stale hoặc EDIT lúc ký mà vẫn authorized409 MATERIAL_REVIEW_CONFLICT;
không tự trả URL bản mới. Review command3.3 vẫn kiểm expectedRevision riêng.

Handoff nhóm FE: viewer loading → success/error; không review khi viewer đang
hiện revision khác detail.409 refetch và xem lại/quyết định, không auto approve.
Network GET retry hữu hạn cùng revision; storage403 refresh qua BE một lần,
lỗi tiếp dừng.403/404 đóng viewer/refetch quyền;503 báo storage chưa sẵn sàng,
metadata/queue vẫn dùng được. Các errors chung/prerequisites ở§7 áp cho cả hai routes.

## 6. Scoped asset access — ba GET đề xuất

| Full route | Actor/context | Nguồn fileId và hành động |
|---|---|---|
| GET `/api/v1/manager/materials/:materialId/assets/:fileId/access` | Active MANAGER, canPreview typed Material | inlineImages[].id/attachments[].id trong Manager detail; xem ảnh/file khi soạn/duyệt |
| GET `/api/v1/mentor/classes/:classId/materials/:materialId/assets/:fileId/access` | Active assigned MENTOR, cùng canPreview như§5 | IDs trong Mentor authorized detail, classId từ roster/context; xem own submission/published shared refs |
| GET `/api/v1/me/classes/:classId/materials/:materialId/assets/:fileId/access` | Active STUDENT + ACTIVE enrollment, class/unit/approval/publication/time gates | IDs từ typed Student detail§4; resolve data-file-id hoặc click attachment |

Tất cả path IDs required UUIDv4; query **expectedRevision required** với range§5,
cookie access_token, GET no body. Ví dụ materialId
`33333333-3333-4333-8333-333333333333`, fileId
`55555555-5555-4555-8555-555555555555`, classId
`11111111-1111-4111-8111-111111111111`: thay đúng IDs vào full route ở bảng và
thêm `?expectedRevision=1`. Request Student ví dụ:

```http
GET /api/v1/me/classes/11111111-1111-4111-8111-111111111111/materials/33333333-3333-4333-8333-333333333333/assets/55555555-5555-4555-8555-555555555555/access?expectedRevision=1
Cookie: access_token=<session-cookie>
```

Ba routes trả200 **cùng signed response shape ở§5**, revision là Material revision;
fileId là target reference được authorize. Membership phải là INLINE_IMAGE/
ATTACHMENT của Material hiện tại trong reference table3.3; cùng Course Unit chưa
đủ. Primary FILE/VIDEO dùng§3/5. INLINE_IMAGE phải READY IMAGE; mọi refs đúng
Course Unit, không deleted, pin verified object version. Một file có thể ở cả
inlineImages/attachments, không nới scope bằng request client.

Missing/foreign/detached ref404 MATERIAL_NOT_FOUND sau kiểm Material permission;
stale revision409 sau authorization. Ref bị EDIT/detach khi ký phải recheck,
không trả URL snapshot cũ. Student LOCKED/future/unpublished/hidden cũng404;
entitlement/assignment revoke403. Service signing/recheck, TTL/no-store/no redirect,
repeat/no side effects và errors§7 áp cho ba routes; không ghi ref/progress.

Nhóm FE giữ URLs trong memory, map image placeholder theo fileId/revision;
logout/context/revision đổi bỏ URLs/private HTML/player cũ. Attachment có thể
xem/tải qua signed GET; contract dùng inline filename, chưa thêm attachment
disposition query. Browser save/download phụ thuộc viewer/CORS, nghiệm thu riêng.
Không nhúng URL vào contentHtml/editor/DB hoặc dùng generic Files API.
Assets request theo nhu cầu;403/404 đóng/refetch content;409 refetch detail/resolve
lại; failed image hiện placeholder, retry hữu hạn, không poll vô hạn.

## 7. Errors, prerequisites và handoff cho routes đề xuất

Envelope như§1–3; reuse codes hiện có, DTO/Swagger/mapping phải test lúc implement.

| HTTP/code | Phạm vi/điều kiện | Hành động client |
|---|---|---|
| 400 HTTP_ERROR | Preview/asset path UUIDv4 invalid | Sửa ID/link, không retry |
| 401 AUTHENTICATION_REQUIRED | Session hết hiệu lực | Session recovery/login, dọn private state |
| 403 INSUFFICIENT_ROLE | Sai role actor route | Dừng, không đổi route để bypass |
| 403 MATERIAL_ACCESS_DENIED | Current role/account/assignment/ACTIVE/class permission fail | Refetch quyền/context, dừng viewer/assets |
| 404 MATERIAL_NOT_FOUND | Hidden/deleted/foreign Material hoặc asset không referenced | Đóng item/refetch, không dò fileId khác |
| 404 CLASS_NOT_FOUND/CLASS_UNIT_NOT_FOUND | Mentor/Student class context mất | Refetch roster/My Classes; đối chiếu Classes provider mapping khi implement |
| 409 MATERIAL_REVIEW_CONFLICT | Expected/current revision khác, EDIT lúc ký nhưng vẫn authorized | Refetch detail, xem bản hiện tại, user quyết định review lại |
| 409 FILE_NOT_READY | Mất READY giữa authorize và signer load | Dừng/refetch detail, không dùng URL cũ |
| 422 HTTP_ERROR | Required expectedRevision thiếu/sai hoặc query không hợp lệ | Sửa input, không retry |
| 422 MATERIAL_CONTENT_INVALID | Primary preview/download gọi ARTICLE | Dùng typed detail và scoped assets |
| 422 MATERIAL_SCOPE_MISMATCH | Server catalogue ancestry/content scope không nhất quán | Dừng, báo dữ liệu cần xử lý |
| 503 FILE_STORAGE_DISABLED/FILE_STORAGE_UNAVAILABLE | Access/signing storage tắt/lỗi | Metadata vẫn đọc, retry hữu hạn khi có thể |
| Network/5xx | GET response chưa tới hoặc storage bytes fail | Retry GET hữu hạn, không suy thành approve/đã học |

Prerequisites:3.3.1 typed/schema/refs/draft,3.3.2 Mentor context, staff preview/
assets cùng review3.3.3, Student server cases sau publication và release3.3.4;
private/versioned MinIO/public ingress/Range/CORS đúng môi trường. Metadata khi
MinIO disabled vẫn đọc được; cấp URL mới cần storage bật. Fixtures là local
evidence, không INSERT Material production để thay workflow create/review/release.

Người triển khai bàn giao Swagger/Postman, release SHA, migration/config order,
local results/no critical skips, safe IDs, smoke cases và rollback cho user
deploy. Nhóm FE nhận schema/error/revision/URL expiry contract, repo FE local
chỉ tham khảo. API/storage tests pass không thay evidence browser PDF/MP4/seek/
expiry/CORS; full integration ở3.6.

## Nhật ký planning — 2026-10-13

Lập plan phối hợp3.3/3.4; thêm contract dự kiến staff primary preview/scoped assets
và typed Student detail, đưa preview vào mốc review3.3.3. Thay đề xuất cũ chưa
implement POST `.../files/:fileId/access` bằng GET `.../assets/:fileId/access`
với expectedRevision; không thay endpoint source đang có. Chỉ tài liệu BE,
không source/FE/migration/runtime tests/deploy trong lượt này.
