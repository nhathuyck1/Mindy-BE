# BE Change — lịch tuần, khai giảng, dashboard và retention

## 19/11/2026 — Bản đồ DB và đánh giá khả năng thu gọn

- Bổ sung [DATABASE_MAP.md](DATABASE_MAP.md): sơ đồ nghiệp vụ/vận hành, inventory 80 bảng và 16 view dự kiến sau 42 migration source; phân loại 48 bảng nghiệp vụ/cấu hình và 32 bảng kỹ thuật/vận hành/bằng chứng. Số lượng chưa đối chiếu PostgreSQL/VPS đang chạy.
- Đối chiếu caller cho view legacy, receipt bảng vẽ, Google registration, stored progress, khai giảng và chat. Chưa có bảng lưu trữ được xác nhận DROP ngay; đề xuất dọn view sau chuyển caller và khảo sát gộp receipt. Không sửa DB, migration, runtime, nghiệp vụ hoặc API. [API breakdown](PHASE_BE_CHANGE_flow-api-breakdown.md).
- Kiểm local: inventory source khớp danh sách tài liệu, không thiếu/trùng tên; chưa đo dữ liệu/dung lượng/hiệu năng hoặc nghiệm thu deploy.

Ngày 05/11/2026. Source đã triển khai ở BE và FE2; **chưa nghiệm thu PostgreSQL/MinIO, chưa migrate/deploy**. [Plan](../BE_CHANGE_PLAN.md) · [API breakdown](PHASE_BE_CHANGE_flow-api-breakdown.md) · [Progress](../progress/BE_CHANGE_PROGRESS.md).

## Lịch tuần và khai giảng

Manager/Admin đọc danh mục slot và cấu hình lớp → chọn ngày bắt đầu, các cặp ISO weekday/slot và danh sách buổi theo thứ tự chương trình → preview → kiểm tra xung đột → lưu với assignmentVersion và Idempotency-Key.

Lưu khóa Class → các Session → mentor calendars → student calendars; kiểm lại lớp, phiên bản, placement, ngày tương lai, cùng lớp/course unit và lịch cuối cùng. Buổi cũ giữ ID/title/liên kết, tăng version; buổi mới chỉ được thêm trong danh sách hợp lệ. Lưu cấu hình tuần, ngày đầu/cuối và audit cùng transaction. Manager dời lớp OPEN chưa có buổi bắt đầu được cả khi mốc cũ đã qua. Lớp đã có buổi COMPLETED/CANCELLED/IN_PROGRESS không dùng lệnh dời toàn lớp.

OPEN không đòi đủ người, nhưng sức chứa phải >=3. Worker chạy ngay khi bootstrap và mỗi 15 giây, claim tối đa 50 lớp bằng SKIP LOCKED. Tại mốc đầu tiên chưa hủy, kiểm order PAID/paidAt và trạng thái enrollment tại mốc đó qua lịch sử. Đủ 3 chuyển lớp IN_PROGRESS, giữ mọi Session SCHEDULED; thiếu thì lưu BLOCKED theo (class, scheduled start). Thanh toán muộn không thay quyết định. Từ 06/11/2026, mentor có thể bấm bắt đầu trước giờ lịch trong ngày của buổi. Nếu lớp còn OPEN, cần đủ 3 học viên hợp lệ tại thời điểm bắt đầu sớm và ghi quyết định khai giảng. Worker và API start lớp riêng vẫn theo mốc đã xếp.

Lịch sử enrollment mới ghi bằng trigger. Backfill dữ liệu cũ dùng enrolled_at/updated_at đã có; không khẳng định khôi phục được những thay đổi lịch sử trước migration nếu các timestamp cũ từng bị sửa thủ công. Không sửa quy tắc full payment, settlement atomic, CASH preview hoặc quyền enrollment.

## Nghỉ và swap

Giữ cả dayMappings (giữ giờ) và sessionMappings (chọn giờ, giữ thời lượng), kể cả FULL_DAY. FE cho chọn rõ hai chế độ. Source vốn đã chặn overlap; bổ sung integration regression di chuyển +3 ngày vào một buổi đang tồn tại và details thời gian xung đột. Cả submit và approve tiếp tục gọi validator hiện hữu; không tự bỏ qua student conflicts.

Mentor chọn hai buổi được giao trong cùng lớp → xác nhận lý do → POST swap với hai version và receipt. Khóa lớp, session IDs theo thứ tự, mentor/student calendar; kiểm thời lượng bằng nhau và không có placement; hoán đổi startsAt/endsAt trong transaction, kiểm final state, audit từng buổi. Retry cùng key trả outcome cũ; payload khác cùng key conflict. Nội dung, ID và phân công mentor giữ nguyên.

## Dashboard

