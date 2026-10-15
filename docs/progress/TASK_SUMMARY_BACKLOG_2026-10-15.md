# Tổng hợp công việc và việc để làm sau — 15/10/2026

Đã đối chiếu mã nguồn, tác giả commit, lịch sử gộp nhánh và tài liệu tiến độ của BE/FE sau `git fetch --all --prune`.

## Người thực hiện

| Tên | Tài khoản trong git |
| --- | --- |
| Huy | nhathuyck1 / hajimekoito; tên tác giả cũ: Tên GitHub mớiHzmkoito |
| Bảo | Bero |
| Hào | winsonLuong |
| Quốc Anh | Quanhpm / Phạm Quốc Anh |

Người gộp nhánh có thể khác người viết chức năng. Một việc có nhiều người tham gia thì ghi người làm chính và nêu phần phối hợp.

## Tiến độ theo phần việc

| Phần việc | Người làm | Kết quả và việc còn lại |
| --- | --- | --- |
| Nền tảng và tài khoản — Phase 0/1 | Huy; Bảo bổ sung kiểm tra tự động | Đã có môi trường chạy, đăng nhập, đăng ký và Google. Còn nghiệm thu khôi phục dữ liệu, bảo mật và dịch vụ bên ngoài. |
| Khóa học, lớp, giỏ đăng ký — Phase 2 | Bảo; Huy bổ sung ảnh/dữ liệu mẫu | Đã có từ xem khóa học đến tạo đơn và giữ chỗ. Chưa tự trả chỗ đang giữ khi hủy lớp. |
| Thanh toán — Phase 2.1/2.2 | Huy | Đã có PayOS, xác nhận tiền mặt, mở quyền học và đối soát. Còn kiểm tra tiền thật, email bên ngoài và các mục nghiệm thu còn mở. |
| Lớp đã đăng ký và lịch cá nhân — Phase 2.3 | Bảo; Huy tích hợp | BE đã có danh sách lớp và lịch. FE chưa tích hợp danh sách/lịch cá nhân; đọc và cập nhật tiến độ học còn thiếu. |
| Quyền truy cập tài liệu — Phase 3.1 | Huy | Đã có quy tắc phân quyền và kiểm tra tại máy. |
| Tải file — Phase 3.2 | Huy | Đã chốt nghiệm thu máy chủ theo xác nhận user ngày 12/10; có bằng chứng PDF/MP4 sẵn sàng và file riêng tư. |
| Tạo và sửa tài liệu — Phase 3.3.1 | Bảo | Đã có bản nháp tài liệu chữ, file và video; đã kiểm tra tại máy. |
| Giảng viên gửi tài liệu để duyệt — Phase 3.3.2 | Bảo | Đã có chức năng gửi tài liệu và kiểm tra quyền người gửi. |
| Quản lý duyệt và rút tài liệu — Phase 3.3.3 | Bảo | Đã có duyệt, từ chối, rút tài liệu và lưu lịch sử. |
| Mở học phần cho từng lớp — Phase 3.3.4 | Bảo | Đã có chức năng mở học phần và lưu người thực hiện. |
| Kiểm tra và bàn giao phần quản lý tài liệu — Phase 3.3.5 | Bảo | Đã chuẩn bị bộ kiểm tra và hướng dẫn bàn giao; còn nghiệm thu trên máy chủ. |
| Học viên đọc tài liệu; nhân viên xem trước — Phase 3.4 | Huy làm nền đọc file; Bảo bổ sung nội dung và xem trước | Đã có code và kiểm tra tại máy. Còn kiểm tra trên máy chủ/trình duyệt và tích hợp FE. |
| Xử lý thông tin file và dọn file — Phase 3.5 | Chưa xác nhận phân công | Chưa triển khai đầy đủ phần trích thông tin, thử lại, lưu giữ và dọn file. |
| Nghiệm thu toàn bộ tài liệu — Phase 3.6 | Chưa xác nhận phân công | Chưa nghiệm thu toàn bộ quy trình; kiểm tra tại máy đã có từ các phần trước. |
| Phân công và dạy thay — Phase 4.1 | Huy | Đã có chức năng và kiểm tra tại máy; nghỉ có duyệt và giao diện học viên còn ở 4.4. |
| Bắt đầu buổi học và điểm danh — Phase 4.2 | Huy | Đã có danh sách điểm danh, ghi nhận và chốt buổi. |
| Sửa điểm danh và xem lịch sử — Phase 4.3 | Huy | **Đã đưa lên server và thử toàn bộ bằng Postman theo xác nhận trực tiếp của user ngày 15/10/2026.** |
| Nghỉ, học bù và lịch/điểm danh của học viên — Phase 4.4a–c | Chưa xác nhận phân công | Chưa triển khai; không thuộc phần 4.3 user vừa xác nhận hoàn thành. |
| Nghiệm thu tích hợp điểm danh — Phase 4.5 | Chưa xác nhận phân công | Còn kiểm tra các phần 4.4 và quy trình qua giao diện; không liệt kê lại deploy/Postman 4.3 là việc chưa làm. |
| Chuẩn bị vận hành chính thức — Phase 5 | Huy + Bảo | Đã có đóng gói, triển khai, sao lưu và kiểm tra nâng cấp. Chưa đóng nghiệm thu vận hành tổng thể. |
| Chat/thông báo, bảng tương tác, bài tập và chấm mã | Chưa xác nhận phân công | Chưa triển khai các chức năng theo lớp. Công cụ chạy mã thử độc lập trên FE đã có. |

