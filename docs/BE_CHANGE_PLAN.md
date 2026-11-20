# Plan cập nhật BE: khai giảng, dashboard, lịch dạy, materials và chat

Ngày lập: 05/11/2026. Cập nhật: 06/11/2026. Trạng thái: **đã triển khai BE/FE2, nghiệm thu trên PostgreSQL/MinIO test và E2E desktop/mobile; chưa deploy**.

Implementation và evidence: [progress](progress/BE_CHANGE_PROGRESS.md), [flow](api_flow/PHASE_BE_CHANGE_FLOW.md), [API contract hiện hành](api_flow/PHASE_BE_CHANGE_flow-api-breakdown.md). Các mục phía dưới giữ yêu cầu nghiệm thu; không coi source/build là hoàn tất mọi gate DB/storage.

## 1. Phạm vi và cơ sở triển khai

- Triển khai nghiệp vụ và API ở BE; cập nhật contract, proxy và các màn FE liên quan.
- Dashboard hiện có trên `origin/dev`, chưa có trong nhánh BE đang mở khi khảo sát (`Feat/Miro`). Khi triển khai, kế thừa module này để sửa tiếp.
- Quy tắc tối thiểu 3 người áp dụng cho **lớp**, không áp dụng cho khóa học mẫu. Chỉ tính học viên đã thanh toán và có enrollment `ACTIVE`.

## 2. Lịch tuần, ngưỡng 3 học viên và tự khai giảng

### Cấu hình lịch

- Manager chọn ngày bắt đầu và các cặp thứ–slot trong tuần, ví dụ slot 2 vào T2 và T5.
- BE cung cấp danh mục slot dùng chung với FE, tránh mỗi bên định nghĩa giờ khác nhau.
- Thêm API preview lịch và áp dụng lịch theo tuần. Đầu vào gồm ngày bắt đầu, các slot tuần và danh sách buổi theo thứ tự chương trình; BE xếp lần lượt từ ngày bắt đầu trở đi.
- Preview trả từng buổi với ngày giờ cụ thể và các xung đột. Khi lưu phải kiểm tra lại trong transaction.
- Manager được dời khai giảng khi lớp còn `OPEN` và chưa có buổi nào bắt đầu: sinh lại toàn bộ lịch chưa học theo cấu hình tuần, giữ ID, nội dung, tài liệu và thứ tự chương trình; cập nhật ngày bắt đầu/kết thúc lớp.

### Tự chuyển trạng thái

- `DRAFT → OPEN`: mở đăng ký, chưa yêu cầu đủ 3 người; sức chứa lớp phải từ 3 trở lên.
- Mốc khai giảng là giờ bắt đầu buổi đầu tiên trong lịch hiện hành.
- Đến mốc đó, đủ ít nhất 3 học viên hợp lệ thì tự chuyển `OPEN → IN_PROGRESS`. Việc này không tự đánh dấu buổi học đã bắt đầu hay tạo điểm danh.
- Thiếu người thì giữ `OPEN`, tạo cảnh báo bền vững cho manager gồm lớp, giờ khai giảng, số người hiện có và số còn thiếu.
- Sau lần khai giảng bị chặn, không tự mở lớp vì có người thanh toán muộn. Manager phải dời lịch sang mốc mới.
- Worker chạy mỗi 15 giây, xử lý lại khi khởi động và an toàn khi chạy nhiều replica. Quyết định khai giảng dùng dữ liệu thanh toán tại mốc đã lên lịch.
- API start lớp và worker dùng giờ khai giảng đã xếp. Cập nhật 06/11/2026 cho demo: mentor có thể bắt đầu buổi trước giờ trong ngày lịch; lớp OPEN vẫn phải đủ 3 học viên hợp lệ tại thời điểm bắt đầu sớm.
- API lớp bổ sung `minStudents`, `activeStudentCount`, `scheduledStartAt`, `startEligibility` và lý do chưa thể khai giảng.

## 3. Đổi lịch và hoán đổi hai buổi

### Nghỉ cả ngày

BE đã hỗ trợ hai kiểu mapping; FE hiện chỉ cho chọn kiểu giữ giờ cũ. Bổ sung hai lựa chọn rõ ràng:

1. **Đổi ngày, giữ giờ:** chuyển các buổi sang ngày đích với giờ và thời lượng cũ.
2. **Đổi ngày, chọn slot:** chọn ngày và slot riêng cho từng buổi, giữ thời lượng tương ứng.

