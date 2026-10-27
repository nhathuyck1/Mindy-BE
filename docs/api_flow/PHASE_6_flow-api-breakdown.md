## Kiểm tra môi trường integration test — 2026-10-27

Sáu suites Files/Materials failed vì thiếu TEST_DATABASE_URL tại beforeAll;
đã chạy lại PASS117 tests với PostgreSQL/MinIO và DB test riêng. Full pnpm check
PASS691/691,78 suites,0 skipped,lint/type-check/build PASS32 migration artifacts;
evidence tại Progress Phase6. README sửa hướng dẫn setup; contract,
routes, payload và quyền hiện hành giữ nguyên.

## Đồng bộ group chat local — 2026-10-27

Đã chạy backfill dry-run → apply → repeat (limit20) trên local:10 classes →10 groups, missing0; giữ1 DM,0 messages/0 notifications và original join/history/read state. Cờ local .env đã đặt CHAT_ENABLED=true/CHAT_JOB_ENABLED=true; key1 mới chỉ lưu .env ignored, DB chưa có message/receipt trước khi tạo key. Group DRAFT vẫn deny theo source. Không đổi API/quyền/schema hoặc bật attachments.

Cơ chế tự tạo đã có: class/enrollment/order/account trigger → lifecycle outbox → chat worker → reconcile group/DM/member. **Live worker còn chờ API restart** để đọc cờ mới. Automatic approval đã chặn stop/start tiến trình API port3000 (blocked by policy, không có lý do chi tiết); không thực hiện restart. User cần Ctrl+C rồi pnpm dev/pnpm start trong terminal API. Jobs chờ1 LIFECYCLE/9 REALTIME/9 NOTIFICATION; chưa tính là live auto-sync đã verify. Chi tiết/logs ở Progress Phase6; build/CLI/repeat và DB checks PASS, không chạy lại runtime suites cho thao tác vận hành này.

## Fixture SQL local — 2026-10-27

Đã thêm student Chi (`student.chi@gmail.com`, user UUID `1f9a0b9f-d88d-4ac9-940b-2821998b1d77`) vào lớp `HTML-CSS-101-ON1` / `0d92ff10-6a12-4571-b96f-719707221378` bằng SQL local. Tạo CASH pending48h + enrollment PENDING_PAYMENT, group/DM với primary mentor để test Phase6. Group conversation_id `98f91cca-b59e-4e74-aeb7-15c440ceddbd`; mentor peer_user_id `08939ff0-7497-421e-9b54-2765789981b4`. Không mở materials/quiz hoặc ghi nhận thanh toán thật. Chạy SQL lại no-op, xác nhận1 order/detail/enrollment và0 payment transactions; source eligibility true. Chi tiết/script local ở Progress Phase6; không đổi API/schema/flags hoặc chạy application suites trong lượt fixture này.

## Postman login từng phần test — 2026-10-27

[Mindy Chat Phase6 collection](../../postman/Mindy-Chat-Phase6.postman_collection.json) có5 nhóm C1–C5, M1–M4, R1/E1, N1–N4, F1–F4. Mỗi nhóm có folder **00 — Đăng nhập (chọn một vai trò)**: Login Student, Login Mentor và kiểm tra tài khoản hiện tại. Điền4 variables student_email/student_password/mentor_email/mentor_password trong environment local; base_url là host gốc (không thêm /api/v1), origin khớp CORS_ORIGINS.

Login POST /api/v1/auth/login: Content-Type application/json, Origin={{origin}}, body {email,password,deviceName:"Postman Phase 6"}; dùng credential variables của đúng role. Actor phải ACTIVE và có quan hệ class/conversation phù hợp cho các API sau. HTTP200 trả {user,accessTokenExpiresAt} và Set-Cookie access_token/refresh_token; login scripts kiểm200/role/ACTIVE, không lưu token vào variables. GET /api/v1/auth/me dùng cookie hiện tại, trả actor để xác nhận trước nhóm. Sai credentials/expired session có thể401; sai validation422; không có cookie hợp lệ thì các API protected401. Chỉ chọn một login cho vai trò muốn dùng; cookie jar theo host dùng lần login gần nhất. Send/edit/delete và upload intent/complete/status/send giữ author/uploader; inbox IDs thuộc actor hiện tại.

34 requests gồm19 chat/notification APIs giữ nguyên +10 login +5 auth/me. Parity check duyệt folder đệ quy và chỉ đối chiếu19 routes nghiệp vụ với Swagger. JSON/body/script syntax/exact-preservation/lint/type-check PASS; không phải evidence đã gửi requests hoặc đã deploy. Runtime contract/quyền/schema không đổi.

## Docker acceptance revision — 2026-10-26

