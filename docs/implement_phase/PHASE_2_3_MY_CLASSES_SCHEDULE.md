# Phase 2.3 — My Classes + Personal Schedule

Ngày lập: **2026-10-09**. Trạng thái: **đã implement và pass `pnpm check` ở local;
suite PostgreSQL/HTTP chưa chạy, chưa deploy**.
Tiến độ: [PHASE_2_3_PROGRESS.md](../progress/PHASE_2_3_PROGRESS.md).
Contract FE đã chốt: [PHASE_2_3_FE_CONTRACT.md](../PHASE_2_3_FE_CONTRACT.md).
Thứ tự: **Phase 2/2.2 → Phase 2.3 → Phase 3 File + Materials**.

## 1. Mục tiêu

Hoàn thiện luồng Student sau đăng ký lớp, không phải đăng ký tài khoản:

```text
Chọn Class → checkout → chờ thanh toán/xác nhận CASH
  → Lớp của tôi → chi tiết lớp → lịch học cá nhân → mở lớp/buổi học
```

Student không phải lấy danh sách đơn mua rồi tự ghép từng Class để tạo lịch.
Backend cung cấp danh sách enrollment và lịch tổng hợp theo người đang đăng nhập,
thể hiện rõ chờ thanh toán, preview CASH, đã có quyền học hoặc chỉ còn lịch sử.

Phạm vi:

1. API danh sách “Lớp của tôi”, phân trang và lọc.
2. Kết nối danh sách với API chi tiết lớp/preview đang có; bổ sung thông tin trạng
   thái cần thiết theo cách additive, giữ tương thích contract Phase 2.
3. API lịch học cá nhân từ Session của nhiều Class, lọc theo khoảng thời gian.
4. Contract FE, kiểm thử xuyên suốt checkout/payment/enrollment/class/schedule.

Không làm materials/upload, attendance, progress read/write, assignment, chat,
board/compiler, chứng chỉ, mentor availability, nghỉ/dạy bù, email đổi lịch,
Google Calendar sync, export ICS hoặc cải tiến checkout/payment không liên quan.
Không làm UI frontend trong phạm vi BE; contract và acceptance flow phải đủ để FE nối.

## 2. Căn cứ và baseline

- [Flow.txt](../../document/Flow.txt): Student đăng ký Class, thanh toán toàn bộ,
  xem lịch; CASH pending chỉ xem tiêu đề unit/session và thời khóa biểu; mentor
  confirm mới mở nội dung. Online payment có email; pending chat/DM để phase Chat.
- [Course flow](../../document/COURSE_FLOW.md): Class → Class Unit → Session;
  enrollment cấp quyền, Order chỉ thể hiện giao dịch.
- [DBML](../../document/mindy_center_full.dbml): tái dùng `enrollments`,
  `order_details`, `orders`, `classes`, `class_units`, `course_units`, `class_sessions`,
  `courses`, `users`; không cần bảng lịch cá nhân hoặc enrollment mới.
- [FE contract Phase 2](../PHASE_2_FE_CONTRACT.md): My Classes còn là backlog;
  workaround hiện dùng Order PAID để lấy classId, không thay thế enrollment query.
- [Phase 2.2 progress](../progress/PHASE_2_2_PROGRESS.md) và
  [progress chung](../progress/Progress.md): phân biệt code/local checks với VPS/live.

Đã có trong source ngày lập plan:

| Phần | Hiện trạng |
|---|---|
| `GET /api/v1/me/classes/:classId` | Student enrollment ACTIVE; Class CANCELLED bị chặn. DTO gồm class/mentor/unit/session/timetable và meeting URL. |
| `GET /api/v1/me/classes/:classId/preview` | CASH pending hold còn hạn; title/timetable/room, không meeting URL. Sau thanh toán endpoint preview trả 403. |
| Checkout, CASH confirm, PayOS settlement, expiry | Có code và bằng chứng local theo từng increment; giữ nguyên entitlement/transaction. |
| `GET /api/v1/me/classes` | Chưa có. |
| Lịch học tổng hợp theo Student | Chưa có. `ClassScheduleService` hiện phục vụ xếp lịch/kiểm tra lịch mentor, không phải query lịch cá nhân. |
| Mentor roster | Đã có và có evidence deploy 2026-10-09; không phải bằng chứng nghiệm thu PayOS tiền thật. |

## 3. Quy tắc truy cập đề xuất

