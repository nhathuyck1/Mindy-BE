# Phase 2.2 — Tích hợp payOS vào BE và nghiệm thu giao dịch thật

Cập nhật: 2026-10-05. Trạng thái: **BE đã implement/test local; chờ user deploy và live smoke**.
Theo dõi thực hiện tại [Phase 2.2 progress](../progress/PHASE_2_2_PROGRESS.md).

## 1. Điểm bắt đầu và quan hệ với Phase 2.1

Đã có plan tích hợp trong mục B–D của
[kế hoạch tiếp nối](./PHASE_2_WEBHOOK_VPS_PAYOS_PLAN.md) và bước 4 của
[Phase 2.1](./PHASE_2_1_WEBHOOK_VPS_PAYOS.md). Tài liệu này tách phần đó thành
Phase 2.2 để triển khai và nghiệm thu riêng; không bắt đầu lại webhook probe.

User xác nhận webhook test ổn với server. Evidence đã ghi ngày 2026-10-05:
SDK confirm trả `CONFIRM_OK` cho
`https://api.quanh123.id.vn/api/v1/payment-callbacks/payos`; callback mẫu trên VPS
trả 200, verified, requestId `cb1f34be-0dd1-4750-b057-fb9c6947d6fb`, latency 0.53 ms.
Đây là confirm/verification của receiver độc lập, chưa phải giao dịch thanh toán.

Các ca A1 còn thiếu (signed fixture từ máy ngoài VPS, đối chiếu latency/log,
kiểm tra thay đổi routing tunnel) vẫn giữ trong Phase 2.1. Theo yêu cầu hiện tại,
có thể lập và triển khai Phase 2.2; phải kiểm chứng ingress/recovery của **BE** trước
nghiệm thu live. Không tự đánh dấu toàn bộ Gate A1 đã pass.

Baseline code trước triển khai (để đối chiếu các phần đã bổ sung):

| Thành phần | Hiện trạng | Việc cần bổ sung |
|---|---|---|
| Checkout PAYOS | Order PENDING, snapshot giá, holds PENDING_PAYMENT, TTL mặc định 900 giây | Giữ nguyên contract `orders[]` |
| Payment runtime | Root package chưa có SDK; chưa có PaymentsModule/payment tables | Adapter, config, migration, APIs |
| CommerceModule | Chưa export provider settlement | Public API đọc/lock/settle order cùng EntityManager |
| EnrollmentsModule | Có hold/release, chưa có activation/progress | Activate hold hiện hữu và tạo progress |
| Mail | MailService private trong AuthModule | Mail transport dùng chung và payment outbox worker |
| Public callback | Tunnel trỏ exact path tới probe | Chuyển tới BE sau quality gate/deploy |

## 2. Mục tiêu và phạm vi

### Đối chiếu toàn bộ `document/Flow.txt`

Flow.txt là nguồn yêu cầu sản phẩm; đã đọc toàn bộ, gồm mentor, admin và student.

| Yêu cầu trong Flow.txt | Áp dụng trong Phase 2.2 |
|---|---|
| Browse course → register class, chọn onl/off → cart → full payment cash/PayOS | Mua class ONLINE/OFFLINE đã chọn; trả đủ tổng order, không mua course template hay trả góp |
| `add confirmation to mail for online transaction` | PayOS thành công phải tạo mail outbox cùng settlement; worker gửi sau commit |
| `be added to the course unit(by manager)` | Quyền học gắn enrollment của class và progress từng class unit, không sửa course template |
| Cash pending vẫn tự vào class, chỉ thấy unit/session title + timetable để đến lớp | Giữ enrollment PENDING_PAYMENT; không mở full content bằng callback giả/redirect; cash preview còn phải triển khai riêng |
| `Mentor confirm order stt → Can see the whole course` | Assigned mentor theo order snapshot xác nhận cash; admin xem/support transactions, không thay mentor bằng quyền confirm mặc định |
| Cash pending vào group chat/mentor DM | Yêu cầu còn tồn tại nhưng thuộc phase chat; không tuyên bố đã hỗ trợ trong Phase 2.2 |
| Mentor quản lý class → class unit → session; student xem schedule/content | Settlement mở đúng quyền của class đã mua; board/compiler/homework/materials/attendance/certificate ở phase sau |
| Admin support transactions từ transaction log | Admin reconciliation có log/audit và event cần review, không tự cấp quyền/refund |