Contract runtime/19 routes không đổi. H kiểm thêm parallel POST direct cùng conversation ID, Student không dùng được material Files upload, HTTP refresh/reconnect/history, quotas/packet limit, own-tab read/inbox và process crash/restart. Delayed message:created sau delete được project thành tombstone current version2; ack bị mất sau commit replay đúng messageId, event emit trước complete có thể tới lại với cùng eventId.

DB dev đã migrate16→32 và repeat no-op, có backup trước migration. [Evidence39/39 AC local](../progress/phase%206/PHASE_6_PROGRESS.md#docker-acceptance-2026-10-26) phân biệt local complete, dev migration và FE/VPS pending. H kiểm34 ca chat, gồm24 per-delivery revoke barriers và contract/log canaries; toàn bộ HTTP117/117 PASS. Client6 commands/ack và server9 events/capabilities đã đối chiếu payload thực; bảng socket bên dưới đã sửa shorthand event, envelope, ack requestId và typing quota. Runtime API/quyền giữ nguyên.


## Nghiệm thu contract — 2026-10-26 (lịch sử lượt trước Docker)

Không đổi request/response/status hoặc19 routes đang có. Test compiled HTTP đã đối chiếu tập method+path Postman với Swagger runtime, không chỉ kiểm một path. Đã bổ sung kiểm chứng edit đúng900000ms/+1ms, replay sau16 phút/delete, concurrent cursor/no-op timestamp, inbox read không nâng conversation read và read-all snapshot không nuốt fanout commit sau snapshot.

Đây là local backend evidence. [Ma trận nghiệm thu39 AC](../progress/phase%206/PHASE_6_PROGRESS.md#nghiệm-thu-tự-động-theo-slice--2026-10-26) ghi13 PASS/26 PARTIAL, phần network-crash/revoke/catchup/file races và FE/VPS còn thiếu. Chưa đóng Phase6, chưa có browser/deployment acceptance. Kết quả toàn bộ tests hiện hành xem cùng Progress6.

# Phase 6 — API/event: Chat và Notification

## Runtime revision — 2026-10-24

19 routes và các socket commands đã có source. Chưa deploy; gates xem Progress6. Swagger có schemas/errors/DTO validation, Postman Mindy-Chat-Phase6. Các ghi chép planning bên dưới giữ lịch sử; những khác biệt dưới đây thay proposal tương ứng.

- Pagination runtime: limit mặc định20, tối đa100; cursor signed, actor/scope/filter bound. Inbox unreadCount lấy N2, không nằm trong page meta. CLASS ở DB serialize GROUP. Tất cả HTTP response chat no-store.
- UUID path malformed400, DTO422 VALIDATION_ERROR, service422 CHAT_INVALID_INPUT; REST Origin dùng ORIGIN_NOT_ALLOWED hiện hữu. Ngoài resource scope404 CHAT_NOT_FOUND; WS ack ok/data hoặc ok/error, rate error có retryAfterMs.
- Replay event type là message:created/updated/deleted hoặc conversation:membership-changed. Message DTO luôn current version/tombstone; không phục hồi body cũ. JOIN không cấp DB membership. Actor SYSTEM của membership event không giả UUID.
- F1 cần Idempotency-Key UUIDv4, flat response {fileId,uploadUrl,requiredHeaders,uploadUrlExpiresAt,intentExpiresAt,replayed}. 201 mới/200 pending replay; khác declaration409 CHAT_IDEMPOTENCY_CONFLICT, closed409 CHAT_UPLOAD_CLOSED. Intent15 phút, PUT tối đa5 phút, quota10 open intents/user. Exact retry giữ cùng key và declaration.
- F2 trả202 PROCESSING/200 READY, DTO giống F3. Pin version ở complete, không storage I/O trong transaction. Storage503 CHAT_STORAGE_UNAVAILABLE, size422 CHAT_FILE_SIZE_MISMATCH, expiry409 CHAT_UPLOAD_EXPIRED. Complete lặp không thêm job.
- F3 chỉ uploader owner có current canRead: {id,status,originalFilename,errorCode,file}; file nullable hoặc {id,originalFilename,mimeType,sizeBytes,kind}. Status thêm DELETING. Người nhận xem attached metadata trong MessageDto, tải qua F4; không dùng F3 để đọc intent người khác.
- F4 trả {url,expiresAt}, attachment disposition cố định; không trả field disposition. Hidden/deleted/not READY404, flag/storage503; URL sống tối đa60s. Binary không được AES message-body mã hóa.
- NotificationDto runtime {id,type,actorId,conversationId,messageId,title,body,data,readAt,createdAt}, generic body “Bạn có tin nhắn mới.” N1 meta chỉ cursor/hasMore; N2 trả unreadCount. N3 PATCH, không nâng conversation cursor. N4 trả {readAt,resyncRequired:true}, snapshot IDs không đánh read notification commit sau snapshot.
- canAttach = canSend && CHAT_ATTACHMENTS_ENABLED && MINIO_ENABLED; vẫn kiểm membership/current source. CHAT_ENABLED=false trả503 CHAT_DISABLED và không mở socket/worker; text/read/inbox không phụ thuộc storage.

Các mục C1–E1 dưới đây giữ request/response/flow đã triển khai với page defaults ở trên; các response proposal F1/F3/F4/N1/N4 cũ được revision này thay thế. Tests, Postman và schemas Swagger là contract runtime để đối chiếu.

## Baseline proposal và hướng dẫn FE chi tiết — đọc cùng runtime revision

2026-10-24 · **PLANNED: tất cả routes/events dưới đây chưa implement/chưa deploy.**
Baseline `dev@cc8d843`.
[Plan](../implement_phase/phase%206/PHASE_6_CHAT_NOTIFICATIONS.md) ·
[Flow](PHASE_6_FLOW.md) · [Progress](../progress/phase%206/PHASE_6_PROGRESS.md).

2026-10-24 — Schema ở plan đã được tách thành bảng cột dễ đọc. Không thay routes,
request/response/event hoặc trạng thái planned của contract trong lượt này.

2026-10-24 — Lập chi tiết slices trong plan; bổ sung readiness matrix ở mục8 dưới
đây. Giữ nguyên19 REST proposals và payload đã đề xuất. Làm rõ read handler mở6.4,
notification6.5, file/image6.6; Swagger/Postman/harness được bổ sung cùng slice có
runtime,6.7 tổng hợp kiểm đủ. Không route/event nào đã implement do lượt planning này.

## 1. Contract chung cho toàn bộ API

- REST prefix `/api/v1`, cookie HttpOnly `access_token`; actor ACTIVE, current role,
  session hợp lệ. STUDENT/MENTOR cho chat; manager/admin không tự đọc được chat.
  REST dùng auth HTTP, WS cần middleware/guard/filter riêng tái dùng auth services.
- Exact Origin allowlist cho REST mutations/handshake; CORS credentials không thay
  CSRF defense. Browser gửi credentials đúng backend host. Không token trên URL.
- IDs UUIDv4 normalize lowercase, unknown fields/invalid DTO422, JSON lỗi400,
  HTTP body>64KiB413. Sequence decimal string0..signed-bigint-max, version int>=1.
  UTC ISO8601 timestamps; FE hiển thị timezone người dùng, không parse sequence
  bằng Number hoặc sort chuỗi thay numeric comparison.
- Text1..4000 ký tự, không trắng,<=16KiB UTF-8. Giữ text gốc khi so retry, không
  HTML; FE escape khi render. Không nhận senderId/role/room/key/ciphertext từ client.
- Page `{data,meta:{nextCursor,hasMore}}`, cursor opaque signed<=2048 ký tự, bound
  actor/resource/filter/direction/watermark. Limit int1..50 default20; history/events
  int1..100 default50. Item trả DTO trực tiếp, không thêm envelope success chung.
  Cache-Control no-store. Trước khi trả empty/count vẫn phải authorize resource.
- `canRead/canSend/canAttach/canType` từ server; canAttach=false trước slice6.6.
  Completed read-only; CASH pending hợp lệ có chat nhưng không mở materials.
  Group history từ lần join hiện tại, rejoin reset mốc; DM cặp user giữ history
  khi quan hệ hợp lệ trở lại. Policy chi tiết ở plan, không suy quyền từ role đơn lẻ.

### DTO dùng chung và ví dụ

```json
{
  "id": "11111111-1111-4111-8111-111111111111",
  "type": "GROUP",
  "classId": "22222222-2222-4222-8222-222222222222",
  "name": "Lớp Mindy A",
  "peer": null,
  "capabilities": {"canRead": true, "canSend": true, "canAttach": false, "canType": true},
  "accessMode": "CASH_PENDING",
  "lastReadSequence": "0",
  "highWatermark": "12",
  "unreadCount": 2,
  "lastMessage": null,
  "activityAt": "2026-10-24T03:00:00.000Z"
}
```

`ConversationDto`: GROUP/DIRECT; DIRECT classId/name=null và peer
`{id,displayName,avatarUrl}`, GROUP peer=null. Không contact/payment/secret.
accessMode CASH_PENDING/ACTIVE/HISTORY_READ_ONLY. lastMessage=authorized MessageDto
hoặc null, activityAt là last activity hoặc createdAt. unreadCount>=0 chỉ tin người
khác chưa xóa trong history scope. highWatermark là conversation event sequence.

```json
{
  "id": "33333333-3333-4333-8333-333333333333",
  "conversationId": "11111111-1111-4111-8111-111111111111",
  "sender": {"id": "44444444-4444-4444-8444-444444444444", "displayName": "Học viên A", "avatarUrl": null},
  "clientMessageId": "55555555-5555-4555-8555-555555555555",
  "sequence": "12",
  "lastChangedSequence": "12",
  "type": "TEXT",
  "body": "Thầy cho em hỏi bài này với",
  "file": null,
  "replyTo": null,
  "version": 1,
  "createdAt": "2026-10-24T03:00:00.000Z",
  "editedAt": null,
  "deletedAt": null
}
```

`MessageDto`: decrypted body chỉ sau authorize; clientMessageId chỉ trả sender,
người khác=null. FILE/IMAGE file={id,originalFilename,mimeType,sizeBytes,kind}, không
storage key/URL. replyTo={id,senderDisplayName,deleted}, không recursive quote body.
Deleted message có body/file/replyTo=null, giữ id/sequence/version/sender tối thiểu.
Không DTO nào chứa IV/tag/keyVersion hoặc raw DB entity.

### Errors chung, áp dụng từng route/event

Error HTTP `{statusCode,code,message,requestId?,details?,retryAfterMs?}`; code mới là
proposed, implementation phải map HTTP/WS tương ứng, không expose SQL/internal error.

| Status/code | Ý nghĩa | Hành động FE |
|---|---|---|
| 401 AUTHENTICATION_REQUIRED | Token/session/account hết hiệu lực | Refresh HTTP hiện có một lần, reconnect/refetch; vẫn401 thì login. |
| 403 CHAT_ORIGIN_DENIED | Origin sai/thiếu | Dừng retry, sửa cấu hình. |
| 404 CHAT_NOT_FOUND | Không tồn tại hoặc ngoài scope | Clear selection/cache, refetch list; không phân biệt existence. |
| 403 CHAT_READ_ONLY | Có read nhưng không write | Disable controls, refetch capability. |
| 409 CHAT_IDEMPOTENCY_CONFLICT | Key cũ với payload khác | Dừng auto retry, không tự đổi ID. |
| 409 CHAT_VERSION_CONFLICT | expectedVersion cũ | Refetch, user quyết định sửa lại. |
| 409 CHAT_EDIT_WINDOW_CLOSED / CHAT_MESSAGE_DELETED | Hết hạn sửa/đã xóa | Refetch, đóng editor. |
| 422 CHAT_INVALID_INPUT / CHAT_CURSOR_INVALID | DTO/reply/sequence/cursor lỗi | Sửa input/reset cursor, không blind retry. |
| 429 CHAT_RATE_LIMITED | Quá giới hạn | Chờ retryAfterMs, giữ retry ID cho cùng thao tác. |
| 410 CHAT_RESYNC_REQUIRED | Event cursor ngoài90 ngày | Tải snapshot/history mới, không tự mark read. |
| 503 CHAT_DISABLED / CHAT_PROVISIONING | Tắt feature/nhóm chưa sẵn sàng | Disabled dừng; provisioning backoff1/2/4/8s tối đa4 lần rồi nút retry. |
| 503 CHAT_CRYPTO_UNAVAILABLE / CHAT_STORAGE_UNAVAILABLE | Crypto/storage lỗi | Generic error, retry hữu hạn, không fallback plaintext. |

Mọi route có loading→success/empty/error,401 flow chung; scope404 kể cả page rỗng.
Mutation replay vẫn authorize lại. Missing key startup fail khi chat enabled; runtime
crypto failure chỉ trả503 generic. Các error riêng bổ sung ngay dưới từng API.

## 2. Conversation APIs — slice6.2

### C1. GET /api/v1/chat/conversations

Actor STUDENT/MENTOR, inbox sau login. Query type=GROUP|DIRECT optional,limit/cursor
theo mục1; ví dụ `?type=GROUP&limit=20`. Không body/userId.200 page ConversationDto,
activityAt DESC,id DESC; empty data=[],nextCursor=null. Không side effects/provision.
Cursor keyset không snapshot toàn inbox đang đổi; live event/return focus refetch
trang đầu và merge id. Cursor lỗi reset page;503 disabled dừng. Chọn id để C4/M1.

### C2. POST /api/v1/chat/conversations/direct

Student/mentor mở peer từ eligible class context/roster hiện có. Body required
`{"peerUserId":"44444444-4444-4444-8444-444444444444"}`; UUID khác own ID, peer ACTIVE,
role đối ứng, có lớp chung hợp lệ. Không browse toàn users.201 mới/200 existing
`{conversation:ConversationDto,created:boolean}`. Sorted pair unique đảm bảo concurrent
ensure chỉ một DM/hai member; không tự gửi tin. Completed chỉ mở existing history,
chưa có DM thì403 read-only. Self/role mismatch422,peer ngoài scope404. FE lấy id
để history/join, refetch inbox; retry không tạo conversation mới.

### C3. GET /api/v1/classes/:classId/chat

Actor có current chat scope lớp, gọi từ nút chat màn hình lớp/CASH preview.
classId UUID từ class list; không query/body.200 group ConversationDto, completed
canSend=false. Không tạo nhóm/membership trên GET. Class ngoài scope/cancelled404,
chưa provision503 CHAT_PROVISIONING, FE retry hữu hạn rồi nút retry; không POST
tạo group thủ công. Dùng conversation.id cho C4/C5/M1/join.
Source đủ quyền nhưng member projection còn thiếu cũng trả provisioning; ngoài
source scope luôn404, không leak trạng thái provision. DRAFT chưa mở student chat.

### C4. GET /api/v1/chat/conversations/:conversationId

Actor current member+source rights; id từ C1/C2/C3 hoặc notification; không body/query.
200 ConversationDto, không mark read. FE refresh sau payment/reassignment/focus;
404 thoát chat/refetch C1. Capability dùng để bật composer thay vì tự suy status.

### C5. GET /api/v1/chat/conversations/:conversationId/members

Actor canRead, panel members sau C4; query limit20,max50,cursor.200 page
`{data:[{userId,displayName,avatarUrl,role,joinedAt,lastReadSequence}],meta}`;
role ADMIN/MEMBER, không email/phone/payment. Current eligible members, joinedAt
ASC,userId ASC; không expose left/revoked roster lịch sử. Không side effects.
FE refetch khi mở panel; empty đúng scope hợp lệ,404 dừng kể cả page rỗng.

## 3. Messages, read và catchup

### M1. GET /api/v1/chat/conversations/:conversationId/messages

Actor canRead; FE chọn conversation/cuộn lên. Query limit50,max100,cursor optional;
không arbitrary sender/beforeSequence.200 page MessageDto với meta thêm highWatermark.
Chọn newest creation sequence DESC rồi trả từng page ASC; nextCursor lấy trang cũ
hơn, giữ highWatermark snapshot. Lọc visible_from_seq và giữ tombstones; không
mark read. FE join/buffer events trước snapshot hoặc catchup từ highWatermark để
không có gap; merge id/version, nextCursor=null thì dừng load more.404 thoát chat,
503 crypto hiển thị lỗi chung, không expose ciphertext.

### M2. POST /api/v1/chat/conversations/:conversationId/messages

Actor canSend; REST fallback và socket message:send dùng cùng application service.
Body clientMessageId UUIDv4/type required, body/replyToMessageId/fileObjectId optional
theo type. Ví dụ:

```json
{"clientMessageId":"55555555-5555-4555-8555-555555555555","type":"TEXT","body":"Em chào thầy"}
```

TEXT cần body, cấm file; FILE/IMAGE cần fileObjectId READY/own/conversation scoped,
caption optional nhưng khi có không trắng. Reply cùng conversation, visible/not deleted.
Foreign reply/file404; file chưa READY409 CHAT_FILE_NOT_READY; trước6.6 file type409
CHAT_ATTACHMENTS_DISABLED. Không senderId/receiverId; principal là nguồn sender.
201 mới/200 replay `{message:MessageDto,replayed:boolean}`. Message+receipt+event+
dispatch+eligible recipient cutoff commit rồi response; không ack trước commit.
Key cũ khác canonical original request409; replay sau edit/delete trả current DTO/
tombstone, không body gốc, không tạo lại event/inbox. FE optimistic pending→persisted,
merge theo clientMessageId/id, lost ack gửi lại cùng ID/input. Không phát đồng thời
HTTP+WS trừ retry cùng identity. Ack không đồng nghĩa delivered/read.

### M3. PATCH /api/v1/chat/conversations/:conversationId/messages/:messageId

Tác giả current canSend, trong15 phút theo server clock; IDs từ MessageDto.
Header Idempotency-Key UUIDv4 required; body `{"expectedVersion":1,"body":"Nội dung sửa"}`.
Chỉ body/caption, không type/file/reply. Caption FILE có thể null, TEXT không null.
200 `{message,replayed}`; version++,editedAt,encrypt với IV mới, event MESSAGE_UPDATED
và dispatch cùng commit. Không đổi creation sequence, không tạo notification/unread
mới.409 version/key/window/deleted; foreign author404. FE success đóng editor,
conflict refetch trước quyết định mới; chỉ retry cùng key khi cùng thao tác.
Receipt đã commit replay sau15 phút được trả current DTO nếu còn quyền; không
kiểm window/version như mutation mới, không thực hiện edit lại.

### M4. DELETE /api/v1/chat/conversations/:conversationId/messages/:messageId

Tác giả current canSend, không giới hạn15 phút. Header Idempotency-Key UUIDv4;
query expectedVersion int>=1 required, không body.200 `{message,replayed}` tombstone
vì FE cần version, không204. Transaction version++/deletedAt/event/job, giữ identity
dedupe, revoke file access; cleanup sau grace. Same receipt replay200; key khác
version cũ409; deleted+current expectedVersion trả tombstone no-op không event mới.
FE bỏ body/file/quote,409 refetch,404 stop; không hard-delete để tái dùng client ID.

### R1. PUT /api/v1/chat/conversations/:conversationId/read

Actor canRead; gọi khi chat visible và đã render tới mốc, không background fetch.
Body `{"throughSequence":"12"}`; phải tồn tại, trong scope và<=last_event_seq.
200 `{conversationId,lastReadSequence,lastReadAt,unreadCount}`. Atomic max cursor;
repeat/out-of-order tabs không lùi, timestamp chỉ đổi khi tăng. Đánh read own
notifications tới mốc và phát conversation:read; không tạo message event.
422 future/out-of-scope,404 lost access. FE debounce, update own tabs/badge;
read cursor không suy ra transport delivery hoặc online status.

### E1. GET /api/v1/chat/conversations/:conversationId/events

Actor canRead, reconnect sau snapshot. Query afterSequence required exclusive,
throughSequence optional trang đầu,limit50,max100; **hoặc** cursor của page kế tiếp
thay toàn bộ after/through (không trộn). Server chốt throughSequence ở page đầu.
200 `{data:[{eventId,sequence,type,message,occurredAt}],meta:{nextCursor,hasMore,
throughSequence}}`, ASC sequence. MESSAGE_CREATED/UPDATED/DELETED trả current
MessageDto, không raw event payload. MEMBERSHIP_CHANGED message=null, FE refetch
C4/C5. Event type có thể cũ hơn DTO hiện tại; luôn ưu tiên message.version.
Không mark read; filter unauthorized history. Có gap sequence do filter hoặc edit;
chỉ advance checkpoint tới upper watermark khi hasMore=false.410 retention,422
future/malformed,404 lost scope. FE buffer live events, dedupe eventId và upsert
messageId/version; không phát lại body cũ hoặc phục hồi tin đã deleted.

## 4. Socket.IO — slice6.3–6.5

Namespace `/chat`, engine path `/socket.io`, cùng backend TLS host; không tự có
prefix REST. Client socket.io-client, không native WebSocket:

```ts
io(backendOrigin + '/chat', {
  path: '/socket.io', transports: ['websocket'], withCredentials: true,
});
```

Handshake verify cookie+exact Origin+JWT/session/current role. Token exp đóng cả
socket im lặng; FE refresh HTTP một lần rồi reconnect. Không gửi refresh token lên
socket; connectionStateRecovery tắt v1. DTO validation và error filter WS riêng.
Ack mọi command `{ok:true,data:...}` hoặc `{ok:false,error:{code,message,statusCode,
retryAfterMs?}}`; runtime không gắn requestId vào ack. Namespace JWT/session failures
trả connect_error.data `{code,statusCode}`; Origin bị chặn ở Engine.IO nên transport
connect_error không bảo đảm có data/code nghiệp vụ.

| Client event | Payload/precondition | Ack và side effect |
|---|---|---|
| conversation:join | `{conversationId}`, canRead sau C4/M1 | `{conversationId,highWatermark}`; subscribe socket, không tạo DB member/read. Duplicate no-op. |
| conversation:leave | `{conversationId}`, principal hợp lệ | `{conversationId}`; unsubscribe socket, không rời nhóm DB. Chưa join no-op. |
| message:send | `{conversationId,...M2 body}`, canSend | `{message,replayed}` sau commit, lỗi/constraints như M2, không bắt buộc đã subscribe. |
| message:read | `{conversationId,throughSequence}`, canRead | R1 DTO/side effects; lặp monotonic. |
| typing:start | `{conversationId}`, joined+canSend | `{expiresInMs:5000}`, ephemeral không DB/outbox. |
| typing:stop | `{conversationId}`, joined+canSend | `{expiresInMs:0}`, cùng quota1/2s như start; phát typing:changed với isTyping=false. |

Sửa/xóa qua REST M3/M4 v1, không thêm socket command trùng chức năng.

| Server event | Payload | FE behavior |
|---|---|---|
| message:created | `{eventId,sequence,conversationId,type,occurredAt,message}` | Dedupe eventId, upsert current version; delayed create có thể mang tombstone. |
| message:updated | `{eventId,sequence,conversationId,type,occurredAt,message}` | Upsert current version, không dùng event để khôi phục body cũ. |
| message:deleted | `{eventId,sequence,conversationId,type,occurredAt,message}` | Message tombstone/body=null; giữ identity/version để dedupe retry. |
| conversation:read | `{conversationId,userId,lastReadSequence,lastReadAt,unreadCount}` | Monotonic read update; refetch badge. |
| conversation:membership-changed | `{eventId,sequence,conversationId,type,occurredAt,message:null}` | Refetch C4/C5, không cấp quyền từ event. |
| conversation:access-changed | `{conversationId,reason:"ACCESS_REVOKED"}` | Own affected sockets only, hint không content; clear cache/refetch C1. |
| typing:changed | `{conversationId,userId,isTyping,expiresInMs}` | TTL local, clear disconnect/revoke/timeout, không catchup. |
| notification:created | `{notification:NotificationDto}` | Own sockets, upsert inbox/refetch count. |
| notifications:read | `{readAt,resyncRequired:true}` | Own tabs refetch inbox/count. |

Room chỉ là candidate routing. Dispatcher revalidate từng recipient/socket trước
content/read/typing delivery, không blind room broadcast. Session/account/relation
revoke xử lý cả passive receivers; không chờ client gửi command mới. Bytes đã phát
trước revoke không thể thu hồi. Packet<=32KiB; send20/phút/user + burst5/giây,
typing<=1/2s/user/conversation TTL5s,5 sockets/user,20 subscriptions/socket.429 của
send/typing có retryAfterMs; socket/subscription cap không bảo đảm field này.
Oversize bị reject/disconnect, không auto retry vô hạn.

## 5. Chat attachments — slice6.6

Đây là APIs mới scoped chat. FilesController cũ chỉ Manager/Mentor CourseUnit,
không đủ quyền Student chat. Không nới blanket Roles hoặc giả courseUnitId cho DM.
Actor canAttach=canSend+feature flag, conversation id lấy C4. Defaults JPEG/PNG/WebP
<=5MiB,PDF<=10MiB,một file/message. Files storage/validator được tái dùng qua public
provider; schema purpose CHAT và ownership là prerequisite trước bật canAttach.

### F1. POST /api/v1/chat/conversations/:conversationId/attachments/upload-intents

FE chọn file khi canAttach. Header Idempotency-Key UUIDv4; body required
`{originalFilename,declaredMimeType,declaredSizeBytes}` với filename1..250,MIME1..150,
size int>0 theo allowlist.201 mới/200 replay `{file:{id,status:"PENDING_UPLOAD"},
upload:{method:"PUT",url,headers,expiresAt}}`. Retry intent pending có thể cấp URL
mới; complete/expired409 CHAT_UPLOAD_CLOSED,khác declaration cùng key409. Unsupported
422 CHAT_FILE_UNSUPPORTED,storage503,foreign scope404/read-only403. FE PUT bytes tới
storage URL đúng headers, không BE/socket. Intent không tự thành message/inbox.

### F2. POST /api/v1/chat/conversations/:conversationId/attachments/:fileId/complete

Owner uploader current canAttach; fileId từ F1, sau PUT; body `{}`.202 queued file
DTO,200 READY replay. Complete lặp không thêm job, chốt immutable object version,
validator actual MIME/size/content.409 missing object/closed,404 foreign,422 invalid
declaration. FE hiển thị validating rồi F3;202 không đồng nghĩa gửi file được.

### F3. GET /api/v1/chat/conversations/:conversationId/attachments/:fileId

Pending file chỉ uploader current scope; attached file metadata cần visible message.
Không body/query.200 `{id,status,originalFilename,mimeType,sizeBytes,kind,failureCode}`;
status PENDING_UPLOAD/PROCESSING/READY/FAILED/DELETED, failureCode nullable. FE poll
1/2/4/8s tối đa60s, dừng READY/FAILED/DELETED/404/timeout; retry status chủ động,
không tự tạo intent khác. READY dùng file.id trong M2. Completed vẫn đọc attached
metadata nhưng không complete/upload. Chưa có URL ở response này.

### F4. POST /api/v1/chat/conversations/:conversationId/messages/:messageId/file-access

Actor canRead, message visible/not deleted, file READY; click xem/tải, body `{}`.
200 `{url,expiresAt,disposition}`, signed GET TTL<=60s. Lặp cấp URL mới không mutation
message; không persist URL.404 hidden/deleted,409 not READY,503 storage. FE GET storage
URL, hết hạn xin lại1 lần qua BE sau authorize. URL đã phát còn hiệu lực tối đa TTL
sau revoke. AES body không mã hóa binary; storage encryption được xử lý riêng.

## 6. Notification inbox — slice6.5

Own inbox, không userId query; account/session hợp lệ. NotificationDto
`{id,type:"CHAT_MESSAGE",title:"Tin nhắn mới",body:"Bạn có tin nhắn mới",
actor:{id,displayName},data:{conversationId,messageId},readAt,createdAt}`;
actor=null nếu unavailable. Không actual chat text/contact/file URL.
List/count/read đều lọc current resource rights, target deleted bị suppress. Fanout
async idempotent,không sender,không người gia nhập sau cutoff; online không quyết
định tạo hay bỏ inbox. Không email/push/payment automation trong v1.

### N1. GET /api/v1/notifications

FE mở chuông/return focus; query unreadOnly boolean defaultfalse,limit20,max50,cursor.
200 NotificationDto page,createdAt DESC,id DESC,meta thêm unreadCount. Empty bình
thường; không mark read. Sau notification event/mark read/scope change refetch first
page/count; item ngoài scope filter khỏi list, không lỗi cả page.401 flow chung.

### N2. GET /api/v1/notifications/unread-count

FE badge sau login/reconnect/focus; không query/body.200 `{"unreadCount":0}` ví dụ,
own visible unread count,không raw DB count. Read-only. Không poll mỗi giây;
socket event có thể mất nên reconnect phải refetch;401 flow chung.

### N3. PATCH /api/v1/notifications/:notificationId/read

FE click item id từ N1; owner+resource scope,body `{}`.200 NotificationDto với readAt
server set-once,lặp idempotent không cần key;own tabs nhận notifications:read.
Không nâng conversation cursor.404 foreign/hidden/deleted thì bỏ item/refetch N1/N2.
Sau success C4→M1; quyền có thể đổi trước C4 nên vẫn xử lý404,không giả quyền từ inbox.

### N4. POST /api/v1/notifications/read-all

FE bấm đánh dấu tất cả,body `{}`.200 `{updatedCount,readAt,unreadCount}`.Một DB statement
chốt own visible unread tại command snapshot;notifications tới sau snapshot vẫn
unread. Repeat là lệnh mới trên tập lúc đó,không receipt replay; FE không auto retry
mất response vì có thể đánh read tin mới đến,refetch trước retry chủ động. Không
nâng conversation cursor;own tabs resync inbox/count.401/503 giữ UI và retry chủ động.

## 7. Handoff và readiness

Login HTTP→C1/C3→C4/M1→join+buffer/E1 catchup→send/read. Loading/empty/error riêng
từng bước. Return focus/reconnect refetch capabilities/inbox/count, không history
polling khi socket hoạt động; chỉ bounded provisioning/file polling.
clientMessageId giữ qua retry của cùng thao tác; không hứa giữ pending text sau
reload nếu FE chưa có chiến lược lưu an toàn. Không log body/token/key.
Trước slice sẵn sàng routes chỉ là proposal. Swagger REST/Postman bổ sung cùng
slice mở route; runnable Socket.IO harness bắt đầu6.3 và mở rộng theo từng slice.
6.7 tổng hợp full gates/handoff/evidence. Lượt planning chưa có runtime PASS.

## 8. API/event readiness theo slice — chưa implement

| Slice | Contract mở sau khi nghiệm thu | Chưa mở ở mốc này |
|---|---|---|
| 6.0 | Chỉ contracts/policy/providers, không endpoint mới | Toàn bộ chat runtime. |
| 6.1 | Schema/crypto/worker foundation, không endpoint mới | Toàn bộ chat runtime. |
| 6.2 | C1–C5, M1, M2 TEXT/reply | Socket/E1/M3/M4/R1/N1–N4/F1–F4; canAttach=false. |
| 6.3 | E1; conversation:join/leave, message:send, typing:start/stop; message:created và membership/access/typing server events | message:read/conversation:read chỉ định nghĩa; mutations/read6.4, inbox6.5, files6.6. |
| 6.4 | M3/M4/R1, message:read, message:updated/deleted, conversation:read | R1 chưa đồng bộ notifications tới6.5; canAttach=false. |
| 6.5 | N1–N4, notification:created/notifications:read; R1 inbox-read side effect | Files/image vẫn chưa bật. |
| 6.6 | F1–F4, M2 FILE/IMAGE; canAttach=true cho writable scope có flag | Không hỗ trợ MIME/type ngoài allowlist v1. |
| 6.7 | Tổng hợp contract runtime, full tests, harness/Postman/runbook | Deployed/FE browser chỉ PASS khi có evidence môi trường đó. |

Task và acceptance chi tiết liên kết tại [plan mục9](../implement_phase/phase%206/PHASE_6_CHAT_NOTIFICATIONS.md#slice-60).
Không dùng bảng readiness để suy rằng routes đã tồn tại; chuyển từng row sang
implemented phải có source/HTTP/socket evidence. R1 đánh read notifications theo
message creation sequence khi6.5 mở; delayed fanout không tạo unread trở lại cho
message đã nằm trước cursor. Job completion riêng theo consumer để realtime
dispatch không vô tình tiêu mất notification work.
