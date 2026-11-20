# Tổng quan nghiệp vụ Backend Mindy — ôn hỏi đáp

Ngày đối chiếu: **22/10/2026**. Phạm vi: source BE trong checkout hiện tại.

Tài liệu phục vụ giải thích nghiệp vụ và trả lời tình huống. “Đã có” nghĩa là có implementation trong source; không đồng nghĩa đã deploy, đã bật cấu hình hoặc nghiệm thu production. Một số README/plan cũ còn khác hiện trạng; tài liệu này ưu tiên controller, service, domain policy và cập nhật mới.

## 1. Giới thiệu app trong một phút

> Mindy là hệ thống quản lý học tập và vận hành trung tâm đào tạo. Trung tâm xây dựng khóa học, chia thành các chương rồi mở các lớp có mentor, sĩ số và lịch học cụ thể. Học viên chọn lớp, đặt mua và thanh toán qua payOS hoặc tiền mặt. Backend giữ chỗ khi chờ thanh toán và chỉ cấp quyền học đầy đủ sau khi thanh toán được xác nhận hợp lệ. Trong quá trình học, hệ thống quản lý tài liệu có kiểm duyệt, lịch giảng dạy, mentor dạy thay, nghỉ dạy và học bù, điểm danh, ghi chú giảng dạy và quiz. Các thao tác quan trọng có kiểm tra quyền, trạng thái, chống xử lý trùng và lưu lịch sử để tra soát.

```text
Khóa học → mở lớp và xếp lịch → học viên đặt mua → giữ chỗ
→ xác nhận thanh toán → kích hoạt đăng ký → học và làm bài
→ điểm danh, theo dõi và xử lý các phát sinh vận hành
```

## 2. Ai dùng hệ thống và được làm gì?

| Tác nhân | Trách nhiệm và phạm vi chính |
|---|---|
| Khách | Xem thông tin công khai, tìm khóa học/lớp, đăng ký/đăng nhập. Không xem nội dung riêng hay link meeting riêng. |
| STUDENT | Mua lớp, xem đơn của mình, học trong lớp có quyền, xem lịch/tài liệu, làm quiz, xem chuyên cần và thông tin buổi học bù của mình. |
| MENTOR | Làm việc trong lớp/buổi được phân công: chuẩn bị tài liệu theo quyền, start/finalize buổi, điểm danh, ghi chú, quản lý quiz và xin nghỉ. |
| MANAGER | Vận hành lớp, xem mentor/học viên/đơn/thanh toán; xác nhận tiền mặt; quản lý/duyệt tài liệu; xử lý phân công, lịch, nghỉ, học bù, điểm danh và correction theo route cho phép. Có route sửa nội dung CourseUnit. |
| ADMIN | Quản trị tài khoản, danh mục/khóa học, tạo và quản lý lớp; đối soát thanh toán, xem tracking và thao tác staff theo quyền endpoint. |

Quyền không chỉ dựa vào role: BE còn kiểm tài khoản hoạt động, ownership, assignment, enrollment và trạng thái tài nguyên.

**ADMIN không mặc định gọi được mọi route MANAGER.** RolesGuard so khớp role trong danh sách của từng route. Ví dụ xác nhận CASH hiện yêu cầu MANAGER; tạo tài khoản/khóa học/lớp thuộc các route ADMIN. Muốn kết luận một action phải xem endpoint cụ thể.

## 3. Phân biệt các khái niệm

| Khái niệm | Ý nghĩa | Ví dụ |
|---|---|---|
| CourseCategory | Phân loại khóa học | Lập trình web |
| Course | Sản phẩm/chương trình đào tạo, có giá | JavaScript cơ bản |
| CourseUnit | Chương trong chương trình | Biến và kiểu dữ liệu |
| Class | Một lần tổ chức khóa học; có mentor, lịch, sĩ số | JS-ON-01 |
| ClassUnit | Chương của lớp, liên kết CourseUnit | Chương Biến của JS-ON-01 |
| ClassSession | Một buổi học cụ thể của lớp/chương | Buổi 23/10, 15:00–17:00 |
| Enrollment | Đăng ký của học viên vào lớp; quyết định quyền học | An đăng ký JS-ON-01 |
| Order / OrderDetail | Đơn mua và từng lớp trong đơn | Đơn mua hai lớp |
| PaymentTransaction | Giao dịch/xác nhận tiền của đơn | payOS hoặc xác nhận CASH |
| Material | Tài liệu thuộc CourseUnit; có revision và kiểm duyệt | PDF, video, bài viết |
| Attendance | Kết quả chuyên cần tại một buổi | PRESENT/ABSENT |
| MakeupPlacement | Xếp một học viên vào buổi lớp khác để bù | An học chương X tại JS-ON-02 |
| Assignment / QuizAttempt | Bài thuộc buổi học và lần làm bài của học viên | Quiz 40 câu của buổi 3 |

