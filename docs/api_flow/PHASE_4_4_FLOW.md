# Phase 4.4 — Flow triển khai

Ngày cập nhật: **2026-10-16**. **4.4b hoàn tất theo user; 4.4c CLOSED LOCAL/check456/HTTP48**, chưa hoàn tất toàn4.4.
[Plan](../implement_phase/phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md) ·
[API breakdown](PHASE_4_4_flow-api-breakdown.md) ·
[Progress](../progress/phase%204/PHASE_4_4_PROGRESS.md) · [Flow tổng](PHASE_4_FLOW.md).

Review PR15 ngày16/10: đã fetch và mô phỏng merge6bd851e với dev0b7aefc;
6 Markdown blocks conflict là logs Phase4.4 và Materials/CI cần giữ cả hai.
ClassesModule tự gộp; chưa merge checkout hoặc chạy integration gates sau gộp.
Lượt này không đổi flow/API/runtime,không commit/push/deploy.

## 2026-10-16 — Implementation4.4c

Handoff16/10: deploy backend4.4c để test server không phải chờ đóng4.5. Schema
cần đến1792022400001; không env/migration mới.4.5 nghiệm thu flow nhiều role trên
server và FE/browser, health/backup/rollback; leave gap vẫn cần implementation
riêng. Working tree chưa commit/push đầy đủ; lượt giải thích không deploy/test mới.

Schedule effective mentor/physical attendance/source credit + own guest events,
own history/summary, management summary và incomplete toàn backlog đã có source.
AttendanceProjectionService sở hữu scoped SQL read models; shared credit CTE
resolve leaf/root/owner trước summary range. READ ONLY REPEATABLE READ cho mỗi
response; StudentLearning compose qua public provider, không tạo vòng module.
Own historical metadata không cấp lại Class/material/context entitlement.

```mermaid
flowchart TD
  A[Start, mark, finalize hoặc correction hiện có] --> B[Physical regular và guest records]
  B --> C[Shared credit policy: leaf, evidence, pending và owner]
  C --> D[Student source summary]
  C --> E[Staff per-enrollment summary]
  B --> F[Own physical history: ancestry và credit link]
  C --> G[Current timetable: regular và own guest, dedup trước page]
  H[Staff incomplete toàn backlog] --> I[GET roster, kiểm quyền hiện hành]
  I --> A
  J[Placement cancel hoặc target cancel] --> C
```

Guest COMPLETED valid snapshot count một lần ở source, không tăng lớp nhận.
Cancel/reassign/no snapshot giữ pending, không tạo ABSENT; physical correction
sau cancel không khôi phục credit. Re-enroll chọn một owner student/root theo
evidence, không cộng đôi. Legacy/null mentor/partial recovery giữ unknown/no-data.
History theo physical range; summary theo effective source leaf, guest ở ngày
khác vẫn credit đúng source. Canceled ancestors luôn excluded.

20/20 focused PG,3/3 compiled HTTP4.4c và13/13 regression lịch2.3/time pass;
guest HTTP4.4b thêm kiểm schedule/source/receiving summary/revoke. Full gates
**check456/456 tests/45 suites,HTTP48/48 tests/8 suites,0 skip;lint/type-check/build pass**.
Kết quả cuối tại Progress4.4. Query fixture960 obligations:8 queries
summary không tăng theo pageSize; EXPLAIN recorded, không migration/index mới.
Swagger/Postman/contract mục13–18 cùng revision. Không FE/leave/config/dependency/
worker/payment/VPS changes; release4.5 và baseline metrics/rate-limit/i18n còn riêng.

## 2026-10-16 — Planning4.4c sau xác nhận hoàn tất4.4b

Đã đọc progress và đối chiếu source StudentLearning/Classes/Attendance/guest/
recovery/Enrollment/payment evidence. User xác nhận4.4b đã xong; giữ gates15/10
436/45 là evidence lịch sử, chưa có test/deploy4.4c. Các log dưới đây ghi các
lượt implementation trước. Workflow leave/approved intervals vẫn gap source
riêng, không ngăn lập read projections từ lịch/placements đã có.

