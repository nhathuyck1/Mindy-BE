# Phase 2 — Tiến độ: Course → Class → Cart → Checkout

Cập nhật: 2026-10-05. Kế hoạch gốc: `docs/implement_phase/PHASE_2_COURSE_TO_PAYMENT.md`.

## Cập nhật Phase 2.1 / Phase 2.2

- Webhook receiver độc lập đã test trên server; SDK confirm và callback mẫu 200
  verified pass ngày 2026-10-05. Evidence/giới hạn A1 trong
  [Phase 2.1](../implement_phase/PHASE_2_1_WEBHOOK_VPS_PAYOS.md).
- Đã có thiết kế payOS BE ở plan cũ; đã tách thành
  [Phase 2.2](../implement_phase/PHASE_2_2_PAYOS_BE_REAL_PAYMENT.md), đối chiếu toàn bộ
  `document/Flow.txt`: full payment, class onl/off, email online, mentor confirm
  cash và preview pending. Chat/DM pending vẫn ở phase chat.
  Tiến độ riêng: [Phase 2.2 progress](./PHASE_2_2_PROGRESS.md).
- Phase 2.2 đã implement/test local: SDK/module/migration, link/retry, verified
  settlement/activation/progress, full access, mail outbox và ADMIN reconciliation.
  `pnpm check` pass 91 tests, HTTP E2E pass 3 tests; Docker runtime migration/health
  pass trên DB test riêng. VPS route/live giao dịch chờ user tự deploy theo runbook.
  Phần baseline checkout bên dưới là lịch sử Phase 2 ban đầu.

### Kết quả đã thực hiện — webhook VPS (2026-10-05)

1. **Chuẩn bị tooling:** receiver độc lập tại `tools/webhook-probe`, SDK
   `@payos/node` 2.0.5, Dockerfile/Compose/runbook riêng; không kết nối DB hoặc
   thay đổi order/enrollment. Local type-check/lint, 6/6 HTTP tests, frozen install
   và Docker build pass. Đây là kiểm tra tooling, không phải payment BE.
2. **Deploy trên VPS:** user lấy tooling về
   `/home/mindycode/mindycoding/Mindy-BE/tools/webhook-probe`, cấu hình `.env.probe`
   với credentials PayOS và chạy hai file Compose. Container
   `mindy-webhook-probe-probe-1` healthy, bind host `127.0.0.1:3100`, dùng chung
   mạng `mindy-be_backend` với `cloudflare-mindy`; alias `mindy-payos-probe:3100`
   trả HTTP 200/ready.
3. **Public routing:** tunnel `flowzy-quanh123` có route hostname
   `api.quanh123.id.vn`, path regex `^/api/v1/payment-callbacks/payos$`, service
   `http://mindy-payos-probe:3100`, đứng trước route BE tổng quát. URL thực:
   `https://api.quanh123.id.vn/api/v1/payment-callbacks/payos`. Frontend và các
   route API khác tiếp tục dùng service cũ; không sửa Nginx `parking-api`.
4. **Kiểm thử receiver:** POST `{}` từ máy ngoài VPS trả 400 `invalid_webhook`.
   Signed fixtures gửi qua public HTTPS từ VPS: valid/duplicate 200 verified;
   tampered/missing signature 400; invalid JSON 400; body quá lớn 413. Receiver
   vẫn ready sau các ca lỗi. Sau restart probe: healthy, public callback vẫn nhận
   request và BE readiness vẫn ok. Năm concurrent signed requests đều 200 verified,
   có requestId riêng; latency end-to-end 517–2351 ms.
5. **PayOS confirm thực:** user chạy SDK `webhooks.confirm()` trong container
   trên VPS, nhận `CONFIRM_OK` lúc `2026-10-05T15:06:34.588Z` (22:06:34 giờ
   Asia/Bangkok). Receiver ghi callback mẫu lúc `15:06:34.302Z`, status 200,
   outcome verified, requestId `cb1f34be-0dd1-4750-b057-fb9c6947d6fb`, handler
   latency 0.53 ms. Đã chứng minh PayOS gọi được VPS và SDK xác minh chữ ký mẫu.

