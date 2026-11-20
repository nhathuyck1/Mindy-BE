# Progress Phase 16 — Chuông notification Mentor/Student

## 20/11/2026 — Đổi lịch demo để user test chuông

Theo yêu cầu user, trên backend local localhost:3000 + mindy_center, đăng nhập
Manager Ops qua API và activate producer SCHEDULE (các env API/job/socket đã ON).
PATCH /management/class-sessions/d3cce7fe-102a-42de-8f51-d03ff20a541f/schedule
trả 200, dùng expectedVersion và Idempotency-Key, lớp JS-101-FE-DEMO-20261120:
24/11/2026 từ 09:30–11:00 sang 10:00–11:30 (+07).
Event 89de944c-0a0a-4951-bd02-9ebbc8e351ef DONE, 9 unread inbox rows cho mentor
frontend và Student An/s01–s07, last_error null. Không đọc notification thay user,
không claim browser/socket user đã nhận. User mở chuông/refetch để nghiệm thu.
Script local tmp/phase16-live-reschedule.mjs; không log credentials hoặc đổi FE.

## 20/11/2026 — Thêm login vào Postman API handoff

- Collection Phase16 thêm Login Student, Login Mentor và GET current user; các
  credentials variables để trống, dùng environment local. Assertions kiểm role,
  expiry và Set-Cookie; không lưu JWT/cookie/ticket vào collection variables.
- Luồng bàn giao: chọn một login → /auth/me → notification API/ticket. Cookie
  jar dùng actor đăng nhập gần nhất; không coi hai login là hai phiên song song.
- Guard runtime đã có AccessTokenGuard/RolesGuard/Origin; không sửa auth code.
  Flow/API breakdown đã cập nhật. Kiểm JSON/script syntax/format/diff; không chạy
  lại BE suite hoặc login tài khoản thật cho thay đổi tài liệu/collection.

## 20/11/2026 — Backend implemented và kiểm chứng local

**BE runtime đã implement local; chưa FE/browser sign-off hoặc deploy.**
Working tree dựa trên HEAD `0a4f844`; chưa commit/merge. Mốc planning bên dưới
giữ lịch sử trước implementation, không phải trạng thái hiện hành.

### Phạm vi đã có source

- Migration `1795132800000-business-notifications.ts` mở rộng notifications có
  CHECK theo chat/business, bảo toàn legacy FKs/read rows; thêm producer activation,
  events/lease/checkpoints và recipient snapshots. Capture cùng transaction tại
  persistence boundary, không tạo một inbox riêng khác.
- `src/modules/notifications/`: catalog 22 business types, batch policy,
  cursor HMAC TTL 24h, list/count/read/read-all và BUSINESS scope loại chat.
- Socket.IO namespace `/notifications`, path `/ws/notifications`, cookie hoặc
  ticket channel notifications; ACTIVE Mentor/Student, Origin/owner/session/role
  checks, 5 kết nối/user, disconnect khi hết hạn/revoke, own read invalidation.
- Producers: lịch/mentor/hủy/bù, bài tập/deadline/ZIP grade, order/CASH/payOS
  persistence, leave/placement, material publication/review; thêm ZIP chờ chấm,
  reminders 30 phút buổi/24h deadline và hạn đơn. Time revisions chống stale;
  relation snapshots ngăn enrollment revoke/rejoin làm sống lại notice cũ.
- CLI `notifications:maintenance`: status, activation có khóa, bounded replay
  DEAD trong 90 ngày/current epoch, retention business inbox có giới hạn. Flags
  mặc định OFF; chưa activate ngoài test. Swagger/Postman, flow/API và runbook có.

### Kiểm chứng thực chạy

Môi trường: Windows local, **Node 22.20.0, pnpm 12.6.0**, PostgreSQL 17 Alpine
container riêng `mindy-notifications-test`, DB suffix `_test`; MinIO test riêng.
Không migrate database dev/prod hoặc thực hiện giao dịch thật. Lượt thử đầu bằng
Node 24 đã được thay bằng toàn bộ gates trên Node 22 đúng pin dự án.