## Nhiệm vụ chưa làm để tiếp tục sau

Các mục dưới đây là phần chức năng chưa triển khai, không phải danh sách mọi việc chưa nghiệm thu.

- [ ] Khi hủy lớp, trả lại những chỗ học viên đang giữ và xử lý đơn liên quan (`BE-P2-10`).
- [ ] Trích thông tin file sau tải lên; thử lại khi lỗi; dọn file hết hạn và file không còn sử dụng — Phase 3.5.
- [ ] Cho giảng viên xin nghỉ, quản lý duyệt và sắp xếp buổi thay thế — Phase 4.4a.
- [ ] Xử lý hủy buổi, liên kết buổi học bù và gia hạn lịch lớp khi cần — Phase 4.4a.
- [ ] Cho học viên học bù ở lớp khác, kiểm tra trùng lịch và chỉ tính điểm danh một lần — Phase 4.4b.
- [ ] Cho học viên xem giảng viên thực tế, lịch sử và tổng hợp điểm danh; bổ sung danh sách việc cần xử lý — Phase 4.4c.
- [ ] Làm giao diện danh sách lớp đã đăng ký, lịch cá nhân và tiến độ học (`FE-P22-05`). BE đã có danh sách/lịch; chức năng đọc/cập nhật tiến độ còn thiếu.
- [ ] Làm giao diện tải lên, tạo, duyệt và đọc tài liệu (`FE-P3-01`). Trang tài liệu của quản lý hiện mới là trang chờ bổ sung.
- [ ] Làm giao diện phân công, điểm danh, sửa điểm danh và xem lịch sử (`FE-P4-01`). BE 4.3 đã lên máy chủ theo xác nhận user.
- [ ] Làm chức năng sửa/xóa học phần và buổi học (`FE-P2-14`); chờ thống nhất chức năng BE.
- [ ] Làm chat và thông báo, gồm trao đổi khi đơn tiền mặt còn chờ — Phase 6.
- [ ] Làm bảng tương tác trong lớp — BE/FE Whiteboard.
- [ ] Làm giao bài, nộp bài và chấm điểm theo lớp — BE/FE Assignment.
- [ ] Làm chấm bài lập trình theo đề — BE Compiler/Judge và FE liên quan.

## Việc đã có một phần, còn kiểm tra hoặc bàn giao

- [ ] Thử khôi phục dữ liệu từ bản sao lưu; kiểm tra danh sách bên trong file sao lưu chưa chứng minh khôi phục thành công (`BE-P0-04`).
- [ ] Hoàn thiện giới hạn lượt gọi, bảo vệ đăng nhập và nghiệm thu bảo mật Phase 1 (`BE-P1-05`).
- [ ] Kiểm tra Google thật và gửi/nhận email qua dịch vụ bên ngoài (`FE-P1-05`, `FE-P1-06`).
- [ ] Hoàn tất các yêu cầu còn thiếu về tốc độ và độ ổn định của bộ nhận thử thanh toán (`BE-P21-04`).
- [ ] Kiểm tra PayOS bằng tiền thật: đơn đã trả tiền, quyền vào học và email xác nhận (`BE-P22-08`, `FE-QA-05`). Không suy từ test điểm danh 4.3 sang test thanh toán.
- [ ] Nghiệm thu quản lý/đọc tài liệu 3.3–3.4 trên máy chủ, trình duyệt và FE; kiểm tra đọc PDF, tua video, tải lại và hết hạn truy cập.
- [ ] Nghiệm thu toàn bộ tài liệu — Phase 3.6. Bảo đã có bộ kiểm tra và bàn giao tại máy, nên không coi mọi việc kiểm thử là chưa bắt đầu.
- [ ] Nghiệm thu tích hợp Phase 4.5 sau 4.4 và giao diện. **Phần server/Postman 4.3 đã xong theo user.**
- [ ] Nghiệm thu vận hành và phát hành đầy đủ BE/FE — Phase 5 (`BE-P5-01`, `FE-P5-01`).

