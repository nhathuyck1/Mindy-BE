# Mindy Center – Database review và thiết kế bổ sung

Phạm vi: một trung tâm, modular monolith, PostgreSQL + Redis + MinIO + Judge Worker.

## 1. Kết luận

Schema hiện tại đã có nền tảng tốt cho user, course/class, enrollment, order/payment, chat, assignment, attendance và online judge. Chưa cần tách microservice; chỉ nên bổ sung bảng khi có ranh giới nghiệp vụ rõ ràng.

Ba thay đổi nên làm ngay:

1. Thêm `file_metadata` để lưu metadata theo loại file; không tạo riêng `video_files`, `pdf_files`, `word_files`.
2. Sửa whiteboard theo mô hình: trạng thái realtime ở Redis/Yjs, một bản hiện tại trong PostgreSQL, snapshot lịch sử có kiểm soát; không append snapshot mỗi vài giây.
3. Tách rõ compiler thành `code_workspaces` (autosave/live inspection), `code_runs` (nút Run) và `code_submissions` + `judge_runs` + `test_results` (nút Submit/chấm điểm).

## 2. Các phần còn thiếu so với requirement

### P0 – cần cho hệ thống

- OAuth Google/GitHub: thiếu bảng liên kết danh tính ngoài (`user_identities`).
- Mentor chính và trợ giảng: `classes.mentor_id` chỉ hỗ trợ một mentor; cần `class_staff`.
- Course public detail: thiếu `slug`, `thumbnail_file_id`, `intro_video_file_id`, `level`, `objectives`, `refund_policy`, `reservation_policy`.
- Material: hiện chỉ hỗ trợ file; requirement còn có link ngoài, video, ZIP/source code và trạng thái mở khóa.
- Thanh toán: cần idempotency cho webhook PayOS để tránh ghi nhận thanh toán hai lần.
- Board: thiếu export job PNG/PDF và chiến lược lưu state phù hợp với Yjs/Konva.
- Compiler: thiếu custom run, autosave workspace, runtime version, stdout/stderr/exit code và dữ liệu actual output cho việc debug.
- Constraint cơ bản: amount >= 0, percent trong 0..100, `starts_at < ends_at`, `start_date <= end_date`, `max_students > 0`, size >= 0.

### P1 – giai đoạn tiếp theo

- Coupon/voucher mức cơ bản.
- Trạng thái bảo lưu của enrollment (`PAUSED` hoặc `RESERVED`).
- Audit log cho hành động admin quan trọng.
- Transactional outbox cho email/in-app notification.
- `deleted_at` cho course/class/material nếu cần khôi phục dữ liệu đã ẩn.

### Chỉ triển khai khi có nhu cầu rõ ràng

- Combo khóa học đầy đủ.
- Watermark sinh riêng cho từng học viên.
- Version history vô hạn cho board/code.
- Nhiều board trong một buổi học, nhiều trang board dưới dạng bảng riêng.
- Lưu mọi keystroke/Yjs update vào PostgreSQL.
- Một bảng runtime cho phép admin tự nhập Docker command/image tùy ý.

## 3. File/Object – thiết kế đề xuất

Không nên tạo bảng riêng cho video, PDF và Word. `file_objects` tiếp tục là nguồn sự thật về object trong MinIO; thêm đúng một bảng `file_metadata` để chứa metadata đã trích xuất.

Các rule MIME, extension, giới hạn dung lượng và schema validate nên nằm trong code (Zod/class-validator), không cần một bảng `file_type_definitions` động. Điều này tránh biến DB thành hệ thống schema động khó kiểm soát.

