# Phase 3.4 — API handoff: Student Materials và staff preview

Cập nhật **2026-10-15**. Đã implement và local verified: ba Student GET (nay gồm
ARTICLE/inline images/attachments), Student file access POST (§4) và staff preview
POST cho Manager/Mentor (§5). **Chưa deploy/VPS, chưa nghiệm thu browser FE.**
[Flow](PHASE_3_4_FLOW.md) · [Progress](../progress/phase%203/PHASE_3_4_PROGRESS.md).
Authoring/review/release HTTP thuộc [3.3](PHASE_3_3_flow-api-breakdown.md) (đã có local).

[Plan hiện hành](../implement_phase/phase%203/PHASE_3_4_STUDENT_MATERIAL_ACCESS.md)
và [planning13/10 đã thay thế](../implement_phase/phase%203/PHASE_3_4_MATERIAL_ACCESS_PREVIEW.md).
§1–3 là ba Student GET; §4–5 là POST file access/staff preview đã implement local
ngày14/10. Contract FE phải khớp source/Swagger này; GET preview/assets trong
planning13/10 không phải API hiện hành. User nhận deploy/server acceptance,
nhóm FE tích hợp riêng; repo FE local chỉ đọc.

## Contract chung đã implement cho ba Student GET

Prefix `/api/v1`. Actor STUDENT, cookie `access_token`; browser FE dùng authenticated
same-origin adapter và `credentials` theo session client hiện có. Không gửi
studentId/role/fileId/bucket/key. Mọi route Student trả `Cache-Control: private, no-store`.
GET không có body/side effects/payment transition; response JSON trực tiếp,
không bọc `{data}`. UUID path **v4**, invalid400 HTTP_ERROR; query invalid422
HTTP_ERROR. Ví dụ IDs bên dưới là giả.

Prerequisites: migrations tới `ClassUnitReleaseAudit1791856800000` (16 source
migrations, 3.4 không thêm migration), Material APPROVED/published đúng revision qua
workflow 3.3, ACTIVE enrollment và Class Unit đã release (3.3.4). FILE là kind khác
VIDEO; VIDEO là verified MP4 ở Files3.2; ARTICLE là HTML đã sanitize ở 3.3.1.

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
ARTICLE chỉ được đếm khi mọi inline image/attachment còn READY đúng Course Unit
(inline phải IMAGE); FILE/VIDEO cũng cần mọi attachment READY.

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
    "file": { "id": "55555555-5555-4555-8555-555555555555", "originalFilename": "lesson.pdf", "mimeType": "application/pdf", "sizeBytes": 4096, "kind": "PDF" },
    "attachmentCount": 0
  }],
  "page": 1, "pageSize": 20, "total": 1, "asOf": "2026-10-12T09:00:00.000Z"
}
```

`id` dùng mở detail/download; classUnitId trong DTO là context lớp đang truy cập.
`contentType` ARTICLE/FILE/VIDEO chọn viewer. `file` **nullable**: null với ARTICLE
(không có primary binary), object với FILE/VIDEO. `attachmentCount` (number, mặc định0)
để hiện badge tệp đính kèm; danh sách **không** trả contentHtml/inline/attachments —
mở detail để lấy. `file.id` là metadata, không phải quyền gọi
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
không query nghiệp vụ/body. 200 trả **item cùng shape ở trên + 4 field detail**, không
page wrapper: `contentHtml` (string|null, chỉ ARTICLE), `contentSchemaVersion`
(1|null), `inlineImages[]` và `attachments[]` (cùng shape `file`, luôn là mảng,
có thể rỗng; sort theo fileId). Không có URL trong các mảng này.
Ví dụ request hợp lệ:

```http
GET /api/v1/me/classes/11111111-1111-4111-8111-111111111111/materials/33333333-3333-4333-8333-333333333333
Cookie: access_token=<session-cookie>
```

Context được resolve lại; Material phải thuộc Course Unit được dạy trong class,
current approval/release/publication/availability/READY phải còn hiệu lực.
Ví dụ ARTICLE (rút gọn các field chung):

```json
{
  "id": "66666666-6666-4666-8666-666666666666", "contentType": "ARTICLE", "revision": 2,
  "file": null, "attachmentCount": 1, "contentSchemaVersion": 1,
  "contentHtml": "<p>Bài đọc</p><img data-file-id=\"77777777-7777-4777-8777-777777777777\" alt=\"Sơ đồ\" />",
  "inlineImages": [{ "id": "77777777-7777-4777-8777-777777777777", "originalFilename": "diagram.png", "mimeType": "image/png", "sizeBytes": 2048, "kind": "IMAGE" }],
  "attachments": [{ "id": "55555555-5555-4555-8555-555555555555", "originalFilename": "lesson.pdf", "mimeType": "application/pdf", "sizeBytes": 4096, "kind": "PDF" }]
}
```

`contentHtml` là canonical HTML đã sanitize phía server (3.3.1 allowlist); FE vẫn
render trong vùng đọc bài và **không** chèn script/style. `<img>` chỉ có
`data-file-id`/`alt`, không `src`: FE lấy URL qua §4 cho từng `data-file-id` có trong
`inlineImages`, gán `src` trong DOM tạm thời, không ghi ngược URL vào HTML/cache.
FILE/VIDEO detail: `contentHtml`/`contentSchemaVersion` null, `inlineImages` rỗng;
FE gọi download (§3) hoặc access (§4) để có bytes/viewer URL.

Loading trong viewer, success hiển thị title/description/file; hidden404 hiển thị
“Tài liệu chưa khả dụng”, quay về/refetch list; không dò URL hoặc retry liên tục.
Khi đổi account/logout, abort request và xóa dữ liệu/private player trong memory.
Refetch detail trước tiếp tục học sau tab focus để cập nhật revision/quyền.

## 3. GET /api/v1/me/classes/:classId/materials/:materialId/download

Giữ nguyên contract cho **primary FILE/VIDEO**. ARTICLE không có primary nên trả
404 MATERIAL_NOT_FOUND; dùng §4 cho ảnh/attachments. FE bấm xem/tải hoặc chuẩn bị
player; IDs từ detail/list. Hai path required UUIDv4,
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

## 4. POST /api/v1/me/classes/:classId/materials/:materialId/files/:fileId/access

**Đã implement local 2026-10-14.** Actor STUDENT ACTIVE (cùng gates §2). Mục đích: lấy
signed URL ngắn hạn cho **một file thuộc Material đang xem**: primary FILE/VIDEO,
inline image ARTICLE hoặc attachment. FE gọi khi render ảnh `data-file-id`, khi user
bấm tải attachment, hoặc refresh URL player (thay cho download nếu muốn thống nhất).
`classId`/`materialId` từ detail, `fileId` từ `file.id`, `inlineImages[].id` hoặc
`attachments[].id` của **chính detail đó**.

| Input | Ràng buộc |
|---|---|
| classId, materialId, fileId (path) | Required UUID v4, invalid → 400 |
| Header `Origin` | Bắt buộc, phải nằm trong `CORS_ORIGINS` (POST + cookie); browser tự gửi |
| Body | Không dùng; gửi `{}` hoặc bỏ trống. Không nhận role/disposition từ client |

```http
POST /api/v1/me/classes/11111111-1111-4111-8111-111111111111/materials/66666666-6666-4666-8666-666666666666/files/77777777-7777-4777-8777-777777777777/access
Cookie: access_token=<session-cookie>
Origin: https://fe.example.test
Content-Type: application/json