**Giới hạn nghiệm thu:** một concurrent request vượt mục tiêu 2 giây; chưa đối
chiếu latency của toàn bộ fixture với log receiver, chưa có signed fixture gửi từ
máy ngoài VPS hoặc test proxy reload riêng. Không đánh dấu toàn bộ Gate A1 pass.
PayOS confirm mẫu đã pass (bước 3); không có giao dịch tiền thật, order PAID,
activation/progress/email hoặc settlement BE được kiểm thử. Callback hiện vẫn
trỏ tới probe. Dừng chờ user review; bước tích hợp payment tiếp theo chưa bắt đầu.

Evidence chi tiết và lịch sử từng checkpoint nằm trong
[Phase 2.1](../implement_phase/PHASE_2_1_WEBHOOK_VPS_PAYOS.md).

## 1. Phạm vi

Baseline Phase 2 ban đầu được triển khai **tới hết bước checkout**. Phase 2.2 hiện
đã thêm payment runtime và verified settlement, nhưng chưa nghiệm thu giao dịch thật
trên VPS. Sau checkout, student có order `PENDING` và hold cho đến khi settle.

| Hạng mục | Trạng thái |
|---|---|
| Catalog: category, course, course unit | Xong |
| Class management: class, class unit, session, lifecycle | Xong |
| Public browse course/class | Xong |
| Cart | Xong |
| Checkout, giữ chỗ, hết hạn order | Xong |
| Webhook probe trên VPS, PayOS confirm mẫu | Functional test/confirm pass; giới hạn A1 ghi riêng |
| Payment BE: PayOS link/settlement/access/mail/reconciliation | Implement/test local pass; deploy/live smoke chờ user |
| Cash confirmation và cash preview | Chưa implement; giữ yêu cầu mentor confirm trong Flow.txt |
| Preview giới hạn cho cash pending (`GET /me/classes/:classId/preview`) | Chưa làm |
| `class_unit_progress`, kích hoạt enrollment `ACTIVE` | Implement/test trong Phase 2.2, còn chờ evidence live |

## 2. Cấu trúc

### 2.1 Module

```text
src/modules/
├── catalog/         course_categories, courses, course_units
├── classes/         classes, class_units, class_sessions
├── enrollments/     enrollments (giữ chỗ)
├── course-browse/   API public, không sở hữu bảng nào
└── commerce/        carts, cart_details, orders, order_details
```

Mỗi module chỉ để `*.module.ts` ở gốc, phần còn lại chia theo vai trò:

```text
<module>/
├── controllers/   HTTP: nhận DTO + principal, gọi service, trả DTO
├── services/      use case, transaction
├── entities/      TypeORM entity (mỗi entity đúng một module sở hữu)
├── enums/
├── dtos/          input DTO và response DTO tách riêng
├── exceptions/    lỗi domain kế thừa AppHttpException
├── domain/        rule thuần, không phụ thuộc Nest/DB (dễ unit test)
└── <module>.module.ts
```

### 2.2 Phụ thuộc giữa các module

Module chỉ giao tiếp qua provider được export, không có vòng phụ thuộc:

```text
commerce ──► classes ──► catalog
   │            │
   │            └──────► enrollments
   └───────────────────► enrollments
course-browse ──► classes, catalog
```

| Module | Provider export | Dùng để |
|---|---|---|
| `catalog` | `CoursesService` | đọc course/unit, giá, template khi tạo class |
| `enrollments` | `EnrollmentsService` | đếm chỗ, kiểm tra đã đăng ký, giữ/nhả chỗ |
| `classes` | `ClassReadService`, `ClassOffersService` | view class; thông tin bán, khóa class, kiểm tra mua được |
| `auth` | guard, `AuthService` | xác thực cookie và role |

