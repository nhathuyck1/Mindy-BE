# Phase 2.3 — Tiến độ My Classes + Personal Schedule

Cập nhật: **2026-10-09**.
Kế hoạch: [PHASE_2_3_MY_CLASSES_SCHEDULE.md](../implement_phase/PHASE_2_3_MY_CLASSES_SCHEDULE.md).
Contract FE: [PHASE_2_3_FE_CONTRACT.md](../PHASE_2_3_FE_CONTRACT.md).

## Hiện trạng

**Đã implement code + test ở local; chưa chạy được suite PostgreSQL/HTTP, chưa deploy.**

| Loại bằng chứng | Trạng thái |
|---|---|
| Plan/contract | Chốt contract 2.3.1, viết FE contract. |
| Local checks | `pnpm check` pass: lint, type-check, 60 unit test, build. 3 suite DB **skip** (không có `TEST_DATABASE_URL`). |
| PostgreSQL integration | Đã viết `test/integration/phase23-my-classes-schedule.spec.ts` (6 ca), **chưa chạy**. |
| Built-app HTTP | Đã thêm ca Phase 2.3 vào `test/http/phase22-payments.spec.ts`, **chưa chạy** `pnpm test:http`. |
| VPS/staging | Chưa deploy, chưa smoke. |
| Payment thật | Không liên quan; PayOS live vẫn là nghiệm thu Phase 2.2 riêng. |

Critical suite đang skip **không** được tính pass. Cần chạy với DB `_test` riêng trước
nghiệm thu (xem mục “Việc còn lại”).

## Quyết định 2.3.1 (diễn giải Flow.txt)

Flow.txt: Student đăng ký → thanh toán toàn bộ → xem lịch (“Fap calendar”); CASH pending
chỉ xem tiêu đề unit/session + thời khóa biểu, mentor confirm mới xem toàn bộ. Triển khai:

- Nguồn danh sách là **enrollment** của principal, không phải Order PAID. Một dòng = một
  enrollment; mua lại sinh dòng mới.
- Access matrix đúng plan §3.1, giữ entitlement hiện có: FULL = ACTIVE; CASH_PREVIEW =
  hold PENDING_PAYMENT của own order CASH `PENDING` và `expires_at > now`; còn lại NONE.
  Class CANCELLED chặn mọi quyền. COMPLETED và pending PAYOS **không** được mở quyền.
- Hold quá hạn bị chặn ngay khi đọc (`expires_at <= asOf`), không chờ job expiry; GET
  không ghi DB, không gọi PayOS.
- Hold PENDING_PAYMENT của order EXPIRED/CANCELLED → `HOLD_EXPIRED`; hold với order PAID
  hoặc chuỗi `enrollment → order_detail → order` lệch student/class → `STATE_MISMATCH`
  (fail closed, nằm ở history).
- `view=current` gồm ACTIVE/COMPLETED + hold còn hạn của order PENDING (kể cả Class
  CANCELLED, accessMode NONE); `history` là phần còn lại; `all` cả hai.
- Lịch: chỉ FULL/CASH_PREVIEW, Class không CANCELLED, range `[from, to)` ≤ 31 ngày có
  timezone, `includeCancelled` mặc định true; không meeting URL.
- Lịch FULL yêu cầu chuỗi order nhất quán (fail closed); detail endpoint cũ chỉ kiểm tra
  enrollment ACTIVE. Hai rule chỉ khác nhau với dữ liệu hỏng.
- Hoãn: chat/DM CASH pending (phase chat), quyền học lại sau COMPLETED, workflow nghỉ/dạy
  bù, materials/attendance/progress (Phase 3/4).

## Các bước

| Bước | Trạng thái | Evidence/đầu ra |
|---|---|---|
| Planning | Hoàn tất | Plan + progress riêng. |
| 2.3.1 Contract/policy | Hoàn tất (local) | Quyết định trên + `docs/PHASE_2_3_FE_CONTRACT.md`. |
| 2.3.2 My Classes | Code + unit test; DB test chưa chạy | `GET /me/classes` trong `StudentLearningModule`. |
| 2.3.3 Detail continuity | Code; DB/HTTP test chưa chạy | Field additive cho detail/preview. |
| 2.3.4 Personal Schedule | Code + unit test; DB/HTTP test chưa chạy | `GET /me/schedule`. |
| 2.3.5 Quality gate/rollout | Một phần | `pnpm check` pass; còn DB/HTTP, query plan, staging smoke. |

## Đã triển khai

- `src/modules/student-learning/`: module mới, import trong `AppModule`; không sở hữu
  entity, không ghi DB, không module nào import ngược.
  - `domain/learning-access.ts`: evaluator access/view dùng chung (unit test 10 ca).
  - `domain/schedule-range.ts` + `dtos/my-schedule-query.dto.ts`: validate timezone,
    range, phân trang, `includeCancelled` (unit test).
  - `services/my-classes.service.ts`: một read projection SQL (enrollment → class →
    course → mentor → order detail → own order → payment 1-1), filter/view trước
    count/page, `REPEATABLE READ` read-only snapshot, cùng `asOf`.
  - `services/my-schedule.service.ts`: session giao range, join entitlement, lọc ở DB.
- Classes: `StudentClassDto` thêm `classStatus`, `enrollmentId`, `enrollmentStatus`,
  `enrolledAt`, `accessMode`; `EnrollmentsService.findActive` thay `hasActiveAccess`.
- Payments/Commerce: preview trả `StudentClassPreviewDto` (kế thừa `ClassDetailDto`) có
  `classStatus`, `enrollmentId`, `orderId`, `orderCode`, `expiresAt`, `accessMode`;
  `pendingCashDetail` trả thêm order id/code/deadline; `findPendingHold` thay
  `hasPendingHold`.
- `Cache-Control: private, no-store` cho `/me/classes`, `/me/classes/:id`, `/preview`,
  `/me/schedule`.
- Postman folder `05 — Phase 2.3 My Classes + schedule`.
- **Không migration**: dùng index sẵn có (`uq_enrollments_student_class_effective`,
  `idx_enrollments_class_status`, `order_detail_id` unique, `payment_transactions.order_id`
  unique, `idx_class_sessions_time_range`). Chưa có bằng chứng query plan để thêm index.

## Việc còn lại trước nghiệm thu

1. Tạo DB test riêng rồi chạy:
   `TEST_DATABASE_URL=postgresql://mindy:mindy@127.0.0.1:5433/mindy_center_test pnpm test`
   và `pnpm test:http` (suite tạo thêm `*_learning_test`, `*_http_test`).
2. Review query plan (`EXPLAIN ANALYZE`) trên fixture đủ lớn; chỉ thêm index additive nếu
   có bằng chứng (ứng viên: `enrollments(student_id, created_at, id)`).
3. Deploy qua pipeline hiện có; smoke staging/VPS bằng tài khoản test: list, detail/preview,
   lịch, 401/403/422, expiry, refresh sau settlement; kiểm tra Cloudflare không cache
   `/api/v1/me/*`.

## Kiểm chứng lượt implement

- `pnpm check` (lint + type-check + test + build) pass ngày 2026-10-09; DB/HTTP skip.
- Render SQL offline (không kết nối DB) để kiểm tra mapping cột, NULL-safe history
  predicate, tham số bind và LIMIT/OFFSET; phát hiện và sửa lỗi `::text` không được
  TypeORM đổi tên cột.
- Chuẩn hóa line ending CRLF → LF cho file working tree lệch `.gitattributes`
  (index vốn LF, không đổi nội dung git) để `pnpm lint` pass.