## Dấu mốc git để tra lại

| Repo | Nhánh đã fetch | Dấu mốc |
| --- | --- | --- |
| BE | `origin/dev` tại `0b7aefc` | PR #14 gộp `feat/phase-3-3` ngày 15/10; tác giả merge là Bảo. |
| BE | `origin/dev` | PR #13 tại `e0c9174` gộp Phase 4 ngày 14/10; code 4.1–4.3 của Huy ở `246abf4`. |
| BE | `feat/phase-3-3` | Bảo: `f6ed045` (3.3.1), `268980e` (3.3.2), `4f6faa3` (3.3.3), `a83a7cd` (3.3.4), `992b179` (3.3.5), `68b3e6c` (3.4). |
| BE | `origin/dev` | `d83ec60` tích hợp Materials/Attendance; `2e7e876` bổ sung kiểm tra nâng cấp dữ liệu trước triển khai. Đều của Bảo. |
| BE | `origin/dev` | Bảo `577af2f` làm catalog/classes/cart/checkout; `cc8bebf` làm danh sách lớp/lịch cá nhân. Huy tích hợp ở `571fb2d`. |
| FE | `origin/dev` tại `b0ea585` | Quốc Anh gộp phần thanh toán và các màn hình theo vai trò ngày 12/10. |
| FE | `origin/dev` | Huy `a752a2b`: redesign, luồng quay về từ thanh toán, tiền mặt, xem trước lớp và bộ thử liên quan. Đã gộp qua PR #1 tại `9b99b13`. |
| FE | `origin/dev` | Hào `6eed58b`, `a7e0179`, `2010d65`: mã QR, danh sách tiền mặt và bổ sung kiểm tra. Đã gộp qua PR #2 tại `b5d1cf8`. |
| FE | `origin/dev` | Quốc Anh `6e712f0`: hoàn thiện giao diện, khu vực giảng viên/quản lý và điều hướng theo vai trò. |

Lượt này chỉ cập nhật bảng tổng hợp và tài liệu. Không chạy lại kiểm thử ứng dụng, không chuyển nhánh, gộp mã, đẩy mã hay triển khai. Các số kiểm thử trong ghi chú là bằng chứng từ nhật ký đã có, không phải kết quả mới của lượt này.

BE đang mở nhánh `Feat/Phase4`; FE đang mở `Huy/Feat/UIredesign` và có sửa đổi chưa commit của công việc khác. Đối chiếu dùng `origin/dev` vừa fetch; giữ nguyên các thay đổi đang có.

Trong Google Sheet, tên và mô tả công việc dùng ngôn ngữ dành cho PM. Commit và người phối hợp nằm trong ghi chú của ô mô tả để tra cứu khi cần. Ô tiến độ của việc đang dở được để trống khi chưa có tỷ lệ được xác nhận.

## Cách trình bày trên Sheet sau khi tách nhiệm vụ

- Tab `Tong_hop_Phase` chứa nguyên bảng “Tiến độ theo phần việc” ở trên: phần việc, người làm, kết quả và việc còn lại.
- Tab `Ke_hoach_Sprint` đã tách Phase 2.3, 3.1, 3.2, 3.3.1–3.3.5, 3.4–3.6, 4.1–4.3, 4.4a–c và 4.5 thành các dòng riêng. Toàn tab hiện có 55 nhiệm vụ, từ dòng 17 đến 71.
- Phase 3.3.1–3.3.4 ghi Bảo thực hiện, hoàn thành phần chức năng và kiểm tra tại máy; nghiệm thu máy chủ được theo dõi riêng ở 3.3.5.
- Phase 4.3 nằm ở dòng 62: Huy thực hiện, trạng thái Hoàn thành; mô tả ghi rõ đã lên máy chủ và thử Postman xong theo xác nhận ngày 15/10.
- Phase 3.5 và 4.4a–c ghi Chưa bắt đầu. Phase 3.6/4.5 còn kiểm tra tích hợp, không ghi lại phần kiểm tra đã có là chưa làm.
- Các nhiệm vụ Phase 5 trở đi được giữ nguyên và chuyển xuống dòng 67–71. Công thức tổng hợp tự mở rộng tới dòng 71 sau khi chèn các dòng mới.
