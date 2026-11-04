# Phase 7 — API proposal bảng vẽ

## 04/11/2026 — Xác thực socket portable

Ngoài cookie same-origin hiện hữu, gateway nhận Socket.IO auth:{ticket}. Xin vé qua POST /api/v1/auth/realtime-ticket trước mỗi kết nối/reconnect; handshake dùng đúng Origin và channel chat/whiteboards. Hạn vé60s, socket không vượt access expiry và luôn kiểm session/quyền. Không gửi token trong query hoặc persistent storage. Chi tiết request/response/errors/deploy ở PHASE_1_flow-api-breakdown.md; đây là source local, chưa deploy.

> Cập nhật implementation 02/11/2026: Runtime BE local đã implement. Tham chiếu [runbook hiện hành](../PHASE_7_WHITEBOARD_RUNBOOK.md) cho protocol/limits/deviations. Assets: POST /whiteboards/:boardId/assets với {filename,mimeType,sizeBytes,pages?}; POST assets/:assetId/complete + Idempotency-Key; GET assets/:assetId; POST assets/:assetId/access. READY ID bind trực tiếp, không có endpoint bind riêng. PDF import trả assets qua status IMPORTED. Context GET board có envelope {board,context,capabilities}; control/reset/restore trả metadata trực tiếp. POST reset/restore trả 201. Các đoạn proposal bên dưới là baseline, không thay contract hiện hành này.

**02/11/2026 — PLANNED, CHƯA IMPLEMENT/DEPLOY.** Paths/DTO/events dưới đây là
đề xuất để chốt ở 7.0; chưa có Swagger/controller/test tương ứng. Không thay API
Files/Chat hiện hành. Assets/protocol còn cần spike, không được coi là FE gọi được.

[Flow](PHASE_7_FLOW.md) · [Plan](../implement_phase/phase%207/PHASE_7_WHITEBOARD.md) ·
[Progress](../progress/phase%207/PHASE_7_PROGRESS.md)

## Quy ước chung dự kiến

- REST `/api/v1`, same-origin proxy allowlist; WSS reverse proxy riêng, không qua
  Next REST catch-all. Cookie HttpOnly access_token, Origin allowlist cho write/WS.
  Auth recovery dùng cơ chế hiện có, không token trong JavaScript/query string.
- UUIDv4 path IDs, ISO timestamp có offset; bigint sequence/controlVersion serialize
  decimal string. DTO trực tiếp theo repo, không thêm global response envelope.
- Mentor phải có assignment buổi; Student FULL đúng buổi, không CASH_PREVIEW.
  Student sửa chỉ IN_PROGRESS+COLLABORATIVE. Server tính capabilities và kiểm lại
  từng thao tác, không suy quyền từ UI/role/chat membership.
- Command Idempotency-Key UUIDv4 theo actor/key/body; replay trả kết quả đã commit,
  khác body conflict. Control version tách content sequence. Snapshot/reset/restore
  kiểm epoch; destructive command còn kiểm sequence đang xem.
- List query page>=1/pageSize 1..50, default 1/20; response `{items,total,page,pageSize}`.
  Strict input, không nhận client actorId/classId/createdBy hoặc full state tùy ý.
- Business error names chốt theo implementation. Status proposal: 401 auth, 403
  denied, 404 absent/scope concealed, 409 stale/epoch/idempotency, 413 quota, 422
  validation, 429 rate, 503 dependency. Payload lỗi theo global filter hiện hành.
- UI: 401 recovery hữu hạn rồi login; 403 dừng; 409 giữ input/refetch/xác nhận ý
  định mới; 422 field error; 429 backoff; timeout/503 không retry mutation mù,
  giữ key/body để người dùng thử lại. GET có retry và loading/empty/error riêng.

## 7.1 — Context, tạo và mở bảng

### GET `/api/v1/class-sessions/:sessionId/whiteboard`

Mentor/Student có quyền buổi; UUIDv4, không query/body. Màn buổi học gọi trước mở
bảng, GET không tạo. 200 ví dụ chưa có board:

```json
{
  "sessionId": "11111111-1111-4111-8111-111111111111",
  "board": null,
  "capabilities": {"canView": true, "canCreate": true, "canEdit": false}
}
```

Khi có, board gồm id/title/mode/epoch/controlVersion/sequence/lastPersistedAt.
mode PRESENTATION|COLLABORATIVE, persisted time nullable. Workspace capabilities
còn gồm canControl/canUpload/canSnapshot/canRestore/canExport do server tính.
Board null hiện “Mentor chưa tạo bảng” hoặc nút Tạo bảng nếu canCreate, không coi
là 404 session. Lỗi 401/403/404 không nối WS; retry GET khi lỗi mạng. Query key theo
actor/session, invalidate sau create/control/entitlement change.

