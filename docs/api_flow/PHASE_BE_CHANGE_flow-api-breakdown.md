# BE Change — API cho frontend

Ngày 05/11/2026. **Đã có source; chưa deploy/chưa xác minh DB/storage**. [Flow](PHASE_BE_CHANGE_FLOW.md) · [Progress](../progress/BE_CHANGE_PROGRESS.md).

## Quy ước chung

Prefix `/api/v1`. Cookie `access_token` HttpOnly, guards AccessToken/Roles; các mutation mới yêu cầu Origin thuộc CORS_ORIGINS. UUID v4 ở path/body; JSON whitelist, unknown/nested fields sai trả 422. Body toàn cục 64 KiB, lớn hơn trả 413. Private/no-store qua FE proxy; không lưu signed URLs trong query cache. Success trả DTO JSON trực tiếp, không bọc `data` (trừ chat contract cũ).

401 → recovery phiên; 403 → dừng và đọc lại quyền; 404 → ID ngoài scope/không tồn tại; 409 → giữ nội dung người dùng, refetch version/lịch trước ý định mới; 422 → sửa input; lỗi mạng/5xx mutation có receipt → retry **cùng body/key**. Idempotency-Key là UUID v4, không dùng lại cho payload khác. Không tự retry mutation không có receipt.

## 1. Danh mục slot và đọc cấu hình

`GET /teaching-slots`: ADMIN/MANAGER/MENTOR; không query/body. 200 array `{id,startsAt,endsAt}`, clock `HH:mm` theo APP_TIME_ZONE. Slot 1..7 là 07:30–09:00, 09:30–11:00, 12:00–14:00, 13:00–15:30, 16:00–17:30, 18:00–19:30, 20:00–21:30. Slot 3/4 có giao nhau: không được chọn chung cùng ngày nếu gây overlap. FE lịch tuần và chọn slot bù lấy danh mục này; lịch read-only cũ vẫn giữ snapshot nhãn bảy ca để render lịch đã lưu.

`GET /management/classes/:classId/weekly-schedule`: ADMIN/MANAGER. Không query/body. 200 `{class: ClassManagementDetailDto, weeklySlots:[{weekday,slotId}]}`. `class.units[].id` là classUnitId, `units[].sessions[].id` là sessionId; assignmentVersion là version dùng cho save. Empty weeklySlots nghĩa là lớp chưa từng lưu cấu hình tuần. FE đọc sau chọn lớp và sau mutation; không polling. 404/422 xử lý theo quy ước chung.

Danh sách chọn lớp dùng `GET /management/classes?page=1&pageSize=20&status=OPEN|DRAFT` hiện hữu, với pagination và scope hiện hữu; không thêm endpoint list trùng.

## 2. Preview/lưu lịch tuần

`POST /management/classes/:classId/weekly-schedule/preview` → 200.
`POST /management/classes/:classId/weekly-schedule` → 200, thêm **Idempotency-Key**.
ADMIN/MANAGER. Request cùng schema:

```json
{
  "startDate":"2026-12-01",
  "weeklySlots":[{"weekday":1,"slotId":2},{"weekday":4,"slotId":2}],
  "sessions":[{"classUnitId":"11111111-1111-4111-8111-111111111111","title":"Buổi một"}],
  "expectedVersion":1,
  "reason":"Xếp lịch học kỳ mới"
}
```

weekday ISO 1=T2..7=CN; 1..49 cặp, không trùng. sessions 1..500 theo thứ tự chương trình; title 1..250 ký tự không trắng. Với buổi đã tồn tại bắt buộc gửi sessionId, phải bao gồm **mọi buổi cũ đúng thứ tự chương/session**, không đổi classUnitId/title cũ. startDate phải là ngày thật, mọi startsAt sinh ra phải ở tương lai. reason 1..1000; expectedVersion >=1. Lớp DRAFT/OPEN, mọi buổi SCHEDULED và chưa có actualStartedAt; placement phải được giải quyết trước khi lưu.

Response `{timeZone,expectedVersion,sessions:[{sessionId,classUnitId,title,startsAt,endsAt}],conflicts:[{kind,sessionId,conflictingSessionId,startsAt,endsAt}]}`. Preview buổi mới có sessionId=null; save trả ID đã tạo. Time là ISO instant. kind CLASS/MENTOR/STUDENT/APPROVED_LEAVE; preview conflicts khác rỗng khóa nút Lưu. Save kiểm lại dưới lock, không tin preview; 409 SCHEDULE_CONFLICT có details buổi/time, CLASS_VERSION_CONFLICT/CLASS_SCHEDULE_STALE yêu cầu tải lại, CLASS_SCHEDULE_NOT_EDITABLE dừng edit. Error placement SESSION_HAS_MAKEUP_PLACEMENTS dùng flow xử lý học bù hiện hữu.

