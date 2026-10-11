# Phase 3.3 — Flow Material management và release

Cập nhật: **2026-10-11**. **Kế hoạch; các API 3.3 chưa implement/deploy.**
Plan: [3.3](../implement_phase/phase%203/PHASE_3_3_MATERIAL_MANAGEMENT.md).
API chi tiết: [breakdown](PHASE_3_3_flow-api-breakdown.md).
Progress: [3.3](../progress/phase%203/PHASE_3_3_PROGRESS.md).
Baseline: [upload 3.2](PHASE_3_2_FLOW.md), [flow tổng hợp](PHASE_2_3_TO_3_2_FLOW.md).

## 1. Kết quả sản phẩm

File READY trở thành Material draft của Course Unit; Mentor gửi duyệt,
Manager quyết định trên đúng revision. Approve đồng thời publish; availableAt
và release của từng lớp vẫn quyết định khi Student đọc ở 3.4. Được duyệt không
đồng nghĩa mọi Student/lớp được mở ngay. Session link không giấu Material chung.

## 2. Flow dự kiến

```mermaid
flowchart TD
  C["Mentor roster classId đã có"] -.-> U["3.3: unit/session context đúng assignment"]
  M["Manager chọn Course Unit UUID"] --> UP["3.2 đã có: intent → PUT MinIO → complete → READY"]
  U -.-> UP
  UP -.-> D["3.3: tạo Material DRAFT revision 1"]
  D -.-> S["Mentor submit → PENDING_REVIEW"]
  S -.-> Q["Manager queue/detail + expectedRevision"]
  Q -.-> A["Approve → APPROVED + publishedAt"]
  Q -.-> R["Reject + reason → REJECTED"]
  R -.-> E["Mentor EDIT → DRAFT revision + 1 → submit lại"]
  D -.->|"Manager own draft"| A
  A -.-> ME["Manager EDIT → DRAFT, thu hồi approval/publication"]
  ME -.-> A
  A -.-> P["Manager unpublish/publish đúng approval"]
  REL["3.3: Admin/Mentor release Class Unit LOCKED/OPEN + unlockAt"] -.-> G
  A -.-> G["3.4: ACTIVE + class/unit/time + approval + READY"]
  G -.-> READ["Student list/download; Manager/Mentor binary preview"]
```

Nét đứt là việc chưa implement. Upload 3.2 có evidence local, không chứng minh
VPS đang bật storage. Diagram không công bố endpoint mới là dùng được.

## 3. Mentor tạo và gửi duyệt

1. `GET /mentor/classes` đã có lấy classId. Routes context dự kiến 3.3 trả
   classUnitId/courseUnitId; optional session picker trả sessionId đúng unit.
   Không đoán mapping theo title/position hoặc gọi Admin API.
2. Theo [upload breakdown 3.2](PHASE_3_2_flow-api-breakdown.md): tạo intent đúng
   classId/classUnitId/courseUnitId, raw PUT storage, complete, poll đến READY.
3. POST unit materials với fileId/title/content; response DRAFT/revision=1.
   READY metadata PENDING/FAILED không cản Material nếu binary đã READY.
4. PATCH draft với expectedRevision; cập nhật revision từ response. Submit
   expectedRevision → pending, khóa editor của Mentor, dừng retry sau 403/409.
5. GET item/list để theo dõi. Rejected: hiện reason cho chủ draft, EDIT rồi submit
   lại. Mentor khác không thấy submission/reason trong items hoặc total.
6. Assignment bị thu hồi/lớp CANCELLED: dừng thao tác/refetch roster, Manager vẫn
   review được submission. Không tự đổi createdInClassId để lấy lại quyền.

## 4. Manager quản lý và review

1. Chọn Course Unit UUID hợp lệ (public detail chỉ có active Course; inactive
   toàn catalogue picker chưa có, xem integration gap trong plan).
2. GET materials/queue (mặc định queue filter FE PENDING_REVIEW); chọn item GET
   detail để lấy current revision. List không chứa download URL.
3. Approve/reject dùng expectedRevision; approve publish cùng commit, reject cần
   reason. Binary preview thuộc 3.4; không giả định 3.3 đã đủ màn hình đọc file.
4. 409: refetch item/queue, hiển thị bản hiện tại, không tự approve revision mới.
   Response mất: refetch, retry cùng revision khi state còn đúng; no-op không tạo audit.
5. Manager EDIT nội dung/file/sortOrder/availableAt/sessionId tăng revision và
   thu hồi approval/publication ngay. File mới phải upload READY trước PATCH.
6. Unpublish giữ approval; publish lại cần approval current. Approve retry không
   tự publish lại bản đã unpublish. DELETE soft-delete, refetch item/list/queue.

## 5. Release và liên hệ Student 2.3/3.4

Admin hoặc Mentor đúng lớp gửi PATCH release `{status, unlockAt?}`; omitted giữ
lịch cũ, null xóa lịch. COMPLETED Unit/CANCELLED Class trả 409. OPEN với giờ tương
lai chỉ mở khi đến server time, không cần worker chuyển trạng thái.

Release không phê duyệt Material, không kích hoạt enrollment/progress/payment.
Student My Classes/detail FULL từ 2.3 chỉ cấp navigation, vẫn phải qua policy 3.4.
Hai lớp cùng Course Unit dùng chung Material, release độc lập theo từng lớp.

## 6. UI state/cache và prerequisites

- Context/list/detail: loading → empty/success; 401 login, 403 dừng/refresh quyền,
  404 đóng item không còn visible; không retry 422/409 vô hạn.
- Editor: giữ draft form khi 422; save/submit/review disable nút khi pending HTTP;
  409 giữ form nhưng refetch server state để người dùng đối chiếu.
- Mutations sync; không polling Material worker. Có thể refresh pending queue
  theo thao tác người dùng; upload polling chỉ dùng flow 3.2.
- Metadata responses `private, no-store`; invalidate unit list/item/queue theo
  mutation, release refetch unit context và Student views khi 3.4 tích hợp.
- Cần migration/code 3.3/auth role; upload mới cần MinIO/worker 3.2. Existing
  metadata/read/review không cần gọi storage network. Download cần triển khai 3.4.

## 7. Nhật ký — 2026-10-11

Lập plan theo baseline 3.1/3.2 đã xong; bổ sung context/detail/release/audit và
breakdown dự kiến. API/source runtime hiện tại không đổi. Kiểm link/diff/JSON
trong tài liệu; chưa chạy runtime tests, migrate, deploy hoặc human binary review.
