# Core flow implementation plan

2026-10-16 implementation:4.4c now has shared set-based credit projection,
effective-mentor/own-attendance/guest timetable, own history/summary and Staff
summary/incomplete backlog.20 focused PG/3 built HTTP4.4c/13 timetable regression
cases pass; final full gates at [Progress4.4](../progress/phase%204/PHASE_4_4_PROGRESS.md).
Swagger/Postman and [implemented contract](../api_flow/PHASE_4_4_flow-api-breakdown.md#13-44c--quy-ước-và-contract-chung)
are synchronized. No new migration/config/dependency/FE/deployment; leave/approved
intervals and release4.5 remain separate. Planning logs below are historical.

2026-10-16: user confirms4.4b complete. Detailed4.4c planning now lives in
[Phase4.4 §4](../implement_phase/phase%204/PHASE_4_4_LEAVE_MAKEUP_STUDENT_OPERATIONS.md#4-44c--lịch-student-tổng-hợp-và-hàng-chờ-vận-hành):
22 acceptance criteria,20 scenarios,C1–C5 for shared credit, additive timetable,
own history/summary and management summary/incomplete backlog. All4.4c extensions
and new routes remain PLANNED; leave/approved intervals are a separate source
gap. Docs/source review only; historical local gates436/45 were recorded15/10,
no new runtime/migration/FE/deployment evidence. Server/Postman4.3 completion
was user-confirmed15/10; older deployment-pending entries are historical.

Current Phase 2 continuation (2026-10-05): standalone VPS webhook verification and
payOS sample confirmation passed; BE payment is implemented/tested locally, while
VPS release and real settlement remain pending user execution.
Follow [Phase 2.2](./implement_phase/PHASE_2_2_PAYOS_BE_REAL_PAYMENT.md) for the
current execution order/contracts. It carries forward Flow.txt full payment,
online confirmation email, pending cash preview and assigned-mentor cash confirmation.
PayOS integration comes before the remaining cash increment; chat/DM is deferred.

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
- Cookie authentication uses RS256 access tokens plus rotated refresh tokens. Phase 1
  supports public `STUDENT` registration through verified email/password or Google
  OIDC; both paths converge on the same internal user/session contract.

## Included tables

### Foundation

- `users`
- `user_identities`
- `registration_intents`
- `email_verification_tokens`
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
3. Implement public email/password registration as `STUDENT`, verification-token
   hashing, generic register/resend responses and email verification before activation.
4. Implement password hashing and generic login failure responses.
5. Implement Google OIDC Authorization Code + PKCE with state/nonce validation.
6. For a new Google user, create a short-lived registration intent, prefill verified
   email/name/avatar hints and require the shared profile form before account creation.
7. Link an existing account by verified email without duplicating the user; identify
   later Google logins by provider `sub`, never mutable email.
8. Implement RS256 access tokens in `HttpOnly` cookies.
9. Implement refresh-token hashing, rotation, reuse detection and session revocation.
10. Add guards/decorators for role and authenticated user ID.
11. Add rate limiting for registration/auth endpoints using a shared store before
    horizontal production deployment.

Required tests:

- Successful login and cookie attributes.
- Email registration remains pending until one-time email verification succeeds.
- Register/resend responses do not allow account enumeration.
- New Google user is not authenticated until profile completion; verified Google
  fields prefill the shared registration form.
- Existing/pending accounts merge safely by verified email without duplicate users.
- Google claiming a pending email registration clears its unverified password hash,
  preventing pre-registration account takeover.
- Invalid/replayed OAuth state, nonce, code and onboarding intents are rejected.
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
5. Authorize material access through active enrollment or the admin role.

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

Modules: `payments`, `commerce`, `enrollments`, `classes`.

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
POST /api/v1/mentor/orders/:orderId/confirm-cash-payment
```

The PayOS callback handler must:

- Verify the provider signature before database mutation.
- Lock the order/payment rows.
- Return success when an already-processed callback is replayed.
- Atomically mark payment/order paid, activate the existing checkout holds and
  initialize progress/email outbox rows; EnrollmentsModule owns enrollment/progress.
- Never call email or another remote system while holding the transaction.

Required integration tests include duplicate callbacks, mismatched amount, invalid signature, expired order, existing enrollment and a transaction rollback during progress initialization.

## Milestone 7 — Attendance and operational queries

Current plan **2026-10-13**: [Phase 4](../implement_phase/phase%204/PHASE_4_ATTENDANCE_OPERATIONS.md),
[flow](../api_flow/PHASE_4_FLOW.md), [planned APIs](../api_flow/PHASE_4_flow-api-breakdown.md).
User approved mentor start/manual attendance/finalization and MANAGER corrections
without a time limit. Updated2026-10-13: no overnight sessions; Mentor edits run
until the end of the day following the scheduled teaching day, exclusive midnight
on teaching day+2 in APP_TIME_ZONE (Tuesday→Thursday00:00), independent of opening time.
Normal start remains on the scheduled teaching day; legacy recovery requires evidence.
Manager can find available mentors and replace a session's teaching mentor,
including during an active session; a class mentor change is a separate command.
Phase 4 runs alongside Phase 3 using the existing enrollment/schedule baseline.
Slices4.1–4.2 are implemented and locally verified (check359/359, HTTP33/33);
deployment remains pending. Attendance correction/legacy recovery4.3 and
leave/makeup/student projections4.4 remain planned. Actual API contract: §14–15
of the Phase4 breakdown. Class completion now rejects unfinished sessions.

Detailed plans and code/progress reconciliation (2026-10-13):
[4.1 plan](../implement_phase/phase%204/PHASE_4_1_MENTOR_SUBSTITUTION.md) /
[4.1 progress](../progress/phase%204/PHASE_4_1_PROGRESS.md),
[4.2 plan](../implement_phase/phase%204/PHASE_4_2_SESSION_ATTENDANCE.md) /
[4.2 progress](../progress/phase%204/PHASE_4_2_PROGRESS.md).
The continuation has a dedicated [4.3 plan](../implement_phase/phase%204/PHASE_4_3_ATTENDANCE_CORRECTIONS_HISTORY.md),
[progress](../progress/phase%204/PHASE_4_3_PROGRESS.md),
[flow](../api_flow/PHASE_4_3_FLOW.md) and
[implemented API contract](../api_flow/PHASE_4_3_flow-api-breakdown.md):22 AC,
16 verification scenarios, correction/audit/evidence recovery with calendar
deadline and terminal history preservation. Implemented with focused PostgreSQL/built-app HTTP evidence;full gates in Progress4.3,no deployment evidence. Student/guest/cancel/leave remain later slices.
Core source exists; historical local totals do not close the full acceptance matrix.
The subsequent repair added mixed-writer races, edge/Staff HTTP journeys, context
actor checks, a post-lock clock recheck and additive calendar deadline migration.
pnpm check now passes359/359 tests/36 suites. Current evidence is in separate
progress files; Student effective mentor projection, material context, approved
leave/cancel and deployment remain open dependencies;correction/evidence recovery/audit4.3 are implemented.

The reviewed scope also includes mentor leave ranges/periods submitted at least
two calendar days ahead, with MANAGER/ADMIN approval before any timetable change.
Partial-day makeup supports suggested/manual slots free of student conflicts;
full-day changes preserve clock times and record student conflicts for management.
Approval cancels original sessions, creates linked replacements and extends the
class end date atomically when needed. Approved leave blocks new assignments.
Management may place an ACTIVE student into one equivalent session of another
class referencing the same Course Unit, with separate guest attendance and one
credit toward the original obligation. Notifications/email automation remain deferred.

Implement attendance only after enrollment and class sessions are stable.

- Record one attendance row per `(enrollment_id, class_session_id)`.
- Validate that enrollment and session belong to the same class.
- Restrict writes to the effective session mentor within the edit window, or
  MANAGER/ADMIN with reason and audit. Session overrides do not grant payment
  confirmation or shared material management permissions.
- Add paginated class roster, schedule, leave/conflict queues and own attendance
  history/summary. Incomplete queues default to all backlog; revenue/order reports
  are outside Phase4. Class completion rejects unfinished sessions/placements.
- Keep ordinary attendance same-class using composite FKs; cross-class makeup
  uses placements/guest records, not a foreign-class enrollment in ordinary rows.

## Migration strategy

Prefer several reviewable migrations over one generated migration containing every table:

1. `identity-foundation`
2. `registration-and-google-identity`
3. `course-catalog`
4. `class-operations`
5. `file-materials`
6. `commerce-orders`
7. `payments-enrollment`
8. `attendance`

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

2026-10-13:Phase4.3 implemented correction,Staff audit history,evidence recovery
with additive migration1791849600003 and route-specific256KiB parser. Full gates
and rollout are recorded in [Progress4.3](../progress/phase%204/PHASE_4_3_PROGRESS.md).
No new FE/deployment/live-payment evidence;Phase4.4/4.5 remain pending.
