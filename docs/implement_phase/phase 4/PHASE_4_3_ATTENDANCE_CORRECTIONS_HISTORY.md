# Phase 4.3 — Attendance correction, evidence recovery và audit history

Ngày lập plan: **2026-10-13**. **IMPLEMENTED — correction, Staff audit và evidence recovery đã có source/migration/API.**
Focused PostgreSQL và built-app HTTP đã chạy; full gates ghi riêng tại Progress4.3.
Chưa deploy/VPS/browser hoặc giao dịch thật trong lượt này.

[Plan Phase 4](PHASE_4_ATTENDANCE_OPERATIONS.md) ·
[Plan 4.2](PHASE_4_2_SESSION_ATTENDANCE.md) ·
[Progress 4.3](../../progress/phase%204/PHASE_4_3_PROGRESS.md) ·
[Flow 4.3](../../api_flow/PHASE_4_3_FLOW.md) ·
[API 4.3](../../api_flow/PHASE_4_3_flow-api-breakdown.md).

## 1. Mục tiêu, prerequisites và phạm vi

Đóng GAP42-01–03: sửa kết quả sau chốt, phục hồi Session thiếu lịch sử có chứng
cứ và cho Staff đọc audit theo Session/enrollment. Giữ regular attendance cùng
Class; không mở lại buổi đã chốt, không cấp lại enrollment/material entitlement.

Prerequisites: assignment/effective mentor và shared Class→Session locks 4.1;
roster/lifecycle/receipts/composite FKs 4.2; calendar deadline migration
`1791849600002-calendar-attendance-deadline`. Baseline gần nhất trong progress
4.2 là check359/359 và HTTP33/33, evidence lịch sử của toàn project.

Rule kế thừa user chốt ngày2026-10-13: không overnight; deadline từ ngày
`Session.startsAt` theo APP_TIME_ZONE. Thứ Ba học → được sửa tới hết thứ Tư,
`now < 00:00 thứ Năm`. Không tính actualStartedAt+24h. Không sửa clock/deadline
để cấp thêm quyền. Staff = MANAGER/ADMIN; cả ONLINE/OFFLINE thao tác thủ công.

Không thuộc slice: cancel Class/Session orchestration và leave/replacement4.4a,
guest/placement4.4b, Student own history/summary/denominator/backlog4.4c,
notification/email/certificate và staging/VPS/browser release4.5. Correction
canceled giữ lịch sử; việc hủy và phép tính tỷ lệ vẫn thuộc slices sau.

## 2. State/permission matrix và acceptance criteria

| Session và Class | Correction PUT | Evidence recovery POST |
|---|---|---|
| SCHEDULED chưa start, Class OPEN/IN_PROGRESS | Không; dùng start4.2 | Staff phục hồi tới COMPLETED với clocks/roster/result evidence |
| SCHEDULED chưa start, Class COMPLETED/CANCELLED | Không | Staff phục hồi buổi thực tế đã diễn ra; giữ Class terminal |
| SCHEDULED, Class DRAFT | Không | Reject; lịch nháp không là buổi đã tổ chức |
| IN_PROGRESS có start | Mark4.2; Mentor trong hạn, Staff reason | Không; Staff finalize4.2, không thay workflow bằng recover |
| COMPLETED có clocks/roster | Mentor hiệu lực trong hạn nếu Class không CANCELLED; Staff bất kỳ lúc nào | Chỉ admit các row thiếu có chứng cứ; không overwrite row/clocks |
| COMPLETED legacy thiếu clocks/roster | Không sửa row không tồn tại | Staff bổ sung clocks còn thiếu + roster có chứng cứ, giữ COMPLETED |
| CANCELLED đã start | Chỉ Staff, sửa row hiện hữu | Không; không admit mới hoặc đổi lifecycle |
| CANCELLED chưa start | Không tạo attendance | Reject; giữ no-data |

