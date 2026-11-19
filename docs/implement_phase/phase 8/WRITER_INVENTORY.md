# Phase 8 — Writer inventory và transaction boundary

Review BE `757be19`, 20/11/2026. **Source review; capture mới chưa implement.**
[Catalog](EVENT_CATALOG.md) · [Policy](RECIPIENT_POLICY.md) · [Phase 8](PHASE_8_CONTRACTS_POLICY.md).

## 1. Quy tắc capture

Mỗi dòng là writer thật đã đọc. Capture đề xuất dùng cùng EntityManager transaction
với state/audit/receipt, trước commit; không publisher sau response hoặc sau HTTP
webhook rồi mở transaction khác. Snapshot before cần lấy trước save/trigger cascade.
Một canonical capture factory kiểm semantic delta, unique event identity và cause.
Chỉ owner boundary ở bảng capture; wrappers/helpers khác truyền context, không emit lại.

Không lấy mọi audit row làm notification: audit có no-op, draft và event ngoài catalog.
Không tạo trigger business mới trong Phase 8; cách nối source là deliverable phase sau.
Admin SQL/seed/migration/backfill không là producer notification mặc định; mọi writer
production mới phải vào inventory và dùng capture, không dựa vào chat lifecycle outbox.

## 2. Schedule / mentor

Prefix source: `src/modules/classes/services/` trừ chỗ ghi rõ.

| Writer thật / symbol | Mutation / boundary capture được chọn | Event / cause |
| --- | --- | --- |
| session-operations.service.ts / reschedule → class-schedule.saveRescheduled + audit | Capture tại audit RESCHEDULE, so starts/ends before/after, dùng transaction mutate | N01/session.version; cause command |
| classes.service.ts / updateSessionTimes → class-schedule.updateSessionTimes | Bulk hiện không gọi audit; phải thêm capture từng row sau final validation, snapshot trước save | N01/session.version, một cause bulk |
| weekly-schedule.service.ts / apply | Update session có sẵn qua audit RESCHEDULE; new session không N01; DRAFT không gửi | N01 cho delta hợp lệ, cause command |
| weekly-schedule.service.ts / swap | Hai session save+audit trong mutate; không đổi mentor | Hai N01, chung cause swap |
| teaching-assignment.service.ts / assignSession | Sau save+audit, so effectiveMentor trước/sau; không chỉ mentorOverrideId | N02/session.version |
| teaching-assignment.service.ts / assignClass | Snapshot affectedSessions trước đổi primary; sau validation capture từng session thật đổi | N02/session.version, cause class command |
| classes.service.ts / update | Từ chối mentorId, không phải writer đổi mentor; name/meeting URL không trong catalog | Không event |
| session-operations.service.ts / cancel → class-schedule.cancelSession | Snapshot regular/guest/mentor trước save status; capture tại audit CANCEL | N03/session.version |
| classes.service.ts / cancel → transition + cancelClassSessions | Orchestrator đặt class cause, snapshot audience trước child cancels, capture N04 một lần trong transaction transition | N04/class:CANCELLED; suppress N03 ở helper |
| session-operations.service.ts / makeup | Insert successor trực tiếp + audit MAKEUP; không đi qua replaceCancelledSession | N05/new session.version; không capture source version bump |
| teaching-operations/services/mentor-leave.service.ts / mutate(approve) → approve | Cancel nguồn qua cancelSession, insert successor qua replaceCancelledSession, transition APPROVED cùng transaction | N03 + N05 + N13; chung leave cause, không N01 giả |
| class-schedule.service.ts / replaceCancelledSession | Transaction participant gọi audit MAKEUP; caller giữ class/session locks | N05, dùng context leave |
| classes.service.ts / scheduleSession → class-schedule.addSession | Khởi tạo lịch thường; chưa có type SESSION_CREATED | Không event |
| class-schedule.service.ts / finishScheduleBatch, recordConflicts | Calendar/bookkeeping, không phải publisher thứ hai | Không event độc lập |
| database/migrations/1792022400001-cross-class-makeup.ts / requeue_cancelled_makeup_target | Trigger đổi target placements sang NEEDS_REASSIGNMENT khi session CANCELLED | Không N16; N03/N04 đã snapshot guest trước trigger |

`audit` được chọn làm participant cho RESCHEDULE/CANCEL/MAKEUP, không phải consumer
quét lịch sử. Khi thêm capture ở helper audit phải nhận context rõ ràng để suppress
class cascade và loại schedule khởi tạo. Rollback sau audit phải rollback cả event.
assignClass chỉ affectedSessions theo policy nguồn; không gửi theo primary mentor
cho session có override/teachingMentor giữ nguyên.

## 3. Assignments / materials

