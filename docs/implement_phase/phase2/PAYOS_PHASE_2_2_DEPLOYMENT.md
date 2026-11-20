# Phase 2.2 — Runbook deploy payOS BE và giao dịch thật

User tự deploy theo runbook. Code/test local không xác nhận VPS đã deploy hoặc nhận tiền.
Kế hoạch: [Phase 2.2](./implement_phase/PHASE_2_2_PAYOS_BE_REAL_PAYMENT.md).
Tiến độ/evidence: [Phase 2.2 progress](./progress/PHASE_2_2_PROGRESS.md).

## 1. Chuẩn bị release và môi trường

- Commit/push các thay đổi đã review để VPS pull được release. Không dùng working
  tree chưa commit làm căn cứ image release. Giữ commit/image payment trước đó.
- Kiểm chứng dữ liệu Mindy test được tách biệt với dữ liệu user thật. Không reset
  schema/seed demo password hoặc chạy migration down trên DB có giao dịch.
- Kênh payOS hiện đã confirm probe tại
  `https://api.quanh123.id.vn/api/v1/payment-callbacks/payos`. Cùng URL sẽ trỏ BE;
  không đổi client ID/checksum key sang kênh khác khi còn link chưa settle.
- Chuẩn bị backup DB và xác minh restore sang DB khác, theo
  [VPS baseline](./VPS_DEPLOYMENT.md). Không restore đè settlements mới.
- Local/CI: `pnpm check` và `pnpm test:http` phải pass với `TEST_DATABASE_URL`
  riêng tên `_test`. Payment/HTTP suites tạo thêm DB `*_payments_test`/`*_http_test`
  trên cùng PostgreSQL test; test user cần quyền CREATE DATABASE. Không cấp URL VPS
  production cho test runner. Test HTTP dùng fake provider chỉ trong test process.

## 2. Cấu hình VPS

Đặt trực tiếp trong `.env.production` (ngoài Git, không gửi chat/log). Compose dùng
file này cho **cả migration và API**. Các biến JWT/CORS/DB/SMTP baseline vẫn bắt buộc.

```dotenv
PAYOS_ENABLED=true
PAYOS_CREATE_LINK_ENABLED=false
PAYOS_CLIENT_ID=<client-id-cua-kenh-da-confirm>
PAYOS_API_KEY=<api-key>
PAYOS_CHECKSUM_KEY=<checksum-key>
PAYOS_RETURN_URL=https://<frontend-host>/payment/result
PAYOS_CANCEL_URL=https://<frontend-host>/payment/result
PAYOS_WEBHOOK_URL=https://api.quanh123.id.vn/api/v1/payment-callbacks/payos
ORDER_PAYOS_HOLD_TTL_SECONDS=900
ORDER_EXPIRY_JOB_ENABLED=true
PAYMENT_MAIL_JOB_ENABLED=true
PAYMENT_MAIL_JOB_INTERVAL_SECONDS=30
MAIL_ENABLED=true
API_BIND_ADDRESS=127.0.0.1
```

Return/cancel URL phải là trang FE thực tế hiển thị kết quả qua `GET own order`,
không dùng query `status/success` để mở quyền. SMTP cấu hình hợp lệ và mail sink thật
cho test. Nếu MAIL_ENABLED=false, settlement vẫn ghi outbox nhưng worker không gửi;
không đánh dấu tiêu chí email đã pass. Secret SDK debug log bị tắt.

## 3. Build một image, migrate, start API

Các lệnh dưới đây chạy trên **Linux VPS**, trong thư mục BE hiện hữu, ví dụ
`/home/mindycode/mindycoding/Mindy-BE`. Dùng đúng Compose project hiện đang chạy để
giữ DB/network; không tự đổi `-p` và vô tình tạo DB mới. Không in `compose config`
đầy đủ vì có thể hiện secrets; dùng `config --quiet`.