### 2.3 Service trong `classes`

| Service | Trách nhiệm |
|---|---|
| `ClassesService` | lệnh quản trị: tạo, sửa, thêm session, open/start/complete/cancel |
| `ClassScheduleService` | rule lịch: session hợp lệ, trùng giờ trong class, trùng lịch mentor |
| `ClassReadService` | đọc: danh sách quản trị, class đang mở, chi tiết class |
| `ClassOffersService` | API cho luồng mua: offer, khóa class theo ID, kiểm tra mở/đầy/trùng |

### 2.4 Service trong `commerce`

| Service | Trách nhiệm |
|---|---|
| `CartService` | xem, thêm, xóa item trong cart |
| `CheckoutService` | transaction checkout |
| `OrdersService` | danh sách và chi tiết order của student |
| `OrderExpiryService` | hết hạn order, nhả chỗ |
| `OrderExpiryWorker` | job nền gọi `OrderExpiryService` theo chu kỳ |

### 2.5 Migration

| File | Nội dung |
|---|---|
| `1790900000000-course-catalog` | `course_categories`, `courses`, `course_units` |
| `1790900000001-class-operations` | `classes`, `class_units`, `class_sessions` và các enum |
| `1790900000002-commerce-orders` | `carts`, `cart_details`, `orders`, `order_details` |
| `1790900000003-enrollment-seat-holds` | `enrollments` + partial unique `(student_id, class_id)` |
| `1790900000004-remove-manager-role` | bỏ `MANAGER` khỏi `user_role_enum` |
| `1791072000000-add-course-img-url` | thêm `courses.img_url` nullable, tối đa 2048 ký tự |

Khác kế hoạch gốc: bảng `enrollments` được tạo sớm (migration thứ tư) vì checkout giữ
chỗ bằng enrollment `PENDING_PAYMENT`. Migration `payments-enrollment` sau này chỉ còn
các bảng payment và `class_unit_progress`.

## 3. Flow

### 3.1 Admin tạo course và class

```text
Tạo category ──► tạo course (inactive) ──► thêm / sắp xếp unit ──► activate course
      ──► tạo class DRAFT (copy unit của course) ──► thêm session ──► open
```

- Course luôn được tạo inactive; chỉ activate khi category còn active và có ít nhất 1 unit.
- Sắp xếp lại unit của course không làm đổi class đã tạo (class unit có `position` riêng).
- Class tạo từ course active và mentor active; unit được copy trong cùng transaction.
- Open class yêu cầu: có ít nhất 1 session nằm trong khoảng ngày của class, course còn
  active, mentor còn active, và mentor không trùng lịch với class OPEN/IN_PROGRESS khác.
- Vòng đời: `DRAFT → OPEN → IN_PROGRESS → COMPLETED`, có thể `CANCELLED` từ trạng thái
  chưa kết thúc. Mỗi bước là một lệnh riêng, không có endpoint sửa status tùy ý.
- Class DRAFT sửa được mọi field. Từ OPEN chỉ sửa được tên, mentor, meeting URL.

### 3.2 Student duyệt và thêm vào cart

```text
Xem category / course ──► xem class đang mở (lọc ONLINE/OFFLINE, ngày bắt đầu)
      ──► thêm class vào cart
```

- Public chỉ thấy course active (category active) và class `OPEN` chưa quá ngày kết thúc.
- Response public không bao giờ chứa meeting URL.
- Thêm vào cart kiểm tra: class tồn tại và không phải DRAFT, đang mở, còn chỗ, student
  chưa giữ chỗ/đăng ký class đó, chưa có trong cart, cart chưa quá 20 class.
- `cart_details.price_snapshot` chỉ để hiển thị; cart trả kèm giá hiện tại.

### 3.3 Checkout