[Plan mục4](../implement_phase/phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md#4-44c--lịch-student-tổng-hợp-và-hàng-chờ-vận-hành)
đã có baseline/gaps,22 AC/20 scenarios/5 bước C1–C5. Contract extension schedule
và4 GET mới ở [API mục13–18](PHASE_4_4_flow-api-breakdown.md#13-44c--quy-ước-và-contract-chung),
đều PLANNED; không thay contract implemented4.4b ở mục6–12.

```mermaid
flowchart TD
  A[Dữ liệu buổi học và điểm danh 4.2-4.4b] --> B[C1 Reader và phép tính credit chung]
  B --> C[C2 Lịch Student: mentor buổi và guest]
  B --> D[C3 Own history và summary]
  B --> E[C4 Staff summary và incomplete backlog]
  C --> F[C5 PG và compiled HTTP, full gates, tài liệu bàn giao]
  D --> F
  E --> F
  E --> G[Staff mở roster và kiểm quyền hiện hành]
  G --> H[Recovery, finalize hoặc cancel bằng API đã có]
  H --> E
  F --> I[4.5 FE, server và browser acceptance riêng]
```

Student lịch→FULL detail/CASH preview/SESSION_MAKEUP context đúng một buổi.
Own history giữ metadata khi enrollment terminal; không mở lại materials/meeting.
Summary resolve replacement chain và pending conflict trước khi tính denominator;
guest finalize ghi credit một lần ở source, không tăng tỷ lệ lớp nhận. Phân biệt
physical result và credited result; legacy/partial recovery không tự ABSENT.
Incomplete mặc định toàn backlog; endsAt chỉ xác định issue, không tự cấp quyền
start/finalize. Range/credit-owner re-enroll là thiết kế đề xuất phải khóa ở C1.

Lượt này chỉ planning/Markdown/source review; không source/FE/config/migration/
Postman requests mới, không BE runtime tests hoặc deployment. Kiểm tra tĩnh
PASS17 Markdown files/32 links và anchors mới/14 JSON blocks/22 AC/20 scenarios/
C1–C5/diff check; chi tiết ở Progress4.4, không thay bằng chứng runtime.

## 1. Phần đã code trong lượt bắt đầu

Vertical slice đầu của 4.4a: management reschedule → cancel → tạo replacement,
và hủy Class hủy các Session SCHEDULED/IN_PROGRESS cùng transaction.
Classes sở hữu lịch và audit; controller mới chỉ cho ADMIN/MANAGER hiện hành.
Không cấp thêm quyền Manager trên các route `/admin`.

Cập nhật tiếp 15/10 theo yêu cầu làm **4.4b**: queue/candidates/create/cancel/own
placement, capacity chung với checkout, guest attendance/audits và session context
đã có source. User xác nhận 4.4a xong trong chat; đối chiếu checkout hiện tại vẫn
chỉ thấy schedule operations, chưa thấy leave/approved intervals. Không đánh dấu
leave đã code hoặc candidates đã kiểm approved leave khi thiếu provider này.

```mermaid
flowchart TD
  A[Replacement đã lưu lịch] --> B[Checkout CASH hoặc activation CASH/PayOS]
  B --> C[Giữ đăng ký/thanh toán và ghi conflict atomic]
  C --> D[Staff queue: conflict ID và version]
  D --> E[Candidates: cùng Course Unit, khác Class, không trùng, còn suất]
  E --> F[Staff xác nhận nội dung + reason + versions + key]
  F --> G[Placement ASSIGNED và giữ suất đúng Session]
  G --> H[Student own metadata và đúng target context]
  G --> I[Target mentor start: guest snapshot riêng]
  I --> J[PUT regular + guest atomic, deadline cũ]
  J --> K[Finalize: placement COMPLETED, conflict RESOLVED]
  G --> L[Target cancel: NEEDS_REASSIGNMENT và queue OPEN]
  L --> M[Staff cancel placement cũ có reason]
  M --> E
  K --> N[4.4c: shared source credit, Student và Staff summary]
```

Attendance sở hữu placements/guest qua application services và SQL schema có FK/
triggers; không dùng attendance_records thường cho enrollment ngoại lớp. Module
ScheduleReservations chỉ đọc projection/khóa student, không import Classes,
Attendance hoặc Payments. Classes/checkout/enrollment gọi public provider này.
Target cancellation projection đặt trong trigger do migration attendance sở hữu,
đảm bảo Class/Session cancel atomic mà không tạo vòng module. Actor cancellation
được gắn transaction-local, không giữ sau commit.

Writes khóa Class UUID → Session UUID → student; schedule checker lấy mentor
trước student. Session dùng NO KEY UPDATE để vẫn serialize writers nhưng tương
thích FK KEY SHARE của conflict insert khi checkout đang giữ khóa student; không
lấy thêm Class locks sau student. Không đổi lock order cart/Class/order/payment
của thanh toán. Source/target IDs bất biến và DB bảo vệ ancestry/Unit. Receipt,
audit và version rollback cùng reservation; GET không giữ chỗ.

Placement không cấp quyền classmates/materials/CASH ở lớp nhận. Target cancel
không tự ABSENT; source completion chặn unresolved placement. Staff physical
correction không phục hồi credit của placement hủy. Lịch Student/summary/tỷ lệ
đã có ở4.4c; leave approval còn thiếu. Local/server evidence theo Progress, không suy ra VPS.

```mermaid
flowchart TD
  A[Management Class detail: Session ID và version] --> B{Thao tác}
  B -->|SCHEDULED| C[PATCH schedule: tương lai, trong kỳ, không overnight]
  B -->|SCHEDULED hoặc IN_PROGRESS| D[POST cancel với reason]
  D --> E[CANCELLED: giữ attendance, clocks và deadline]
  E --> F[POST makeups: bản CANCELLED cuối chuỗi]
  F --> G[Replacement SCHEDULED: cùng Unit, thời lượng, context]
  G --> H[Gia hạn Class.endDate nếu cần; chưa có roster]
  H --> I[Refetch lịch; start dùng snapshot attendance hiện hữu]
  G -->|Nếu phải hủy tiếp| D
```

Mọi mutation mới khóa Class → Session; kiểm actor hiện hành trước replay,
expectedVersion, lịch Class và effective mentor bằng checker chung. Receipt,
audit, version, replacement và endDate commit hoặc rollback cùng nhau. PENDING
leave/approved leave chưa có trong source của slice này; không ghi là checker
đã tính khoảng nghỉ.

## 2. Schema và lịch sử

Migration `1792022400000-session-schedule-operations` thêm hai ancestry columns,
composite FKs cùng Class Unit, unique successor và unique replacement hiệu lực
theo root, trigger bất biến ancestry/chống vòng/không hồi sinh source đã thay.
Audit lưu old/new schedule, actor, reason, version và endDate trước/sau.

Quyết định kỹ thuật: chuỗi tuyến tính. Nếu replacement bị hủy, client dùng ID
và version của replacement đó để tạo buổi tiếp theo. Gọi source cũ đã có child
trả `MAKEUP_ALREADY_EXISTS`, kể cả child đã hủy. Không tạo nhánh lịch sử mới.
Buổi mới không sao chép attendance, actual clocks, teaching snapshot hoặc hạn sửa.
Không backfill dữ liệu legacy. Down từ chối nếu đã có makeup/audit; rollback
application tương thích và giữ schema, không xóa lịch sử để ép down.

Hủy Class qua API Admin giữ contract cũ, thêm Session cancellation/audit atomic
với actor từ cookie. COMPLETED/CANCELLED Session giữ nguyên. Không giải phóng
hold, refund hoặc thay settlement. API Admin đổi giờ giữ ngày giữ semantics cũ,
dùng chung kiểm overlap Class/effective mentor với API reschedule mới.

## 3. Kiểm chứng và phạm vi còn mở

Chi tiết kết quả gate hiện tại ghi ở [progress](../progress/phase%204/PHASE_4_4_PROGRESS.md).
Test mới bao gồm PG transaction/constraints/replay/races/fault rollback, migration
clean/up-down-up/refusal và built-app HTTP cookies/validation/authorization/Swagger.
Các rehearsal migration cũ chọn đúng migration cần thử thay vì giả định nó là
migration mới nhất; riêng rollback 4.1 tháo/reapply migration 4.4 phụ thuộc enum.

**Chưa triển khai:** workflow preview/slot/request/approve/reject/withdraw/expire,
approved leave provider và tích hợp mọi schedule writer/approval.4.4c Student
projections/history/summary/queues/credit đã có theo revision16/10 phía trên.
Không có worker/mail/notification mới.
Không sửa FE, không migrate dev/VPS, chưa có deployment hoặc nghiệm thu 4.4/4.5.

### Gate cuối của lượt4.4b

Local2026-10-15: pnpm check PASS lint/type-check/436 tests/44 suites/build;
pnpm test:http45/45 tests/7 suites,0 skip. Migrations chỉ DB _test; HTTP compiled
Nest app với cookie/guards thật, fake PayOS và local private MinIO. Trigger alias
trùng biến đã sửa sau regression; migration rehearsals tháo/reapply đúng dependency,
không sửa migrations cũ. Docs/Postman/diff kiểm tra tĩnh, không bằng deployment.
