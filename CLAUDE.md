# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Mindy Center API — a NestJS 11 modular monolith (TypeScript strict, **ESM**, TypeORM + PostgreSQL) covering identity, course catalog, class management, cart/checkout, enrollment and payment (cash + payOS). Node **22.20.0**, pnpm **12.6.0** (pinned; use pnpm only).

## Engineering rules (always apply)

Every implementation — new feature, bug fix, refactor, migration, test — **must** follow the project rules below. They are imported in full so they are always in context:

@docs/NESTJS_PROJECT_RULES.md

How to apply them:

- **BẮT BUỘC** = must; deviate only with a recorded technical decision (note it in the phase plan/progress file). **NÊN** = default; deviating requires stating the reason and trade-off. **CÓ THỂ** = optional.
- Before writing code for a feature, walk through the rules doc's §21 checklist ("Checklist thêm một feature mới"); before calling work done, verify §22 "Definition of Done", including `pnpm check` passing.
- When the rules doc and the running code/tests/compiler/linter config disagree, the code is the source of truth (rules §1). Follow the established repo conventions below rather than "fixing" them toward the boilerplate examples, and flag the doc drift to the user:
  - No CQRS bus: modules use application services (`services/`) consistently; don't introduce `commands/`/`queries/`.
  - Internal imports use the `.js` extension (NodeNext ESM), not `.ts` as the rules doc mentions.
  - Domain exceptions extend `AppHttpException` (not Nest's specific exception subclasses) and live in `<module>/exceptions/<module>.exceptions.ts`.
  - Auth on routes is `@UseGuards(AccessTokenGuard, RolesGuard)` + `@Roles(...)` + `@CurrentUser()`, not the boilerplate's `@Auth()`/`@AuthUser()`.
  - HTTP E2E tests live in `test/http/*.spec.ts`, integration tests in `test/integration/*.spec.ts` (not `.e2e-spec.ts`).
  - UUIDs are v4 (`@PrimaryGeneratedColumn('uuid')` + `ParseUUIDPipe`); don't rely on time-ordered IDs.
- If a rule can't be satisfied within the task (e.g. rate limiting, metrics, i18n not yet built), say so explicitly instead of silently skipping it.

## Before you code: docs are the spec

Work is planned and delivered in phases. Docs are mostly in Vietnamese.

- `docs/NESTJS_PROJECT_RULES.md` — mandatory engineering rules (see above).
- `document/Flow.txt` — business flow source. **Read all of it before changing commerce/payment/access business rules.** Note your interpretation and any deferred requirements.
- `docs/CORE_BUSINESS_LOGIC.md` — domain logic and transaction boundaries.
- `docs/implement_phase/` — one plan per phase (see its `README.md` for order and current status). Each phase must be a vertical slice: migration → service → API → tests.
- `docs/progress/` — one progress file per phase plus `Progress.md`. **After implementing anything, update the relevant progress file**, distinguishing: planned work / local checks / VPS evidence / real (live) payment results. Never mark A1 cases or Phase 0/1 items as passed if they weren't verified. Doc-only changes must not be recorded as "BE tests run".
- `document/mindy_center_full.dbml` is a design reference; migrations are the executable source of truth.

Payment invariants (Phase 2.2, from the rules doc): full payment only; amounts always computed server-side; payOS grants access only after verified atomic settlement (redirect ≠ payment confirmation); settlement activates the **existing** checkout seat holds and creates per-class-unit progress, writing the confirmation email to an outbox in the same commit; cash orders give a pending preview (titles/timetable only) until the assigned mentor confirms; keep idempotency, race-with-expiry handling and reconciliation; never call payOS/SMTP inside a DB transaction; disabling link creation (`PAYOS_CREATE_LINK_ENABLED=false`) must keep callbacks for issued links working. Group chat/DM for pending students is deferred to the chat phase.

## Commands

```bash
docker compose up -d postgres     # local DB on localhost:5433, db/user/pass: mindy_center / mindy / mindy
pnpm migration:run                # ts source migrations (typeorm-ts-node-esm)
pnpm seed:admin                   # or `pnpm seed:data` for full idempotent demo data
pnpm dev                          # nest start --watch; Swagger at /docs when SWAGGER_ENABLED=true

pnpm lint | pnpm lint:fix         # Biome (lint + format + organize imports)
pnpm type-check
pnpm test                         # vitest: src/**/*.spec.ts + test/**/*.spec.ts (excludes test/http)
pnpm test:http                    # builds, then HTTP E2E against the built app (test/http)
pnpm check                        # lint + type-check + test + build — required before finishing a phase

pnpm vitest run src/modules/classes/domain/class-calendar.spec.ts   # single file
pnpm vitest run -t "test name substring"                             # single test

pnpm migration:create src/database/migrations/<name>
pnpm migration:generate src/database/migrations/<name>               # review generated SQL
```

Integration/HTTP tests need `TEST_DATABASE_URL` pointing at a dedicated DB whose name ends in `_test` (e.g. `postgresql://mindy:mindy@127.0.0.1:5433/mindy_center_test`; create it first). Suites wipe its `public` schema and re-run migrations, and payment/HTTP suites create extra `*_payments_test` / `*_http_test` databases (needs CREATE DATABASE). Without the variable, DB suites skip. Never point it at dev/prod data. Tests run with `fileParallelism: false`. HTTP E2E uses a fake payOS provider — no real merchant calls. CI (`.github/workflows/check.yml`) runs lint, type-check, test, build, test:http.

## Architecture

- **Bootstrap**: `src/main.ts` → `configureApp()` in `src/configure-app.ts` (shared with HTTP tests). Global prefix `/api`, URI versioning default `v1` (routes are `/api/v1/...`), global `ValidationPipe` (whitelist + forbidNonWhitelisted + transform, validation errors → **422**), `GlobalExceptionFilter`, helmet, cookie-parser, 64kb JSON limit, CORS allowlist from `CORS_ORIGINS`.
- **Config**: all env vars validated by Joi in `src/config/environment.schema.ts`; read via `ConfigService.getOrThrow`, never `process.env` in business code. Optional integrations (payOS, workers, mail) are feature-flagged. Document new vars in `.env.example`.
- **Modules** (`src/modules/<feature>/`): `auth`, `users`, `catalog`, `classes`, `course-browse`, `commerce` (cart/checkout/orders/expiry), `enrollments`, `payments` (payOS adapter, settlement, cash, reconciliation, email outbox), `health`. Inside a module: `controllers/`, `services/`, `dtos/`, `entities/`, `enums/`, `exceptions/`, `domain/` (pure business functions, unit-tested with `.spec.ts` next to them). Each entity has exactly one owning module; cross-module access goes through **exported services** only (e.g. `ClassesModule` exports `ClassReadService`, `ClassOffersService`). No CQRS bus is used — application services.
- **Transactions**: services inject `DataSource` and use `dataSource.transaction(async (manager) => …)`; collaborating services accept an `EntityManager` parameter to join the caller's transaction. Lock ordering and `SKIP LOCKED` matter (see comments in `checkout.service.ts`, `order-expiry.worker.ts`). Background workers are `OnApplicationBootstrap` interval loops gated by config flags.
- **Auth**: RS256 JWT in `HttpOnly` cookies (access + rotated refresh tokens), Google OIDC with registration intent. Protect controllers with `@UseGuards(AccessTokenGuard, RolesGuard)` + `@Roles(UserRole.X)`, get the user with `@CurrentUser() user: AuthenticatedUser`. Also enforce object-level ownership in services. Roles: ADMIN, MENTOR, STUDENT.
- **Errors**: domain errors are classes in `<module>/exceptions/*.exceptions.ts` extending `AppHttpException(status, 'SCREAMING_CODE', message, details?)`, named `<Entity><Reason>Exception`. Map DB constraint errors (e.g. `isUniqueViolation` in `src/common/database/postgres-error.ts`) to domain exceptions. Document expected errors on controllers with `@ApiErrors(...)`.
- **DTOs**: request DTOs use `readonly` props + class-validator with explicit limits; response DTOs are classes whose constructor maps from an entity or a domain "view" (`new StudentClassDto(view)`) with `@ApiProperty` metadata. Never return entities. Validate path UUIDs with `ParseUUIDPipe`. Paginate growable lists (`common/dtos/page-options.dto.ts`).
- **Database**: `synchronize` is always false. Entities extend `TimestampedEntity`, use explicit snake_case table/column names, explicit types/lengths/nullability, named indexes/unique constraints (`uq_…`, `idx_…`), Postgres enums with `enumName`. Schema changes only via new migrations in `src/database/migrations/` — **never edit a migration that has already run/deployed**, and don't recreate existing tables (e.g. enrollments). Production runs compiled migrations (`migration:run:build`) in a one-off container before the API starts.

## Code conventions

- ESM with NodeNext: internal imports **must** use the `.js` extension (`'./foo.service.js'`).
- `verbatimModuleSyntax`: use `import type` for type-only imports. Exception: classes injected by Nest DI need a runtime import — keep them as value imports with `// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.`
- Biome formatting: 2 spaces, single quotes, semicolons, trailing commas, line width 100, LF line endings.
- Strict TS incl. `noUncheckedIndexedAccess`; no `any`, `as never`, or double casts; `!` only on entity/DTO fields initialized by the framework.
- Explicit return types on public methods; DI fields `private readonly`.
- Files kebab-case with role suffix (`.controller.ts`, `.service.ts`, `.entity.ts`, `.dto.ts`, `.spec.ts`); code identifiers in English.
- Commits follow Conventional Commits (`feat(scope): …`, `fix: …`, `docs: …`).
