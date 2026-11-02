# Phase 7 — Bảng vẽ lớp học, UI theo miro-demo

> Cập nhật implementation 02/11/2026: Implementation BE local đã có; xem contract/runbook/progress hiện hành. Phần PLANNED bên dưới giữ baseline thiết kế. User 02/11/2026 đã yêu cầu implement BE rồi FE, thay giới hạn chỉ đọc FE trong lượt planning.

Ngày lập: **02/11/2026**. Trạng thái: **PLANNED — chưa implement, chưa deploy**.

Yêu cầu hiện tại: tham khảo UI `E:/Documents/WDP/miro-demo` rồi lập kế hoạch.
Lần này chỉ thêm tài liệu trong BE; FE2 và demo là nguồn tham khảo chỉ đọc.

- [Flow](../../api_flow/PHASE_7_FLOW.md)
- [API proposal cho FE](../../api_flow/PHASE_7_flow-api-breakdown.md)
- [Progress và acceptance](../../progress/phase%207/PHASE_7_PROGRESS.md)

## 1. Bằng chứng đã xem và phạm vi

Đã đọc demo `web/src/App.tsx`, `App.css`, `shapes.ts`, `collaboration.ts`,
`storage.ts`, package manifests và guide. Đã mở UI local trong trình duyệt tại
viewport khoảng 472×603: canvas nền lưới, topbar, toolbar nổi trái, palette và
thẻ hướng dẫn dưới. Desktop layout được đối chiếu CSS/source, chưa kiểm trực quan
desktop hoặc chạy acceptance tương tác nhiều người.

Demo hiện có: chọn/di chuyển, pan/zoom theo con trỏ, bút tự do, tẩy cả nét,
màu preset/tùy chọn, độ dày, sticky sửa bằng double-click, kéo ảnh/sticky,
Delete, undo/redo qua phím tắt, clipboard image upload, awareness cursor.
Nét bút chỉ ghi vào shared document khi kết thúc nét; drag chỉ commit cuối drag.
Grid hiện vẽ trong phạm vi cố định, chưa phải lưới thích ứng viewport vô hạn.

Các giới hạn phải xử lý khi tích hợp:

- “Lưu snapshot” trong demo là ảnh PNG của stage, không phải checkpoint có thể
  khôi phục để tiếp tục chỉnh sửa. Hai thao tác này phải có tên riêng.
- Room lấy từ query tùy ý; user ngẫu nhiên; WebSocket hard-code localhost;
  chưa có authentication, quyền theo buổi học hoặc durable board persistence.
- UI ghi “MinIO: sẵn sàng” ngay từ state mặc định, chưa chứng minh storage healthy.
- Mobile ẩn room/connection status và các ghost actions; thanh độ dày có nguy cơ
  vượt màn hẹp. Canvas lấy chiều cao toàn window cộng vùng header dễ lệch tọa độ.
- URL ảnh được lưu trực tiếp vào shape; không phù hợp asset private/URL hết hạn.
- Tài liệu guide có phần lịch sử khác source hiện hành; ưu tiên source.

Nguồn Mindy: `document/Flow.txt`, thiết kế đề xuất mục 4 trong
`document/mindy_mvp_db_design_review.md`, schema tham khảo DBML, Classes/Files/Auth
runtime và FE2 architecture/ui-rules/learning/mentor-session. Chưa thấy module
Whiteboard runtime hoặc dependency Konva/Yjs trong FE2.

## 2. Quyết định UI

**Giữ bố cục và tương tác của demo; dùng nhận diện Mindy.** Không đổi sang một
trang quản trị có canvas nhỏ nằm giữa nhiều thẻ thông tin.