| Gate | Kết quả / bằng chứng |
| --- | --- |
| `pnpm check` lần cuối | PASS: lint 0 errors/11 warnings có sẵn trong code assignments; type-check PASS; **905 passed, 50 skipped**, 108 suites passed/1 skipped; build 43 migration artifacts verified. Log local `tmp/phase16-check-final.log` |
| `pnpm test:http` | PASS **151/151, 18/18 suites**, 0 skip; app compiled + real HTTP/Socket.IO, regression chat/materials/payments/assignment/attendance/whiteboard. Log local `tmp/phase16-http.log` |
| Phase16 HTTP/WS subset | **20/20 PASS** trong full HTTP: activation/DRAFT/no-op/rollback, 3 paths đồng thời, wrong origin/role/ticket, owner denial, read đa tab, retry/dedupe, offline recovery, CASH confirmation, ZIP submit/grade privacy, material delayed/unpublish, leave/placement/cancellation, CHAT_OFF/API_OFF, stale reminder, session/account revoke, rejoin cutoff, benchmark |
| Migration compatibility | `test/integration/phase16-notifications.spec.ts` PASS: upgrade bảo toàn CHAT_MESSAGE id/read_at/created_at/FK/unique, business CHECK, repeat TypeORM no-op và down dry rehearsal trong transaction rollback; fresh full 43 migrations qua HTTP fixture |
| Unit | Cursor owner/category/unread/tamper/TTL 2/2; realtime tickets 3/3, gồm notifications channel isolation/expiry; thuộc full check |
| Operations CLI | PASS status, activation dry-run, replay dry-run/apply, deny stale/pre-activation replay, retention dry-run/apply và giữ recipient dedupe markers. Script/log local `tmp/phase16-ops.mjs`, `tmp/phase16-ops.log` |
| Backup/restore | pg_dump custom + pg_restore --exit-on-error vào `mindy_phase16_restore_test`: **10.036 events / 10.159 snapshots / 10.156 inbox / 6 activated producers**, khớp source test DB; **0 duplicate user/event**. Log local `tmp/phase16-restore.log` |
| Diff/links | `git diff --check` và relative links tài liệu Phase16 được kiểm; không ghi doc-only check thành BE test |

**50 skipped** là `phase7-code-runner-round-trip.spec.ts`, cần compiler-runner
riêng; không thuộc critical Phase16. Không suy skip thành pass hoặc hoàn tất
gate runner/FE/production. HTTP code-assignment regression 1/1 vẫn PASS theo
fixture HTTP hiện hữu; không phải runner production evidence.

Benchmark local trong full HTTP: fixture **102 recipients/event**, 10.000 rows
thêm cho một owner, 7 samples; fanout **1.982 ms**, list p95 **109 ms**, unread
count p95 **75 ms**. Đây là phép đo sequential trong container local, chưa phải
production load/concurrency SLA. Count gom nhóm current policy theo tài nguyên,
không dùng counter cache có thể lệch quyền.

### AC → source/tests và giới hạn evidence

| AC | Trạng thái | Evidence / phần còn thiếu |
| --- | --- | --- |
| AC16-01 | PASS local | Catalog/capture/policy/target contract đồng bộ R0 extension 22 types; BUSINESS scope trong HTTP |
| AC16-02 | PASS local | Ticket auth, role/origin/channel, expired ticket unit, current role/session/account revoke, max 5 connections HTTP |
| AC16-03 | PASS local | Ba socket paths cùng chạy, CHAT_OFF vẫn business delivery, disconnect/app shutdown HTTP |
| AC16-04 | PASS local | Owner denial, current account/session checks, enrollment revoke/rejoin, old mentor terminal target unavailable; resource APIs reauthorize |
| AC16-05 | PASS local | Rollback/no-op/replay unique, simulated insert failure rollback/checkpoint retry, offline REST recovery và lease fencing source |
| AC16-06 | PARTIAL acceptance | Các nhóm đều có source và functional HTTP; full regression payments/materials/assignments PASS. Chưa có dedicated notification assertions cho mọi payOS settlement/expiry race, mọi bulk writer và availableAt boundary permutation |
| AC16-07 | PASS local | Real ZIP submit/grade/release HTTP; draft upload không chờ chấm, private grade/feedback không trong notice. Attempt identity dùng submission/attempt revision |
| AC16-08 | PASS local | APPROVE/REJECT/publication source + HTTP recipient/template; current mentor material detail policy kiểm target |
| AC16-09 | PARTIAL acceptance | DB-clock windows, stale/expiry/submission/revision predicates và HTTP cases có; chưa có đầy đủ fake-clock boundary/downtime matrix cho mọi loại QUIZ/CODE/ZIP |
| AC16-10 | PASS BE local | BUSINESS read/count, read timestamp idempotent, advisory-lock late fanout barrier, legacy read bridge, chat unread preserved; FE badge/unknown fallback chưa browser nghiệm thu |
| AC16-11 | PASS local | Full check + HTTP + fresh/upgrade/repeat; critical Phase16 0 skip. Runner suite ngoài phase còn skipped như trên |
| AC16-12 | PARTIAL release | Runbook/CLI/restore/Postman có; chưa FE browser, reverse proxy/VPS smoke hoặc production rollout |

