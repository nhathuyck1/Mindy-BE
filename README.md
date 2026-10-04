# Mindy Center API

NestJS modular monolith for course operations, class management, enrollment, ordering and payment.

## Technology decisions

- Node.js 22 and pnpm, pinned by the repository.
- NestJS 11 with TypeScript strict mode and ESM.
- TypeORM with PostgreSQL; production never uses `synchronize`.
- Identity uses short-lived RS256 access cookies and rotated refresh tokens. The Phase 1
  plan includes public `STUDENT` registration by verified email/password and Google
  OIDC with mandatory profile completion for new Google users.
- Redis and MinIO are optional infrastructure modules and are not initialized until their feature flags are enabled.
- Board and compiler/judge features are intentionally outside the first implementation plan.

## Local setup

1. Install the pinned Node.js version.
2. Enable Corepack and install the pinned pnpm version.
3. Start the local PostgreSQL service with `docker compose up -d postgres`, or use an existing PostgreSQL instance.
4. Copy `.env.example` to `.env` and configure PostgreSQL.
5. Install dependencies with `pnpm install`.
6. Apply database migrations with `pnpm migration:run`.
7. Run the API with `pnpm dev`.

Use Node.js **22.20.0** (`.nvmrc` / `.node-version`) and pnpm **12.6.0**.
On Windows with nvm-windows, run `nvm install 22.20.0` then `nvm use 22.20.0`.
Check `node --version`, `pnpm --version` and `pnpm exec node --version` in the
terminal used for checks. Git attributes and EditorConfig keep text files at LF;
Biome enforces the same line ending.

The liveness endpoint is `GET /api/v1/health/live`. Swagger is available at `/docs` only when `SWAGGER_ENABLED=true`.

## Quality commands

```text
pnpm lint
pnpm type-check
pnpm test
pnpm build
pnpm check
```

For a full check, provide `TEST_DATABASE_URL` for a dedicated PostgreSQL database
whose name ends with `_test`. The integration suite wipes that database's public
schema and reruns migrations; it skips without this variable. Never point it at
development, staging or production data. In PowerShell, for example:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://mindy:mindy@127.0.0.1:5433/mindy_center_test'
pnpm check
```

Create that test database separately before running the example; the normal local
Compose database is `mindy_center`, not `mindy_center_test`.

## Project documentation

- `docs/NESTJS_PROJECT_RULES.md`: mandatory engineering rules.
- `docs/CORE_BUSINESS_LOGIC.md`: domain logic and transaction boundaries.
- `docs/CORE_FLOW_IMPLEMENTATION_PLAN.md`: implementation order for course and order flows.
- `docs/implement_phase/`: executable Phase 0 and Phase 1 implementation specifications.
- `mindy_center_full.dbml`: database design reference; migrations remain the executable source of truth after implementation begins.

## Identity bootstrap

The current implementation uses a one-off seed for the development admin. Public
registration and Google onboarding are specified in the remaining Phase 1 plan but
must not replace production admin bootstrap:

```text
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=use-a-local-secret
SEED_ADMIN_DISPLAY_NAME=Local Admin
pnpm seed:admin
```

Do not put production credentials in Git or in a normal application image. Production
bootstrap requires `SEED_ADMIN_CONFIRM=YES` explicitly.

## Seed all demo data

After recreating the database, run migrations, then one seed command:

```bash
pnpm migration:run
pnpm seed:data
```

Configure `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_DISPLAY_NAME`
and `SEED_ACCOUNT_PASSWORD` in `.env` first. `seed:data` runs admin → accounts →
course/class → course images, stopping if a step fails. It creates one admin,
two mentors, three students, three categories, six courses with Unsplash images,
27 course units, seven classes and 47 sessions.

Rerunning does not duplicate rows. The existing admin is preserved; demo account
passwords are reset to `SEED_ACCOUNT_PASSWORD` by the account seed. Course/class
data and existing images are preserved; missing demo course images are filled.
Use `pnpm seed:course-images` to fill images only, without seeding accounts/classes.
The image seed stores fixed Unsplash CDN URLs; it does not fetch images at runtime.

For production, the existing seed guards require both `SEED_ADMIN_CONFIRM=YES`
and `SEED_DEMO_CONFIRM=YES` to run the full demo seed.

## Manual API verification

Start PostgreSQL, apply migrations, seed the local admin and run the API:

```text
docker compose up -d postgres
pnpm migration:run
pnpm seed:admin
pnpm dev
```

Open Swagger at `http://localhost:3000/docs`. Run `POST /api/v1/auth/login` with
`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from `.env`, then call
`GET /api/v1/auth/me` or an admin-users endpoint. Authentication uses `HttpOnly`
cookies, so the token is intentionally unavailable to Swagger JavaScript and must not
be copied into an Authorization header. Swagger is configured with credentials and the
browser sends the cookie automatically. For local HTTP testing, `COOKIE_SECURE=false`
is required. Keep the same hostname (`localhost`) for every request.

For Postman, import the collection and environment under [`postman/`](./postman/),
select **Mindy Local**, and fill `admin_password`. Postman uses its cookie jar
automatically; no access-token or refresh-token variable is needed.

## Production container workflow

`compose.production.yaml` runs PostgreSQL on a persistent Docker volume, applies the
compiled TypeORM migrations in a one-off migration container, and starts the API only
after that migration succeeds. PostgreSQL is attached to a private Docker network;
keep the production `DATABASE_URL` secret and do not publish port `5432` publicly.
Start it with an explicit deployment environment file:

```text
cp .env.production.example .env.production
docker compose --env-file .env.production -f compose.production.yaml config --quiet
docker compose --env-file .env.production -f compose.production.yaml up -d --build
```

Set `SWAGGER_ENABLED=true`. Use `API_BIND_ADDRESS=0.0.0.0` for direct access at
`http://VPS_IP:3000/docs`, or `API_BIND_ADDRESS=127.0.0.1` when publishing
`https://api.example.com/docs` through Nginx/Caddy.
