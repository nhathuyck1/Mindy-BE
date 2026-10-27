# Phase 6.0 — Contracts, access và biên tích hợp

Tách thành plan riêng ngày **2026-10-26** từ slice 6.0 của kế hoạch Phase 6 ngày 2026-10-24.

[Plan Phase 6](PHASE_6_CHAT_NOTIFICATIONS.md) ·
[Progress Phase 6](../../progress/phase%206/PHASE_6_PROGRESS.md) ·
[Flow](../../api_flow/PHASE_6_FLOW.md) ·
[API](../../api_flow/PHASE_6_flow-api-breakdown.md) ·
[Runbook](../../PHASE_6_CHAT_RUNBOOK.md).

[Tiếp: 6.1](PHASE_6_1_SCHEMA_CRYPTO_FOUNDATION.md)

**Cách đọc:** nội dung bên dưới giữ task, acceptance criteria và thứ tự triển khai của baseline planning.
Runtime đã có source local theo implementation revision ở plan tổng; tên file/provider và các mốc
“chưa mở” trong baseline là dự kiến tại thời điểm lập kế hoạch. Quyết định implementation hiện hành
xem plan tổng/API; evidence và phần chưa nghiệm thu xem Progress. Checkbox chưa tick không có nghĩa
source chưa tồn tại; việc tách tài liệu không xác nhận thêm AC hoặc thay đổi trạng thái triển khai.

Các quy tắc nghiệp vụ, schema, transaction và phạm vi chung tiếp tục nằm trong
[plan tổng](PHASE_6_CHAT_NOTIFICATIONS.md); đọc cùng plan này trước khi triển khai hoặc review.

## Nghiệm thu tự động — 2026-10-26 (Docker)

**4/4 AC PASS — local backend**. Đã có bằng chứng cho các tiêu chí bên dưới; deployment/VPS/FE/browser/load acceptance vẫn cần evidence riêng.

| AC | Kết quả | Evidence |
|---|---|---|
| AC6.0-1 | PASS | P và source: matrix actor/payment/class/expiry. |
| AC6.0-2 | PASS | P + L: DM nhiều quan hệ, group cancelled, DM restore giữ history và group rejoin đổi cửa sổ. |
| AC6.0-3 | PASS | Source providers manager/batch, lock/receipt mapping; AppModule compiled H không vòng import. |
| AC6.0-4 | PASS | Source DTO/error/event và runtime revision tách rõ baseline trước6.2 với API hiện hành. |