Không đánh toàn Phase16 complete vì còn các acceptance gaps nêu trên. Các test
hiện tại chứng minh backend local; không tự đóng AC9–15 hoặc FE từ kết quả này.

### Giới hạn triển khai và bước bàn giao

- Single API replica; nhiều replica cần socket adapter/broker + acceptance riêng.
- Socket best effort; không ACK/replay bền. Inbox/refetch là đường phục hồi.
- Retention xóa inbox >90 ngày có bound, giữ event/recipient markers lâu hơn;
  chưa compact job 30 ngày hoặc purge marker tự động. Theo dõi dung lượng DB.
- SQL read projection là technical decision ghi plan mục 8; khi đổi domain policy
  phải sửa projection/regression đồng thời. Không dùng chat membership làm entitlement.
- Postman collection được tạo/kiểm JSON, chưa chạy Postman CLI. Không sửa repo FE.
  [Contract FE](../../api_flow/PHASE_16_flow-api-breakdown.md) và
  [runbook](../../PHASE_16_NOTIFICATIONS_RUNBOOK.md) là gói bàn giao bật tính năng.
- Logs/scripts trong tmp là evidence local không commit; bảng này ghi kết quả
  reviewable trong repository. Chưa deploy hoặc bật flags trên môi trường thật.

## 20/11/2026 — Planning

**PLANNED; 0/12 AC runtime nghiệm thu.**

- Đã soạn [implement plan](../../implement_phase/phase%2016/PHASE_16_BELL_NOTIFICATIONS_WEBSOCKET.md),
  [flow](../../api_flow/PHASE_16_FLOW.md) và
  [API/WS proposal](../../api_flow/PHASE_16_flow-api-breakdown.md).
- 6 slices: catalog/dependency → socket/auth → inbox/read bridge → nhóm cũ →
  ZIP/review/reminders mới → gates/handoff. Loại chat khỏi chuông Phase 16.
- Phase 9–15 vẫn PLANNED theo baseline; Phase 16 không tạo lại foundation hoặc
  ghi các producer chưa implement thành done. BUSINESS count/read-all và channel
  notifications là extension mới cần đồng bộ contract khi triển khai.
- Đã đối chiếu source auth ticket/chat/whiteboard socket, ZIP submit/material
  review và global validation. Mọi file source/test trong plan là targets dự kiến.
- Kiểm chứng lượt này: diff/relative links tài liệu. Không chạy `pnpm check`, BE
  tests, DB migration, socket thật; không sửa FE/deploy/VPS hoặc giao dịch thật.

| Slice | Trạng thái |
| --- | --- |
| 16.0 Contract/writer review triển khai | TODO |
| 16.1 Transport/auth | TODO |
| 16.2 Delivery/read/BUSINESS scope | TODO |
| 16.3 Producer groups Phase 10–14 | TODO, theo dependency |
| 16.4 ZIP/review/reminders | TODO |
| 16.5 Gates/FE handoff/ops | TODO |

Khi implement: cập nhật AC16-01–12 với source/test/command/pass-fail-skip/revision;
giữ BE local, FE browser acceptance và deployment là evidence riêng.