### POST `/api/v1/class-sessions/:sessionId/whiteboard`

Mentor canCreate, sau GET và bấm tạo. Body `{title?:string}` trim 1..250, default
tên buổi/PRESENTATION; Idempotency-Key. 201 metadata/capabilities như GET với board
khác null, board/checkpoint rỗng/schemaVersion persist atomic. Unique session:
replay key trả kết quả cũ; hai ý định khác gặp board đã có trả 409 rồi GET để mở.
401/403/404/409/422/503 theo quy ước. UI khóa gửi trùng, giữ key/body khi timeout;
thành công invalidate context và lấy boardId từ response, không nhập UUID thủ công.

### GET `/api/v1/whiteboards/:boardId`

Viewer có quyền, UUIDv4, không query/body. Route trực tiếp/refetch focus/reconnect.
200 metadata + display context session/class + capabilities/schemaVersion;
không full document, URL ảnh hoặc storage keys. Sync document qua WS sau GET.
401/403/404 dừng, lỗi GET retry. Query theo actor/board; không remount canvas chỉ
vì refetch metadata. Loading không dựng board giả.

## 7.2 — Control

### PATCH `/api/v1/whiteboards/:boardId/control`

Mentor canControl đổi tên/mode, UUIDv4 boardId. Body strict
`{expectedControlVersion:string,title?:string,mode?:"PRESENTATION"|"COLLABORATIVE"}`,
ít nhất một field đổi, title trim 1..250; Idempotency-Key. COLLABORATIVE chỉ bật
IN_PROGRESS. 200 metadata mới; serialize với update barrier, tăng control version,
phát event sau commit. Student mất edit thì server reject late update.
409 giữ form/refetch/xác nhận lại; 403 khóa control; 422 field error; 503 không
giả thành công. Invalidate metadata và cập nhật tool, không xóa live document.

## 7.4 — Mốc lưu, restore/reset

Mentor còn quyền lịch sử; path IDs UUIDv4, Student chưa có UI lịch sử. Prefix bảng
sau là `/api/v1/whiteboards/:boardId`. Command dùng Idempotency-Key/lỗi chung.

| Method/path | Input/thời điểm FE gọi | Success/side effect |
| --- | --- | --- |
| GET `/snapshots` | page/pageSize khi mở lịch sử | 200 list summary id/version/epoch/reason/createdAt/createdBy; không full binary |
| POST `/snapshots` | `{expectedEpoch:UUID}` sau pending updates được ACK | 201 summary mốc MANUAL chụp state server đã commit |
| GET `/snapshots/:snapshotId` | Mở preview từ list, không query/body | 200 summary + JSON projection/schemaVersion read-only, assets kiểm quyền riêng |
| POST `/restores` | `{snapshotId:UUID,expectedEpoch:UUID,expectedSequence:string,expectedControlVersion:string}` sau preview/xác nhận | 200 metadata epoch mới, BEFORE_RESET + restore nhất quán |
| POST `/resets` | Như restores bỏ snapshotId, xác nhận xóa nội dung | 200 metadata epoch mới/rỗng, mốc BEFORE_RESET trước clear |

Reason MANUAL|SESSION_END|BEFORE_RESET. SESSION_END do durable lifecycle event,
không nhận public reason tùy ý. Binary restore chỉ server đọc; large snapshot
limits/download phải chốt trước code, không trả payload vô hạn. Preview không
bind live Y.Doc. Không nhận JSON client làm nguồn chuẩn. List empty có nhãn rõ,
lỗi retry; invalidate list sau command/session-end. Snapshot sai board: 404.
409 khi có nét mới/epoch đổi thì yêu cầu xem lại và xác nhận, không tự đè. Reset/
restore fence writers, giữ mốc dự phòng, đổi epoch, mọi peer bỏ undo/pending cũ và
resync. Storage read/parse trước lock, recheck quyền/version khi commit. Không
clear nếu không lưu được mốc dự phòng. 403 dừng, dependency failure không nửa reset.

## 7.3 — Asset scope mới cần chốt

Chưa chốt upload routes/DTO board; Files hiện tại là material scope, không giả
định hỗ trợ Student/substitute/board. Trước integration phải bổ sung chi tiết
method/path, version, ví dụ, errors từng API trong chính tài liệu này.

| Ý định | Actor/input | Output/transition |
| --- | --- | --- |
| Intent | Mentor canUpload, boardId, filename/MIME/size | Receipt scoped board + PUT URL ngắn hạn |
| PUT bytes | Browser → storage, đúng bytes/Content-Type, credentials omit | Storage response, chưa có shape |
| Complete/status | Cùng actor/receipt, expected file version; status GET | PROCESSING/READY/FAILED, không tin versionId client tự khai |
| Bind | READY file đúng board/owner + idempotency | assetId để document tham chiếu |
| Access | Viewer còn quyền board + asset được tham chiếu | URL/expiresAt private no-store |

