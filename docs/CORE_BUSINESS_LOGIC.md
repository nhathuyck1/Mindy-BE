# Core business logic

Updated 2026-10-05 against all of `document/Flow.txt`, implemented checkout and
[Phase 2.2](./implement_phase/PHASE_2_2_PAYOS_BE_REAL_PAYMENT.md). VPS probe webhook
confirmation passed; BE payments are implemented and locally tested; VPS release
and real settlement remain pending user execution. Full payment and
online confirmation email are required; pending cash preview and mentor confirmation
remain required in the later cash increment. Pending group chat/DM belongs to chat.

This document defines the business rules for the first delivery scope: course/class management and the complete order-to-enrollment flow. It intentionally excludes whiteboard, compiler/judge, chat and notification behavior.

## 1. Domain boundaries

### Identity

Owns `users`, `user_identities`, `registration_intents`,
`email_verification_tokens`, `auth_sessions` and `refresh_tokens`. Public registration
always creates a `STUDENT` through one of two paths: email/password remains pending
until email verification, while Google OIDC uses a verified email and requires profile
completion after prefill before creating the user. Both paths then use the same
cookie-based JWT access tokens and rotated refresh tokens. Other modules receive a user
ID and role; they do not read cookies, OAuth claims or JWTs directly.

Google `sub` is the durable external identity key. Email is used only to prevent
duplicate internal accounts during first link/registration. Google profile fields are
untrusted suggestions for the registration form: verified email is read-only,
display name may be edited, avatar is only previewed until the file module owns it.
If Google completes an email that has a pending password registration, the unverified
password hash is discarded before activation so an attacker cannot pre-register the
victim's email and retain a password credential.

### Catalog

Owns `course_categories`, `courses` and `course_units`. It defines reusable course
content and list price. A course is a template; it is not a scheduled class and
does not itself grant learning access.

### Materials — Phase 3.1 policy implemented, HTTP/persistence pending

`MaterialsModule` now exports `MaterialPolicyService`; the domain layer implements
access, draft/review/publication transitions, audit event output and the closed MVP
file declaration contract. Catalog and Classes expose entity-free ancestry views;
the facade uses current account roles/assignment and ACTIVE enrollment. There is
no Materials HTTP controller or persistence yet. Transitions must later run under
row locks/expected-revision checks with durable audit in Phase 3.3. Server-owned
file references/snapshots are inputs to policy, never raw client JSON.

Owns planned `materials` and material review/audit. The user approved D1–D6 on
2026-10-09 in [Phase 3.1](./implement_phase/PHASE_3_1_POLICY_CONTRACT.md).
One Course Unit has many Materials; every Material has a required Course Unit
owner and is the main shared document of that unit across classes. Optional
Session association does not change ownership or make that main document private
to a class. Session assignment/Q&A/student code are separate features.

`MANAGER` manages, edits and approves shared material. Assigned mentors may upload
for a Course Unit taught in their class and submit drafts for Manager review;
mentors cannot self-approve/publish or edit approved shared content. File `READY`
only means binary validation passed, not that content was approved. Student reads
require current-revision Manager approval/publication, ACTIVE enrollment, a
non-cancelled class, an OPEN/COMPLETED Class Unit, elapsed unlock/availability times
and a READY file. Editing approved content invalidates approval/publication until
reviewed again. Enrollment COMPLETED is not newly entitled; Class COMPLETED with
ACTIVE enrollment uses the same material gates. No external-link material in MVP.

### Class operations

Owns `classes`, `class_units`, `class_sessions` and planned `attendance_records`.
A class is a scheduled delivery of one course. EnrollmentsModule separately owns
`enrollments` and `class_unit_progress`, including checkout holds and learning access.

### Commerce

Owns `carts`, `cart_details`, `orders` and `order_details`. Cart data is mutable. Order details are immutable commercial snapshots created at checkout.

### Payment

Owns `payment_transactions`, `payos_payment_details`,
`payment_webhook_events` and `payment_confirmation_emails`. It verifies provider
callbacks and coordinates settlement via exported Commerce/Enrollments providers.
Only verified settlement or authorized mentor cash confirmation can make an order PAID.

