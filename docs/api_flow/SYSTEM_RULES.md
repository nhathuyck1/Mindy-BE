# Cấu hình quy tắc hệ thống — 09/11/2026

- `GET /api/v1/admin/system-rules`: danh sách rule. Chỉ ADMIN ACTIVE, cookie access_token.
- `PATCH /api/v1/admin/system-rules/:key`: body strict `{value: boolean, expectedVersion: integer >= 1, reason: string 1..1000}`; Origin tin cậy. Sai version trả 409, key không hỗ trợ trả 404. Không có API tạo/xóa key tùy ý.
- Response mỗi rule: `{key, value, version, updatedAt, updatedBy}`; GET trả array. Timestamp ISO, updatedBy UUID hoặc null khi seed. Không cache.
- `system_rules` lưu giá trị và version. Audit lưu trong bảng chung `audit_events` với source `system_rule_audits`; view `system_rule_audits` giữ hợp đồng INSERT hiện có, dữ liệu chỉ được thêm. Migration chuyển cả lịch sử rule cũ; giữ FK rule/người sửa, kiểm tra giá trị/lý do và unique rule/version. Update và audit cùng transaction.

Rule đầu tiên: `session_start_time_enforced`, mặc định `true`. Admin tắt để demo bắt đầu buổi ngoài ngày/giờ đã xếp. Áp dụng cho toàn hệ thống ở request tiếp theo, không cần restart. Mentor dùng nút Bắt đầu buổi hiện có sau khi làm mới dữ liệu.

Khi rule tắt, chỉ bỏ kiểm tra ngày bắt đầu điểm danh, giờ buổi và mốc thời gian khai giảng. Lớp OPEN vẫn phải có tối thiểu 3 học viên đã thanh toán ACTIVE nếu bắt đầu trước mốc khai giảng; sau mốc vẫn giữ cutoff và yêu cầu dời lịch nếu đã không đủ điều kiện. Giữ quyền Mentor, trạng thái lớp/buổi, kiểm tra giảng viên và lịch xung đột. Không mở lớp DRAFT/COMPLETED/CANCELLED, không sửa lịch, không thay hạn chỉnh điểm danh hoặc tự kết thúc buổi. Worker khai giảng tự động và Admin start lớp vẫn giữ chính sách thường.

Buổi demo là thay đổi dữ liệu thật: lưu actualStartedAt/người bắt đầu/danh sách điểm danh và audit. Bật lại rule chỉ ảnh hưởng các lần bắt đầu sau, không hoàn tác buổi đã mở. Chưa triển khai các rule khác hoặc cấu hình bí mật qua bảng này.

Triển khai: chạy migrations `1794182400000-system-rules` và `1794182400001-consolidate-system-rule-audits` trước backend mới, sau đó triển khai FE2. Consolidation cần migration audit chung hiện hữu và transaction; hoàn tác bằng forward migration hoặc backup phù hợp. Trang Admin `/admin/settings` có nút tắt/bật, yêu cầu lý do, thông báo phạm vi toàn hệ thống. Chưa xác nhận Swagger live/deploy hoặc chạy migration trên dữ liệu thực.

## Lịch sử hoạt động và lọc vai trò

- GET `/api/v1/admin/tracking/events` nhận thêm `source=system_rule_audits` và `actorRole=ADMIN|MANAGER|MENTOR|STUDENT`, kết hợp AND với các filter hiện có trước count/phân trang. Chỉ Admin được truy cập như trước.
- `actorRole` là **vai trò hiện tại** trong users, không phải snapshot lịch sử; nếu đổi role thì kết quả lọc đổi theo. Actor trong list/detail trả thêm `role`. Sự kiện không có actor xuất hiện khi bỏ lọc vai trò.
- Chi tiết `/api/v1/admin/tracking/events/system_rule_audits/:eventId` chứa `data.rule_key`, `old_value`, `new_value`, `reason`, `version`. Entity type `system_rule`, entityId null vì khóa rule là chuỗi, không UUID.

Kiểm tra source: BE type-check/build và 357 test pass; toàn bộ suite có 6 suite không khởi tạo được vì thiếu TEST_DATABASE_URL/MinIO, 500 test integration bị bỏ qua. FE lint/type-check/build, 359 test và 2 Playwright desktop/mobile pass. Migration SQL và cập nhật rule trên PostgreSQL thực chưa được nghiệm thu.

## Kiểm tra trước deploy — 09/11/2026

- Build BE có đủ 41 migration artifacts. Đã chạy hai migration mới trên PostgreSQL engine nhúng PGlite với schema audit nền: chuyển lịch sử cũ, INSERT qua view, gọi SystemRulesService thật, rollback version cũ, chặn sửa/xóa audit, chạy SQL TrackingService thật cho role/source/phân trang/detail đều PASS. Đây là smoke trên schema tối thiểu, không thay thế nghiệm thu toàn bộ schema PostgreSQL production.
- FE đã cập nhật origin/main `8f2b23b` trên nhánh `codex/admin-system-rules`, giữ thay đổi tính năng. Type-check/build và 374 unit tests PASS sau đồng bộ.
- Có thể triển khai BE trước FE vì rule seed mặc định bật. Sau khi đưa source lên máy deploy: `pnpm build`, tiếp theo `pnpm migration:run:build` (chạy trước khi restart BE), rồi khởi động bản BE mới. Lệnh migration production chạy toàn bộ pending migrations trong transaction và kiểm không còn pending; không bỏ qua migration consolidation audit chung hiện hữu.
- Chưa chạy migration/deploy lên database thật và chưa commit/push thay đổi local.