Kế thừa entitlement hiện tại. Đây là contract dự kiến của increment, chưa phải
business rule đã áp dụng. Ghi lại quyết định cuối cùng ở bước 2.3.1, đặc biệt quyền
lịch sử sau completion; không mở thêm entitlement ngoài ACTIVE một cách ngầm định.

### 3.1 Access mode

| Tình trạng tại thời điểm đọc | `accessMode` | Danh sách lớp | Chi tiết/lịch cá nhân |
|---|---|---|---|
| Enrollment ACTIVE, Class không CANCELLED | `FULL` | Có | Chi tiết hiện hành + timetable; meeting URL qua endpoint detail. |
| CASH PENDING_PAYMENT, đúng own Order PENDING và `expires_at > now`, Class không CANCELLED | `CASH_PREVIEW` | Có | Preview title/timetable/room; lịch được phép hiện, không meeting URL. |
| PAYOS PENDING_PAYMENT còn hạn | `NONE` | Có, nhãn chờ thanh toán | Không thêm vào lịch cá nhân hoặc cấp private detail; chỉ summary/order và catalog công khai. |
| Hold quá hạn, dù timer chưa đổi Order/enrollment | `NONE` | History | Không timetable/private detail; `isHoldExpired=true`. |
| Enrollment CANCELLED hoặc Order EXPIRED/CANCELLED với pending hold | `NONE` | History | Không timetable/private detail. |
| Enrollment COMPLETED | `NONE` | Có, nhãn đã hoàn thành | Giữ rule hiện tại không mở private detail/lịch; quyền học lại để quyết định riêng. |
| Class CANCELLED, kể cả enrollment ACTIVE | `NONE` | Hiện summary và nhãn lớp đã hủy | Không private detail/lịch cá nhân. |

`FULL` chỉ là quyền chi tiết/timetable hiện có, không có nghĩa materials/attendance
đã tồn tại. Unit LOCKED không giấu tiêu đề và lịch Session trong Phase 2.3;
policy mở nội dung học thuộc Phase 3. Không dùng progress percent để cấp quyền.

Nguồn quyết định chính là enrollment thuộc principal. CASH preview phải join đúng
`enrollment.order_detail_id → order_details.order_id → own orders`, không tìm một
Order CASH khác cùng Class để mở quyền. Đối chiếu cả studentId/classId trong chuỗi
quan hệ; nếu dữ liệu lệch thì fail closed, không dùng email hoặc client role.

`accessMode`, `accessReason`, `canViewClass`, `canViewSchedule` là hint tại thời điểm
response, không phải token quyền truy cập; endpoint detail/preview kiểm tra lại.
Access reason đề xuất: `ACTIVE_ENROLLMENT`, `PENDING_CASH`, `PENDING_PAYOS`,
`HOLD_EXPIRED`, `ENROLLMENT_CANCELLED`, `ENROLLMENT_COMPLETED`, `CLASS_CANCELLED`,
`STATE_MISMATCH`. Class CANCELLED ưu tiên chặn mọi entitlement.

### 3.2 Enrollment khác Order và lịch sử

- Một dòng My Classes đại diện một **Enrollment**, khóa UI là `enrollmentId`.
- `view=current` mặc định gồm ACTIVE/COMPLETED và pending hold còn hạn, đúng Order
  PENDING. Class CANCELLED vẫn có thể hiện trong current nếu enrollment còn effective,
  nhưng accessMode NONE và không có calendar event.
- `view=history` gồm enrollment CANCELLED và pending hold đã hết hạn/đơn đóng;
  `view=all` gồm cả hai nhóm. COMPLETED nằm current để học viên tìm lại summary.
- Mua lại sau khi hold cũ hủy có thể sinh hai dòng cùng classId trong all/history;
  không gộp dòng cũ với enrollment mới. Calendar chỉ lấy enrollment có quyền hiện tại.
- Giữ `enrollmentStatus`/`orderStatus` đúng DB; thêm `isHoldExpired` để biểu thị
  timeout chưa được timer persist. GET không chạy expiry, settle, gọi PayOS hoặc ghi DB.
- Trả Order summary để FE mở thanh toán/đối soát; không trả QR/checkout URL trong
  My Classes và không tự tạo payment link. Dùng API payment hiện có khi cần.
- Pending PAYOS `REQUIRES_REVIEW` cần nhãn đối soát từ payment summary an toàn nếu
  query hỗ trợ; không hiển thị “trả lần nữa” như mặc định, không tự mở quyền.

