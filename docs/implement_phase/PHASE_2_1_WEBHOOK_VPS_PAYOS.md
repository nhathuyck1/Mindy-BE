# Phase 2.1 — Test webhook PayOS trên server

Cập nhật: 2026-10-04. Thực hiện lần lượt **1 → 2 → 3 → 4**; xong mỗi bước
phải dừng để user check và đồng ý trước khi bắt đầu bước kế tiếp.

## Phạm vi và hiện trạng

- User đã có Casso, tài khoản PayOS đã xác thực; thông tin trước đây nói chưa có
  kênh trong kế hoạch cũ cần hiểu là lịch sử. Cần kiểm tra credentials/kênh thực ở VPS.
- Mindy hiện có checkout PAYOS/hold nhưng chưa có SDK runtime, payment link,
  PaymentsModule hoặc callback route trong BE.
- Phase 2.1 test PayOS trước, theo luồng checkout đã chọn. Nếu cần test webhook
  Casso riêng, dùng route và cơ chế xác thực riêng sau khi chốt phạm vi với user;
  không áp dụng chữ ký PayOS cho Casso.
- Mọi nghiệm thu ingress/confirm/thanh toán thực hiện **trên server/VPS**.
  Automated test local chỉ kiểm tra code tooling, không thay thế evidence server.
- Không có sandbox PayOS riêng; bước 4 dùng giao dịch thật giá trị nhỏ do user chọn.
- Kế thừa các yêu cầu Gate A–D của
  [kế hoạch chi tiết trước đó](./PHASE_2_WEBHOOK_VPS_PAYOS_PLAN.md).

## 1. Chuẩn bị receiver và runbook — chờ user review

### Công việc

- Tạo tooling riêng tại `tools/webhook-probe/`, manifest/lockfile độc lập;
  pin Node 22.20.0, pnpm 12.6.0, SDK `@payos/node` 2.0.5.
- Receiver nhận exact `POST /api/v1/payment-callbacks/payos`; route public,
  không JWT/cookie, nhưng chỉ ACK 200 sau khi SDK verify chữ ký.
- Input JSON tối đa 64 KiB, timeout 10 giây, lỗi JSON/signature/envelope trả 4xx;
  duplicate ACK ổn định. Không coi đây là business idempotency.
- Không DB/payment/order/enrollment/email side effects. Log metadata và requestId,
  không raw payload, signature, key hoặc thông tin tài khoản.
- Thêm Compose/Dockerfile riêng, non-root, host port chỉ loopback, healthcheck,
  graceful shutdown, runbook cấu hình proxy, env VPS và rollback.
- Kiểm tra code với synthetic fixture/key giả bằng SDK; không gọi PayOS thật.

### Đầu ra và điều kiện hoàn thành

- [Tooling/runbook](../../tools/webhook-probe/README.md), tests và lockfile review được.
- Type-check, HTTP tests và lint tooling pass. Kết quả ghi ở progress sau khi chạy.
- Không deploy, không đăng ký URL PayOS trong bước 1.
- **Dừng sau bước 1** để user review; bước 2 cần domain, SSH host/user hoặc alias,
  thư mục deploy, proxy hiện tại và key đặt trên VPS (không gửi chat).

## 2. Deploy receiver và test ingress trên VPS — chưa làm

1. Kiểm tra SSH, DNS A/AAAA, TLS chain, reverse proxy hiện tại, Docker Compose,
   port 3100, BE readiness và ảnh hưởng route trước khi chỉnh cấu hình.
2. Pull/checkout commit tooling đã review theo workflow Git + Docker Compose;
   build/tag image, tạo `.env.probe` trên VPS, chạy Compose project riêng.
3. Backup proxy config, thêm exact route callback về probe; validate rồi reload.
   Các route BE vẫn trỏ về API; không public port DB/probe.
4. Gửi fixture đã ký từ ngoài VPS qua HTTPS thực, kiểm tra 200 không redirect và
   correlation requestId. Test sai/thiếu chữ ký, data bị sửa, invalid JSON,
   quá giới hạn body, duplicate/concurrent requests, receiver restart/proxy reload.
5. Kiểm tra BE readiness vẫn pass, latency bình thường mục tiêu dưới 2 giây.

**Nghiệm thu:** ghi hostname, commit/image tag, thời điểm, requestId, status và
kết quả từng ca đã redact. Không gọi A1 pass chỉ từ localhost hoặc request sai bị reject.
Chưa đăng ký URL PayOS. **Dừng để user check** trước bước 3.

## 3. Confirm webhook từ PayOS tới VPS — chưa làm

