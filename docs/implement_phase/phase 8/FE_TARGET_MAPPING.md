# Phase 8 — FE target mapping và compatibility

Review read-only FE2 tại `D:/FPT_University/FA26/WDP301/Mindy-FE2`,
HEAD `0171717`, 20/11/2026. Checkout FE có thay đổi local ngoài notification;
không sửa FE trong Phase 8. Route inventory kiểm theo file page.tsx và component
được import, chưa chạy browser/navigation acceptance.

[API contract](../../api_flow/BUSINESS_NOTIFICATIONS_flow-api-breakdown.md) ·
[Phase 8](PHASE_8_CONTRACTS_POLICY.md).

## 1. Mapping v1

Business API trả typed target + contextId nếu cần, không arbitrary href.
FE dùng allowlist role/kind; encode UUID, không nối URL do event payload cung cấp.
target.available xác định quyền BE; frontend route support là gate riêng.
Nếu route chưa hỗ trợ hoặc không có quyền thì hiển thị generic notice + trạng thái
“Không thể mở nội dung”, không chuyển sang trang quản lý khác role.

| Target / role | Route hiện có đã kiểm file | Mức hỗ trợ / việc Phase 15 |
| --- | --- | --- |
| CHAT / Student | /user/messages?conversation={id} | ChatPage đọc conversation query; không có message-anchor deep link được chứng minh |
| CHAT / Mentor | /mentor/messages?conversation={id} | Như Student |
| SESSION / Student | /user/schedule | Fallback lịch; chưa có route session detail riêng, cần focus/highlight session theo context |
| SESSION / Mentor | /mentor/sessions/{id} | Có page nhận sessionId |
| CLASS / Student | /user/materials/{id} | Learning workspace của class, không dùng cho canceled unavailable target |
| CLASS / Mentor | /mentor/classes/{id} | Có page nhận classId; mở lại vẫn qua domain policy |
| ASSIGNMENT / Student | /user/assignments/{id} | Có page nhận assignmentId; CODE/QUIZ dispatch do component hiện có |
| SUBMISSION / Student ZIP | /user/zip-submissions/{id} | N08 chỉ ZIP; không điều hướng CODE qua route ZIP |
| ORDER / Student | /checkout/{id} | CheckoutPage nhận orderId; cần browser verify hiển thị cả terminal PAID/EXPIRED; fallback /user/orders |
| LEAVE / Mentor | /mentor/leave-requests | Có danh sách, chưa có request-detail route; Phase 15 cần focus requestId hoặc detail mới |
| LEAVE / Manager | /manager/leave-requests/{id} | Có page detail nhận requestId |
| LEAVE / Admin | Chưa có route detail | Phải thêm UI/route được ADMIN guard cho phép trước enable N12 cho Admin; không dùng /manager route khi chưa kiểm guard |
| MAKEUP / Student | /user/schedule | Fallback lịch, cần focus placement/target session |
| MAKEUP / Mentor | /mentor/sessions/{targetSessionId} | Cần contextId=targetSessionId từ server; placementId không phải sessionId |
| MATERIAL / Student | /user/materials/{classId} | contextId=classId; materialId là target.id, workspace chưa đọc deep link materialId; Phase 15 bổ sung focus |
| Business inbox / tất cả role | Chưa có trang inbox chung được chứng minh | Phase 15 xây chuông/inbox dùng contract mới, badge/read/refetch/fallback |

## 2. Nguyên tắc rollout client

Giữ legacy /notifications và hai chat event names hiện tại riêng; client mới dùng
/notification-inbox và notification-inbox:* (xem API). Không ép parser CHAT_MESSAGE
cũ nhận type mới hoặc nullable message refs. Không sửa namespace/handshake chat
để mở quyền cho Manager/Admin.

UI Admin leave detail và material/session focus chưa có source cần được theo dõi
là gap Phase 15; không ghi route tưởng tượng thành implemented. Có thể rollout
business producers trước FE khi flags delivery OFF; chỉ enable recipient/feature
khi người dùng nhận notice đọc được và UI thể hiện target-unavailable rõ ràng.