Ký hiệu P/C/S/L/H/F/G/R/U, kết quả gates và migration dev: [Progress Phase6](../../progress/phase%206/PHASE_6_PROGRESS.md#docker-acceptance-2026-10-26).
Không thay runtime API/quyền; dev database đã migrate theo yêu cầu user. Các điều khiển barrier/crash chỉ có trong fixture của dedicated HTTP-test DB.

## 1. Mục tiêu, đầu vào và đầu ra

Chốt một nguồn quyết định quyền cho REST, WS, replay, inbox và Files;
biết chính xác writers/provider nào cần đổi trước tạo schema. Đầu vào: baseline
source hiện tại và policy tại mục 2 của plan tổng. Đầu ra: contracts, policy unit tests và quyết định
schema/lock/module có thể dùng ngay ở6.1. Chưa mở route chat cho FE.

## 2. Công việc triển khai

| Task | Đầu việc và kết quả cần có |
|---|---|
| 6.0-T01 | Lập typed `ChatEntitlement` gồm principal/current role/account, class/primary mentor, enrollment/order CASH expiry, read/write mode và history scope. Tách policy pure khỏi provider đọc DB; không dùng material/assignment access để suy chat. |
| 6.0-T02 | Bổ sung public scope providers vào Classes/Enrollments/Commerce; nhận `EntityManager` để cùng snapshot/transaction. Trả DTO typed, hỗ trợ batch list/recipient checks, không Chat đọc repository entity của module khác. |
| 6.0-T03 | Chốt `ChatAccessPolicy` cho group và DM nhiều lớp chung: writable nếu còn ít nhất một quan hệ writable; completed-only là read-only; không còn quan hệ thì deny. Group luôn xét đúng lớp. Chốt lỗi404/403/503 theo API proposal. |
| 6.0-T04 | Thiết kế Auth public API trả principal + verified access-token expiry, nhận manager khi cần kiểm quyền trong transaction. Giữ contract HTTP cũ; không decode JWT chưa verify hoặc sao chép HTTP guard sang gateway. |
| 6.0-T05 | Chốt versioned lifecycle event envelope và neutral outbox writer: eventId/type/version/aggregate refs/occurredAt, metadata tối thiểu; tất cả ghi bằng manager của writer. Chốt consumer dedupe, retry/lease và cách reconcile current state khi event tới sai thứ tự. |
| 6.0-T06 | Đối chiếu `mutation_receipts`: namespace CHECK, payload_hash, outcome và append-only trigger. Chốt HMAC fingerprint + keyVersion/resource/version mapping, uniqueness actor/operation/scope/key, retention và provider dùng chung hoặc ghi ADR cho bảng riêng. Không đưa raw body vào outcome. |
| 6.0-T07 | Lập lock graph từ checkout/settlement/expiry/class assignment/Auth revoke. Chốt thứ tự source locks trước conversation/membership/message/receipt, multi-ID sort; thêm test interleaving bắt deadlock/revoke race. Không áp một thứ tự khóa giả định cho mọi writer. |
| 6.0-T08 | Chốt DTO/cursor/event/ack/error schemas, limits và feature flags; đối chiếu dependencies Nest11 hiện có để chọn/pin gateway/adapter/Socket.IO lúc implementation. Ghi quyết định mặc định proposed và deferred scope vào flow/API/progress. |

**Source cần nối:** `classes/services/class-read.service.ts`,
`classes/services/teaching-assignment.service.ts`, `enrollments/services/enrollments.service.ts`,
`commerce/services/order-settlement.service.ts`, Auth/Users exported services.
Scope mới dự kiến ở module owner; policy/contract ở `src/modules/chat/domain/` và
`src/modules/chat/chat.contracts.ts`; không biến TrackingModule thành dependency
ngược kéo Auth/Users/Classes vào neutral outbox.

**Điểm cần chốt có evidence:** cash confirm hiện khóa Classes→Order rồi activate
holds; expiry batch khóa Order rồi release holds, không khóa Class. Consumer chat
không được giữ conversation rồi quay lại khóa Order/Class. Class create hiện chưa
nhận actor; nếu chưa truyền actor từ controller, provisioning ghi SYSTEM, không
tự gán `created_by` bằng mentor hoặc UUID giả. Suspend hiện ghi qua UsersService;
logout/logoutAll ghi qua AuthService, đều cần điểm tích hợp revoke riêng ở6.3.

## 3. Tiêu chí nghiệm thu

- [x] `AC6.0-1`: bảng policy unit tests có ACTIVE/CASH valid/CASH đúng hạn expiry/
  PayOS pending/DRAFT/COMPLETED/CANCELLED, mentor cũ/substitute/guest/staff/suspended.
- [x] `AC6.0-2`: DM nhiều lớp chung kiểm được mất một quan hệ nhưng còn quan hệ khác;
  group của lớp bị cancel vẫn deny; rejoin/history defaults được chốt rõ.
- [x] `AC6.0-3`: contracts hỗ trợ source check theo manager và batch, dependency graph
  không vòng; lock graph và receipt storage mapping có quyết định ghi lại.
- [x] `AC6.0-4`: API/event IDs và lỗi thống nhất; defaults còn proposed được phân biệt
  với yêu cầu đã thống nhất. Chưa đánh dấu chat API implemented.
