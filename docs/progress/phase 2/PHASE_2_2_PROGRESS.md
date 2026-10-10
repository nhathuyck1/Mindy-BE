# Phase 2.2 — Tiến độ tích hợp payOS BE và giao dịch thật

Cập nhật: 2026-10-06.
Kế hoạch: [Phase 2.2](../implement_phase/PHASE_2_2_PAYOS_BE_REAL_PAYMENT.md).

## Hiện trạng

### Increment sửa lỗi tạo QR — 2026-10-06

- User đã pull/deploy; screenshot migration báo no pending migrations. Public
  callback sau đổi tunnel trả 400 `INVALID_PAYMENT_WEBHOOK`, chứng minh route vào
  BE. `CONFIRM_OK` screenshot trước đó được chạy khi callback còn vào probe;
  không dùng làm bằng chứng BE đã nhận confirm sau đổi route.
- Env container PAYOS_ENABLED/CREATE_LINK_ENABLED=true và credentials/return/cancel
  đều SET. Chẩn đoán SDK GET payment mapping của order trên VPS trả HTTP 200,
  code `101`, desc `Mã thanh toán không tồn tại`. Đây là response provider thực
  do user cung cấp; adapter chỉ nhận `231` nên workflow dừng trước CREATE với 503.
- Sửa adapter nhận thêm đúng HTTP 200/code 101/desc đã quan sát như missing link.
  Giữ nguyên attempt/code, GET-first, amount/deadline, signature và transaction.
  101 không rõ nghĩa hoặc server/auth/rate-limit errors tiếp tục trả unavailable.
- Local `pnpm check` pass 102 tests (42 unit + 60 PostgreSQL integration, không
  skip) trên container PostgreSQL 17/DB riêng. Regression dùng adapter thực, mock
  SDK network: GET 101 → CREATE cùng code → persist QR → reuse không gọi lại mạng.
  Built-app HTTP tests pass 4/4. Không dùng credentials thật hoặc tạo giao dịch
  PayOS trong test.
- Bản sửa còn ở workspace; cần commit/push, pull/build/recreate API trên VPS.
  Không cần migration mới/đổi env/đổi tunnel/confirm lại vì bản sửa này. Order cũ
  đã hết hạn cần checkout mới; chưa có evidence tạo QR/live PAID/ACTIVE/mail.

- Đã kiểm tra: plan tích hợp có sẵn trong mục B–D của kế hoạch tiếp nối và bước 4
  Phase 2.1; đã tách thành plan Phase 2.2 hiện hành.
- Đã đọc toàn bộ `document/Flow.txt` và đối chiếu code/module/config hiện tại.
  Plan giữ full payment, class ONLINE/OFFLINE, email online, cash pending preview
  và assigned mentor confirmation. Chat/DM pending là yêu cầu phase chat.
- Prerequisite server: webhook probe và SDK confirm mẫu pass ngày 2026-10-05;
  evidence/giới hạn A1 ở [Phase 2.1](../implement_phase/PHASE_2_1_WEBHOOK_VPS_PAYOS.md).
- BE đã có SDK/module/tables/link/settlement/access/mail/reconciliation. Root runtime
  payOS mặc định tắt; user chọn tự deploy. Chưa nhận tiền thật hoặc thay route VPS.

## Các bước

| Bước | Trạng thái | Evidence/đầu ra |
|---|---|---|
| Lập plan | Hoàn tất | Plan Phase 2.2, rules/core docs/index/progress đồng bộ |
| 2.2.1 Schema và contracts | Implement/test local pass | Additive migration up/down/up, DBML, public Commerce/Enrollment/Class APIs |
| 2.2.2 Adapter và link | Implement/test local pass | SDK 2.0.5, Joi/env, one persisted attempt/order, numeric sequence/channel, GET-first lease recovery |
| 2.2.3 Settlement, access, mail, reconciliation | Implement/test local pass | Atomic settlement, progress/outbox/access, collision/late review, ADMIN reconciliation, mail retry |
| 2.2.4 Quality gate | Local pass | pnpm check 91 tests + HTTP E2E 3 tests, frozen install, Docker runtime smoke |
| 2.2.5 VPS và giao dịch thật | Chờ user tự deploy | Runbook đã sẵn sàng; chưa có evidence BE confirm/live payment |

## Evidence local — 2026-10-05

- Node 22.20.0, pnpm 12.6.0; frozen-lockfile install pass.
- `pnpm check`: lint/type-check/build và **91/91 tests**, không skip: 36 unit và
  55 PostgreSQL integration (36 regression Phase 2 + 19 payment).
- `pnpm test:http`: **3/3 E2E pass** trên app đã build, real cookie guards/SDK
  verifier, test-only fake provider; kiểm tra ownership/DTO/status/private URLs,
  callback lặp/tamper, 400/413, outbox fail trả 503 + rollback + retry thành công.
- Parallel module evaluation của các suite trên Windows lỗi partial export; chốt
  serial test files, giữ Promise.all cho concurrency trong từng business test.
- Test DB ở container PostgreSQL 17 mới `mindy-phase22-test`; base DB
  `mindy_phase22_test`, suites riêng `mindy_phase22_payments_test`/
  `mindy_phase22_http_test`, Docker runtime DB `mindy_phase22_container_test`.
  Không chạy test/migration trên DB development/VPS/production.
  Đã dọn hai container test và network `mindy-phase22-check` sau kiểm thử.
- Docker `mindy-be:phase22-check` build pass; all 10 migrations pass trên empty
  runtime test DB. API chạy read-only dưới user `node`, healthy, readiness 200;
  PAYOS_ENABLED=false callback trả 503. Chưa chạy provider confirm/payment thật.
- Postman/env/DBML/README/rules/core/phase/progress đồng bộ; local Markdown links
  và diff whitespace được kiểm tra. Giữ user edits/probe evidence có sẵn.

## Quyết định thực thi và việc còn lại

- Một attempt/order qua unique order_id, không tự tạo attempt mới sau timeout.
  Lease 30 giây, SDK timeout 10 giây/no auto retry; restart/retry GET cùng code trước
  create. QR có thể null khi phục hồi, dùng checkoutUrl. Amount positive safe integer
  VND; deadline provider Unix Int32; create/reuse 201, processing là CREATING/link null.
- Settlement/reconciliation dùng cùng class → order → payment → enrollment lock
  order. Outbox cùng commit, SMTP sau commit; giao nhận email at-least-once.
- `GET /me/orders/:orderId` có payment summary; pending/other student không có
  class/session private URL. ADMIN POST reconcile ghi actor/source; không dùng
  redirect mở quyền hoặc refund/cấp chỗ tự động cho late/mismatch.
- Chờ user làm [deploy runbook](../PAYOS_PHASE_2_2_DEPLOYMENT.md): backup/restore,
  release image/migration, exact tunnel route sang BE, confirm lại, bật tạo link,
  một giao dịch nhỏ và evidence PAID/ACTIVE/progress/mail/access + expiry/recovery.
- Cash preview/mentor confirmation và hardening Phase 0/1 còn mở. Phase 2.2 chưa
  đánh dấu complete vì thiếu VPS/live evidence; không có money transfer trong lượt này.
