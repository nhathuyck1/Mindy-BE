# Implementation phases

2026-10-26 — **Phase6 backend local acceptance complete39/39 AC**:8 slices PASS, dev16→32 migrations/repeat no-op; full check691/691, HTTP117/117 và restore/ops PASS. [Báo cáo hiện hành](../progress/phase%206/PHASE_6_PROGRESS.md#docker-acceptance-2026-10-26) có24 revoke barriers, contract/log harness và source fingerprint. FE/VPS/production IAM/load acceptance cần evidence riêng.


2026-10-26 — **Nghiệm thu tự động Phase6 theo8 slices**: [kết quả39 AC và evidence](../progress/phase%206/PHASE_6_PROGRESS.md#nghiệm-thu-tự-động-theo-slice--2026-10-26);13 PASS/26 PARTIAL, chỉ tick tiêu chí có đủ bằng chứng trong plan riêng. Local gates và deployment/FE acceptance được ghi riêng; Phase6 chưa đóng.


2026-10-26 — **Tách kế hoạch Phase 6 theo slice như Phase 4**: [mục lục 6.0–6.7](phase%206/PHASE_6_CHAT_NOTIFICATIONS.md#kế-hoạch-triển-khai-theo-slice), mỗi slice một file riêng; giữ 59 tasks/39 acceptance criteria và dependency. Chỉ tổ chức lại tài liệu, không thay trạng thái triển khai hoặc nghiệm thu.

2026-10-24 — **Phase6 runtime đã triển khai local**: group/DM, CASH source entitlement,
AES-GCM/retry, Socket.IO/replay, edit/delete/read, inbox và scoped image/PDF.
Swagger/Postman, maintenance CLI và DB/key restore rehearsal đã có. Flags mặc định
tắt; chưa deploy/FE sign-off. Xem [Progress6](../progress/phase%206/PHASE_6_PROGRESS.md)
và [runbook](../PHASE_6_CHAT_RUNBOOK.md); planning logs bên dưới giữ lịch sử.

2026-10-24 — **Planning Phase6 Chat / Notification**: nhóm lớp tự động, DM mentor–
student, CASH pending/ACTIVE entitlement, AES-256-GCM tại backend, Socket.IO,
retry/recovery, read receipt, inbox và file/image theo slice riêng. Chưa implement.
[Plan6](phase%206/PHASE_6_CHAT_NOTIFICATIONS.md) ·
[Flow6](../api_flow/PHASE_6_FLOW.md) ·
[API proposal6](../api_flow/PHASE_6_flow-api-breakdown.md) ·
[Progress6](../progress/phase%206/PHASE_6_PROGRESS.md).

Chi tiết Phase6 đã bổ sung: [8 slices6.0–6.7](phase%206/PHASE_6_CHAT_NOTIFICATIONS.md#slice-60),
59 tasks/39 acceptance criteria, dependency, source/test targets và R0–R4 handoff.
Tất cả còn TODO implementation; read6.4, inbox6.5, attachments6.6, full gates6.7.

2026-10-22 — Phase5 QUIZ đã implement local trên `codex/phase5-assignments`:
mentor soạn/publish đề, student start/resume/autosave/nộp toàn bài, BE chấm và trả
result, durable timeout worker. ZIP pipeline/grading và reports A3-A5 còn TODO.
Chi tiết [progress Phase5](../progress/phase%205/PHASE_5_PROGRESS.md); không sửa FE/deploy.

Planning baseline 2026-10-22 (lịch sử, trạng thái mới xem progress từng phase):
[Phase4.6 Mentor workspace](phase%204/PHASE_4_6_MENTOR_TEACHING_WORKSPACE.md)
(detail/quyền dạy thay/reports/stored progress/notes) và
[Phase5 Assignment](phase%205/PHASE_5_ASSIGNMENTS.md) (TEST/HOMEWORK,
QUIZ ABCD timer optional, ZIP deadline ngày/giờ). Assignment thuộc ClassSession
theo DBML; QUIZ đã có runtime slice nêu trên. Quiz nộp toàn bài rồi BE mới chấm/trả đáp án.
Xem flow/API/progress được liên kết trong từng plan; không đổi 4.5 release thành done.

2026-10-16 — Phase2.4 A–C đã implement source: manager class/contact, HR directory/relationships, order/payment read. D summary backlog; local gates xem progress2.4; chưa deploy. Các đoạn planning dưới giữ lịch sử theo thời điểm.

2026-10-16 — **Planning Phase2.4 Manager HR + kế toán**: rà soát quyền đã có,
bổ sung kế hoạch class/contact → mentor/student directory/history → global
order/payment read. Không mở blanket admin; giữ manager mutations hiện có và
Student/CASH/PayOS flow. [Plan2.4](phase2/PHASE_2_4_MANAGER_OPERATIONS.md),
[flow](../api_flow/PHASE_2_4_FLOW.md),
[API proposal](../api_flow/PHASE_2_4_flow-api-breakdown.md),
[progress](../progress/phase%202/PHASE_2_4_PROGRESS.md).
Chưa triển khai/runtime tests/deploy2.4; finance summary là backlog đề xuất.

2026-10-16 implementation:4.4c đã có source schedule/own attendance/Staff
reports/backlog,20 focused PG/3 compiled HTTP4.4c/13 timetable regression pass.
Full gates tại [Progress4.4](../progress/phase%204/PHASE_4_4_PROGRESS.md);
[contract implemented](../api_flow/PHASE_4_4_flow-api-breakdown.md#13-44c--quy-ước-và-contract-chung)
và Swagger/Postman cùng revision. Không migration/env/dependency/FE mới;
leave/approved intervals và release4.5 còn riêng. Các log planning dưới giữ lịch sử.

2026-10-16: user xác nhận **4.4b đã xong**. Bắt đầu planning4.4c trong
[plan4.4 mục4](phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md#4-44c--lịch-student-tổng-hợp-và-hàng-chờ-vận-hành):
22 AC/20 test scenarios/5 bước credit→schedule→own history/summary→Staff reports/
backlog→gates/handoff. [Progress4.4](../progress/phase%204/PHASE_4_4_PROGRESS.md)
và [API dự kiến4.4c](../api_flow/PHASE_4_4_flow-api-breakdown.md#13-44c--quy-ước-và-contract-chung)
cùng revision. Chưa code/test4.4c; leave/approved intervals vẫn gap source riêng,
không suy xác nhận4.4b thành deployment. Log dưới giữ ngày gốc.

2026-10-15: bắt đầu [Phase4.4](phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md)
bằng Session operations đầu4.4a và Class cancellation batch; check413/413 và
HTTP42/42 local,0 skip. [Progress4.4](../progress/phase%204/PHASE_4_4_PROGRESS.md)
core4.4b đã có source; giữ leave approval/approved intervals/4.4c/4.5 mở; chưa deploy4.4.

Thư mục này chuyển các milestone cấp cao trong `CORE_FLOW_IMPLEMENTATION_PLAN.md`
thành kế hoạch triển khai có thể giao việc và nghiệm thu.

## Thứ tự thực hiện

1. [Phase 0 — Foundation, database và deployment baseline](./phase%201/PHASE_0_FOUNDATION.md)
2. [Phase 1 — Registration, users, Google/password authentication và authorization baseline](./phase%201/PHASE_1_IDENTITY_AUTH.md)
3. [Phase 2 — Course registration, checkout, payment và enrollment](./phase2/PHASE_2_COURSE_TO_PAYMENT.md)
4. [Phase 2.1 — Test webhook PayOS trên server, confirm đã pass](./phase2/PHASE_2_1_WEBHOOK_VPS_PAYOS.md)
5. [Phase 2.2 — Tích hợp payOS vào BE và nghiệm thu giao dịch thật](./phase2/PHASE_2_2_PAYOS_BE_REAL_PAYMENT.md)
6. [Phase 2.3 — My Classes + Personal Schedule](./phase2/PHASE_2_3_MY_CLASSES_SCHEDULE.md)
7. [Phase 3 — File + Materials](./phase%203/PHASE_3_FILES_MATERIALS.md)
8. [Phase 3.1 — Policy + Contract, D1–D6 đã code và test local](./phase%203/PHASE_3_1_POLICY_CONTRACT.md)
9. [Phase 3.2 — Upload private và xác minh file, đã chốt local/VPS](./phase%203/PHASE_3_2_SAFE_UPLOAD.md)
10. [Phase 3.3 — Material management/review và Class Unit release, Manager/Mentor authoring, review/publication và Class Unit release đã có local](./phase%203/PHASE_3_3_MATERIAL_MANAGEMENT.md)
11. [Phase 3.4 — Student ARTICLE/FILE/VIDEO access và staff preview, implemented local](./phase%203/PHASE_3_4_STUDENT_MATERIAL_ACCESS.md)
12. [Phase 4 — Attendance, nghỉ dạy, học bù và mentor dạy thay, 4.1–4.3 implemented local](./phase%204/PHASE_4_ATTENDANCE_OPERATIONS.md)
13. [Phase 4.1 — Mentor availability/substitution, plan chi tiết và review code](./phase%204/PHASE_4_1_MENTOR_SUBSTITUTION.md)
14. [Phase 4.2 — Session lifecycle/attendance, plan chi tiết và review code](./phase%204/PHASE_4_2_SESSION_ATTENDANCE.md)
15. [Phase 4.3 — Correction, evidence recovery và audit history, implemented local](./phase%204/PHASE_4_3_ATTENDANCE_CORRECTIONS_HISTORY.md)
16. [Phase 4.4 — Session operations/guest/Student operations đã implement; leave/release còn mở](./phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md)

2026-10-13: tiếp planning4.3 theo cấu trúc4.1/4.2:22 AC,16 test scenarios,
5 bước correction→audit→evidence foundation→recover→HTTP/handoff và ma trận
source/tests/gaps. [Progress4.3](../progress/phase%204/PHASE_4_3_PROGRESS.md) /
[Flow4.3](../api_flow/PHASE_4_3_FLOW.md) /
[API4.3 dự kiến](../api_flow/PHASE_4_3_flow-api-breakdown.md).
Planning log ở trên là lịch sử. Implementation4.3 hiện đã có focused runtime gates;full gates xem Progress4.3,chưa deploy.

Review và sửa2026-10-13: core4.1/4.2 cùng gap test gates pass local
(check359/359, HTTP33/33); dependencies/release chưa đóng. Theo dõi AC→code→tests→gap tại
[Progress4.1](../progress/phase%204/PHASE_4_1_PROGRESS.md) và
[Progress4.2](../progress/phase%204/PHASE_4_2_PROGRESS.md).
Plan riêng giữ scope nghiệm thu, không đổi phần chưa làm thành done.

Phase 2.3 đã implement; các suite PostgreSQL/HTTP hiện có pass local ngày 2026-10-10.
Xem [contract FE](../PHASE_2_3_FE_CONTRACT.md) và progress bên dưới.
FE navigation/lịch: [Flow 2.3](../api_flow/PHASE_2_3_FLOW.md) và
[API breakdown 2.3](../api_flow/PHASE_2_3_flow-api-breakdown.md).

Điều phối hiện hành theo user2026-10-13: người khác triển khai **3.3–3.6**,
user nhận handoff deploy/nghiệm thu server. **FE do nhóm riêng phụ trách; repo FE
local chỉ để đọc, không sửa.** Backend bàn giao Swagger/Postman/contract và cases
browser; browser evidence ghi riêng với BE checks. Phân công user làm toàn Phase3
ở ghi chép trước đây là lịch sử; thứ tự danh sách là roadmap, không yêu cầu chờ2.3.
Phase 2.3 hoàn thiện Student đăng ký lớp → danh sách lớp → detail/preview → lịch;
xem [PHASE_2_3_PROGRESS.md](../progress/phase%202/PHASE_2_3_PROGRESS.md). Phase 3 ưu tiên
3.1 quyền/contract, 3.2 upload an toàn, 3.3 quản lý tài liệu, 3.4 Student đọc/tải,
3.5 metadata/cleanup và 3.6 nghiệm thu/tích hợp; 3.1 đã có role MANAGER,
policy/domain transitions và context providers. 3.2 có upload/storage/validation API;
review/material persistence API tiếp tục ở 3.3.

Ngày 2026-10-12 đã hoàn thiện [plan 3.3](./phase%203/PHASE_3_3_MATERIAL_MANAGEMENT.md)
sau nghiệm thu VPS3.2: typed ARTICLE/FILE/VIDEO + Manager CRUD/persistence → Mentor context/draft/submit
→ Manager review/publication → Class Unit release → acceptance/handoff 3.4.
Theo dõi [progress 3.3](../progress/phase%203/PHASE_3_3_PROGRESS.md),
[flow](../api_flow/PHASE_3_3_FLOW.md) và
[API breakdown dự kiến](../api_flow/PHASE_3_3_flow-api-breakdown.md).
Mỗi slice có local gate và server acceptance riêng; estimate BE provisional7–10 ngày.
Student ARTICLE/assets/binary preview/video playback ở3.4. Ngày2026-10-13 đã implement
Manager typed CRUD3.3.1, Mentor context/submission3.3.2 và review/publication3.3.3 local;
migrations additive3.3.1/3.3.3, tests và Swagger/Postman đã có. Release3.3.4 đã implement local; chưa deploy3.3. Ngày2026-10-14 Student ARTICLE/assets và staff preview3.4 đã implement local ([flow3.4](../api_flow/PHASE_3_4_FLOW.md)); chưa deploy/VPS.

Lịch sử điều phối2026-10-13: [plan phối hợp3.3/3.4](./phase%203/PHASE_3_4_MATERIAL_ACCESS_PREVIEW.md) phân công schema/consumer, staff preview cùng review và user deploy/nhóm FE tích hợp. Đó là planning trước implementation14/10; GET preview/assets đề xuất đã được thay bởi POST files/access hiện hành.

3.1 policy/contract đã hoàn tất và full local gates pass (171 tests/16 suites,
HTTP 5/5). 3.2 hoàn tất local: full check 217 tests, focused Files 42,
HTTP 19 pass; upload policy theo chiều Materials → Files giữ contract/errors 3.1.
Theo dõi tại [PHASE_3_2_PROGRESS.md](../progress/phase%203/PHASE_3_2_PROGRESS.md) và
[runbook](../PHASE_3_2_FILES_RUNBOOK.md). Ngày 2026-10-12 user xác nhận nghiệm thu
VPS xong và chốt 3.2; ảnh PDF/MP4 READY/private final objects đã ghi trong progress.
Sau implementation3.3/3.4, các gate tiếp theo là tích hợp nhánh, server/browser
acceptance và phần3.5/3.6 theo progress; không tạo lại CRUD/review đã có.

Phase 3 đã chốt D1–D6 ngày 2026-10-09: Course Unit 1–N Material, tài liệu chính
shared giữa các lớp; Manager quản lý/sửa/duyệt, Mentor upload chờ duyệt;
Student ACTIVE còn phải qua unit release/approval/publication. Theo dõi tại
[PHASE_3_PROGRESS.md](../progress/phase%203/PHASE_3_PROGRESS.md).

Kế hoạch tiếp nối sau checkout:
[Webhook VPS → PayOS BE → deploy test](./phase2/PHASE_2_WEBHOOK_VPS_PAYOS_PLAN.md).
Kế hoạch tiếp nối giữ thiết kế B–D và baseline lịch sử. Ngày 2026-10-05 webhook
server đã confirm pass; payment BE đã implement/test local theo Phase 2.2,
VPS payment/giao dịch thật chờ user thực hiện theo runbook. Các giới hạn test A1
vẫn được ghi riêng; xem progress riêng của Phase 2.2 để phân biệt evidence.

Mặc định các phase sau bắt đầu khi prerequisites/exit criteria liên quan đã đạt;
ngoại lệ và hạng mục còn mở phải ghi rõ. User đã yêu cầu lập Phase 2.2 sau confirm
webhook; các test A1 còn thiếu được kiểm chứng trước nghiệm thu live BE, không
đánh dấu toàn bộ Phase 0/1/2 đã hoàn tất. Mỗi phase phải là
một vertical slice chạy được từ migration đến API và test, không triển khai toàn bộ
entity trước rồi mới quay lại làm controller/service.

## Quy ước chung

Phase 4 đã lập plan ngày2026-10-13, user bắt đầu song song khi người khác làm
Phase3; 4.1–4.2 implemented/tested local, chưa deploy: 4.1 available mentor và dạy thay → 4.2 Session
start/roster/mark/finalize → 4.3 correction/recovery/audit theo calendar deadline → 4.4a nghỉ trước
hai ngày lịch có duyệt/bù buổi hoặc ngày/auto endDate → 4.4b học bù lớp khác cùng
Course Unit/guest credit → 4.4c Student/operations → 4.5 integration/release.
Mentor mở điểm danh trong ngày học, không overnight; hạn ghi/chốt hết ngày kế tiếp
theo APP_TIME_ZONE (thứ Ba→00:00 thứ Năm). Chưa chốt không kéo
dài interval chiếm lịch. GET trống lịch hiện tính primary/substitute; nghỉ APPROVED
chỉ nối vào candidates/checker khi4.4a triển khai,
PATCH/approval kiểm concurrency; giữ cash Order snapshot và Materials policy.
Notification/email tự động còn hoãn. 4.3 correction/recovery/audit đã implement local;
4.4a/b/c và4.5 vẫn planned. Xem
[flow](../api_flow/PHASE_4_FLOW.md),
[API dự kiến](../api_flow/PHASE_4_flow-api-breakdown.md) và
[progress](../progress/phase%204/PHASE_4_PROGRESS.md). Shared Classes/StudentLearning
và migration sequence cần phối hợp người làm Phase3 trước merge.

- PostgreSQL là database duy nhất của core flow.
- TypeORM sở hữu entity và migration; `synchronize` luôn là `false`.
- Migration được commit vào Git và là nguồn sự thật thực thi của schema.
- Mỗi migration có đúng một người tạo trong một nhánh; người còn lại review SQL.
- Controller chỉ xử lý HTTP; business workflow nằm trong application service hoặc
  command/query handler.
- Không trả TypeORM entity trực tiếp ra API.
- Không dùng database production cho development hoặc integration test.
- Hoàn tất triển khai một phase phải cập nhật `docs/progress/Progress.md` và chạy
  `pnpm check`; thay đổi chỉ tài liệu kiểm tra diff/link, không ghi là đã chạy test BE.
- Đọc toàn bộ `document/Flow.txt` trước khi chốt rule nghiệp vụ; ghi rõ diễn giải
  triển khai và yêu cầu được hoãn, không bỏ cash preview/mentor confirmation/mail.


2026-10-14: Phase3.3.5 local acceptance/handoff đã chuẩn bị; full checks và server evidence theo progress3.3. VPS/sign-off còn pending; không thêm API/schema.

2026-10-13: Phase4.1 đã implement/test local (check310/310, HTTP29/29).
4.2–4.5 giữ planned; xem Progress và contract4.1. Chưa deploy migration4.1.

2026-10-13: Tiếp4.2 đã implement/test local: attendance migration/roster/start/
sync/mark/finalize/staff clock recovery; check328/328, HTTP30/30. Full actual
contract ở API breakdown mục15. 4.3–4.5 vẫn planned, chưa deploy migrations4.1/4.2.

Implementation4.3 ngày2026-10-13:correction/audit/evidence recovery đã có API/schema/
public payment providers và parser256KiB. [Progress4.3](../progress/phase%204/PHASE_4_3_PROGRESS.md)
ghi local gates và rollout;4.4a/b/c→4.5 tiếp tục pending,chưa deploy.


## 2026-10-15 — Tiếp 4.4b: học bù lớp khác

Đã triển khai migration1792022400001, Staff queue/candidates/create/cancel placement,
Student own placements, capacity với checkout, guest roster/mark/finalize/audits,
Student context đúng target và requeue/completion guards. Late CASH/PayOS activation
không bị từ chối vì trùng replacement; ghi queue atomic. Flow/API/Postman cùng revision.
User xác nhận a xong; source hiện tại vẫn thiếu workflow leave/approved intervals,
không đánh dấu candidates đã kiểm approved leave. 4.4c/4.5 vẫn pending. Không sửa FE,
không migrate dev/VPS hoặc giao dịch thật. Gate hiện hành xem Progress4.4.
## Tích hợp hai nhánh — 2026-10-15

Materials3.3/3.4 và dev/Phase4.1–4.3 được hợp nhất trên feat/phase-3-3.
Planning13/10 và implementation13–14/10 được giữ đúng mốc; các plan GET preview/
assets13/10 là lịch sử, contract hiện hành POST files/access đã có14/10.
Hai migration bridge mới xử lý constraint trùng, không sửa migration đã chạy;
catalog22, clean/upgrades/data/FK/down-up3/3 pass. Full check513/513 (48 suites),
HTTP60/60 (5 suites), lint/type-check/build pass local. Xem [progress tích hợp](../progress/phase%203/PHASE_3_3_PROGRESS.md).
Không đổi các gate server/browser/FE chưa nghiệm thu thành done.