```dbml
Enum file_kind {
  GENERIC
  IMAGE
  VIDEO
  AUDIO
  PDF
  DOCUMENT
  PRESENTATION
  ARCHIVE
  SOURCE_CODE
}

Enum file_processing_status {
  PENDING
  PROCESSING
  READY
  FAILED
}

Table file_objects {
  id uuid [pk]
  owner_user_id uuid
  bucket varchar(100) [not null]
  object_key varchar(1024) [not null]
  original_name varchar(500) [not null]
  extension varchar(20)
  mime_type varchar(150) [not null]
  kind file_kind [not null, default: 'GENERIC']
  size_bytes bigint [not null]
  sha256 char(64)
  status file_status [not null, default: 'PENDING_UPLOAD']
  created_at timestamptz [not null, default: `now()`]
  ready_at timestamptz
  deleted_at timestamptz

  indexes {
    (bucket, object_key) [unique]
    (owner_user_id, created_at)
    (kind, status)
    (sha256)
  }
}

Table file_metadata {
  file_object_id uuid [pk]
  processing_status file_processing_status [not null, default: 'PENDING']

  // Common media metadata; null when not applicable.
  duration_ms bigint
  width_px integer
  height_px integer
  page_count integer

  // Example: h264, vp9, aac; do not use this as an authorization rule.
  video_codec varchar(50)
  audio_codec varchar(50)
  bitrate_kbps integer

  // Thumbnail for video/image, rendered first page for PDF/DOCX, etc.
  preview_file_id uuid

  // Less common type-specific values.
  properties jsonb [not null, default: `{}`]
  processing_error text
  extracted_at timestamptz
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
}

Ref: file_metadata.file_object_id - file_objects.id
Ref: file_metadata.preview_file_id > file_objects.id
```

Ví dụ `properties`:

```json
// VIDEO
{
  "container": "mp4",
  "fps": 30,
  "audioChannels": 2
}

// PDF
{
  "title": "Lesson 01",
  "author": "Mindy",
  "encrypted": false
}

// DOCUMENT (doc/docx)
{
  "wordCount": 1840,
  "hasMacros": false
}

// ARCHIVE (zip)
{
  "entryCount": 23,
  "uncompressedSizeBytes": 5830012
}
```

Quy tắc quan trọng:

- MIME type do backend kiểm tra từ nội dung file, không chỉ tin extension hoặc MIME do client gửi.
- `file_objects.status = READY` chỉ sau khi upload hoàn tất và object tồn tại trong MinIO.
- Worker async đọc metadata và cập nhật `file_metadata.processing_status`.
- `properties` chỉ giữ metadata phụ; các field cần filter/sort thường xuyên phải là cột thật.
- Không lưu URL presigned trong DB vì URL này có hạn sử dụng.

## 4. Whiteboard – thiết kế đề xuất

### Luồng dữ liệu

```text
Client Konva <-> Yjs/WebSocket <-> Redis (hot state + presence)
                                  |
                                  +-> debounce 10–30 giây: UPDATE boards.current_state_jsonb
                                  +-> cuối buổi/manual: INSERT board_snapshots
                                  +-> export async: board_exports -> file_objects/MinIO
```

Không lưu cursor/presence vào PostgreSQL. Không append snapshot vài giây một lần vì một buổi hai giờ có thể sinh hàng nghìn row. Bản hiện tại được overwrite; snapshot lịch sử chỉ tạo khi manual, cuối buổi hoặc trước một thay đổi lớn.

`mode` đã thể hiện quyền học viên nên bỏ `student_draw_enabled` để tránh hai field mâu thuẫn.

```dbml
Enum board_mode {
  PRESENTATION
  COLLABORATIVE
}

Enum board_snapshot_reason {
  MANUAL
  SESSION_END
  BEFORE_RESET
}

Enum board_export_format {
  PNG
  PDF
}

Enum async_job_status {
  QUEUED
  RUNNING
  COMPLETED
  FAILED
}

Table boards {
  id uuid [pk]
  class_session_id uuid [not null, unique]
  title varchar(250) [not null]
  mode board_mode [not null, default: 'PRESENTATION']
  presenter_user_id uuid

  // Canonical persisted Konva document. Yjs update log remains ephemeral.
  current_state_jsonb jsonb [not null, default: `{}`]
  current_version bigint [not null, default: 0]
  last_persisted_at timestamptz

  created_by uuid [not null]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]
}

Table board_snapshots {
  id uuid [pk]
  board_id uuid [not null]
  version bigint [not null]
  reason board_snapshot_reason [not null]

  // Store small snapshots inline. Large snapshots may use file_object_id.
  state_jsonb jsonb
  file_object_id uuid
  checksum char(64) [not null]

  created_by uuid
  created_at timestamptz [not null, default: `now()`]

  indexes {
    (board_id, version) [unique]
    (board_id, created_at)
  }

  Note: 'Exactly one of state_jsonb and file_object_id must be set.'
}

Table board_assets {
  id uuid [pk]
  board_id uuid [not null]
  file_object_id uuid [not null]
  element_id varchar(150) [not null]
  asset_type varchar(30) [not null, note: 'IMAGE or PDF_PAGE']
  created_by uuid [not null]
  created_at timestamptz [not null, default: `now()`]

  indexes {
    (board_id, element_id) [unique]
    (file_object_id)
  }
}

Table board_exports {
  id uuid [pk]
  board_id uuid [not null]
  snapshot_id uuid
  format board_export_format [not null]
  status async_job_status [not null, default: 'QUEUED']
  file_object_id uuid
  requested_by uuid [not null]
  error_message text
  created_at timestamptz [not null, default: `now()`]
  started_at timestamptz
  finished_at timestamptz

  indexes {
    (status, created_at)
    (board_id, created_at)
  }
}

Ref: boards.class_session_id > class_sessions.id
Ref: boards.presenter_user_id > users.id
Ref: boards.created_by > users.id
Ref: board_snapshots.board_id > boards.id
Ref: board_snapshots.file_object_id > file_objects.id
Ref: board_snapshots.created_by > users.id
Ref: board_assets.board_id > boards.id
Ref: board_assets.file_object_id > file_objects.id
Ref: board_assets.created_by > users.id
Ref: board_exports.board_id > boards.id
Ref: board_exports.snapshot_id > board_snapshots.id
Ref: board_exports.file_object_id > file_objects.id
Ref: board_exports.requested_by > users.id
```

