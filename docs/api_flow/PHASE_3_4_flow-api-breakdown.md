# Phase 3.4 — FE integration: Student Materials

Cập nhật **2026-10-12**. Ba endpoints đã implement, local verified FILE/VIDEO;
chưa deploy. [Flow](PHASE_3_4_FLOW.md) · [Progress](../progress/phase%203/PHASE_3_4_PROGRESS.md).
ARTICLE/attachments/inline assets và staff authoring/review/release HTTP chưa có.

## Contract chung

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
