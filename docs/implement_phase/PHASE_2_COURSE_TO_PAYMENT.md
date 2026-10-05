# Phase 2 — Course registration, checkout, payment và enrollment

> Cập nhật 2026-10-05: code BE đã tới checkout/hold/expiry; webhook probe trên VPS
> và PayOS confirm mẫu đã pass. Payment runtime Phase 2.2 đã implement/test local;
> deploy và giao dịch thật chờ user thực hiện theo runbook;
> kế hoạch thực thi hiện hành là [Phase 2.2](./PHASE_2_2_PAYOS_BE_REAL_PAYMENT.md),
> kế thừa mục B–D của plan tiếp nối. PayOS được ưu tiên trước cash confirmation.
> Đã đối chiếu toàn bộ `document/Flow.txt`; giữ full payment, email online,
> preview cash pending và mentor confirmation. Chat/DM cash pending ở phase chat.

## 1. Mục tiêu

Hoàn thành một vertical slice cho student:

```text
Browse course -> chọn class ONLINE/OFFLINE -> add to cart -> checkout
  -> thanh toán đủ bằng PayOS hoặc tiền mặt -> được quyền học trong class
```

Admin tạo category, course, course unit, class và lịch học. Student chỉ mua
class đang `OPEN`, không mua trực tiếp course template. Một cart có thể chứa nhiều
class. Giá và tổng tiền do server tính bằng số nguyên VND, không nhận giá từ client.

Với tiền mặt, checkout tự tạo quyền tham gia `PENDING_PAYMENT` để giữ chỗ; student
chỉ xem tên class unit, tên class session và thời khóa biểu. Mentor được gán cho
class xác nhận đã thu đủ tiền thì quyền học chuyển `ACTIVE`. Với PayOS, chỉ webhook
đã xác thực và xử lý thành công mới mở quyền học. Email xác nhận giao dịch online
được gửi sau khi database commit.

Phase này gộp phần catalog, class, cart/order, payment và enrollment vốn được tách
thành các milestone 2, 3, 5, 6 trong `CORE_FLOW_IMPLEMENTATION_PLAN.md`. Tài liệu
này là phạm vi Phase 2 được ưu tiên khi triển khai. File/material, attendance, chat,
whiteboard, assignment và compiler vẫn ở phase sau.

## 2. Điều kiện bắt đầu

- Phase 0 migration workflow và PostgreSQL test database dùng được.
- Phase 1 cung cấp authenticated principal (`userId`, `role`), guard và active
  `STUDENT`; admin/mentor test accounts có thể được provision an toàn.
- API prefix `/api/v1`, error response, validation pipe và Swagger đã hoạt động.
- Có SMTP adapter hoặc local mail sink để test email; live PayOS credentials không
  phải điều kiện để bắt đầu viết code và test bằng fake provider.
- Phase 1 hiện chưa đạt toàn bộ exit criteria trong `docs/progress/Progress.md`; các hạng mục
  auth/security còn thiếu phải được hoàn tất trước khi nghiệm thu Phase 2.

## 3. Quyết định nghiệp vụ và tài liệu nguồn

Nguồn: `document/Flow.txt`, `document/mindy_center_full.dbml`,
`document/mindy_mvp_db_design_review.md`, `docs/CORE_BUSINESS_LOGIC.md` và
`docs/CORE_FLOW_IMPLEMENTATION_PLAN.md`.

1. `classes.delivery_mode` là `ONLINE` hoặc `OFFLINE`. Student chọn một class có
   mode phù hợp, không đổi mode trên cart/order. Cash và PayOS đều dùng được cho
   hai mode; cash pending không nhận meeting URL của class online.
2. Course là template có giá dùng chung cho các class. Class là đơn vị được bán và
   có mentor, lịch, sức chứa. Giá được chốt tại checkout trong `order_details`.
3. Một cart có nhiều class. PayOS tạo một order cho toàn cart. Với cash, checkout
   chia class theo mentor thành một order cho mỗi mentor; các order được tạo trong
   cùng một database transaction. Mỗi order phải được thanh toán đủ, không trả góp.