Cụm `by manager` trong Flow.txt mô tả người quản lý thêm quyền; plan Phase 2 hiện
có quyết định tự activate hold khi webhook hợp lệ và initialize progress thay thao
tác thêm tay. Phase 2.2 **kế thừa quyết định này**, ghi rõ là diễn giải triển khai
đã có, không tạo một approval gate mới sau PayOS hoặc một role MANAGER mới.
Admin vẫn hỗ trợ/đối soát ngoại lệ; nếu đổi sang thêm tay phải cập nhật riêng rule
nghiệp vụ, không âm thầm sửa settlement.

```text
Student checkout PAYOS → BE tạo/reuse payment link → student thanh toán
  → BE verify webhook → commit payment + order PAID + enrollment ACTIVE
  + progress + mail outbox → student xem quyền học và mail xác nhận
```

Phase 2.2 gồm migration, API tạo link, webhook settlement, full access cho owner,
email outbox, đối soát, automated tests, deploy và một giao dịch thật giá trị nhỏ.
Cash confirmation/preview và các exit criteria Phase 0/1 còn mở vẫn là công việc
riêng; hoàn tất Phase 2.2 không đồng nghĩa hoàn tất toàn bộ Phase 2 hay public launch.
Không thêm refund tự động, partial payment, đổi payment method hoặc tạo lại hold trễ.

payOS không có sandbox riêng: fake provider dùng cho automated tests; live smoke
chạy production API payOS trên môi trường Mindy có dữ liệu test được tách biệt.
Số tiền/kênh do user chọn; user tự thực hiện chuyển tiền, không đưa credential vào chat.

## 3. Quyết định triển khai

### 3.1 Ownership, schema và trạng thái

- PaymentsModule sở hữu `payment_transactions`, `payos_payment_details`,
  `payment_webhook_events`, `payment_confirmation_emails` và adapter/reconciliation.
- EnrollmentsModule sở hữu `enrollments`, `class_unit_progress`; CommerceModule sở
  hữu orders/details. Giao tiếp qua provider export, không import repository private
  xuyên module hoặc tạo vòng phụ thuộc; tiếp tục application services hiện tại.
- Thêm migration mới sau migration hiện có; không tạo lại enrollments hoặc sửa
  migration đã deploy. Update DBML cùng lúc, review FK/check/index và up/down/up.
- Attempt được tạo khi student gọi API link, **không tạo ở checkout**. Implementation
  dùng unique `order_id`: một attempt lưu bền cho toàn lifetime của order ở increment
  này, mạnh hơn unique active attempt. Không tự tạo attempt mới sau timeout/cancel.
  Timeout chưa rõ kết quả phải reuse attempt/code và query provider trước khi retry.
- Numeric provider orderCode cấp bằng sequence lưu bền và mapping unique; không
  truyền chuỗi `MD...` của Mindy, không chỉ dùng timestamp. Giới hạn phải nằm trong
  safe integer của JS và contract API/SDK đã kiểm chứng trước implementation.
- Unique provider reference/link ID/event key, `(enrollment_id, class_unit_id)`
  và outbox event/order bảo vệ duplicate. Event key gồm phạm vi provider/channel
  và reference; fingerprint giúp phát hiện cùng reference nhưng nội dung khác.
- Attempt triển khai: `CREATING → PENDING → SUCCEEDED`; `REQUIRES_REVIEW` cho
  link terminal/tiền đến nhưng không được tự settle. Lỗi tạo/timeout chưa rõ giữ
  CREATING và code cũ để query/retry; chưa thêm FAILED/new attempt trong increment này.
- Order cũ không có attempt vẫn tạo link được nếu PAYOS/PENDING/chưa hết hạn;
  không backfill paid giả. Giá 0/amount ngoài contract provider trả domain error,
  không giả lập giao dịch thành công. Giá VND nguyên lấy từ immutable order snapshot.

### 3.2 Adapter, config và contract API