Cả hai kiểu đều phải:

- Kiểm tra trùng theo ngày giờ thực tế với lớp, mentor, học viên và khoảng nghỉ đã duyệt.
- Kiểm tra lúc gửi đơn và kiểm tra lại lúc manager duyệt.
- Báo `409` kèm buổi và khoảng thời gian xung đột để FE hiển thị.
- Rollback toàn bộ khi có xung đột; không ghi đè, gộp hay xóa buổi T5 đã tồn tại.
- Cho phép hai buổi tiếp giáp nhau; chặn cả trùng toàn phần và trùng một phần.

Trước khi sửa, tái hiện lỗi T2 → T5 bằng integration test, vì source hiện đã có bước kiểm tra xung đột.

### Mentor hoán đổi trực tiếp

- Thêm `POST /mentor/classes/:classId/sessions/swap` (dưới prefix API hiện có).
- Input gồm hai session ID, version dự kiến của cả hai và lý do; yêu cầu `Idempotency-Key`.
- Chỉ cho đổi hai buổi `SCHEDULED`, chưa tới giờ, trong cùng lớp và đều do mentor đang đăng nhập được phân công dạy.
- Hoán đổi cặp `startsAt/endsAt`; giữ nguyên ID, nội dung, tài liệu, số buổi và phân công mentor.
- Hai buổi phải có cùng thời lượng. Giữ quy tắc hiện có: cần xử lý các placement học bù trước khi đổi lịch.
- Lưu cả hai thay đổi trong một transaction, kiểm tra trạng thái lịch cuối cùng, tăng version và ghi audit.
- Không cần manager duyệt. Ví dụ sau hoán đổi: buổi 7 học T5, buổi 8 học T7.

## 4. Dashboard riêng cho manager và mentor

Giữ các endpoint dashboard hiện có và bộ lọc `days=30|90|365`, mặc định 90; tách DTO theo vai trò, không chỉ ẩn dữ liệu trên FE.

| Dashboard | Nội dung |
| --- | --- |
| **Manager** | Tổng thực thu, số đơn đã thanh toán, tiền và số đơn đang chờ thu, CASH/PAYOS, xu hướng thu theo ngày, thu theo khóa/lớp, đơn cần đối soát, cảnh báo lớp thiếu người |
| **Mentor** | Lớp phụ trách chính, học viên trong phạm vi mình dạy, buổi được phân công, buổi dạy thay, buổi đã hoàn thành, giờ dạy thực tế, lịch sắp tới và đơn nghỉ của chính mình |

### Cách tính tài chính

- Thực thu lấy từ order `PAID`, theo `paidAt`; tiền chờ thu là snapshot hiện tại của các đơn `PENDING` chưa hết hạn.
- Tổng tiền dùng VND nguyên. Phân bổ theo lớp/khóa dựa trên giá trị snapshot của `order_details`.
- Đơn nhiều lớp phải được cộng đúng một lần ở tổng thu; tổng chi tiết phải khớp tổng chung.
- Không tính đơn chưa thanh toán, hết hạn hoặc hủy vào thực thu. Đợt này không bổ sung chi phí, lương hay lợi nhuận.

### Giới hạn dữ liệu mentor

- Không trả doanh thu trung tâm, tổng học viên toàn hệ thống hoặc xếp hạng mentor khác.
- Buổi tương lai dùng mentor được phân công thực tế; lịch sử dùng `teachingMentorId` đã ghi nhận.
- Dạy thay chỉ đóng góp phần buổi và học viên thuộc phạm vi được giao, không mở rộng sang toàn bộ dữ liệu lớp của mentor khác.
- Danh tính mentor luôn lấy từ phiên đăng nhập, không nhận `mentorId` tùy ý từ client.

## 5. Materials: UNSEEN, xóa bulk và thu hồi dung lượng

### Theo dõi truy cập

- Thêm `lastSeenAt`, `trackingStartedAt` và cờ `isUnseen` vào materials.
- Chỉ student hoặc mentor mở nội dung thành công mới cập nhật `lastSeenAt` và bỏ cờ. Manager xem để kiểm tra kho không làm thay đổi cờ.
- Không tính việc tải danh sách, prefetch hoặc tải ảnh phụ là một lần xem.
- Bổ sung API ghi nhận mở tài liệu, dùng thời gian server và kiểm tra quyền bằng policy materials hiện có.
- Worker mỗi giờ gắn UNSEEN khi quá 30 ngày kể từ lần xem cuối; nếu chưa từng xem thì tính từ lúc bắt đầu theo dõi.
- Với dữ liệu cũ, bắt đầu theo dõi từ thời điểm migration; không suy đoán lịch sử truy cập chưa được lưu.

