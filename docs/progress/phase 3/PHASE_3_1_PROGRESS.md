# Phase 3.1 — Tiến độ Policy + Contract

Cập nhật: **2026-10-09**.
Plan: [PHASE_3_1_POLICY_CONTRACT.md](../implement_phase/PHASE_3_1_POLICY_CONTRACT.md).

## Hiện trạng

**Hoàn tất code policy + contract 3.1 D1–D6 và kiểm tra local.
Upload/storage, persistence và HTTP APIs thuộc 3.2–3.4, chưa triển khai.**

- Theo yêu cầu hoàn tất full 3.1 trước 3.2, đã đăng ký MaterialsModule và export
  MaterialPolicyService; chưa có Material entity/controller hoặc migration Materials.
- Provider Catalog/Classes giải quyết Course Unit → Class Unit → Session, kiểm tra
  ancestry và trả context không chứa entity/meeting URL. Facade kiểm tra user/role
  hiện hành, assignment Mentor và enrollment ACTIVE từ provider có sẵn.
- Domain triển khai draft/edit/submit/approve/reject/publish/unpublish/soft-delete,
  revision và audit output. Sửa nội dung thu hồi approval/publication; dấu mốc lần
  duyệt đầu tiên giữ quyền sửa tài liệu đã duyệt ở Manager qua mọi bản draft sau.
- Material luôn thuộc Course Unit; Session link tùy chọn, shared giữa các lớp.
  Quyền đọc kiểm tra release riêng của lớp, thời gian, approval đúng revision,
  publication và file READY; Session hủy không tự thu hồi tài liệu chính.
- Allowlist/MIME/size/filename MVP được kiểm tra ở mức declaration; binary validation
  thuộc 3.2. Snapshot/file reference phải lấy từ persistence của server.
- Transition trả kết quả policy, chưa ghi DB; 3.3 phải khóa/compare revision nguyên
  tử khi persist, không coi domain test là bằng chứng xử lý concurrency DB.

- User làm rõ **Course Unit 1–N Material**, tài liệu chính của Course Unit;
  đối chiếu DBML materials dòng 607–619 và Ref dòng 984, giữ course_unit_id NOT NULL.
- User chọn phương án 1: Session link tùy chọn; đây là liên kết sử dụng, không
  đổi owner sang Class Unit/Session. Session đi qua Class Unit phải khớp Course Unit.
- D2: Manager role riêng quản lý/sửa/duyệt; Mentor upload draft/submit chờ duyệt,
  không tự approve/publish hoặc sửa tài liệu chung đã duyệt.
- D3/D4/D5/D6: ACTIVE + release + review/publication; tài liệu shared giữa các lớp
  cùng Course Unit; enrollment COMPLETED không tự có quyền; MVP file-only.
- Plan có D1–D6, policy quản lý/đọc, provider/module ownership, contract API/DTO,
  HTTP 422 theo baseline, allowlist/limits/TTL, storage/worker và ma trận threat cases.
- Đã bổ sung UserRole.MANAGER, DBML enum và migration mới
  `1791504000000-restore-manager-role.ts`. Không sửa migration đã chạy/đổi account.
- Admin API tạo user/DTO/Swagger và token/session dùng enum chung đã nhận Manager.
  Manager không kế thừa quyền ADMIN/MENTOR/STUDENT; đăng ký public vẫn STUDENT.
- Plan đã có review state/revision/audit, READY khác approval, sửa nội dung thu hồi
  approval/publication, Manager approve/reject, Mentor own draft/submit.
- Chưa triển khai 3.2–3.6; Phase 2.3 tiếp tục song song theo plan hiện hành.

## Evidence local — 2026-10-09

- Lượt hoàn tất policy: `pnpm check` pass lint/type-check/**171 tests, 16 suites**/
  build; `pnpm test:http` pass **5/5**, không skip. Gồm 61 domain tests mới và 6
  integration tests policy trên PostgreSQL thật, ngoài regression role/payment.
- Integration kiểm scope/ancestry, reassignment/suspension/role revocation, Session,
  Manager review, CASH/PayOS pending, ACTIVE và COMPLETED, release riêng từng lớp.
- Database riêng `mindy_phase31_test` và fixture suffix `_test`; không sửa dev/VPS.
  Dependencies chuẩn bị cho 3.2 đã được hoàn nguyên; chưa có storage evidence.
- Các số 104 tests/14 suites dưới đây là evidence lịch sử của lượt role trước đó.

- Đã đọc Flow.txt, Course flow, Phase 3 plan/progress và đối chiếu provider,
  entity, DTO/error/config hiện có.
- Kiểm diff whitespace và liên kết Markdown cục bộ sau khi viết tài liệu.
- Type-check/build và HTTP suite pass: 5 tests, gồm Admin tạo Manager, Manager
  login/me/refresh, bị chặn users/catalog/cart; payment/CASH regression giữ pass.
- PostgreSQL migration clean DB + down/up, rollback từ chối khi còn account Manager,
  không mất account; role được khôi phục sau down/up. Integration fixture nhận
  migration mới; chỉnh payment migration regression để rollback đúng hai migration.
- Full unit/integration run: 104/104 pass, 14 suites, không skip; dùng DB riêng
  `mindy_phase31_test` và các DB fixture suffix riêng, không sửa development DB.
- Lần đầu pnpm check bị CRLF baseline; đã chuẩn hóa LF các file tracked TS/JSON/MJS
  (không phát sinh diff logic ngoài scope), lint toàn repo sau đó pass.
- Sau chuẩn hóa, `pnpm check` pass đầy đủ: lint/type-check/104 tests/build;
  `pnpm test:http` pass 5 tests. Migration chỉ chạy trên test DB, chưa chạy dev/VPS.
- Không triển khai MinIO/upload/material/review API, không deploy hoặc thanh toán live.

## Bước tiếp theo

Slice tiếp theo là 3.2: Manager/Mentor upload private và xác minh file; 3.3 triển
khai draft/submit/Manager approval theo contract đã ghi. Limits/TTL/resource defaults
trong plan là lựa chọn triển khai MVP, phải kiểm chứng storage trước rollout.
Chưa chỉ định reviewer migration; cần ghi trước merge, không coi local pass là deploy.
