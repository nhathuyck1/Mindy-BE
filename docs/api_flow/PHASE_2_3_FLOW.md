# Phase 2.3 — Flow Student: My Classes và lịch cá nhân

Cập nhật: **2026-10-13**. Đã đối chiếu controller, DTO, service và test trong checkout.
Các API đã implement; evidence local nằm trong progress. Chưa xác minh release/VPS
trong lượt tài liệu này.

API chi tiết: [PHASE_2_3_flow-api-breakdown.md](PHASE_2_3_flow-api-breakdown.md).
Liên hệ Materials/Files: [Flow 2.3 → 3.2](PHASE_2_3_TO_3_2_FLOW.md).
Contract: [FE Phase 2.3](../PHASE_2_3_FE_CONTRACT.md).
Tiến độ: [Progress 2.3](../progress/phase%202/PHASE_2_3_PROGRESS.md).

## Dữ liệu mẫu roster — 2026-10-16

Đã thêm `pnpm seed:class-roster` (cũng nằm cuối `pnpm seed:data`): 44 tài khoản
STUDENT riêng, ghi danh ACTIVE vào HTML-CSS-101-ON1 (20/25) và JS-101-ON1 (24/25).
Fixture mô phỏng CASH đã xác nhận: order PAID, transaction SUCCEEDED có cash
reference đúng mentor/order, progress NOT_STARTED theo từng class unit. Không có
thanh toán thật, provider call hoặc email; không đổi flow checkout/payment runtime.
FE dùng roster/lịch hiện có sau khi đăng nhập bằng demo.html.01..20@example.com
hoặc demo.js.01..24@example.com; mật khẩu tài khoản mới lấy từ SEED_ACCOUNT_PASSWORD.
Không đổi API/contract; [breakdown](PHASE_2_3_flow-api-breakdown.md) giữ nguyên.
Đã chạy seed hai lần trên PostgreSQL local: lần đầu tạo 44 ghi danh, lần sau tạo 0;
không migrate DB/VPS. Seed giữ tài khoản/ghi danh hiện có, kiểm sức chứa và rollback
cả hai roster nếu lỗi. Đây là dữ liệu demo local, không phải evidence deploy.

## Bổ sung quản trị học sinh theo lớp — 2026-10-13