### Files

Owns `file_objects`, `file_metadata` and `file_processing_jobs`. Phase 3.2 implements
Manager/assigned Mentor uploads scoped to Course Unit, private versioned MinIO,
complete/status and durable bounded validation. Owner/scope/declaration/provenance
are immutable; READY pins verified bytes/version/hash and atomically creates
metadata PENDING + one EXTRACT job. Only VALIDATE runs in 3.2; extraction/cleanup
is 3.5. READY does not imply review/publication or Student access.
Materials uses the Files upload policy facade and transactional
`FilesService.assertReadyReference`; there is no Files → Materials dependency.
See [setup and handoff](./PHASE_3_2_FILES_RUNBOOK.md).

## 2. Course management flow

### Create a course

1. An admin creates or selects an active category.
2. The system validates that course code is unique and price is non-negative.
3. The course is created inactive by default in the application flow, even if the database has a technical default.
4. Units are added with a unique `unit_number` inside the course.
5. Materials may only reference a file whose `file_objects.status` is `READY`.
6. A course can be activated only when it has at least one unit and all required public fields are valid.

Updating the course price affects future checkouts only. Existing carts must revalidate the current price, while existing `order_details.price_snapshot` never changes.

### Create a class from a course

1. An admin selects an active course and a mentor with an active account.
2. Validate `start_date <= end_date`, `max_students > 0` and the mentor role.
3. Create the class in `DRAFT`.
4. Copy every current `course_unit` into `class_units` in one transaction. `class_units` links to the reusable course unit but owns delivery position, unlock time and state.
5. Add scheduled sessions. Every session must satisfy `starts_at < ends_at` and fall within the class period unless an authorized override is explicitly recorded later.
6. Move the class to `OPEN` only when required units and sessions exist.

Changing the course curriculum after a class has started must not silently reorder that class. Explicit synchronization is a separate use case and must show the affected class before applying changes.

### Class lifecycle

```text
DRAFT -> OPEN -> IN_PROGRESS -> COMPLETED
   |       |           |
   +-------+-----------+-> CANCELLED
```

- `DRAFT`: editable and not purchasable.
- `OPEN`: visible and purchasable, subject to capacity and dates.
- `IN_PROGRESS`: no new purchase unless policy explicitly allows late enrollment.
- `COMPLETED`: read-only historical class.
- `CANCELLED`: not purchasable; refund handling is a separate payment use case.

## 3. Cart and checkout flow

### Add a class to cart

The use case validates:

- The actor is an active student.
- The class status is `OPEN`.
- The class has not reached capacity, counting active enrollments and valid pending holds.
- The student has no effective active enrollment or pending hold for the class.
- The same class is not already in the cart.
- `cart_details.price_snapshot` is recorded for display only and is not authoritative at checkout.

There is one cart per student. Removing an item deletes only the cart detail and never affects an order.

### Checkout

Checkout is a single database transaction:

1. Lock or otherwise serialize the student's cart and selected class rows.
2. Load the current course/class data and revalidate class status, capacity, existing enrollment and current price.
3. Reject an empty cart or any invalid item; do not create a partial order.
4. Create one PAYOS order for the cart, or split CASH orders by mentor snapshot;
   each order is PENDING with a unique business order_code and hold deadline.
5. Create immutable `order_details` snapshots for every selected class.
6. Set `orders.total_amount` from the sum of detail totals calculated by the server.
7. Create PENDING_PAYMENT enrollment holds and remove the checked-out cart details.
8. Commit before calling PayOS.

Creating the remote PayOS payment link happens after the order transaction. If the provider call fails, the order remains `PENDING` and the client may retry idempotently with the same order ID. The retry must not create another order.
The link API reserves/reuses an attempt and numeric provider code in a separate
short transaction. Checkout does not create payment_transactions in this increment.

## 4. Payment and enrollment flow

### Create a payment transaction

- Only a `PENDING` order can create an active payment attempt.
- The payment amount must equal `orders.total_amount`.
- Provider identifiers are unique.
- Secrets and signatures are never stored in logs.
- Network calls are outside the database transaction.

