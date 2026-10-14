# Course flow — bản để kiểm tra trước Phase 3

> Trạng thái: **D1–D6 Phase 3 đã duyệt; Phase 4.1–4.2 implemented/tested local ngày2026-10-13, 4.3–4.5 pending/chưa deploy; chứng chỉ còn hoãn**.
> Nguồn nghiệp vụ và mô hình dữ liệu: [`Flow.txt`](./Flow.txt), [`usecase-course.drawio`](./usecase-course.drawio) và [`mindy_center_full.dbml`](./mindy_center_full.dbml).  
> Nguồn quyết định triển khai hiện hành: [`CORE_BUSINESS_LOGIC.md`](../docs/CORE_BUSINESS_LOGIC.md), [`PHASE_2_FE_CONTRACT.md`](../docs/PHASE_2_FE_CONTRACT.md), [`Progress.md`](../docs/progress/Progress.md).  
> Tài liệu này mô tả **flow mong muốn**; các mục ghi “chưa triển khai” không phải API/tính năng đã có.

> Tiếp nối 2026-10-09: đã lập [kế hoạch Phase 3 File + Materials](../docs/implement_phase/phase%203/PHASE_3_FILES_MATERIALS.md)
> từ flow này, DBML và use case. User đã duyệt D1–D6 tại
> [Phase 3.1](../docs/implement_phase/phase%203/PHASE_3_1_POLICY_CONTRACT.md): Material chính
> thuộc Course Unit 1–N, shared giữa các lớp; Manager quản lý/sửa/duyệt, Mentor
> upload chờ duyệt; ACTIVE + unit release + approval/publication mới đọc được.
> Role MANAGER được bổ sung bằng migration mới; policy/contract/providers 3.1 đã
> code và test local. Upload/storage/review/material HTTP API chưa có.

## 1. Khái niệm và quan hệ

| Khái niệm | Vai trò trong flow |
|---|---|
| **Course** | Khóa học mẫu do Admin quản lý: thông tin công khai, giá và danh sách Course Unit. Course không có lịch dạy và tự nó không cấp quyền học. |
| **Course Unit** | Nội dung/chương học có thứ tự trong Course. |
| **Class** | Lớp mở từ một Course, có hình thức ONLINE/OFFLINE, mentor, sức chứa, thời gian và trạng thái. Student đăng ký **Class**. |
| **Class Unit** | Liên kết Class–Course Unit được tạo khi mở cấu trúc lớp, giữ tham chiếu nội dung dùng chung và thứ tự/trạng thái riêng; không clone toàn bộ nội dung. |
| **Class Session** | Buổi học có lịch cụ thể thuộc một Class Unit. DBML gắn điểm danh, assignment và board trực tiếp với Session; materials hiện gắn với Course Unit. |
| **Enrollment** | Quan hệ Student–Class. Lúc checkout là giữ chỗ `PENDING_PAYMENT`; sau khi thanh toán hợp lệ là `ACTIVE`. |
| **Attendance Record** | Kết quả điểm danh của một Enrollment tại một Class Session. DBML giới hạn một bản ghi cho mỗi cặp `(enrollment_id, class_session_id)`. |

Quan hệ chính:

```mermaid
flowchart LR
    C[Course] --> CU[Course Unit]
    C --> CL[Class]
    CU -->|tham chiếu khi tạo lớp| CLU[Class Unit]
    CL --> CLU
    CLU --> S[Class Session]
    ST[Student] -->|đăng ký và thanh toán| E[Enrollment]
    E --> CL
    E --> AR[Attendance Record]
    S --> AR
```

**Cách hiểu đang dùng:** “Import class from course-unit” trong sơ đồ nghĩa là khi Admin tạo Class từ Course, hệ thống đưa các Course Unit hiện có vào Class Unit. Flow này không thêm một bước duyệt thủ công để Student được vào Course Unit sau khi thanh toán; enrollment được kích hoạt tự động. Nếu ý định là chọn từng Course Unit để mở một Class riêng, cần sửa quy tắc trước khi làm tiếp.

## 2. Vai trò

