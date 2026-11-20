# Phase 2.4 — Progress Manager HR + kế toán

## 2026-10-16 — Lập kế hoạch, chưa triển khai

User yêu cầu manager xem lớp/course/mentor/student, vai trò HR + kế toán.
Đã đối chiếu source: manager có course GET, teaching class/timetable/assignment,
attendance/materials và CASH; thiếu directory/profile/relationships và tra cứu
orders/transactions xuyên toàn trung tâm. Không mở blanket quyền admin.

Đã lập [plan](../../implement_phase/phase2/PHASE_2_4_MANAGER_OPERATIONS.md),
[flow](../../api_flow/PHASE_2_4_FLOW.md),
[API proposal](../../api_flow/PHASE_2_4_flow-api-breakdown.md), ma trận quyền,
20 acceptance criteria, thứ tự A class/contact → B HR → C finance; D summary
là backlog. Giữ mutations manager hiện có, Student/payment/access invariants.

Bảng dưới là baseline lúc planning; implementation/evidence hiện hành ở mục triển khai cuối file.

| Slice | Trạng thái | Evidence |
|---|---|---|
| 2.4A class/course/contact | Planned | Audit controllers/DTO/services; chưa code |
| 2.4B mentor/student HR | Planned | Chưa có manager directories trong source |
| 2.4C orders/payment read | Planned | Chưa có global manager order/payment APIs |
| 2.4D finance summary | Backlog đề xuất | Cần chốt DTO/semantics trước implement |

Kiểm chứng lượt này: đọc source, kiểm liên kết local và diff. Không chạy BE tests,
build, migrations, deploy, sửa FE hoặc giao dịch thật. Kết quả601/601 và72 HTTP
ở nhật ký CASH trước đó là evidence lượt trước, không phải test Phase2.4.

## 2026-10-16 — Triển khai A–C và bàn giao BE

Đã implement ManagerOperationsModule (read facade, không sở hữu entity):

- A: giữ list fields/sort, thêm filter course/mentor/mode/q; detail course/capacity/
  unit/session/enrollment counts; units phân trang; contact chỉ trong Manager DTO;
  class/student detail role STUDENT và effective enrollment đúng ancestry.
- B: danh bạ/hồ sơ mentor/student role-scoped, target suspended vẫn đọc;
  mentor classes/schedule effective/substitute, range31 ngày và cancelled allocation;
  student history gồm CANCELLED và đăng ký lại, mỗi enrollment một dòng.
- C: global CASH/PAYOS orders/payment, filter trước pagination bằng EXISTS/subquery,
  order summary không nhét details; detail snapshot + payment nullable; collector
  MANAGER/LEGACY_MENTOR từ reference, safe review reason allowlist. Không gọi provider/
  SMTP hoặc ghi settlement/enrollment qua GET. Admin mutations/reconcile vẫn chặn.

Queries qua exported providers Users/Classes/Teaching/Enrollments/Commerce/Payments;
compose trong REPEATABLE READ, contact batch. Class roomName=null vì phòng theo
session. Collector displayName là tên hiện tại, không bịa historical-name snapshot.
CANCELLED chưa start dùng allocation hiện tại cho support, không teaching credit;
terminal có teachingMentorId giữ snapshot hiện hữu. Student access/Materials gates
và manager write scopes hiện có giữ nguyên. Không FE/schema/migration/env/dependency.

Local evidence lượt triển khai:
- `pnpm check` lần đầu: lint/type-check/build +614/614,61 suites, không skip.
- Sau bổ sung kiểm chứng cancelled/re-enrollment/query: focused Phase2.4 9/9.
  Query page1 so với100 không tăng từng dòng (9 SQL ở page nhỏ, page lớn<=9),
  EXPLAIN ANALYZE BUFFERS0.047ms trên fixture nhỏ; không phải production benchmark.
- `pnpm test:http`:76/76,8 suites; Phase2.2 HTTP16 có3 case manager mới kiểm mọi
  GET, role/auth/current session/validation/wrong-role target và admin mutations;
  Files HTTP41 có plaintext create/patch/mixed modes, PDF/MP4/MP3 bytes thật với MinIO.
- Gate cuối sau annotation/UUID contract được cập nhật ở dưới khi hoàn tất.

Swagger/Postman/flow/API breakdown cùng source revision. User làm rõ yêu cầu
Word là định dạng tài liệu .docx để upload/approve, không phải tạo file bàn giao.
DOCX đã có allowlist Files; bổ sung HTTP full review journey và handoff ở3.3.

Chưa deploy/VPS/browser/real payment trong lượt này. Không suy tests local thành
A1/live settlement đã pass. D finance summary vẫn backlog; rate-limit/metrics/i18n
riêng cho GET chưa có và index production cần dữ liệu đại diện, như breakdown§7.

Lượt gate cuối đầu tiên615 tests có2 thất bại trong suite2.4 khi nguồn đang được
chỉnh và có focused run dùng cùng suffix DB test. Lượt đó không được coi là pass;
đã cố định source, dừng focused runs và chạy lại tuần tự toàn gate. Kết quả cuối
được ghi ngay sau đây khi hoàn tất. Không sửa business rule chỉ để né lỗi test.

Gate tuần tự cuối: `pnpm check` PASS —615/615 tests,61 suites, lint/type-check/build
đều exit0, không skip. Nguồn Commerce filter đã cố định và9 focused2.4 đã pass;
lượt chạy lẫn nguồn trước đó không được dùng làm evidence pass. Sau làm rõ Word,
thêm1 HTTP acceptance DOCX và chạy lại toàn HTTP; kết quả ghi ngay dưới khi xong.
Không còn deliverable docs/word: user yêu cầu loại file .docx để approve.

Kết quả cuối đã xác minh: **pnpm check615/615 (61 suites) PASS**, **pnpm test:http
77/77 (8 suites) PASS**,0 skip. Files HTTP42/42 gồm ca Word DOCX upload byte thực,
validate READY, FILE draft→submit→reject/edit→approve→Student detail/signed Range
access→withdraw; response kind DOCUMENT/MIME Office Word được kiểm. Final lint
434 files và type-check đều pass. Không FE/VPS/browser/live transaction mới.
Postman có Word FILE create/approve và plaintext revision chaining, API docs cập
nhật cùng source. Yêu cầu định dạng Word .docx đã được xác nhận end-to-end local.


## Rà soát sẵn sàng VPS ngày 2026-10-16

Đối chiếu Dockerfile, compose.production.yaml và workflow Deploy: image build từ
source và compiled migration catalog; push dev chạy check trước self-hosted deploy.
Increment2.4/contentText/DOCX approval không thêm migration/env/dependency. Local
check615 và HTTP77 đã pass. Working tree còn modified/untracked, cần commit đầy đủ
file mới trước push; không coi source local là đã có trên remote/VPS. Upload cần
MinIO/FILE_JOB hiện hữu đang hoạt động. Chưa agent deploy hoặc smoke test trên VPS;
sau rollout kiểm readiness, manager class list và DOCX upload/approve thực tế.
Đây là review cấu hình/readiness, không chạy lại BE tests trong lượt review này.