| Writer source trong src/modules/ | Semantic delta / capture boundary | Event |
| --- | --- | --- |
| assignments/services/assignments.service.ts / publish | Sau validation/readiness và UPDATE status/revision, cùng transaction, before changed()/return | N06 |
| assignments/services/assignments.service.ts / update → draft | Chỉ DRAFT; không dùng cho hạn published | Không N07 |
| assignments/services/zip-submissions.service.ts / extend | Sau UPDATE due_at/revision, chỉ khi dueAt khác; attempts-only không gửi | N07 |
| assignments/services/code-authoring.service.ts / extend | Writer CODE riêng, sau UPDATE/audit CODE_EXTENDED trong transaction | N07 |
| assignments/services/zip-submissions.service.ts / grade | Chỉ current_version/revision, released_version giữ nguyên | Không N08 |
| assignments/services/zip-submissions.service.ts / release | UPDATE released_version thành version mới và audit RELEASE | N08/submission+gradeId:releasedVersion |
| assignments/services/code-judge.service.ts, code-review.service.ts / rejudge, void | CODE state/results và code_submission.updated; chưa có release workflow | Không business grade event |
| assignments/services/quiz-attempts.service.ts | Submit/timeout và result QUIZ hiện hữu | Không business grade event |
| assignments/services/assignments.service.ts / archive, remove | Thay đổi visibility, không publish event mới | Revalidate/ẩn notice active |
| materials/services/material-authoring.service.ts / review → material-review.applyMaterialCommand | APPROVE đặt approvedRevision và publishedAt; PUBLISH cũng có thể mở visible state; capture sau save+audit | N17/content revision, notBefore=max(publication,availableAt) |
| materials/services/material-authoring.service.ts / create, patch, submit, delete | Không gửi draft/submit; patch/invalidation có thể làm mất approval; delete ẩn | Không N17 nếu chưa publication transition |
| materials/services/material-retention.service.ts / bulkDelete | Soft-delete và publishedAt=null | Chỉ ẩn active notice, không publish |

N17 snapshot class-context references và active enrollment trước commit, dedupe
user nhiều class; worker kiểm canReadMaterial/ready refs tới notBefore. Không gọi
read endpoint để đánh dấu đã đọc tài liệu khi chỉ phát noti.

## 4. Payments / expiry

| Writer source trong src/modules/ | Transaction và canonical owner | Event / dedupe |
| --- | --- | --- |
| payments/services/payment-settlement.service.ts / webhook → settle | Provider verify, lock/validate; gọi orders.markPaid và activate enrollment trong settle transaction | N09 capture duy nhất tại markPaid participant |
| payments/services/payment-reconciliation.service.ts / reconcile → settle | Provider link PAID đi qua cùng settlement; không capture ngoài reconcile | N09 reuse canonical owner |
| payments/services/cash-payments.service.ts / confirm | Confirm lock/validate, gọi markPaid trong transaction confirm; duplicate PAID branch return | N09 reuse canonical owner |
| commerce/services/order-settlement.service.ts / markPaid | Hiện conditional UPDATE PENDING, trả void; khi nối capture phải xác nhận UPDATE affected/RETURNING trước tạo event | N09/orderId:PAID, actor nullable được caller truyền |
| commerce/services/order-expiry.service.ts / expireOverdueBatch → expire | Cron own transaction, claim PENDING với lock | N11 capture từng order đổi thật trong expire |
| commerce/services/checkout.service.ts / checkout → expireOverdueForClasses → expire | Cleanup hết hạn là participant cùng checkout transaction, không chỉ cron | N11 reuse expire; checkout rollback thì cleanup/event cũng rollback |
| commerce/services/order-cancellation.service.ts / cancel | PENDING → CANCELLED, không EXPIRED | Không N11; reminder visibility bị invalidate |
| payments/services/payment-settlement.service.ts / PaymentConfirmationEmailEntity insert + payment-email.service.ts / sendBatch | Email hiện có độc lập, không canonical in-app producer | Không phát N09 lần hai |
| Worker reminder mới (Phase 12) | Lock/recheck PENDING, expiry ISO trong 24h, capture event+snapshot cùng transaction; notBefore=now | N10/orderId:expiresAt ISO |

N09 ghi cùng transaction với payment success/enrollment activation; nếu activate
thất bại thì markPaid/event rollback. Sample webhook, duplicate và REQUIRES_REVIEW
không chạm canonical transition. Actor webhook/cron=null; CASH/reconcile truyền
principal id, owner exception giữ Student nhận notice.

## 5. Leave / placements

| Writer source trong src/modules/ | Capture boundary | Event |
| --- | --- | --- |
| teaching-operations/services/mentor-leave.service.ts / create | Sau INSERT request+items+audit, trước receipt/save return; chỉ PENDING | N12/request.version |
| teaching-operations/services/mentor-leave.service.ts / mutate → transition | Approve/reject transition thật, cùng request version; approve helper emits schedule qua context | N13/N14/request.version |
| teaching-operations/services/mentor-leave.service.ts / mutate withdraw/expired branch | WITHDRAWN/EXPIRED khác REJECTED | Không N14; pending-request notice ẩn |
| attendance/services/makeup-placement.service.ts / create | Sau insert+audit+conflict update+target version, trước receipt cùng transaction | N15/placement.version |
| attendance/services/makeup-placement.service.ts / cancel | Snapshot target mentor/Student trước state; sau UPDATE CANCELLED+audit | N16/placement.version |
| Trigger requeue_cancelled_makeup_target | Không phải explicit cancel, đã nằm inventory schedule | Không N16 |

## 6. Source-review evidence — AC8-2

Đã search call sites của saveRescheduled/updateSessionTimes/cancelSession/
replaceCancelledSession/markPaid/expireOverdueForClasses và SQL writers
due_at/released_version/publishedAt. Các đường phát sinh phụ đã đưa vào bảng:
weekly apply/swap, leave replacement, checkout cleanup, CODE extend và material
APPROVE auto-publication. Source review chứng minh boundary để Phase 9–14 nối code;
chưa chứng minh runtime exactly-once, lock race hoặc rollback capture mới.