## 4. API và DTO dự kiến

Tất cả route dưới prefix `/api/v1`, cookie auth, role STUDENT và active-user checks.
Không nhận `studentId` từ query/body. Không trả TypeORM entity.

### 4.1 Danh sách lớp

```text
GET /api/v1/me/classes
  ?page=1&pageSize=20
  &view=current
  &enrollmentStatus=ACTIVE
  &classStatus=IN_PROGRESS
  &deliveryMode=ONLINE
  &courseId=<uuid>
```

`view=current|history|all`, mặc định current. Các filter còn lại optional, một enum
value mỗi filter ở MVP. Page/pageSize theo convention repo, tối đa 100. Filter không
giao nhau trả list rỗng, không bỏ filter. Sort cố định `enrollment.created_at DESC,
enrollment.id ASC`; áp dụng filter/access expiry classification **trước** count/page.

Response `{ items, page, pageSize, total, asOf }`; mỗi item có:

| Nhóm | Fields |
|---|---|
| Enrollment | `enrollmentId`, `enrollmentStatus`, `enrolledAt`, `createdAt`, `isHoldExpired`. |
| Course | `courseId`, `courseCode`, `courseTitle`, `courseImageUrl`; image nullable. |
| Class | `classId`, `classCode`, `className`, `classStatus`, `deliveryMode`, `startDate`, `endDate`. |
| Mentor hiện tại | `mentor: { id, displayName }`; không trả email/phone. |
| Own Order summary | `orderId`, `orderCode`, `orderStatus`, `paymentType`, `expiresAt`, `paidAt`, `requiresReview`. |
| Quyền | `accessMode`, `accessReason`, `canViewClass`, `canViewSchedule`. |

`requiresReview` lấy trạng thái payment thật qua read projection; không suy ra từ
redirect, và false nếu không có payment attempt cần đối soát. Giá/tổng Order, QR và
chi tiết thanh toán dùng API Order hiện có. Một Order nhiều Class không bị hiểu là
mỗi enrollment có một Order độc lập. Không có meeting URL trong My Classes list.
`asOf` là timestamp server dùng chung khi tính deadline cho response đó.

### 4.2 Chi tiết lớp

Tái dùng:

```text
GET /api/v1/me/classes/:classId          # FULL
GET /api/v1/me/classes/:classId/preview  # CASH_PREVIEW
```

Không thêm endpoint “unified detail” hoặc gọi HTTP giữa các service. Bổ sung additive
`classStatus` và enrollment/access context cần thiết vào DTO Student, giữ tên/type
field cũ. Nếu cần thêm vào CASH preview, dùng DTO riêng kế thừa DTO public hiện có,
không thêm thông tin enrollment vào public catalog DTO.

Backend resolve effective enrollment cho detail theo classId, không lấy CANCELLED
history thay enrollment mới. FULL/CASH preview giữ policy hiện tại. Sau confirm,
FE refetch My Classes rồi chuyển sang full detail; không tiếp tục dùng preview.

### 4.3 Lịch học cá nhân

```text
GET /api/v1/me/schedule
  ?from=2026-10-11T17:00:00Z
  &to=2026-10-18T17:00:00Z
  &page=1&pageSize=100
  &classId=<uuid>
  &includeCancelled=true
```

- `from`/`to` bắt buộc là ISO timestamp có `Z` hoặc offset; `from < to`, tối đa
  31 ngày theo duration. Không nhận datetime thiếu timezone. Range là `[from, to)`.
- Chọn Session giao range bằng `starts_at < to AND ends_at > from`; buổi qua đêm
  xuất hiện đúng, buổi kết thúc đúng from hoặc bắt đầu đúng to bị loại.
- FE đổi ngày/tuần/tháng thành range theo timezone trung tâm. Response trả
  `timeZone` theo `APP_TIME_ZONE` hiện hành, `from`, `to`, `asOf`, `items`, `page`,
  `pageSize`, `total`. Timestamp event ISO UTC; UI hiển thị theo timeZone trả về.
- `classId` optional; nếu không có enrollment được phép xem lịch của Class đó,
  trả 403. Không trả lịch công khai làm fallback cho Class ngoài quyền.
- `includeCancelled` mặc định true: hiện Session CANCELLED trong Class còn quyền
  để học viên biết buổi đã hủy; false thì lọc bỏ. Class CANCELLED bị loại cả lớp.
