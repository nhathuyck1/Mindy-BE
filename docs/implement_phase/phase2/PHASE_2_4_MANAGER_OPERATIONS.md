# Phase 2.4 — Manager vận hành: HR và kế toán

Ngày lập: 2026-10-16. **A–C đã implement source ngày 2026-10-16; local checks xem progress. D giữ backlog. Chưa deploy.**
Nguồn yêu cầu: manager được xem lớp, chi tiết lớp/course, mentor và student;
vai trò gần HR + kế toán. Kế thừa việc chuyển thu CASH sang manager ngày16/10.

[Flow](../../api_flow/PHASE_2_4_FLOW.md) ·
[API breakdown](../../api_flow/PHASE_2_4_flow-api-breakdown.md) ·
[Progress](../../progress/phase%202/PHASE_2_4_PROGRESS.md).

## 1. Mục tiêu và cách hiểu yêu cầu

Manager có góc nhìn toàn trung tâm để hỗ trợ học viên, theo dõi mentor/lịch dạy,
xem đơn hàng và thanh toán, thu tiền mặt. Không cần được phân công vào lớp mới xem.
Các quyền ghi đã có của manager trong Materials/Teaching/Attendance được giữ.
Increment mới ưu tiên **quyền đọc và tra cứu liên thông**, chưa mở thêm quyền tạo,
khóa tài khoản, đổi role, tạo/xóa course/class hay thao tác tiền ngoài CASH đã có.
Đây là ranh giới đề xuất của v1, không phải yêu cầu user đã chốt mọi nghiệp vụ HR.

Student checkout, payment ownership, preview/FULL và settlement giữ nguyên.
Manager xem hồ sơ student không đồng nghĩa giả danh student hoặc bỏ gate Materials.

## 2. Đối chiếu source hiện tại

| Nhóm | Đã có trong source | Khoảng trống của portal manager |
|---|---|---|
| Course | ManagerCatalogController: GET /manager/courses, /:courseId; thấy cả inactive, units; PATCH unit metadata đã có | Tích hợp đúng API, đi từ course sang lớp bằng filter courseId; không làm lại CRUD |
| Lớp và lịch | GET /management/classes, /:classId: teaching summary/timetable phân trang; GET /manager/classes: danh sách mọi lớp phục vụ thu CASH | Chi tiết vận hành có course, sức chứa, unit metadata; filter course/mentor/mode và điều hướng thống nhất |
| Học viên trong lớp | GET /manager/classes/:classId/students: payment roster, orderId/tổng đơn/canConfirmCash | Liên hệ, tình trạng tài khoản, detail đúng cặp lớp/student; giữ contract payment roster |
| Hồ sơ người dùng | GET /admin/users, /:userId chỉ ADMIN | Chưa có danh bạ/hồ sơ MENTOR/STUDENT dành cho manager |
| HR vận hành | /management có candidates, phân công lớp/buổi; session context; schedule/cancel/makeup/attendance operations theo Phase4 | Danh bạ mentor và lịch tổng hợp theo mentor, kể cả dạy thay; tra cứu học viên xuyên lớp |
| Kế toán | GET /manager/cash-orders, POST /:orderId/confirm; audit manager/legacy mentor đã có trong working tree | Tra cứu toàn bộ CASH/PAYOS orders và transactions theo student/class/status/thời gian |
| Đối soát | GET /admin/payments/reconciliation và POST /:paymentId/reconcile chỉ ADMIN | Manager cần đọc trạng thái cần kiểm tra; không tự mở command reconcile trong phase này |
| Hồ sơ chuyên sâu | UserEntity hiện có tên, email, phone, role/status, createdAt, lastLoginAt | Chưa có lương, hợp đồng, bảng công/lương, kinh nghiệm/chứng chỉ/feedback HR; không tạo field giả |

Source đối chiếu: users.controller.ts; manager-catalog.controller.ts;
admin-classes.controller.ts; teaching-management.controller.ts;
manager-class-roster.controller.ts; cash-payments.controller.ts;
attendance-reports.controller.ts; payments.controller.ts; OrdersService và UserDto.
Có source không đồng nghĩa đã deploy hoặc FE đã tích hợp. CASH và các quyền có
trước được ghi theo evidence lượt trước; lượt lập kế hoạch không chạy lại BE tests.

## 3. Ma trận quyền mục tiêu

