# Core flow implementation plan

## Goal

Implement the database-backed main flows in vertical slices:

1. Course and class management.
2. Cart, checkout and order management.
3. Payment confirmation and automatic enrollment.

Board and compiler/judge modules are explicitly excluded. Chat and notifications are also deferred so the team can complete the two critical business journeys first.

## Architecture decisions

- NestJS 11 modular monolith, ESM and TypeScript strict mode.
- TypeORM owns schema migrations. `synchronize` remains disabled everywhere.
- Feature/domain folders own their entities, controllers, DTOs, commands/queries and exceptions.
- Controllers remain thin; workflow logic lives in command handlers or focused application services.
- UUID v4 is the initial project-wide decision because it matches the referenced NestJS rules. A later move to UUID v7 requires one recorded decision applied consistently to generation, validation and tests.
- Cookie authentication uses RS256 access tokens plus rotated refresh tokens. Auth is a prerequisite slice, not part of the course/order domain itself.

## Included tables

### Foundation

- `users`
- `auth_sessions`
- `refresh_tokens`
- `file_objects`
- `file_metadata`

### Course and class management

- `course_categories`
- `courses`
- `course_units`
- `classes`
- `class_units`
- `class_sessions`
- `materials`
- `enrollments`
- `class_unit_progress`
- `attendance_records` after enrollment is stable

### Commerce and payment

- `carts`
- `cart_details`
- `orders`
- `order_details`
- `payment_transactions`
- `payos_payment_details`

## Explicitly excluded tables

- `boards`, `board_snapshots`, `board_assets`, `code_annotations`
- `code_runtimes`, `problems`, `problem_runtimes`, `test_cases`
- `code_workspaces`, `code_runs`, `code_submissions`, `judge_runs`, `test_results`
- `chat_conversations`, `chat_members`, `chat_messages`, `notifications`
- `assignments`, `assignment_submissions`, `submission_files`, `grades` until the class foundation is complete

## Milestone 0 — Project foundation

Status: scaffolded.

Deliverables:

- Pinned Node.js and pnpm versions.
- NestJS ESM application with strict TypeScript.
- Environment validation and TypeORM configuration.
- Helmet, compression, credentialed CORS, cookie parser and global validation.
- Swagger bootstrap with cookie auth documentation.
- Liveness endpoint.
- Biome, Vitest, build/type-check/lint scripts.

Exit criteria:

- `pnpm install` produces a committed lockfile.
- `pnpm check` passes.
- Application starts against an empty PostgreSQL database with valid environment variables.

## Milestone 1 — Identity prerequisite

Modules: `users`, `auth`.

Tasks:

1. Implement user, auth session and refresh token entities.
2. Create the initial migration with enum types and constraints.
3. Implement password hashing and generic login failure responses.
4. Implement RS256 access tokens in `HttpOnly` cookies.
5. Implement refresh-token hashing, rotation, reuse detection and session revocation.
6. Add guards/decorators for role and authenticated user ID.
7. Add rate limiting for auth endpoints using a shared store before horizontal production deployment.

Required tests:

- Successful login and cookie attributes.
- Invalid credentials without account enumeration.
- Refresh rotation and old-token reuse detection.
- Logout one session and logout all sessions.
- Unauthorized and forbidden responses.

## Milestone 2 — Course catalog vertical slice

Module: `catalog`.

Tables: `course_categories`, `courses`, `course_units`.

Commands:

- `CreateCourseCategoryCommand`
- `CreateCourseCommand`
- `UpdateCourseCommand`
- `AddCourseUnitCommand`
- `ReorderCourseUnitsCommand`
- `ActivateCourseCommand`

Queries:

- `ListPublicCoursesQuery`
- `GetPublicCourseQuery`
- `ListAdminCoursesQuery`
- `GetCourseManagementDetailQuery`

Initial endpoints:

```text
GET    /api/v1/courses
GET    /api/v1/courses/:courseId
POST   /api/v1/admin/course-categories
POST   /api/v1/admin/courses
PATCH  /api/v1/admin/courses/:courseId
POST   /api/v1/admin/courses/:courseId/units
PUT    /api/v1/admin/courses/:courseId/units/order
POST   /api/v1/admin/courses/:courseId/activate
```

Important constraints:

- Unique category slug and course code.
- Non-negative price.
- Unique `(course_id, unit_number)`.
- Activation requires at least one unit.
- Public queries return active courses only.

## Milestone 3 — Class management vertical slice

Module: `classes`.

Tables: `classes`, `class_units`, `class_sessions`.

Commands:

