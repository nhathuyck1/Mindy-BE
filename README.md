# EdTech Center API

NestJS modular monolith for course operations, class management, enrollment, ordering and payment.

## Technology decisions

- Node.js 22 and pnpm, pinned by the repository.
- NestJS 11 with TypeScript strict mode and ESM.
- TypeORM with PostgreSQL; production never uses `synchronize`.
- Cookie-based authentication will use short-lived JWT access tokens and rotated refresh tokens.
- Redis and MinIO are optional infrastructure modules and are not initialized until their feature flags are enabled.
- Board and compiler/judge features are intentionally outside the first implementation plan.

## Local setup

1. Install the pinned Node.js version.
2. Enable Corepack and install the pinned pnpm version.
3. Start the local PostgreSQL service with `docker compose up -d postgres`, or use an existing PostgreSQL instance.
4. Copy `.env.example` to `.env` and configure PostgreSQL.
5. Install dependencies with `pnpm install`.
6. Run the API with `pnpm dev`.

The liveness endpoint is `GET /api/v1/health/live`. Swagger is available at `/docs` only when `SWAGGER_ENABLED=true`.

## Quality commands

```text
pnpm lint
pnpm type-check
pnpm test
pnpm build
pnpm check
```

## Project documentation

- `docs/NESTJS_PROJECT_RULES.md`: mandatory engineering rules.
- `docs/CORE_BUSINESS_LOGIC.md`: domain logic and transaction boundaries.
- `docs/CORE_FLOW_IMPLEMENTATION_PLAN.md`: implementation order for course and order flows.
- `edtech_center_full.dbml`: database design reference; migrations remain the executable source of truth after implementation begins.