Body chỉ có `paymentType` (`PAYOS` hoặc `CASH`). Toàn bộ chạy trong một transaction:

```text
1. Khóa cart của student
2. Khóa các class theo ID tăng dần
3. Hết hạn các order quá hạn đang giữ chỗ ở những class này
4. Kiểm tra lại từng class: đang mở, chưa đăng ký, còn chỗ
5. Tạo order:  PAYOS → 1 order cho cả cart
               CASH  → 1 order cho mỗi mentor
6. Tạo order_details (snapshot tên course, tên class, giá hiện tại)
7. Tạo enrollment PENDING_PAYMENT cho mỗi class (giữ chỗ)
8. Xóa item trong cart
```

- Một item không hợp lệ thì rollback toàn bộ, không tạo order nào.
- Giá và tổng tiền lấy từ giá course hiện tại, không lấy từ client hay snapshot của cart.
- Thời gian giữ chỗ: PayOS 15 phút, cash 48 giờ (cấu hình được).
- Order cash lưu `cash_mentor_id` là mentor của các class tại thời điểm checkout.
- Checkout lại khi cart rỗng trả `CART_EMPTY`, không tạo order trùng.
- Checkout **chưa** tạo `payment_transactions`; bước payment sẽ bổ sung.

### 3.4 Hết hạn order

```text
Job nền (mặc định 60 giây) ──► order PENDING quá expires_at ──► EXPIRED
                           ──► enrollment PENDING_PAYMENT ──► CANCELLED (nhả chỗ)
```

- Không xóa order hay order detail. Chạy lại không đổi kết quả.
- Dùng `FOR UPDATE SKIP LOCKED` nên nhiều replica chạy job cùng lúc vẫn an toàn.
- Mỗi lần chạy xử lý hết backlog, nên sau downtime tự bắt kịp khi app khởi động lại.
- Enrollment `CANCELLED` không chặn checkout lại cùng class.

### 3.5 Chống bán quá chỗ

- Chỗ đã dùng = enrollment `PENDING_PAYMENT` + `ACTIVE`.
- Checkout khóa dòng class trước khi đếm, nên hai request tranh chỗ cuối chỉ một thành công.
- Class luôn được khóa theo thứ tự ID để tránh deadlock.
- Partial unique index trên `enrollments (student_id, class_id)` là lớp chặn cuối cùng.

## 4. API đã có

Prefix `/api/v1`. Role: public, `STUDENT`, `ADMIN`.

```text
Public
GET    /course-categories
GET    /courses
GET    /courses/:courseId
GET    /courses/:courseId/classes
GET    /classes/:classId

ADMIN
POST   /admin/course-categories
GET    /admin/courses                      (thêm ngoài kế hoạch)
GET    /admin/courses/:courseId            (thêm ngoài kế hoạch)
POST   /admin/courses
PATCH  /admin/courses/:courseId
POST   /admin/courses/:courseId/units
PUT    /admin/courses/:courseId/units/order
POST   /admin/courses/:courseId/activate
GET    /admin/classes                      (thêm ngoài kế hoạch)
GET    /admin/classes/:classId             (thêm ngoài kế hoạch)
POST   /admin/classes
PATCH  /admin/classes/:classId
POST   /admin/classes/:classId/sessions
POST   /admin/classes/:classId/open
POST   /admin/classes/:classId/start
POST   /admin/classes/:classId/complete
POST   /admin/classes/:classId/cancel

STUDENT
GET    /me/cart
POST   /me/cart/items
DELETE /me/cart/items/:classId
POST   /me/cart/checkout
GET    /me/orders
GET    /me/orders/:orderId
```

Mã lỗi theo kế hoạch: `401` chưa đăng nhập, `403` sai role hoặc không sở hữu order,
`404` không tồn tại hoặc không public, `409` xung đột trạng thái (class không mở, hết
chỗ, đã giữ chỗ, cart rỗng, chuyển trạng thái sai), `422` dữ liệu không hợp lệ hoặc
client gửi field không cho phép (giá, tổng tiền, `studentId`, status).