Ghi chú triển khai:

- Redis room key có thể suy ra từ `board_id`; không cần bảng room/session riêng.
- Quyền truy cập suy ra từ `class_session -> class_unit -> class -> enrollment/class_staff`; không cần `board_members`.
- Server là bên quyết định mode và quyền ghi; client chỉ ẩn/hiện toolbar không đủ an toàn.
- Giới hạn kích thước `current_state_jsonb`; asset binary luôn ở MinIO, state chỉ giữ ID/URL logic.

## 5. Compiler/Judge – thiết kế đề xuất

### Phân biệt ba khái niệm

- `code_workspaces`: bản code đang soạn, được autosave và dùng cho mentor xem realtime.
- `code_runs`: mỗi lần bấm Run với custom input; không tính điểm.
- `code_submissions`: snapshot bất biến khi bấm Submit; được judge bằng hidden test cases.

Realtime typing dùng Yjs/WebSocket + Redis. PostgreSQL chỉ lưu bản code gần nhất theo debounce và các lần Run/Submit, không lưu từng phím gõ.

```dbml
Enum code_run_status {
  QUEUED
  RUNNING
  COMPLETED
  FAILED
}

Table code_runtimes {
  code varchar(30) [pk, note: 'python, cpp, javascript']
  display_name varchar(80) [not null]
  version varchar(50) [not null]
  source_filename varchar(100) [not null]
  image_ref varchar(255) [not null, note: 'Pinned image/tag for audit only']
  is_enabled boolean [not null, default: true]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  Note: 'Worker must whitelist runtime code; never execute an arbitrary image/command read from DB.'
}

Table problems {
  id uuid [pk]
  assignment_id uuid [not null]
  position integer [not null, default: 1]
  title varchar(250) [not null]
  statement_markdown text [not null]
  time_limit_ms integer [not null, default: 2000]
  memory_limit_kb integer [not null, default: 262144]
  max_output_bytes integer [not null, default: 65536]
  created_by uuid [not null]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (assignment_id, position) [unique]
  }
}

Table problem_runtimes {
  problem_id uuid [not null]
  runtime_code varchar(30) [not null]
  starter_code text

  indexes {
    (problem_id, runtime_code) [pk]
  }
}

Table test_cases {
  id uuid [pk]
  problem_id uuid [not null]
  position integer [not null]
  is_sample boolean [not null, default: false]
  input_text text [not null]
  expected_output_text text [not null]
  score_weight decimal(8,2) [not null]

  indexes {
    (problem_id, position) [unique]
  }

  Note: 'Hidden input/output must never be returned through student APIs.'
}

Table code_workspaces {
  id uuid [pk]
  problem_id uuid [not null]
  student_id uuid [not null]
  runtime_code varchar(30) [not null]
  source_code text [not null]
  revision bigint [not null, default: 0]
  last_saved_at timestamptz
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (problem_id, student_id) [unique]
    (student_id, updated_at)
  }
}

Table code_runs {
  id uuid [pk]
  workspace_id uuid [not null]
  requested_by uuid [not null]
  runtime_code varchar(30) [not null]

  // Immutable snapshot used by the worker.
  source_code text [not null]
  stdin_text text

  status code_run_status [not null, default: 'QUEUED']
  verdict judge_verdict [not null, default: 'PENDING']
  stdout_text text
  stderr_text text
  compiler_output text
  exit_code integer
  execution_time_ms integer
  memory_used_kb integer
  output_truncated boolean [not null, default: false]

  queued_at timestamptz [not null, default: `now()`]
  started_at timestamptz
  finished_at timestamptz

  indexes {
    (status, queued_at)
    (workspace_id, queued_at)
  }
}

Table code_submissions {
  id uuid [pk]
  problem_id uuid [not null]
  assignment_submission_id uuid [not null]
  student_id uuid [not null]
  runtime_code varchar(30) [not null]
  source_code text [not null]
  source_sha256 char(64) [not null]
  attempt_number integer [not null]
  status judge_status [not null, default: 'QUEUED']
  final_verdict judge_verdict [not null, default: 'PENDING']
  score decimal(8,2)
  submitted_at timestamptz [not null, default: `now()`]
  judged_at timestamptz

  indexes {
    (problem_id, student_id, attempt_number) [unique]
    (assignment_submission_id)
    (status, submitted_at)
  }
}

Table judge_runs {
  id uuid [pk]
  code_submission_id uuid [not null]
  run_attempt integer [not null, default: 1]
  worker_id varchar(100)
  status judge_status [not null, default: 'QUEUED']
  verdict judge_verdict [not null, default: 'PENDING']
  compiler_output text
  system_error_code varchar(80)
  queued_at timestamptz [not null, default: `now()`]
  started_at timestamptz
  heartbeat_at timestamptz
  finished_at timestamptz

  indexes {
    (code_submission_id, run_attempt) [unique]
    (status, queued_at)
  }
}

Table test_results {
  id uuid [pk]
  judge_run_id uuid [not null]
  test_case_id uuid [not null]
  verdict judge_verdict [not null]
  actual_output_text text
  stderr_text text
  exit_code integer
  output_truncated boolean [not null, default: false]
  execution_time_ms integer
  memory_used_kb integer
  score_awarded decimal(8,2) [not null, default: 0]

  indexes {
    (judge_run_id, test_case_id) [unique]
  }

  Note: 'For hidden tests, student API returns verdict/time/memory only; do not expose actual output or stderr when it can leak the test.'
}

Ref: problem_runtimes.problem_id > problems.id
Ref: problem_runtimes.runtime_code > code_runtimes.code
Ref: code_workspaces.problem_id > problems.id
Ref: code_workspaces.student_id > users.id
Ref: code_workspaces.runtime_code > code_runtimes.code
Ref: code_runs.workspace_id > code_workspaces.id
Ref: code_runs.requested_by > users.id
Ref: code_runs.runtime_code > code_runtimes.code
Ref: code_submissions.runtime_code > code_runtimes.code
```

