# BE Change progress — 05/11/2026

[Plan](../BE_CHANGE_PLAN.md) · [Flow](../api_flow/PHASE_BE_CHANGE_FLOW.md) · [API contract](../api_flow/PHASE_BE_CHANGE_flow-api-breakdown.md).

## Resume và nghiệm thu — 06/11/2026 (trạng thái hiện hành)

Các mục Docker lag/chưa kiểm chứng và CHECKPOINT phía dưới là lịch sử trước resume, được giữ để truy vết. Kết quả hiện hành:

- BE `pnpm lint`, `pnpm type-check`, `pnpm build` PASS; build38 migration artifacts. Full `TEST_DATABASE_URL=..._test pnpm test -- --maxWorkers=1`: **90 suites / 775 tests PASS**, không skip (285.56s).
- Compiled HTTP mới: **1/1 PASS**; role/Origin/nested DTO/unknown fields/query/size boundaries. Đây là HTTP contract với service mocks; policy dữ liệu/storage được kiểm riêng bằng integration thật.
- PostgreSQL/MinIO: khai giảng2/3/4, guard mentor thật2/3, nhiều replica/restart, late payment + dời cutoff, ACTIVE lại sau cutoff, legacy history upgrade, preview T2/T5/không ghi, dời cả lớp giữ ID/title/order/enrollment, mentor/student collision rollback/tiếp giáp, swap quyền/duration/stale/retry. Dashboard CASH+PAYOS/đơn2lớp/pending/expired/snapshot giá/lịch sử mentor không rò tài chính. Material30ngày/manager-no-open/student+mentor-open/bulk STALE/shared file/delete versions/lỗi-retry/chống rebind/bytes PASS.
- Chat MinIO5/5 PASS sau bổ sung inline: response Content-Disposition inline, tải đúng version, PDF inline422, message đã xóa404 và quyền bị thu hồi. URL đã cấp vẫn có TTL60s.
- Rehearsal catalogue executable trên DB `_test` riêng: clean38, upgrade35→38, chạy lại no-op. Ba migration cuối gồm2 migration của plan này và assignment consolidation của công việc song song. Không migrate DB dev/production.
- Sửa regression fixtures: rehearsal migration theo tên thay vì undo migration cuối catalogue; chat journey gọi AssignmentsService tải đủ migration assignment hiện hành. Các attendance suites cũ dùng `LegacyAttendanceOpening` để cô lập roster/placement một người hoặc pending; guard giờ/session/quyền/transaction vẫn thật. Rule khai giảng thật được kiểm riêng qua ClassOpeningService và SessionLifecycleService; không nới guard production.
- FE lint/types/build1-worker và unit312 PASS. E2E mới12/12 desktop/mobile PASS: weekly preview/receipt retry, bulk snapshot STALE, swap receipt retry, emoji tổ hợp/caret/send/edit/length, ảnh timeline/enlarge/renew URL/focus, selected preview/upload fail. E2E lịch nghỉ FULL_DAY keep-time, FULL_DAY choose-slot và MORNING đều đã chạy thật qua browser fixtures; cả desktop/mobile PASS. Lượt E2E tổng cuối sẽ được ghi bên dưới.
- FE global format check còn365 file baseline ngoài scope; các file thay đổi của plan đã format riêng. Không format toàn repo để dọn baseline.
- Không commit/push/deploy. `MATERIAL_CLEANUP_JOB_ENABLED=false` mặc định giữ nguyên. Chỉ bật khi rollout được quyết định; migrate BE trước FE.

FE E2E tổng bảy suite liên quan **98/98 PASS**,1.8 phút, worker1: admin-overview/chat/manager-leave/be-change-operations/mentor-workspace/learning/mentor-session-materials. Lượt trước có4 failure fixture (teaching-slots/locator native select và assertion anchor đã được sanitizer bỏ); đã sửa fixture/assertion, không nới production policy. Visual QA320px phát hiện fieldset weekly min-content kéo rộng input dù document-scroll assertion chưa bắt được; đã sửa min-w-0 và thêm bounding-box assertion, kiểm riêng sau build cuối.

Visual recheck sau sửa: **6/6 PASS**, desktop/mobile weekly+chat preview/enlarge/upload fail; đã mở xem screenshot mới, input nằm trong320px, bảng slot cuộn trong khung và dialog ảnh hiện đầy đủ. FE build cuối PASS35 pages; BE build cuối PASS38 migrations/lint612 files. Không còn tiến trình test/build của task cần chờ khi bàn giao.

Giới hạn: reclaimedBytes bảo thủ có thể undercount nếu crash giữa storage delete và DB checkpoint; history trước migration chỉ backfill từ dữ liệu còn lưu. Test DB/storage/browser fixtures không thay thế smoke bằng tài khoản thật trên môi trường deploy.