Class COMPLETED không tự thu hồi quyền correction của teaching mentor trước
deadline. Class CANCELLED yêu cầu Staff. Legacy teachingMentorId unknown không
fallback sang primary hiện tại để cấp quyền sửa buổi cũ; Staff xử lý.

### 2.1 Correction và clock

- **AC43-01:** Mở rộng PUT attendance hiện hữu cho COMPLETED đã start; chỉ sửa
  snapshot rows đúng Session. IN_PROGRESS tiếp tục contract4.2; không nhận guest.
- **AC43-02:** COMPLETED/CANCELLED correction chỉ PRESENT/ABSENT. UNMARKED sau
  chốt/hủy422; SCHEDULED hoặc actualStartedAt null409. Staff sửa CANCELLED đã
  start, giữ status CANCELLED và canceled exclusion.
- **AC43-03:** Mentor ACTIVE/current role/effective teaching assignment; chỉ
  `now < editableUntil`, kể cả Class COMPLETED. Mentor Class/Session CANCELLED
  bị chặn; Staff ACTIVE không deadline, required reason trim1–1000.
- **AC43-04:** Tính thời gian sau các lock waits liên quan; đúng midnight hết
  quyền, trước đó1ms còn quyền. Retry, reassignment, recovery/correction không
  dời editableUntil. Thiếu deadline/unknown teaching mentor không cấp quyền Mentor.
- **AC43-05:** PRESENT đổi từ trạng thái khác lấy checkedInAt=server now,
  ABSENT xóa checkedInAt; đây là giờ ghi nhận kết quả, không giờ đến lớp lịch sử.
  Không nhận client checkedInAt/actor/lifecycle/mentor. No-op giữ timestamp/version.
- **AC43-06:** Một batch1–100 unique enrollment UUIDv4; toàn bộ validate trước
  write. Row sai Session/Class hoặc không có snapshot422, cả batch rollback.
  Correction không admit, không xét ACTIVE hiện tại để xóa nghĩa vụ đã snapshot.

### 2.2 Recovery bằng chứng cứ

- **AC43-07:** Command Staff riêng cho SCHEDULED quên thao tác hoặc COMPLETED
  thiếu data, kể cả Class terminal; Class DRAFT/IN_PROGRESS Session/CANCELLED
  Session reject. SCHEDULED→COMPLETED atomic; legacy COMPLETED không reopen.
- **AC43-08:** Required actualStartedAt/actualEndedAt ISO có timezone, start<end<=
  server now; không overnight theo APP_TIME_ZONE. Mốc lịch startsAt vẫn là nguồn
  deadline. Recovery không đổi startsAt/endsAt, Class dates/status hoặc enrollment.
- **AC43-09:** Giữ clocks/teachingMentorId/startedBy/completedBy đã biết. Nếu body
  khác clocks đã lưu409, không sửa lịch sử bằng recover. Điền clocks null bằng
  evidence; unknown người dạy/người bấm legacy giữ null, actor recovery nằm ở audit.
- **AC43-10:** Roster do Staff xác nhận đầy đủ phần có chứng cứ, unique1–1000
  rows, PRESENT/ABSENT explicit, global evidenceNote trim1–2000. Không lấy ACTIVE
  hôm nay hoặc createdAt đơn lẻ làm roster quá khứ; người thiếu evidence không row,
  không ABSENT. Không tự biến omission thành kết quả hoặc đánh dấu full coverage.
- **AC43-11:** Mỗi row đúng Class, enrollment.createdAt<=actualStartedAt và có
  nguồn thanh toán đã xác minh liên kết đúng enrollment/order detail. ACTIVE,
  COMPLETED/CANCELLED đều có thể hợp lệ với lịch sử trả tiền và evidence nghĩa vụ.
  PENDING_PAYMENT/unpaid/PayOS redirect không đủ; evidenceNote không vượt điều kiện
  payment. Không gọi cash settlement/payOS/SMTP trong recovery transaction.
