# Phase 0 — Foundation, database và deployment baseline

## 1. Mục tiêu

Tạo nền móng để hai thành viên có thể phát triển trên nhiều thiết bị nhưng vẫn dùng
cùng một quy trình schema, test và deploy. Kết thúc phase này, ứng dụng phải khởi
động được trên máy mới, kết nối được PostgreSQL, chạy migration từ database rỗng,
được đóng gói thành Docker image và có health check đủ cho deployment.

Phase 0 không tạo bảng nghiệp vụ. Migration đầu tiên thuộc Phase 1.

## 2. Trạng thái hiện tại

Đã có:

- NestJS 11, ESM và TypeScript strict.
- `ConfigModule` cùng Joi validation cho biến môi trường.
- TypeORM kết nối PostgreSQL qua `DATABASE_URL`.
- `synchronize: false` và `migrationsRun: false`.
- Helmet, compression, cookie parser, CORS và global `ValidationPipe`.
- API prefix `/api`, URI version mặc định `v1`.
- Swagger có thể bật bằng `SWAGGER_ENABLED`.
- Liveness endpoint `GET /api/v1/health/live`.
- PostgreSQL local trong `compose.yaml`, dùng volume `postgres-data`.
- Biome, Vitest, type-check, build và lệnh tổng hợp `pnpm check`.

Còn thiếu:

- Dockerfile production cho backend.
- Readiness endpoint có kiểm tra dependency bắt buộc.
- Error response và exception filter thống nhất.
- Request/correlation ID và structured logging.
- Test database riêng cùng helper reset schema.
- Seed development có kiểm soát.
- CI pipeline và migration check trên database rỗng.
- Quy trình deploy migration một lần trước khi bật phiên bản backend mới.
- Backup/restore baseline cho PostgreSQL được deploy.

## 3. Quyết định kiến trúc phải giữ

### 3.1 Database và ORM

- PostgreSQL 17 là database runtime hiện tại.
- TypeORM là ORM của dự án. Không thêm Prisma song song.
- DBML là tài liệu thiết kế; migration TypeORM được review mới là schema thực thi.
- `synchronize` không được bật ở development, staging hoặc production.
- Ứng dụng không tự chạy migration khi mỗi replica khởi động.
- Production/staging chạy migration bằng một job hoặc một lệnh deploy duy nhất.

### 3.2 Đồng bộ giữa hai người và nhiều thiết bị

Phân biệt hai loại đồng bộ:

- Schema được đồng bộ bằng migration trong Git.
- Dữ liệu dùng chung được đồng bộ bằng cách kết nối cùng một PostgreSQL server,
  không copy Docker volume giữa các máy.

Môi trường tối thiểu:

```text
local hoặc dev cá nhân  -> dữ liệu phá được, dùng khi phát triển
shared staging          -> integration/smoke test của cả nhóm
production              -> dữ liệu thật, cấm dùng để phát triển
```

Hai thiết bị của cùng một người có thể dùng chung một dev database. Hai thành viên
nên dùng database/branch riêng nếu thường xuyên chạy migration đang phát triển.

### 3.3 Deployment PostgreSQL

Với MVP có thể chạy PostgreSQL container trên cùng VPS, nhưng:

- PostgreSQL chỉ nằm trong private Docker network.
- Không publish cổng `5432` ra Internet ở production.
- Backend dùng hostname service, ví dụ `postgres:5432`, không dùng `localhost`.
- Data nằm trên persistent volume của VPS.
- Backup phải được chuyển ra nơi khác VPS.

Khi yêu cầu availability/backup cao hơn, có thể thay PostgreSQL container bằng
managed PostgreSQL mà không đổi application layer.

## 4. Luồng runtime mục tiêu

```text
Client
  -> Cloudflare / reverse proxy
  -> NestJS container
  -> Config validation
  -> TypeORM connection pool
  -> PostgreSQL private endpoint
```

Chỉ reverse proxy nhận traffic Internet. PostgreSQL, Redis và MinIO không phải public
API.

## 5. Cấu trúc code cần hoàn thiện

```text
src/
├── common/
│   ├── database/
│   │   └── base.entity.ts
│   ├── dtos/
│   │   ├── page-options.dto.ts
│   │   └── page.dto.ts
│   └── types/
├── database/
│   ├── migrations/
│   ├── data-source.ts
│   └── typeorm-options.ts
├── exceptions/
│   └── application.exception.ts
├── filters/
│   └── global-exception.filter.ts
├── interceptors/
│   └── request-context.interceptor.ts
├── modules/
│   └── health/
├── app.module.ts
└── main.ts
```

Không tạo thư mục dùng chung nếu chưa có consumer thật. Cấu trúc trên là target;
chỉ tạo file khi task tương ứng được triển khai.

## 6. Workstream A — Environment và configuration

### P0-A01 — Chuẩn hóa biến môi trường

Kiểm tra và document tối thiểu:

- `NODE_ENV`, `PORT`, `CORS_ORIGINS`, `SWAGGER_ENABLED`.
- `DATABASE_URL`, `DATABASE_LOGGING`.
- `COOKIE_SECURE`, access/refresh TTL.
- JWT public/private key dạng base64.
- Feature flag Redis/MinIO.