## Source triển khai

- Lịch tuần/preview/save + cấu hình persisted, giữ curriculum/session IDs; khóa/version/audit/receipt và validator final calendar.
- Min3 khi khai giảng, capacity>=3 khi open; guard dùng chung manual/mentor/worker; history enrollment, cutoff và durable STARTED/BLOCKED; worker15s/SKIP LOCKED/bootstrap.
- Giữ mapping nghỉ cả ngày hai chế độ, bổ sung regression source→occupied target và interval details; swap mentor atomic, same-duration/current assignment/placement/version/idempotency.
- Kế thừa dashboard origin/dev, DTO riêng manager/mentor; order totals/detail allocation; actual teaching mentor/time scope.
- Material tracking/UNSEEN/bulk snapshots, cleanup queue/lease/retry/shared-reference guard/tombstones/statistics. Cleanup mặc định OFF.
- Chat IMAGE inline TTL60s, emoji picker, local objectURL preview/timeline/dialog; limits đồng bộ 5/10MiB.
- FE2 proxy allowlists/Zod/viewers/dashboard/lịch/material inventory đã sửa theo plan mới. Đây là ngoại lệ cho chỉ dẫn cũ Agent.md chỉ đọc FE, vì plan hiện hành được user yêu cầu triển khai có phạm vi FE rõ ràng.
- Migration mới 1793836800000 và 1793836800001; không sửa migration đã triển khai. Không thay full payment/settlement/CASH preview; không deploy/push/commit.

## Evidence và giới hạn

- BE type-check và build đã pass; build xác nhận37 migration artifacts.
- Lượt `pnpm test` đầu:293 tests pass,451 skipped;6 suites dừng ở beforeAll vì thiếu TEST_DATABASE_URL/MinIO. Không ghi full suite pass.
- Lượt source-unit301 tests có một failure mock thiếu query detail mới; đã sửa mock và đang chạy lại. Kết quả cuối bổ sung bên dưới.
- FE unit312 tests pass; type-check đã pass trước các bổ sung cuối, lint các lỗi React mới đã được sửa; đang chạy lại build/lint.
- Docker daemon chậm/500, PostgreSQL localhost:5433 ECONNREFUSED; user báo Docker lag. Đã ngừng gọi Docker. Không run migration vào database dev/production.
- Chưa nghiệm thu PostgreSQL races/cutoff at-boundary/worker restart, migration clean+upgrade, real MinIO shared cleanup/retry và byte accounting. Tests integration mới được thêm nhưng chưa chạy thực tế.
- Reclaimed bytes bảo thủ: crash sau delete trước checkpoint có thể undercount; không overclaim. Lịch sử enrollment trước migration chỉ backfill được từ enrolled_at/updated_at hiện có.
- Workspace có whiteboard và assignment thay đổi ngoài scope đang tồn tại/song song; không ghi đè. Global lint có thể bị chặn bởi formatting assignment ngoài lượt này; ghi kết quả cuối rõ ràng.

## Rollout cần làm khi môi trường thử nghiệm sẵn sàng

1. Backup và migrate database test riêng; chạy clean/upgrade và `test/integration/be-change-plan.spec.ts`, leave regression, finance allocation, material shared-reference/cleanup.
2. Xác minh settlement/worker nhiều replica và cutoff 2/3/4, thanh toán sát giờ/late, dời lớp giữ links.
3. Kiểm cleanup trên bucket versioned test và URL access/revoke; chỉ sau đó bật MATERIAL_CLEANUP_JOB_ENABLED.
4. Deploy migrations/BE trước FE2. Không destructive down khi đã có opening decisions/cleanup history; rollback bằng tắt worker mới và giữ read-compatible schema.

## CHECKPOINT — TẠM DỪNG theo yêu cầu user sau FE build

User yêu cầu pause để restart máy và bật Docker. Đã hoàn tất mục đang chạy: **FE production build PASS**, compile/TypeScript/35 static pages. Dùng `CIRCLE_NODE_TOTAL=2` để Next chỉ chạy1 page worker, không sửa next.config. Không tiếp tục implement/test sau checkpoint; khi user nhắn tiếp tục, nối từ đây.

### Evidence chính xác tại lúc pause