- **Student:** tìm khóa/lớp, đăng ký, thanh toán, xem lịch và nội dung theo quyền, làm bài, nhận phản hồi/chứng chỉ.
- **Mentor:** đăng ký khả năng dạy, nhận hoặc đề nghị slot, xem lịch, quản lý buổi học của lớp được phân công, xác nhận tiền mặt, chấm bài và phản hồi.
- **Admin:** quản lý Course/Unit/Class, phân công mentor, duyệt thay đổi lịch, hỗ trợ học viên và xem giao dịch.
- **Email Service:** gửi xác nhận thanh toán online và thông báo đổi buổi học theo sự kiện nghiệp vụ.
- **System/Timer:** xử lý hết hạn đơn/giữ chỗ; về sau xét điều kiện và tạo chứng chỉ cuối kỳ.

Role **MANAGER** riêng được user yêu cầu bổ sung ngày 2026-10-09 để quản lý/sửa/
duyệt tài liệu chính. Mentor được upload chờ Manager duyệt. Admin vẫn quản trị
users/Course/Class/payment theo baseline; Manager không tự kế thừa các quyền đó.

## 3. Tạo khóa và mở lớp

1. Admin tạo/chọn category, tạo Course ở trạng thái chưa công khai và thêm các Course Unit theo thứ tự.
2. Admin hoàn thiện thông tin rồi kích hoạt Course. Course công khai chỉ xuất hiện khi hợp lệ và có ít nhất một Unit.
3. Admin tạo Class từ Course: chọn ONLINE/OFFLINE, mentor đang hoạt động, sức chứa và khoảng ngày. Hệ thống tạo Class Unit từ các Course Unit trong cùng giao dịch.
4. Admin lập các Class Session, kiểm tra thời gian bắt đầu/kết thúc và lịch mentor; mở Class khi đủ điều kiện.
5. Student có thể xem Course công khai và các Class `OPEN` có thể đăng ký. Các Class đã bắt đầu/kết thúc/hủy vẫn phục vụ trang quản trị hoặc người có quyền, nhưng không còn là lựa chọn mua mặc định.

Vòng đời Class dự kiến: `DRAFT → OPEN → IN_PROGRESS → COMPLETED`, có nhánh `CANCELLED` từ các trạng thái cho phép. Việc chỉnh Course Unit về sau không tự động đổi cấu trúc các Class đã tạo.

## 4. Student đăng ký và thanh toán

```mermaid
flowchart TD
    A[Xem Course và chọn Class ONLINE/OFFLINE] --> B[Thêm Class vào giỏ]
    B --> C[Checkout: chọn CASH hoặc PayOS]
    C --> D[Order PENDING + Enrollment PENDING_PAYMENT + giữ chỗ]
    D -->|PayOS| P[Tạo/mở lại link thanh toán]
    P --> W[Webhook hợp lệ: kiểm tra chữ ký, số tiền, hạn]
    W -->|thành công đúng hạn| X[Order PAID + Enrollment ACTIVE + progress]
    X --> EM[Hàng đợi email xác nhận online]
    D -->|CASH| CP[Chỉ xem preview tiêu đề và lịch học]
    CP --> MC[Mentor được gán xác nhận đã thu đủ tiền]
    MC --> X
    D -->|quá hạn chưa thanh toán| EX[Order EXPIRED; hủy giữ chỗ]
```

### 4.1 Chọn lớp và checkout

- Student có thể xem danh sách Course, chọn Class theo hình thức học rồi thêm vào giỏ. Giá hiển thị trong giỏ chỉ để tham khảo; checkout dùng giá hiện hành do server tính.
- Checkout kiểm tra lại Class đang `OPEN`, sức chứa, việc đã đăng ký/giữ chỗ và giá. Nếu một món không hợp lệ thì không tạo một phần đơn.
- Thanh toán **toàn bộ** số tiền. PayOS tạo một Order cho giỏ; CASH có thể tách thành nhiều Order theo mentor nhận tiền. Mỗi Order có chi tiết/giá chụp tại thời điểm checkout và hạn giữ chỗ.
- Checkout tạo enrollment `PENDING_PAYMENT` để giữ chỗ. Gọi lại checkout khi giỏ trống không tạo thêm Order; Student có thể mở lại Order đang chờ để tiếp tục thanh toán.

