# Kế hoạch tiếp nối Phase 2: webhook VPS → PayOS BE → deploy test

Cập nhật: 2026-10-04. Trạng thái: **kế hoạch, chưa triển khai/test trên VPS**.
Nhánh đã đọc: `Feat/Webhooktest`; commit nền: `577af2f`.

## 1. Kết quả đọc tài liệu và code

Đã đối chiếu `Agent.md`, `docs/NESTJS_PROJECT_RULES.md`, kế hoạch Phase 2,
`docs/progress/PHASE_2_PROGRESS.md`, các tài liệu core flow/business logic, Flow.txt,
DBML, source checkout/expiry/enrollment/catalog/classes, migrations, integration
tests, Dockerfile, CI và `docs/VPS_DEPLOYMENT.md`.

| Phần | Thực tế trên nhánh |
|---|---|
| Catalog | Category, course inactive → thêm/reorder unit → activate |
| Classes | Copy unit khi tạo class; lịch và xung đột mentor; lifecycle riêng |
| Public browse | Course/class public, lọc/phân trang; không lộ meeting URL |
| Cart | Cart riêng của student, tối đa 20 class; snapshot chỉ để hiển thị |
| Checkout | Transaction khóa cart → class theo ID → order/hold; giá hiện tại từ server |
| PAYOS checkout | Một order cho cả cart, giữ chỗ mặc định 900 giây |
| CASH checkout | Một order mỗi mentor snapshot, giữ chỗ mặc định 172800 giây |
| Enrollment | Đã có `PENDING_PAYMENT`, unique theo order detail và partial unique student/class |
| Expiry | `PENDING → EXPIRED`, hủy hold; batch `SKIP LOCKED`, worker chạy lại sau restart |
| Payment | Chưa có `PaymentsModule`, payment tables, SDK, link hoặc callback route |
| Sau thanh toán | Chưa có activation/progress, confirmation email outbox, reconciliation |
| Cash access | Chưa có preview giới hạn hay mentor confirmation |
| Deploy | Đã có Compose PostgreSQL riêng, migration job trước API, healthcheck và guide |

`paymentType: PAYOS` hiện chỉ chọn kiểu order, **chưa tạo link và chưa nhận tiền**.
Không có webhook sẵn để đem đi test chỉ bằng checkout trên commit này.

### Baseline kiểm tra trong lượt lập kế hoạch

**Cập nhật sau khi sửa baseline ngày 2026-10-04:** Đã thêm `.gitattributes`, chuẩn
hóa LF, cấu hình Biome LF và sửa format `register.dto.ts`. Chạy full `pnpm check`
bằng Node 22.20.0/pnpm 12.6.0 với PostgreSQL 17 container riêng: lint/type-check/build
pass, 64/64 tests pass (29 unit + 35 integration, không skip). Frozen-lockfile install
pass. Các kết quả dưới đây là lịch sử trước khi sửa; prerequisites runtime/format/test
local đã được giải quyết, còn Gate A–D về VPS/PayOS chưa thực hiện.

- `pnpm type-check`: pass; `pnpm build`: pass.
- `pnpm test`: 29 pass, 35 PostgreSQL integration tests **skip** vì chưa cấp
  `TEST_DATABASE_URL`; không coi đây là một integration run thành công.
- `pnpm check`: fail tại formatter (124 diagnostics). Kiểm tra lại bằng
  `biome check . --formatter-enabled=false` pass; checkout Windows dùng CRLF và
  `core.autocrlf=true`. Chốt LF bằng thay đổi Git/config riêng trước quality gate,
  không dùng tắt formatter để nghiệm thu.
- Node local là `20.20.0`, khác yêu cầu `>=22.20.0 <23`; pnpm là `12.6.0`.
  Chạy gate chính thức bằng Node 22.20.0/pnpm 12.6.0 hoặc image tương ứng.
- Chưa truy cập VPS, chưa xác nhận DNS/TLS/proxy, chưa đăng ký URL PayOS.

