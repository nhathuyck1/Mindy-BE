THIS IS THE PROGRESS THAT U WILL BE UPDATED THROUGHOUT THE PROJECT
Phase 0: Hạ tầng và quy ước chung
    ↓
Phase 1: Registration + User + Authentication
    ↓
Phase 2: Course Catalog
    ↓
Phase 3: Class Management
    ↓
Phase 4: File + Materials
    ↓
Phase 5: Cart + Checkout + Order
    ↓
Phase 6: Payment + Enrollment
    ↓
Phase 7: Attendance + Operational Queries
    ↓
Phase 8: Production Hardening + Deploy

Phase 9: Chat / Notification
Whiteboard
Assignment
Compiler / Judge

## Documentation updates

- 2026-09-29: Added detailed implementation specifications for Phase 0 (foundation,
  database and deployment baseline) and Phase 1 (users, authentication and
  authorization) under `docs/implement_phase/`.
- 2026-09-30: Expanded the remaining Phase 1 plan with two public `STUDENT`
  registration paths: email/password plus one-time email verification, and Google OIDC
  plus a mandatory profile-completion page prefilled from verified Google claims.
  Added registration intents, identity linking, migrations, security rules and tests;
  this entry is planned scope, not an implementation-complete claim.

## Implementation status

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