{}
```

200 (không phải 201 — không tạo resource), `Cache-Control: private, no-store`:

```json
{
  "materialId": "66666666-6666-4666-8666-666666666666",
  "fileId": "77777777-7777-4777-8777-777777777777",
  "role": "INLINE_IMAGE",
  "revision": 2,
  "url": "https://storage.example.test/private/verified-object?versionId=v&X-Amz-Expires=60&X-Amz-Signature=example",
  "expiresAt": "2026-10-14T09:01:00.000Z"
}
```

`role` do server resolve: `PRIMARY` | `INLINE_IMAGE` | `ATTACHMENT` (file vừa inline
vừa attachment → INLINE_IMAGE). PRIMARY/INLINE_IMAGE ký `Content-Disposition: inline`,
ATTACHMENT ký `attachment` (trình duyệt tải xuống). `revision` là revision đã được
authorize; nếu khác revision trong detail FE đang hiển thị → refetch detail. URL pin
verified object version, TTL = `FILE_GET_TTL_SECONDS` (1..60, default60), Range206.

Side effect: không đổi state; mỗi lần gọi ký URL mới sau khi kiểm quyền. Server ký
ngoài transaction rồi **kiểm lại** detail: revision đổi hoặc file không còn thuộc
Material với cùng role → 404. fileId không thuộc Material (kể cả file READY khác cùng
unit hoặc primary của Material khác) → 404 MATERIAL_NOT_FOUND, không lộ tồn tại.
URL đã phát hành vẫn dùng được đến hết hạn sau revoke/unpublish.

UI: ảnh inline hiện skeleton tới khi có URL; lỗi 404 → placeholder “Ảnh không khả
dụng” và refetch detail một lần; 503 → retry hữu hạn theo thao tác user. Không
prefetch hàng loạt URL ngoài viewport; refresh khi `expiresAt` gần tới hoặc `<img>`
/player lỗi (một lần) rồi khôi phục currentTime. Không lưu URL vào localStorage/HTML.

## 5. Staff preview (Manager/Mentor)

**Đã implement local 2026-10-14.** Dùng để xem PDF/video/ảnh **trước khi duyệt**; không
dùng Student route thay thế và ngược lại. Hai route cùng response DTO §4, 200,
`Cache-Control: private, no-store`, header `Origin` bắt buộc, body `{}`/không body.

| Route | Actor | Điều kiện |
|---|---|---|
| POST `/api/v1/manager/materials/:materialId/files/:fileId/access` | MANAGER active | Material chưa xóa ở mọi reviewStatus (DRAFT/PENDING/APPROVED/REJECTED, published hay không); mọi reference READY |
| POST `/api/v1/mentor/classes/:classId/materials/:materialId/files/:fileId/access` | MENTOR được assign lớp (không CANCELLED), Course Unit thuộc lớp | Material APPROVED current + published, **hoặc** draft do chính mentor tạo trong lớp đó và chưa từng được duyệt (firstApprovedAt null) |

FE Manager: từ queue/detail 3.3 (`GET /manager/materials/:id`) lấy `file.id`,
`inlineImages[].id`, `attachments[].id`. FE Mentor: từ `GET /mentor/classes/:classId/materials/:id`.
Không dùng Files status API hay upload PUT URL làm preview.

| HTTP/code | Khi nào | FE xử lý |
|---|---|---|
| 401 AUTHENTICATION_REQUIRED | Hết phiên | Session recovery/login |
| 403 INSUFFICIENT_ROLE | Sai role trên route | Ẩn nút preview |
| 403 ORIGIN_NOT_ALLOWED | Thiếu/sai Origin | Lỗi cấu hình FE/proxy, không retry |
| 403 MATERIAL_ACCESS_DENIED | Mentor mất assignment/lớp hủy, actor inactive | Refetch context, dừng preview |
| 404 MATERIAL_NOT_FOUND | Material xóa/không có; fileId không thuộc Material; Mentor không được xem bản này; revision đổi lúc ký | Refetch detail |
| 409 FILE_NOT_READY | Manager: có reference không READY/thiếu metadata | Báo file lỗi, không retry |
| 503 FILE_STORAGE_DISABLED / FILE_STORAGE_UNAVAILABLE | MinIO tắt / ký lỗi | Báo tạm thời, retry hữu hạn |

## Errors và UI cho các API Student

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
| 403 ORIGIN_NOT_ALLOWED | §4 POST thiếu/sai Origin | Lỗi cấu hình FE/proxy, không retry |
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

FE cần allowlist thêm POST §4 (Student) và §5 (Manager/Mentor) trong proxy, gửi
Origin, giữ URL trong memory. Renderer ARTICLE: parse contentHtml đã sanitize, map
`img[data-file-id]` → §4, attachments list → §4 (role ATTACHMENT).

Local integration/compiled HTTP đã kiểm cookie roles, query/path, paging, safe DTO,
CASH pending→confirm, unit release, shared classes, revoke/unpublish, MinIO pinned
version/expiry/Range/PDF/MP4; từ 2026-10-14 thêm ARTICLE HTML/inline PNG/attachment
disposition, foreign fileId404, broken reference ẩn trước total, recheck sau ký,
staff preview pending/unpublished, role/Origin/UUID. Browser Range/seek/refresh/CORS,
UI FE và deployed/VPS acceptance **còn chờ**.

## Lịch sử contract — planning 2026-10-13, implementation 2026-10-14

Planning13/10 đề xuất GET preview/assets với expectedRevision và ARTICLE primary422. Các đề xuất chưa từng implement này đã được thay bởi contract POST files/access hiện hành: không expectedRevision query, response có revision, ARTICLE primary download404, disposition theo role. Giữ mục đích preview trước review, quyền/membership và recheck sau ký; không thêm các GET cũ vào FE allowlist. Chi tiết lịch sử tại [plan13/10](../implement_phase/phase%203/PHASE_3_4_MATERIAL_ACCESS_PREVIEW.md), implementation tại [plan hiện hành](../implement_phase/phase%203/PHASE_3_4_STUDENT_MATERIAL_ACCESS.md).

## Tích hợp với dev/Phase4 — 2026-10-15

Giữ implementation3.3/3.4 ngày13–14/10 và kế hoạch hiện hành15/10, cùng teaching/
attendance4.1–4.3 từ dev e0c9174. Planning GET preview/assets13/10 không thay contract
POST files/access đã implement14/10. ClassesModule giữ controllers/providers của
cả hai nhánh; Class completion guard Phase4 được giữ, fixture release3.3.4 được
điều chỉnh theo prerequisite Session terminal. Không mở quyền Materials cho substitute.
Hai migration compatibility mới đưa catalog thành22 mà không sửa migration cũ;
clean22, upgrade16→22 và17→22/data/FK/down-up có3/3 cases pass. Chi tiết quyết định
thứ tự/schema tại [progress3.3](../progress/phase%203/PHASE_3_3_PROGRESS.md).
Không đổi API3.3/3.4; không FE/development/VPS migration hoặc server/browser acceptance.

Kiểm chứng tích hợp15/10: pnpm check513/513 (48 suites), HTTP60/60 (5 suites)
qua cấu hình mặc định; lint/type-check/build pass. Migration compatibility3/3
đã chạy lại sau guard tên DB test. Không VPS/browser/FE hoặc live payment evidence.