Kế thừa module dashboard từ origin/dev, giữ route Admin hiện có; Manager và Mentor có DTO/query riêng. Manager dùng order totals để cộng thu một lần, dùng detail totals cho phân bổ. Kỳ theo paidAt; pending là snapshot chưa hết hạn. Tiền VND nguyên dùng decimal string để giữ chính xác. Mentor query chỉ dùng actor ID, lịch tương lai dùng effective assignment, lịch sử dùng teachingMentorId; không trả doanh thu/xếp hạng mentor khác. FE có bảng thu theo phương thức/khóa/lớp/ngày, cảnh báo khai giảng, tổng giờ và lịch sắp tới.

## Materials

Migration bắt đầu tracking dữ liệu cũ tại thời điểm migration. ARTICLE chỉ ghi nhận khi mở viewer; FILE/VIDEO ghi nhận sau media loaded hoặc người dùng mở tệp chính, không ghi nhận list/prefetch/ảnh phụ. POST open kiểm revision và policy dưới Material lock; timestamp server tăng tối thiểu 1 ms để snapshot bulk không bỏ sót lượt xem cùng millisecond. Manager không được gọi lệnh ghi nhận.

Worker mỗi giờ gắn isUnseen khi `coalesce(last_seen_at,tracking_started_at) <= now - 30 days`. Không tự xóa. Manager lọc unseen → chọn tối đa 100 tài liệu → xác nhận title/revision → bulk-delete. Từng mục có transaction và trả DELETED/STALE/NOT_FOUND/ALREADY_DELETED. Revision, lastSeenAt và trackingStartedAt phải khớp; lượt xem mới thắng lock thì mục bị bỏ qua.

Trigger sau soft-delete đơn/bulk enqueue primary/inline/attachments và previews. Cleanup mặc định **OFF**. Khi được bật ở môi trường thử nghiệm: claim bằng lease; khóa file → kiểm live references/preview parents/validation jobs → ghi DELETED và manifest tombstone để chặn rebind → commit → xóa mọi version staging/verified/copy candidates ngoài transaction. Checkpoint từng key, retry tối đa 5, SKIPPED được kiểm lại hàng giờ. Tombstone DONE được kiểm lại mỗi ngày để thu hồi copy đến muộn. Giữ file chung đang có material sống. Không hard-delete metadata/audit.

reclaimableBytes là ước tính; reclaimedBytes chỉ cộng số byte storage xác nhận xóa và đã checkpoint. Crash giữa storage delete và DB checkpoint có thể làm thống kê thu hồi thấp hơn thực tế, không báo nhầm soft-delete là dung lượng đã thu hồi. Cần rehearsal thực tế trước khi bật cleanup.

## Chat

Emoji là Unicode trong body, dùng DTO/send/edit/realtime hiện có. FE chèn ở caret, giữ giới hạn 4.000 UTF-16 code units/16 KiB theo contract hiện hành. Ảnh chọn có object URL và được revoke; ảnh timeline xin file-access inline riêng, mở lớn bằng dialog và cho lấy lại URL hết hạn. PDF vẫn download mặc định. BE chỉ cho inline khi file kind IMAGE, READY và conversation/message access còn hợp lệ, signed version URL 60 giây.

## Kiểm chứng và còn lại

Đã kiểm PostgreSQL: cutoff 2/3/4, guard mentor thật, multi-replica/restart, late payment, kích hoạt lại enrollment sau cutoff, dời lịch/giữ ID, rollback conflict và swap receipt. Trigger trạng thái ghi clock_timestamp tại thời điểm chuyển, không backdate bằng enrolled_at cũ. MinIO thật đã kiểm shared file, lỗi/retry, chống rebind và xóa hết versions, byte accounting. Catalogue hiện tại clean38 migrations và upgrade35→38 PASS; bao gồm migration assignment của công việc song song, không coi đó là thay đổi thuộc plan này. Compiled HTTP và E2E desktop/mobile có evidence tại progress. Không chạy migration vào dev/production; cleanup vẫn OFF mặc định. Các checkpoint Docker lag trước resume chỉ là lịch sử.

## 06/11/2026 — Review standard seed (local)

Không đổi flow/API runtime. Review seed mới bằng PostgreSQL 17.11 tách biệt: migrations và standard seed/rerun PASS (30 users không gồm admin, 7 classes); DB review đã xóa. Type-check PASS, Vitest plan 9/9 PASS; Biome scoped seed FAIL format ở hai file mới. Chưa chạy full check/HTTP hoặc deploy.

Còn lệch policy trong fixture: historical STARTED decisions lưu 8/12/8 trong khi cutoff query thực tế trả 0/0/0 vì enrollment event được trigger ghi ở thời điểm seed; 22 completed sessions/208 attendance records/8 graded submissions không có lifecycle/attendance/assignment/material audit. Tracking/history demo vì vậy chưa đủ để nghiệm thu. Chưa sửa implementation; chi tiết và giới hạn tại `docs/progress/Progress.md`. DB dev chưa có các standard class code khi kiểm read-only; không seed vào dev/VPS. API breakdown giữ nguyên: [contract](PHASE_BE_CHANGE_flow-api-breakdown.md).