Quy tắc worker tối thiểu:

- Mỗi job chạy trong container không có network, non-root, read-only root filesystem, giới hạn CPU/RAM/PIDs/time/output.
- Worker chỉ nhận `runtime_code` thuộc whitelist và map sang image/command từ config triển khai.
- `code_runs.source_code` và `code_submissions.source_code` là snapshot bất biến để kết quả có thể audit.
- Job BullMQ phải idempotent theo `code_run.id` hoặc `judge_run.id`.
- Có `heartbeat_at` để phát hiện worker chết; retry tạo `run_attempt` mới, không ghi đè lịch sử cũ.
- Stdout/stderr phải truncate theo `max_output_bytes` để tránh làm đầy Redis/PostgreSQL.

## 6. Các bảng nhỏ nên bổ sung

### OAuth identity

```dbml
Table user_identities {
  id uuid [pk]
  user_id uuid [not null]
  provider varchar(30) [not null, note: 'GOOGLE or GITHUB']
  provider_subject varchar(255) [not null]
  email_at_provider varchar(320)
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (provider, provider_subject) [unique]
    (user_id, provider) [unique]
  }
}

Ref: user_identities.user_id > users.id
```

Không lưu access token/refresh token của Google hoặc GitHub nếu hệ thống chỉ dùng social login và không gọi API của nhà cung cấp sau khi đăng nhập.