- Có Session SCHEDULED/COMPLETED trong range. Sort `starts_at ASC, session_id ASC`;
  phân trang 100 mặc định, max 100; FE phải lấy đủ trang của range, không cắt âm thầm.
- Không ghi trạng thái mới, không tạo/copy event riêng. Đổi giờ hoặc hủy Session
  hiện hữu được phản ánh khi refetch. Workflow reschedule/approval chưa có không
  được coi là đã triển khai nhờ API read này.

Mỗi event gồm `sessionId`, `sessionNumber`, `sessionTitle`, `sessionStatus`,
`startsAt`, `endsAt`, `roomName`, `classId`, `classCode`, `className`, `classStatus`,
`courseId`, `courseTitle`, `classUnitId`, `unitTitle`, `deliveryMode`,
`mentor: { id, displayName }`, `enrollmentId`, `accessMode`.

**Calendar không trả meeting URL**, kể cả FULL. Khi mở lớp/buổi, FE dùng class detail
đã được kiểm tra lại. Không thêm riêng session detail endpoint trong Phase 2.3;
UI định vị sessionId trong units/sessions của class detail. CANCELLED event hiển thị
nhãn buổi hủy và không có nút tham gia; không đổi contract detail cũ để làm attendance.
Không trả materials, danh sách Student, email/phone, order/payment payload trong event.

### 4.4 Lỗi và cache

- 401: chưa đăng nhập/session không hợp lệ; 403: role hoặc entitlement không đủ.
- 422: query/UUID/enum/range sai theo validation envelope hiện hành; 404 giữ theo
  detail endpoint hiện có khi resource không tồn tại sau authorization.
- No enrollment hoặc range không có Session: 200 list rỗng, total 0.
- Các response cá nhân dùng `Cache-Control: private, no-store`; không cache CDN.
- `/me/schedule` tránh route tĩnh `schedule` bị `:classId`/ParseUUIDPipe bắt nhầm.
  `GET /me/classes` là route collection mới, không thay hai detail routes cũ.

## 5. Read model, schema và biên module

### 5.1 Query chính

```text
My Classes:
  enrollment(student_id = principal)
    → class → course → mentor hiện tại
    → order_detail của enrollment → own order → payment summary tối thiểu

My Schedule:
  enrollment có FULL hoặc CASH_PREVIEW
    → class → class_unit → class_session giao range
    → course_unit title + course + mentor
```

Không lấy chỉ Order PAID làm nguồn danh sách. Query phải chống fan-out khiến một
Session/enrollment xuất hiện nhiều lần; dùng one-to-one payment projection hoặc
EXISTS, không join webhook/email rows. Không dùng inner join optional payment làm
mất enrollment chưa tạo attempt. Course inactive/Class không còn OPEN vẫn hiện
cho Student có quyền; không gọi public catalog filter để quyết định entitlement.

Count và items dùng cùng snapshot đọc nhất quán (read-only transaction
REPEATABLE READ nếu có nhiều statement), cùng `asOf`. Không cần pessimistic lock
hoặc lock Order cho GET. Settlement/expiry có thể commit sau response; thao tác
mở lớp luôn kiểm tra lại. Empty list không tạo enrollment/progress.

### 5.2 Tổ chức code dự kiến

- Thêm `StudentLearningModule` cho collection My Classes và `/me/schedule`;
  root AppModule import module này. Giữ detail controllers hiện tại.
- Chốt public read projection contract với Classes, Enrollments, Commerce và
  Payments cho order/entitlement/payment summary trước khi triển khai. Không import
  repository/entity private xuyên module hoặc gọi controller từ service khác.
- Nếu dùng read-model SQL JOIN để phân trang/filter đúng trong một query, đặt tại
  read provider của StudentLearning theo schema projection đã được ghi quyết định
  và review bởi module owner; chỉ đọc, không sở hữu entity hoặc mutation của module
  khác. Không ghép filter sau khi đã paginate từng nguồn.
- Không để Classes/Enrollments/Commerce import ngược StudentLearning; không cần
  `forwardRef`. Cash confirm/PayOS settlement vẫn do module hiện hữu sở hữu.
- Tách DTO/query validation, query provider và access evaluator. Tái dùng predicate
  deadline/CASH entitlement để My Classes/calendar/preview không có ba rule khác nhau.