Ba điểm quan trọng:

1. **Học viên chọn và mua Class**, giá lấy từ Course tại checkout rồi lưu snapshot.
2. Tạo Class sẽ tạo các ClassUnit từ danh sách chương hiện có. Không suy rằng sửa chương trình mẫu sẽ tự đồng bộ mọi lớp cũ.
3. **Material thuộc CourseUnit; Assignment thuộc ClassSession.** Tài liệu có thể dùng chung theo chương, nhưng quyền đọc vẫn kiểm qua lớp của học viên.

## 4. Đăng ký và đăng nhập

**Email/mật khẩu:** đăng ký học viên → nhận link xác minh → xác minh token hợp lệ → hoàn tất xác minh và tạo phiên. Có gửi lại email xác minh. Đăng nhập các lần sau vẫn kiểm trạng thái tài khoản.

**Google:** BE xử lý đăng nhập/callback; người dùng mới hoàn thiện hồ sơ qua registration intent. Đăng nhập Google không tự cấp role mentor/quản lý.

Access token và refresh token ở cookie HttpOnly; refresh token được luân chuyển khi refresh. Có logout phiên hiện tại và logout tất cả phiên. FE ẩn nút không thay thế kiểm tra quyền ở server.

Chi tiết: [Identity flow](PHASE_1_FLOW.md).

## 5. Khóa học, lớp và lịch học

### Luồng mở lớp

1. Admin tạo danh mục, Course, giá và CourseUnit.
2. Tạo Class từ Course đang hoạt động, chọn mentor hợp lệ, sĩ số, khoảng ngày và ONLINE/OFFLINE.
3. Class ban đầu DRAFT, có các ClassUnit tương ứng.
4. Xếp ClassSession vào chương, kiểm thời gian, khoảng ngày và các xung đột liên quan.
5. Chuyển OPEN để nhận đăng ký.

```text
DRAFT → OPEN → IN_PROGRESS → COMPLETED
   └─────┴─────────┴──────→ CANCELLED
```

COMPLETED/CANCELLED là trạng thái kết thúc; không tùy ý mở lại bằng cập nhật thông thường.

### Quy tắc dễ bị hỏi

- Mua được khi Course hoạt động, Class OPEN và chưa qua endDate theo ngày nghiệp vụ, đồng thời còn chỗ và không trùng đăng ký hiệu lực.
- Không nói “chỉ mua được trước khai giảng”: source kiểm OPEN/endDate, không chỉ startDate.
- Sau DRAFT, startDate/endDate/maxStudents/deliveryMode bị đóng với API cập nhật thông thường. Gia hạn do lịch bù có flow riêng.
- Đổi mentor phải dùng nghiệp vụ phân công có audit, không sửa mentorId tùy ý qua cập nhật lớp.
- Không xếp buổi qua đêm; kiểm theo APP_TIME_ZONE, mặc định Asia/Ho_Chi_Minh. Hai buổi tiếp giáp đúng giờ kết thúc/bắt đầu không nhất thiết là trùng.
- Hủy Class đồng thời hủy các buổi SCHEDULED/IN_PROGRESS liên quan. **Không tự hoàn tiền khi hủy lớp.**

## 6. Giỏ hàng, checkout và giữ chỗ

1. Student thêm Class vào giỏ; tối đa 20 mục.
2. Checkout đọc lại giá server và kiểm điều kiện của tất cả lớp.
3. BE khóa dữ liệu cần thiết để kiểm capacity khi nhiều người mua đồng thời.
4. Trong cùng transaction tạo Order PENDING, OrderDetail có giá snapshot, Enrollment PENDING_PAYMENT để giữ chỗ và xử lý giỏ theo checkout.
5. Một mục không hợp lệ khiến toàn bộ checkout rollback.

**Thêm giỏ chưa giữ chỗ; checkout mới giữ chỗ. Checkout chưa có nghĩa đã trả tiền hay đã được học đầy đủ.**

