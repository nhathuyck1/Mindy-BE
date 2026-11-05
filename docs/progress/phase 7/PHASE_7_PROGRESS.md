# Phase 7 — Implementation progress

## CODE coexistence — 02/11/2026

Whiteboard runtime and the existing Whiteboard API document remain unchanged.
CODE documentation lives in [separate progress](PHASE_7_CODE_PROGRESS.md) and
[API contract](../../api_flow/PHASE_7_CODE_flow-api-breakdown.md). Combined local
check: 790/790 tests, lint/type-check/build PASS; compiled HTTP/WS125/125 PASS,
including Whiteboard3/3 HTTP/WS and14/14 integration. No new deployment/browser
or load acceptance. Earlier Whiteboard evidence/planning below is retained.

02/11/2026: BE runtime local implemented: migration1793664000000, context/lazy create, Yjs durable checkpoints and receipts, authenticated WS, object policy, control, snapshots/epoch reset/restore, private image/PDF assets, leased workers, PNG/PDF exports, seven-day reference-aware cleanup. Runbook: [current protocol/limits/deviations](../../PHASE_7_WHITEBOARD_RUNBOOK.md).

Local gates: `pnpm check` PASS — 82 files / 724 tests, lint/type-check/build, no skips; isolated PostgreSQL17 at loopback15437 and MinIO test buckets. Focused HTTP/WS 3/3 PASS; full HTTP regression running. Feature integration10/10 PASS. Full executable migration catalog34, repeat no-op and last migration down/up covered on disposable DB. No dev/VPS database migration, deployment, commit/push or real payment.

FE implementation follows BE in the same task. Browser/multi-user/load/WSS/restore acceptance is separate; original acceptance checklist below remains open until evidenced. Operational limits: full checkpoint fanout, conservative retention, no multi-node writer routing, no measured30-user p95 target.

---

# Phase 7 — Whiteboard progress

**02/11/2026 — Planning complete; implementation NOT STARTED.**

[Plan](../../implement_phase/phase%207/PHASE_7_WHITEBOARD.md) ·
[Flow](../../api_flow/PHASE_7_FLOW.md) ·
[API proposal](../../api_flow/PHASE_7_flow-api-breakdown.md)

## Đã làm

- [x] Đọc source/CSS/data model/collaboration/upload của miro-demo.
- [x] Quan sát UI demo local ở màn hẹp; đối chiếu desktop qua CSS/source.
- [x] Đối chiếu FE2 conventions, Mentor session, Student learning, BE Auth/Classes/Files.
- [x] Ghi layout, responsive, giả định quyền, milestones, persistence và acceptance.
- [x] Phân biệt ảnh PNG demo với checkpoint bảng có thể restore.

## Các slice

| Slice | Kết quả | Trạng thái |
| --- | --- | --- |
| 7.0 | UI theo demo + spike Konva/Yjs/auth/durability | TODO |
| 7.1 | Mentor sửa/lưu, Student chỉ xem, entry theo buổi | TODO |
| 7.2 | Cộng tác/mode/cursor/undo/reconnect/revoke | TODO |
| 7.3 | Clipboard/upload ảnh private đúng scope | TODO |
| 7.4 | Mốc lưu/restore/reset/PNG | TODO |
| 7.5 | PDF + release/ops/load acceptance | TODO |

## Acceptance cần evidence

- [ ] A01: Layout theo demo ở 1440/768/375/320px; canvas không bị dashboard chiếm chỗ.
- [ ] A02: Pan/zoom/sticky editor đúng tọa độ qua resize; touch/stylus/IME dùng được.
- [ ] A03: Bút/tẩy/màu/độ dày, select/drag/delete, undo/redo không phá thao tác người khác.
- [ ] A04: Một board/session, create lặp/concurrent không trùng; Student GET không tạo.
- [ ] A05: FULL/CASH_PREVIEW, cross-class, substitute/makeup đúng scope; negative WS cases.
- [ ] A06: Read-only client gửi sync/update trái phép không mutate; revoke chặn fanout/ghi.
- [ ] A07: Hai browser và multi-tab hội tụ; logout/account switch không rò state qua provider.
- [ ] A08: Sau crash/restart vẫn đủ thao tác đã durable ACK; replay idempotent.
- [ ] A09: Đổi mode/session end race đang vẽ; lifecycle event lặp không tạo mốc trùng.
- [ ] A10: Ảnh READY/private, expired URL, cleanup giữ asset của snapshot.
- [ ] A11: Restore/reset đổi epoch, client cũ không phục sinh phần tử; có mốc dự phòng.
- [ ] A12: PNG toàn nội dung/vùng nhìn đúng bounds, không có cursor/selection ngoài ý định.
- [ ] A13: PDF quota/render/page selection + export PDF, acceptance riêng sau core.
- [ ] A14: Load target có số đo, clean/upgrade migration, WSS deployment, restore/rollback.
- [ ] A15: BE/FE gates + contract/Swagger/Postman/runbook + browser evidence đầy đủ.

## Kiểm tra tài liệu — 02/11/2026

- PASS: 4 tài liệu Phase 7, 12 local links, code fences và trailing whitespace.
- PASS: `git diff --check` cho thay đổi tracked.
- Không chạy BE/FE application tests vì chỉ sửa tài liệu.

## Evidence và giới hạn

Lượt này chỉ planning/tài liệu. Demo đã được mở để tham khảo UI, không phải nghiệm
thu board production. Không sửa FE/demo, không thêm dependency/migration, không
chạy application suites, không deploy hoặc commit/push. Link/diff checks ghi theo
kết quả lượt planning; các checkbox acceptance vẫn mở.