## 5. Cấu hình mới

### Course image (bổ sung 2026-10-04)

`POST /api/v1/admin/courses` và `PATCH /api/v1/admin/courses/:courseId` nhận
`imgUrl` tùy chọn, URL tuyệt đối HTTP/HTTPS tối đa 2048 ký tự, không chứa credential.
POST bỏ qua field lưu `null`; PATCH bỏ qua field giữ ảnh hiện tại, gửi `null` xóa ảnh.
Course list/detail của public và admin đều trả `imgUrl: string | null`.

```json
{
  "imgUrl": "https://cdn.example.com/courses/web101.jpg"
}
```

Đây là URL ảnh, chưa có upload ảnh trong scope này. Khi deploy, chạy migration mới
trước khi khởi động code mới; Compose production đã có migration job cho bước đó.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `APP_TIME_ZONE` | `Asia/Ho_Chi_Minh` | múi giờ của trung tâm, dùng cho ngày của class |
| `ORDER_PAYOS_HOLD_TTL_SECONDS` | `900` | thời gian giữ chỗ cho order PayOS |
| `ORDER_CASH_HOLD_TTL_SECONDS` | `172800` | thời gian giữ chỗ cho order cash |
| `ORDER_EXPIRY_JOB_ENABLED` | `true` | bật job hết hạn order |
| `ORDER_EXPIRY_JOB_INTERVAL_SECONDS` | `60` | chu kỳ job |
| `SEED_ACCOUNT_PASSWORD` | — | mật khẩu các tài khoản của `pnpm seed:account` |

## 6. Seed dữ liệu dev

Lệnh tổng hợp (admin + accounts + course/class + ảnh):

```bash
pnpm migration:run  # sau khi drop/recreate DB, tạo schema trước
pnpm seed:data
```

Đặt `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_DISPLAY_NAME` và
`SEED_ACCOUNT_PASSWORD` trong `.env`. Lệnh tổng hợp dừng khi một seed lỗi.
Seed tạo 1 admin, 2 mentor, 3 student, 3 category, 6 course/27 unit,
7 class/47 session; cả 6 course (kể cả TypeScript inactive) có link ảnh Unsplash
cố định đã kiểm tra HTTP 200/JPEG ngày 2026-10-04. Chạy lại không tạo bản ghi trùng;
account seed đặt lại password demo theo env, admin hiện có được giữ nguyên.

`pnpm seed:course-images` chỉ bổ sung ảnh cho các course demo có `img_url` null,
không ghi đè ảnh đã chỉnh riêng và không cần seed lại accounts/class.

Chạy theo thứ tự, cả hai chạy lại được nhiều lần:

```bash
pnpm seed:account        # 2 mentor, 3 student; chạy lại sẽ đặt lại mật khẩu theo .env
pnpm seed:course-class   # 3 category, 6 course, 7 class có thời khóa biểu
```

- File: `src/database/seed/account.ts`, `src/database/seed/course-class.ts`.
- Course: HTML & CSS, JavaScript, ReactJS, Node.js & Express, Python; TypeScript để inactive.
- Class: 6 class `OPEN` (ONLINE và OFFLINE), `NODE-201-OFF1` để `DRAFT`, `JS-101-OFF1`
  chỉ có 2 chỗ để thử trường hợp hết chỗ.
- Admin vẫn tạo bằng `pnpm seed:admin`.

## 7. Kiểm thử

Sau bổ sung `imgUrl` ngày 2026-10-04: full `pnpm check` pass, 67/67 tests
(31 unit + 36 integration), gồm validation URL, lưu/đọc DTO public/admin,
PATCH giữ/xóa ảnh và migration up/down/up. Test dùng PostgreSQL 17 container riêng.

