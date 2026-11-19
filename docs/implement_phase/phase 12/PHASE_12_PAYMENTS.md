# Phase 12 — Thanh toán và hạn đơn

Ngày lập: **20/11/2026**. Trạng thái: **PLANNED**.

[Roadmap chung](../BUSINESS_NOTIFICATIONS_ROADMAP.md) ·
[Flow](../../api_flow/BUSINESS_NOTIFICATIONS_FLOW.md) ·
[API proposal](../../api_flow/BUSINESS_NOTIFICATIONS_flow-api-breakdown.md) ·
[Progress](../../progress/BUSINESS_NOTIFICATIONS_PROGRESS.md)

## 1. Mục tiêu, đầu vào và đầu ra

Phụ thuộc: **Phase 9**. Quy tắc nghiệp vụ, schema, recipient cutoff,
terminal visibility, flags và rollout theo roadmap chung. Phase này chưa có runtime
hoặc evidence nghiệm thu; chỉ tick AC khi có source + test + kết quả thực chạy.

Nguồn: payments/services/payment-settlement.service.ts, cash-payments.service.ts, payment-reconciliation.service.ts, payment-email.service.ts; commerce/services/order-expiry.service.ts. Schema/outbox là mới; không thay webhook contract.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
| --- | --- |
| 12-T01 | Nối PAYMENT_CONFIRMED vào PAYOS settlement, CASH confirmation và reconciliation thành công bằng cùng canonical settlement event; dựa owner order. |
| 12-T02 | Implement scheduler ORDER_EXPIRING trong 24 giờ cuối, dedupe theo order/expiry revision, lock/recheck PENDING/expiresAt; không sửa thời hạn hoặc tạo order mới. |
| 12-T03 | Nối ORDER_EXPIRED tại mọi path persist expiry; loại reminder stale và ngăn race với payment/cancel; late webhook REQUIRES_REVIEW không phát confirmed. |
| 12-T04 | Giữ PaymentEmailService/worker độc lập; template in-app không có giao dịch/ngân hàng/URL provider; test owner còn nhận khi enrollment đã hết quyền. |

## 3. Tiêu chí nghiệm thu

- [ ] `AC12-1`: PAYOS duplicate/CASH retry/reconciliation replay tạo tối đa một confirmed cho settlement thật; REQUIRES_REVIEW/rollback không phát xác nhận thành công.

- [ ] `AC12-2`: Fake clock kiểm trước cửa sổ/trong cửa sổ/đúng expiry; mỗi expiry revision chỉ một reminder; PAID/CANCELLED/EXPIRED không nhận reminder mới.

- [ ] `AC12-3`: Payment vs reminder/expiry có barrier: nếu paid trước eligibility check thì bỏ reminder; notification reminder đã tồn tại ẩn khi trạng thái đổi; expiry chỉ từ persisted EXPIRED.

- [ ] `AC12-4`: Chủ order xem notice terminal sau enrollment expiry; foreign owner luôn 404; việc gửi in-app không enqueue lại email và lỗi delivery không đảo settlement.

## 4. Kiểm chứng và bàn giao

Bộ kiểm dự kiến: `test/integration/phase12-notifications.spec.ts` và
`test/http/phase12-notifications.spec.ts`, bổ sung unit policy/clock và
barrier/socket tests nơi phù hợp. Đây là file dự kiến, chưa được tạo.
Dùng DB test riêng; ghi rõ skipped/failed và source revision.
Cập nhật progress chung Phase 8–15 sau khi có kết quả. Không suy test local thành FE hoặc deployed acceptance.