### Những chỗ cần kế thừa đúng

1. Không tạo lại `enrollments` hoặc sửa migration đã chạy. Phase 2 hiện có năm
   migration, gồm cả `remove-manager-role`; thêm migration mới sau chúng.
2. `orders.order_code` là chuỗi `MD...`, không truyền trực tiếp thành PayOS numeric
   `orderCode`. Lưu mapping provider riêng với unique constraint.
3. Giữ ownership hiện tại: `EnrollmentsModule` sở hữu enrollment/progress;
   `ClassesModule` sở hữu class/unit/session. Không chuyển theo sơ đồ cũ trong plan.
4. `CommerceModule` chưa export workflow provider; `AuthModule` chưa export mail
   adapter. Bổ sung public API/token cần thiết, không import entity/repository private
   của module khác vào Payments, không tạo vòng phụ thuộc.
5. Core docs cũ nói một order/checkout, admin xác nhận cash và tạo enrollment mới
   lúc payment. Phase 2 mới ưu tiên cash split theo mentor và **activate hold đã có**;
   cập nhật các phần tài liệu cũ liên quan khi triển khai.
6. `cancel class` hiện chỉ đổi status, chưa nhả hold. Payment phải kiểm tra class
   bị hủy và chuyển đối soát; không active enrollment của class `CANCELLED`.

## 2. Thứ tự và các mốc nghiệm thu

```text
A0. Chốt VPS/domain (baseline local đã pass)
  → A1. Receiver thử nghiệm: external POST → HTTPS proxy → receiver
  → A2. PayOS confirm-webhook gửi mẫu và receiver verify thành công
  → B. Tích hợp PayOS vào BE, test fake + PostgreSQL + HTTP
  → C. Deploy cùng artifact lên VPS test, chuyển route sang BE
  → D. Confirm URL lần nữa + giao dịch nhỏ + nghiệm thu và dọn probe
```

Mốc A xác nhận khả năng nhận/xác minh webhook trên VPS; chỉ mốc B–D mới xác nhận
payment/order/enrollment đúng. Không tự đánh dấu mốc pass nếu thiếu bằng chứng.