Kiểm tra lại ngày 2026-10-04: `pnpm check` pass bằng Node 22.20.0/pnpm 12.6.0,
64/64 tests pass (29 unit + 35 integration, không skip), lint/type-check/build pass.
Integration dùng PostgreSQL 17 container mới, database `mindy_center_test` riêng;
không dùng DB development hoặc VPS. Đã sửa LF checkout và format DTO đăng ký;
không thay đổi business logic Phase 2.

| Loại | Vị trí | Số lượng |
|---|---|---|
| Unit | cạnh file nguồn, `*.spec.ts` | 29 (gồm test Phase 1 có sẵn) |
| Integration PostgreSQL | `test/integration/phase2-course-to-checkout.spec.ts` | 35 |
| Smoke HTTP | script chạy tay, chưa nằm trong repo | 42 + 81 check |

Integration test cần `TEST_DATABASE_URL` trỏ tới DB tên kết thúc bằng `_test`; không có
thì bị skip. Mỗi lần chạy nó xóa sạch và migrate lại DB đó.

```bash
TEST_DATABASE_URL=postgresql://mindy:mindy@localhost:5433/mindy_center_test pnpm test
```

Đã kiểm chứng: migration up/down/up; rollback khi một item lỗi; tính lại giá lúc
checkout; tách order cash theo mentor; tranh chỗ cuối không bán quá; không deadlock;
double-submit không tạo order trùng; hết hạn rồi checkout lại; job hết hạn chạy thật
trong app; trùng lịch mentor; phân quyền và mã lỗi qua HTTP; Swagger có đủ route Phase 2.

## 8. Thay đổi ngoài Phase 2

- `AuthModule` export thêm `AuthService` để guard dùng được ở module khác.
- `UsersService` thêm `findActiveByRole` và `findByIds`.
- Gỡ role `MANAGER`: `ADMIN` nắm toàn bộ quyền quản trị.
- CI (`.github/workflows/check.yml`) có thêm PostgreSQL để chạy integration test.

## 9. Việc còn lại

- 2026-10-04: Tạo file riêng `docs/implement_phase/PHASE_2_1_WEBHOOK_VPS_PAYOS.md`
  theo yêu cầu user, bốn bước và dừng review sau mỗi bước. Bước 1 đã chuẩn bị
  receiver SDK PayOS riêng ở `tools/webhook-probe`, Compose/Dockerfile và VPS runbook;
  tooling type-check/lint, 6/6 HTTP test key giả, frozen install và Docker build local pass.
  Tại mốc này chưa test VPS/confirm. Cập nhật 2026-10-05: đã deploy và chạy các ca
  receiver trên VPS, bước 3 confirm mẫu pass như mục kết quả phía trên; payment BE
  và giao dịch thật vẫn chưa thực hiện.

- 2026-10-04: Đã review nhánh `Feat/Webhooktest` và lập kế hoạch tiếp nối tại
  `docs/implement_phase/PHASE_2_WEBHOOK_VPS_PAYOS_PLAN.md`: receiver test VPS →
  PayOS confirm-webhook → tích hợp BE → deploy và giao dịch nhỏ. Đây là kế hoạch;
  chưa test VPS hoặc triển khai payment. Baseline mới: type-check/build và 29 test
  pass, 35 integration test skip; `pnpm check` vướng format CRLF, Node local chưa
  đúng phiên bản yêu cầu. Xem chi tiết và điều kiện nghiệm thu trong plan.
- Payment: `PaymentsModule`, `payment_transactions`, PayOS link/webhook, mentor xác nhận
  cash, kích hoạt enrollment, `class_unit_progress`, email xác nhận, đối soát.
- Preview giới hạn cho cash pending.
- E2E tự động qua HTTP trong `pnpm test` (cần quyết định thêm plugin SWC cho Vitest).
- Cập nhật Postman collection.
- Hủy class chưa tự nhả các chỗ đang giữ; hiện chỉ nhả khi order hết hạn.