### 4.2 PayOS

- Link/QR được tạo sau checkout. Lỗi hoặc timeout ở nhà cung cấp giữ Order `PENDING` để có thể tra cứu và thử lại cùng attempt, không tạo đơn mua trùng.
- Chỉ webhook PayOS đã được xác thực, khớp mã đơn/số tiền và còn hạn mới chuyển Order sang `PAID`, enrollment sang `ACTIVE`, tạo progress cho từng Class Unit trong một giao dịch. Callback lặp không nhân đôi kết quả.
- Trang quay về từ PayOS chỉ **đọc** trạng thái Order từ backend; tham số trên URL không xác nhận thanh toán.
- Thanh toán đến muộn/sai lệch cần Admin đối soát; không tự mở quyền học. Sau khi thành công, email xác nhận online được đưa vào hàng đợi để gửi sau giao dịch.

### 4.3 CASH

- Student được thêm vào Class dưới dạng giữ chỗ nhưng chỉ thấy **tiêu đề Class Unit/Session và thời khóa biểu** để đến lớp offline. Preview không chứa meeting URL, materials, bài tập hoặc nội dung học đầy đủ.
- Chỉ mentor được gán cho Order đó xác nhận đã thu **đủ** tiền, trong hạn. Khi xác nhận, Order thành `PAID`, enrollment thành `ACTIVE` và progress được tạo trong một giao dịch. Thao tác lặp không tạo dữ liệu trùng.
- Flow.txt và sơ đồ yêu cầu Student CASH pending vẫn có group chat/DM mentor. Đây là quyền **dự kiến cho phase Chat**, chưa phải quyền truy cập nội dung học đầy đủ.

### 4.4 Khi đơn hết hạn

Order chưa trả tiền quá hạn chuyển `EXPIRED`; giữ chỗ được hủy và sức chứa được trả lại. Student có thể đăng ký lại nếu Class còn mở/chỗ. Trường hợp tiền thực đã chuyển sau hạn cần xử lý đối soát, không tự kích hoạt lớp.

## 5. Học trong lớp

### 5.1 Mentor và lịch dạy

1. Mentor cập nhật hồ sơ (kinh nghiệm, feedback), môn và thời gian có thể dạy; xem lịch dạy.
2. Có hai cách nhận slot: mentor tự nhận slot đủ điều kiện hoặc Admin phân công. Admin xem log đăng ký và duyệt yêu cầu nhận slot.
3. Phase4 đã chốt: mentor chọn từ ngày–đến ngày và sáng00–12/chiều12–18/tối18–24/
   cả ngày, gửi trước ít nhất hai ngày lịch; Manager/Admin duyệt trước khi đổi lịch.
   Nghỉ buổi chọn buổi bù bằng slot gợi ý hoặc nhập giờ, tránh trùng học viên.
   Nghỉ cả ngày đổi ngày giữ giờ, ghi học viên trùng để quản lý xếp bù lớp khác.
   Sau duyệt hủy source/tạo replacement/gia hạn endDate nếu cần, chỉ cập nhật lịch;
   notification/email tự động để sau, mentor chủ động nhắn học viên.

Các bước tự nhận slot, đăng ký nghỉ và duyệt bù là use case trong nguồn, **chưa được coi là API đã có**.

Trong Phase 2, mentor cần màn hình **lớp được phân công → học viên của lớp → trạng thái Order** để thu tiền mặt. Danh sách lớp lấy theo mentor đang được gán; danh sách học viên chỉ gồm enrollment còn hiệu lực và có thể lọc `CASH`/`PENDING`. Mỗi học viên hiện `orderId`, nhưng nếu một Order mua nhiều Class cùng mentor thì mentor thu **tổng Order**, xác nhận một lần bằng Order đó. Việc đổi mentor của Class không tự đổi mentor đã chụp trong cash order cũ; quyền xác nhận vẫn theo snapshot của Order.

### 5.2 Class → Unit → Session