PayOS hiện **không có sandbox riêng**. “VPS test” là staging của Mindy; fake provider
dùng cho test tự động, smoke qua PayOS thật chạy production API với giá trị nhỏ.
Nguồn chính thức kiểm tra ngày 2026-10-04:
[môi trường test](https://payos.vn/docs/moi-truong-test/).

## 3. A — Test webhook trên VPS trước khi tích hợp BE

### Quyết định theo thông tin user đã cung cấp

- BE đang deploy trên VPS bằng Git pull + Docker Compose; tiếp tục workflow này.
  Checkout đúng commit release sau fetch/pull, build image một lần trên VPS, chạy
  smoke trên chính image đó và giữ image/tag cũ. Không cần registry để bắt đầu;
  registry/promote có thể bổ sung sau, không bắt rebuild mỗi lần smoke.
- Chưa có kênh PayOS. A1 có thể thực hiện trước với fixtures; A2 chờ user tạo/xác thực
  kênh và đặt credentials trực tiếp trên VPS. Không tự đăng ký tài khoản hay thực hiện
  xác thực danh tính thay user. Chưa mở Gate A cho tích hợp BE bằng kết quả fixture.
- Hướng public: dùng `api-staging.<domain-sở-hữu>` cho test và `api.<domain-sở-hữu>`
  cho production. Đây là quy ước hostname, không phải domain đã đăng ký. DNS/TLS
  cần kiểm tra trước test external. Webhook cuối cùng là
  `https://api-staging.<domain-sở-hữu>/api/v1/payment-callbacks/payos`.
- Nếu VPS chưa có reverse proxy, chọn Caddy để cấp/gia hạn HTTPS tự động. Nếu đã có
  Nginx/Caddy thì giữ proxy hiện tại và thêm virtual host/route; không cài hai proxy
  tranh port 80/443. Production không dùng IP:3000 làm webhook URL.
- Chọn Compose project/volume riêng cho staging, secrets/JWT riêng. Override staging
  phải tách cả tên image/tag và port loopback để không xung đột BE hiện tại. Compose
  hiện hard-code `.env.production`; thêm Compose file/override env_file staging,
  không cho rằng `--env-file .env.staging` tự thay env_file của container.
- Trước public launch, đóng các hạng mục auth/security còn mở (rate limit, CSRF cho
  cookie auth, proxy trust, backup/restore và kiểm thử Phase 1). Callback provider
  xác minh chữ ký được xử lý riêng với browser CSRF. VPS test pass chưa đồng nghĩa
  toàn bộ dự án đủ điều kiện public production.

### A0. Thông tin và chuẩn bị

- Chốt hostname HTTPS, DNS A/AAAA đúng VPS, reverse proxy đang dùng, SSH host/user,
  thư mục deploy, phiên bản Docker Compose và có BE/DB đang phục vụ hay không.
- Chốt kênh PayOS dùng cho test; kiểm tra nó có đang nhận webhook của hệ thống khác
  không. `confirm-webhook` cập nhật URL của **cả kênh**, nên không dùng kênh đang phục
  vụ khách để trỏ sang probe. Ghi URL cũ để phục hồi khi cần.
- Secrets đặt trên VPS, ngoài Git/image/log; không yêu cầu gửi secret qua chat.
- Ưu tiên staging Compose project và volume riêng. Không tái sử dụng DB có dữ liệu
  thật cho fixture hoặc test xóa/migrate DB.
- API/receiver chỉ bind loopback; proxy public 443, không public PostgreSQL.
  Kiểm tra TLS chain, DNS từ mạng ngoài, cả IPv6 nếu hostname có AAAA.

### A1. Receiver độc lập, không mutate dữ liệu BE

Tạo tooling receiver trong `tools/webhook-probe/` với manifest/lockfile riêng nếu
cần SDK; không thêm PayOS vào runtime dependencies của BE tại bước này. Receiver
dùng cùng hostname và đường proxy dự kiến của payment, ví dụ:

```text
POST https://<API_TEST_HOST>/api/v1/payment-callbacks/payos
    → reverse proxy → receiver tại 127.0.0.1:<PROBE_PORT>
```

- Route thử chỉ nhận JSON có giới hạn body và timeout; không yêu cầu cookie/JWT,
  browser CSRF token hoặc browser challenge. Public ingress không có nghĩa tin payload.
- A1 gửi fixture có chữ ký test qua công cụ ký/script từ máy ngoài VPS; có ca
  thiếu/sai chữ ký, body bị sửa, invalid JSON và quá giới hạn body.
- A2 dùng verification payment webhook của SDK chính thức, phiên bản pin ở tooling.
  Generic raw-body HMAC ở A1 không được coi là proof của PayOS signature.
- Receiver không có credential DB, không cấp access, không tạo email/payment/order.
  Log metadata tối thiểu: request ID, thời điểm, kết quả verify, status, latency;
  không log raw payload/signature/key hoặc dữ liệu tài khoản ngân hàng.
- Payload sai JSON/chữ ký trả 4xx; payload verify hợp lệ trả `200`.
  Gửi lặp vẫn nhận phản hồi ổn định; chưa gọi đó là business idempotency.

| Ca test A | Bằng chứng cần lưu |
|---|---|
| POST HTTPS từ mạng ngoài, không theo redirect | Status 200; proxy và receiver cùng request ID |
| Chữ ký sai/thiếu hoặc data bị sửa | 4xx; log kết quả verify fail đã redact |
| Invalid JSON / body quá lớn | 4xx/413, receiver còn khỏe |
| Gửi cùng fixture nhiều lần, kể cả song song | Đủ request được ghi nhận, không timeout/crash |
| Receiver restart, proxy reload | Test lại được; lỗi trong khoảng downtime được quan sát |
| GET readiness của BE nếu đã chạy | Phase 2 đang có không bị ảnh hưởng |

Giới hạn mục tiêu nội bộ cho probe: phản hồi bình thường dưới 2 giây. Đây là mục tiêu
test của Mindy, không khẳng định timeout/retry SLA của PayOS.

### A2. PayOS gọi URL thực

- Cấu hình credential kênh test cho tooling, dùng `webhooks.confirm()` hoặc API
  `POST /confirm-webhook` từ command vận hành; không đăng ký tự động mỗi lần app boot.
- PayOS gửi giao dịch mẫu để kiểm tra URL; receiver verify và trả 200.
  Mẫu này không đại diện một order đã được thanh toán trong Mindy.
- Nếu confirm fail, kiểm tra từng lớp DNS/TLS → proxy/path → parser → verifier →
  response. Không thêm bypass chữ ký để làm confirm pass.
- Ghi kết quả confirm đã redact, request ID nhận mẫu và thời điểm test.

**Gate A:** A1 và A2 pass; chứng minh PayOS thực sự gọi đúng VPS và verifier đúng.
Nếu chưa có kênh/credentials, chỉ ghi A1 pass và A2 đang chờ cấu hình; không tuyên bố
“webhook PayOS ổn”. Bước tích hợp runtime BE nằm sau gate này theo thứ tự yêu cầu.

Nguồn: [API confirm-webhook và payload](https://payos.vn/docs/api/),
[Node SDK](https://github.com/payOSHQ/payos-lib-node).

## 4. B — Tích hợp PayOS vào BE sau Gate A

### B1. Contract và migration

- `PaymentsModule`: sở hữu payment transactions, provider details, webhook events,
  reconciliation metadata và confirmation email outbox.
- `EnrollmentsModule`: thêm progress entity và provider activate existing holds;
  `CommerceModule`: export provider đọc/lock/settle order bằng `EntityManager`.
- Duy trì application service và cấu trúc module hiện tại, không ép CQRS cho scope này.
- Migration mới cho `payment_transactions`, `payos_payment_details`,
  `payment_webhook_events`, `payment_confirmation_emails`, `class_unit_progress`;
  unique provider reference/code/link, event key, enrollment/unit, order/email event.
- Provider numeric code cấp bằng sequence/mapping lưu bền, trong safe integer range
  của JS và giới hạn SDK/API được kiểm chứng; không dựa vào timestamp để tránh trùng.
- Checkout hiện tại giữ nguyên order/hold transaction. Đề xuất cho increment PayOS:
  tạo attempt khi gọi link endpoint, bằng transaction ngắn và unique active attempt.
  Retry tái dùng attempt/code. Ghi rõ quyết định này trong Phase 2 plan vì plan gốc
  từng dự kiến payment `PENDING` ngay ở checkout. Cash confirmation bổ sung sau.
- Order cũ: chưa có attempt vẫn có thể yêu cầu link nếu còn `PENDING` và chưa hết hạn;
  order expired/paid không được tạo link. Không backfill thành công giả hoặc tạo lại hold.
- Chốt policy giá 0 và giới hạn amount provider: hiện checkout chấp nhận 0 và giá
  lớn. Increment này từ chối tạo PayOS link cho amount không được hỗ trợ, trả lỗi
  domain rõ; không coi zero-value order là đã trả tiền qua PayOS.
- Update DBML cùng schema thực; review up/down, FK/check/index, up/down/up trên DB riêng.

### B2. Adapter, config và link endpoint

```text
POST /api/v1/me/orders/:orderId/payments/payos
POST /api/v1/payment-callbacks/payos
GET  /api/v1/admin/payments/reconciliation
```

- Pin SDK chính thức `@payos/node`, dùng typed adapter được inject qua token;
  review dependency/ESM với Node 22 trước khi thêm, cập nhật pnpm lockfile.
- `PAYOS_ENABLED=false` mặc định. Bật thì Joi fail fast với client ID/API key/checksum
  key và các URL cần thiết. Thêm `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL`,
  `PAYOS_WEBHOOK_URL` vào env examples và tài liệu; URL do server cấu hình.
- Link endpoint chỉ active student sở hữu order `PAYOS`, `PENDING`, chưa expired.
  Không nhận amount/provider code/status/return URL tùy ý từ client.
- Reserve attempt/code trong DB → commit → gọi provider → lưu kết quả bằng transaction
  ngắn có revalidation. Không giữ lock trong lúc gọi mạng.
- Amount từ order immutable snapshot, `expiredAt` chuyển sang Unix giây từ deadline;
  description ngắn đúng giới hạn provider. Response DTO trả link/QR và expiry.
- Request đồng thời chỉ có một active attempt/link. Timeout sau provider đã tạo link:
  truy vấn lại bằng cùng code rồi phục hồi; không tạo code/đơn hàng mới khi retry mù.
- Webhook đến trước khi lưu link response vẫn phải tìm được attempt bằng mapping code
  đã commit; đối chiếu link ID theo policy được test, không làm mất settlement.
- Timeout/retry hữu hạn, không log SDK debug payload/headers/secrets. Feature tắt hoặc
  provider unavailable trả 503 rõ, cash checkout vẫn hoạt động.

### B3. Webhook và settlement

1. Validate envelope có giới hạn; giữ nguyên signed `data` cho SDK verify trước
   normalize/mapping. Global whitelist không được xóa field signed trước verification.
   Không suy diễn rằng PayOS cần raw-body signature như provider khác.
2. Verify bằng SDK rồi đối chiếu numeric code, link/reference, amount, VND và signed
   payment result. Không chỉ tin `success` hoặc `code` ngoài signed data.
3. Lock class theo ID → order → payment → enrollment, re-read trạng thái dưới lock.
   Review chung với checkout (class → order) và expiry (order → enrollment);
   kiểm thử race/deadlock trước khi chốt, không thêm order → class ở đường khác.
4. Atomic transaction: claim unique event → payment `SUCCEEDED` → order `PAID`/paidAt
   → activate đúng các enrollment hold hiện có → insert progress → insert email outbox.
   Rollback toàn bộ khi bất kỳ thao tác nào lỗi; ACK sau commit.
5. Duplicate đã xử lý trả 200, không tạo progress/outbox/enrollment lần nữa.
   Cùng reference nhưng nội dung settlement khác phải vào review, không no-op mù.
6. Deadline kiểm tra theo giờ server sau khi lấy lock. `expiresAt <= now`, order đã
   expired/cancelled hoặc class cancelled: lưu settlement/event `REQUIRES_REVIEW`,
   không `PAID`/không active; giải phóng overdue hold qua workflow expiry phù hợp.
   Callback trễ dù timestamp provider sớm cũng vào review trong increment này.
7. Signed event unknown order, sai amount/link/currency: lưu tối thiểu để review rồi
   trả 200 sau persist, không mutate paid/access. Invalid signature trả 400;
   lỗi DB/tạm thời trả 5xx để có thể retry. Không trả 200 trước khi persist an toàn.
8. Mẫu confirm-webhook được nhận dạng theo contract đã xác minh ở A2; ACK không tạo
   payment/enrollment. Không dùng magic `orderCode=123` để bypass business logic.
9. Event failure không tự cấp quyền hoặc hạ trạng thái order đã paid. Không giả định
   PayOS phát đầy đủ callback failure/cancel; quan sát thực tế và dùng query provider
   cho đối soát trạng thái khi cần.

`returnUrl`/`cancelUrl` chỉ phục vụ UX. Browser redirect không có quyền đánh dấu paid.

### B4. Access, mail và reconciliation

- Thêm endpoint/DTO phù hợp cho student xem class content khi enrollment `ACTIVE`;
  kiểm tra ownership và trạng thái tại server, không chỉ đổi cờ trong DB rồi coi là xong.
  Public browse vẫn không lộ meeting URL.
- Pending PayOS không có full access. Cash preview/confirm vẫn ghi rõ chưa triển khai
  cho tới increment tiếp theo; không coi whole Phase 2 hoàn tất vì PayOS pass.
- Tách mail transport dùng chung có chủ đích cho auth + payment, inject qua module
  public API; payment worker gửi sau commit, claim rows an toàn, bounded backoff/retry.
- Unique outbox đảm bảo một job logic/order. SMTP có thể gửi lặp khi crash sau send
  trước mark-sent; ghi semantics at-least-once, không hứa exactly-once delivery.
- Admin đọc queue `REQUIRES_REVIEW` có phân trang/audit; không tự hoàn tiền/cấp chỗ.
  Ghi quy trình đối soát webhook mất hoặc downtime bằng truy vấn provider; không áp
  dụng payment chỉ dựa trên client redirect.

### B5. Kiểm thử bắt buộc trước deploy payment

| Nhóm | Các ca quan trọng và invariant |
|---|---|
| Signature/DTO | Valid fixture, sai/thiếu signature, sửa signed data, field SDK mở rộng, invalid JSON |
| Link | Ownership/role, CASH order, paid/expired, feature off, provider timeout/429/5xx |
| Link concurrency | Double request, restart, provider đã tạo nhưng save response lỗi, webhook đến sớm |
| Settlement | Đúng code/link/amount/VND, multi-class active đầy đủ, progress đúng số unit |
| Replay | Duplicate tuần tự/song song, reference trùng nhưng payload khác; một transition/outbox |
| Atomicity | Fail activation/progress/outbox → không có order paid hoặc hold active nửa chừng |
| Race expiry | Webhook vs worker vs checkout chỗ vừa nhả, deadline boundary, không oversell/deadlock |
| Late/cancelled | EXPIRED/CANCELLED và class bị hủy → review; không tự hồi hold/access |
| Access | Student khác, pending PayOS, public DTO không lộ URL; paid owner có quyền đúng |
| Workers | Restart/backlog, nhiều worker, SMTP fail/retry; settlement không phụ thuộc SMTP uptime |
| Regression | 35 integration tests Phase 2, cash split/expiry, checkout rollback và server price |

HTTP E2E chạy app đã build qua Node và database fixture riêng để có decorator metadata,
thay vì mặc nhiên thêm SWC chỉ để boot Nest trong Vitest. Với file `*.e2e-spec.ts`,
cập nhật Vitest include hoặc script riêng: glob hiện tại `test/**/*.spec.ts` không
bao gồm hậu tố đó. CI phải thực sự chạy test, không chỉ tạo file.

**Gate B:** Node/pnpm đúng; lint/type-check/unit/integration/HTTP E2E/build pass,
không skip DB suite; migration mới và regression pass; OpenAPI/Postman/env/docs đồng bộ.

## 5. C–D — Deploy BE lên VPS test và nghiệm thu

### C. Release và chuyển route

1. Git fetch/pull và checkout commit release đã qua Gate B trên VPS theo workflow
   hiện có; build một image có tag commit/digest, lưu tag trước đó để rollback.
   Smoke và rollout đúng image này; không rebuild tag `latest` khác giữa các mốc.
2. Backup DB staging, kiểm tra restore ở DB khác; chuẩn bị migration tương thích code
   cũ. Compose hiện có build ở cả API/migration: điều chỉnh release override/pipeline
   để dùng image đã build, thay vì claim immutable chỉ nhờ đổi `IMAGE_TAG`.
3. Dùng `docs/VPS_DEPLOYMENT.md` làm nền, env staging riêng và bind `127.0.0.1`.
   Kiểm tra CORS origin, secure cookies HTTPS, key riêng, proxy hop tin cậy và body limit;
   callback không vướng auth/rate-limit/challenge của browser. Swagger tắt/bảo vệ phù hợp.
4. Compose config validation không in secret → chạy một migration job → đợi success
   → start API → kiểm tra `/api/v1/health/ready` và logs đã redact.
5. Chuyển exact callback route từ receiver sang BE; chạy fixture fake trên môi trường
   staging riêng có fake config, rồi bật adapter thật trên release cấu hình PayOS.
   Fake không được kích hoạt bằng header/body từ client hoặc dùng để đánh dấu order thật.
6. Confirm URL với PayOS lần nữa để kiểm tra handler BE nhận được mẫu và ACK.
   Ngừng probe khi route mới hoạt động, không giữ route bypass verify cạnh BE.

### D. Smoke PayOS thực

- Provision tài khoản/lớp test qua API/admin hoặc seed staging có kiểm soát, ngày học
  còn hiệu lực; không chạy seed reset mật khẩu demo trên DB có user thật.
- Student add cart → checkout PAYOS → gọi link hai lần (cùng attempt/link) → mở link/QR.
- User thanh toán giá trị nhỏ đã chọn trên kênh test; lưu order ID, provider reference,
  request ID và thời điểm dưới dạng evidence đã redact.
- Webhook từ PayOS trả 200 sau commit; own order PAID, holds ACTIVE, progress đầy đủ,
  đúng một outbox job; full access đúng student và confirmation mail được xử lý.
- Test thêm pending order hết TTL → EXPIRED, seat release, checkout lại được.
  Ca tamper/duplicate/race/late settlement dùng signed fixture/fake ở DB staging
  riêng; không cần tạo nhiều giao dịch tiền thật để thử các ca lỗi.
- Quan sát một chu kỳ hold PayOS mặc định 15 phút và ít nhất một expiry/mail-worker
  cycle; restart API có kiểm soát, đối soát provider nếu callback thất lạc.

**Gate C–D:** migration/ready pass; BE nhận mẫu confirm và callback thanh toán thực;
paid/access/outbox invariants pass; Phase 2 regression smoke pass; evidence được ghi
vào progress với branch/commit/image. Không kết luận pass từ mỗi HTTP 200.

### Rollback

- Khi lỗi settlement: ngừng tạo link mới, giữ đường tiếp nhận/ghi event an toàn để
  không mất giao dịch đã khởi tạo; thông báo vận hành và query provider để đối soát.
  Cần tách chính sách bật tạo link với tiếp nhận settlement khi triển khai.
- Rollback về image payment đã kiểm chứng nếu schema tương thích. Rollback về commit
  trước payment sẽ mất callback route: chỉ làm cùng phương án receiver bền/đối soát
  đã chuẩn bị, không âm thầm bỏ toàn bộ callback.
- Không destructive `migration:revert` sau có giao dịch; ưu tiên forward fix.
  Không restore backup cũ đè lên settlements mới; restore chỉ dùng theo runbook riêng.
- Nếu thay webhook URL của kênh, phục hồi URL đã ghi và confirm lại; dọn secret/tooling
  test theo thời hạn lưu evidence, giữ lịch sử order/payment.

## 6. Đầu ra và trạng thái tiếp theo

| Increment | Đầu ra review được | Điều kiện đi tiếp |
|---|---|---|
| A | Receiver, sender fixtures, proxy/runbook, log/confirm evidence | Gate A pass |
| B1 | Contract/module API, DBML, migrations, typed adapter/config/link | Migration + link tests pass |
| B2 | Webhook/activation/progress/access/review/outbox + automated suites | Gate B pass |
| C–D | Image release, deploy runbook, VPS/real callback evidence, rollback | Gate C–D pass |
| Sau PayOS | Cash preview/mentor confirmation và exit criteria còn lại | Kế hoạch riêng, không gộp trạng thái |

Hiện đã hoàn thành đọc/đối chiếu và lập kế hoạch. A–D đều chưa triển khai.
Đã biết BE dùng Git pull + Docker Compose trên VPS và chưa có kênh PayOS. Quyết định
public/staging đã ghi ở mục 3. Còn cần domain thực, trạng thái proxy/DNS/TLS, kênh
PayOS và đường SSH được cấu hình an toàn trước khi chạy VPS test. Không đưa
credentials vào tài liệu này.