| Vùng | Theo demo | Điều chỉnh cho Mindy |
| --- | --- | --- |
| Workspace | Canvas chiếm toàn vùng làm việc, nền lưới nhẹ | Trang riêng, ẩn chrome dashboard trong route bảng, giữ auth guard và nút về buổi học |
| Topbar | Brand, thông tin room, hành động bên phải | Logo Mindy, tên buổi/lớp, mode, người online, kết nối và lưu; tên dài ellipsis + tên đầy đủ truy cập được |
| Toolbar trái | Panel trắng nổi, chọn/bút/tẩy, palette | Icon Lucide, active mint, nhãn/tooltip tiếng Việt, vùng bấm tối thiểu 44px |
| Bút | Preset/tùy chọn màu, độ dày có preview | Popover cạnh toolbar trên desktop, sheet trên mobile; không che hết canvas |
| Sticky | Nút thêm trên topbar; double-click sửa ngay tại chỗ | Giữ; bổ sung thao tác Sửa dùng được bằng touch/bàn phím, IME tiếng Việt |
| Ảnh | Dán vào giữa vùng nhìn, kéo di chuyển | Thêm nút tải ảnh cho touch; placeholder riêng khi đang upload/kiểm tra/lỗi |
| Góc dưới | Hướng dẫn và phản hồi | Zoom −/%/+, vừa nội dung, hướng dẫn thu gọn; thông báo upload không đè điều khiển |
| Lịch sử | Demo có nút lưu PNG | Menu riêng: Lưu mốc, Lịch sử, Xuất PNG; không dùng chung tên Snapshot |
| Quyền | Demo mọi người sửa được | Mentor có switch Trình bày/Cộng tác; Student thấy rõ Chỉ xem/Được cùng vẽ |

Font Nunito; token UI mint/forest/coral và nền trắng theo FE2. Màu nội dung vẽ,
sticky và màu định danh cộng tác là dữ liệu canvas, có palette riêng được validate;
không ép mọi nét vẽ thành màu thương hiệu. Không mang logo M/gradient xanh tím,
emoji tool, font Inter hoặc các text kỹ thuật MinIO/Yjs vào UI sản phẩm.

Phác thảo desktop:

```text
┌ Về buổi học · Mindy · Tên bảng ─ Kết nối / Đã lưu ─ Online ─ Chế độ ─ ⋯ ┐
│ ┌─────┐                                                              │
│ │Chọn │    [Popover màu / độ dày khi dùng bút]                         │
│ │ Bút │                                                              │
│ │ Tẩy │                CANVAS NỀN LƯỚI                               │
│ │Màu  │          sticky / ảnh / nét vẽ / con trỏ                       │
│ └─────┘                                                              │
│ [Phím tắt ?]                                 [− 100% +] [Vừa nội dung]│
└──────────────────────────────────────────────────────────────────────┘
```

Responsive: kiểm 320/375/768/1440px, portrait/landscape. Mobile rút gọn tên,
actions vào menu, màu/độ dày vào sheet, hướng dẫn chỉ còn nút ?. Luôn hiện kết nối,
quyền và trạng thái lưu. Dùng `100dvh`, safe-area và kích thước container thực tế;
pan/zoom chỉ tác động canvas. Hai ngón pan/pinch, một ngón theo tool; pointer cancel
và stylus không làm mất nét đã được xác nhận. Tooltip không là cách duy nhất để hiểu tool.

## 3. Giả định nghiệp vụ cho bản đầu

Đây là **đề xuất để triển khai**, không ghi thành yêu cầu đã được user xác nhận.

1. Một bảng dùng chung cho mỗi `class_session`, tạo lazy bằng lệnh Mentor, không
   tạo bảng rỗng hàng loạt hoặc tạo ngầm bởi GET. Hỗ trợ lớp online/offline.
2. Mentor có quyền quản lý đúng buổi (primary/effective substitute theo Classes)
   được chuẩn bị bảng ở SCHEDULED, điều khiển trong IN_PROGRESS, sửa/lưu lại sau
   COMPLETED khi entitlement giảng dạy hiện hành cho phép. Không mượn hạn sửa
   điểm danh làm hạn sửa bảng; entitlement board phải có policy riêng.
3. Student có FULL access và quyền đúng session được xem bảng đã có; chỉ sửa khi
   session IN_PROGRESS và mode COLLABORATIVE. CASH_PREVIEW không được xem state,
   cursor, asset, snapshot hoặc export của bảng. Không suy quyền từ chat membership.
