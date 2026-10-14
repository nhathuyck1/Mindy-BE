# Implementation phases

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
10. [Phase 3.3 — Material management/review và Class Unit release, đã lập plan](./phase%203/PHASE_3_3_MATERIAL_MANAGEMENT.md)
11. [Phase 3.4 — Material access/staff preview, plan phối hợp 3.3](./phase%203/PHASE_3_4_MATERIAL_ACCESS_PREVIEW.md)
12. [Phase 4 — Attendance, nghỉ dạy, học bù và mentor dạy thay, 4.1–4.2 verified local](./phase%204/PHASE_4_ATTENDANCE_OPERATIONS.md)
13. [Phase 4.1 — Mentor availability/substitution, plan chi tiết và review code](./phase%204/PHASE_4_1_MENTOR_SUBSTITUTION.md)
14. [Phase 4.2 — Session lifecycle/attendance, plan chi tiết và review code](./phase%204/PHASE_4_2_SESSION_ATTENDANCE.md)
15. [Phase 4.3 — Correction, evidence recovery và audit history, implemented local](./phase%204/PHASE_4_3_ATTENDANCE_CORRECTIONS_HISTORY.md)

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
Student access/binary preview/video playback ở3.4. Authoring/review/release/
ARTICLE3.3 chỉ planning; ba Student FILE/VIDEO GET và read migration đã có local
ở3.4. Không có runtime tests hoặc deploy3.3 trong lượt lập plan.

Ngày2026-10-13 lập [plan3.4 phối hợp3.3](./phase%203/PHASE_3_4_MATERIAL_ACCESS_PREVIEW.md):
3.3.1 chốt typed schema/refs/policy → staff primary preview sau draft persistence,
Mentor sau context3.3.2; staff preview/assets nghiệm thu cùng review3.3.3.
Student typed reader/assets code sau contract3.3.1, server journey sau approve/
release3.3.3/3.3.4. Ba Student FILE/VIDEO GET đã có local verified; ARTICLE/staff
preview/assets vẫn planned. Một chủ schema/migration, user nhận SHA/migration/
config/checks/Postman/smoke/rollback khi bên triển khai bàn giao; không đợi3.6
mới deploy slice. Lượt này chỉ tài liệu BE, không source/FE/migration/runtime tests/deploy.

3.1 policy/contract đã hoàn tất và full local gates pass (171 tests/16 suites,
HTTP 5/5). 3.2 hoàn tất local: full check 217 tests, focused Files 42,
HTTP 19 pass; upload policy theo chiều Materials → Files giữ contract/errors 3.1.
Theo dõi tại [PHASE_3_2_PROGRESS.md](../progress/phase%203/PHASE_3_2_PROGRESS.md) và
[runbook](../PHASE_3_2_FILES_RUNBOOK.md). Ngày 2026-10-12 user xác nhận nghiệm thu
VPS xong và chốt 3.2; ảnh PDF/MP4 READY/private final objects đã ghi trong progress.
Bước tiếp theo là triển khai 3.3 CRUD/review nội dung theo plan đã có.

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
Notification/email tự động còn hoãn. Các slice sau4.2 vẫn planned. Xem
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


2026-10-13: Phase4.1 đã implement/test local (check310/310, HTTP29/29).
4.2–4.5 giữ planned; xem Progress và contract4.1. Chưa deploy migration4.1.

2026-10-13: Tiếp4.2 đã implement/test local: attendance migration/roster/start/
sync/mark/finalize/staff clock recovery; check328/328, HTTP30/30. Full actual
contract ở API breakdown mục15. 4.3–4.5 vẫn planned, chưa deploy migrations4.1/4.2.

Implementation4.3 ngày2026-10-13:correction/audit/evidence recovery đã có API/schema/
public payment providers và parser256KiB. [Progress4.3](../progress/phase%204/PHASE_4_3_PROGRESS.md)
ghi local gates và rollout;4.4a/b/c→4.5 tiếp tục pending,chưa deploy.