| Nghiệp vụ | MANAGER v1 | ADMIN / ranh giới |
|---|---|---|
| Xem course/category/unit, cả inactive | Đã có; dùng lại | Giữ nguyên quyền hiện có |
| Xem mọi lớp, lịch, sức chứa, mentor, units | Đã có một phần; bổ sung detail/filter | Không mở quyền tạo/xóa/đổi trạng thái lớp bằng việc cấp GET |
| Xem học viên trong lớp, liên hệ và enrollment | Bổ sung thông tin/detail cho manager | Mentor roster giữ fields/quyền hiện tại |
| Danh bạ/detail mentor/student toàn trung tâm | Bổ sung; chỉ hai nhóm đối tượng này | Không mở danh sách/hồ sơ ADMIN/MANAGER qua API HR |
| Xem mentor dạy lớp/buổi nào, học viên học lớp nào | Bổ sung quan hệ đọc và lịch tổng hợp | Giữ effective mentor, dạy thay và lịch hủy theo Phase4 |
| Xem đơn CASH/PAYOS, transactions và người thu CASH | Bổ sung | Đọc không gọi provider hoặc xác nhận tiền |
| Thu đủ tiền mặt, confirm PAID | Đã có, manager bất kỳ | Giữ quyết định trước: role MANAGER thu; không tự cấp thêm cho ADMIN |
| Phân công mentor, vận hành lịch/attendance/materials | Giữ quyền đã có và điều kiện reason/version/audit | Không thu hồi hay nới quyền ghi hiện hành |
| Tạo/suspend/reactivate user, đổi role/password | Không bổ sung trong v1 | Giữ policy hiện có; không tạo API đổi role/password mới cho admin trong plan này |
| Tạo/xóa course/class, sửa giá | Không bổ sung trong v1 | Admin giữ các quyền đã implement |
| Gọi PayOS reconcile, hoàn tiền, sửa amount/status trực tiếp | Không bổ sung | Command reconcile hiện tại vẫn ADMIN; refund chưa được coi là đã có |
| Hợp đồng, lương, payroll, export dữ liệu hàng loạt | Ngoài v1, cần nghiệp vụ riêng | Không suy thành scope chỉ từ chữ HR/kế toán |

Không thêm MANAGER vào decorator cấp controller /admin/users hoặc /admin/classes:
hai controller đang chứa cả GET và mutations. Dùng manager controllers mỏng,
dịch vụ đọc dùng chung; không fork business logic hoặc sao chép controller admin.
Chưa cần permission tables, role hierarchy hoặc ACL động cho bốn role hiện tại.

## 4. Các lát triển khai và thứ tự

### 2.4A — Course, lớp và học viên trong lớp (ưu tiên cao nhất)

1. Giữ manager course GET hiện có; liên kết courseId → manager/classes?courseId.
2. Mở rộng GET /manager/classes bằng courseId/mentorId/deliveryMode/q, giữ status,
   pagination, response fields và sort hiện tại. GET /management/classes giữ
   contract teaching riêng, không đổi tên hoặc thay envelope.
3. Thêm GET /manager/classes/:classId: summary/course liên quan/phòng/sức chứa,
   số unit/session và enrollment counts theo trạng thái; không nhét mọi học viên,
   đơn và session vào một payload.
4. Thêm GET /manager/classes/:classId/units phân trang để xem cấu trúc, release
   metadata; dùng /management/classes/:classId?page=… để xem timetable đã có.
5. Payment roster manager thêm email/phone/studentStatus dạng additive; thêm
   GET /manager/classes/:classId/students/:studentId cho hồ sơ/contact/registration
   trong lớp. Giữ roster hiện tại chỉ effective enrollments; history dùng2.4B.
6. Manager DTO riêng: không thêm contact fields vào DTO dùng chung của Mentor,
   không vô tình mở PII mới cho mentor/public/student khác.

Gate A: mở course → lớp mọi trạng thái → units/lịch → học viên/payment/contact;
filter và counts đúng; không cần assignment; CASH roster không mất fields cũ.

### 2.4B — Danh bạ và hồ sơ HR

1. GET /manager/mentors và /:mentorId; GET /manager/students và /:studentId.
   Server cố định role theo route, không nhận role=ADMIN để mở rộng dữ liệu.
2. Tìm tên/email/phone, lọc ACTIVE/SUSPENDED; detail có cả tài khoản suspended
   để hỗ trợ, trong khi chính manager suspended vẫn bị chặn.
3. GET /manager/mentors/:mentorId/classes và /schedule: primary/substitute/any,
   tính theo effective mentor hiện hành; lịch có range bắt buộc và phân trang.
   Không dùng principal của mentor khác để gọi /mentor/schedule.
4. GET /manager/students/:studentId/classes: lịch sử enrollment, gồm CANCELLED
   nếu không lọc; mỗi enrollment là một dòng, giữ id để thấy các lần đăng ký lại.
   Detail lớp/student của A không mở history ngoài lớp. Không tự gán accessMode
   FULL cho enrollment CANCELLED/COMPLETED.
5. Lương/kinh nghiệm/hợp đồng/chứng chỉ chỉ làm sau khi có schema và rule riêng.