| Thanh toán | Cách chia đơn | Hold mặc định |
|---|---|---|
| PAYOS | Một đơn cho toàn bộ giỏ | 15 phút |
| CASH | Chia theo nhóm mentor snapshot | 48 giờ |

TTL là mặc định cấu hình, môi trường thực tế có thể đổi. CASH vẫn nhóm đơn theo mentor, nhưng **Manager bất kỳ hợp lệ được thu/xác nhận**, không yêu cầu được gán lớp.

Capacity tính các enrollment chiếm chỗ và reservation học bù theo policy, không chỉ đếm ACTIVE. Hold hết hạn được expiry xử lý để giải phóng chỗ; mua lại phải kiểm tra lại.

| Đối tượng | Trạng thái hiện có | Ý nghĩa |
|---|---|---|
| Order | PENDING, PAID, EXPIRED, CANCELLED | Tình trạng đơn |
| Enrollment | PENDING_PAYMENT, ACTIVE, COMPLETED, CANCELLED | Tình trạng đăng ký học |
| PaymentTransaction | CREATING, PENDING, SUCCEEDED, REQUIRES_REVIEW | Tình trạng giao dịch/tra soát |

PAID, SUCCEEDED và ACTIVE là ba trạng thái của ba đối tượng, cần cập nhật nhất quán khi xác nhận tiền.

## 7. Thanh toán và mở quyền

### payOS

Student yêu cầu link cho đơn của mình → BE lấy số tiền từ đơn và gọi provider → học viên thanh toán → BE nhận webhook, xác minh và đối chiếu định danh/số tiền/trạng thái/hold → settlement hợp lệ.

Settlement ghi payment SUCCEEDED, đơn PAID, kích hoạt **hold hiện hữu** thành ACTIVE, tạo progress và email outbox trong cùng transaction. Worker gửi email sau commit.

**Redirect về trang thành công không phải bằng chứng đã thanh toán.** Quyền học chỉ mở sau kết quả được BE xác minh, đối chiếu và commit.

- Webhook trùng không được tạo lại đăng ký hoặc xử lý thành công trùng.
- Sai số tiền, tiền đến sau hạn hoặc không đủ điều kiện có thể chuyển REQUIRES_REVIEW; không mở quyền chỉ vì thấy callback.
- Admin có reconciliation để tra soát với provider.
- Có cờ bật payOS và cờ riêng cho tạo link. Dừng tạo link mới vẫn phải nhận callback link cũ.
- Không gọi provider/SMTP trong transaction đang giữ dữ liệu nghiệp vụ.

### Tiền mặt

Checkout CASH → hold còn hạn → Student chỉ có CASH_PREVIEW → Manager đang hoạt động xác nhận nhận **đúng toàn bộ tiền đơn** → BE kiểm đơn/lớp/hold và ghi payment SUCCEEDED, đơn PAID, enrollment ACTIVE cùng transaction.

Không có thu một phần/trả góp trong flow này. Gọi xác nhận lại đơn đã thu hợp lệ không tạo thêm giao dịch/enrollment. Đơn đóng/hết hạn hoặc lớp bị hủy không được xác nhận như bình thường.

## 8. Quyền học và tài liệu

| accessMode | Điều kiện/phạm vi |
|---|---|
| FULL | Enrollment ACTIVE và đủ kiểm tra hiện hành; nội dung lớp, lịch và meeting context/tài liệu theo quyền |
| CASH_PREVIEW | Hold CASH còn hạn; xem tiêu đề/chương, lịch và phòng theo DTO; không có nội dung riêng/file/link meeting |
| SESSION_MAKEUP | Placement của chính mình; context đúng một buổi nhận học bù |
| NONE | Không có quyền học hiện tại; một số API vẫn cho đọc metadata/lịch sử |

**Ngày 22/10 đã bỏ khóa/mở/hẹn giờ từng ClassUnit.** ACTIVE không cần mentor mở chương. Các cột legacy còn tồn tại không phải cổng kiểm quyền hiện hành.

Tuy nhiên, ACTIVE không cho đọc mọi tài liệu: phải đúng lớp/chương, lớp không hủy, tài liệu chưa xóa, bản duyệt đúng revision, đã công bố, đến availableAt và nội dung/file READY.

### Kiểm duyệt tài liệu

```text
DRAFT → PENDING_REVIEW → APPROVED hoặc REJECTED
```

