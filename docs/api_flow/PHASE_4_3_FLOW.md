# Phase 4.3 — Flow correction, evidence recovery và audit history

**2026-10-13: IMPLEMENTED, focused PostgreSQL/built-app HTTP verified local; chưa deploy.**
[Plan](../implement_phase/phase%204/PHASE_4_3_ATTENDANCE_CORRECTIONS_HISTORY.md) ·
[Progress](../progress/phase%204/PHASE_4_3_PROGRESS.md) ·
[API](PHASE_4_3_flow-api-breakdown.md) · [Flow Phase4](PHASE_4_FLOW.md).

## 1. Correction sau chốt — đã triển khai

1. Effective Mentor hoặc Staff mở Session từ schedule/management4.1, GET roster4.2
   để lấy session.version, editableUntil, totals toàn roster và permissions.
2. Session COMPLETED đã start: Mentor sửa trước00:00 ngày học+2 theo APP_TIME_ZONE,
   kể cả Class COMPLETED; Staff không deadline, reason required. CANCELLED Session
   đã start hoặc Class CANCELLED chỉ Staff. Never-started không tạo rows bằng PUT.
3. FE gửi changed rows PRESENT/ABSENT, version và key UUIDv4. Không UNMARKED sau
   chốt/hủy; IN_PROGRESS giữ mark/unmark4.2.
4. Server Class→Session locks → current actor/assignment → receipt replay hoặc
   expectedVersion/state/calendar policy → validate toàn bộ rows → write status,
   CORRECT audit/version/receipt cùng transaction. Không reset clocks/deadline.
5. No-op không version/audit mới; response200 WriteView, refetch roster/context.
   Staff refetch audit nếu đang mở lịch sử; Student projection vẫn4.4c.
6. Mất mạng retry key/body cũ; stale409 refetch/reconfirm; hết hạn Mentor chuyển
   Staff; role/assignment revoked403 dừng ghi, không retry tự động.

## 2. Staff evidence recovery — đã triển khai

1. Staff chọn Session có thiếu lịch sử từ management4.1; GET roster + audit.
   SCHEDULED đã diễn ra hoặc COMPLETED thiếu data có thể recover, kể cả Class
   terminal. IN_PROGRESS dùng finalize4.2; CANCELLED Session không recover.
2. Nhập UTC/ISO clocks có timezone, reason, evidenceNote và roster có chứng cứ
   (enrollmentId/status/admissionBasis). Xác nhận phần có evidence đầy đủ; thiếu
   evidence giữ no-data. Không dùng ACTIVE hôm nay làm roster lịch sử.
3. Server recheck ancestry/cutoff/verified payment lineage. PAID_BEFORE_START hoặc
   paid CASH late với hold có trước start và Staff xác nhận; PayOS late/pending/
   unpaid không đủ. Enrollment COMPLETED/CANCELLED không tự mất lịch sử trả tiền.
4. Class→Session locks, version/idempotency và evidence snapshot; clocks đã biết
   phải trùng body. Insert-only roster: row đã có409 toàn request rollback,
   Staff sửa row ấy bằng correction riêng. Không thay cả roster.
5. SCHEDULED→COMPLETED; legacy giữ COMPLETED. Giữ Class terminal, người dạy/actor
   lịch sử đã biết; người lịch sử unknown null, recovery actor ở audit. Deadline
   theo ngày lịch startsAt, không lấy ngày recovery. Không activate enrollment.
6. Atomic clocks/rows/recovery evidence/audits/version/receipt →200 WriteView →
   refetch roster + audit. Thiếu chứng cứ422 giữ no-data; conflict409 xem lại state.

## 3. Staff đọc lịch sử — đã triển khai

Roster → mở History → GET management attendance-audits, page1/pageSize20,
optional enrollmentId của row. Staff-only; paginated occurredAt DESC,id DESC.
ADMIT/MARK/FINALIZE lịch sử4.2 vẫn có; CORRECT/RECOVER sau4.3 thêm reason/version
và recovery reference/evidence summary. Empty là chưa có audit trong filter,
không chứng minh Student vắng hoặc đã đủ dữ liệu. Không polling mặc định.

## 4. Quan hệ với phases khác

4.1 assignment và4.2 start/snapshot/mark/finalize là prerequisites. Calendar rule
đã triển khai4.2, không đổi thành actual start+24h ở4.3. CASH settlement phải
commit trước admission; substitute vẫn không là cash Order owner. Recovery đọc
payment evidence qua public provider, không gọi settlement/network trong tx.

4.3 giữ canceled attendance/history nhưng không triển khai cancel command4.4a.
Guest/placements4.4b dùng bảng riêng; không nhận foreign-Class regular rows.
Student own history/summary/backlog/denominator4.4c cần consume dữ liệu này sau,
không thêm vào response /me hiện tại trong slice4.3. Materials access vẫn
theo Phase3. Deployment/browser/real-payment evidence ghi riêng ở4.5.

## 5. Ghi chép công việc và verification

2026-10-13: đọc plan/progress4.1/4.2, plan/contract Phase4, Flow.txt và code
Attendance/Classes/Enrollments/migration/parser. Tạo plan/progress/flow/API riêng
4.3, AC43-01–22 và T43-01–16, ghi gap source so với yêu cầu. Bổ sung proposed
admissionBasis và route parser256KiB vì recover1000 rows vượt baseline64KiB.
Đồng bộ entrypoints Phase4/index/progress/combined flow. Verification tài liệu
ghi tại progress4.3; chưa có code/DB migration/runtime tests/FE/deploy4.3.
Diff check pass;30 local links/5 JSON examples của4 tài liệu mới hợp lệ;
22 AC/16 scenarios khớp. Đây là documentation verification, không BE gates.

2026-10-13 implementation: bổ sung correction COMPLETED/Staff CANCELLED, audit GET
Staff scoped/paginated, evidence recovery insert-only + migration1791849600003,
public enrollment/payment readers và lifecycle recovery không reopen Class.
Parser riêng256KiB nhận1000 rows; giữ64KiB trên routes khác. Focused tests gồm
31 PostgreSQL cases,2 migration rehearsal,5 domain cases và4 built-app HTTP journeys.
Full check/test:http evidence ở Progress4.3; không sửa FE/deploy/VPS/live payments.

Nghiệm thu local cuối lượt2026-10-13:pnpm check PASS397/397 tests/39 suites và
pnpm test:http PASS39/39 tests/5 suites,0 skip. Recovery reason bắt buộc tại DTO/
service/Swagger;byte/rows/parser/role/migration/race/fault gates có assertions.
Handoff Postman/docs đã đồng bộ;không deploy/FE/browser/live-payment mới.

2026-10-14 — Deployment handoff clarification: Phase4.1–4.3 adds no required env
variable. Keep APP_TIME_ZONE consistent between migration and API; existing
Asia/Ho_Chi_Minh default applies if unset. DATABASE_URL remains the existing
production PostgreSQL URL. TypeORM migration:run executes all pending migrations
in timestamp order and skips recorded ones; do not invoke numeric filenames
individually. Existing dev deployment workflow already builds, backs up DB and
runs the compiled one-off migration before replacing the API. Manual Compose
commands must preserve compose.files-production.yaml when .env.minio.production
exists so Files scratch configuration is retained. This is read-only source
verification/documentation; no migration, server deploy or runtime test was run.
