THIS IS THE PROGRESS THAT U WILL BE UPDATED THROUGHOUT THE PROJECT
Phase 0: Hạ tầng và quy ước chung
↓
Phase 1: Registration + User + Authentication
↓
Phase 2: Course Catalog + Class Registration + Cart + Full Payment + Enrollment
↓
Phase 3: File + Materials
↓
Phase 4: Attendance + Operational Queries
↓
Phase 5: Production Hardening + Deploy
↓
Phase 6: Chat / Notification
Whiteboard
Assignment
Compiler / Judge

## Documentation updates

- 2026-10-04: Reviewed Phase 2 code at `577af2f` on `Feat/Webhooktest` against
  project rules and added `docs/implement_phase/PHASE_2_WEBHOOK_VPS_PAYOS_PLAN.md`.
  The plan gates standalone VPS webhook/PayOS confirmation before BE payment
  integration, then fake/DB/HTTP tests and a VPS payment release with a small real
  PayOS smoke test. No VPS access, webhook test, payment implementation or deployment
  has been performed. PayOS has no separate sandbox per its current official docs.
  Local recheck: type-check/build passed; 29 tests passed and 35 PostgreSQL tests
  skipped without TEST_DATABASE_URL. Full check failed on CRLF formatter diagnostics;
  lint/assist passed with formatter disabled for diagnosis only. Local Node 20.20.0
  differs from the pinned Node 22.20.0 baseline; both issues remain release prerequisites.
  User confirmed Git pull + Docker Compose on the VPS and no PayOS channel yet.
  The plan preserves that deployment workflow, selects HTTPS/reverse proxy with
  separate staging data, and leaves real PayOS confirmation pending channel setup.
- 2026-10-02: Added a detailed Phase 2 plan under `docs/implement_phase/` for
  course/class browsing, cart, checkout, full cash/PayOS payment and enrollment.
  It separates planning, migrations and implementation, and leaves live PayOS
  merchant configuration to a later step. This is planned scope, not an
  implementation-complete claim.
- 2026-09-29: Added detailed implementation specifications for Phase 0 (foundation,
  database and deployment baseline) and Phase 1 (users, authentication and
  authorization) under `docs/implement_phase/`.
- 2026-09-30: Expanded the remaining Phase 1 plan with two public `STUDENT`
  registration paths: email/password plus one-time email verification, and Google OIDC
  plus a mandatory profile-completion page prefilled from verified Google claims.
  Added registration intents, identity linking, migrations, security rules and tests;
  this entry is planned scope, not an implementation-complete claim.

## Implementation status

- 2026-10-04 — Fixed the Windows checkout quality gate: added `.gitattributes`
  (`text=auto eol=lf`), explicitly set Biome LF, normalized tracked text files locally
  and formatted `register.dto.ts` (quotes/import layout only). Existing Node version
  files already pinned 22.20.0. Installed/selected Node 22.20.0 with nvm-windows and
  pnpm 12.6.0; confirmed the Node version used through pnpm. Frozen-lockfile install
  succeeded without dependency/lockfile changes. Full `pnpm check` passed: lint,
  type-check, all 64 tests (29 unit + 35 PostgreSQL integration, none skipped) and build.
  Integration tests used a new, disposable PostgreSQL 17 container on a dynamic
  loopback port with its own `mindy_center_test` database, not an existing project DB.
  Migration up/down/up, checkout concurrency/rollback and expiry tests passed.
  README now explains runtime selection, LF and the full-test database requirement.
  These are local results; no merge, push or VPS deployment was performed.
- 2026-09-30 — Phase 0 implementation and local runtime smoke checks pass: source and
  production migration commands, PostgreSQL readiness, non-root Docker image startup,
  persistent local volume and `pnpm check` were verified. Phase 0 is not formally
  closed until clean-database migration is enforced in CI, test-database isolation is
  guarded, and backup/restore is exercised.
- 2026-09-30 — Phase 1 functional smoke checks pass against PostgreSQL: login, `/me`,
  refresh rotation, admin user listing and logout work through `HttpOnly` cookies.
  Swagger cookie schemes and a Postman cookie-jar collection are available. Phase 1 is
  not formally closed until public registration, email verification, Google onboarding,
  the planned integration/E2E/concurrency suite, rate-limit/CSRF baseline and staging
  smoke test are complete.
- Quality gate: `pnpm check` passes (lint, type-check, 8 unit tests and build); Docker
  image `mindy-be:phase01-check` builds and its liveness/readiness checks pass as user
  `node`.
- 2026-09-30 — Hardened the VPS container baseline: cached multi-stage production build,
  production-only dependencies, non-root runtime with an init process, readiness
  healthcheck, one-off migration gate, loopback-only API publishing, read-only API
  filesystem and a VPS deployment guide with production environment requirements.
- 2026-10-02 — Rechecked the VPS deployment path: production Swagger is controlled by
  `.env.production`, API publishing supports either a public or loopback bind address,
  the production environment template is tracked by Git, and deployment documentation
  covers Compose validation, direct Swagger smoke testing, HTTPS proxying and secret
  rotation.
- Phase 2 detail (structure, flows, APIs, tests, remaining work): PHASE_2_PROGRESS.md in this folder.
- 2026-10-02 — Phase 2 implemented up to checkout only (catalog, class management, cart,
  checkout, seat hold/expiry). Payment is intentionally not started: no `PaymentsModule`,
  no payment tables, no PayOS/cash confirmation, no preview endpoint, no confirmation email.
  - Modules: `catalog`, `classes` (class/unit/session aggregate; services split into
    command, schedule, read and offers), `enrollments` (seat holds), `course-browse` (public
    browse) and `commerce` (cart, checkout, orders, expiry job). Each module keeps
    `controllers/ services/ entities/ enums/ dtos/ exceptions/ domain/`.
  - Migrations: `course-catalog`, `class-operations`, `commerce-orders` and
    `enrollment-seat-holds`. Deviation from the plan: `enrollments` is created now (with
    `order_detail_id` and the partial unique index) because checkout holds seats through
    PENDING_PAYMENT enrollments. The later `payments-enrollment` migration only needs the
    payment tables and `class_unit_progress`.
  - Checkout creates PENDING orders and seat holds but no `payment_transactions` row; the
    payment step must create it when it is implemented.
  - Verified: migrations up/down/up on a dedicated test database; 29 unit tests and 35
    PostgreSQL integration tests (rollback, price revalidation, cash split per mentor,
    last-seat concurrency, deadlock-free lock order, expiry and re-checkout, constraints);
    two HTTP smoke runs (42 and 81 checks, including the expiry job running in the app and
    the Swagger document) against the built app (roles, 401/403/404/409/422, public DTOs
    without meeting URLs). Integration tests need `TEST_DATABASE_URL` pointing at a database
    whose name ends with `_test`; they are skipped without it and CI now provides one.
  - Demo data in src/database/seed: pnpm seed:account (two mentors, three students)
    then pnpm seed:course-class (programming categories, courses and classes with timetables
    taught by those mentors). Both are idempotent.
  - Role cleanup: the `MANAGER` role was removed (enum, guards, docs and migration
    `remove-manager-role`); `ADMIN` holds every management permission. The migration refuses
    to run while a user still has the role.
  - Not done: automated HTTP E2E tests (Vitest/esbuild does not emit decorator metadata, so
    booting Nest in tests needs an SWC plugin decision), Postman collection update, staging
    smoke. Phase 1 exit criteria are still open as noted above.