- `CreateClassCommand`: creates the class and copies course units in one transaction.
- `UpdateClassCommand`
- `ScheduleClassSessionCommand`
- `RescheduleClassSessionCommand`
- `OpenClassCommand`
- `StartClassCommand`
- `CompleteClassCommand`
- `CancelClassCommand`

Queries:

- `ListOpenClassesQuery`
- `GetClassDetailQuery`
- `ListMentorScheduleQuery`
- `ListAdminClassesQuery`

Important constraints:

- `start_date <= end_date` and `max_students > 0`.
- Mentor must be active and have an allowed role.
- Unique class code.
- Unique class unit position.
- Session start precedes end.
- State changes use explicit commands and reject invalid transitions.

Scheduling conflict detection starts in the application transaction by querying overlapping sessions. Add a PostgreSQL exclusion constraint only after confirming the precise rule for rooms and mentors.

## Milestone 4 — Materials and file references

Modules: `files`, `catalog`.

Tables: `file_objects`, `file_metadata`, `materials`.

Tasks:

1. Implement a presigned-upload lifecycle without storing presigned URLs.
2. Validate file size, extension and MIME signature before marking `READY`.
3. Add async metadata extraction behind `MINIO_ENABLED`.
4. Allow a material to reference only a ready file.
5. Authorize material access through active enrollment or management role.

MinIO network operations must not run inside a PostgreSQL transaction.

## Milestone 5 — Cart and checkout vertical slice

Module: `commerce`.

Tables: `carts`, `cart_details`, `orders`, `order_details`.

Commands:

- `AddClassToCartCommand`
- `RemoveClassFromCartCommand`
- `CheckoutCartCommand`
- `ExpireOrderCommand`

Queries:

- `GetMyCartQuery`
- `ListMyOrdersQuery`
- `GetMyOrderQuery`
- `ListAdminOrdersQuery`

Initial endpoints:

```text
GET    /api/v1/me/cart
POST   /api/v1/me/cart/items
DELETE /api/v1/me/cart/items/:classId
POST   /api/v1/me/cart/checkout
GET    /api/v1/me/orders
GET    /api/v1/me/orders/:orderId
GET    /api/v1/admin/orders
```

Checkout transaction tests must cover price changes, duplicate checkout retry, full classes, existing enrollment and concurrent last-seat purchases.

## Milestone 6 — Payment to enrollment vertical slice

Modules: `payments`, `classes`.

Tables: `payment_transactions`, `payos_payment_details`, `enrollments`, `class_unit_progress`.

Commands:

- `CreatePayOsPaymentCommand`
- `ProcessPayOsCallbackCommand`
- `RecordManualPaymentCommand`
- `ReconcilePaymentCommand`

Initial endpoints:

```text
POST /api/v1/me/orders/:orderId/payments/payos
POST /api/v1/payment-callbacks/payos
POST /api/v1/admin/orders/:orderId/manual-payment
```

The PayOS callback handler must:

- Verify the provider signature before database mutation.
- Lock the order/payment rows.
- Return success when an already-processed callback is replayed.
- Atomically mark payment/order paid and create enrollment/progress rows.
- Never call email or another remote system while holding the transaction.

Required integration tests include duplicate callbacks, mismatched amount, invalid signature, expired order, existing enrollment and a transaction rollback during progress initialization.

## Milestone 7 — Attendance and operational queries

Implement attendance only after enrollment and class sessions are stable.

- Record one attendance row per `(enrollment_id, class_session_id)`.
- Validate that enrollment and session belong to the same class.
- Restrict writes to assigned mentor or management roles.
- Add paginated class roster, schedule and revenue/order operational queries.

## Migration strategy

Prefer several reviewable migrations over one generated migration containing every table:

1. `identity-foundation`
2. `course-catalog`
3. `class-operations`
4. `file-materials`
5. `commerce-orders`
6. `payments-enrollment`
7. `attendance`

Every migration requires a reviewed `up` and `down`, a clean-database CI run and explicit foreign-key delete behavior. Never enable TypeORM `synchronize`.

## Definition of done for each milestone

- Entities and migrations match the approved subset of DBML.
- Input and response DTOs are separate and validated.
- Controller contains no business branching or database access.
- Authorization includes role and resource ownership.
- Unique constraints and indexes protect concurrency invariants.
- Unit tests cover business rules; integration tests cover transactions and constraints.
- Swagger documents success and expected error responses.
- `pnpm lint`, `pnpm type-check`, `pnpm test` and `pnpm build` pass.
- No board or compiler dependency is introduced into a core-flow module.