- FE `npm run build` cuối PASS toàn bộ. Unit41 suites/312 tests PASS ở lượt trước các thay đổi tracking/conflict/catalogue cuối; cần chạy lại sau resume. Lint đã pass ở lượt trước các thay đổi cuối; cần format/lint lần cuối.
- BE type-check/build trước các thay đổi Swagger/catalogue cuối PASS; build37 migrations. Cần chạy lại cuối.
- BE source-unit301 tests: lượt đầu300 PASS/1 mock failure (leave studentConflicts nay query thêm details). Đã sửa mock; lượt sau bị **OOM hệ thống** trước khi hoàn tất. Chưa ghi301/301 PASS.
- HTTP mới `test/http/be-change-contract.spec.ts` đã thêm; lượt chạy OOM ngay khi import child, chưa xác minh assertions. Đây là boundary test không cần DB; cần retry sau restart.
- Full `pnpm test`:293 PASS,451 skipped,6 suites beforeAll fail do thiếu TEST_DATABASE_URL/MinIO. Không ghi full check PASS.
- Global Biome còn format `src/modules/assignments/services/assignments.service.ts` (thay đổi song song ngoài scope). File integration mới của lượt này đã format lại hai lần và riêng file pass. Không sửa assignment của công việc khác để dọn lint.
- FE build15-worker trước gây OOM toàn máy, kéo theo BE test/HTTP OOM. Lượt FE1-worker cuối pass. Sau restart chạy **tuần tự**, Vitest/Playwright `--maxWorkers=1`/`--workers=1`.
- Không còn lệnh build/test của lượt này đang chạy lúc pause. Đã ngừng gọi Docker sau khi user báo lag. Chưa migrate DB, commit, push hay deploy.

### Source và lưu ý để tiếp tục

1. Migrations mới1793836800000: opening decisions/weekly schedules/enrollment status history;1793836800001: tracking/cleanup queue/trigger guards. Rehearse clean/upgrade trước rollout. History cũ backfill từ enrolled_at/updated_at, không phục dựng được lịch sử từng bị sửa thủ công.
2. class-opening: cutoff/history/common manual+mentor guard,15s worker/SKIP LOCKED/bootstrap; eligibility list đã batch. weekly-schedule: preview/apply/saved configuration/idempotent swap. calendar-validation: class/mentor/student/approved leave final state. DB tests2/3/4, late settlement/restart/replicas/dời lịch/rollback chưa chạy.
3. Materials retention/Files cleanup: shared refs/previews/READY fencing, max5 retry, hourly SKIPPED/daily DONE tombstone recheck; cleanup mặc định false. ReclaimedBytes bảo thủ có thể undercount khi crash giữa remote delete và checkpoint. Chưa kiểm chứng storage thật.
4. FE operations: Manager chọn OPEN/DRAFT, lịch tuần dùng slot BE; Admin shared panel; Mentor swap; retention inventory/confirmation. Tracking ở ARTICLE viewer hoặc primary media loaded/mở tệp, không list/asset phụ/manager. Chat inline/objectURL/modal/emoji và dashboard manager/mentor tách schema. Proxy operation-rules và safe conflict details. Slot bù đọc BE; lịch read-only cũ vẫn có snapshot nhãn bảy ca.
5. Workspace có whiteboard thay đổi từ đầu và assignment changes xuất hiện trong lúc làm (`assignment-audit.ts`, assignments/quiz/zip/file services). Không revert/stage/format chúng. FE sạch ở đầu lượt; các diff FE mới là của lượt này. Kiểm git status cả hai repo khi resume.

### Thứ tự tiếp tục

- Sau user bật Docker, kiểm DB/storage và chỉ dùng dedicated `_test` DB; không dev/prod, không in secrets.
- Format đúng file của lượt này; BE type-check/build/source units/compiled HTTP mới; FE lint/type/unit/build1-worker. Không chạy song song build/test khi RAM đang thiếu.
- Chạy `test/integration/be-change-plan.spec.ts` và `phase44-mentor-leave.spec.ts`. Cập nhật fixture/regression theo min3 mới, không nới production guard. Attendance fixtures cũ có thể đang start lớp chưa đủ3/trước giờ: seed trạng thái phù hợp hoặc sửa journey để tuân thủ rule mới.
- Bổ sung/chạy finance allocation nhiều lớp; retention30d/manager-no-open/bulk-new-view/shared file/storage-fail-retry; migrations clean/upgrade. Tests hiện mới cover một phần, chưa đóng toàn acceptance plan.
- `tests/e2e/admin-overview.e2e.ts` đã đổi DTO mới nhưng chưa chạy; chạy dashboard/chat/leave/material/weekly/swap với1 worker, xem screenshot desktop/mobile320px. Fixtures cũ có thể cần GET teaching-slots và material-open; không gọi server thật để lấp fixture.
- Cập nhật evidence cuối trong file này và FE docs/progress.md; chỉ ghi hoàn tất khi các gate pass. Chưa có yêu cầu tự động commit/push/deploy.