4. PRESENTATION mặc định: Mentor sửa, Student xem. COLLABORATIVE: người có quyền
   cùng sửa nội dung chung, bao gồm di chuyển/sửa/xóa phần tử của nhau. Chưa có
   quyền sở hữu từng nét, cấp quyền từng học viên hoặc cho học viên làm presenter.
   Nếu cần chỉ-sửa-phần-của-mình, phải đổi policy và protocol trước khi code.
5. Undo/redo chỉ thao tác có nguồn gốc từ phiên biên tập hiện tại; không lùi toàn
   bộ lịch sử của người khác. Không hứa undo xuyên reload hoặc sau restore/reset.
6. Finalize session đưa Student về chỉ xem và tạo mốc SESSION_END đúng một lần
   theo sự kiện kết thúc. Chưa có board thì không tạo chỉ để lưu mốc rỗng.
7. Buổi/lớp hủy, tài khoản khóa, mất FULL access hoặc hết assignment phải được
   kiểm lại; mặc định từ chối truy cập khi nguồn policy hiện hành từ chối. Học bù
   chỉ được quyền tại session đích khi service entitlement xác nhận; chưa tự mở.
8. Admin/Manager chưa có UI quản trị bảng trong bản đầu. Không cấp quyền rộng
   bằng role chung. Xem lại, export hay support access cần use case riêng.

## 4. Phạm vi theo thứ tự

### 7.0 — UI và kiểm chứng nền tảng

- Tách `features/whiteboard` theo pattern FE2, route chỉ compose; canvas tải
  client-only. Chốt peer compatibility với React/Next đang cài trước thêm dependency.
- Tạo workspace đúng layout demo với fixture tách biệt môi trường dev/test;
  kiểm empty/loading/read-only/offline/save-error. Không đưa dữ liệu demo vào production.
- Prototype select/pan/zoom/sticky/pen/eraser và tọa độ editor HTML trên canvas.
- Xác minh Yjs server auth, read-only protocol, cross-tab isolation và persistence
  bằng spike nhỏ. Chốt package versions, WebSocket path, limits và ADR trước 7.1.
- Gate: ảnh desktop/mobile so với demo, không tràn 320px; keyboard/touch/IME dùng được.

### 7.1 — Bảng Mentor lưu được và Student chỉ xem

- Migration additive cho board, checkpoint/update persistence; policy adapter vào
  Auth/Classes/Enrollments; capabilities do BE tính. Tạo bảng lazy unique theo session.
- REST context/create + authenticated WebSocket read/write; chỉ Mentor được sửa
  trong slice này, Student read-only. Không tạm mở anonymous demo server.
- Lưu nét/sticky với durable acknowledgement; reload, restart, duplicate/reconnect
  không mất thao tác đã xác nhận. Hiện riêng “Đang đồng bộ” và “Đã lưu”.
- Điểm vào từ Mentor session và Student session trong learning workspace. Cash
  preview không mount query private. Bổ sung route returnTo theo allowlist.
- Gate: luồng mở → sửa → lưu → reload/restart, cross-class denial và Student chỉ xem.

### 7.2 — Cộng tác đúng quyền

- Mode switch, online people/cursor dùng danh tính server, update/broadcast limits.
- Hai user cùng sửa sticky, drag, stroke, erase; đổi mode và thu hồi quyền lúc đang
  vẽ; chặn cả WebSocket update từ client đã sửa JS.
- UndoManager theo origin cục bộ; batching/throttle; stroke preview tạm thời có
  giới hạn để người khác thấy đang vẽ, durable stroke commit khi kết thúc.
- Ngắt kết nối: bản đầu khóa tạo sửa mới, giữ pending trong RAM, kết nối lại phải
  reauthorize và sync epoch trước replay. Không hứa offline editing bền vững.
- Gate: 2–3 trình duyệt độc lập, nhiều tab, account switch/logout/revoke; hội tụ
  cùng state và không đồng bộ chéo tài khoản qua BroadcastChannel.

### 7.3 — Ảnh private