Save cập nhật lịch/cấu hình/class startDate/endDate/version/audits cùng commit. Replay trả outcome cũ, không dịch lịch lần nữa. Invalidate schedule-config, class lists/detail, mentor/student schedules, dashboard. Loading khóa form; empty timetable tạo danh sách buổi từ chương; 413 cần giảm số/tên buổi hoặc chia nghiệp vụ trước khi gửi, không tăng global body limit.

## 3. Khai giảng

Các ClassDto/TeachingClassDto thêm `minStudents=3`, `activeStudentCount`, `scheduledStartAt` nullable, `startEligibility`, `startIneligibilityReason` nullable. `activeStudentCount` là ACTIVE có order PAID hiện tại; không phải occupiedSeats (có thể gồm hold). Eligibility: NOT_OPEN, NO_SCHEDULE, TOO_EARLY, RESCHEDULE_REQUIRED, ELIGIBLE. Quyết định cutoff xét history và paidAt tại scheduledStartAt, vì vậy activeStudentCount hiện tại >=3 vẫn có thể RESCHEDULE_REQUIRED.

`POST /admin/classes/:classId/open` hiện hữu: 200 detail, thêm 409 CLASS_CAPACITY_TOO_SMALL nếu maxStudents<3. Không bắt đủ học viên ở DRAFT→OPEN.

`POST /admin/classes/:classId/start` hiện hữu: 200 detail nếu đến mốc và đủ người tại cutoff; 409 CLASS_START_INELIGIBLE với lý do. Không đánh dấu session hay tạo attendance. Các start session hiện hữu cũng dùng guard; SESSION_START_TOO_EARLY nếu session chưa đến giờ. Worker 15s có cùng semantics, lưu STARTED/BLOCKED; manager dùng lịch tuần dời mốc khi bị chặn. Cần migrations và CLASS_OPENING_JOB_ENABLED=true. Không có public API cho worker.

## 4. Nghỉ cả ngày

Giữ các route leave preview/makeup-slots/create/approve hiện có, xem [Phase4.4](PHASE_4_4_flow-api-breakdown.md). FULL_DAY nhận **một trong hai** dayMappings hoặc sessionMappings; FE đã bỏ refine cũ chỉ nhận dayMappings cho FULL_DAY. dayMappings giữ giờ/thời lượng; sessionMappings cho chọn ngày/period/startsAt/endsAt từng buổi, vẫn giữ duration. Kiểm trước gửi và trước duyệt; adjacent hợp lệ, partial/full overlap 409 LEAVE_TARGET_CONFLICT hoặc LEAVE_STUDENT_CONFLICT. details có session/source ID và startsAt/endsAt; proxy chỉ giữ các trường an toàn, không phản chiếu payload nội bộ. Rollback không sửa/xóa buổi đích có sẵn. FE giữ bản nháp và hiện danh sách interval conflict.

## 5. Swap mentor

`POST /mentor/classes/:classId/sessions/swap`: MENTOR đang active, 200 WeeklySchedulePreviewDto; Origin + Idempotency-Key.

Body `{firstSessionId,secondSessionId,firstVersion,secondVersion,reason}`; UUIDs khác nhau, version>=1, reason 1..1000. Hai buổi thuộc lớp path, SCHEDULED ở tương lai, cùng duration, effective mentor của cả hai phải là actor. Không nhận mentorId. 403 SESSION_ASSIGNMENT_REQUIRED; 404 CLASS_SESSION_NOT_FOUND; 409 SESSION_VERSION_CONFLICT/SESSION_STATE_CONFLICT/SESSION_DURATION_MISMATCH/SCHEDULE_CONFLICT/SESSION_HAS_MAKEUP_PLACEMENTS/IDEMPOTENCY_KEY_REUSED. Hai cặp startsAt/endsAt được hoán đổi trong một transaction; ID/nội dung/mentor không đổi. Retry cùng key không swap lại. FE hiện preview lựa chọn và lý do rồi xác nhận, khóa khi gửi; refetch lịch và dashboard sau success/conflict.

## 6. Dashboard

`GET /admin/dashboard?days=30|90|365`: ADMIN, giữ DTO/query cũ kế thừa origin/dev.

`GET /manager/dashboard?days=30|90|365`: MANAGER; mặc định90. 200 `{scope,timeZone,generatedAt,from,to,summary,paymentMethods,trend,courses,classes,reconciliation,openingAlerts}`. summary: collectedAmount/paidOrders trong kỳ theo paidAt; pendingAmount/pendingOrders là snapshot các order PENDING chưa hết hạn. Amount là decimal string VND nguyên. paymentMethods/courses/classes có `{id,name,amount,orders}`; tổng amount theo courses/classes khớp tổng collected. Một order nhiều lớp chỉ tính một lần ở summary và mỗi detail đúng một lần trong phân bổ. trend `{date,amount,orders}` theo ngày Vietnam, có ngày0. reconciliation tối đa100 order REQUIRES_REVIEW; openingAlerts tối đa100 `{classId,className,scheduledStartAt,activeStudentCount,missingStudents}` theo cutoff bị chặn còn hiệu lực. Màn dashboard không thay thế danh sách đối soát phân trang.

