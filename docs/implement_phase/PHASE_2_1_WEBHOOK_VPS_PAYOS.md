# Phase 2.1 — Test webhook PayOS trên server

Cập nhật: 2026-10-05. Webhook server đã test ổn và bước 3 confirm đã pass.
Phần tích hợp BE/deploy/giao dịch thật của bước 4 được tách thành
[Phase 2.2](./PHASE_2_2_PAYOS_BE_REAL_PAYMENT.md) theo yêu cầu hiện tại.
Quy trình review từng bước dưới đây là lịch sử Phase 2.1; yêu cầu lập Phase 2.2
hiện tại cho phép tiếp tục lập kế hoạch, không cần confirm lại bước 3.

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

## 1. Chuẩn bị receiver và runbook — đã hoàn tất

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

## 2. Deploy receiver và test ingress trên VPS — đã test chức năng, còn giới hạn A1

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

## 3. Confirm webhook từ PayOS tới VPS — đã pass 2026-10-05

1. Kiểm tra kênh/credentials thật trên VPS, URL webhook cũ và liệu kênh có phục vụ
   hệ thống khác không. Không thay URL kênh đang hoạt động bằng probe thiếu xử lý payment.
2. Chuẩn bị command vận hành dùng SDK `webhooks.confirm(httpsUrl)`;
   không chạy tự động khi receiver boot, không in credentials/response chứa tài khoản.
3. Chạy confirm tới URL thực; receiver verify callback mẫu và trả 200.
4. Đối chiếu kết quả confirm với callback `verified` trong log VPS và requestId/thời điểm.
   Nếu lỗi, kiểm tra DNS/TLS → proxy → parser → signature → ACK; không bypass verify.

**Nghiệm thu:** có evidence PayOS thực sự gọi VPS, chữ ký hợp lệ và confirm thành công.
Callback mẫu không chứng minh order đã PAID. **Dừng để user check** trước bước 4.

## 4. Tích hợp BE, deploy và test giao dịch nhỏ — chuyển sang Phase 2.2

Code BE đã implement/test local; chưa deploy payment hoặc nhận tiền thật.
Kế hoạch thực thi và checklist hiện hành nằm trong
[Phase 2.2 — payOS BE và giao dịch thật](./PHASE_2_2_PAYOS_BE_REAL_PAYMENT.md).
Các bước dưới đây giữ làm tham chiếu; user tự deploy theo runbook Phase 2.2.

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
| 1 | Hoàn tất chuẩn bị | Type-check/lint pass, 6/6 HTTP tests pass; frozen install và Docker build pass trên máy local |
| 2 | Receiver/HTTPS/signature/restart/concurrency đã test; full A1 còn giới hạn | Xem evidence bên dưới; chưa xác minh signed fixture ngoài VPS và toàn bộ mục tiêu latency/routing |
| 3 | Hoàn tất confirm; user xác nhận webhook server ổn | CONFIRM_OK và callback mẫu 200 verified trên VPS, ngày 2026-10-05 |
| 4 | Phase 2.2 đã implement/test local; chờ user deploy | Code payment/settlement có test; chưa có giao dịch thật trên VPS |

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

### Receiver trên VPS — bằng chứng user gửi (2026-10-05)

- User đã fetch tooling từ `origin/Feat/Webhooktest`, cấu hình env PayOS trên VPS
  và build/start Compose với `compose.yaml` + `compose.tunnel.yaml`.
- Container `mindy-webhook-probe-probe-1`, image `mindy-webhook-probe:step1`,
  trạng thái healthy; host port bind `127.0.0.1:3100`.
- Curl loopback `/health` trả `ready`, requestId `4a2a2388-05a7-4887-a9c1-bcb2ae1fc57e`.
- Container kiểm tra trên mạng `mindy-be_backend` gọi
  `http://mindy-payos-probe:3100/health`, HTTP 200 + ready,
  requestId `25575bea-900c-4c3d-a565-217d133f9e38`.
- Đây là evidence health/network trên VPS, chưa xác nhận callback có chữ ký qua
  HTTPS public. Tiếp theo thêm exact callback path vào tunnel hiện tại, giữ route BE.
  Bước 2 còn đang làm; chưa chuyển bước 3/confirm hoặc bước 4/thanh toán.

### HTTPS ingress — 2026-10-05

- User đã thêm route trong tunnel `flowzy-quanh123`: hostname `api.quanh123.id.vn`,
  path regex `^/api/v1/payment-callbacks/payos$`, service `http://mindy-payos-probe:3100`,
  đứng trước route API tổng quát. Các hostname frontend/BE vẫn giữ nguyên service.
- Assistant gửi POST JSON `{}` qua URL public từ máy ngoài VPS: HTTP 400,
  `invalid_webhook`, requestId `f3a90981-f02d-4725-89fd-dfb03c747a1b`.
- Kiểm tra readiness public của BE: HTTP 200, status ok.
- Chỉ chứng minh public request được route tới probe và input sai bị reject;
  signed fixture/tamper/duplicate và các ca vận hành VPS còn cần chạy trước Gate A1.
  Chưa gọi PayOS confirm; bước 2 chưa hoàn tất.