- **AC43-12:** Admission basis PAID_BEFORE_START hoặc CASH_LATE_ADMISSION.
  PAID_BEFORE_START cần paidAt<=start và evidence nghĩa vụ lịch sử; enrolledAt nếu
  có là evidence bổ trợ, không tự suy ra sự tham gia từ status hôm nay. CASH late
  cần hold tồn tại trước start, CASH đã PAID và Staff xác nhận admission qua note;
  PayOS late không được dùng exception CASH. Thiếu payment timestamps/evidence
  không tự suy đoán; reject422 và giữ no-data.
- **AC43-13:** Recovery insert-only các row thiếu; row đã tồn tại409, cả batch
  rollback và FE dùng correction PUT riêng. admissionSource=EVIDENCE_RECOVERY,
  admittedAt/recordedBy lấy server/actor recovery; checkedInAt PRESENT là giờ xác
  nhận recovery. Lưu basis/payment reference/evidence tại recovery audit.
- **AC43-14:** Recovery lifecycle metadata, new rows, audits, version và receipt
  cùng commit. Không chuyển Class terminal về IN_PROGRESS, không kích hoạt paid
  hold, không tạo unit progress/material access, không tạo mentor slot hiện tại.

### 2.3 Audit, concurrency và HTTP

- **AC43-15:** Staff-only paginated audit reader scoped sessionId; optional
  enrollmentId UUIDv4 trong cùng Class; page>=1/pageSize1–100 mặc định1/20.
  Sort occurredAt DESC,id DESC; total và items cùng snapshot. Student/Mentor403,
  actor inactive403; không lộ payment credentials, raw receipt hash hoặc JWT.
- **AC43-16:** Audit append-only: row actor/old/new/reason/action/time/version;
  correction action CORRECT, recovery action RECOVER. Recovery evidence và
  old/new clocks/state giữ ở recovery audit riêng, kể cả legacy không đổi status.
  GET trả recovery reference để trace; không overwrite audits cũ.
- **AC43-17:** Class→Session locks chung4.1/4.2; expectedVersion Session>=1.
  Concurrent correction/finalize/sync/recovery/assignment/lifecycle không lost
  update. Clock/state/role/evidence recheck trong transaction, data providers nhận
  caller EntityManager. Không mở payment lock sequence ngược Class→Order.
- **AC43-18:** UUIDv4 Idempotency-Key, actor/route/key/hash/outcome cùng commit.
  Auth hiện hành trước replay; same key/body trả outcome cũ, key đổi payload409.
  New write stale409; no-op mark vẫn receipt nhưng không audit/version mới.
  Replay sau deadline có thể trả success cũ cho actor còn quyền resource; không
  tạo write mới. Mentor bị gỡ assignment/role/status không được replay.
- **AC43-19:** Roster permissions bổ sung canRecover/canViewAttendanceAudits;
  canEditAttendance phản ánh correction matrix; canFinalize vẫn IN_PROGRESS.
  Recovery eligibility chi tiết kiểm server từ evidence; permissions là UI hint.
  Safe DTO/private,no-store/Swagger/runtime validation/Postman phải khớp source.
- **AC43-20:** Recovery1000 rows cần HTTP body parser có giới hạn riêng256KiB
  trước parser64KiB hiện tại; routes khác giữ64KiB. DTO/nested validation phải
  reject>1000, unknown fields/duplicate IDs; oversized413 trước transaction.
  Test parser order trên built app, không chỉ DTO unit; parser đã có ở4.3.5.
- **AC43-21:** Additive migration/index/FK/RESTRICT cho recovery evidence/audit;
  không sửa migration đã có, không backfill attendance/actor/clocks từ suy đoán.
  Clean DB/legacy/up-down-up/refusal test thật; có evidence/audit thì down từ chối.
- **AC43-22:** Handoff phân biệt implemented/planned/local/deployed; Student
  projections/guest/cancel/leave/release tiếp tục mở. Tests4.3 chỉ ghi pass khi
  chạy, có PostgreSQL và HTTP evidence, không dùng totals4.2 để đóng AC4.3.