- Mentor chính tạo/sửa draft của mình trong đúng scope. Sau lần duyệt đầu không còn được tự sửa như draft riêng ban đầu.
- Manager quản lý, duyệt/từ chối, chỉnh sửa, công bố/thu hồi. Từ chối cần lý do.
- APPROVE hiện đồng thời ghi publishedAt; vẫn có PUBLISH/UNPUBLISH để quản lý công bố.
- Sửa nội dung tăng revision, đưa về DRAFT và bỏ hiệu lực duyệt/công bố; bản mới không hưởng phê duyệt của bản cũ.
- Material thuộc CourseUnit; sửa hoặc thu hồi có thể ảnh hưởng nhiều lớp cùng dùng chương đó.

### File

Tạo upload intent có scope → client upload tới storage → complete → job kiểm binary/nội dung → READY hoặc FAILED. Upload xong chưa có nghĩa được sử dụng ngay.

Storage riêng tư; BE kiểm loại, kích thước, nội dung thay vì chỉ tin tên file. Tải/xem bằng signed URL có hạn sau kiểm quyền. Bài viết HTML được làm sạch theo policy.

Chi tiết: [Quyền chương hiện hành](CLASS_UNIT_ACCESS.md), [Material management](PHASE_3_3_FLOW.md), [Student material access](PHASE_3_4_FLOW.md).

## 9. Mentor chính, dạy thay và ghi chú

Mentor chính có scope đọc toàn lớp theo policy. Mentor thay chỉ được class shell, chương/buổi liên quan, tài liệu công bố và roster tối thiểu cần cho buổi được giao. Không tự có quyền toàn bộ học viên/thanh toán/draft của người khác.

Buổi SCHEDULED lấy mentor override nếu có, nếu không lấy mentor lớp. Khi start, BE lưu teachingMentorId để giữ người thực dạy. Buổi đã bắt đầu/kết thúc dùng snapshot; dữ liệu legacy thiếu snapshot không tự suy ra người đã dạy.

Ghi chú giảng dạy là thông tin nội bộ theo session. Mentor hiệu lực ghi khi IN_PROGRESS/COMPLETED trong hạn sửa, có version và idempotency key. Staff correction có route/lý do/audit riêng. Student không đọc ghi chú nội bộ.

Stored progress khác attendance. Hiện có đọc progress đã lưu, nhưng **chưa có policy hoàn thành tổng thể, tự tính phần trăm toàn lớp hoặc chứng chỉ**. Thiếu progress là UNTRACKED/unknown, không tự coi là 0%.

Chi tiết: [Mentor workspace](PHASE_4_6_FLOW.md), [Meeting theo buổi](MENTOR_SESSION_MEETING.md).

## 10. Điểm danh và chuyên cần

1. Trước start có attendance candidates để preview, chưa ghi điểm danh.
2. Start kiểm quyền/điều kiện, chuyển SCHEDULED → IN_PROGRESS; lưu thời gian thực, mentor thực dạy, hạn sửa và roster snapshot.
3. Đánh dấu PRESENT/ABSENT; record chưa đánh dấu là UNMARKED. Có cập nhật hàng loạt.
4. Có sync roster để đưa học viên mới đủ điều kiện vào theo policy; preview trước đó không cố định roster.
5. Finalize chuyển COMPLETED, ghi giờ kết thúc và chuyển các UNMARKED còn lại thành ABSENT.
6. Sửa sau đó theo quyền/trạng thái/hạn sửa hoặc staff correction/recovery; có lịch sử.

Mentor start theo **ngày dạy của buổi** trong timezone nghiệp vụ; qua startsAt không có nghĩa BE tự start. Hạn sửa là 00:00 sau ngày kế tiếp ngày học: học 23/10 thì hạn là 00:00 ngày 25/10, chỉ sửa khi thời điểm hiện tại nhỏ hơn hạn. Không phải 48 giờ từ lúc bấm start.

Các điểm cần nhớ:

- Chưa thanh toán không tự tính như học viên đủ điều kiện. CASH xác nhận muộn có rule bằng chứng riêng; không tùy ý gán ngược mọi buổi.
- Buổi chưa bắt đầu/bị hủy, thiếu dữ liệu legacy hoặc đang chờ học bù không tự là ABSENT.
- Recovery cần bằng chứng hợp lệ, gồm quan hệ enrollment/thanh toán khi policy yêu cầu; không tự dựng người dạy hay thời gian quá khứ.
- Physical attendance là kết quả tại buổi thực học; credited attendance là kết quả tính về nghĩa vụ học gốc.
- Tỷ lệ = PRESENT / (PRESENT + ABSENT) × 100, trên credit đủ điều kiện đã chốt. Mẫu số 0 trả null; UNMARKED/excluded/makeupPending báo riêng.

