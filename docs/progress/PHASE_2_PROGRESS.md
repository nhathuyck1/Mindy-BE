# Phase 2 — Tiến độ: Course → Class → Cart → Checkout

Cập nhật: 2026-10-02. Kế hoạch gốc: `docs/implement_phase/PHASE_2_COURSE_TO_PAYMENT.md`.

## 1. Phạm vi

Phase 2 được triển khai **tới hết bước checkout**. Sau checkout, student có order
`PENDING` và chỗ đã được giữ; phần thanh toán chưa bắt đầu.

| Hạng mục | Trạng thái |
|---|---|
| Catalog: category, course, course unit | Xong |
| Class management: class, class unit, session, lifecycle | Xong |
| Public browse course/class | Xong |
| Cart | Xong |
| Checkout, giữ chỗ, hết hạn order | Xong |
| Payment: PayOS, webhook, xác nhận cash, email xác nhận, đối soát | Chưa làm (cố ý) |
| Preview giới hạn cho cash pending (`GET /me/classes/:classId/preview`) | Chưa làm |
| `class_unit_progress`, kích hoạt enrollment `ACTIVE` | Chưa làm (thuộc payment) |

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

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `APP_TIME_ZONE` | `Asia/Ho_Chi_Minh` | múi giờ của trung tâm, dùng cho ngày của class |
| `ORDER_PAYOS_HOLD_TTL_SECONDS` | `900` | thời gian giữ chỗ cho order PayOS |
| `ORDER_CASH_HOLD_TTL_SECONDS` | `172800` | thời gian giữ chỗ cho order cash |
| `ORDER_EXPIRY_JOB_ENABLED` | `true` | bật job hết hạn order |
| `ORDER_EXPIRY_JOB_INTERVAL_SECONDS` | `60` | chu kỳ job |
| `SEED_ACCOUNT_PASSWORD` | — | mật khẩu các tài khoản của `pnpm seed:account` |

## 6. Seed dữ liệu dev

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

- Payment: `PaymentsModule`, `payment_transactions`, PayOS link/webhook, mentor xác nhận
  cash, kích hoạt enrollment, `class_unit_progress`, email xác nhận, đối soát.
- Preview giới hạn cho cash pending.
- E2E tự động qua HTTP trong `pnpm test` (cần quyết định thêm plugin SWC cho Vitest).
- Cập nhật Postman collection.
- Hủy class chưa tự nhả các chỗ đang giữ; hiện chỉ nhả khi order hết hạn.