Gate B: từ mentor xem được lớp/lịch dạy thay; từ student xem được các lần đăng ký,
đi tới lớp và đơn; wrong-role UUID không bị lộ qua detail hay relationship route.

### 2.4C — Tra cứu kế toán và giao dịch

1. GET /manager/orders và /:orderId cho CASH/PAYOS, filter student/class/method/
   status/orderCode và khoảng createdAt. Mỗi order đúng một dòng dù có nhiều lớp.
2. GET /manager/payments và /:paymentId: payment status/amount/paidAt,
   order/student summary, providerOrderCode nếu PayOS, provenance người thu CASH.
   Không có payment chưa tạo thì order.payment=null, không bịa transaction pending.
3. Người thu CASH đọc từ reference manager/legacy đã lưu; không coi cashMentorId
   là người thu mới. Đổi role/tên hiện tại không sửa provenance lịch sử;
   không xác định được thì nullable, không suy từ mentor của lớp hiện tại.
4. Manager chỉ đọc REQUIRES_REVIEW/mismatch ở safe projection và chuyển admin
   xử lý; không mở command reconcile hoặc trả raw webhook/signature/credentials.
5. Trang thu tiền tiếp tục confirm qua endpoint CASH hiện có. GET không settle,
   không gọi provider, không tạo mail hoặc sửa enrollment.

Gate C: student → order → payment → người thu; filter/sort/pagination chính xác,
đọc PayOS không xác nhận tiền; một manager khác thu cùng đơn vẫn idempotent.

### 2.4D — Tổng hợp thu tiền (sau A–C; tùy nhu cầu ưu tiên)

Đề xuất GET /manager/finance/summary?from=…&to=… sau khi chốt semantics với màn hình:
thu đã xác nhận tính SUCCEEDED/PAID theo paidAt, chia CASH/PAYOS, đếm theo order,
không join line làm nhân tiền. CASH còn chờ chỉ tính PENDING chưa hết hạn, là
"đang chờ thu theo đơn", không gọi là công nợ pháp lý. Summary phải nêu asOf và
timeZone; không trộn period paidAt với backlog hiện tại mà không ghi nhãn.
Chưa làm ledger, doanh thu ghi nhận kế toán, lợi nhuận, lương hoặc thuế trong v1.
API summary là backlog đề xuất, không chặn hoàn thành nhu cầu xem thông tin A–C.

## 5. Kiến trúc và dữ liệu

- Users sở hữu HR profile/list và role-scoped lookup. Classes sở hữu class/units/
  schedule và effective-mentor relationships. Enrollments xuất provider history.
  Commerce sở hữu order management read; Payments sở hữu payment/provenance read.
- Cross-module compose qua exported read providers, không để UsersService import
  ClassesService rồi Classes import Users tạo vòng; orchestration nằm ở controller
  module phù hợp/read service và trả DTO, không cross-read private repositories.
- Reuse ClassReadService/CoursesService/TeachingReadService/EnrollmentsService;
  mở các public read methods cần thiết thay vì tái tạo bảng hoặc logic settlement.
- Counts/filter trước pagination, deduplicate order/class đúng cardinality; batch
  lookup contact/course/payment, không query từng row. Lịch nhiều page theo thời gian.
- Không cần role/schema migration dự kiến. Chỉ thêm index additive khi EXPLAIN
  chứng minh cần cho search/relationships/finance; không sửa migration đã deploy.
- Query q trim1–100, escaped literal search, parameterized; UUID v4; list1–100;
  date range hợp lệ, timezone theo APP_TIME_ZONE. Số tiền nguyên VND.
- Active MANAGER/auth session ở mọi route; DTO allowlist, private/no-store;
  không log contact/search text. Không trả passwordHash/token/session/Google identity.
- Tài liệu/API phân biệt planned/implemented/local/deployed. Không sửa FE repo.

## 6. Acceptance criteria