Ví dụ: 8 PRESENT + 2 ABSENT + 1 makeup pending → tỷ lệ đã chốt 80%, đồng thời báo 1 buổi chờ bù; không âm thầm tính buổi chờ là vắng.

Chi tiết: [Điểm danh](PHASE_4_2_FLOW.md), [Correction/recovery](PHASE_4_3_FLOW.md), [Bulk attendance](ATTENDANCE_BULK.md).

## 11. Nghỉ dạy, đổi lịch và học bù

### Nghỉ dạy có duyệt

Mentor preview khoảng nghỉ và các buổi ảnh hưởng → xem slot/lập phương án bù → tạo đơn PENDING → staff APPROVE/REJECT; mentor withdraw khi còn phù hợp.

Khi duyệt, BE kiểm lại quyền, version, buổi nguồn, lịch mentor, khoảng nghỉ, phương án bù và conflicts. Preview không bảo đảm duyệt được nếu lịch đã đổi. Đơn có thể EXPIRED khi đã tới thời điểm buổi nguồn theo rule.

Duyệt thành công hủy buổi nguồn, tạo replacement, lưu khoảng nghỉ được duyệt, gia hạn lớp nếu cần và ghi audit cùng transaction. Xung đột lịch học viên cần acknowledgment theo policy; giữ đăng ký/thanh toán và ghi conflict cho Manager xử lý.

### Hai nghĩa của học bù

| Loại | Ý nghĩa | Ví dụ |
|---|---|---|
| Replacement session | Thay buổi lớp bị hủy | Cả lớp chuyển thứ Ba sang thứ Năm |
| Cross-class placement | Xếp một học viên sang đúng buổi lớp khác | An trùng lịch replacement nên học cùng chương ở JS-02 |

Replacement giữ chuỗi tuyến tính: buổi gốc bị hủy → bù 1 → nếu tiếp tục hủy thì bù 2. Không tạo nhiều nhánh từ source cũ; không copy điểm danh/giờ thực tế sang buổi mới.

Cross-class placement: conflict queue → candidate cùng CourseUnit, khác Class, không trùng, còn chỗ → staff xác nhận với lý do/version/key → giữ chỗ đúng session → Student thấy context của mình → mentor lớp nhận điểm danh guest → finalize và tính credit về nghĩa vụ lớp gốc.

**Placement không tạo enrollment đầy đủ ở lớp nhận**, không mở mọi tài liệu/danh sách học viên. Credit hợp lệ tính một lần về source, không tăng tỷ lệ enrollment lớp nhận. Buổi nhận hủy thì cần xếp lại; không tự tính vắng/hoàn thành.

Chi tiết: [Flow nghỉ/học bù](PHASE_4_4_FLOW.md). File này giữ cả log lịch sử; đoạn cũ “leave chưa implement” đã được thay thế bởi implementation trong source hiện tại.

## 12. Bài tập và quiz

### Phần hiện đã có: QUIZ

- Assignment thuộc ClassSession. Purpose TEST/HOMEWORK độc lập với type QUIZ/ZIP.
- Mentor chính hoặc mentor thay trong scope tạo draft, sửa câu hỏi ABCD một đáp án đúng, publish/archive.
- 1–200 câu; publish đóng băng nội dung/cấu hình.
- Student cần ACTIVE và đủ quyền hiện hành. CASH preview/guest makeup không cấp quyền làm assignment lớp nhận.
- Một lượt chính thức; start lại là resume, không thêm lượt hoặc đặt lại đồng hồ.
- Timer tùy chọn 1–240 phút và deadline tuyệt đối dueAt tùy chọn. Hạn lấy mốc sớm hơn trong các giới hạn có cấu hình; không có cả hai là untimed.
- Autosave lưu toàn bộ lựa chọn có version; chưa chấm/chưa lộ đáp án.
- Nộp tay phải đủ toàn đề, mỗi câu một lần. BE chấm và trả kết quả/đáp án sau commit.
- Đến hạn, nộp tay bị từ chối; worker chấm lựa chọn đã lưu, câu trống sai. Có thể thấy FINALIZING trước khi commit kết quả.
- Điểm chia đều, làm tròn cuối: đúng 33/40 với thang 100 → 82,50.
- Revoke/archive/hủy buổi hoặc lớp được kiểm lại; lượt đang làm có thể VOIDED. Kết quả đã chấm của chính học viên có luồng đọc lịch sử khi tài khoản đủ điều kiện.