- Batch read/SQL projection, không query mentor/course/session lần lượt cho từng
  dòng. Query list không tải toàn bộ Session; lịch được lọc bằng range ở DB.

### 5.3 Migration

**Mặc định không thêm bảng hoặc đổi schema nghiệp vụ.** Entity và quan hệ đã đủ.
Không chỉnh deployed migration, không bật synchronize.

Kiểm tra query plan trên fixture đủ lớn; chỉ thêm additive migration index nếu
có bằng chứng cần: `(student_id, created_at, id)` cho enrollment list, access filter
và session time join. DBML hiện đã có index student/class, class-unit và starts/ends;
không thêm trùng index theo suy đoán. Nếu thêm index, test up/down/up và clean DB,
cập nhật DBML/progress, ghi tác động thời gian migrate.

## 6. Luồng FE để nghiệm thu

1. Checkout thành công → mở My Classes/refetch. Pending PAYOS có nhãn chờ và nút
   xem own Order; CASH pending có nút xem preview và lịch.
2. Return PayOS chỉ lookup/poll Order theo contract cũ; không dùng URL return để
   đổi quyền. Sau backend PAID, refetch My Classes/calendar rồi mở FULL detail.
3. Mentor confirm CASH → Student refetch thấy FULL; preview cũ có thể trả 403.
   FE refetch access context, không coi đây là lỗi mất lớp.
4. My Classes → chọn lớp → gọi đúng full/preview endpoint theo accessMode.
   NONE vẫn có Order/history summary phù hợp nhưng không gọi private detail tự động.
5. Lịch tuần/tháng → gọi schedule range, lấy đủ trang → click event → mở Class rồi
   định vị Session. Buổi canceled có nhãn hủy, không mời tham gia.
6. Hold quá hạn → refetch mất CASH preview/calendar dù worker expiry chưa chạy;
   history vẫn giải thích được lần đăng ký cũ. Checkout lại sinh enrollment mới.
7. Có loading/empty/error/session-expired states; cache UI theo user, xóa khi logout.
   Không tái dùng dữ liệu user trước sau đổi tài khoản. Poll có giới hạn/backoff,
   refresh khi focus hoặc sau payment; không thêm websocket trong increment này.

Contract FE mới dự kiến: `docs/PHASE_2_3_FE_CONTRACT.md` tạo khi contract được chốt
ở bước 2.3.1. Plan này không tuyên bố file contract/API đó đã tồn tại.

## 7. Thứ tự triển khai

| Bước | Công việc | Tiêu chí hoàn thành | Ngày công BE dự kiến |
|---|---|---|---|
| **2.3.1 Contract/policy** | Chốt access matrix, current/history, range/timezone, fields, module read projections; viết FE contract. | Không mơ hồ pending/expiry/COMPLETED; API dự kiến được phân biệt API đã có. | 0.5–1 |
| **2.3.2 My Classes** | Collection DTO/filter/read query, count/page/sort, deadline và Order summary. | ACTIVE/CASH/PAYOS/history đúng người; expiry không phụ thuộc timer; no N+1. | 1–2 |
| **2.3.3 Detail continuity** | Additive context, tái dùng full/preview, đồng nhất policy và mapping accessMode. | Click lớp từ list chạy được; confirm/refetch đổi preview → FULL; route cũ giữ tương thích. | 0.5–1 |
| **2.3.4 Personal Schedule** | Range validation, projection nhiều lớp, timezone, cancelled sessions, pagination. | Calendar đúng overlap/boundary, chỉ FULL/CASH preview, không lộ meeting URL. | 1–2 |
| **2.3.5 Quality gate/rollout** | DB/HTTP/regression, query-plan review, Swagger/Postman, staging smoke và docs/progress. | End-to-end flow pass; evidence local/VPS/live tách rõ; critical tests không skip. | 1–2 |

Tổng **4–8 ngày công BE**, chưa tính FE implementation, chờ deployment hoặc
nghiệm thu payment thật. Đây là ước lượng, không phải lịch cam kết.
Ưu tiên triển khai tuần tự thành slice chạy được; My Classes trước calendar.

Điều kiện bắt đầu: baseline auth/role, PostgreSQL test database, fixtures Course/
Class/Session/Order/Enrollment hoạt động. Không cần credentials PayOS thật để viết
code/test; test settlement bằng provider fake không chứng minh thanh toán thật.

## 8. Kiểm thử nghiệm thu

