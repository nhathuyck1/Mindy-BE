# Phase 8 — R0 review evidence

Ngày: **20/11/2026**. Branch: `codex/business-notifications`.
BE HEAD: `757be19f401ab212686f3348e795dd89619b6670`.
FE2 HEAD: `0171717`, source read-only có thay đổi local ngoài notification.

## 1. Kết luận và traceability

**Phase 8 hoàn tất 4/4 tasks, 4/4 AC ở mức source/contract review.**
Chưa thêm business controller/module/migration/worker hoặc sửa FE.
Phase 9–15 vẫn PLANNED; 28 AC runtime/handoff còn pending.

| AC | Evidence review | Kết quả |
| --- | --- | --- |
| AC8-1 | [Catalog](EVENT_CATALOG.md): N01–N17 có identity/revision/cause, audience/target/mode, template và happy/negative scenarios | PASS — source/design review |
| AC8-2 | [Inventory](WRITER_INVENTORY.md): direct/bulk/weekly swap/leave replacement, PAYOS/CASH/reconcile canonical markPaid, checkout/cron expiry, CODE extend, APPROVE publication và trigger requeue | PASS — source/design review |
| AC8-3 | [Policy](RECIPIENT_POLICY.md): A/T/M/delayed, role matrix, P01–P14, before-snapshot/current authorization, owner/guest/old mentor/terminal | PASS — source/design review |
| AC8-4 | [API contract](../../api_flow/BUSINESS_NOTIFICATIONS_flow-api-breakdown.md), [FE mapping](FE_TARGET_MAPPING.md), [Flow](../../api_flow/BUSINESS_NOTIFICATIONS_FLOW.md): legacy/unified separation, role/flags, routes thật và gaps rõ | PASS — source/design review |

## 2. Cách kiểm chứng

- Đọc mutation/service, search call sites và SQL writers trên source BE tại HEAD trên.
- Kiểm file page.tsx và component routing/queries của FE2; không chạy FE và không
  sửa local changes của người dùng.
- Kiểm tài liệu tự động: link nội bộ, fences, task/AC IDs, catalog/scenario/template
  coverage, source symbols và route files trong FE mapping.
- Kiểm git diff --check và bảo đảm thay đổi của lượt này chỉ trong docs.

Các scenario N/P là acceptance design cho tests phase runtime, không là test
integration đã chạy. Không chạy pnpm check/build/test vì lượt này chỉ hoàn tất
contract/source review; không dùng test Phase 6 cũ làm bằng chứng business runtime.

## 3. Quyết định để Phase 9 bắt đầu

1. Legacy /notifications + chat event names giữ nguyên; unified mới dùng
   /api/v1/notification-inbox + notification-inbox:* và cùng rows/read state.
2. Manager/Admin chỉ mở unified REST; không mở chat handshake.
3. Capture transactional, recipient rows immutable trong transaction, cause chung;
   canonical event unique theo type/resource/revision.
4. Producer epoch/activation bền trong DB, delivery flags không làm mất capture.
5. Terminal generic giữ 90 ngày, business actorId public null; deep link vẫn kiểm
   resource policy. Active notice bị revoke ẩn theo cùng provider.
6. Gap FE Admin leave detail, focus session/material/placement theo mapping được
   bàn giao Phase 15, không giả định route đã tồn tại.

## 4. Gate còn phải chứng minh ở phase sau

Schema upgrade/legacy parity, concurrency/rollback/dedupe, producer coverage,
socket auth/revoke, worker notBefore/clock/expiry races, read-all snapshot,
performance, FE navigation và deployment đều chưa có evidence mới.

## 5. Kết quả kiểm tài liệu/source thực chạy

- PASS: 19 tài liệu/index trong phạm vi kiểm, 277 liên kết nội bộ hợp lệ.
- PASS: 32 task IDs duy nhất; 4 AC8 đã tick review, 28 AC9–15 còn pending.
- PASS: 17 catalog rows, 17 template rows, 17 happy/negative scenario rows;
  14 policy scenarios.
- PASS: kiểm tồn tại 55 async methods trên 21 service files BE và trigger requeue;
  12 page.tsx routes FE được đối chiếu, Admin leave detail ghi rõ gap.
- PASS: git diff --check; thay đổi chỉ trong docs, không source runtime.

Các kiểm trên xác nhận tính nhất quán/tồn tại của artifact và source được viện dẫn;
không thay thế test hành vi của producer/provider/worker ở phase sau.