### Phần chưa hoàn thiện

ZIP chỉ có metadata draft; **publish ZIP bị chặn**. Chưa có student upload/nộp ZIP, mentor chấm ZIP, sửa/phát hành điểm ZIP. Chưa đầy đủ submission queue, thống kê assignment toàn lớp và student history-list; assignmentSummary vẫn NOT_IMPLEMENTED. Không có compiler/judge chạy code trong phạm vi này.

Chi tiết: [Assignment flow hiện hành](PHASE_5_FLOW.md).

## 13. Cơ chế bảo vệ nghiệp vụ

| Cơ chế | Mục đích | Ví dụ |
|---|---|---|
| Transaction | Cùng thành công hoặc cùng thất bại | Settlement cập nhật tiền, đơn, đăng ký nhất quán |
| Khóa/ràng buộc DB | Chống sai khi đồng thời | Hai người mua chỗ cuối |
| expectedVersion/revision | Chống quyết định trên dữ liệu cũ | Duyệt đơn sau khi lịch đã đổi |
| Idempotency | Retry không nhân đôi thao tác | Webhook/start/submit gửi lại |
| Audit | Biết ai làm gì, lúc nào, vì sao | Đổi lịch/sửa điểm danh/đổi mentor |
| Job/outbox | Xử lý bất đồng bộ, retry được | Email, kiểm file, timeout quiz |

Áp dụng theo từng nghiệp vụ, không phải mọi route có cùng key/contract. Có idempotency vẫn phải kiểm quyền hiện hành trước replay ở các luồng có rule đó.

Admin tracking xem các audit BE có ghi. Không phải log mọi HTTP request/mọi CRUD. Audit chỉ có action/ID không tự dựng được trước/sau; không suy rằng mọi nội dung nội bộ đều công khai.

## 14. Câu hỏi tình huống thường gặp

| Câu hỏi | Trả lời ngắn |
|---|---|
| App giải quyết việc gì? | Vòng đời đào tạo từ mở/bán lớp và thu tiền tới học tập, chuyên cần và xử lý phát sinh. |
| Course khác Class? | Chương trình/sản phẩm khác một lần tổ chức có mentor, lịch, sĩ số. |
| Mua Course hay Class? | Mua Class; giá từ Course lúc checkout, lưu snapshot. |
| Thêm giỏ đã giữ chỗ? | Chưa; checkout mới tạo hold PENDING_PAYMENT. |
| Tin giá/tổng tiền FE gửi không? | Không; BE tự đọc và tính. |
| Hai người mua chỗ cuối? | Khóa, transaction và kiểm capacity bảo vệ không vượt chỗ. |
| Có đăng ký trùng cùng lớp? | BE kiểm enrollment/hold hiệu lực và có ràng buộc bảo vệ. |
| Checkout xong học ngay? | Chưa; phải thanh toán được xác nhận và ACTIVE. |
| FE báo thành công nhưng chưa mở quyền? | Refetch trạng thái BE, kiểm webhook/settlement/tra soát; redirect không xác nhận tiền. |
| Webhook gửi nhiều lần? | Không tạo lại đăng ký hoặc ghi nhận thành công trùng. |
| Tiền sai hoặc tới sau hạn? | Kiểm tra/REQUIRES_REVIEW theo nhánh; không tự kích hoạt. |
| Ai xác nhận CASH? | Manager active, không cần gán lớp; đúng toàn bộ tiền. |
| Admin gọi mọi API Manager? | Không; theo danh sách role từng endpoint. |
| Chờ CASH tải PDF/Meet được? | Không; preview giới hạn. |
| Mentor phải mở từng chương? | Không còn rule này; ACTIVE đọc material đủ duyệt/công bố/điều kiện. |
| Sửa tài liệu đã duyệt hiện ngay? | Không; revision mới mất hiệu lực duyệt/công bố. |
| Dạy thay có toàn quyền lớp? | Không; theo scope buổi/chương và action được phép. |
| Đổi mentor lớp đổi lịch sử người dạy? | Không tự ghi đè teachingMentorId đã snapshot. |
| Chưa đánh dấu là vắng? | Đang học là UNMARKED; finalize mới chuyển record còn lại thành ABSENT. Thiếu record không tự là vắng. |
| Nghỉ/hủy buổi có mất lịch sử? | Không; giữ source, replacement ancestry và audit. |
| Học bù thành học viên lớp nhận? | Không; placement chỉ cấp quyền đúng session. |
| Credit bù tính về đâu? | Một lần về nghĩa vụ lớp gốc khi hợp lệ. |
| Hủy lớp tự hoàn tiền? | Không có cơ chế tự hoàn tiền được bảo đảm trong flow hiện tại. |
| Chọn đáp án là biết đúng/sai? | Không; autosave chưa chấm, kết quả sau final grading commit. |
| Mất mạng làm quiz? | Resume lượt cũ; timeout chỉ chấm đáp án đã lưu. |
| Nộp/chấm ZIP có chưa? | Chưa; draft metadata có, publish bị chặn. |
| Điểm danh đủ tự có chứng chỉ? | Chưa có policy đó; attendance khác stored progress. |
| Có code tức production có rồi? | Không; phụ thuộc migration/deploy/cấu hình/nghiệm thu. |