4. Cash order chỉ có thể được xác nhận bởi mentor được gán cho tất cả class trong
   order tại thời điểm checkout. Lưu mentor đó trên order để quyền xác nhận ổn định.
   Nếu mentor thay đổi trước khi thu tiền, hủy/để hết hạn order và checkout lại;
   không tự chuyển quyền xác nhận của order cũ.
5. Checkout giữ chỗ 15 phút cho PayOS và 48 giờ cho cash; hai TTL cấu hình được.
   `PENDING_PAYMENT` chiếm sức chứa. Hết hạn thì order `EXPIRED`, enrollment pending
   `CANCELLED`, chỗ được giải phóng. Không xóa order hoặc lịch sử thanh toán.
6. Cash pending có limited preview. PayOS pending không có quyền xem nội dung
   lớp. Cả hai chỉ có full content khi enrollment `ACTIVE`.
7. PayOS thanh toán sau khi order hết hạn được ghi nhận để đối soát; không tự mở
   quyền học. Xử lý hoàn tiền hoặc cấp chỗ sau đối soát là quy trình vận hành riêng.
8. Bản DBML hiện dùng unique `(student_id, class_id)` cho mọi enrollment; cần đổi
   thành uniqueness chỉ cho enrollment còn hiệu lực để student có thể checkout lại
   sau khi pending enrollment đã `CANCELLED` vì hết hạn.
9. Migration đã chạy là schema thực thi. Không sửa migration Phase 1, không bật
   TypeORM `synchronize` và không thêm Prisma.

## 4. Domain ownership

```text
CatalogModule
  owns: course_categories, courses, course_units

ClassesModule
  owns: classes, class_units, class_sessions

EnrollmentsModule
  owns: enrollments, class_unit_progress

CommerceModule
  owns: carts, cart_details, orders, order_details

PaymentsModule
  owns: payment_transactions, payos_payment_details,
        payment_webhook_events, payment_confirmation_emails
```

Controller chỉ nhận DTO/principal và gọi application service. Checkout và
payment-to-enrollment là workflow xuyên module: một application service điều phối
transaction qua repository/provider đã export, không import private repository của
module khác hoặc tạo vòng phụ thuộc. HTTP cookie/JWT không đi vào domain service.

## 5. Planning phase — contract trước khi tạo migration

### 5.1 Catalog và class

- Category có `name`, unique `slug`, optional `description`, `is_active`.
- Course có unique `code`, `title`, optional `description`, `price_amount >= 0`,
  category và `is_active`. Tạo course ở trạng thái inactive dù DBML có default true;
  chỉ activate khi category còn active, field public hợp lệ và có ít nhất một unit.
- Course unit có unique `(course_id, unit_number)`, title, description và
  `required_score_percent` trong `0..100`. Reorder không làm thay đổi class unit
  của các class đã tạo.
- Tạo class từ active course và active mentor; copy course units thành class units
  trong cùng transaction. `start_date <= end_date`, `max_students > 0`, code unique.
  Class ban đầu `DRAFT`; chỉ `OPEN` khi có class unit và ít nhất một session hợp lệ.
- Session phải có `starts_at < ends_at`, thuộc khoảng ngày của class và có unique
  `(class_unit_id, session_number)`. Trước khi mở class, kiểm tra xung đột lịch của
  mentor; chính sách phòng học phức tạp nằm ngoài Phase 2.
- Public list trả active course và class `OPEN` chưa quá hạn; filter theo category,
  delivery mode và thời gian, phân trang/sort ổn định. Course detail có unit summary
  và danh sách class mở, không lộ meeting URL bí mật.
- Trạng thái class đi theo `DRAFT -> OPEN -> IN_PROGRESS -> COMPLETED`, có thể
  `CANCELLED` từ trạng thái hợp lệ. Chỉ `OPEN` được checkout; thay đổi status dùng
  command riêng, không patch tùy ý.

### 5.2 Cart, order và reservation

- Một cart cho mỗi student; một class chỉ có một cart detail trong cart đó.
- Add to cart kiểm tra class `OPEN`, còn chỗ và student chưa có enrollment còn hiệu
  lực. `cart_details.price_snapshot` chỉ để hiển thị, không cam kết giá.
