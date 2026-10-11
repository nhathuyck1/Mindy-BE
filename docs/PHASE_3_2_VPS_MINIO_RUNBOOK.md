# Phase 3.2 — Bật upload trên VPS qua Cloudflare Tunnel

Cập nhật 2026-10-11. User cho biết code 3.2 đã có trên server. Chưa trực tiếp
kiểm tra VPS/migrations/MinIO/tunnel hoặc upload trên server trong lượt này.
Mục tiêu nghiệm thu mỗi slice: API chạy được **trên server**, bên cạnh local tests.
Không đợi 3.6 mới bật upload; 3.6 kiểm toàn hành trình và hardening.

Files API giữ nguyên. [Flow](api_flow/PHASE_3_2_FLOW.md),
[API breakdown](api_flow/PHASE_3_2_flow-api-breakdown.md),
[local runbook](PHASE_3_2_FILES_RUNBOOK.md).

## 1. Chuẩn bị trên VPS

Đưa các file mới trong repo lên VPS trước (qua quy trình Git/deploy đang dùng):
`compose.files-production.yaml`, `tools/minio/client.Dockerfile`,
`tools/minio/provision-production.sh`, `tools/minio/root.production.env.example`.
Không thay `.env.production` hiện có bằng example; giữ payment/auth/database vars.

Trong thư mục repo trên VPS, tạo file chỉ dành cho admin MinIO:

```bash
cp tools/minio/root.production.env.example .env.minio.production
chmod 600 .env.minio.production
nano .env.minio.production
```

Đặt MINIO_ROOT_USER và MINIO_ROOT_PASSWORD (random >=16 ký tự). Root chỉ vào
MinIO/provision container, không vào backend. Không gửi passwords/cookies qua chat.
User không cần truy cập Console hoặc tạo key bằng UI.

Trong `.env.production`, sửa/thêm các biến sau. Tự tạo secret random riêng cho
backend (>=16 ký tự); provision sẽ tạo đúng user/password này trong MinIO:

```dotenv
MINIO_ENABLED=false
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=mindy-backend
MINIO_SECRET_KEY=CHANGE_TO_A_LONG_RANDOM_BACKEND_PASSWORD
MINIO_BUCKET=mindy-center
# Hostname đề xuất; phải tạo route thực trước khi bật upload.
MINIO_PUBLIC_URL=https://storage.quanh123.id.vn
FILE_JOB_ENABLED=true
FILE_SCRATCH_DIRECTORY=/file-scratch
FILE_SCRATCH_TMPFS_SIZE=768m
```

Giữ CORS_ORIGINS là danh sách origin FE thật, không wildcard; MinIO nhận cùng
allowlist từ override. Dùng secret chỉ gồm chữ/số giúp tránh lỗi quoting env.
Bucket mới không có policy public; versioning sẽ bật bằng provisioning.

## 2. Dựng storage và tạo bucket/tài khoản

Định nghĩa function trong shell đang dùng (chạy lại nếu mở shell mới):

```bash
dc() {
  docker compose --env-file .env.production \
    -f compose.production.yaml -f compose.files-production.yaml "$@"
}
dc config --quiet
dc up -d --build minio
dc run --rm --build minio-provision
```

Lệnh cuối: tạo/check bucket, từ chối bucket có policy, bật versioning, tạo user
backend nếu chưa có, gắn IAM policy **chỉ bucket này**, kiểm backend credentials.
Không in secret; không xóa data/bucket/user, không rotate user secret đã tồn tại.
Rerun giữ password cũ: env sai password thì check backend fail; không reset ngầm.
IAM cấp GetBucketLocation/Versioning/Policy/ListBucket và GetObject/GetObjectVersion/
PutObject (đủ upload/validation/copy3.2). Chưa cấp delete/purge3.5 hoặc admin toàn hệ thống.
Chọn user mới riêng cho Mindy; user đã có group/policies khác cần review quyền cũ.

Expected message: `MinIO private bucket, versioning and backend credentials are ready.`
MinIO server/client compile từ releases pinned; không cần cài Go/mc trên host.
Build lần đầu cần Internet/thời gian/RAM. Persist binary trong named volume minio-data;
không chạy `down -v`. Backup volume cùng database trước rollout có dữ liệu thật.

## 3. Thêm hostname vào tunnel đang dùng

Theo evidence cũ, `cloudflare-mindy` và API cùng network `mindy-be_backend`.
Kiểm network hiện tại trước khi dùng route; override MinIO tự vào cùng `backend`
của compose project. Giữ cùng project name/thư mục/flags đang chạy API để không
vô tình tạo một stack/database/network mới. Nếu deploy cũ dùng `-p`, thêm cùng
`-p` vào function dc.

Trong Cloudflare Tunnel đang dùng, thêm published application route:

| Trường | Giá trị đề xuất |
|---|---|
| Hostname | storage.quanh123.id.vn |
| Path | Trống |
| Service | HTTP → minio:9000 |
| HTTP Host Header | Giữ mặc định, không rewrite |