Mentor được gán vào Class, mở Class Unit rồi quản lý Session. Class có hình thức **ONLINE** (board/compiler trong buổi học) hoặc **OFFLINE**. Theo sơ đồ, quản lý Session gồm dùng/upload materials, giao homework/assignment và điểm danh. DBML hiện đặt `materials.course_unit_id`, còn assignment/attendance gắn với Session; muốn sở hữu material riêng theo Class Unit hoặc Session phải mở rộng mô hình ở Phase 3. Mentor chấm bài và đưa feedback; Q&A theo Class Unit và group chat theo Class.

Material là tài liệu chính của Course Unit, shared qua các Class Unit tham chiếu
cùng Course Unit. Session link tùy chọn chỉ chỉ định sử dụng; Session còn theo
dõi assignment/Q&A/student code riêng. Manager sửa/duyệt tài liệu chung; Mentor
được upload draft, submit chờ duyệt. File READY không thay Manager approval.

Student xem thời khóa biểu cá nhân, Class Unit/Session và tham gia buổi học theo hình thức đã đăng ký. Sau khi có quyền học đầy đủ, Student xem materials, nộp bài, chạy code, xem điểm danh, điểm/feedback và tham gia Q&A/chat. Nội dung phải được kiểm tra theo enrollment/mentor assignment, không chỉ theo role.

### 5.3 Điểm danh theo buổi học

```mermaid
flowchart LR
    S[Class Session] --> R[Danh sách Enrollment của cùng Class]
    R --> M[Mentor hiệu lực của buổi hoặc Manager/Admin ghi điểm danh]
    M --> A[Attendance Record: 1 Enrollment + 1 Session]
    A --> V[Student xem điểm danh của mình]
    A --> C[Cuối kỳ: tính tỷ lệ để xét chứng chỉ]
```

1. Theo quyết định user2026-10-13, mentor hiệu lực của Session bấm Bắt đầu rồi
   điểm danh thủ công ONLINE/OFFLINE; snapshot ACTIVE roster. Manager/Admin có
   quyền phục hồi buổi mentor quên bắt đầu/chốt với lý do và thời gian có chứng cứ.
   Mở điểm danh bất kỳ giờ trong ngày học, không overnight; ngoài ngày chỉ
   quản lý recovery. Manager cũng phục hồi legacy COMPLETED bằng roster có chứng cứ.
2. MVP dùng `UNMARKED`, `PRESENT`, `ABSENT`. Chưa tick trong buổi là Chưa điểm
   danh; Kết thúc/chốt mới chuyển chưa tick thành Vắng. Chưa bắt đầu là trạng
   thái Session riêng. `LATE`/`EXCUSED` trong DBML là scope sau, không auto check-in.
3. Hệ thống phải kiểm tra Enrollment và Session thuộc **cùng Class** trước khi ghi. Khóa duy nhất `(enrollment_id, class_session_id)` ngăn tạo hai kết quả cho cùng một học viên/buổi; sửa kết quả cũ là thao tác cập nhật có kiểm soát, không thêm bản ghi thứ hai.
4. Mentor được giao buổi sửa đến hết ngày kế tiếp của ngày học trên lịch theo
   APP_TIME_ZONE (thứ Ba→00:00 thứ Năm); giờ bấm mở không đổi hạn. Manager/Admin
   sửa bất kỳ lúc nào có reason/audit. Student chỉ own attendance. CASH pending
   chỉ preview lịch, cần activate trước khi admit roster; mentor dạy thay không
   kế thừa cash confirm theo Order snapshot. Enrollment có sau start không bị
   ghi vắng ngược; rời lớp giữ lịch sử snapshot.
5. Manager tìm mentor ACTIVE không trùng lịch primary/substitute và gán dạy
   thay từng buổi, kể cả giữa buổi; đổi mentor chủ nhiệm là command riêng.
   Assignment giữa buổi không reset deadline. Hủy giữ attendance nhưng loại
   mẫu số, buổi bù liên kết original CANCELLED và chỉ replacement đã chốt được
   tính. Không tự ABSENT vì hết giờ, không tự gửi email/notification trong Phase4.
6. Lịch chỉ chiếm interval dự kiến; qua endsAt chưa chốt không giữ slot kế tiếp.
   Completion chặn Session SCHEDULED/IN_PROGRESS và placement bù chưa giải quyết.
