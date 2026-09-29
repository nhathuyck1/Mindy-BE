# Core business logic

This document defines the business rules for the first delivery scope: course/class management and the complete order-to-enrollment flow. It intentionally excludes whiteboard, compiler/judge, chat and notification behavior.

## 1. Domain boundaries

### Identity

Owns `users`, `auth_sessions` and `refresh_tokens`. Authentication uses cookie-based JWT access tokens and rotated refresh tokens. Other modules receive a user ID and role; they do not read cookies or JWTs directly.

### Catalog

Owns `course_categories`, `courses`, `course_units` and `materials`. It defines reusable course content and list price. A course is a template; it is not a scheduled class and does not itself grant learning access.

### Class operations

Owns `classes`, `class_units`, `class_sessions`, `enrollments`, `class_unit_progress` and `attendance_records`. A class is a scheduled delivery of one course. Enrollment is the access entitlement for one student in one class.

### Commerce

Owns `carts`, `cart_details`, `orders` and `order_details`. Cart data is mutable. Order details are immutable commercial snapshots created at checkout.

### Payment

Owns `payment_transactions` and `payos_payment_details`. It verifies provider callbacks and is the only domain allowed to move an order from `PENDING` to `PAID`.

### Files

Owns `file_objects` and `file_metadata`. The first course implementation only requires files for materials. Binary content is stored in MinIO; relational tables store identity, lifecycle and extracted metadata.

## 2. Course management flow

### Create a course

1. An admin or manager creates or selects an active category.
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
- The class has not reached capacity, using active enrollment count.
- The student is not already actively enrolled.
- The same class is not already in the cart.
- `cart_details.price_snapshot` is recorded for display only and is not authoritative at checkout.

There is one cart per student. Removing an item deletes only the cart detail and never affects an order.

### Checkout

Checkout is a single database transaction:

1. Lock or otherwise serialize the student's cart and selected class rows.
2. Load the current course/class data and revalidate class status, capacity, existing enrollment and current price.
3. Reject an empty cart or any invalid item; do not create a partial order.
4. Create one `orders` row with status `PENDING` and a unique business `order_code`.
5. Create immutable `order_details` snapshots for every selected class.
6. Set `orders.total_amount` from the sum of detail totals calculated by the server.
7. Remove the checked-out cart details.
8. Commit before calling PayOS.

Creating the remote PayOS payment link happens after the order transaction. If the provider call fails, the order remains `PENDING` and the client may retry idempotently with the same order ID. The retry must not create another order.

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
6. For every order detail, create an `ACTIVE` enrollment if one does not already exist.
7. Initialize `class_unit_progress` for every unit in the purchased class.
8. Commit all database writes together.
9. Publish email/notification work only after commit; use an outbox when that integration is introduced.

The unique `(student_id, class_id)` enrollment constraint is the final defense against duplicate callbacks or concurrent purchases.

### Failed and expired payments

- A failed payment marks only that payment transaction as `FAILED`; another payment attempt may be created while the order remains valid.
- An unpaid order becomes `EXPIRED` after `expires_at`.
- Expiring an order never deletes it or its details.
- A callback received after expiry requires an explicit reconciliation path; it must not silently create access without checking provider settlement.

## 5. Authorization rules

| Action | Allowed actors |
|---|---|
| Read public active courses/open classes | Public |
| Manage categories/courses/units/materials | `ADMIN`, `MANAGER` |
| Create classes and schedules | `ADMIN`, `MANAGER` |
| Read assigned class operations | Assigned `MENTOR`, `ADMIN`, `MANAGER` |
| Manage own cart and checkout | Active `STUDENT` |
| Read own orders/payments | Order owner |
| Process payment callback | Verified provider adapter only |
| Manually confirm cash/bank transfer | Authorized `ADMIN` or `MANAGER`, with audit data |

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