### Process a successful PayOS callback

Provider callbacks are untrusted until their signature and amount are verified. Processing must be idempotent and transactional:

1. Verify signature, provider order code, amount and payment state.
2. Lock the matching order and payment transaction.
3. If the order is already `PAID`, return success without duplicating side effects.
4. Mark `payment_transactions.status = SUCCEEDED` and record `paid_at`.
5. Mark `orders.status = PAID` and record `paid_at`.
6. For every order detail, activate its existing PENDING_PAYMENT hold, after checking
   the server deadline and class/order state under the shared lock order.
7. Initialize `class_unit_progress` for every unit in the purchased class.
8. Insert a unique payment confirmation email outbox event and commit all writes together.
9. Send online confirmation email through a retryable worker after commit;
   notifications/chat remain deferred. Email failures do not roll back payment.

The partial unique student/class index for effective enrollments, unique order-detail
mapping, provider reference/event key, enrollment/unit progress and outbox event
constraints defend against duplicate callbacks/concurrent purchases. Expired or
cancelled holds are never silently recreated; late/mismatched payments require review.

### Failed and expired payments

- A confirmed failed payment affects only the attempt; retry policy must ensure the
  old provider link cannot still settle before issuing another attempt. An ambiguous
  timeout must query/reuse the same provider code, not create another active attempt.
- An unpaid order becomes `EXPIRED` after `expires_at`.
- Expiring an order never deletes it or its details.
- A callback received after expiry requires an explicit reconciliation path; it must not silently create access without checking provider settlement.

## 5. Authorization rules

| Action | Allowed actors |
|---|---|
| Read public active courses/open classes | Public |
| Register through email/password or Google | Public; resulting role is always `STUDENT` |
| Manage categories/courses/units | `ADMIN` |
| Create managed accounts, including Manager | `ADMIN`; MANAGER role restored in source/new migration |
| Manage/edit/review/publish Course Unit material | `MANAGER` (approved Phase 3 design, API pending) |
| Upload/submit own material draft | Assigned `MENTOR`, or `MANAGER` for direct upload (Phase 3 API pending) |
| Create classes and schedules | `ADMIN` |
| Read assigned class operations | Assigned `MENTOR`, `ADMIN` |
| Read class roster and payment status | Currently assigned `MENTOR` for that class; roster includes effective enrollments only |
| Manage own cart and checkout | Active `STUDENT` |
| Read own orders/payments | Order owner |
| Process payment callback | Verified provider adapter only |
| Confirm full cash payment | Assigned `MENTOR` from the order snapshot, with audit data |
| Inspect transactions/reconciliation | `ADMIN`; refund/manual bank-transfer scope is separate |

`MANAGER` is a separate role restored by a new migration on 2026-10-09 for
material management. It does not inherit ADMIN, MENTOR or STUDENT permissions.
Public registration still creates STUDENT. Existing category/course/class/user
and reconciliation routes retain their role checks; manager material routes are
to be implemented in Phase 3. Historical removal migration is unchanged.

Flow.txt's manager assignment wording is implemented by the existing Phase 2
decision to activate class enrollment/progress automatically after verified PayOS
settlement. It does not add a manual manager approval step or enroll students into
course templates. For cash, pending students see only class-unit/session titles and
timetable until mentor confirmation; full learning content remains blocked.

Role checks never replace ownership checks. A student must not access another student's cart, order, payment or enrollment by guessing an ID.

## 6. Cross-cutting invariants

- Monetary values use integer VND amounts and must be non-negative.
- Client-supplied totals, prices, role, status and ownership IDs are never trusted.
- All list APIs are paginated with deterministic ordering and capped page size.
- Entity objects are never returned directly; response DTOs explicitly map public fields.
- State transitions are explicit commands, not unrestricted status update endpoints.
- Every multi-write use case uses a transaction.
- Provider callbacks, checkout retries and background jobs are idempotent.
- Database unique constraints remain the final concurrency defense.
- Board and compiler tables are not referenced by the first implementation milestones.
