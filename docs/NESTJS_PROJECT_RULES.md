# Bộ quy tắc phát triển dự án NestJS

> Tài liệu này được tổng hợp từ `awesome-nest-boilerplate` v11 tại commit
> [`8f1c0a8`](https://github.com/NarHakobyan/awesome-nest-boilerplate/tree/8f1c0a8cded54a198ddbc23922aa755922d2b155)
> (09/06/2026), sau khi đối chiếu README, tài liệu, mã nguồn và cấu hình thực tế.
> Đây là bộ quy tắc để xây dựng dự án, không phải hướng dẫn sao chép nguyên trạng boilerplate.

## 1. Từ khóa quy ước

- **BẮT BUỘC**: phải tuân thủ; chỉ được ngoại lệ khi có quyết định kỹ thuật được ghi lại.
- **NÊN**: mặc định phải làm; có thể khác nếu nêu rõ lý do và đánh đổi.
- **CÓ THỂ**: tùy nhu cầu của tính năng.
- Khi tài liệu, ví dụ và code mâu thuẫn, **code chạy được + test + cấu hình compiler/linter** là nguồn sự thật. Phải ghi lại và sửa phần tài liệu bị lệch.

## 2. Nguyên tắc nền tảng

1. **BẮT BUỘC** chia hệ thống theo feature/domain, không chia toàn bộ dự án thành các thư mục kỹ thuật khổng lồ như `controllers/`, `services/`, `entities/`.
2. **BẮT BUỘC** giữ controller mỏng, business logic nằm trong service/use case/CQRS handler.
3. **BẮT BUỘC** dùng Dependency Injection của NestJS; không tự khởi tạo service, repository hoặc client bên trong business logic.
4. **BẮT BUỘC** bật TypeScript strict và không dùng `any` để né lỗi kiểu.
5. **BẮT BUỘC** validate mọi dữ liệu đi vào ở biên hệ thống: body, query, path params, headers, file, message và biến môi trường.
6. **BẮT BUỘC** không trả trực tiếp entity database ra API.
7. **BẮT BUỘC** mọi thay đổi schema phải đi qua migration có version.
8. **BẮT BUỘC** bảo vệ endpoint bằng authentication và authorization phù hợp; endpoint public phải được thể hiện rõ ràng.
9. **BẮT BUỘC** có test cho business rule và critical path mới hoặc bị sửa.
10. **BẮT BUỘC** lint, type-check, test và build thành công trước khi merge.
11. **NÊN** ưu tiên KISS, early return, hàm nhỏ, trách nhiệm đơn và lỗi tường minh.
12. **NÊN** tránh code chết, wrapper chỉ chuyển tiếp tham số, abstraction chưa có nhu cầu thật và việc lặp logic.

## 3. Nền tảng và quản lý dependency

- Runtime chính là Node.js. Chỉ hỗ trợ Bun/Deno khi pipeline riêng của chúng được kiểm thử liên tục.
- **BẮT BUỘC** chốt phiên bản Node, pnpm và giữ `pnpm-lock.yaml` trong Git.
- **BẮT BUỘC** dùng một package manager cho toàn dự án; với boilerplate tham chiếu là pnpm.
- **BẮT BUỘC** dùng đúng major version tương thích của NestJS, TypeORM, Swagger và các package Nest liên quan.
- **BẮT BUỘC** review changelog và chạy đầy đủ test khi nâng dependency, đặc biệt với NestJS, TypeORM, class-transformer và class-validator.
- **BẮT BUỘC** không thêm package nếu chức năng đã có thể thực hiện rõ ràng bằng dependency hiện hữu hoặc API chuẩn.
- **NÊN** kiểm tra package thừa, package lỗi thời và lỗ hổng dependency trong CI.
- Dự án tham chiếu dùng ESM (`"type": "module"`) và import nội bộ có đuôi `.ts`. **BẮT BUỘC** thống nhất một chiến lược module; không trộn ESM và CommonJS tùy tiện.

## 4. Cấu trúc thư mục

```text
src/
├── common/                 # Base entity/DTO và tiện ích thật sự dùng chung
├── constants/              # Enum, token và hằng số toàn ứng dụng
├── database/
│   └── migrations/         # Migration TypeORM
├── decorators/             # Decorator dùng chung
├── entity-subscribers/     # TypeORM subscriber
├── exceptions/             # Exception dùng chung
├── filters/                # Global exception filters
├── guards/                 # Authentication/authorization guards
├── i18n/                   # Bản dịch theo locale
├── interceptors/           # Cross-cutting request/response behavior
├── interfaces/             # Interface xuyên module
├── modules/                # Các feature/domain module
├── providers/              # Provider dùng chung đặc biệt
├── shared/                 # Hạ tầng dùng chung có chủ đích
├── validators/             # Custom validators
├── app.module.ts
├── main.ts
└── setup-swagger.ts
```

Mỗi feature **NÊN** có cấu trúc:

```text
modules/<feature>/
├── commands/                       # Các thao tác làm thay đổi trạng thái
│   ├── create-feature.command.ts
│   └── create-feature.handler.ts
├── queries/                        # Các thao tác chỉ đọc
│   ├── get-feature.query.ts
│   └── get-feature.handler.ts
├── dtos/
│   ├── create-feature.dto.ts
│   ├── update-feature.dto.ts
│   ├── feature.dto.ts
│   └── feature-page-options.dto.ts
├── exceptions/
├── feature.controller.ts
├── feature.service.ts
├── feature.module.ts
└── feature.entity.ts
```

Quy tắc biên module:

- **BẮT BUỘC** một entity có đúng một module sở hữu.
- **BẮT BUỘC** chỉ export provider thật sự là public API của module.
- **BẮT BUỘC** không import file private sâu bên trong module khác. Giao tiếp qua provider/token được export.
- **BẮT BUỘC** không tạo vòng phụ thuộc. `forwardRef` chỉ là ngoại lệ có giải thích, không phải giải pháp mặc định.
- `common/` và `shared/` **KHÔNG ĐƯỢC** trở thành nơi chứa mọi thứ. Chỉ đưa code vào đây khi có ít nhất hai consumer độc lập và ý nghĩa thực sự dùng chung.
- **NÊN** đặt exception đặc thù bên trong feature; chỉ exception xuyên domain mới để ở `src/exceptions/`.

## 5. Luồng xử lý chuẩn

```text
Request
  -> middleware/guard
  -> controller
  -> command/query bus hoặc application service
  -> handler/domain service
  -> repository/external adapter
  -> database/external system
  -> response DTO
```

- Controller chịu trách nhiệm HTTP: đọc input đã validate, xác định user/role, gọi application layer, trả đúng status/DTO.
- Application layer điều phối use case và transaction.
- Domain/business layer chứa rule nghiệp vụ, không phụ thuộc HTTP.
- Persistence layer chịu trách nhiệm truy vấn và lưu trữ, không quyết định policy HTTP.
- **BẮT BUỘC** không truyền `Request`/`Response` của Express xuống service hoặc repository, trừ adapter tích hợp đặc biệt được cô lập.

## 6. Controller và thiết kế API

- Tên route dùng danh từ số nhiều, chữ thường, kebab-case khi có nhiều từ: `/users`, `/user-settings`.
- **BẮT BUỘC** dùng đúng HTTP verb và status code:
  - `POST` tạo mới: `201 Created`.
  - `GET` thành công: `200 OK`.
  - `PUT/PATCH` cập nhật: `200 OK`, `202 Accepted` chỉ khi xử lý bất đồng bộ, hoặc `204 No Content` nếu không có body.
  - `DELETE`: `204 No Content` nếu hoàn tất ngay; `202 Accepted` nếu chỉ tiếp nhận tác vụ.
- **BẮT BUỘC** không dùng `200`/`202` tùy tiện chỉ vì boilerplate có ví dụ như vậy.
- **BẮT BUỘC** khai báo kiểu trả về tường minh cho public method.
- **BẮT BUỘC** dùng DTO riêng cho request và response.
- **BẮT BUỘC** validate UUID/path param bằng pipe/decorator; không chuyển chuỗi chưa kiểm tra xuống service.
- **BẮT BUỘC** phân trang mọi endpoint danh sách có khả năng tăng trưởng.
- **BẮT BUỘC** giới hạn `take/pageSize`, có giá trị mặc định và thứ tự sắp xếp ổn định.
- **NÊN** version API từ đầu nếu API có consumer bên ngoài.
- **NÊN** giữ response shape nhất quán cho item, page metadata và error.
- **NÊN** làm thao tác tạo mới idempotent khi client có thể retry; dùng idempotency key hoặc unique business key phù hợp.
- **KHÔNG ĐƯỢC** chứa query database, mapping phức tạp hoặc business branch trong controller.

Ví dụ tối thiểu:

```ts
@Controller('posts')
@ApiTags('posts')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Post()
  @Auth([RoleType.USER])
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: PostDto })
  create(
    @AuthUser() user: UserEntity,
    @Body() dto: CreatePostDto,
  ): Promise<PostDto> {
    return this.postService.create(user.id, dto);
  }
}
```

## 7. DTO, validation và serialization

- Input DTO **BẮT BUỘC** chỉ chứa dữ liệu client được phép gửi.
- Input DTO **BẮT BUỘC** dùng `readonly` cho property.
- Response DTO **BẮT BUỘC** chỉ chứa dữ liệu được phép công khai; password hash, secret, token nội bộ và cờ nhạy cảm không được xuất hiện.
- **BẮT BUỘC** phân biệt rõ `undefined` (không gửi), `null` (cố ý rỗng) và giá trị hợp lệ.
- **BẮT BUỘC** dùng validator phù hợp cho email, enum, số, boolean, UUID, URL, date, nested object và array.
- **BẮT BUỘC** đặt giới hạn độ dài/kích thước/range; không chỉ kiểm tra kiểu.
- **BẮT BUỘC** bật global `ValidationPipe` với tối thiểu:

```ts
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
});
```

- Custom field decorator **NÊN** kết hợp validation, transform và Swagger metadata để giảm drift.
- Mapping entity -> DTO **BẮT BUỘC** tường minh và có test khi chứa logic điều kiện.
- **KHÔNG ĐƯỢC** dùng `Partial<Entity>` làm input DTO.
- **KHÔNG ĐƯỢC** tin vào type TypeScript ở runtime; type không thay thế validation.
- File upload **BẮT BUỘC** kiểm tra MIME thực, extension, kích thước và nội dung/signature khi rủi ro yêu cầu; không tin tên file từ client.

## 8. Service, CQRS và transaction

- Service/handler **BẮT BUỘC** có một trách nhiệm rõ ràng và được inject qua constructor.
- Dependency inject **NÊN** khai báo `private readonly` nếu không bị gán lại.
- **BẮT BUỘC** tách read và write khi dùng CQRS:
  - Command làm thay đổi trạng thái.
  - Query chỉ đọc và không gây side effect.
- Tên command/query phải diễn tả use case: `CreatePostCommand`, `GetPostQuery`.
- Command/query constructor phải chứa toàn bộ dữ liệu cần cho use case, không đọc ngầm từ HTTP context nếu không có chủ đích.
- Handler **BẮT BUỘC** khai báo kiểu input/output và xử lý lỗi domain bằng custom exception.
- **BẮT BUỘC** chọn một quy ước nhất quán: repository nằm trong handler khi CQRS là application layer; service không được vừa truy cập repository vừa chuyển tiếp ngẫu nhiên sang bus cho cùng loại use case.
- **NÊN** dùng CQRS cho workflow có nghiệp vụ, side effect hoặc cần scale read/write khác nhau; CRUD quá đơn giản có thể dùng application service nhưng phải nhất quán trong module.
- **BẮT BUỘC** dùng transaction khi một use case có nhiều thao tác ghi phải thành công/thất bại cùng nhau.
- **BẮT BUỘC** giữ transaction ngắn; không gọi API mạng chậm khi đang giữ transaction database.
- Side effect sau commit (email, queue, webhook) **NÊN** dùng outbox/event để tránh trạng thái nửa vời.
- **BẮT BUỘC** thiết kế retry/idempotency cho job, event consumer và webhook.

## 9. Entity và database

- Entity **NÊN** kế thừa base entity thống nhất cho `id`, `createdAt`, `updatedAt`.
- **BẮT BUỘC** đặt tên table tường minh và dùng naming strategy thống nhất; code camelCase, database snake_case.
- **BẮT BUỘC** khai báo type, nullable, default và độ dài cột tường minh.
- **BẮT BUỘC** tạo unique constraint/index cho invariant dữ liệu, không chỉ kiểm tra ở application layer.
- **BẮT BUỘC** tạo index dựa trên query thực tế; review index cho foreign key, filter, sort và unique lookup.
- Relation **BẮT BUỘC** dùng `Relation<T>` theo quy ước TypeORM của boilerplate.
- **BẮT BUỘC** khai báo foreign key field khi application cần truy cập ID mà không load relation.
- `CASCADE`, `onDelete` và `onUpdate` **BẮT BUỘC** được chọn có chủ đích và có test; không bật cascade rộng theo thói quen.
- **BẮT BUỘC** tránh N+1; dùng join/select hoặc batch load khi cần.
- **NÊN** dùng query builder cho truy vấn phức tạp và luôn bind parameter, không nối chuỗi SQL từ input.
- **BẮT BUỘC** không bật `synchronize` ở production.
- **BẮT BUỘC** review migration được generate trước khi chạy.
- Migration **BẮT BUỘC** có `up` và `down` hợp lý, hoặc ghi rõ vì sao không thể rollback.
- Migration có backfill/lock lớn **BẮT BUỘC** có kế hoạch rollout và rollback riêng.
- Production nhiều replica **NÊN** chạy migration bằng một job/pipeline duy nhất trước rollout; không để mọi instance đồng thời tự chạy migration.
- Test tích hợp **BẮT BUỘC** dùng database riêng và không bao giờ trỏ tới database development/production.

### Quyết định UUID

- **BẮT BUỘC** chọn một phiên bản UUID và áp dụng đồng bộ ở generator, database, validator, pipe, Swagger, test và tài liệu.
- Không dựa vào tính sắp xếp theo thời gian của ID nếu hệ thống chưa thật sự sinh UUID v7.
- Snapshot tham chiếu hiện tại có drift: README/docs nói UUID v7, nhưng `AbstractEntity` dùng `@PrimaryGeneratedColumn('uuid')`, còn `@UUIDField()` và `@UUIDParam()` kiểm tra UUID v4. Vì vậy mặc định an toàn của snapshot này là **UUID v4**, không phải v7.

## 10. Authentication và authorization

- **BẮT BUỘC** dùng JWT RS256 với private key để ký và public key để xác minh.
- **BẮT BUỘC** chỉ cho phép thuật toán dự kiến khi verify; không nhận thuật toán từ token.
- **BẮT BUỘC** tự sinh key riêng cho từng môi trường. Không dùng key mẫu của repository.
- Private key **BẮT BUỘC** nằm trong secret manager/biến môi trường bảo mật, không commit vào Git, log, image hoặc tài liệu nội bộ không được kiểm soát.
- **BẮT BUỘC** đặt và kiểm tra `exp`; access token phải có thời gian sống ngắn phù hợp.
- Nếu có refresh token, **BẮT BUỘC** hỗ trợ rotation, revoke và phát hiện reuse theo mô hình rủi ro.
- **BẮT BUỘC** hash password bằng thuật toán thích hợp như bcrypt/Argon2 với cost được benchmark; không mã hóa hoặc lưu plaintext.
- Login thất bại **BẮT BUỘC** trả lỗi chung, không tiết lộ email/user tồn tại hay không.
- **BẮT BUỘC** áp dụng rate limit mạnh hơn cho login, register, reset password và OTP.
- Public registration **BẮT BUỘC** gán role cố định phía server; không nhận role/status
  từ client. Account email/password chỉ được active sau khi verify email bằng token
  ngẫu nhiên, hash-at-rest, có TTL và dùng một lần.
- Với OIDC/OAuth login, **BẮT BUỘC** dùng Authorization Code flow, kiểm tra state,
  nonce, issuer, audience, expiry và chữ ký; dùng PKCE khi provider hỗ trợ. Không tin
  profile/ID token do frontend tự gửi và không dùng email thay cho provider subject.
- OAuth callback **KHÔNG ĐƯỢC** tự tạo account hoàn chỉnh nếu sản phẩm yêu cầu thêm hồ
  sơ. Phải dùng registration intent ngắn hạn, one-time; chỉ cấp auth session sau khi
  user submit và server validate form hoàn thiện đăng ký.
- Khi prefill từ provider, verified email có thể read-only; các field như name/avatar
  chỉ là gợi ý và không được tự overwrite dữ liệu nội bộ hiện hữu.
- Nếu verified provider email claim một registration email/password chưa verify,
  **BẮT BUỘC** loại bỏ credential chưa được chứng minh hoặc yêu cầu proof riêng; không
  giữ password pending vì có thể dẫn đến pre-registration account takeover.
- **BẮT BUỘC** kiểm tra quyền sở hữu resource bên cạnh role; RBAC không thay thế object-level authorization.
- **BẮT BUỘC** endpoint ghi dữ liệu khai báo rõ role/quyền. Endpoint public phải được đánh dấu rõ và được review.
- Với cookie auth, **BẮT BUỘC** cấu hình `HttpOnly`, `Secure`, `SameSite` và CSRF protection phù hợp.
- **NÊN** có audit log cho đăng nhập, thay đổi quyền, thay đổi dữ liệu nhạy cảm và thao tác quản trị.

## 11. Bảo mật ứng dụng

- **BẮT BUỘC** bật Helmet và compression phù hợp.
- CORS **BẮT BUỘC** dùng allowlist theo môi trường. Khi `credentials: true`, không dùng origin `*`.
- **BẮT BUỘC** chỉ bật `trust proxy` với số hop/proxy tin cậy đúng hạ tầng; không tin mọi proxy ngoài ý muốn.
- **BẮT BUỘC** giới hạn body, query, file, thời gian request và concurrency phù hợp.
- **BẮT BUỘC** dùng parameterized query/TypeORM API để chống SQL injection.
- **BẮT BUỘC** chống SSRF cho URL do người dùng cung cấp: allowlist protocol/host/IP và chặn mạng nội bộ khi cần.
- **BẮT BUỘC** không log token, password, cookie, authorization header, private key, secret hoặc PII không cần thiết.
- **BẮT BUỘC** quét secret và dependency vulnerability trong CI.
- Rate limiter dùng memory chỉ phù hợp local hoặc một instance. Production nhiều instance **BẮT BUỘC** dùng shared store (ví dụ Redis) nếu cần giới hạn toàn cụm.
- Swagger/documentation **NÊN** tắt hoặc bảo vệ ở production.
- **BẮT BUỘC** không trả stack trace và chi tiết database cho client production.

## 12. Cấu hình và biến môi trường

- **BẮT BUỘC** có `.env.example` chỉ chứa tên biến và giá trị mẫu không nhạy cảm.
- `.env` thật **BẮT BUỘC** nằm trong `.gitignore`.
- **BẮT BUỘC** parse và validate toàn bộ cấu hình cần thiết khi ứng dụng khởi động; fail fast nếu thiếu/sai type.
- **BẮT BUỘC** không đọc `process.env` rải rác trong business code; truy cập qua config service typed.
- Boolean, number và duration **BẮT BUỘC** được parse tường minh; không dùng truthy/falsy của chuỗi.
- **BẮT BUỘC** tách cấu hình development, test, staging và production.
- Default chỉ được dùng cho giá trị an toàn. Secret, database production và CORS production không có default ngầm.
- **BẮT BUỘC** document mọi biến trong `.env.example`: mục đích, bắt buộc/tùy chọn, format và default.
- Optional integration như NATS, S3, email, Redis, AI provider **BẮT BUỘC** có feature flag hoặc chỉ khởi tạo khi được cấu hình.

## 13. Error handling, logging và i18n

- **BẮT BUỘC** dùng custom exception kế thừa đúng NestJS exception (`NotFoundException`, `ConflictException`, `BadRequestException`, ...).
- Tên exception **NÊN** theo dạng `<Entity><Action/Reason>Exception`, ví dụ `PostNotFoundException`.
- Error message công khai phải tổng quát và không rò rỉ cấu trúc nội bộ.
- **BẮT BUỘC** có global exception filter để chuẩn hóa error response.
- Database constraint **BẮT BUỘC** được map sang lỗi domain/HTTP ổn định, không trả nguyên lỗi driver.
- **BẮT BUỘC** log theo cấu trúc và có request/correlation ID xuyên request, queue và event.
- **BẮT BUỘC** dùng level hợp lý; production không bật ORM query log mặc định.
- **NÊN** dùng i18n key trong exception thay vì hard-code câu hiển thị nếu sản phẩm đa ngôn ngữ.
- Mọi locale **BẮT BUỘC** có fallback và cùng bộ key; CI **NÊN** kiểm tra key thiếu/thừa.
- Không dùng exception cho control flow thông thường trong domain.

## 14. Swagger/OpenAPI

- **BẮT BUỘC** mọi endpoint công khai có tag, summary, request schema, response schema và status code đúng.
- **BẮT BUỘC** document auth requirement, path/query params, pagination, upload và các lỗi dự kiến.
- **BẮT BUỘC** Swagger schema khớp DTO runtime; tránh decorator và validator mô tả hai kiểu khác nhau.
- **BẮT BUỘC** không dùng entity làm Swagger response model.
- **NÊN** kiểm tra/generate OpenAPI trong CI để phát hiện breaking change.
- Breaking API change **BẮT BUỘC** đi qua versioning hoặc kế hoạch migration cho consumer.

## 15. Quy tắc TypeScript và code style

- Bật tối thiểu: `strict`, `strictNullChecks`, `noImplicitAny`, `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`.
- **BẮT BUỘC** khai báo type cho tham số và return value tại public boundary.
- **BẮT BUỘC** dùng `import type` khi chỉ import type, phù hợp `verbatimModuleSyntax`.
- **BẮT BUỘC** không dùng non-null assertion `!` ngoài trường hợp framework/decorator đảm bảo khởi tạo; nếu dùng phải có invariant rõ.
- **BẮT BUỘC** không dùng `as never`, `as any` hoặc double cast để che lỗi thiết kế kiểu.
- **NÊN** dùng union/type/interface có ý nghĩa thay cho object vô danh lặp lại.
- **NÊN** dùng enum khi tập giá trị có ý nghĩa domain và cần dùng runtime; dùng union literal khi chỉ cần type.
- Format chuẩn của boilerplate:
  - 2 spaces.
  - Single quotes.
  - Semicolon.
  - Trailing comma.
  - UTF-8, newline cuối file, xóa trailing whitespace.
- Import theo nhóm: Node built-in -> package bên ngoài -> nội bộ; mỗi nhóm cách nhau một dòng và được sort tự động.
- **BẮT BUỘC** mọi lệnh tắt lint có comment giải thích và phạm vi nhỏ nhất có thể.
- **BẮT BUỘC** ưu tiên early return để giảm nesting và cognitive complexity.
- **BẮT BUỘC** xóa import, biến, hàm và file không dùng.

## 16. Quy tắc đặt tên

- Tên trong code dùng tiếng Anh.
- File và thư mục: `kebab-case`.
- Class, enum, decorator: `PascalCase`.
- Biến, hàm, method, property: `camelCase`.
- Constant và enum member: `SCREAMING_SNAKE_CASE` khi phù hợp quy ước dự án.
- File phải thể hiện vai trò: `.controller.ts`, `.service.ts`, `.module.ts`, `.entity.ts`, `.dto.ts`, `.command.ts`, `.handler.ts`, `.query.ts`, `.exception.ts`, `.spec.ts`.
- Entity/file entity dùng số ít: `user.entity.ts`, không phải `users.entity.ts`.
- Tên phải ngắn, trực quan và mô tả; không viết tắt khó hiểu như `usr`, `cfg`, `mgr` nếu không phải thuật ngữ phổ biến.
- Không lặp context: trong `UserService`, ưu tiên `getSettings()` thay vì `getUserSettings()` nếu không gây mơ hồ.
- Boolean dùng tiền tố mang nghĩa: `is`, `has`, `can`, `should`.
- Collection dùng số nhiều, một phần tử dùng số ít.
- Hàm bắt đầu bằng động từ thể hiện đúng hành vi:
  - `get`: lấy dữ liệu đã có/ngay lập tức.
  - `find`: tìm và có thể không có kết quả.
  - `fetch`: lấy dữ liệu qua I/O/remote khi muốn nhấn mạnh thao tác bất đồng bộ.
  - `create`: tạo mới.
  - `update`: thay đổi resource tồn tại.
  - `remove`: bỏ một phần tử khỏi collection/association.
  - `delete`: xóa resource khỏi persistence.
  - `set`: gán giá trị.
  - `reset`: trả về trạng thái ban đầu.
- Không đặt tên phủ định kép như `isNotDisabled`; chọn tên để điều kiện đọc tự nhiên.

## 17. Testing

Ba lớp test:

1. **Unit test**: service, domain rule, guard, validator, mapper và CQRS handler; mock dependency ngoài đơn vị.
2. **Integration test**: module, repository, migration và database thật dành riêng cho test.
3. **E2E test**: luồng HTTP hoàn chỉnh, auth, validation, authorization và critical user journey.

Quy tắc:

- File unit test đặt cạnh source với hậu tố `.spec.ts`; E2E đặt trong `test/` với hậu tố `.e2e-spec.ts`.
- Tên test phải diễn tả hành vi và kết quả, không lặp tên method một cách vô nghĩa.
- **BẮT BUỘC** theo Arrange -> Act -> Assert và mỗi test tập trung vào một hành vi.
- **BẮT BUỘC** test happy path, validation failure, not found, unauthorized/forbidden, conflict và lỗi dependency quan trọng.
- **BẮT BUỘC** dùng `async/await`, không bỏ quên Promise.
- **BẮT BUỘC** reset/clear mock giữa các test và kiểm tra argument quan trọng của mock call.
- **NÊN** dùng factory/builder cho test data; dữ liệu tối thiểu nhưng sát tình huống thật.
- **BẮT BUỘC** test không phụ thuộc thứ tự và không chia sẻ state thay đổi được.
- **BẮT BUỘC** tránh gọi dịch vụ thật trong unit/E2E CI; dùng fake/test double hoặc sandbox được kiểm soát.
- Coverage mục tiêu tham khảo là trên 80%, nhưng critical business rule phải được cover theo rủi ro, không chạy theo phần trăm.
- Bug fix **BẮT BUỘC** có regression test trước hoặc cùng lúc với fix.
- Migration **BẮT BUỘC** được chạy trên database sạch trong CI.

## 18. Chất lượng code và Git workflow

- Biome là công cụ lint/format nhanh; ESLint bổ sung rule TypeScript/Nest/security. **BẮT BUỘC** tránh hai công cụ áp rule format mâu thuẫn.
- **BẮT BUỘC** chạy lint-staged ở pre-commit và chạy lại lint/type-check/test/build trong CI; Git hook không thay thế CI.
- Commit theo Conventional Commits. Các type được boilerplate chấp nhận: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`, `sample`.
- Mỗi commit **NÊN** nhỏ, build được và có một mục đích.
- **BẮT BUỘC** phát triển qua branch/PR và review các thay đổi ảnh hưởng API, auth, migration, transaction hoặc secret.
- PR **BẮT BUỘC** mô tả: vấn đề, giải pháp, cách test, thay đổi API/schema/config, rủi ro và rollback.
- **BẮT BUỘC** không merge khi CI đỏ hoặc có unresolved review comment nghiêm trọng.
- **NÊN** dùng CODEOWNERS cho auth/security/database/platform.

Pipeline tối thiểu:

```text
install --frozen-lockfile
  -> lint
  -> type-check
  -> unit tests + coverage
  -> integration/e2e tests
  -> migration check
  -> build production
  -> dependency/secret scan
```

## 19. Hiệu năng và khả năng vận hành

- **BẮT BUỘC** phân trang và giới hạn kích thước response.
- **BẮT BUỘC** đo query chậm, N+1, connection pool và tỷ lệ lỗi trước khi tối ưu.
- **NÊN** cache dữ liệu đọc nhiều/đổi ít, nhưng phải định nghĩa TTL và invalidation.
- **BẮT BUỘC** đặt timeout và retry có backoff/jitter cho outbound call; chỉ retry lỗi tạm thời và thao tác idempotent.
- **BẮT BUỘC** giới hạn queue concurrency và có dead-letter/retry policy.
- **BẮT BUỘC** có health endpoint tách readiness và liveness khi chạy orchestration.
- Readiness phải phản ánh dependency bắt buộc; liveness không nên chết chỉ vì dependency tạm thời lỗi.
- **BẮT BUỘC** graceful shutdown: ngừng nhận request, hoàn tất tác vụ đang chạy trong giới hạn, đóng DB/queue/client.
- **BẮT BUỘC** có metrics tối thiểu: request count, latency, error rate, DB pool, queue depth và process resource.
- **NÊN** có tracing/correlation ID cho luồng qua nhiều service.
- **BẮT BUỘC** alert dựa trên symptom/SLO, không chỉ CPU.

## 20. Build và deployment

- **BẮT BUỘC** build artifact/image một lần và promote cùng artifact qua các môi trường.
- Docker image production **NÊN** dùng multi-stage build, chỉ chứa production dependency và chạy bằng non-root user.
- **BẮT BUỘC** không bake `.env`, private key hoặc credential vào image.
- **BẮT BUỘC** pin base image/digest theo policy, scan image và cập nhật định kỳ.
- **BẮT BUỘC** chạy migration trước khi traffic đi vào phiên bản mới.
- Schema change **NÊN** tương thích ngược theo expand -> migrate/backfill -> contract để hỗ trợ rolling deployment.
- **BẮT BUỘC** có readiness probe, resource request/limit và graceful termination.
- **BẮT BUỘC** cấu hình production an toàn: ORM logs off, docs off/protected, CORS cụ thể, key riêng, rate limit dùng shared store khi scale ngang.
- **BẮT BUỘC** có rollback plan cho code và kế hoạch xử lý dữ liệu cho migration không thể đảo ngược.
- **NÊN** triển khai canary/blue-green cho thay đổi rủi ro cao.

## 21. Checklist thêm một feature mới

- [ ] Xác định use case, actor, quyền và invariant.
- [ ] Tạo module theo feature và xác định module sở hữu entity.
- [ ] Tạo input DTO/response DTO; không dùng entity làm contract.
- [ ] Thêm validation và giới hạn dữ liệu.
- [ ] Tạo command/query hoặc application service nhất quán với module.
- [ ] Đặt transaction boundary đúng chỗ.
- [ ] Tạo entity/relation/index/constraint cần thiết.
- [ ] Tạo và review migration; kiểm thử up/down hoặc kế hoạch rollback.
- [ ] Tạo custom exception và mapping lỗi.
- [ ] Thêm auth, role và ownership check.
- [ ] Thêm Swagger/OpenAPI metadata.
- [ ] Thêm pagination/sort/filter có giới hạn nếu là list.
- [ ] Thêm unit, integration và E2E test theo mức rủi ro.
- [ ] Cập nhật i18n, `.env.example` và tài liệu nếu cần.
- [ ] Chạy lint, type-check, test, migration check và build.

## 22. Definition of Done

Một thay đổi chỉ hoàn tất khi:

- [ ] Đáp ứng acceptance criteria và không phá contract ngoài dự kiến.
- [ ] Code đúng biên module, controller mỏng, không rò rỉ entity.
- [ ] Input được validate; auth/authz và security được review.
- [ ] Migration/index/transaction được review nếu có thay đổi dữ liệu.
- [ ] Test mới đủ cho happy path, failure path và regression.
- [ ] Swagger, i18n, config và tài liệu đồng bộ với code.
- [ ] Không có secret, PII hoặc log nhạy cảm.
- [ ] Lint, type-check, test và production build đều pass.
- [ ] PR mô tả rủi ro, monitoring và rollback khi cần.

## 23. Những điểm không nên sao chép mù quáng từ boilerplate

1. **UUID:** tài liệu nói v7 nhưng code tại snapshot sinh/validate v4. Phải ra quyết định rõ trước khi phát triển.
2. **HTTP status:** một số endpoint mẫu dùng `200` cho register và `202` cho update/delete đồng bộ. Hãy dùng semantics HTTP đúng với hành vi thực tế.
3. **Migration lúc startup:** cấu hình mẫu bật `migrationsRun: true`; cách này có thể race khi production chạy nhiều replica.
4. **ORM log:** `.env.example` bật log để phát triển; production phải tắt.
5. **JWT key mẫu:** chỉ để local/demo; tuyệt đối không tái sử dụng.
6. **CQRS chưa đồng nhất:** module mẫu có chỗ dùng bus, có chỗ truy cập repository trực tiếp. Mỗi module phải chọn boundary nhất quán.
7. **Type cast né lỗi:** một số ví dụ có `as never`/non-null assertion. Không coi đó là pattern chuẩn.
8. **Tài liệu có thể đi trước code:** luôn đối chiếu source, test và config tại commit đang dùng.

## 24. Nguồn tham khảo

- [Repository chính](https://github.com/NarHakobyan/awesome-nest-boilerplate)
- [README v11](https://github.com/NarHakobyan/awesome-nest-boilerplate/blob/main/README.md)
- [Architecture](https://github.com/NarHakobyan/awesome-nest-boilerplate/blob/main/docs/architecture.md)
- [Code style and patterns](https://github.com/NarHakobyan/awesome-nest-boilerplate/blob/main/docs/code-style-and-patterns.md)
- [NestJS code style guide](https://github.com/NarHakobyan/awesome-nest-boilerplate/blob/main/docs/nestjs-code-style-guide.md)
- [Naming cheatsheet](https://github.com/NarHakobyan/awesome-nest-boilerplate/blob/main/docs/naming-cheatsheet.md)
- [Testing guide](https://github.com/NarHakobyan/awesome-nest-boilerplate/blob/main/docs/testing.md)
- [Linting and code quality](https://github.com/NarHakobyan/awesome-nest-boilerplate/blob/main/docs/linting.md)
- [Development guide](https://github.com/NarHakobyan/awesome-nest-boilerplate/blob/main/docs/development.md)
- [Deployment guide](https://github.com/NarHakobyan/awesome-nest-boilerplate/blob/main/docs/deployment.md)