## 3. Schema, ownership và quyết định kỹ thuật đã triển khai

| Thành phần | Chủ sở hữu và thay đổi đã triển khai |
|---|---|
| attendance_records/audits/receipts | AttendanceModule; dùng lại ancestry/unique/RESTRICT/version semantics; action varchar hiện có nhận CORRECT/RECOVER |
| attendance_recovery_audits | AttendanceModule; UUID, session/actor/version, reason/evidence_note, old/new status, old/new actual clocks/deadline, occurred_at; unique(session_id,version), FK RESTRICT |
| attendance_recovery_audit_items | AttendanceModule; recovery_audit_id + attendance_id unique, admission_basis, verified order detail/payment reference, paid_at snapshot; FK RESTRICT giữ lineage |
| Audit index | New index attendance_audits(occurred_at DESC,id DESC) hoặc join-oriented index sau EXPLAIN; recovery index(session_id,occurred_at DESC,id DESC) |
| Lifecycle participant | ClassesModule export phương thức recover metadata có guard riêng; giữ terminal Class/status và unknown historical actors |
| Historical enrollment evidence | Enrollments public provider trong caller transaction: enrollment ancestry/status/createdAt/enrolledAt/orderDetailId, không reuse ACTIVE-only attendanceCandidates |
| Verified payment evidence | Payments public read provider: settlement/paidAt/type và exact order-detail linkage; không import commerce/payment repository trực tiếp vào Attendance |
| Recovery reader/commands | Attendance public service; Classes không import Attendance ngược, tránh module cycle; payment read provider không phụ thuộc Attendance |

Migration mới `1791849600003-attendance-recovery-evidence` và hai recovery entities
thuộc AttendanceModule. Payments export AttendancePaymentEvidenceService, đọc
line ancestry qua OrderSettlementService của Commerce và verified settlement
trong caller transaction; không vòng phụ thuộc hoặc Order/Payment lock mới.
Recovery audit items chỉ chứa references và thời gian cần đối chiếu, không sao
chép full payment payload. Không thêm file upload evidence trong slice này.

Contract chung cũ recover chỉ có enrollmentId/status; plan riêng bổ sung
`admissionBasis` để Staff xác nhận trường hợp CASH late rõ ràng. Giới hạn1000 rows
giữ plan chung; parser global64KiB không đáp ứng riêng recovery nên dùng route-specific256KiB
đã nghiệm thu trên built app ở4.3.5 (1000 rows, 1001 rows, đúng/vượt256KiB). Không nâng global limit.
Unknown legacy actor nullable là chủ ý; actor recovery có audit riêng, không gán
người thao tác hôm nay làm người đã dạy/bắt đầu/chốt trong quá khứ.

## 4. Các bước triển khai và gate

| Bước | Deliverable vertical slice | Gate |
|---|---|---|
| 4.3.1 Correction | Shared policy, PUT/permissions, CORRECT audit, version/receipt | Completed/CANCELLED/terminal Class matrix, exact midnight/post-lock clock, all-or-nothing/no-op/replay |
| 4.3.2 Audit read | Staff controller/query/DTO, stable paginated join, recovery reference nullable | Scoped auth/filter, multiple pages/tie ordering, no data/private/no-store, EXPLAIN fixture |
| 4.3.3 Recovery evidence foundation | New migration/entities + Enrollments/Payments public readers + lifecycle participant | SQL FK/RESTRICT, paid/late CASH/late PayOS/terminal enrollment eligibility, no dependency cycle |
| 4.3.4 Recovery command + history | Staff POST, insert-only bounded roster, clocks/state/evidence audit/receipt | Legacy/terminal no reopen, missing data, timestamp preservation, fault rollback, concurrent recovery |
| 4.3.5 HTTP + handoff | Route parser limit, nested DTO/guards, Swagger/examples/Postman, documentation update | Built-app correction/audit/recovery role matrix + 256KiB/1000 rows boundaries; full check/test:http |