## 19/11/2026 — Seed bổ sung cho server demo 20/11 lúc 09:20

Thêm `pnpm seed:demo` / compiled `node dist/database/seed/standard.js --demo`.
Đây là batch mới gồm 7 lớp mang suffix `DEMO-20261120`, giữ ID/lịch/trạng thái của
lớp cũ và mật khẩu/thông tin tài khoản có sẵn. Hai mentor frontend/backend có lớp
JavaScript IN_PROGRESS riêng, 8/12 học viên PAID không trùng roster, buổi SCHEDULED
20/11 09:20–10:50 +07. Lịch tuần dùng slot2, riêng ngày demo dời sớm10 phút.
Các lớp còn lại phủ COMPLETED, OPEN còn chỗ/full/thiếu học viên, DRAFT; có đơn
CASH/PAYOS, pending/expired, giỏ hàng, ARTICLE, quiz, điểm danh, tiến độ và audit
qua implementation standard hiện tại. Tài liệu seed còn thiếu được bổ sung vào
course unit cũ; giỏ hàng cũ được tái sử dụng thay vì insert trùng student.

Mã lớp và anchor gắn `SEED_DEMO_DATE` (mặc định2026-11-20), không đổi theo ngày
chạy lại. Chạy lặp bỏ qua lớp đã có để giữ thao tác demo. Account khác role/status
kỳ vọng sẽ báo lỗi, không tự sửa. Kiểm lịch với CalendarValidationService hiện hữu
gồm mentor/student và approved leave; lỗi rollback cả batch. Seed có advisory lock
để serialize các lượt chạy. `--dry-run` thực hiện các insert/check trong transaction
rồi rollback; PostgreSQL sequences có thể vẫn tăng. Production cần
`SEED_DEMO_CONFIRM=YES`, `SEED_ACCOUNT_PASSWORD` cho account chưa có. Chạy bằng
image đã build trên VPS theo [README](../../README.md); không dùng `seed:data`
cho lượt bổ sung vì lệnh standard cũ vẫn reset password.

Không đổi endpoint/DTO/business rule, không tự gọi payOS/SMTP hoặc boot worker.
Test lịch local22/22 PASS và type-check PASS. Full gate/giới hạn runtime ghi tại
[Progress](../progress/Progress.md). Chưa deploy/chạy seed hoặc dry-run trên server;
PostgreSQL local không nghe5433 và Docker daemon chưa chạy.

### 19/11 — Bổ sung lớp để đăng ký ngay, không cần CI/CD

User đã gửi log server xác nhận batch7 lớp trước chạy thành công (evidence do user
cung cấp, không phải truy cập VPS độc lập). Batch đó chỉ có React/HTML còn chỗ,
Node full và JS chưa có lớp OPEN, nên bổ sung one-off
`tools/seed-open-registration.mjs` chạy qua stdin của Node trong container API đã
deploy. Không cần build/restart/deploy hoặc password seed. Chỉ insert6 lớp OPEN,
0/25, class units/sessions/weekly schedule; dùng active course/mentor sẵn có. Phủ
HTML/CSS, JS frontend, JS backend, React, Node, Python; giữ toàn bộ7 lớp cũ và tài
khoản/order/enrollment. Mã `REG-20261123`, học từ tuần23/11, mở đăng ký ngày19/20.
CalendarValidationService kiểm lịch/approved leave, lỗi rollback cả batch; rerun
skip class code. Có `--dry-run` và `--plan`. Không thay endpoint/business rule.
Local syntax/Biome/compiled plan và purchase policy cho19/20 PASS; chưa chạy
script mới trên PostgreSQL/server. Lệnh thực hiện tại [README](../../README.md).

### Bổ sung lớp OFFLINE cho frontend/backend

User gửi log COMMITTED6 lớp đăng ký; trong6 lớp đó chỉ Python là OFFLINE,5 lớp
của hai mentor chính ONLINE. Bổ sung `--offline` cho one-off script, không cần
deploy: thêm5 OPEN/OFFLINE0/25, codes `REG-OFF-20261123`, gồm HTML/CSS FE,
JS FE/BE, React FE, Node BE. Session có phòng Demo Frontend/Backend và meeting
URL null; slot riêng tránh lịch cũ, vẫn kiểm calendar/leave trong transaction.
Giữ codes/mode của6 lớp trước và giữ dữ liệu đã đăng ký. Không đổi API/rules/FE.
Local syntax/Biome/plan PASS; kiểm purchase ngày19/20 và không trùng mentor/phòng
trong các fixtures đã biết PASS. Chưa có server evidence cho5 lớp offline mới.