```bash
git pull --ff-only
export IMAGE_TAG="$(git rev-parse --short=12 HEAD)"
docker compose --env-file .env.production -f compose.production.yaml config --quiet
docker build --target runtime -t "mindy-center-api:${IMAGE_TAG}" .
docker compose --env-file .env.production -f compose.production.yaml up -d --wait postgres
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps migration
# Chỉ tiếp tục nếu migration command exit 0.
docker compose --env-file .env.production -f compose.production.yaml up -d --no-build --no-deps --wait api
docker compose --env-file .env.production -f compose.production.yaml exec -T api node -e \
  'fetch("http://127.0.0.1:3000/api/v1/health/ready").then(async r => { if (!r.ok) process.exit(1); console.log(await r.text()); })'
```

Migration `1791158400000-payos-payments` chỉ thêm payment/event/progress/outbox;
không tạo lại enrollment. One-off migration và API dùng cùng `IMAGE_TAG`, không
rebuild API sau gate. Không dùng `down -v` để deploy. Nếu đang dùng Compose override,
giữ các file/flags đó trong mọi lệnh và kiểm tra network service thực tế.

## 4. Chuyển exact tunnel route sang BE và confirm

1. Lưu config routing cũ. Tunnel `flowzy-quanh123` hiện có hostname
   `api.quanh123.id.vn`, regex `^/api/v1/payment-callbacks/payos$`, service
   `http://mindy-payos-probe:3100`, đứng trước catch-all BE.
2. Đổi service của exact route này sang **cùng BE service/network URL đang dùng
   trong catch-all API** (port container 3000); không đoán container ID/hostname.
   Probe alias/port 3100 không phải endpoint BE. Giữ các hostname/route khác.
3. Public POST `{}` vào callback phải trả 400 `INVALID_PAYMENT_WEBHOOK` từ BE;
   readiness BE vẫn 200. Test invalid JSON → 400, quá 64 KiB → 413; kiểm chứng
   signed ingress ngoài VPS, log requestId/latency và recovery sau đổi routing.
4. Confirm lại từ container API bằng SDK pin trong chính release:

```bash
docker compose --env-file .env.production -f compose.production.yaml exec -T api \
  node dist/operations/confirm-payos-webhook.js
docker compose --env-file .env.production -f compose.production.yaml logs --since 5m api
```

`CONFIRM_OK` cùng callback log `CONFIRM_SAMPLE` (hoặc DUPLICATE nếu mẫu đã nhận),
status 200/requestId mới và event confirm trong DB là evidence BE nhận mẫu. Mẫu
chính thức được nhận diện theo đầy đủ identity đã verify; không bypass bằng mỗi
orderCode=123. Signed unknown event khác vào review và ACK sau persist.
Confirm chỉ là command vận hành, không tự chạy lúc boot. Không tạo giao dịch từ mẫu.

Sau khi BE confirm pass, đặt `PAYOS_CREATE_LINK_ENABLED=true` và recreate API với
cùng image qua lệnh `up -d --no-build --no-deps --wait api`. Dừng probe sau khi BE
ổn định; không coi probe stateless là đường dự phòng lưu tiền.

## 5. Student flow và bằng chứng live

Dùng Postman/cookie jar trên hostname server hoặc FE đã tích hợp:

1. Active STUDENT login → `POST /me/cart/items { classId }` →
   `POST /me/cart/checkout { paymentType: "PAYOS" }`; response `orders[]`.
2. `POST /me/orders/:orderId/payments/payos {}`. Response 201:
   `paymentId`, `orderId`, `amount`, `status`, `expiresAt`, `checkoutUrl`, `qrCode`.
   Không truyền amount/URLs/code/status. `CREATING` và link null: retry sau, cùng
   paymentId/code, không checkout lại. Timeout 503 cũng retry link API cho cùng order.
3. Gọi link API lần nữa để kiểm tra reuse. Trường hợp GET provider phục hồi response,
   QR có thể null; dùng checkoutUrl theo route payOS chính thức. Hold không được gia hạn.