- Trong một transaction, lock cart và các class theo ID tăng dần, revalidate toàn
  bộ items, giá, enrollment và sức chứa; tạo order/detail, pending enrollment và
  xóa cart details; không tạo payment attempt ở checkout. Phase 2.2 reserve attempt
  PAYOS khi gọi API tạo link bằng transaction riêng. Một item
  lỗi làm rollback toàn bộ checkout.
- Sau commit, cart đã rỗng và các order ở trạng thái `PENDING`. Checkout lại không
  tạo order trùng cho class đang có pending enrollment; client lấy các order chờ
  thanh toán qua `GET /me/orders`. Không cần bảng `checkout_requests` riêng.
- Sức chứa đếm `PENDING_PAYMENT` chưa hết hạn và `ACTIVE`. Expiry job chạy lặp lại
  an toàn; checkout cũng giải phóng hold quá hạn dưới lock trước khi đếm. Không giữ
  DB lock khi gọi PayOS hoặc SMTP.
- `order_details` là immutable snapshot của class/course name và price. Quantity
  luôn là 1 cho một class. `orders.total_amount` là tổng server-side; không cho
  client gửi total/discount trong Phase 2.

### 5.3 Payment, access và email

- `orders.payment_type` chỉ nhận `PAYOS` hoặc `CASH` trong Phase 2. Một order có
  một method; không đổi method sau checkout.
- Mentor xác nhận cash bằng endpoint authenticated với `receivedAmount` bằng đúng
  order total và optional `referenceCode`/ghi chú; chỉ với order `PENDING`, chưa
  hết hạn và thuộc mentor snapshot. Lưu `confirmed_by`,
  `confirmed_at`, payment reference/ghi chú; retry cùng confirmation trả kết quả
  đã có, không tạo thêm enrollment/progress.
- PayOS payment link được tạo sau checkout. Adapter dùng order total, provider code
  dạng số riêng và expiry bằng order deadline. Tạo/retry link cho cùng order không
  tạo active attempt trùng. Mọi callback phải verify signature trước DB mutation,
  đối chiếu code, amount và trạng thái, rồi lock order/payment.
- Callback hợp lệ và đúng hạn đánh dấu payment/order `SUCCEEDED`/`PAID`, chuyển
  enrollment sang `ACTIVE`, tạo một progress row cho mỗi class unit trong một
  transaction. Webhook duplicate trả 2xx nhưng không lặp side effects. Callback
  thất bại chỉ cập nhật attempt; order còn `PENDING` tới hạn expiry.
- Callback đã thanh toán nhưng order hết hạn ghi event và cờ `REQUIRES_REVIEW`
  cho staff, không đổi order sang `PAID` và không mở access. Staff có thể xem queue
  đối soát; xử lý tiền/chỗ ngoài luồng tự động của Phase 2.
- Payment success online tạo một email job sau commit bằng outbox có unique key
  `(order_id, event_type)`; worker retry theo backoff, không giữ transaction khi
  gửi SMTP. Email chỉ chứa order code, số tiền, danh sách class và trạng thái.
- Cash pending chỉ được đọc title/timetable qua DTO riêng. `meeting_url`, material,
  nội dung unit/session, assignment và lớp online không được trả trong preview.

### 5.4 API contract

```text
GET    /api/v1/course-categories
GET    /api/v1/courses
GET    /api/v1/courses/:courseId
GET    /api/v1/courses/:courseId/classes
GET    /api/v1/classes/:classId

POST   /api/v1/admin/course-categories
POST   /api/v1/admin/courses
PATCH  /api/v1/admin/courses/:courseId
POST   /api/v1/admin/courses/:courseId/units
PUT    /api/v1/admin/courses/:courseId/units/order
POST   /api/v1/admin/courses/:courseId/activate
POST   /api/v1/admin/classes
PATCH  /api/v1/admin/classes/:classId
POST   /api/v1/admin/classes/:classId/sessions
POST   /api/v1/admin/classes/:classId/open
POST   /api/v1/admin/classes/:classId/start
POST   /api/v1/admin/classes/:classId/complete
POST   /api/v1/admin/classes/:classId/cancel

GET    /api/v1/me/cart
POST   /api/v1/me/cart/items
DELETE /api/v1/me/cart/items/:classId
POST   /api/v1/me/cart/checkout
GET    /api/v1/me/orders
GET    /api/v1/me/orders/:orderId
GET    /api/v1/me/classes/:classId/preview

POST   /api/v1/me/orders/:orderId/payments/payos
POST   /api/v1/payment-callbacks/payos
GET    /api/v1/mentor/cash-orders
POST   /api/v1/mentor/cash-orders/:orderId/confirm
GET    /api/v1/admin/payments/reconciliation
```