Audit reader4.3.2 có thể trả recoveryAuditId null trước4.3.3; khi migration mới
đến thì cập nhật provider cùng release, không query bảng chưa deploy. Mỗi bước
cần service/API/assertions nghiệm thu, không tạo toàn schema rồi để auth/API cuối.

## 5. API và FE sequence

Contract đã triển khai tại [API 4.3](../../api_flow/PHASE_4_3_flow-api-breakdown.md).
Prefix /api/v1, cookie access_token; mutations200, required key/version.

| Route | Hiện tại | Sau4.3 |
|---|---|---|
| GET /class-sessions/:sessionId/attendance |4.2 regular roster/totals | Additive permissions; giữ totals whole roster |
| PUT /class-sessions/:sessionId/attendance |4.2 baseline;4.3 mở rộng | Thêm COMPLETED/Staff CANCELLED correction; closed states chỉ PRESENT/ABSENT |
| GET /management/class-sessions/:sessionId/attendance-audits | Đã có | Staff paginated history + optional enrollment filter, version/recovery reference |
| POST /management/class-sessions/:sessionId/attendance/recover | Chưa có | Staff evidence command; rows insert-only, clocks preserve, terminal Class unchanged |

FE correction: GET roster → chọn changed rows → xác nhận/reason Staff → PUT →
refetch roster/audit. Recovery: Staff chọn Session từ management4.1 → GET roster
và audit → xác nhận times/roster/payment evidence/basis → POST → refetch. Network
retry giữ key/body; stale409 refetch và xác nhận lại, không tự đổi version/retry.
Không đưa Student schedule/summary vào gate4.3 vì projection4.4c chưa có.

## 6. Ma trận verification bắt buộc

| ID | Scenario / assertion cần có | Lớp kiểm chứng |
|---|---|---|
| T43-01 | Completed correction trước midnight1ms, exact deadline, sau lock wait; giữ clocks/deadline | Domain + PostgreSQL integration |
| T43-02 | Mentor Class COMPLETED hợp lệ, CANCELLED reject, old assignment/unknown teaching/inactive/role-change reject cả replay | PostgreSQL + HTTP |
| T43-03 | Staff sửa CANCELLED đã start, terminal enrollment; never-started reject; UNMARKED closed422 | Integration + HTTP |
| T43-04 | Present/absent checkedInAt, no-op same status, foreign row trong batch rollback, totals toàn roster | Integration |
| T43-05 | Two edits, correction/finalize/sync/assignment/class completion/cancel; một version commit hợp lệ, no lost audit | Real PostgreSQL races |
| T43-06 | Same key/body replay/no duplicate; changed key body409; stale409; audit/receipt failure rollback | Integration fault injection |
| T43-07 | Audit staff auth/filter scoped, no data, multipage/same timestamp tie, private,no-store | Integration + built HTTP |
| T43-08 | Legacy COMPLETED clocks null và roster có evidence; terminal Class SCHEDULED→COMPLETED, không reopen/entitlement | Integration |
| T43-09 | Giữ clocks/mentor/actors đã biết; mismatch409; future/overnight/start>=end reject; historical actors unknown null | Integration + HTTP |
| T43-10 | Paid trước start với canceled/completed enrollment; CASH late có hold/evidence; pending/unpaid/new hold/PayOS late reject | PostgreSQL với settled fixtures |
| T43-11 | Existing attendance row409 toàn recover rollback; thiếu evidence422/no-data; explicit ABSENT duy nhất, không ABSENT omissions | Integration |
| T43-12 | Recovery/recovery, recovery/correction/sync/assignment/settlement/withdrawal; FK/version và evidence snapshot nhất quán | Real PostgreSQL races + lock-order review |
| T43-13 | Recovery audit/lifecycle/record/receipt fault rollback; no partial clocks/rows/version; retry không extend deadline | Integration |
| T43-14 | Clean/up-down-up/legacy no-data/RESTRICT/rollback refusal, index/query plan lớn | Migration integration |
| T43-15 | Cookie guards, path400, DTO422/whitelist, Staff reason/nested basis, 1000/1001 rows và parser byte limit413 | Built-app HTTP/Swagger |
| T43-16 | Regression4.1/4.2/CASH owner/Materials access, full check và test:http no unreported skip | Dedicated PostgreSQL *_test full gates |