4. **User tự chuyển tiền** giá trị nhỏ đã chọn bằng link/QR. Chọn class test có giá
   hợp lệ và ngày học còn hiệu lực; không đổi giá snapshot order đã tạo.
5. Đọc `GET /me/orders/:orderId`: order PAID, `payment.status=SUCCEEDED`, paidAt có
   giá trị, checkoutUrl null sau paid. `GET /me/classes/:classId` cho owner trả
   class/session meeting URL; pending/other student bị 403, public browse không lộ URL.
6. DB evidence: holds hiện hữu ACTIVE; số progress bằng số class units đã mua;
   một mail outbox/order. Mail worker chuyển SENT, nhận email xác nhận online.
   HTTP 200 hoặc redirect đơn lẻ không phải proof đã PAID.

SQL chỉ đọc, thay order UUID bằng giá trị test trong bằng chứng đã redact:

```sql
SELECT id, status, total_amount, paid_at, expires_at FROM orders WHERE id = '<order-uuid>';
SELECT id, status, amount, paid_at FROM payment_transactions WHERE order_id = '<order-uuid>';
SELECT e.id, e.status, count(p.id) AS initialized_units
FROM enrollments e JOIN order_details d ON d.id = e.order_detail_id
LEFT JOIN class_unit_progress p ON p.enrollment_id = e.id
WHERE d.order_id = '<order-uuid>' GROUP BY e.id, e.status;
SELECT status, attempts, sent_at FROM payment_confirmation_emails WHERE order_id = '<order-uuid>';
```

Lưu release commit/image, thời điểm, order/payment ID, reference/requestId đã redact,
state/progress/outbox/access/mail results vào Phase 2.2 progress. Quan sát pending
expiry 15 phút, seat release, recheckout và một cycle mail worker/restart. Fault/race
fixtures chạy ở DB test riêng; không ký fake payment cho order live.

## 6. Đối soát và lỗi vận hành

- `GET /admin/payments/reconciliation?page=1&pageSize=20` cho ADMIN: xem review events.
- Webhook thất lạc: lấy paymentId từ own-order/DB và ADMIN gọi
  `POST /admin/payments/:paymentId/reconcile {}`. BE query payOS, chỉ settle một
  giao dịch trả đúng/full amount, trong deadline và hold còn hiệu lực; ghi actor/source.
  Retry/real callback sau đó idempotent. PAID provider bị partial/multiple transfers,
  order expired/cancelled hoặc mismatch phải review, không tự cấp chỗ/refund.
- CREATING sau crash: retry link API khi lease 30 giây hết hạn; query cùng provider
  code trước create. Không cấp mã mới để né lỗi provider.
- Callback 400: signature/envelope; kiểm tra đúng kênh/key/route, không bypass verify.
  Callback 503: provider/DB/transaction chưa persist an toàn, giữ retry/đối soát.
- MAIL_ENABLED=false: bật transport trước nghiệm thu email; jobs vẫn nằm PENDING.
  Failed SMTP retry tối đa 10 lần, exponential backoff tối đa một giờ. FAILED jobs
  cần kiểm tra transport và requeue có audit theo vận hành, không sửa order/payment.
  Crash sau send trước SENT có thể gửi mail lặp (at-least-once).

## 7. Rollback

Đặt `PAYOS_CREATE_LINK_ENABLED=false`, recreate cùng image trước để dừng phát link
mới; **giữ PAYOS_ENABLED=true**, credentials, callback route và event store cho
link đã phát hành. Rollback về image payment tương thích schema đã kiểm chứng hoặc
forward fix. Không chuyển callback về probe/BE trước payment, không migration down
hay restore backup cũ sau có link/giao dịch. Nếu handler down, khôi phục handler và
query provider/reconcile từng attempt trước khi xác nhận đã xử lý hết giao dịch.

Cash preview/mentor confirmation, chat/DM và các exit criteria Phase 0/1 vẫn chưa
được triển khai/đóng bởi release PayOS này.