Checkout body chỉ có `paymentType`. Response là
`orders[]` kể cả khi chỉ có một PayOS order, mỗi item có `id`, `orderCode`,
`paymentType`, `status`, `totalAmount`, `expiresAt` và immutable detail summaries.
Cash orders trả `mentorId` để client hiển thị hướng dẫn thanh toán. PayOS link
endpoint trả checkout URL/QR và expiry khi đã cấu hình provider; khi feature tắt
trả lỗi service unavailable rõ ràng, không ghi payment attempt rỗng.

Danh sách public và danh sách order đều phân trang; student không truyền
  `studentId`, `price`, `status`, `mentorId` hoặc `paidAt`. API riêng cho mentor dùng
snapshot mentor của cash order để lọc. Admin có quyền quản trị catalog/class
và xem đối soát, không tự xác nhận cash thay mentor trong Phase 2.

### 5.5 Error và security contract

```text
401  chưa đăng nhập / session không hợp lệ
403  sai role hoặc không sở hữu cart/order/class preview
404  resource không tồn tại hoặc không public
409  class không OPEN, đã giữ chỗ/đã học, hết chỗ, order đã hết hạn
     hoặc state transition không hợp lệ
422  DTO không hợp lệ, giá trị ngoài range
503  PayOS chưa được cấu hình hoặc provider tạm unavailable
```

Callback public theo HTTP nhưng chỉ verified provider payload mới có quyền mutate.
Không log checksum key, raw credential, chữ ký, cookie hoặc toàn bộ webhook payload.
Cash confirmation cần request ID và audit record. Guard role không thay thế check
ownership hoặc mentor assignment trong application service.

## 6. Migration phase

Các migration nhỏ, review `up`/`down`, chạy trên DB rỗng và test DB riêng. Tên theo
thứ tự phụ thuộc, không sửa các migration Phase 1 đã chạy:

### 6.1 `course-catalog`

1. Tạo `course_categories`, `courses`, `course_units` cùng FK `RESTRICT`.
2. Unique `slug`, `code`, `(course_id, unit_number)`; check giá không âm,
   `unit_number > 0`, score `0..100`.
3. Index cho list active category/course và course units theo số thứ tự.
4. Entity columns và default khớp migration; application vẫn tạo course inactive.

### 6.2 `class-operations`

1. Tạo enum delivery/class/session/unit status và bảng `classes`, `class_units`,
   `class_sessions`; FK tới course, course unit và mentor.
2. Check ngày/giờ hợp lệ, capacity dương; unique class code, class-unit position,
   class-unit course link và session number; index cho public open-class query.
3. Chặn xóa cascade dữ liệu đã lên lịch hoặc đã có giao dịch. Reorder course unit
   không được rewrite class unit cũ.

### 6.3 `commerce-orders`

1. Tạo `carts`, `cart_details`, `orders`, `order_details`.
2. Thêm `orders.payment_type`, `cash_mentor_id`, `expires_at`.
   Cash order bắt buộc có mentor; PayOS order không có cash mentor.
3. Unique cart/student, cart/class, order code và order/class; check amount không
   âm, quantity = 1, expiry sau created time.
4. Dùng `ON DELETE RESTRICT` cho order và detail; cart detail có thể được xóa khi
   checkout hoặc remove item.

### 6.4 `payments-enrollment`

1. Tạo `payment_transactions`, `payos_payment_details`, `enrollments`,
   `class_unit_progress`, `payment_webhook_events` và
   `payment_confirmation_emails`.