Đã implement hai GET cho ADMIN: list học sinh theo Class và detail một học sinh
trong Class. Luồng FE: `GET /api/v1/admin/classes` (đã có) → lấy `items[].id`
→ `GET /api/v1/admin/classes/:classId` (đã có, units/sessions)
và `GET /api/v1/admin/classes/:classId/students?page=1&pageSize=20`
→ lấy `items[].studentId` → `GET /api/v1/admin/classes/:classId/students/:studentId`.
Roster là enrollment còn hiệu lực: PENDING_PAYMENT, ACTIVE, COMPLETED; CANCELLED
không xuất hiện. Detail kiểm tra cặp classId/studentId, không mở thông tin của
học sinh ngoài lớp. Account SUSPENDED vẫn được admin đọc để quản lý.
Các GET không cập nhật enrollment/payment hay cấp quyền học. Không cần migration.
Hai HTTP case mới đã pass trên PostgreSQL test riêng cùng 11 case hiện có của
suite Phase 2.2; TypeScript và build pass. Full test 357/359 pass (2 attendance
failures ngoài roster); pnpm check vướng format attendance-payment-evidence ngoài
phạm vi. Chi tiết ở progress. Chưa deploy/VPS. Breakdown đầy đủ:
[§5.3](PHASE_2_3_flow-api-breakdown.md#53-admin-danh-sách-và-chi-tiết-học-sinh-theo-lớp).

## Luồng chính

1. Student đăng nhập, chọn Class và checkout theo Phase 2/2.2.
2. FE gọi `GET /api/v1/me/classes` khi checkout thành công hoặc mở “Lớp của tôi”.
   Nguồn danh sách là enrollment của người đăng nhập; một dòng ứng với một
   `enrollmentId`. Một order có thể tạo nhiều dòng cho nhiều lớp.
3. FE chọn endpoint theo `accessMode` của dòng:
   - `FULL`: mở `GET /api/v1/me/classes/:classId`.
   - `CASH_PREVIEW`: mở `GET /api/v1/me/classes/:classId/preview`.
   - `NONE`: hiển thị summary/lịch sử/trạng thái đơn; không tự mở private detail.
4. Calendar gọi `GET /api/v1/me/schedule?from=…&to=…`, lấy đủ các trang của range.
   Chỉ lớp có FULL/CASH_PREVIEW được đưa vào lịch; mỗi event có `sessionId`,
   `classUnitId`, `classId`, `enrollmentId` và `accessMode`.
   Event bổ sung `dayOfWeek` (Monday–Sunday), `startTime`/`endTime` (`HH:mm`)
   theo response timeZone; dữ liệu dẫn xuất từ timestamps, không lưu cột mới.
5. Bấm event → gọi lại detail/preview rồi định vị `sessionId` trong
   `units[].sessions[]`. Calendar không trả meeting URL; Session CANCELLED có nhãn
   hủy và không mời tham gia. Không có session detail endpoint riêng trong 2.3.

```mermaid
flowchart TD
  CHECKOUT["Checkout thành công"] --> LIST["GET /me/classes"]
  LIST --> MODE{"accessMode"}
  MODE -->|FULL| FULL["GET /me/classes/:classId"]
  MODE -->|CASH_PREVIEW| PREVIEW["GET /me/classes/:classId/preview"]
  MODE -->|NONE| SUMMARY["Summary / own order / history"]
  FULL --> CAL["GET /me/schedule: range và pagination"]
  PREVIEW --> CAL
  CAL --> CLICK["Chọn event → refetch detail/preview → định vị sessionId"]
  SUMMARY --> PAYMENT["Lookup order / chờ payment được xác minh"]
  PAYMENT -->|"Backend PAID + ACTIVE"| LIST
  PREVIEW -->|"Mentor confirm CASH → refetch"| LIST
```

## Trạng thái và nhánh cần xử lý

Admin từ class detail chọn Session → PATCH
`/admin/classes/:classId/sessions/:sessionId` hoặc `/sessions/bulk` với startTime/endTime.
Giữ ngày cũ, kiểm trạng thái/range/trùng lịch lớp và mentor, lưu timestamps trong
một transaction; bulk lỗi thì rollback toàn bộ. Success refetch detail/lịch.
Chỉ ADMIN, Class DRAFT/OPEN/IN_PROGRESS và Session SCHEDULED; Student/Mentor/Manager
không được sửa qua hai route này. Chi tiết body/errors ở API breakdown §5.1.

Seed ba cohort demo cho HTML/CSS và JavaScript ONLINE 15:00–17:00 (mentor khác
nhau), Python OFFLINE 09:00–11:00 Phòng Lab2; mỗi lớp 10 buổi thứ 3/thứ 7 từ slot
còn sắp tới. Có đủ 5/6/4 Class Unit của ba Course, tổng30 Session. Giữ lớp cũ,
không tạo enrollment/thanh toán. Ngày12/10/2026: suffix20261013, lịch13/10–14/11.
Local xác minh đúng3 lớp/15 Class Unit/30 Session/0 mentor conflict, rerun0 lớp;
pnpm check298/298 pass (27 suites), lint/type-check/build pass sau đổi seed.

| Trạng thái | My Classes | Detail/lịch |
|---|---|---|
| Enrollment ACTIVE, Class không CANCELLED, chuỗi order hợp lệ | FULL, current | Full detail và lịch |
| CASH hold PENDING_PAYMENT, own order PENDING, `expiresAt > asOf` | CASH_PREVIEW, current | Preview title/timetable/room và lịch; không meeting URL |
| PAYOS hold còn hạn, order PENDING | NONE, current | Summary/own order; không private detail/lịch |
| Enrollment COMPLETED | NONE, current | Summary; chưa cấp lại detail/lịch |
| Hold quá hạn hoặc order đóng | NONE, history | Không preview/lịch dù expiry worker chưa persist |
| Enrollment CANCELLED | NONE, history | Không private detail/lịch |
| Class CANCELLED | NONE; view theo enrollment | Không private detail/lịch |
| Chuỗi enrollment/order sai hoặc pending hold với order PAID | NONE, history | Fail closed, STATE_MISMATCH |

Ma trận chi tiết/ưu tiên reason nằm trong contract và access evaluator. Các access
hint chỉ có hiệu lực tại `asOf`; endpoint detail/preview kiểm quyền lại khi gọi.

- Return URL PayOS không xác nhận quyền học. FE lookup/poll own order theo contract
  Phase 2; chỉ sau backend PAID mới refetch list/lịch để nhận trạng thái mới.
- CASH confirm đổi preview → FULL. Preview cũ có thể trả 403; FE refetch list rồi
  chuyển endpoint phù hợp, không coi đây là mất lớp.
- Quá hạn tại `expiresAt <= asOf` mất preview/lịch ngay khi đọc. Checkout lại sau
  hủy hold có enrollment mới; dùng enrollmentId làm key, không gộp với lịch sử cũ.
- `order.requiresReview=true`: hiển thị đang đối soát; không mời trả lần nữa.
- GET không tạo payment link, không settle/expire, không ghi enrollment/progress.
  Đổi giờ/hủy Session có sẵn phản ánh khi refetch; chưa có workflow nghỉ/dạy bù.

## UI và tích hợp Phase 3

- List/calendar có loading, empty, error và session-expired; filter rỗng là 200,
  không phải lỗi. Đổi range/filter phải reset page và bỏ response cũ không còn khớp.
- Request BE dùng cookie với `credentials: 'include'`. Cache UI theo user;
  xóa khi logout/đổi tài khoản. Backend trả `Cache-Control: private, no-store`.
- Refetch sau checkout, CASH confirm, payment PAID và khi focus. Nếu poll payment,
  dùng giới hạn/backoff và dừng khi order kết thúc, lỗi quyền hoặc rời màn hình.
  API 2.3 không thêm websocket hoặc subscription.
- FULL chỉ cho detail/timetable hiện có; không bảo đảm Material được đọc/tải.
  Phase 3 kiểm ACTIVE, unit release, approval/publication và file READY riêng.
  CASH preview không chứa nội dung/file; Materials CRUD/download vẫn thuộc 3.3/3.4.

## Kiểm chứng và phần còn lại

- 2026-10-12: Bổ sung calendar fields, PATCH single/bulk và seed hiện tại;
  `pnpm check` 291/291 và HTTP 23/23 pass trên PostgreSQL test DB riêng,
  fake payment provider. Local seed tạo 1 cohort/10 Session, rerun tạo 0 lớp.
  Chưa deploy bổ sung này; chi tiết ở progress 2.3.

- Evidence trước lượt này: full `pnpm check` **243/243** và HTTP **20/20** pass sau
  đồng bộ dev; riêng PostgreSQL Phase 2.3 **6/6**. Đây là kết quả local, provider fake.
- Còn query-plan review trên fixture lớn, coverage PayOS settlement → list/lịch
  và staging/VPS smoke trước nghiệm thu toàn phase. Không có bằng chứng live từ
  các test này.
- 2026-10-10: Review progress và API flow, sửa trạng thái 2.3 trong flow tổng hợp,
  tạo flow/breakdown riêng và liên kết contract/progress. Chỉ sửa tài liệu, không
  đổi API hoặc chạy lại runtime tests/migration/deploy.

## Nguồn source

- [My Classes controller](../../src/modules/student-learning/controllers/my-classes.controller.ts)
- [Schedule controller](../../src/modules/student-learning/controllers/my-schedule.controller.ts)
- [Access evaluator](../../src/modules/student-learning/domain/learning-access.ts)
- [Integration tests](../../test/integration/phase23-my-classes-schedule.spec.ts)
- [HTTP tests](../../test/http/phase22-payments.spec.ts)