Đề xuất PNG/JPEG <=10MiB/20 megapixel decoded, cần spike đo; không đổi quota material.
Student upload để sau. Shape chứa assetId, không signed URL/base64/storage key.
UI có uploading/processing/binding/error; chỉ thêm shape sau READY+bind. Poll có
backoff/deadline, terminal/hết auth/rời trang thì dừng, có kiểm tra lại. Complete/
bind kết quả chưa xác định giữ receipt/key; 403 dừng, 409 đọc lại, FAILED chọn file
khác. Access URL chỉ ở loader tức thời, không Redux/Query/Web Storage/document.
Xóa phần tử vẫn giữ asset được snapshot tham chiếu. PDF thêm scope/quota ở 7.5.

## 7.4 PNG / 7.5 PDF — Export

Actor canExport, bản đầu Mentor; IDs UUIDv4, prefix `/api/v1/whiteboards/:boardId`.

| Method/path | Input | Success/side effect |
| --- | --- | --- |
| POST `/exports` | `{format:"PNG"|"PDF",scope:"VIEWPORT"|"CONTENT",viewport?:{x,y,width,height,scale},expectedEpoch:UUID}` + Idempotency-Key | 202 id/status QUEUED/format/sourceSequence/createdAt; chụp version nhất quán |
| GET `/exports/:exportId` | Poll khi chờ, không query/body | 200 id/status/format/sourceSequence/createdAt/completedAt/error; hai field cuối nullable |
| POST `/exports/:exportId/access` | Body rỗng khi click tải COMPLETED | 200 URL/expiresAt ngắn hạn sau kiểm quyền lại |

VIEWPORT cần finite values, width/height/scale >0 và quota pixel; CONTENT không
nhận viewport. Bounds/dimensions/retention chốt sau spike. PDF chưa bật trước 7.5.
Không render/storage IO trong DB transaction. Lặp key không tạo job trùng. 413
chọn vùng nhỏ hơn, 409 epoch đổi/chưa xong thì đọc lại, 403/404 dừng. Job status
QUEUED|RUNNING|COMPLETED|FAILED, poll nonterminal có deadline UI hữu hạn; rời trang/
hết auth thì dừng. Timeout UI không tự biến job thành FAILED, có kiểm tra lại.
Không cache signed URL. Export là file đầu ra, không là mốc restore.

## WebSocket proposal — spike 7.0

Path đề xuất `/ws/whiteboards` qua WSS cùng origin; cookie+Origin+object policy
trước sync. Room do server resolve; boardId không phải credential. Hết phiên/mất
quyền dừng fanout, không chỉ kiểm join. Không token query string.

| Ý định | Input/điều kiện | ACK/side effect |
| --- | --- | --- |
| Join/sync | boardId/known epoch/state vector, canView | Canonical epoch/schema/capabilities + state diff |
| Document update | updateId/epoch/binary bounded, canEdit hiện tại | Validate candidate → journal commit → durable sequence ACK → fanout |
| Awareness | Cursor hữu hạn/throttle | Server gắn danh tính, không tin userId/role client, không persist |
| Control changed | Server-only | FE khóa tool/refetch hoặc resync epoch |
| Access revoked | Server-only | Dừng fanout/đóng socket/xóa private state theo auth policy |

Raw y-websocket demo chưa có updateId/epoch/durable ACK, cần adapter/protocol
kiểm chứng; Socket.IO chat không tự tương thích. Connected/synced không phải DB
commit. Read-only chỉ gửi sync request/awareness hợp lệ, cấm sync response/update
có mutation. Kiểm binary/quota/schema trước commit/broadcast. Replay cùng actor/
board/epoch/updateId idempotent; epoch cũ reject, không tự rebase sau restore.
Undo local origins; tắt BroadcastChannel nếu chưa bảo đảm isolation user/session/
epoch. Logout/account switch hủy pending/doc, không mang bản nháp sang tài khoản.

## Điều kiện FE integration

Context → create nếu cần → metadata → join/sync → edit/ACK → upload/bind khi cần
→ snapshot/restore/export. Metadata fail không nối WS; WS fail không giả lưu local.
Cần migration/flags/public policy participants, Swagger/Postman, WSS proxy/Origin/
quota, storage access và workers sẵn sàng. Mỗi slice cập nhật DTO/examples/errors
từ source/test thật, đánh dấu implemented/local/deployed riêng. Lượt này chỉ
planning, không gọi API mới hoặc chứng minh deployment.