| ID | Điều kiện nghiệm thu |
|---|---|
| M01 | Manager active xem lớp mọi trạng thái, course inactive và contact mentor/student không cần assignment |
| M02 | Course → classes dùng courseId, filter course/mentor/status/mode kết hợp đúng |
| M03 | Chi tiết class/units/timetable đầy đủ theo contract và có pagination phù hợp |
| M04 | Cash roster giữ orderId/classAmount/orderTotalAmount/canConfirmCash, thêm contact chỉ cho manager |
| M05 | Class/student detail chỉ nhận đúng student có effective enrollment trong lớp; ngoài lớp404 |
| M06 | Directory mentor/student không đọc được ADMIN/MANAGER qua role query hoặc guessed UUID |
| M07 | Suspended target đọc được; suspended/demoted manager hoặc session không hợp lệ bị chặn |
| M08 | Mentor schedule có primary/substitute/effective mentor đúng; giữ canceled sessions được gắn trạng thái |
| M09 | Student classes giữ từng enrollment, kể cả history/re-enrollment, không cấp entitlement mới |
| M10 | Order/payment filter theo student/class/method/status/range, order nhiều lớp không nhân total/amount |
| M11 | Order chưa tạo transaction trả payment=null; trạng thái Order/Payment không gộp thành enum mới |
| M12 | CASH mới ghi manager collector, legacy đọc đúng; role change không mất lịch sử |
| M13 | GET tài chính không provider/SMTP call, không settle/activate/write |
| M14 | Manager không mở được admin user mutations, class/course CRUD/price hay POST reconcile |
| M15 | Quyền ghi manager hiện có trong Materials/Teaching/Attendance và full CASH vẫn hoạt động |
| M16 | Student self ownership, preview/FULL, Materials release, mentor scope không bị mở rộng |
| M17 | Input lạ/sai query/date/UUID bị từ chối; total/sort/page ổn định, empty state đúng |
| M18 | Không token/hash/raw webhook/credentials; manager contact không rò sang mentor/public responses |
| M19 | Swagger/Postman/flow/breakdown/progress cùng revision; source route cũ giữ tương thích |
| M20 | Lint/type-check/integration/HTTP/build pass; mọi evidence local/server/browser được tách riêng |

## 7. Kiểm chứng và bàn giao khi triển khai

Unit: role-scoped lookup, mapper allowlist, filter/range validation, provenance.
PostgreSQL: joins/counts/multi-class orders/re-enrollment/substitute, bounded query
counts và EXPLAIN. HTTP: cookie role matrix từng GET/new route, invalid input,
suspended actor, guessed wrong-role target, các admin mutations vẫn403.
Regression: CASH concurrent/expiry/rollback, PayOS settlement, Student self access,
Materials và Teaching/Attendance đã có; không viết test chỉ phản chiếu từng getter.

Mỗi slice cập nhật OpenAPI/Postman, chạy focused tests; gate tích hợp cuối dùng
pnpm check và HTTP suites với DB test riêng. Triển khai server/browser acceptance
là bước sau: manager login → course/lớp → contact → HR profile → order/payment →
thu CASH → Student FULL. Không dùng chỉ số test lượt trước làm evidence lượt này.

Thứ tự đề nghị: A → B → C, rồi quyết định D. Có thể nghiệm thu từng slice;
chưa ước lượng ngày công trước khi chốt mức chi tiết HR/finance bổ sung.

## 8. Quyết định cần tách nếu mở rộng sau v1

- Manager được tạo/sửa/suspend mentor/student đến đâu; ai duyệt thay đổi role?
- Có nghiệp vụ hợp đồng/chấm công tính lương/payroll hay chỉ lịch giảng dạy?
- Có hoàn tiền, export, sổ quỹ và quy trình kiểm soát kế toán nhiều người?
- Có chi nhánh/tenant giới hạn manager không? V1 theo yêu cầu hiện tại là toàn
  trung tâm, không tự phát sinh schema multi-tenant hoặc khóa theo lớp.

Các câu này không chặn kế hoạch đọc A–C; không tự coi là đã được yêu cầu triển khai.

## 9. Revision triển khai ngày 2026-10-16

A–C đã có source/controllers/DTO/exported read providers và tests local; evidence
ở progress2.4, full contract ở breakdown§7. Không thêm schema/index/migration;
EXPLAIN trên fixture nhỏ và batch query không N+1 được ghi riêng, chưa benchmark
production. Manager class roomName=null theo schema session-room; collector name
là tên hiện tại, source theo reference immutable. Canceled-before-start schedule
hiện allocation hiện tại và không sinh teaching credit. Rate-limit/metrics/i18n
riêng chưa có infrastructure trong slice này. D backlog, deploy/browser pending.

Yêu cầu ảnh bổ sung dùng lại Materials3.3/Files3.2: text/plain input contentText
hoặc CKEditor contentHtml; upload PDF/TXT/MP3 FILE, MP4 VIDEO. User chọn BE/API
trước; không sửa FE. Word .docx dùng FILE/DOCUMENT và approve hiện hữu; flow/breakdown3.3 và
Postman cùng revision; không thêm API upload song song hoặc thay ownership.

Quyết định kỹ thuật cho error mapping: read facade dùng AppHttpException hiện hành
với mã MANAGER_RANGE_INVALID/PAYMENT_NOT_FOUND thay vì thêm wrapper exception mỗi
mã; giữ error envelope/global filter và có HTTP coverage. Đây là ngoại lệ có ghi
nhận so với guideline ưu tiên named exception classes; không đổi status contract.