Acceptance criteria:

- `.env.example` không chứa secret thật.
- Thiếu biến bắt buộc làm application fail fast với lỗi rõ ràng.
- Production không có default ngầm cho database, CORS hoặc JWT key.
- Boolean/number được Joi parse và validate, không dùng truthy/falsy của chuỗi.

### P0-A02 — Tách cấu hình theo môi trường

- Development có thể bật Swagger và query logging có chủ đích.
- Test dùng database riêng và JWT key test.
- Staging gần production nhưng dùng dữ liệu không nhạy cảm.
- Production mặc định tắt Swagger/query logging và bắt buộc HTTPS cookie.

Không commit `.env.development`, `.env.staging` hoặc `.env.production` có secret.

## 7. Workstream B — Database và migration workflow

### P0-B01 — Xác nhận DataSource duy nhất

- Runtime NestJS dùng `createTypeOrmOptions`.
- TypeORM CLI dùng `src/database/data-source.ts`.
- Cả hai cùng dùng naming, entities và migration path tương thích.
- Source chạy `.ts`; production build chạy migration `.js` từ `dist` hoặc dùng một
  migration runner được xác định rõ. Không để glob chỉ hoạt động ở một môi trường.

### P0-B02 — Quy ước migration

Tên migration diễn tả scope, ví dụ:

```text
<timestamp>-identity-foundation.ts
<timestamp>-course-catalog.ts
```

Mỗi migration phải:

- Có `up` và `down` hợp lý.
- Khai báo foreign-key delete behavior tường minh.
- Tạo index/unique/check constraint cùng bảng liên quan.
- Không dựa vào `synchronize`.
- Được review SQL trước khi merge.
- Chạy thành công trên database hoàn toàn rỗng.
- Revert được trong integration test, trừ trường hợp có quyết định ghi rõ.

### P0-B03 — Database scripts

Giữ các lệnh hiện có và bổ sung khi cần:

```text
pnpm migration:generate
pnpm migration:run
pnpm migration:revert
```

Cần document cú pháp đầy đủ để hai người tạo migration cùng một cách. Không chạy
generate trực tiếp trên shared staging hoặc production.

### P0-B04 — Seed development

Seed chỉ tạo dữ liệu phát triển tối thiểu và phải idempotent:

- Không chứa credential production.
- Không chạy tự động trong production.
- Phase 1 sẽ bổ sung initial admin cho development/test.
- Có thể chạy lại mà không nhân đôi dữ liệu.

## 8. Workstream C — HTTP và error contract

### P0-C01 — Error response chuẩn

Định nghĩa một response shape ổn định, ví dụ:

```json
{
  "statusCode": 422,
  "code": "VALIDATION_FAILED",
  "message": "Request data is invalid",
  "requestId": "uuid",
  "details": []
}
```

Yêu cầu:

- Không trả stack trace hoặc raw PostgreSQL error cho client.
- Map unique/FK/check violation thành exception ổn định khi use case cần.
- Validation error giữ đủ thông tin field nhưng không phản chiếu secret.
- `requestId` xuất hiện cả response và log.

### P0-C02 — Request context và logging

- Nhận `x-request-id` hợp lệ hoặc tự tạo UUID.
- Log method, route, status, duration và request ID.
- Không log cookie, authorization header, password, token hoặc raw payment payload.
- Production log dạng structured JSON hoặc format máy đọc được.

### P0-C03 — Pagination contract

Định nghĩa sớm:

- Page/pageSize mặc định.
- Page size tối đa.
- Stable sort bắt buộc.
- Response item và metadata.

Phase 0 chỉ tạo primitive khi Phase 1 có endpoint list thật sử dụng, tránh abstraction
không có consumer.

## 9. Workstream D — Health và lifecycle

### P0-D01 — Liveness

`GET /api/v1/health/live` chỉ chứng minh process còn sống. Endpoint không fail chỉ vì
PostgreSQL tạm thời mất kết nối.

### P0-D02 — Readiness

`GET /api/v1/health/ready` kiểm tra dependency bắt buộc:

- Application bootstrap hoàn tất.
- Có thể thực hiện truy vấn PostgreSQL nhẹ với timeout.

Redis/MinIO chỉ tham gia readiness khi feature flag bật và chúng là dependency bắt
buộc của phiên bản đang deploy.

### P0-D03 — Graceful shutdown

- Ngừng nhận request mới.
- Cho request đang chạy hoàn tất trong giới hạn.
- Đóng TypeORM pool và các client khác.
- Container nhận được termination signal đúng cách.

## 10. Workstream E — Test infrastructure

### P0-E01 — Phân tầng test

- Unit test: class/function thuần, không cần PostgreSQL.
- Integration test: repository, constraint, transaction với PostgreSQL test.
- E2E test: request qua Nest application thật.

### P0-E02 — Isolation

- Test không bao giờ dùng development/staging/production database URL.
- Mỗi test suite hoặc worker có database/schema cô lập.
- Migration được apply trước integration/E2E test.
- Cleanup không xóa database ngoài target test đã xác nhận.