7. Manager xếp học viên ACTIVE bị trùng sang một Session của Class khác cùng Course
   Unit, xác nhận nội dung tương đương và sức chứa/lịch hợp lệ. Placement và guest
   attendance riêng, không ghi enrollment ngoại lớp vào attendance_records thường.
   Student có đúng quyền buổi nhận bù; guest result thay source một lần trong rate,
   pending guest loại mẫu số. Không tạo order/enrollment hoặc mở materials lớp nhận.

Plan/flow/API hiện hành: [Phase4](../docs/implement_phase/phase%204/PHASE_4_ATTENDANCE_OPERATIONS.md),
[flow](../docs/api_flow/PHASE_4_FLOW.md), [API dự kiến](../docs/api_flow/PHASE_4_flow-api-breakdown.md).
Nghiệp vụ đã chốt không đồng nghĩa migration/API đã implement hoặc deploy.

**Đối chiếu DBML:** `attendance_records` liên kết `enrollments`, `class_sessions`, tùy chọn `recorded_by → users`; có unique theo Enrollment/Session và index theo Session/status. Bảng hiện không có `updated_at`, người sửa, lý do sửa hoặc liên kết Session gốc–buổi bù. Nếu Phase 4 cần lịch sử chỉnh sửa hoặc tính buổi bù có chứng cứ, phải bổ sung schema; không mặc định DBML hiện có đã hỗ trợ.

### 5.4 Hoàn thành và chứng chỉ

Cuối kỳ, System dự kiến tự tạo chứng chỉ khi Student đạt **tỷ lệ điểm danh ≥ X%** và **điểm bài tập trung bình ≥ Y**; Student có thể xem/tải chứng chỉ. `X`, `Y`, cách tính `LATE`/`EXCUSED`, buổi bù, thời điểm khóa điểm và cách xử lý bản ghi thiếu chưa được nguồn xác định, nên chưa thể coi đây là rule đã chốt. DBML có dữ liệu điểm danh làm đầu vào nhưng chưa mô tả công thức tỷ lệ hay bảng/chức năng cấp chứng chỉ.

## 6. Quyền đọc theo trạng thái

| Trạng thái của Student với Class | Tiêu đề/lịch cơ bản | Nội dung học, materials, bài tập, meeting URL | Ghi chú |
|---|---|---|---|
| Chưa đăng ký | Thông tin Course/Class công khai | Không | Chỉ Class mở bán được đăng ký. |
| CASH `PENDING_PAYMENT`, còn hạn | Có, qua preview giới hạn | Không | Chat/DM pending được để phase Chat. |
| PayOS `PENDING_PAYMENT` | Chỉ thông tin công khai và Order của mình | Không | Chờ webhook đã xác thực. |
| `ACTIVE` sau thanh toán hợp lệ | Có | Có, theo quyền của lớp/buổi | Materials còn phụ thuộc quy tắc mở khóa được chốt ở Phase 3. |
| Order `EXPIRED`/enrollment bị hủy | Thông tin công khai | Không | Tiền về muộn chuyển đối soát. |

## 7. Ranh giới phase và trạng thái hiện tại

Cập nhật scope user2026-10-11: Material chính hỗ trợ bàiARTICLE với HTML lưuBE
đểFE đọc, tài liệuFILE và VIDEO MP4 private MinIO/URL có thời hạn; HLS sau.
Không yêu cầu PDF/DOCX cho bài soạn trênweb. Ảnh/file là MinIO references,
HTML phải sanitize; quyền Course Unit/shared/review/release không đổi.
File-only D6 trong các ghi chú cũ đã được mở rộng có chủđích.
CodeFiles3.2 đã có trênserver theo user; storage/upload thực tế cần nghiệmthu
riêng. [Contract3.3](../docs/implement_phase/phase%203/PHASE_3_3_MATERIAL_MANAGEMENT.md).