### Signed fixture qua HTTPS từ VPS — 2026-10-05

- User chạy synthetic fixture trong container probe, ký bằng checksum key trong env,
  gửi qua URL HTTPS public (không gọi payment API, không tạo giao dịch tiền thật).
- Screenshot kết quả: VALID 200 verified; TAMPERED 400 verification_failed;
  MISSING_SIGNATURE 400 invalid_webhook; DUPLICATE 200 verified.
- VALID requestId `5f7c1eb9-b84f-448f-8383-3a810b47cfe4`;
  DUPLICATE requestId `20605dd4-71d0-4cb0-8770-31d81a2f65f9`.
- Đây là fixture tự ký, chưa phải callback của PayOS. Ca JSON lỗi/body quá lớn,
  concurrency và restart còn chờ. Signed fixture chạy từ VPS qua public URL;
  chưa ghi nhận signed request từ một máy ngoài VPS. Không đánh dấu Gate A1 hoàn tất.

### Input limits trên VPS — 2026-10-05

- Screenshot user: INVALID_JSON HTTP 400 `invalid_json`, requestId
  `8642a7a3-85ee-4d99-9802-83dd56929323`.
- OVERSIZED HTTP 413 `body_too_large`, requestId
  `bee2fcd7-9bc6-4bd0-b934-450c52bd3d3c`.
- Health sau test vẫn ready, requestId `aaebfdfc-5ad7-49f9-8e08-7d4a4a9e10c9`.
- Chưa có evidence concurrent signed requests hoặc recovery sau restart.

### Recovery sau restart probe — 2026-10-05

- Screenshot user sau restart/Compose wait: probe healthy; loopback health ready,
  requestId `34d1ad6f-ff6b-4b8c-b536-52eb0fac7b9f`.
- POST `{}` qua public callback vẫn HTTP 400 `invalid_webhook`, requestId
  `4a4494e4-935c-40aa-8a10-2ddc1f06f61a`.
- BE public readiness `status: ok`, timestamp `2026-10-05T15:02:06.676Z`.
- Recovery của probe đã được user kiểm chứng; concurrency còn cần chạy.

### Concurrent delivery — 2026-10-05, dừng review bước 2

- Screenshot user: 5 concurrent synthetic signed callbacks qua HTTPS từ VPS đều
  HTTP 200 `verified`, mỗi request có requestId riêng.
- Latency theo thứ tự request 1–5: 696, 1672, 1055, 517, 2351 ms.
- Functional concurrency pass. Một request vượt mục tiêu 2 giây; đây là thời gian
  end-to-end từ sender, chưa tách latency mạng/Cloudflare và thời gian receiver.
  Chưa kết luận đạt mục tiêu latency; cần đối chiếu log latencyMs của receiver.
- Dừng review theo yêu cầu user, chưa chuyển bước 3. Các bằng chứng hiện có:
  health/network, public routing, signed/tampered/missing/duplicate callbacks,
  input limits, restart recovery, concurrency. Chưa gọi confirm của PayOS.
- Không đánh dấu toàn bộ Gate A1 đạt: còn signed fixture từ máy ngoài VPS,
  đối chiếu log requestId/latency và mục tiêu <2 giây; chưa kiểm thử proxy reload
  riêng (VPS sử dụng managed tunnel, không chỉnh Nginx).

### Chuyển bước 3 theo yêu cầu user — 2026-10-05

- User yêu cầu "Qua bước 3" sau concurrent fixture. Chuyển sang confirm với PayOS;
  giữ nguyên các giới hạn bước 2 chưa kiểm chứng, không đánh dấu full Gate A1 pass.
- Đã chuẩn bị command dùng SDK 2.0.5 trong container đang chạy; timeout 30 giây,
  không retry tự động, log SDK off và output redact. Không đăng ký khi app boot.
- Confirm sẽ đăng ký URL của kênh test. Cần lưu URL cũ nếu có, chạy command rồi
  đối chiếu CONFIRM_OK với callback mẫu 200 verified trong log cùng cửa sổ thời gian.
- Chưa có evidence confirm thành công; dừng review sau khi user gửi kết quả bước 3.

### Kết quả bước 3 — 2026-10-05

- User chạy SDK confirm trên VPS: `CONFIRM_OK` cho
  `https://api.quanh123.id.vn/api/v1/payment-callbacks/payos`, kết thúc
  `2026-10-05T15:06:34.588Z` (22:06:34 giờ Asia/Bangkok).
- Log receiver cùng cửa sổ confirm: timestamp `2026-10-05T15:06:34.302Z`,
  requestId `cb1f34be-0dd1-4750-b057-fb9c6947d6fb`, status 200,
  outcome verified, latencyMs 0.53. Các log ready kế cận là healthcheck, không phải callback.
- Bước 3 pass theo evidence confirm + callback verify trên VPS. Chưa có giao dịch
  tiền thật hoặc settlement/order/enrollment; bước 4 chưa bắt đầu.
- Dừng review theo yêu cầu user. Các giới hạn Gate A1/bước 2 vẫn được giữ trong
  tài liệu, không dùng confirm để tự đánh dấu các ca vận hành chưa chạy đã pass.