Viết tests có assertion state/rows/audit/receipt/version, không chỉ status200.
Test canceled Session fixture có history không thay thế cancel orchestration4.4a.
Migration rehearsal chạy test DB, không migrate dev/VPS cho task planning.

## 7. Rollout, rollback và Definition of Done

1. Phối hợp migration sequence với Phase3; thêm migration mới sau prerequisites
   4.1/4.2/calendar, không sửa file đã có. Chốt SHA/order/config và parser gate.
2. Backup, dừng writers nếu migration DDL giữ lock, deploy schema trước code.
   APP_TIME_ZONE khớp calendar baseline; không sửa clocks/actors/attendance legacy.
3. Smoke correction Mentor/Staff, audit filter, evidence recovery legacy/terminal,
   replay/revocation và CASH historical evidence; ghi local/server/browser riêng.
4. Có recovery/attendance history thì giữ schema, rollback application tương thích.
   Down từ chối nếu đã có new evidence; không xóa audits để ép rollback. Code4.2
   có thể đọc roster nhưng không xử lý correction/recover; bàn giao limitation.
5. DoD local: AC43-01–22 và T43 matrix có assertions/evidence; pnpm check và
   pnpm test:http pass với dedicated *_test, số pass/skip rõ; Swagger/Postman,
   plan/progress/flow/API đồng bộ. Runtime parser limit và paid lineage là gates.
6. Local DoD không đóng deployment4.5, Student4.4c, guest/cancel/leave; metrics,
   rate-limit/i18n baseline còn mở, không ghi completed nhờ functional tests.

## 8. Implementation và handoff ngày 2026-10-13

4.3.1–4.3.5 đã có source: PUT correction, AttendanceAuditService/Staff controller,
RecoverAttendanceDto + evidence policy/providers, recovery entities/migration và
SessionLifecycle.recover. Giữ Class→Session lock order, không settlement/network
hoặc entitlement writes. Recovery unknown historical actors/mentor giữ null.

Audit tables vẫn theo append-only event convention4.2 (không updated_at);
recovery root có entity riêng và item composite PK. Migration thêm composite FKs
Session/record/enrollment/order detail/payment và RESTRICT để giữ exact lineage.
Paid CASH yêu cầu matching confirmation reference; PayOS yêu cầu SUCCEEDED +
matching SETTLED event/currency/amount/result, paid_at khớp Order.

Parser256KiB dùng Nest useBodyParser với type predicate chỉ POST route recover,
đăng ký trước parser64KiB; không thêm direct express dependency. Nested UUIDs
normalize lowercase, reject duplicate/null/unknown rows. Audit time lấy server
clock sau lock waits thay vì PostgreSQL transaction-start default khi ghi mới.

[Progress4.3](../../progress/phase%204/PHASE_4_3_PROGRESS.md) ghi test evidence và
rollout. [Postman4.3](../../../postman/Mindy-Attendance-Phase43.postman_collection.json)
và [API](../../api_flow/PHASE_4_3_flow-api-breakdown.md) là handoff BE. Deployment4.5,
Student4.4c, guest4.4b và cancel/leave4.4a vẫn pending.

Nghiệm thu local cuối lượt2026-10-13:pnpm check PASS397/397 tests/39 suites và
pnpm test:http PASS39/39 tests/5 suites,0 skip. Recovery reason bắt buộc tại DTO/
service/Swagger;byte/rows/parser/role/migration/race/fault gates có assertions.
Handoff Postman/docs đã đồng bộ;không deploy/FE/browser/live-payment mới.