1. Kiểm tra kênh/credentials thật trên VPS, URL webhook cũ và liệu kênh có phục vụ
   hệ thống khác không. Không thay URL kênh đang hoạt động bằng probe thiếu xử lý payment.
2. Chuẩn bị command vận hành dùng SDK `webhooks.confirm(httpsUrl)`;
   không chạy tự động khi receiver boot, không in credentials/response chứa tài khoản.
3. Chạy confirm tới URL thực; receiver verify callback mẫu và trả 200.
4. Đối chiếu kết quả confirm với callback `verified` trong log VPS và requestId/thời điểm.
   Nếu lỗi, kiểm tra DNS/TLS → proxy → parser → signature → ACK; không bypass verify.

**Nghiệm thu:** có evidence PayOS thực sự gọi VPS, chữ ký hợp lệ và confirm thành công.
Callback mẫu không chứng minh order đã PAID. **Dừng để user check** trước bước 4.

## 4. Tích hợp BE, deploy và test giao dịch nhỏ — chưa làm

1. Sau Gate A, triển khai payment theo mục B của kế hoạch chi tiết: module/adapter,
   mapping numeric provider orderCode, migrations mới, create link, callback transaction,
   amount/state validation, duplicate handling, activation/progress, email outbox,
   late-payment reconciliation. Không sửa migration đã deploy.
2. Chạy quality gate của BE với DB test riêng (không skip integration); cập nhật
   contracts/env/Postman/tài liệu; review migration/rollback trước rollout VPS.
3. Backup DB staging và deploy đúng image đã kiểm thử, migrate một job, readiness pass;
   chuyển exact callback route sang BE, confirm PayOS lại rồi dọn probe khi ổn định.
4. Tạo order/link bằng API trên server, user thanh toán số tiền nhỏ đã chọn.
   Kiểm tra callback sau commit, order PAID, enrollment ACTIVE, progress đầy đủ,
   đúng một email outbox và quyền học đúng student. Kiểm tra expiry/reconciliation.

**Nghiệm thu:** lưu evidence giao dịch thực đã redact cùng commit/image và invariants;
HTTP 200 đơn lẻ không đủ. **Dừng để user check** kết quả cuối, không tự mở scope tiếp.

## Trạng thái

| Bước | Trạng thái | Evidence |
|---|---|---|
| 1 | Hoàn tất chuẩn bị, chờ user check | Type-check/lint pass, 6/6 HTTP tests pass; frozen install và Docker build pass trên máy local |
| 2 | Đang khảo sát qua kết quả user gửi | Đã xác định domain/tunnel/mạng Docker; chưa deploy receiver hoặc test ingress |
| 3 | Chưa bắt đầu | Chưa gọi confirm-webhook |
| 4 | Chưa bắt đầu | Chưa tích hợp payment hoặc giao dịch thật |

### Kết quả bước 1 (2026-10-04)

- `pnpm install --frozen-lockfile`, `pnpm type-check`: pass trong tooling.
- `pnpm test`: 6/6 pass, không skip; verify bằng SDK thật với key giả, không gọi mạng PayOS.
- `pnpm exec biome check tools/webhook-probe`: pass.
- Docker build `mindy-webhook-probe:step1-review`: pass trên Docker Desktop local.
- Chưa có evidence server, chưa deploy/confirm/thanh toán. Dừng tại đây theo yêu cầu user.

Nguồn: [SDK PayOS chính thức](https://github.com/payOSHQ/payos-lib-node),
[môi trường test PayOS](https://payos.vn/docs/moi-truong-test/).

### Khảo sát bước 2 qua terminal user (2026-10-04)

- Repo VPS `/home/mindycode/mindycoding/Mindy-BE`, nhánh `dev`, commit `e63bf92`,
  working tree sạch tại thời điểm user kiểm tra; chưa có `tools/webhook-probe`.
- Domain `https://api.quanh123.id.vn`, readiness đã trả HTTP 200 từ máy ngoài VPS.
- Port 3100 trống; Nginx `parking-api` phục vụ `mindy.huydevops.id.vn:8080`,
  không phải tuyến API cần chỉnh.
- `cloudflare-mindy` dùng mạng `flowzy-tunnel` và `mindy-be_backend`, không có
  Compose label hoặc mount config. Log ingress ghi frontend
  `quanh123.id.vn → http://mindy-frontend:3001`, API
  `api.quanh123.id.vn → http://mindy-be-api-1:3000`.
- Thêm `compose.tunnel.yaml` dùng mạng external `mindy-be_backend`, alias
  `mindy-payos-probe`. Cần đưa tooling lên VPS, đặt env và chạy receiver trước khi
  thêm route callback. Chưa thay đổi tunnel, chưa confirm PayOS hoặc giao dịch thật.