### Authentication session, refresh token và cookie

Access token và refresh token của ứng dụng được gửi cho trình duyệt bằng cookie `HttpOnly`. Việc lưu trong cookie không có nghĩa là phải lưu cả hai token trong database:

- Access token là JWT sống ngắn, được kiểm tra bằng chữ ký và `exp`; không lưu trong PostgreSQL.
- Refresh token là chuỗi ngẫu nhiên sống dài; trình duyệt giữ token gốc trong cookie, database chỉ lưu SHA-256 hash.
- Mỗi thiết bị hoặc trình duyệt có một `auth_sessions` riêng để có thể đăng xuất từng thiết bị hoặc tất cả thiết bị.
- Mỗi lần refresh phải rotate token. Token cũ được đánh dấu `used_at`, token mới liên kết qua `replaced_by_token_id`.
- Nếu một refresh token đã dùng lại xuất hiện lần nữa, revoke toàn bộ session vì có khả năng token bị đánh cắp.

```dbml
Table auth_sessions {
  id uuid [pk]
  user_id uuid [not null]
  device_name varchar(150)
  user_agent text
  ip_address inet
  last_seen_at timestamptz
  expires_at timestamptz [not null]
  revoked_at timestamptz
  created_at timestamptz [not null, default: `now()`]

  indexes {
    (user_id, revoked_at)
    (expires_at)
  }
}

Table refresh_tokens {
  id uuid [pk]
  session_id uuid [not null]
  token_hash char(64) [not null, unique, note: 'SHA-256 hash; never store the raw refresh token']
  parent_token_id uuid
  replaced_by_token_id uuid
  expires_at timestamptz [not null]
  used_at timestamptz
  revoked_at timestamptz
  created_at timestamptz [not null, default: `now()`]

  indexes {
    (session_id, expires_at)
    (session_id, revoked_at)
  }
}

Ref: auth_sessions.user_id > users.id
Ref: refresh_tokens.session_id > auth_sessions.id
Ref: refresh_tokens.parent_token_id > refresh_tokens.id
Ref: refresh_tokens.replaced_by_token_id > refresh_tokens.id
```

Cấu hình cookie khuyến nghị:

| Cookie | Thuộc tính |
|---|---|
| Access token | `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, thời hạn khoảng 10–15 phút |
| Refresh token | `HttpOnly`, `Secure`, `SameSite=Strict` hoặc `Lax`, `Path=/api/auth/refresh`, thời hạn theo session |

Không lưu token trong `localStorage` hoặc trả token cho JavaScript đọc. Với production, cookie `Secure` yêu cầu HTTPS. Vì trình duyệt tự gửi cookie, các API thay đổi dữ liệu cần kiểm tra `Origin`/`Referer` và nên dùng CSRF token ở header. Nếu frontend và API thật sự nằm ở hai site khác nhau và phải dùng `SameSite=None`, bắt buộc `Secure` và CSRF protection đầy đủ.

Access token nên chứa tối thiểu `sub` (user ID), `sid` (session ID), `role`, `iat` và `exp`. Khi logout, backend revoke `auth_sessions`, revoke refresh token còn hiệu lực và trả `Set-Cookie` để xóa cả hai cookie.

### Mentor và trợ giảng

```dbml
Enum class_staff_role {
  LEAD_MENTOR
  TEACHING_ASSISTANT
}

Table class_staff {
  class_id uuid [not null]
  user_id uuid [not null]
  role class_staff_role [not null]
  assigned_at timestamptz [not null, default: `now()`]

  indexes {
    (class_id, user_id) [pk]
    (user_id, role)
  }
}

Ref: class_staff.class_id > classes.id
Ref: class_staff.user_id > users.id
```

Khi dùng bảng này, nên bỏ `classes.mentor_id` để có một nguồn sự thật. Ràng buộc “mỗi lớp đúng một LEAD_MENTOR” có thể enforce bằng partial unique index trong migration PostgreSQL.

### PayOS webhook idempotency

```dbml
Table payment_webhook_events {
  id uuid [pk]
  provider varchar(30) [not null, default: 'PAYOS']
  provider_event_id varchar(255) [not null]
  signature_valid boolean [not null]
  payload jsonb [not null]
  processing_status varchar(30) [not null]
  processed_at timestamptz
  error_message text
  created_at timestamptz [not null, default: `now()`]

  indexes {
    (provider, provider_event_id) [unique]
    (processing_status, created_at)
  }
}
```

Nếu PayOS không cung cấp event ID ổn định, dùng hash của payload/các field định danh giao dịch làm idempotency key.

## 7. Sửa material để hỗ trợ file, link và mở khóa

```dbml
Enum material_type {
  FILE
  VIDEO
  EXTERNAL_LINK
  SOURCE_CODE
}

