# Step 1 — PayOS webhook probe for VPS

Receiver độc lập để kiểm tra HTTPS ingress và chữ ký PayOS trên VPS. Không kết nối
DB, không đổi order/enrollment, không gửi email. Endpoint public không yêu cầu JWT;
mọi callback phải qua `@payos/node` 2.0.5 `webhooks.verify()` trước khi ACK 200.
Casso webhook là giao thức khác; bước này chỉ test PayOS của luồng checkout Mindy.

## Kiểm tra tooling trước deploy

Node 22.20.0 và pnpm 12.6.0, trong thư mục `tools/webhook-probe`:

```bash
pnpm install --frozen-lockfile
pnpm type-check
pnpm test
```

Các test trên dùng key giả, không gọi API PayOS. Đây là kiểm tra code, không phải
bằng chứng server nhận webhook. Test VPS chỉ bắt đầu ở bước 2 sau khi user review.

## Bước 2 — Deploy trên VPS (chưa thực hiện)

### VPS thực tế dùng Cloudflare Tunnel (2026-10-04)

User đã xác nhận qua terminal VPS: `cloudflare-mindy` cùng mạng `mindy-be_backend`
với BE; route `api.quanh123.id.vn` đang tới `http://mindy-be-api-1:3000`.
Không chỉnh Nginx `parking-api` (phục vụ domain khác).

Sau khi chuyển tooling lên VPS và tạo `.env.probe`, chạy tại thư mục tooling:

```bash
docker compose -p mindy-webhook-probe -f compose.yaml -f compose.tunnel.yaml config --quiet
docker compose -p mindy-webhook-probe -f compose.yaml -f compose.tunnel.yaml up -d --build
docker compose -p mindy-webhook-probe -f compose.yaml -f compose.tunnel.yaml ps
curl --fail http://127.0.0.1:3100/health
```

Override nối probe vào mạng external sẵn có, alias riêng `mindy-payos-probe`.
Tunnel sẽ truy cập `http://mindy-payos-probe:3100` trong mạng Docker; không dùng
localhost của container cloudflared. Giữ route API hiện tại; chỉ thêm exact path
callback tới probe sau khi health và network pass. Cấu hình route sẽ được hướng dẫn
riêng sau khi tìm được dashboard/cơ chế quản lý tunnel và review config hiện tại.
Chưa thay đổi tunnel hoặc deploy receiver trên VPS.

Khi dùng override, lệnh dừng cũng phải giữ đủ hai file:

```bash
docker compose -p mindy-webhook-probe -f compose.yaml -f compose.tunnel.yaml down
```

### Reverse proxy trực tiếp (tham khảo, không dùng cho VPS này)

Cần domain HTTPS, SSH host/user, thư mục repo deploy, proxy đang dùng và xác nhận
port loopback 3100 còn trống. Giữ proxy Nginx/Caddy hiện tại. Pull đúng commit chứa
tooling, không đổi stack BE/DB đang chạy.

Tại thư mục `tools/webhook-probe` trên VPS, tạo `.env.probe` bằng editor và chmod 600:

```dotenv
PAYOS_CLIENT_ID=<client-id-cua-kenh-test>
PAYOS_API_KEY=<api-key-cua-kenh-test>
PAYOS_CHECKSUM_KEY=<checksum-key-cua-kenh-test>
```

Không đặt key trong Git, command-line hoặc chat. Compose chỉ bind port host vào
127.0.0.1; bind 0.0.0.0 bên trong container để Docker proxy truy cập được.

```bash
chmod 600 .env.probe
docker compose -p mindy-webhook-probe config --quiet
docker compose -p mindy-webhook-probe up -d --build
docker compose -p mindy-webhook-probe ps
curl --fail http://127.0.0.1:3100/health
```

Route đúng path webhook tới probe, các route BE giữ nguyên. Ví dụ Nginx trong
virtual host HTTPS đang có (review config thật trước khi áp dụng):

```nginx
location = /api/v1/payment-callbacks/payos {
    client_max_body_size 64k;
    proxy_connect_timeout 2s;
    proxy_read_timeout 12s;
    proxy_pass http://127.0.0.1:3100;
    add_header X-Request-Id $upstream_http_x_request_id always;
    proxy_hide_header X-Request-Id;
}
```

Giới hạn receiver 64 KiB và timeout 10 giây. Log chỉ gồm requestId, timestamp UTC,
status, outcome, latencyMs; không log raw payload, chữ ký, key hay thông tin ngân hàng.
Nếu cần correlation proxy, dùng `$upstream_http_x_request_id` trong access log.

Từ một máy ngoài VPS, gửi request sai để kiểm tra public route:

```bash
curl -i --max-time 15 -X POST 'https://<API_TEST_HOST>/api/v1/payment-callbacks/payos' \
  -H 'Content-Type: application/json' --data '{}'
```

Mong đợi 400 `invalid_webhook` và X-Request-Id trùng log receiver. Không theo redirect.
Kiểm tra BE `/api/v1/health/ready` vẫn 200. Signed fixture/negative/tamper/duplicate,
restart, TLS/DNS và latency cần được chạy qua URL thực ở bước 2; không suy ra pass
chỉ từ localhost hoặc request bị reject.

## Bước 3 — PayOS confirm (chưa thực hiện)

Sau bước 2, kiểm tra URL webhook hiện tại của kênh và ghi URL cũ để rollback.
Không trỏ kênh đang phục vụ hệ thống khác sang probe. Dùng SDK chính thức
`webhooks.confirm(httpsUrl)` bằng credentials trên VPS; không tự đăng ký khi boot.
Command confirm sẽ được bổ sung và review ở bước 3 sau khi endpoint thực đã pass.

Lưu kết quả đã redact, thời điểm, requestId của callback mẫu và outcome `verified`.
Mẫu confirm không phải giao dịch đã thanh toán. Không bỏ verify để confirm thành công.

## Dừng / rollback

Nếu bước 2 lỗi, khôi phục exact route proxy từ bản backup, validate rồi reload proxy,
kiểm tra readiness BE; dừng probe bằng:

```bash
docker compose -p mindy-webhook-probe down
```

Không dùng `down` của stack BE hoặc xóa volume DB. Nếu đã đổi URL PayOS ở bước 3,
phục hồi URL đã ghi rồi confirm lại. Ở bước 4, chuyển callback sang BE chỉ sau khi
handler payment được kiểm thử; dọn probe sau khi BE nhận webhook ổn định.

Nguồn: [SDK chính thức](https://github.com/payOSHQ/payos-lib-node),
[PayOS test trên môi trường thực](https://payos.vn/docs/moi-truong-test/).