### Manager kiểm tra và xóa

- Mở rộng `GET /manager/materials` với bộ lọc UNSEEN, thời điểm xem gần nhất và dung lượng liên quan.
- Thêm `POST /manager/materials/bulk-delete`, tối đa 100 tài liệu/lần; trả kết quả riêng từng tài liệu.
- Gửi revision và snapshot lần xem cùng yêu cầu xóa. Nếu student/mentor vừa mở lại hoặc tài liệu vừa thay đổi thì bỏ qua mục đó và báo manager tải lại.
- Không tự xóa khi đủ 30 ngày; manager chọn và xác nhận danh sách cần xóa.

### Giải phóng storage

API hiện chỉ soft-delete nên cần bổ sung hàng đợi cleanup:

- Sau xóa đơn hoặc bulk, đưa file chính, ảnh inline và attachment liên quan vào hàng đợi kiểm tra.
- Chỉ xóa object khi không còn tham chiếu sử dụng hợp lệ; file dùng chung với tài liệu khác phải được giữ.
- Điều chỉnh trigger bảo vệ file để cho phép cleanup file chỉ còn liên kết với tài liệu đã xóa, đồng thời chặn gắn lại file đang bị dọn.
- Xóa các version và bản sao xử lý liên quan trên storage; lưu tombstone/audit trong DB.
- Job có retry và chạy lại an toàn. Trả riêng dung lượng có thể thu hồi và dung lượng đã thực sự thu hồi, không báo giải phóng ngay sau soft-delete.

## 6. Chat, kiểm thử và bàn giao

### Emoji như Facebook

Chỉ cần FE thêm bảng chọn emoji rồi chèn Unicode vào nội dung tin nhắn. **Không cần API hay bảng DB mới ở BE.** Kiểm thử gửi, sửa, realtime và giới hạn độ dài với emoji tổ hợp. Reactions và sticker nằm ngoài đợt này.

### Preview ảnh

- **Trước khi gửi:** FE preview trực tiếp từ file được chọn bằng object URL; BE không cần xử lý thêm.
- **Sau khi gửi:** FE hiển thị ảnh ngay trong timeline và mở lớn khi click. Mở rộng API `file-access` hiện có với lựa chọn `disposition=inline` cho ảnh; giữ mặc định tải xuống để tương thích.
- Giữ kiểm tra quyền hội thoại, trạng thái file `READY` và signed URL ngắn hạn. FE lấy lại URL khi hết hạn.
- Đồng bộ giới hạn hiện có: ảnh tối đa 5 MiB, PDF tối đa 10 MiB. Chưa tạo thumbnail riêng trong đợt này.

### Các ca nghiệm thu bắt buộc

- Khai giảng với 2/3/4 học viên; thanh toán sát giờ; thiếu người rồi đóng tiền muộn; dời lịch; worker restart và nhiều replica.
- Sinh lịch T2/T5 đúng slot, đúng thứ tự; dời cả lớp giữ nguyên ID và liên kết nội dung.
- T2 → T5 trùng giờ phải bị chặn và giữ nguyên lịch cũ; kiểm tra lại xung đột phát sinh sau khi gửi đơn.
- Swap buổi 7/8 thành công, rollback khi lỗi, sai quyền, stale version và retry không đổi hai lần.
- Dashboard khớp CASH/PAYOS và đơn nhiều lớp; mentor không nhận dữ liệu ngoài phạm vi, kể cả khi dạy thay.
- UNSEEN ở ranh giới 30 ngày; manager xem không bỏ cờ; student/mentor xem có bỏ cờ; bulk-delete gặp lượt xem mới; file dùng chung và cleanup lỗi rồi retry.
- Emoji và preview ảnh trước/sau gửi, URL hết hạn, upload lỗi và quyền truy cập.

### Thứ tự triển khai

1. Lịch tuần và khai giảng.
2. Đổi lịch và swap.
3. Dashboard.
4. Materials và cleanup.
5. Chat.

Cập nhật Swagger, tài liệu luồng API và contract FE cùng từng phần; triển khai migration và BE trước FE. Worker cleanup chỉ bật sau khi kiểm chứng việc bảo vệ file dùng chung trên môi trường thử nghiệm.