2. `enrollments.order_detail_id` unique/FK giúp truy ra payment method và giữ chỗ.
   Partial unique `(student_id, class_id)` cho `PENDING_PAYMENT`, `ACTIVE`,
   `COMPLETED`; row `CANCELLED` lịch sử không chặn checkout mới.
3. Unique provider reference, PayOS numeric order code/link ID, webhook event key,
   `(enrollment_id, class_unit_id)` và email `(order_id, event_type)`; index expiry,
   pending payments, reconciliation và mail retry.
4. Cash transaction có nullable `confirmed_by` FK user và `confirmed_at`. PayOS
   `raw_payload`/`raw_response` chỉ giữ dữ liệu tối thiểu đã redact; không lưu key
   hoặc signature bí mật.
5. Review `down` theo thứ tự ngược FK/enum. Database có order thật không được
   tự động chạy destructive rollback; dùng forward migration để sửa schema.

> Ghi chú triển khai (2026-10-02): checkout cần seat hold nên bảng `enrollments` (kèm
> `order_detail_id` và partial unique) đã được tạo sớm trong migration
> `enrollment-seat-holds`, ngay sau `commerce-orders`. Migration `payments-enrollment` chỉ
> còn các bảng payment và `class_unit_progress`. Checkout hiện chưa tạo
> `payment_transactions`; bước payment sẽ bổ sung.

DBML thiết kế cần được cập nhật cùng migration để phản ánh order payment method,
enrollment-order link, partial uniqueness và mail/webhook tables. Đây là việc của
giai đoạn triển khai, chưa thay DBML khi review plan.

## 7. Implementation phase — luồng xử lý chi tiết

### 7.1 Catalog và class management

```text
Admin tạo category -> tạo inactive course -> thêm/reorder units
  -> activate course -> tạo class từ course -> copy units trong transaction
  -> gán mentor/mode/lịch -> OPEN -> hiện trong public list
```

Không mở class khi mentor không active, thiếu unit/session hoặc lịch không hợp lệ.
Public course detail chỉ đọc dữ liệu được phép công khai. Class đang học hoặc đã
hoàn tất vẫn có thể hiện ở trang quản trị, không xuất hiện như class purchasable.

### 7.2 Cart và checkout

```text
STUDENT add class -> cart display snapshot
  -> checkout(paymentType)
  -> lock cart/class -> revalidate all items -> split cash by mentor if needed
  -> create order(s) + details + pending enrollments
  -> clear cart -> commit (chưa tạo payment attempt)
  -> PAYOS link API reserve/reuse attempt -> provider call ngoài transaction
```

Class locks luôn theo thứ tự ID để giảm deadlock. Hai checkout tranh chỗ cuối cùng
chỉ một được commit. Nếu cart chứa cả class hợp lệ và không hợp lệ, không tạo order
nào. Gọi checkout lại khi cart đã rỗng không tạo order; student đọc order `PENDING`
để tiếp tục thanh toán. Nếu class được add lại khi vẫn có order pending, unique
enrollment và validation chặn purchase trùng.

### 7.3 Cash payment

Cash checkout tạo pending enrollment tự động và giới hạn response preview. Mentor
được gán xem cash orders của mình, xác nhận đã thu đủ tiền. Trong một transaction:

1. Lock order, payment và enrollments.
2. Kiểm tra mentor snapshot, amount, trạng thái và deadline.
3. Đánh dấu payment `SUCCEEDED`, order `PAID`, đặt `paid_at`/audit fields.
4. Chuyển mọi enrollment sang `ACTIVE`, đặt `enrolled_at`.
5. Tạo progress cho mỗi class unit, commit toàn bộ hoặc rollback toàn bộ.

Không tạo partial paid order. Cash order hết hạn không được mentor confirm; staff
xử lý ngoại lệ ngoài Phase 2 hoặc student checkout lại.

### 7.4 PayOS payment

PayOS adapter nhận config tên `PAYOS_ENABLED`, `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`,
`PAYOS_CHECKSUM_KEY`, frontend return/cancel URL và webhook URL. Config phải fail
fast khi bật mà thiếu giá trị; `.env.example` chỉ có placeholder, không chứa secret.
User đã cấu hình kênh và confirm webhook probe pass ngày 2026-10-05. Khi deploy
Phase 2.2 phải confirm lại handler BE; credential vẫn được cấu hình trực tiếp trên VPS.