- Mentor dán/chọn PNG/JPEG, upload intent → storage PUT → complete → READY →
  bind board asset. Student upload để sau; quyền cùng vẽ không tự cấp quyền Files.
- Dùng storage/validation của Files qua API module được export, nhưng thêm scope
  board riêng. Files hiện kiểm Manager/Mentor theo material/course-unit; không
  giả định endpoint hiện tại hỗ trợ Student/substitute/board sẵn.
- Shape lưu assetId, không lưu signed URL/base64/storage key. Resolve ảnh theo
  quyền hiện tại; URL hết hạn phải cấp lại. Xóa phần tử không xóa object còn được
  snapshot tham chiếu; cleanup có retention/reference accounting.
- Gate: clipboard/touch upload, lỗi validation/retry, URL hết hạn, export canvas
  có ảnh private không lỗi CORS; board khác không đọc được file.

### 7.4 — Mốc lưu, khôi phục và PNG

- Mốc MANUAL, SESSION_END, BEFORE_RESET; danh sách phân trang. Restore/reset có
  xác nhận, expectedVersion, idempotency và mốc dự phòng; đổi epoch bắt mọi client
  resync, không merge lại thao tác từ document cũ.
- Xuất PNG hỗ trợ “Vùng đang xem” và “Toàn bộ nội dung”, giới hạn pixel/bounds;
  loại cursor/selection/grid theo tùy chọn định nghĩa rõ. Đây là file xuất,
  không thay thế mốc lưu có thể chỉnh sửa.
- Tác vụ export lớn chạy nền, có trạng thái thật; lấy file bằng access ngắn hạn.
- Gate: reset/restore trong khi nhiều người sửa, reconnect client cũ, export với
  ảnh private, session-end event lặp không tạo mốc trùng.

### 7.5 — PDF và nghiệm thu phát hành

- Import PDF → kiểm tra file → chọn trang → rasterize async thành assets; đặt
  quota số trang/pixel/bộ nhớ. Không tải/parse PDF không giới hạn trong browser.
- Export PDF từ renderer cùng schema với PNG, phân trang/bounds được định nghĩa.
  Chốt thư viện/worker trong spike riêng, không cho PDF trì hoãn bản PNG dùng được.
- Nghiệm thu end-to-end, load target, database upgrade/restore, WSS proxy,
  rollback/feature flags, asset IAM/CORS/cleanup và browser acceptance trên VPS.
- Gate phát hành core: 7.0–7.4 đủ evidence; PDF là phần tiếp theo có gate riêng.

Để sau: multi-page/frame, mind map/connectors, shape library, rotate/resize/group,
template gallery, follow-presenter, grants từng Student, code annotation, quản trị
bảng toàn hệ thống, offline persistence và multi-node collaboration.

## 5. Thiết kế kỹ thuật dự kiến

FE dùng React Konva + Yjs vì demo đã dùng và đáp ứng UI yêu cầu. Không copy nguyên
App.tsx vào Next.js; tách toolbar, stage, text editor, assets, connection và history.
Query quản lý metadata/API; Y.Doc quản lý document; local state quản lý tool/view;
không sao chép board document vào Redux/Query. Cleanup listeners/socket/undo khi rời
bảng, đổi user hoặc logout; signed URL không đưa vào cache bền.

BE thêm `modules/whiteboards` với application services/controller/DTO/policy,
không query private entity của module khác trực tiếp. Public read participants
Classes/Enrollments/Files cung cấp scope; nếu thiếu thì mở public API module có test.

WebSocket board có protocol/path riêng; Socket.IO chat hiện có không tự tương thích
với y-websocket. Reverse proxy phục vụ WSS cùng origin để dùng HttpOnly cookie;
không giả định Next `/api/v1` proxy có thể upgrade WebSocket. Origin allowlist,
session expiry, role/assignment/entitlement được kiểm khi join và mỗi lần ghi;
server quản lý fanout theo quyền hiện tại, không broadcast mù từ room membership.
Read-only peers chỉ được gửi sync request/awareness được giới hạn, không được
gửi sync response/update có khả năng mutate document. Tắt cross-tab broadcast
mặc định của provider nếu không bảo đảm isolation theo user/session/epoch.