Pin SDK `@payos/node` theo phiên bản đã review (probe đang pin 2.0.5), kiểm tra ESM
với Node 22.20.0/pnpm 12.6.0. Dùng typed provider token, fake adapter chỉ dành cho
test config; client không được chọn fake qua header/body. SDK v2 dùng
`paymentRequests.create/get`, `webhooks.verify/confirm`; không trộn API SDK v1.

| API dự kiến | Quyền | Contract |
|---|---|---|
| `POST /api/v1/me/orders/:orderId/payments/payos` | Active STUDENT, own order | Tạo/reuse link; không nhận amount/code/status/URLs từ client |
| `POST /api/v1/payment-callbacks/payos` | Public, verify chữ ký payOS | ACK sau persist/commit; không JWT/cookie/browser CSRF |
| `GET /api/v1/me/orders/:orderId` | Own order | Bổ sung payment summary DTO, không secret/provider payload |
| `GET /api/v1/me/classes/:classId` | Own ACTIVE enrollment | Class/unit/session content theo quyền; public browse không lộ meeting URL |
| `GET /api/v1/admin/payments/reconciliation` | ADMIN | Phân trang các event/attempt cần review, metadata đã redact |

Link response gồm `paymentId`, `orderId`, `status`, `checkoutUrl`, `qrCode`,
`expiresAt`. Retry trả cùng attempt/link; nếu request đang tạo thì trả trạng thái
processing có contract rõ, không tạo thêm link. Không đổi contract checkout.
Implementation trả 201 cho create/reuse, status CREATING/link null trong lúc lease
đang chạy; retry cùng order. Lease 30 giây, SDK timeout 10 giây/no automatic retry.
Provider GET không trả QR, nên response phục hồi có thể QR null và checkoutUrl theo
route payOS chuẩn. Provider PAID được phục hồi vẫn phải verified callback hoặc ADMIN
reconciliation trước PAID/access, không settle chỉ bằng response create link.

Config: `PAYOS_ENABLED=false` mặc định; bật thì Joi validate client ID, API key,
checksum key, `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL`, `PAYOS_WEBHOOK_URL` từ server.
Thêm `PAYOS_CREATE_LINK_ENABLED` làm công tắc riêng: có thể dừng tạo link mới mà
vẫn verify/settle callback của link đã phát hành. Không dùng tắt toàn bộ payOS để
rollback sau khi đã có link/giao dịch. Bổ sung `.env.example`, production/staging
examples và deployment docs khi implement; không commit secret hoặc log SDK payload.

Lỗi chuẩn: 401/403 auth/quyền; 404 resource không thuộc owner theo policy hiện tại;
409 trạng thái/method/deadline; 422 amount không hỗ trợ; 503 chưa bật/provider lỗi.
Confirm URL là command vận hành, không tự chạy lúc app boot.

### 3.3 Tạo link an toàn khi retry hoặc webhook đến sớm

1. Transaction ngắn: kiểm tra owner, PAYOS/PENDING/deadline; reserve attempt và code
   unique rồi commit. Request đồng thời reuse attempt qua constraint/claim hữu hạn.
2. Gọi provider ngoài transaction; expiry Unix giây lấy từ deadline order, description
   theo giới hạn API. Timeout/retry hữu hạn, không kéo dài hold vì retry.
3. Transaction ngắn lưu response, re-read trạng thái/deadline. Callback đến trước
   response vẫn tìm được attempt bằng code đã commit; save response không hạ
   SUCCEEDED về PENDING. Nếu order hết hạn giữa lúc gọi mạng, không cấp link như
   còn payable; attempt/link đi vào cleanup/review phù hợp.
4. Nếu response thất lạc/provider đã tạo: query cùng code, kiểm chứng amount/link,
   phục hồi mapping; không cấp code mới mù. Chốt policy link ID chưa lưu bằng query
   provider ngoài transaction rồi revalidate dưới lock, không bỏ webhook hợp lệ.

### 3.4 Webhook, atomic settlement và đối soát

1. Giới hạn body/envelope, giữ nguyên signed data để SDK verify trước normalize.
   Global ValidationPipe không được whitelist mất field signed. Invalid signature
   trả 400; không mutate business state.