Table materials {
  id uuid [pk]
  course_unit_id uuid [not null]
  class_session_id uuid
  type material_type [not null]
  file_object_id uuid
  external_url text
  title varchar(250) [not null]
  description text
  sort_order integer [not null, default: 0]
  available_at timestamptz
  created_by uuid [not null]
  created_at timestamptz [not null, default: `now()`]
  updated_at timestamptz [not null, default: `now()`]

  indexes {
    (course_unit_id, sort_order)
    (class_session_id, sort_order)
  }

  Note: 'FILE/VIDEO/SOURCE_CODE requires file_object_id; EXTERNAL_LINK requires external_url.'
}
```

Nếu tài liệu dùng chung cho mọi lớp, gắn `course_unit_id`. Nếu là recording/tài liệu riêng của một buổi, gắn thêm `class_session_id`. Quyền xem được suy ra từ enrollment và `available_at`; chưa cần bảng permission riêng.

## 8. Constraint/index cần thêm trong migration PostgreSQL

DBML không diễn đạt tốt toàn bộ constraint, nên đặt trong Prisma migration SQL:

```sql
ALTER TABLE classes
  ADD CONSTRAINT classes_valid_dates CHECK (start_date <= end_date),
  ADD CONSTRAINT classes_positive_capacity CHECK (max_students > 0);

ALTER TABLE class_sessions
  ADD CONSTRAINT class_sessions_valid_time CHECK (starts_at < ends_at);

ALTER TABLE course_units
  ADD CONSTRAINT course_units_required_score_range
  CHECK (required_score_percent BETWEEN 0 AND 100);

ALTER TABLE class_unit_progress
  ADD CONSTRAINT class_unit_progress_range
  CHECK (progress_percent BETWEEN 0 AND 100);

ALTER TABLE file_objects
  ADD CONSTRAINT file_objects_nonnegative_size CHECK (size_bytes >= 0);

ALTER TABLE file_metadata
  ADD CONSTRAINT file_metadata_nonnegative_values CHECK (
    (duration_ms IS NULL OR duration_ms >= 0) AND
    (width_px IS NULL OR width_px > 0) AND
    (height_px IS NULL OR height_px > 0) AND
    (page_count IS NULL OR page_count > 0)
  );

ALTER TABLE board_snapshots
  ADD CONSTRAINT board_snapshots_one_storage
  CHECK ((state_jsonb IS NOT NULL) <> (file_object_id IS NOT NULL));

CREATE UNIQUE INDEX class_staff_one_lead_mentor
  ON class_staff (class_id)
  WHERE role = 'LEAD_MENTOR';
```

Ngoài ra cần check non-negative cho price/amount/quantity/score weights, và dùng transaction khi chuyển order sang `PAID` đồng thời tạo enrollment.

## 9. Khuyến nghị triển khai

Nên triển khai:

- Một board cho mỗi `class_session`, một canvas nhiều phần tử, chưa tách page table.
- Board state overwrite định kỳ; snapshot chỉ manual/end-session; export PNG/PDF async.
- Bắt đầu với Python, C++ và JavaScript; bổ sung Java khi image và judge pipeline đã ổn định.
- Custom Run một input; Submit chạy sample + hidden tests.
- Mentor xem live workspace; chưa cần cùng sửa code nếu không thật sự bắt buộc.
- Một bảng `file_metadata`; metadata extraction chạy async; chỉ bổ sung HLS/transcoding khi có yêu cầu streaming thực tế.

Chỉ nên triển khai khi có nhu cầu rõ ràng:

- CRDT history bền vững vô hạn.
- Video streaming/transcoding nhiều bitrate.
- Admin-defined compiler command/image.
- Generic workflow/permission engine.
- Bảng riêng cho từng loại file.

