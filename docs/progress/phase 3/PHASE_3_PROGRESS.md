# Phase 3 — Tiến độ File + Materials

Cập nhật: **2026-10-15**.
Kế hoạch: [PHASE_3_FILES_MATERIALS.md](../../implement_phase/phase%203/PHASE_3_FILES_MATERIALS.md).

## Hiện trạng

- 2026-10-15: Đã xử lý conflict với dev/Phase4, giữ implementation Materials13–14/10.
  Quyết định schema22/bridge và kết quả tích hợp ở mục cuối; các ghi chép bên dưới
  ngày11–13/10 là lịch sử planning tại thời điểm đó, không thay trạng thái hiện hành.

- 2026-10-14:3.3.1–3.3.4 đã implement local;3.3.5 acceptance/handoff local đã chuẩn bị. Full gates và VPS evidence ở [progress3.3](PHASE_3_3_PROGRESS.md); VPS/sign-off còn pending. Student FILE/VIDEO read đã có; ngày2026-10-14 ARTICLE/assets/staff preview đã implement local ([progress3.4](PHASE_3_4_PROGRESS.md)); browser video runtime/VPS còn pending.


- 2026-10-13: Lịch sử điều phối theo user: người khác triển khai3.3–3.6,
  user nhận deploy/server acceptance; FE là nhóm riêng và repo local chỉ đọc.
  [Plan3.4 phối hợp](../../implement_phase/phase%203/PHASE_3_4_MATERIAL_ACCESS_PREVIEW.md)
  đưa staff preview/assets cùng review3.3.3; typed Student reader sau contract3.3.1,
  server journey sau publication/release. Đồng bộ plan3.3/3.4, flow/API/index/
  progress; chỉ tài liệu BE, không source/FE/migration/runtime tests/deploy.

- 2026-10-12: 3.2 đã nghiệm thu VPS theo xác nhận user (PDF/MP4 READY/private
  objects có evidence); hoàn thiện plan3.3 typed ARTICLE/FILE/VIDEO, refs/sanitizer/
  review/release và gate local + server mỗi slice. Chưa implement3.3; Student/
  signed GET/preview/video runtime ở3.4. Xem plan/progress3.3.

- 2026-10-11: User muốn full flow Phase3 với ARTICLE HTML, FILE, VIDEO MP4 private;
  cập nhật contract3.3, sanitize/reference/read/video gates. Không làm HLS hoặc
  external video. Mỗi slice cần server acceptance; user báo code3.2 đã trên server,
  MinIO provisioning/runbook đã chuẩn bị local, chưa có runtime VPS evidence.

- 2026-10-11: User xác nhận 3.1/3.2 đã xong; lập
  [plan 3.3](../../implement_phase/phase%203/PHASE_3_3_MATERIAL_MANAGEMENT.md),
  [progress riêng](PHASE_3_3_PROGRESS.md), [flow](../../api_flow/PHASE_3_3_FLOW.md)
  và [API breakdown dự kiến](../../api_flow/PHASE_3_3_flow-api-breakdown.md).
  Chia Manager CRUD/persistence → Mentor context/submission → review/publication
  → release → acceptance. Chưa Material schema/API/code; chỉ kiểm tài liệu,
  không chạy BE/DB/MinIO tests, migrate hoặc deploy.

- 2026-10-09: **3.2 hoàn tất code và nghiệm thu local**: Files upload/complete/status,
  private versioned MinIO, bounded validation/lease/retry/expiry và reference lock.
  Full check 217 tests/18 suites; focused Files sau bổ sung 42/42; HTTP 19/19,
  lint/type-check/build pass, không skip. Chi tiết tại [progress 3.2](./PHASE_3_2_PROGRESS.md)
  và [runbook](../../PHASE_3_2_FILES_RUNBOOK.md). Chưa migrate dev/VPS/deploy.

- 2026-10-09: User xác nhận 3.1 hoàn tất/pass toàn bộ; đã rà soát
  [plan 3.2](../../implement_phase/phase%203/PHASE_3_2_SAFE_UPLOAD.md) và
  [progress riêng](./PHASE_3_2_PROGRESS.md) theo source/evidence mới. Bỏ gate chờ
  bàn giao; bổ sung policy delegation Materials → Files, errors/declaration khớp
  3.1 và candidate history qua retry. Chỉ sửa tài liệu, chưa Files/storage/worker.

- Planning riêng [Phase 3.1](../../implement_phase/phase%203/PHASE_3_1_POLICY_CONTRACT.md)
  D1–D6 đã duyệt; theo dõi tại [PHASE_3_1_PROGRESS.md](./PHASE_3_1_PROGRESS.md).
  User xác nhận Course Unit 1–N Material, tài liệu chính theo DBML; chọn Session
  link tùy chọn, không đổi ownership. Manager quản lý/sửa/duyệt; Mentor upload chờ duyệt.

**3.1 hoàn tất local; 3.2 hoàn tất local và nghiệm thu VPS theo user2026-10-12.
Files upload/storage/validation API đã có. Typed Material authoring/review/release3.3
và Student ARTICLE/FILE/VIDEO reads, scoped assets/staff preview3.4 đã implement local.
VPS/browser/FE và user sign-off3.3/3.4 vẫn pending; evidence3.2 không thay nghiệm thu này.**

- Điều phối mới: user làm Phase 3, người khác làm Phase 2.3 song song. Không dùng
  2.3 như điều kiện bắt đầu P3; tích hợp navigation là gate nghiệm thu riêng.
  Đây là phân công lịch sử; điều phối3.3–3.6 ngày2026-10-13 ở đầu tài liệu thay thế.