2. Đối chiếu signed code, provider code/link/reference, exact amount, VND và kết quả
   thành công; không tin `success` hoặc redirect do client cung cấp.
3. Nhận diện mẫu confirm theo contract chính thức: ACK sau verification, không tạo
   payment/order/enrollment. Không dùng magic orderCode để bypass settlement.
4. Khóa class theo ID → order → payment → enrollment; dùng cùng lock order với
   checkout và review expiry worker. Không thêm đường order → class gây deadlock.
   Đọc lại deadline bằng giờ server và status sau khi lấy lock.
5. Một transaction claim event unique → payment SUCCEEDED → order PAID/paidAt →
   activate đúng holds hiện hữu → tạo progress theo class units → ghi mail outbox.
   Thiếu hold hoặc fail progress/outbox phải rollback toàn bộ. ACK 200 sau commit.
6. Duplicate tuần tự/song song trả 200, không tạo quyền/progress/mail lần nữa.
   Cùng reference nhưng nội dung khác phải review, không coi là duplicate vô điều kiện.
7. Tiền đến khi deadline `<= now`, order EXPIRED/CANCELLED, hold đã nhả, class
   CANCELLED, sai amount/link/currency hoặc unknown mapping: persist event review,
   không PAID/ACTIVE, ACK sau persist. Unknown event lưu metadata tối thiểu không
   cần FK payment; không tự nhận diện mẫu confirm chỉ vì không tìm thấy order.
8. DB/lỗi tạm thời trả 5xx để retry; failure event không hạ order đã PAID. Callback
   trễ dù timestamp provider sớm vẫn review trong scope này, không tự chiếm lại chỗ.
9. `returnUrl`/`cancelUrl` chỉ phục vụ UX; frontend đọc own order để lấy kết quả.
   Provider PAID nhưng callback thất lạc: job/command đối soát query provider qua
   adapter, đi qua cùng validation/settlement idempotent, ghi audit/source riêng.
   Refund/cấp chỗ cho exception do vận hành xử lý riêng, không tự động.

### 3.5 Access và email

- Chỉ ACTIVE owner được full class access; pending PAYOS không mở meeting URL/content.
  Materials/file access giữ scope phase sau; không trả dữ liệu private qua public DTO.
- Extract mail transport dùng chung cho auth/payment; outbox insert cùng transaction
  settlement, worker gửi sau commit, claim an toàn, bounded retry/backoff và trạng thái
  lỗi quan sát được. Mail outage không rollback payment.
- Unique job/order, SMTP semantics at-least-once: crash sau send trước mark-sent có
  thể gửi lặp. Không hứa exactly-once email hoặc dùng số email nhận được thay DB evidence.

## 4. Thứ tự triển khai và kiểm thử

| Bước | Đầu ra | Điều kiện hoàn thành |
|---|---|---|
| 2.2.1 Schema và contracts | Public module APIs, migration/DBML, attempt/events/outbox/progress | Review SQL, up/down/up DB riêng; không thay checkout/cash |
| 2.2.2 Adapter và link | SDK pin/lockfile, Joi/env, DI fake/real, link/status DTO | Role/ownership, reuse, timeout/restart/early webhook tests pass |
| 2.2.3 Settlement và quyền học | Callback, activation/progress, access, reconciliation, mail worker | Atomicity/idempotency/deadline/race và authorization tests pass |
| 2.2.4 Quality gate | OpenAPI/Postman/docs, HTTP E2E app đã build, regression | Full pnpm check + HTTP E2E, DB suite không skip |
| 2.2.5 VPS và giao dịch thật | Image release, routing sang BE, confirm lại, live evidence | Paid/access/progress/outbox invariants trên server pass |

Các ca bắt buộc: wrong/missing/tampered signature; signed fields mở rộng; CASH/paid/
expired/zero-amount order; parallel create link; provider timeout/429/5xx; save
response failure và webhook đến sớm; duplicate/collision reference; wrong amount/
link/currency; unknown/mẫu confirm; multi-class rollback; webhook vs expiry vs
checkout last-seat; class cancel; mail fail/restart/multi-worker; missed webhook
reconciliation; student khác/pending không có access. Regression giữ cash split,
giá server, checkout rollback, capacity và expiry hiện tại.