## 15. Kịch bản để kể xuyên suốt

Ví dụ minh họa, không phải dữ liệu hay giao dịch thực:

1. Course JavaScript giá 2 triệu, có chương A/B/C. Admin mở lớp JS-01, mentor M, sĩ số 20, tạo lịch rồi mở bán.
2. An checkout payOS, BE giữ một chỗ và tạo đơn PENDING; chưa full access.
3. Webhook được xác minh, settlement commit: payment SUCCEEDED, đơn PAID, enrollment ACTIVE; email qua outbox.
4. An xem lịch, meeting qua context được cấp quyền và material đã duyệt; không đợi mở chương.
5. M start buổi, snapshot người dạy/roster, đánh dấu An PRESENT rồi finalize.
6. M xin nghỉ buổi khác và đề xuất lịch bù. Staff duyệt sau kiểm tra; BE hủy source, tạo replacement, giữ lịch sử.
7. An trùng lịch replacement, được staff xếp học cùng CourseUnit tại JS-02 còn chỗ; chỉ có context buổi nhận.
8. Mentor lớp nhận điểm danh guest/finalize; credit tính một lần về JS-01.
9. An làm quiz trong lớp có enrollment: lưu lựa chọn, nộp toàn đề, BE chấm và trả kết quả. Không suy kết quả thành chứng chỉ/hoàn thành khóa.

## 16. Nguồn đối chiếu và giới hạn

Lượt này chỉ đọc source và viết tài liệu; không đổi code/API, không chạy lại runtime tests, migration, provider hay deploy. Evidence test trước đó nằm trong progress từng phase.

- [RolesGuard](../../src/modules/auth/guards/roles.guard.ts), [role enum](../../src/modules/users/user-role.enum.ts), [auth controller](../../src/modules/auth/auth.controller.ts).
- [Class lifecycle](../../src/modules/classes/domain/class-lifecycle.ts), [class offers](../../src/modules/classes/services/class-offers.service.ts), [class commands](../../src/modules/classes/services/classes.service.ts).
- [Checkout plan](../../src/modules/commerce/domain/checkout-plan.ts), [checkout service](../../src/modules/commerce/services/checkout.service.ts), [TTL/timezone config](../../src/config/environment.schema.ts).
- [Cash service](../../src/modules/payments/services/cash-payments.service.ts), [payment settlement](../../src/modules/payments/services/payment-settlement.service.ts).
- [Material access](../../src/modules/materials/domain/material-access.ts), [material review](../../src/modules/materials/domain/material-review.ts).
- [Attendance service](../../src/modules/attendance/services/attendance.service.ts), [credit policy](../../src/modules/attendance/domain/attendance-credit.ts), [calendar/deadline](../../src/modules/classes/domain/class-calendar.ts).
- [Mentor leave](../../src/modules/teaching-operations/services/mentor-leave.service.ts), [mentor workspace flow](PHASE_4_6_FLOW.md), [quiz progress](../progress/phase%205/PHASE_5_PROGRESS.md).

**Ôn trong 20 phút:** mục 1–3 để nắm mô hình; 6–8 để nắm tiền/quyền; 10–12 để nắm vận hành; tự trả lời mục 14 rồi kể lại mục 15 bằng lời mình.