| Phần | Phase | Tình trạng theo tài liệu tiến độ hiện có |
|---|---|---|
| Course/Class catalog, giỏ, checkout, giữ chỗ, PayOS BE, CASH preview/mentor confirm | 2 / 2.2 | Đã triển khai và kiểm tra local; bản sửa tạo QR ngày 2026-10-06 còn cần deploy/kiểm chứng trên VPS. Giao dịch PayOS tiền thật và nghiệm thu live chưa có bằng chứng hoàn tất. |
| File và materials | **3** | D1–D6 đã duyệt: tài liệu chính Course Unit shared, Manager quản lý/review, Mentor upload chờ duyệt. Role Manager có migration mới; upload/review/material API chưa triển khai. |
| Điểm danh và truy vấn vận hành | 4 | 4.1 assignment/availability và4.2 regular roster/start/sync/mark/finalize/staff clock recovery implemented/tested local; migrations mới, check328/328, HTTP30/30. Correction/legacy recovery/audit reads4.3 và leave/makeup/guest/Student projections4.4 vẫn planned; chưa deploy. |
| Chat/DM, thông báo | 6 | Chưa triển khai; CASH pending chat là yêu cầu giữ lại. |
| Assignment/chấm bài, board, compiler/judge, chứng chỉ, form tư vấn/gợi ý khóa học | Chưa chốt phase cụ thể | Có trong Flow/use case, không được hiểu là đã hoàn thành. |

**Phạm vi Phase 3 đã duyệt:** upload/lưu trữ file, metadata/lifecycle, Material
chính của Course Unit, Manager quản lý/sửa/duyệt và Mentor upload chờ duyệt;
Student ACTIVE đọc theo release/approval/publication. Không đổi owner sang
Class Unit/Session. Không triển khai điểm danh; giữ quyết định đó cho Phase 4.

## 8. Điểm cần bạn xác nhận trước Phase 3

1. **Đã chốt nơi gắn material:** Course Unit 1–N Material; tài liệu chính shared
   giữa các lớp; Session link optional không đổi owner. Không tự đồng bộ cấu trúc lớp.
2. **Đã chốt quản lý material:** Manager role riêng sửa/quản lý/duyệt; Mentor upload
   và submit chờ Manager duyệt. Approval không phải bước xác nhận thanh toán.
3. **Đã chốt quyền xem:** Student ACTIVE, Class không hủy, Class Unit đã mở/đến giờ,
   Material approved/published/đến giờ, file READY. CASH pending chỉ preview tiêu đề/lịch.
4. **Cách tạo Class:** mỗi Class lấy toàn bộ Course Unit tại thời điểm tạo như hiện tại, hay Admin có thể chọn một phần Course Unit?
5. **Đã chốt Phase4:** nghỉ báo trước hai ngày lịch, Manager/Admin duyệt; bù có thể
   khác tuần và gia hạn endDate tự động. Nghỉ buổi tránh student conflict; nghỉ
   ngày giữ giờ và ghi học viên trùng. Không triển khai email/notification tự động.
6. **Đã chốt Phase4:** ACTIVE roster; pending cần activation/admission hợp lệ,
   không attendance chính thức trước thanh toán; giữ lịch sử khi rời lớp.
7. **Đã chốt Phase4:** effective Session mentor sửa đến hết ngày kế tiếp của ngày học,
   Manager/Admin không deadline có reason/audit; Manager tìm mentor trống và
   phân công thay theo buổi/lớp qua command riêng.
8. **Đã chốt Phase4:** mentor tick thủ công ONLINE/OFFLINE; không auto check-in.
9. **Đã chốt Phase4:** đổi lịch cùng Session nếu chưa start hoặc hủy + replacement
   liên kết; original canceled không mẫu số, thiếu chưa chốt không tự vắng.
   Chi tiết kỹ thuật/cutoff/historical data theo plan Phase4.
10. **Chứng chỉ:** cần chốt `X`, `Y`, cách tính `LATE`/`EXCUSED`, buổi bù và điểm bài tập. Đây là điều kiện cuối kỳ, chưa ảnh hưởng trực tiếp đến Phase 3.

Các điểm1–3 đã được duyệt Phase3;5–9 cùng nghỉ/bù/học bù lớp khác được chốt
trong plan Phase4 ngày2026-10-13. Điểm4 và10 ngoài phạm vi đã chốt giữ ở phase
tương ứng. Phase4 có đăng ký nghỉ có duyệt; email/notification tự động và
chứng chỉ còn hoãn. Quyết định chat mới thay yêu cầu email trước1ngày trong nguồn cũ.