Test DB riêng tên kết thúc `_test`; CI phải thật sự chạy integration. HTTP E2E
chạy built app để có decorator metadata; cấu hình test glob/script rõ nếu dùng
`*.e2e-spec.ts`. Test fake không gọi PayOS thật, không chứa secrets kênh thật.

## 5. Deploy, live smoke và rollback

1. Hoàn tất quality gate; kiểm chứng các ca ingress còn thiếu cho handler BE trên
   môi trường test. Chốt môi trường/kênh hiện tại có phục vụ user thật hay không;
   hostname đã dùng không tự chứng minh staging DB tách biệt.
2. Git pull/checkout release, build một image tag commit; migration job và API dùng
   cùng image. Backup và thử restore sang DB khác; migration một job trước API.
3. Env/secrets trên VPS, validate config đã redact, readiness/logs pass. Tunnel
   `flowzy-quanh123` đang có exact callback path về `mindy-payos-probe:3100`;
   chuyển route đó sang BE service thực tế trong network hiện tại, giữ route khác.
4. Confirm lại cùng HTTPS URL với handler BE; verify mẫu và ACK, không settlement
   mẫu. Probe không có DB/event store nên không dùng làm fallback ghi nhận tiền.
5. Student test qua API server: add cart → checkout → gọi link hai lần → user trả
   số tiền nhỏ đã chọn. Kiểm chứng DB/own-order: payment SUCCEEDED, order PAID,
   đúng holds ACTIVE, đủ progress, một outbox job, quyền owner và mail-worker result.
6. Lưu commit/image, thời điểm, order/payment/reference/requestId đã redact vào
   progress; thêm pending expiry/recheckout/restart smoke. Dọn probe sau khi BE ổn.

Rollback: dừng tạo link mới bằng công tắc riêng, giữ callback và đối soát bền cho
link đang tồn tại. Ưu tiên image payment đã kiểm chứng/forward fix. Không revert
migration phá dữ liệu sau có giao dịch; không restore backup cũ đè settlements.
Không rollback về BE trước payment hoặc route probe nếu chưa có phương án lưu/
khôi phục callback và truy vấn đối soát. Không thực hiện chuyển tiền trong bước lập plan.

## 6. Checklist nghiệm thu

- [x] Migrations/DBML/public providers đồng bộ; enrollments hiện hữu được kế thừa.
- [x] API tạo/reuse link đúng owner, amount/deadline và không duplicate attempt.
- [x] Chữ ký/settlement/duplicate/race/rollback được test; mẫu confirm không tạo order.
- [x] ACTIVE owner có quyền, pending/other student bị chặn; progress/outbox đủ và unique.
- [x] Reconciliation/missed webhook và mail retry có test/runbook/audit.
- [x] Quality gate và HTTP E2E pass với DB test riêng, không skip integration.
- [ ] VPS route đã chuyển sang BE, BE confirm pass, một giao dịch thật được nghiệm thu.
- [x] Evidence local đã redact ghi trong progress; trạng thái cash/Phase 0/1 còn mở rõ ràng.

## 7. Nguồn và trạng thái

Nguồn chính thức đối chiếu ngày 2026-10-05:
[payOS API](https://payos.vn/docs/api/),
[Node SDK](https://github.com/payOSHQ/payos-lib-node),
[môi trường test](https://payos.vn/docs/moi-truong-test/).
Giới hạn amount/code/description và cách nhận diện mẫu confirm phải đối chiếu
contract SDK/API được pin khi implement, không suy từ fixture probe thành rule tiền thật.

Bước 2.2.1–2.2.4 đã triển khai và kiểm chứng local: full check 91 tests (36 unit,
55 integration), HTTP E2E 3 tests, frozen install và Docker runtime smoke pass.
Bước 2.2.5 chờ user tự deploy theo [runbook](../PAYOS_PHASE_2_2_DEPLOYMENT.md);
chưa migrate VPS, chuyển route, BE confirm hoặc thực hiện giao dịch thật. Local
tests dùng fake network provider, signature verifier chính thức và DB test riêng.