Payment link được tạo ngoài DB transaction; response lưu provider identifiers và
expiry. Khi provider call lỗi, order vẫn `PENDING`, có thể retry idempotently. Webhook
verify signature theo PayOS trước khi lock và ghi DB. Sau đó xử lý như cash success
trong một transaction, trừ audit actor là provider. Return URL frontend chỉ hiển thị
trạng thái từ API; không dùng query params của redirect để tự đánh dấu đã thanh toán.

Nếu callback đến trễ, ghi payment/event cần đối soát, giữ order `EXPIRED` và
enrollment không active. Admin có danh sách đối soát; không thực hiện refund
tự động trong Phase 2.

### 7.5 Expiry, access và confirmation email

- Expiry job tìm order `PENDING` quá hạn, lock từng order, chuyển `EXPIRED`, hủy
  pending enrollments và release capacity. Chạy lại không đổi kết quả.
- Mọi full class-content query kiểm tra enrollment `ACTIVE`. Cash pending dùng
  preview DTO riêng; không dựa vào trạng thái cart/order ở controller.
- Successful PayOS transaction ghi mail outbox trong cùng DB transaction. Worker
  gửi sau commit, retry có giới hạn/backoff và đánh dấu sent; duplicate webhook
  không tạo thêm job. Mail outage không rollback payment hoặc enrollment.

## 8. Cấu trúc module đề xuất

```text
src/modules/catalog/   category/course/unit entities, DTOs, controller, service
src/modules/classes/   class/session/enrollment/progress entities, DTOs, service
src/modules/commerce/  cart/checkout/order entities, DTOs, controller, service
src/modules/payments/  payment entities, PayOS adapter, webhook/cash controllers,
                      confirmation email worker, service
src/database/migrations/  four reviewed Phase 2 migrations
```

Tách service/handler theo workflow thật, không thêm CQRS framework chỉ để tạo tên.
Các response DTO map field tường minh và không trả TypeORM entity/raw provider data.

## 9. Testing plan

### 9.1 Unit tests

- Course activation, class transition, delivery-mode filter và public DTO mapping.
- Checkout grouping theo mentor, price/total calculation, amount bounds và TTL.
- Cash preview vs active access policy, mentor authorization.
- PayOS signature/amount/state validation bằng fixture không có secret thật.
- Email content/unique event key và retry decision.

### 9.2 PostgreSQL integration tests

- Migration up/down/up trên database riêng; unique/check/FK/partial unique hoạt động.
- Tạo class copy đủ course units và rollback khi một unit lỗi.
- Checkout multi-class success; một item lỗi rollback cả cart/order/hold.
- Cart price cũ được thay bằng giá hiện hành ở checkout.
- Checkout lặp khi cart đã rỗng không tạo order mới; pending order vẫn đọc được.
- Hai request cùng mua chỗ cuối không oversell; hai student checkout các class theo
  thứ tự khác nhau không deadlock kéo dài.
- Cash split tạo đúng order per mentor trong một checkout; rollback đồng loạt.
- Expiry giải phóng hold và cho phép student checkout lại class đó.
- Cash confirmation duplicate, sai mentor, thiếu tiền, expired và rollback khi
  progress initialization lỗi.
- PayOS callback valid, invalid signature, wrong code/amount, duplicate, failed,
  expired và transaction rollback; email outbox xuất hiện đúng một lần.

### 9.3 E2E tests

- Public browse/filter category/course/class theo ONLINE/OFFLINE.
- Admin tạo course/class, mở class và student thấy class mua được.
- Student add/remove cart, checkout PayOS hoặc cash, xem own orders; student khác
  không đọc được cart/order/preview.
- Cash pending chỉ thấy title/timetable; mentor xác nhận thì thấy full class content.
- PayOS provider fake trả link, webhook hợp lệ mở class và queue confirmation email.
- Khi PayOS tắt/chưa config, endpoint link trả lỗi rõ và cash flow vẫn dùng được.
- Sai role trả `403`; body có field lạ hoặc giá client tự gửi trả `422`.

