# Phase 5 progress — Assignment: bài kiểm tra/BTVN, QUIZ/ZIP

2026-10-22 — PLANNED, base `1e89579`.
DBML audit xác nhận assignment owner là ClassSession; source không có feature.
[Plan](../../implement_phase/phase%205/PHASE_5_ASSIGNMENTS.md) ·
[flow](../../api_flow/PHASE_5_FLOW.md) ·
[API proposal](../../api_flow/PHASE_5_flow-api-breakdown.md).

| Slice | Trạng thái |
|---|---|
| Planning/data relationship audit | Draft plan viết xong, chưa phê duyệt từng business default. |
| A0 scope/schema | TODO |
| A1 QUIZ questions/options/private keys/publish | TODO |
| A2 start/resume/timer/answers/submit/timeout worker/result | TODO |
| A3 private ZIP upload/validation/access | TODO |
| A4 ZIP submit/manual grade/revisions/release | TODO |
| A5 metrics/tests/Swagger/Postman/handoff | TODO |
| Compiler/CODE | Ngoài v1, cần plan riêng. |

User xác nhận QUIZ ABCD và ZIP; chọn hết quiz rồi nộp một lần, BE mới tính và đưa
đáp án. Assignment là TEST hoặc HOMEWORK. QUIZ bật/tắt timer theo phút; ZIP deadline
ngày/giờ, không duration timer. Plan/flow/API đã đồng bộ. Single-choice/one-attempt,
timeout chốt saved answers/câu trống sai, ZIP limits/grade release vẫn là đề xuất.

Evidence hiện chỉ static docs/source audit. Không migration/entity/controller mới,
không chạy runtime gates, không deploy hay nghiệm thu browser/storage.

Static validation: 8 new plan/flow/API/progress documents, 23 relative links and
5 JSON examples checked with Node; no errors; git diff --check passed.
