# Rà API từ góc nhìn FE/người dùng — 2026-10-12

Đọc source BE và repo `../Mindy-FE` sau khi làm ba Student Material GET.
Đây là **source audit**, không phải nghiệm thu UI/browser/VPS. Không sửa FE trong
lượt này. [Flow mới](PHASE_3_4_FLOW.md) · [Contract ba API](PHASE_3_4_flow-api-breakdown.md).

Điều phối2026-10-13: FE do nhóm riêng thực hiện; repo FE local chỉ đọc. Các mục
FE dưới đây là backlog bàn giao nhóm đó, không phải phạm vi sửa của BE/user.
Người khác triển khai3.3–3.6, user deploy/server acceptance.
[Plan3.4 phối hợp3.3](../implement_phase/phase%203/PHASE_3_4_MATERIAL_ACCESS_PREVIEW.md)
đưa staff preview/assets vào cùng review3.3.3; typed Student ARTICLE sau
contract3.3.1. Đây là lịch sử planning13/10; authoring/review/release3.3 và
ARTICLE/assets/staff preview3.4 đã implement local13–14/10 theo bảng cập nhật bên dưới.
Các nhận định FE của audit12/10 vẫn là lịch sử, không phải nghiệm thu UI mới.

## Ưu tiên bàn giao ngay cho FE

| Ưu tiên | Người dùng bị ảnh hưởng | Evidence và việc cần làm |
|---|---|---|
| P0 | Học viên click tài liệu nhưng proxy trả404 | Ba GET mới có BE, nhưng FE `proxy-policy.ts` chưa allowlist. Thêm đúng method/path, Material Zod schemas/client/viewer, kiểm cookies/no-store/URL refresh. Đây là tích hợp FE, không thiếu thêm endpoint BE. |
| P0 | Manager đăng nhập hoặc admin mở list users có Manager | FE identity enum chỉ ADMIN/MENTOR/STUDENT; BE đã có MANAGER. `userSchema` sẽ reject user MANAGER, admin list chứa Manager cũng có thể fail parse. Thêm role/schema/label/navigation/permissions riêng; không cấp Manager quyền Admin. |
| P0 | Học viên không có tài liệu dù file upload READY | Chưa Manager/Mentor authoring/review/publication và HTTP release. File READY không tự thành Material. Ba GET mới đọc FILE/VIDEO fixtures được; sản phẩm cần hoàn thành3.3. |
| P1 | Học viên phải tìm lớp qua lịch sử đơn mua | BE GET `/me/classes` đã có current/history/access hints, FE mới gọi private class detail từ order; chưa có My Classes screen/client/allowlist. Tích hợp API có sẵn thay vì thêm API enrollment trùng. |
| P1 | Học viên cần biết hôm nay/tuần này học gì | BE GET `/me/schedule` đã có range/pagination/timeZone; FE chưa client/allowlist/calendar. Source workspace hiện thêm dayOfWeek/startTime/endTime; không coi là evidence VPS. |
| P1 | Học viên không hiểu vì sao chương chưa mở | BE class DTO đã có unit.status/unlockAt/courseUnitId; FE `studentClassSchema` bỏ các fields này. Giữ các field đó để hiện LOCKED/future time; current list empty không tự phân biệt mọi lý do chưa có tài liệu. |
| P1 | Mentor chỉ thấy đơn CASH, chưa danh sách học viên/lớp | BE GET `/mentor/classes` và `/mentor/classes/:classId/students` đã có; FE chưa allowlist/client/screens cho roster. Không cần API roster mới. |

Nguồn FE của audit2026-10-12 (repo Mindy-FE không có trong workspace lượt3.3.5; các path dưới đây là tham chiếu lịch sử): proxy policy (`Mindy-FE/src/shared/lib/http/proxy-policy.ts`),
identity schema (`Mindy-FE/src/shared/api/contracts/identity.ts`),
Student class UI (`Mindy-FE/src/features/learning/components/student-class-page.tsx`),
class schema (`Mindy-FE/src/features/learning/schemas/learning.schema.ts`),
learning client (`Mindy-FE/src/features/learning/api/learning.browser.ts`).
Nguồn BE: controllers My Classes/My Schedule/mentor roster/Student Materials;
DTO ClassUnit/StudentClass và plans3.3.

## BE thực sự cần bổ sung tiếp

Trạng thái cập nhật2026-10-14: ba nhóm authoring/review/release/context3.3 bên dưới đã implement local; các nhóm còn lại vẫn planned. Chưa có evidence deploy/nghiệm thu VPS3.3.
Không tự đưa vào FE allowlist hay gọi production như API hiện hữu.