## 10. Swagger và operational contract

- Document request/response DTO, cookie auth, pagination,
  checkout trả `orders[]`, PayOS feature-disabled response và expected errors.
- Secret và raw webhook body không xuất hiện trong Swagger examples/logs.
- Có metric/log theo request ID cho checkout conflict, order expiry, callback
  duplicate/invalid, reconciliation pending và email retry; không log PII/secret.
- Chạy expiry và mail worker theo cơ chế một job owner hoặc claim-row an toàn khi
  nhiều replica chạy; có command chạy lại để phục hồi sau downtime.
- Test staging với PayOS fake trước; live PayOS smoke test được thực hiện sau khi
  user cấu hình merchant credentials/webhook, nên chưa là điều kiện nghiệm thu tài
  liệu kế hoạch này.

## 11. Thứ tự triển khai đề xuất

1. Review và chốt contract ở mục 3–5, cập nhật DBML thiết kế.
2. Tạo `course-catalog` migration/entity, admin và public catalog API.
3. Tạo `class-operations` migration/entity, class creation/schedule và public class API.
4. Tạo `commerce-orders` migration/entity, cart, checkout và seat hold/expiry.
5. Theo Phase 2.2, tạo migration mới cho payment/progress/events/outbox; không tạo
   lại enrollments đã có. Chốt public provider contracts và access policy.
6. Implement PayOS adapter/link/webhook trước; cash preview/mentor confirmation
   còn là increment riêng, không dùng làm prerequisite của PayOS.
7. Implement confirmation email outbox/worker, reconciliation list và Swagger.
8. Chạy integration/E2E/concurrency suite, `pnpm check`, staging smoke rồi cập
   nhật `docs/progress/Progress.md`. Deploy/confirm lại BE và live smoke theo Phase 2.2.

## 12. Phân công hai người

### Người A — Catalog, class và persistence

- Ownership của bốn migration Phase 2 và DBML update; người B review SQL.
- Catalog/class entities, admin/public APIs và scheduling rules.
- Enrollment/progress entity, access queries và PostgreSQL constraint tests.

### Người B — Commerce và payment workflow

- Cart/checkout, idempotency, reservation expiry và concurrency tests.
- Mentor cash confirmation, PayOS adapter/webhook, reconciliation và email outbox.
- Student/mentor payment APIs, Swagger và end-to-end flow tests.

Điểm đồng bộ: chốt checkout transaction API, enrollment-order link và payment
state contract trước khi code song song; một người duy nhất sửa mỗi migration.

## 13. Exit criteria

- [ ] Bốn migrations chạy từ DB rỗng, revert/rerun được trên test DB, constraints
      và FK delete behavior đã review.
- [ ] Admin tạo và mở được course/class; public browse được class theo mode.
- [ ] Student checkout multi-class, cash split theo mentor, giá/tổng tiền server-side
      và checkout lặp không tạo order trùng.
- [ ] Seat hold không oversell, hết hạn được release an toàn.
- [ ] Cash pending tự vào class với preview giới hạn; đúng mentor xác nhận đủ tiền
      thì enrollment/progress active và full access.
- [ ] PayOS adapter/link/webhook có test chữ ký, amount, idempotency và late payment;
      bật feature khi có config, tắt feature không ảnh hưởng cash.
- [ ] Email xác nhận PayOS được queue một lần sau commit và retry an toàn.
- [ ] Role/ownership, Swagger, unit/integration/E2E tests và `pnpm check` pass.
- [ ] Staging smoke test với provider fake pass; `docs/progress/Progress.md` cập nhật đúng
      trạng thái. Live PayOS smoke chờ user cấu hình merchant account/webhook.

## 14. Ngoài scope

- Tạo PayOS merchant account, điền credential thật, đăng ký live webhook và giao
  dịch tiền thật; user sẽ tự cấu hình phần này sau.
- Trả góp, coupon, tax invoice, refund tự động và tự cấp quyền cho late settlement.
- Bank transfer/manual payment ngoài cash confirmation của mentor.
- File/material upload, attendance, group chat/mentor DM, notification in-app,
  homework, board, compiler/judge và recommendation form.
