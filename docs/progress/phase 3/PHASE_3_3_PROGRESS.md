# Phase 3.3 — Tiến độ Material management

Cập nhật: **2026-10-12**.
Plan: [PHASE_3_3_MATERIAL_MANAGEMENT.md](../../implement_phase/phase%203/PHASE_3_3_MATERIAL_MANAGEMENT.md).
Flow: [PHASE_3_3_FLOW.md](../../api_flow/PHASE_3_3_FLOW.md).
API dự kiến: [breakdown 3.3](../../api_flow/PHASE_3_3_flow-api-breakdown.md).

## Hiện trạng

- 2026-10-12 (tư vấn UX Unit/bài học): User muốn CKEditor FE + HTML BE như trang
  đọc kiến thức. Đề xuất Course Unit metadata/description + nhiều Material ARTICLE,
  không thêm bảng details trùng content. PDF dùng FILE riêng hoặc attachment;
  upload READY không tạo/publish Material hay tự chuyển sang HTML. Đã đối chiếu
  entity/controller hiện tại: FILE/VIDEO read có sẵn, ARTICLE/authoring/attachments
  còn planned. Cập nhật plan/flow/breakdown; không implement/migrate/deploy ARTICLE.
- Cùng lượt chạy lại pnpm seed:course-class trên DB development local: tạo 0 lớp
  vì cohort đã tồn tại; query xác minh HTML-CSS-101-10S-20261013 có 5 Course Unit,
  5 Class Unit và 10 Session, hai buổi mỗi Unit (13/10–14/11). Không ghi Material.
  Phần tư vấn không có implementation/test ARTICLE. Sau yêu cầu tiếp theo seed3
  lớp, code seed đổi và pnpm check298/298 pass (27 suites); xem progress2.3,
  không dùng kết quả seed/tests này làm evidence triển khai ARTICLE3.3.

- 2026-10-12: 3.2 đã nghiệm thu VPS theo xác nhận user; hoàn thiện plan3.3 từ
  bản nháp, thống nhất ARTICLE HTML/FILE/VIDEO trong schema/domain/DTO/flow.
  Bổ sung gate local + server từng slice, batch lock mọi primary/inline/attachment
  refs trước Class locks, safe summaries và bàn giao3.4. Estimate BE provisional
  7–10 ngày, chốt sau sanitizer/batch-lock spike. Chưa implement/test/deploy3.3.

- 2026-10-11: User mở rộng scope thành ARTICLE lưu HTML, FILE và VIDEO MP4 private
MinIO+signed URL; HLS sau. Đã cập nhật plan/flow/breakdown cho sanitize, nullable
file có CHECK theo loại, inline/attachment refs, Student article/asset access và
video Range/expiry. API/source 3.3 vẫn chưa implement; estimate file-only cũ cần
hiệu chỉnh. User muốn nghiệm thu API trên server ở mỗi slice, không chỉ local.

**Đã lập kế hoạch; chưa implement Phase 3.3.** User xác nhận 3.1/3.2 đã xong.
Policy/review domain, Files READY reference lock và Classes context có sẵn;
đã có Material FILE/VIDEO read persistence và ba Student GET theo
[read slice3.4](PHASE_3_4_PROGRESS.md); chưa authoring/review/release HTTP.
Khi triển khai typed schema3.3, mở rộng bằng migration additive mới.

## Lượt planning — 2026-10-11

- Đọc Flow.txt, rules, plans/progress 3.1/3.2 và source policy/Files/Classes/schema.
- Chia 5 bước: Manager persistence/CRUD → Mentor context/draft/submit → Manager
  review/publication → Class Unit release → full checks và bàn giao 3.4.
- Kế thừa Course Unit owner/shared live/firstApprovedAt/revision và role đã chốt.
  Ghi schema/audit/ancestry guards, file/class lock ordering, visibility trước
  pagination, transaction actor/assignment checks, test matrix và rollout.
- Bổ sung kế hoạch Mentor unit/session picker; không thay roster/payment DTO.
  Item detail để FE refetch conflicts; API planned đều đánh dấu chưa triển khai.
- Ghi drift: ParseUUIDPipe path 400 khác body/query 422; chưa có global CSRF
  guard. Đề xuất Origin check cho mutation mới, không mô tả CORS là CSRF protection.
- Student read/download và Manager/Mentor binary preview ở 3.4; 3.3 nghiệm thu
  state/metadata review, không tuyên bố human binary review đã dùng được.
- Kiểm diff whitespace, liên kết cục bộ tài liệu mới/cập nhật và ví dụ JSON.
  Không chạy BE/HTTP/DB/MinIO tests; không migrate dev/VPS, deploy, sửa FE hoặc payment live.

## Theo dõi triển khai

| Bước | Trạng thái | Gate |
|---|---|---|
| Plan | Hoàn tất | Plan + flow/API + progress/index đồng bộ |
| 3.3.1 Typed Manager draft | Chưa làm | ARTICLE-only/sanitize/refs/FILE/VIDEO + schema/READY/ancestry/audit/locks; server CRUD cases |
| 3.3.2 Mentor context/submission | Chưa làm | Assignment + own draft + ID mapping + hidden pagination |
| 3.3.3 Review/publication | Chưa làm | Revision/races/no-op retry/firstApprovedAt |
| 3.3.4 Class Unit release | Chưa làm | Class/Unit locks, time semantics, Classes audit |
| 3.3.5 Acceptance/handoff | Chưa làm | Full local checks + server evidence từng slice/actual FE contract; 3.4 handoff |

## Lượt hoàn thiện plan — 2026-10-12

- Lấy nghiệm thu3.2 làm baseline, không yêu cầu upload gate lại.
- Hợp nhất plan từ file-only + addendum thành typed ARTICLE/FILE/VIDEO; CHECK theo
  loại, references table, HTML-only không file, safe summary/detail và sanitizer bounds.
- Đồng bộ API examples bắt buộc contentType, fileId theo loại, nullable file và
  list omit HTML; workflow review/revision/firstApprovedAt giữ baseline.
- Ghi multi-file lock gap của provider3.2: cần batch khóa mọi file trước Class,
  khóa union old/new refs khi replacement và kiểm actor cùng transaction.
- Chia việc + local gate + server acceptance3.3.1–3.3.5; preview binary/Student/
  signed GET/video Range thuộc3.4, cleanup refs thuộc3.5; không đợi3.6 mới deploy.
- Kiểm diff whitespace, local links/anchors và JSON examples của tài liệu cập nhật.
  Kết quả: git diff --check pass; 9 tài liệu, 95 local links và 9 JSON examples
  hợp lệ, không lỗi link/anchor/JSON.
  Không chạy pnpm check/DB/HTTP/MinIO tests, migration, source/FE hoặc deploy.

## Evidence và phần còn mở

Evidence 3.1/3.2 đã có trong progress riêng; không phải test pass 3.3.
Chưa có migration SQL review, Material DB/HTTP tests, preview binary, UI/VPS smoke.
Chốt SQL ancestry/parent locks và reviewer trước merge khi implement 3.3.1.
Manager picker inactive catalogue là gap UI riêng; không cấp quyền Admin tạm.