Server validate binary size trước decode, apply vào candidate document có quota,
validate toàn schema/asset references rồi mới commit và broadcast accepted state.
Giới hạn text, points, elements, coordinates, colors, doc bytes và message rate;
không chỉ tin TypeScript hoặc chặn nút ở FE. Kiểm chi phí clone/apply tại 7.0;
nếu vượt ngân sách thì điều chỉnh protocol trước 7.1.

Persist checkpoint Yjs binary để giữ CRDT identity, kèm JSON projection có
schemaVersion cho render/export. Không dựng Y.Doc mới từ JSON sau mỗi restart rồi
merge client cũ. Bổ sung epoch cho reset/restore/migration không tương thích.
Update journal durable có compaction sau checkpoint; journal là cơ chế recovery,
không là lịch sử snapshot vô hạn. Serialize mutation theo board; chỉ báo “Đã lưu”
sau commit PostgreSQL, broadcast update đã commit. Crash trước commit không được ACK.
DB unavailable thì khóa ghi, retry có giới hạn và giữ pending chưa ACK trong RAM.

Đề xuất dữ liệu: `boards` (unique session, mode, epoch, control version, sequence,
checkpoint binary, current JSON, schemaVersion, persisted time), update journal
(board/epoch/updateId unique, sequence, binary), `board_snapshots`, `board_assets`,
`board_exports` ở slice tương ứng. Snapshot cần checksum, version, reason và storage
inline/object loại trừ nhau. Control version tách sequence update, không làm mode
command xung đột chỉ vì có nét mới. Schema SQL cụ thể chốt tại 7.0/7.1.

Thiết kế cũ đề xuất Redis hot state + overwrite JSON mỗi 10–30s. Plan này bổ sung
binary checkpoint/journal để không mất thao tác đã xác nhận khi crash và không
phục sinh nội dung sau restore. Single collaboration writer cho mỗi board trong
bản đầu; Redis/presence là tùy chọn sau spike, không dùng Redis như durable source.
Trước multi-instance phải có room ownership/fencing/routing được kiểm chứng;
không chạy hai writer độc lập vào cùng board.

Manual snapshot chụp state đã persist, không nhận JSON của client làm nguồn chuẩn.
Session end dùng durable event/outbox sau finalize transaction; participant phải
tránh vòng import Classes ↔ Whiteboards. Outbox trigger/publisher và session-end
barrier được thiết kế ở 7.1, hoàn thiện 7.4; không gọi renderer/storage trong DB lock.

## 6. Nghiệm thu, giới hạn và bàn giao

- Gate BE: policy unit + PostgreSQL integration + compiled HTTP/WS, `pnpm check`;
  migration clean/upgrade/repeat và concurrency barriers có evidence.
- Gate FE: lint/format/types/unit/build + Playwright desktop/mobile. Test hành vi
  vẽ/sửa/undo/upload/restore, auth expiry và coordinate mapping khi pan/zoom/resize.
- Gate hiệu năng đề xuất để đo: 30 người/board, 5 cùng vẽ, 2.000 phần tử,
  p95 update đến peer <300ms trong môi trường test được ghi rõ. Đây là target,
  chưa là cam kết đã đo; quota byte/point/pixel phải chốt sau spike.
- Ảnh/screenshot layout không chứng minh realtime hoặc durability; mock FE không
  chứng minh integration BE; local pass không chứng minh VPS deploy.
- Bàn giao gồm flow/API implemented, Swagger/Postman, WS protocol/ack/errors,
  UI screenshots, test evidence, env/flags/proxy và restore/rollback runbook.

Nguồn kỹ thuật đối chiếu: [Yjs y-websocket](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket),
[react-konva](https://konvajs.org/docs/react/index.html),
[Konva export](https://konvajs.org/docs/react/Canvas_Export.html).
Phiên bản dependency cuối cùng sẽ theo spike với lockfile thực tế, không lấy
package range của demo làm quyết định tương thích mặc định.