| Nhóm | Ca bắt buộc |
|---|---|
| Ownership/auth | A không thấy enrollment/event của B; không nhận studentId do client chỉ định; 401/403 đúng guard; filter class ngoài quyền 403. |
| Enrollment/order | ACTIVE, COMPLETED, CASH pending, PAYOS pending, review, expired/cancelled; một Order nhiều Class; optional payment chưa có; không nhân bản dòng. |
| Expiry | `expires_at > now` mới preview; đúng mốc bằng now bị chặn; timer chưa chạy vẫn NONE/history và không có calendar event. |
| History/rebuy | Hold cũ CANCELLED và enrollment mới cùng Class; key enrollmentId; calendar không dùng order/hold cũ để cấp quyền. |
| Pagination/filter | Filter trước count/page; pageSize max; stable sort có tie-break; total không bị fan-out; giao filter rỗng trả 200. |
| Class lifecycle | Course inactive/Class IN_PROGRESS/COMPLETED vẫn được đọc nếu ACTIVE; Class CANCELLED chỉ summary, không detail/calendar. |
| Calendar time | Một/nhiều lớp, timezone +07, qua đêm, from/to đúng ranh giới, range <=31 ngày, offset tương đương UTC, timezone thiếu hoặc range sai bị reject. |
| Calendar status | SCHEDULED/COMPLETED/CANCELLED Session; includeCancelled true/false; Session đổi giờ phản ánh qua read; không bịa workflow nghỉ/bù. |
| Privacy | CASH/PayOS pending và list/calendar không có meeting URL, materials, email/phone hoặc payment secrets; response no-store. |
| Flow continuity | Checkout → list pending → CASH confirm/PayOS verified settlement → list FULL → detail/calendar; expiry → mất preview; retry settlement không nhân progress/enrollment. |
| HTTP compatibility | Collection/detail/preview routes không bắt nhầm nhau; validation/error envelope; DTO cũ và payment result mapping giữ tương thích. |

Unit tests cho access evaluator/range validation; PostgreSQL integration cho join,
count/history/snapshot/settlement transition; built-app HTTP tests cho cookie guard,
query DTO/route/privacy. Dùng DB riêng, không chạy test/migration trên VPS/production.
Kiểm tra query plan với số liệu test đủ lớn; không tự đặt SLA dựa trên máy dev.

Chạy `pnpm check` và `pnpm test:http` khi implementation xong. Critical integration
suite bị skip không được tính pass. Lỗi baseline như CRLF lint phải ghi rõ và xử lý
trước nghiệm thu, không dùng targeted pass thay full gate. Lượt planning chỉ kiểm docs.

## 9. Rollout và Definition of done

- Deploy additive route/DTO qua pipeline hiện hữu; không sửa payment callback/tunnel
  hoặc credentials để làm Phase 2.3. Kiểm cache rule không cache `/api/v1/me/*`.
- Staging/VPS smoke bằng tài khoản test: My Classes, full/preview, calendar range,
  401/403, pending expiry và refresh sau settlement; lưu release/response đã che PII.
- Nếu có index migration: backup, migration/release theo runbook hiện hữu, không
  sửa migration cũ. Nếu không đổi schema, ghi rõ không có migration cho increment.
- PayOS live PAID/ACTIVE/mail vẫn là nghiệm thu Phase 2.2 riêng. Phase 2.3 local
  pass hoặc mentor roster deploy không tự đóng các gate Phase 0/1/2 còn thiếu.

Checklist:

- [ ] Contract access/current/history/calendar đã chốt và FE contract có tài liệu.
- [ ] My Classes lấy enrollment đúng principal, không dựa workaround Order PAID.
- [ ] FULL/CASH_PREVIEW/NONE đúng rule, expired hold bị chặn ngay tại read.
- [ ] Student mở detail/preview từ My Classes; context bổ sung không phá public DTO.
- [ ] Lịch nhiều lớp đúng range/timezone/status, đủ pagination, không meeting URL.
- [ ] Không cấp quyền enrollment COMPLETED hoặc materials/progress ngầm định.
- [ ] DB/HTTP/regression/check pass, critical suite không skip; query plan được review.
- [ ] Swagger/Postman/FE docs/index/progress cập nhật; local/staging/VPS/live rõ ràng.
- [ ] Phase 3 kế thừa My Classes/detail/calendar đã ổn định; materials vẫn là phase sau.