- Đã chia plan thành Phase 3.1–3.6, mỗi mục có mục tiêu/công việc/đầu ra/gate.
  Ưu tiên 3.1 quyền/contract → 3.2 upload an toàn → 3.3 quản lý → 3.4 Student
  đọc/tải; 3.5 metadata/cleanup, 3.6 quality/integration. Đã implement policy 3.1.

- Đã đọc DBML, toàn bộ Flow.txt, COURSE_FLOW, usecase-course.drawio, DB design
  review và đối chiếu source/config/progress hiện có.
- Phạm vi hiện hành: File + Materials chính của Course Unit. Đề xuất cũ về
  Class Unit/Session material riêng đã bị thay thế bởi clarification của user;
  Session dùng theo dõi công việc riêng, không phải owner Material.
- User duyệt D1–D6; plan tổng/3.1/COURSE_FLOW/CORE_BUSINESS_LOGIC đã đồng bộ.
  Review transitions/revision đã có domain code; persistence/schema/API thuộc 3.3,
  chưa migration Materials. Ghi DB phải bảo đảm khóa/compare revision nguyên tử.
- Giữ CASH pending preview, xác nhận mentor theo order snapshot, verified PayOS
  settlement và online email; Phase 3 không thay payment hoặc cấp quyền từ progress.
- Code có CASH confirm/preview và mentor roster; evidence roster deploy không
  chứng minh nghiệm thu thanh toán PayOS tiền thật đã hoàn tất.

## Theo dõi từng bước

| Bước | Trạng thái | Evidence/đầu ra |
|---|---|---|
| Lập plan | Hoàn tất | Plan, tiến độ riêng và index; schema/policy/API/milestone/test/rollout dự kiến. |
| 3.1 Policy + contract | Hoàn tất code/test local D1–D6 | Role, domain policy/review transitions, facade/context providers; pnpm check 171 tests/16 suites + build, HTTP 5/5. |
| 3.2 Upload slice | Hoàn tất local + nghiệm thu VPS theo user2026-10-12 | Files/MinIO/migration/worker/reference; PDF/MP4 READY/private objects; chi tiết progress3.2. |
| 3.3 Material management | 3.3.1–3.3.5 implemented/local verified | Typed authoring/review/release, refs/audit/schema và acceptance/handoff; VPS/user sign-off pending. |
| 3.4 Student access + staff preview | ARTICLE/FILE/VIDEO và scoped assets/staff preview implemented local14/10 | Pinned-version URLs/recheck/Range/expiry và typed reads có local evidence; VPS/browser/FE pending. Xem [progress3.4](PHASE_3_4_PROGRESS.md). |
| 3.5 Metadata/lifecycle | Chưa thực hiện | Chưa có worker/cleanup/purge evidence. |
| 3.6 Quality gate/rollout | Chưa thực hiện | 3.1/3.2 đã test local; full journey 3.3–3.6, staging và deploy chưa nghiệm thu. |

## Kiểm tra lượt planning ban đầu — 2026-10-09 (lịch sử)

- Kiểm tra diff whitespace và liên kết Markdown cục bộ của tài liệu mới/chỉnh sửa.
- Không chạy `pnpm check`, HTTP/DB/MinIO tests vì lượt này chỉ lập kế hoạch.
- Không đổi source, DBML, deployed migration, cấu hình production hoặc gửi giao dịch.
- Giữ các chỉnh sửa đã có trong `docs/progress/Progress.md`; thêm entry mới riêng.

## Điểm mở khi bắt đầu triển khai — baseline lịch sử09–12/10

1. Implement scope Course Unit đã chốt; Mentor draft/submit và Manager review đúng revision.
2. Giữ shared live đã duyệt; snapshot/versioning nội dung không nằm MVP.
3. Chốt MinIO public/internal endpoint, file limits/allowlist và extractor resource limits.
4. Giữ vấn đề quyền học sau enrollment COMPLETED để quyết định riêng.
5. Khi nghiệm thu, phân biệt local test, storage staging, production và payment live;
   các thiếu hụt Phase 0/1/2 không tự được đánh dấu hoàn tất nhờ Phase 3.

### Kết quả kiểm chứng cuối sau tích hợp — 2026-10-15

- Node22.20.0/pnpm12.6.0, dedicated PostgreSQL17 test tại localhost:15433 và MinIO
  test local: **pnpm check513/513,48 suites; lint/type-check/build pass**.
- **pnpm test:http60/60,5 suites**, dùng cấu hình mặc định đã nhận từ dev
  (fileParallelism:false), built Nest runtime/cookies/guards và migrations đầy đủ22.
  Không critical skip hoặc unhandled errors trong hai lượt cuối.
- Sau khi rút gọn suffix DB fixture để không bị PostgreSQL truncate mất _test,
  chạy lại lint/type-check và focused migration compatibility: **3/3 pass**.
  Thay đổi cuối này chỉ ở tên/guard DB test, không đổi production code/migrations.
- Lượt trước bridge có HTTP startup fail vì constraint trùng; kết quả60/60 ở trên
  là lượt chạy sau sửa, không dùng skip ở lượt thất bại làm evidence pass.
- 14 conflict đã giải quyết; không sửa migration lịch sử, không migrate DB
  development/VPS hoặc FE. Giữ ngày13/10 planning/Phase4,13–14/10 implementation
  Materials,15/10 integration như các mục riêng. Server/browser/user sign-off còn pending.
