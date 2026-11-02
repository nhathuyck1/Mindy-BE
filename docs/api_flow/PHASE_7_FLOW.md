# Phase 7 — Flow bảng vẽ

**02/11/2026 — PLANNED, chưa có runtime/API triển khai hoặc deployment evidence.**

[Plan](../implement_phase/phase%207/PHASE_7_WHITEBOARD.md) ·
[API proposal](PHASE_7_flow-api-breakdown.md) ·
[Progress](../progress/phase%207/PHASE_7_PROGRESS.md)

## Ghi nhận lượt planning

User yêu cầu UI theo `E:/Documents/WDP/miro-demo`. Đã đọc source demo và Mindy,
mở UI demo local để xem bố cục màn hẹp; desktop đối chiếu source/CSS. Chưa test
thao tác realtime/upload/snapshot, chưa kiểm trực quan desktop. Chỉ thêm tài liệu
BE; không sửa FE/demo, contract runtime, schema DB hoặc quyền đang chạy.

## Luồng chính dự kiến

1. Mentor mở buổi học → đọc context bảng/capabilities. Chưa có thì hiện “Tạo bảng”;
   lệnh tạo có idempotency và unique session chống hai tab tạo trùng.
2. Student đi từ buổi học trong learning workspace, chỉ mount board khi FULL
   access. Chưa có board thì hiện “Mentor chưa tạo bảng”, không tự tạo.
3. Mở workspace riêng toàn vùng nhìn → kiểm session/entitlement → WSS cùng origin
   → sync document đúng board/epoch → chỉ bật tool theo capabilities server.
4. Mentor chuẩn bị nội dung trong PRESENTATION. Student thấy read-only có lý do.
   Khi buổi IN_PROGRESS, Mentor bật COLLABORATIVE cho lớp cùng vẽ.
5. Mỗi update hợp lệ được server kiểm quyền/schema/quota, ghi durable rồi ACK và
   fanout. FE hiển thị Đang đồng bộ/Đã lưu theo ACK commit, không theo socket connect.
6. Ảnh đi qua upload scope board và validation; chỉ file READY đã bind đúng board
   mới thành phần tử. State dùng assetId; browser lấy URL private khi cần render.
7. Mentor lưu mốc hoặc hệ thống nhận session-end event để lưu mốc cuối buổi.
   Student sau COMPLETED chỉ xem; sửa bảng không làm đổi điểm danh/trạng thái buổi.
8. Mentor mở lịch sử → preview → xác nhận restore/reset → lưu BEFORE_RESET →
   thay epoch → mọi peer resync và xóa undo cũ. Không replay pending epoch cũ.
9. Xuất PNG trước; PDF ở slice tiếp. Export là file đầu ra, lịch sử là bản có
   thể khôi phục; UI phân biệt hai ý định.

## Nhánh lỗi và race phải kiểm

- Hết auth: dừng sync/ghi; REST dùng recovery hiện có, WS đóng và chỉ reconnect
  sau session được xác nhận. Không refresh vô hạn hoặc mang pending qua tài khoản.
- Mode/assignment/entitlement thay đổi giữa lúc vẽ: server từ chối update tới sau
  barrier, FE khóa tool và tải capabilities; không giữ quyền bằng room membership.
- Mất kết nối: giữ state đã nhìn và pending trong RAM; khóa sửa mới. Chỉ replay
  sau reauthorize và kiểm epoch. UI không nói “Đã lưu” cho pending chưa commit.
- Server crash/DB lỗi: checkpoint + journal phục hồi state đã ACK; updateId
  chống lặp. Không có durable ACK trước commit.
- Reset/restore trong khi client offline: epoch cũ bị từ chối; không merge lại
  nội dung cũ vào bảng mới. Giữ thông báo phần chưa lưu cần xem lại.
- Upload lỗi hoặc signed URL hết hạn: có retry riêng; không thêm shape trỏ URL
  hỏng hoặc cấp quyền qua đường upload materials cũ.
- Session finalize bị retry: mốc SESSION_END theo lifecycle event duy nhất;
  không dùng GET bảng hoặc cursor event để tạo mốc lịch sử.

## Giả định cần giữ rõ khi triển khai

Policy đề xuất chi tiết tại plan mục 3; chưa là quyết định user xác nhận. Bản đầu
cộng tác sửa chung, chưa owner-only/grant cá nhân/follow presenter. CASH_PREVIEW
không có board access. Guest makeup cần policy session đích đã kiểm chứng.

## Kiểm chứng trong lượt này

Đối chiếu source + quan sát UI demo + kiểm tài liệu/link/diff. Không chạy test
BE/FE runtime cho thay đổi chỉ tài liệu; không xác nhận API live, deploy hoặc load.