| Ưu tiên | Luồng người dùng | API/việc đề xuất |
|---|---|---|
| P0 | Manager tạo nội dung, Mentor gửi duyệt, Manager publish | Đã implement local3.3.1–3.3.3: Manager Course Unit/material list/create/detail/edit/delete + approve/reject/publish/unpublish; Mentor own draft/submit. Typed ARTICLE/FILE/VIDEO, sanitizer/refs/audit/revision locks. |
| P0 | Mentor/Admin cho học viên học từng chương | PATCH `/admin/classes/:classId/units/:unitId/release` và `/mentor/classes/:classId/units/:unitId/release` đã implement local3.3.4; OPEN/LOCKED + unlockAt, assignment/audit/atomic/no-op. |
| P1 | Mentor chọn đúng chương/buổi để soạn tài liệu | GET `/mentor/classes/:classId/units` và `/units/:unitId/sessions` đã implement local3.3.2; context trả Class Unit/Course Unit/session mapping. |
| P1 | Manager chọn Course Unit mà không cần quyền Admin | Read-only catalog/context picker cho MANAGER, gồm course inactive/unit IDs đúng scope; public `/courses` chỉ active, `/admin/courses` chỉ ADMIN. Contract filter/page cần chốt khi triển khai3.3. |
| P1 | Manager/Mentor thực sự xem PDF/video trước quyết định duyệt | Đã implement local 2026-10-14: POST `/manager/materials/:id/files/:fileId/access` và `/mentor/classes/:classId/materials/:id/files/:fileId/access` ([breakdown §5](PHASE_3_4_flow-api-breakdown.md)). FE cần allowlist + viewer. |
| P1 | Học viên đọc bài ARTICLE, ảnh inline và attachments | Đã implement local 2026-10-14: detail trả contentHtml/inlineImages/attachments; POST `/me/classes/:classId/materials/:id/files/:fileId/access` ([breakdown §4](PHASE_3_4_flow-api-breakdown.md)). FE cần renderer + allowlist. |
| P2 | Học viên quay lại vị trí học và thấy đã hoàn thành gì | GET progress theo enrollment/class/unit và command completion phù hợp. Class Unit progress đã tạo lúc settlement nhưng chưa read/write API. Chốt tiêu chí completion/idempotency/revoke; không suy completion từ tải file hoặc lịch kết thúc. |
| P2 | Người dùng sửa tên/số điện thoại/khôi phục hoặc đổi mật khẩu | Self-service profile, change-password, forgot/reset-password: chưa controller. Account UI hiện read-only, login hiện không có recovery flow. Chốt verify/session revocation riêng. |
| Theo phase | Học viên xem điểm danh/bài tập, mentor quản lý lịch cá nhân | Attendance/assignment/Q&A/compiler BE/certificate/mentor availability/calendar/reschedule notification thuộc roadmap; chưa routes và chưa UI thật trong FE. Không làm tất cả để lấp bảng API ở lượt này. |

Nếu triển khai cancel-order/refund hoặc quyền học lại sau enrollment COMPLETED,
cần quyết định nghiệp vụ riêng: full payment/seat holds/callback races hiện có
không hỗ trợ coi redirect CANCEL hay thao tác FE là đã hủy tiền/hoàn tiền.

## Các API không cần thêm chỉ để đi qua màn hình

- Student class detail đã chứa toàn bộ units/sessions và meeting URLs được phép
  xem; UI nhỏ hiện tại chưa cần GET riêng cho mỗi session. Material list không
  trả mọi file của Course Unit, chỉ Material approved/released.
- Public course detail đã có curriculum units; không dùng public syllabus thay
  private Material APIs. CourseUnitId và ClassUnitId là hai ID khác nhau.
- Đơn/PayOS/result mapping/CASH confirm/preview đã có; FE cần refetch My Classes,
  schedule và class detail sau settlement, không tạo enrollment hoặc mở unit bằng FE.
- Admin chỉnh giờ một/bulk sessions đang có source thay đổi trong workspace;
  không liệt kê lại là API thiếu. FE vẫn cần đồng bộ proxy/schema tương ứng.

## Thứ tự hợp lý cho lượt tiếp theo

1. FE đồng bộ allowlist/roles/Material contract, My Classes/lịch và mentor roster.
2. BE hoàn thành3.3 authoring/review/release/context picker để có nội dung thật.
3. Hoàn thiện ARTICLE/asset/staff preview rồi nghiệm thu browser PDF/MP4 seek/expiry/
   CORS bằng luồng thật; phân biệt local với VPS.
4. Progress/completion và self-service account; các feature học tập khác theo roadmap.

Source chưa chứng minh các routes hiện hữu đã deploy trên VPS. Không dùng snapshot
Swagger FE ngày06/10 để kết luận source BE ngày12/10 còn thiếu My Classes/schedule.

2026-10-14: Acceptance/handoff3.3.5 đã chuẩn bị local; providers/fixtures và giới
hạn Student ARTICLE/assets/staff preview tại [§10 contract3.3](PHASE_3_3_flow-api-breakdown.md).
Không sửa source FE trong lượt này; không coi audit2026-10-12 là UI evidence mới.