`GET /mentor/dashboard?days=30|90|365`: MENTOR. 200 `{scope,timeZone,generatedAt,from,to,summary,upcoming,leaveRequests}`. summary: primaryClasses/students là scope hiện tại; assignedSessions/substituteSessions/completedSessions/actualTeachingHours trong kỳ; giờ dùng actualEndedAt-actualStartedAt các buổi COMPLETED có đủ timestamp. upcoming tối đa20 `{sessionId,classId,title,startsAt,endsAt}` theo phân công thật, leaveRequests `{status,count}` của actor trong kỳ. Không có revenue, mentors ranking hay systemwide student count. Identity từ cookie, query mentorId bị 422.

FE tách renderer/schema theo role; query key user/role/days, stale60s của Admin và query invalidation các mutation. Filter/refetch không mutation dữ liệu; empty hiển thị0 thật, API error hiển thị lỗi/thử lại. 422 filter không hợp lệ; 401/403 dừng lấy dữ liệu ngoài vai trò.

## 7. Material tracking và inventory

`POST /materials/:materialId/open`: STUDENT/MENTOR, Origin, body `{classId,expectedRevision}`, 204 không body. Chỉ gọi sau mở nội dung chính thành công. BE kiểm policy và revision, cập nhật lastSeenAt server/isUnseen=false; không thay revision. Manager403, sai scope404/403 theo policy; revision409 MATERIAL_REVIEW_CONFLICT. Không gọi từ list, prefetch hoặc asset phụ; không tự retry liên tục. Tracking lỗi không chặn viewer đã có quyền.

`GET /manager/materials` và list theo course unit hiện hữu thêm query `unseen=true|false`; giữ page/pageSize/contentType/reviewStatus/courseUnitId. DTO thêm lastSeenAt nullable, trackingStartedAt, isUnseen, relatedSizeBytes decimal string (distinct primary+refs trong material, có thể dùng chung với material khác). Không suy dung lượng reclaim từ tổng relatedSizeBytes. Manager xem detail/preview không ghi nhận open.

`POST /manager/materials/bulk-delete`: MANAGER+Origin, body `{items:[{materialId,expectedRevision,lastSeenAt,trackingStartedAt}]}`, 1..100, không duplicate. lastSeenAt phải có key, nullable cho chưa xem; gửi nguyên snapshot ISO từ inventory. 200 `{items:[{materialId,status}]}`, status DELETED/STALE/NOT_FOUND/ALREADY_DELETED. Từng mục commit riêng; stale bỏ qua, giữ material. Unknown/input422; role403. Retry danh sách đã xóa trả ALREADY_DELETED. Hiện dialog tên/revision, khóa submit, refetch inventory/stats sau kết quả; STALE cần manager đọc lại và xác nhận mới.

`GET /manager/materials/storage-cleanup`: MANAGER, không query/body, 200 `{reclaimableBytes,reclaimedBytes,pendingFiles,failedFiles}`. Reclaimable là ước tính tệp queued không có live material references; reclaimed là byte đã xác nhận+checkpoint. Cleanup OFF hoặc storage lỗi không được biến soft-delete thành freed bytes. Refresh thủ công; không polling vô hạn. File dùng chung giữ lại; job retry/tombstone bền vững. DELETE đơn hiện hữu vẫn204 và nay cũng enqueue cleanup.

## 8. Chat preview/emoji

`POST /chat/conversations/:conversationId/messages/:messageId/file-access?disposition=inline|attachment`: STUDENT/MENTOR, Origin; không body, mặc định attachment. 200 `{url,expiresAt}` giữ contract cũ; TTL60s. inline chỉ IMAGE READY; PDF inline422 CHAT_INVALID_INPUT; thiếu quyền/file404 CHAT_NOT_FOUND; storage503 CHAT_STORAGE_UNAVAILABLE. Recheck quyền/message sau presign. URL đã cấp vẫn có hiệu lực đến TTL; không hứa revoke ngay.

FE preview trước gửi dùng object URL; gửi vẫn intent→PUT storage→complete→READY→message. Ảnh<=5MiB, PDF<=10MiB. Sau gửi ảnh inline và dialog mở lớn; hết hạn/error hiện lấy lại URL. Emoji Unicode dùng send/edit/socket hiện có; không thêm endpoint/reaction/sticker. Kiểm UTF-16 length4000 và UTF-8 budget16384 cho emoji tổ hợp.

## 06/11/2026 — Ghi chú review seed

Không thêm/sửa endpoint hoặc DTO. Standard seed/rerun đã kiểm trên PostgreSQL test tách biệt, chưa seed dev/VPS. Fixture còn thiếu audit cho tracking/history và lệch historical enrollment cutoff so với quyết định khai giảng; không dùng các bản ghi demo này làm evidence nghiệm thu các API lịch sử/cutoff. Biome seed chưa pass; type-check và 9 test lịch pass. Xem [flow](PHASE_BE_CHANGE_FLOW.md) và `docs/progress/Progress.md` cho số liệu, giới hạn và các việc chưa sửa.