Domain trên chỉ là đề xuất, không khẳng định đã provision. Nếu chọn hostname
khác, MINIO_PUBLIC_URL phải đúng HTTPS hostname đó. Tunnel/container MinIO cần
cùng network, không dùng localhost trong container cloudflared. API MinIO9000,
không console9001. Không cần mở public port9000/9001 hoặc thêm route console.
Giữ Host/path/query signed URL, không browser-login Access/challenge cản PUT/OPTIONS.
Không cần Nginx riêng nếu tunnel đi thẳng MinIO.

Kiểm route (nếu có curl trên VPS):

```bash
curl -fsS https://storage.quanh123.id.vn/minio/health/live
```

Expected HTTP200; test preflight/PUT thật ở bước5 vì health không chứng minh signature/CORS.

**Giới hạn video:** Cloudflare Free/Pro100 MB/request, Business200 MB; BE3.2 cho
MP4 tối đa200 MiB. Test trước file nhỏ, không coi full200 MiB đã pass qua tunnel.
Full video size cần endpoint HTTPS trực tiếp ngoài proxy Cloudflare hoặc phương
án upload khác; multipart/HLS chưa có trong3.2. Không giải quyết bằng đổi uploadUrl
host sau khi ký. [Cloudflare upload limits](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-413/).

## 4. Migrations và bật API/worker

Storage/key/tunnel ready rồi mới sửa `MINIO_ENABLED=true` trong `.env.production`.
Override cấp scratch tmpfs768 MiB ghi được cho non-root API, tách /tmp64 MiB hiện
có. Tmpfs dùng RAM theo dung lượng thực; bảo đảm VPS đủ headroom cho concurrency2,
video bytes và parser/DB. Giảm concurrency nếu cần; không giảm scratch dưới nhu
cầu validation. Kiểm CPU/RAM/disk capacity trước mở upload rộng cho người dùng;
retention/cleanup3.5 vẫn chưa chạy.

Code3.2 đã deploy: kiểm logs migration/deployed schema trước; nếu còn migration
pending, backup DB rồi chạy one-off với **cùng API image tag đang triển khai**:

```bash
dc run --rm migration
dc up -d --no-deps --force-recreate api
dc ps
dc logs --tail 100 api minio
```

Nếu deployment dùng IMAGE_TAG, giữ đúng tag trong `.env.production`/shell; không
rebuild/redeploy một phiên bản khác ngoài ý muốn. Env thay đổi cần recreate,
`docker restart` không load env mới. Migration command chỉ chạy migrations còn
pending; không down/recreate tables. Kiểm health/auth/payment sau API recreate.
**Các lần deploy sau phải tiếp tục dùng cả hai compose files** để giữ scratch
mount/network. Dùng base compose đơn sẽ bỏ override khỏi API được recreate.

## 5. Nghiệm thu API3.2 trên server

Dùng Swagger/Postman với cookie Manager (ADMIN không có quyền Files) và
courseUnitId thật; Mentor cần thêm classId/classUnitId đúng assignment.

1. POST `/api/v1/files/upload-intents` với PDF/PNG nhỏ hợp lệ →201 có fileId,
   HTTPS uploadUrl trên hostname storage, requiredHeaders và deadline.
2. PUT **raw bytes** tới nguyên uploadUrl với requiredHeaders; không cookie API,
   không multipart FormData →200. Browser thật cần CORS preflight pass.
3. POST `/api/v1/files/:fileId/complete` body `{}` →202 PROCESSING.
4. GET `/api/v1/files/:fileId` đến READY/FAILED; valid phải READY có verified
   mimeType/sizeBytes. metadata PENDING là expected, extractor3.5 chưa chạy.
5. File giả/mismatch phải FAILED; Student/Admin/foreign Mentor không được upload/
   status; anonymous MinIO không đọc/list/PUT bucket được. Complete lặp không
   tạo job trùng. MP4 nhỏ hợp lệ cũng phải READY.

Record commit/image/migration/tunnel host, thời điểm, HTTP statuses, browser CORS,
READY/FAILED và errors; không ghi signed URL/cookie/secret vào evidence công khai.
3.2 server acceptance chưa có đủ bằng chứng cho tới khi các bước này pass;
READY không cấp Student access, Material/article/read/play thuộc3.3/3.4.

Troubleshooting: 503 FILE_STORAGE_DISABLED→env chưa loaded; 503 unavailable→
bucket/versioning/private/credentials/network; 502 storage→tunnel/network;
SignatureDoesNotMatch→Host/path/query/content-type changed;
PROCESSING lâu→FILE_JOB_ENABLED, worker/scratch/ffprobe logs; 413→proxy size limit.

Rollback tạm: MINIO_ENABLED=false và recreate API bằng cả compose files; giữ
MinIO volume/database/refs, không down migrations hoặc xóa bucket. Jobs durable
vẫn trong DB và có thể resume sau bật lại; chưa mở lifecycle purge.

## Evidence lượt chuẩn bị local

Chỉ chuẩn bị deployment artifacts và runbook. Lint/shell syntax/Compose model
được kiểm; Docker daemon local hiện không chạy nên chưa build/run provisioning
image, IAM/bucket hoặc validate upload bằng setup production này. Không SSH,
deploy server hoặc coi câu user “code đã trên server” là upload VPS pass.