### P0-E03 — Clean database check

CI phải chứng minh:

```text
create empty test database
  -> run all migrations
  -> run integration/E2E tests
  -> optionally revert/re-run migration
```

## 11. Workstream F — Container và CI/CD

### P0-F01 — Backend Dockerfile

Yêu cầu:

- Multi-stage build.
- Pin Node major tương thích repository.
- Cài dependency từ lockfile.
- Production image không chứa dev dependency không cần thiết.
- Chạy bằng non-root user.
- Không copy `.env`, JWT key hoặc credential vào image.
- Cùng một image được promote qua staging và production.

### P0-F02 — Compose local

- PostgreSQL giữ named volume.
- Local có thể publish `5432` cho tool/dev host.
- Health check PostgreSQL phải pass trước khi app được coi là ready.
- Không dùng local compose như bằng chứng production đã an toàn.

### P0-F03 — Production deployment order

```text
1. Build và scan backend image
2. Backup/check PostgreSQL
3. Start one-off migration job
4. Migration thành công
5. Deploy backend image
6. Readiness pass
7. Reverse proxy đưa traffic vào
```

Migration thất bại thì không deploy backend mới.

### P0-F04 — CI quality gate

Mỗi pull request chạy:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm type-check
pnpm test
pnpm build
migration clean-database check
```

## 12. Backup và recovery baseline

Nếu PostgreSQL chạy trên VPS:

- Chạy `pg_dump` theo lịch tối thiểu hằng ngày cho MVP.
- Mã hóa backup khi lưu/chuyển.
- Đẩy backup sang storage ngoài VPS.
- Có retention policy.
- Ghi lại lệnh restore và test restore định kỳ.
- Theo dõi dung lượng volume; full disk phải có cảnh báo.

Backup chưa được test restore không được xem là backup đáng tin cậy.

## 13. Thứ tự triển khai đề xuất

1. P0-A01, P0-A02 — config contract.
2. P0-B01, P0-B02, P0-B03 — migration workflow.
3. P0-E01, P0-E02, P0-E03 — test DB và clean migration check.
4. P0-C01, P0-C02 — error/log/request ID.
5. P0-D01, P0-D02, P0-D03 — health/lifecycle.
6. P0-F01, P0-F02 — Docker runtime.
7. P0-F03, P0-F04 — deploy pipeline/CI.
8. Backup và restore rehearsal.

## 14. Phân công hai người

### Người A — Database và deployment

- DataSource/migration workflow.
- Test PostgreSQL isolation.
- Dockerfile và Compose deployment.
- Migration job, backup và restore procedure.

### Người B — Application foundation

- Error contract và global exception filter.
- Request ID/structured logging.
- Health readiness/liveness.
- Test helpers, Swagger/config review.

Điểm đồng bộ bắt buộc:

- Cùng review `.env.example`, Docker network và migration command.
- Người không tạo migration phải review SQL/glob/path chạy production.
- Cả hai chạy onboarding từ một checkout mới trước khi đóng phase.

## 15. Acceptance tests

### Máy phát triển mới

```text
clone repository
copy .env.example -> .env
docker compose up -d postgres
pnpm install
pnpm migration:run
pnpm dev
```

Kỳ vọng:

- Config sai làm app fail fast.
- Config đúng làm app start.
- Liveness trả `200` kể cả khi readiness tạm fail vì DB.
- Readiness trả `200` khi DB sẵn sàng và non-2xx khi DB bắt buộc unavailable.

### Docker image

- Image build được từ clean checkout.
- Container không chạy bằng root.
- Image không chứa `.env` hoặc key.
- Container kết nối PostgreSQL qua Docker service hostname.
- Shutdown không tạo unhandled rejection.

### Migration

- Database rỗng chạy hết migration thành công.
- Chạy lại `migration:run` không lặp schema.
- Migration history được TypeORM ghi nhận.
- Test database được chứng minh tách khỏi các môi trường khác.

## 16. Exit criteria

- [ ] `pnpm check` pass trên cả hai môi trường phát triển.
- [ ] Backend image build và chạy được.
- [ ] PostgreSQL data tồn tại sau khi recreate container nhưng giữ volume.
- [ ] Migration runner chạy được trên source và production artifact theo quy ước.
- [ ] Clean-database migration check có trong CI hoặc script tái lập được.
- [ ] Error response, request ID và log contract đã ổn định.
- [ ] Liveness/readiness có test.
- [ ] Test DB không thể trỏ nhầm development/production.
- [ ] Production deployment order được document.
- [ ] Backup và restore procedure được chạy thử ít nhất một lần trước go-live.
- [ ] `docs/Progress.md` được cập nhật.

## 17. Ngoài scope

- Users/auth tables và API: Phase 1.
- Redis/MinIO runtime khi feature chưa bật.
- Catalog, class, commerce và payment.
- Kubernetes, autoscaling hoặc microservices.
- Monitoring stack hoàn chỉnh; Phase 0 chỉ cần log/health baseline.

