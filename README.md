# Mindy Center API

NestJS modular monolith for course operations, class management, enrollment, ordering and payment.

Phase 2.2 implements payOS links, verified atomic payment/enrollment settlement,
progress, private class access, confirmation email outbox and ADMIN reconciliation.
`PAYOS_ENABLED=false` by default. Configure provider credentials/URLs only on the
server; `PAYOS_CREATE_LINK_ENABLED=false` pauses new links while keeping callbacks
enabled. Deploy and live-payment evidence remain separate from local tests:
[payOS deployment runbook](docs/PAYOS_PHASE_2_2_DEPLOYMENT.md),
[Phase 2.2 progress](docs/progress/PHASE_2_2_PROGRESS.md).

Run `pnpm check` and `pnpm test:http` with a dedicated `TEST_DATABASE_URL` ending in
`_test`; payment/HTTP suites create additional `*_payments_test`/`*_http_test`
databases using the same test PostgreSQL server (CREATE DATABASE permission needed).
HTTP E2E uses the built Nest application, real guards and SDK verifier with a test-only
fake provider; it does not call real payOS or require merchant credentials.

## Technology decisions

- Node.js 22 and pnpm, pinned by the repository.
- NestJS 11 with TypeScript strict mode and ESM.
- TypeORM with PostgreSQL; production never uses `synchronize`.
- Identity uses short-lived RS256 access cookies and rotated refresh tokens. The Phase 1
  plan includes public `STUDENT` registration by verified email/password and Google
  OIDC with mandatory profile completion for new Google users.
- Redis and MinIO are optional infrastructure; MinIO network calls and upload jobs require its feature flag.

Phase 3.2 implements private Course Unit uploads for Manager/assigned Mentor,
version-pinned binary validation and durable PostgreSQL jobs. Setup/API/test
instructions: [Files runbook](docs/PHASE_3_2_FILES_RUNBOOK.md).
Material review and Student downloads follow in Phases 3.3/3.4.
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

Registration verification and online payment confirmation emails include styled HTML
and a plain-text alternative. Payment emails link directly to
`FRONTEND_BASE_URL` + `ORDER_DETAILS_PATH` (default `/orders/:orderId`), replacing
`:orderId` with the order UUID. The frontend order page requires the purchasing
account to sign in and can load details from `GET /api/v1/me/orders/:orderId`.
Verification links use `EMAIL_VERIFICATION_PATH` and retain the existing token flow.

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
schema and reruns migrations. Some database suites skip without this variable,
but six Materials/Files suites fail during setup to require their dependencies.
PostgreSQL and the local MinIO test fixture must both be running. Never point
the test URL at development, staging or production data. In PowerShell, for example:

```powershell
docker compose up -d postgres
pnpm files:local:up
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
and `SEED_ACCOUNT_PASSWORD` in `.env` first. `seed:data` runs admin → `seed:standard` on a freshly migrated DB. All dates are
relative to the current Vietnam week; sessions use the teaching slots and every class
has a saved weekly schedule. Every account uses `SEED_ACCOUNT_PASSWORD`:

- Staff: `manager.ops@example.com`, `manager.sales@example.com`,
  `mentor.frontend|backend|python@example.com`.
- Students: `student.an|binh|chi@example.com`, `student.s01`…`student.s21@example.com`,
  plus `student.suspended@example.com` (SUSPENDED).
- Catalog: 3 categories, 6 courses (TS-201 inactive), 27 units, one published ARTICLE
  material per active unit (no MinIO needed).
- Classes: HTML-CSS-101-K01 COMPLETED; JS-101-K01 and PY-101-K01 IN_PROGRESS with
  taught sessions, attendance and progress; REACT-201-K01 OPEN with a pending cash hold
  and a cart item; NODE-201-K01 OPEN and full (5/5); HTML-CSS-101-K02 OPEN with two
  students (below the 3-student opening minimum) and an expired payOS order;
  JS-101-K02 DRAFT.
- JS-101-K01 also has a graded quiz, an upcoming published quiz and a mentor material
  waiting for review.

Paid orders alternate manager-confirmed cash and settled payOS evidence; nothing calls
payOS or sends email. Reruns reset seed passwords and skip classes whose code exists.

For production, the existing seed guards require both `SEED_ADMIN_CONFIRM=YES`
and `SEED_DEMO_CONFIRM=YES` to run the full demo seed.

### Add demo data to the existing server database (20/11/2026, 09:20 +07)

Use `pnpm seed:demo` in a source checkout, or the compiled command below on the
server after deploying the image containing this change. This is a separate,
additive batch; `seed:data` remains the fresh-database command and resets demo
passwords. The additive command preserves existing users/passwords/statuses,
catalog and classes. Missing accounts use `SEED_ACCOUNT_PASSWORD`; an existing
account with an unexpected role/status stops the transaction for inspection.
Set `SEED_ACCOUNT_PASSWORD` in the server's `.env.production` for missing accounts.
The additive command does not run the admin seed and needs no `SEED_ADMIN_CONFIRM`.

The new batch has seven classes with suffix `DEMO-20261120`:

| Mentor / class | Demo data |
| --- | --- |
| `mentor.frontend@example.com` / `JS-101-FE-DEMO-20261120` | IN_PROGRESS, 8 paid students |
| `mentor.backend@example.com` / `JS-101-BE-DEMO-20261120` | IN_PROGRESS, 12 paid students |
| Frontend / HTML & CSS | COMPLETED, 8 paid students |
| Frontend / React | OPEN, 4 paid + 1 pending CASH, cart item |
| Backend / Node.js | OPEN, full: 4 paid + 1 pending CASH / 5 seats |
| Frontend / HTML & CSS | OPEN, 2 paid students + expired payOS order |
| Backend / JavaScript | DRAFT, empty roster |

Both active JS classes have a SCHEDULED session **20/11, 09:20–10:50 Vietnam time**,
separate rosters, taught sessions/attendance/progress, a graded quiz and an open
quiz, plus mentor articles awaiting review. Regular sessions use teaching slots;
only the demo-day session is moved 10 minutes earlier than slot 2. Missing seed
ARTICLE materials are also added to existing course units without replacing their
content. Cash/payOS records are fixtures; no provider calls or mail are sent.

Run from the existing VPS checkout with the same image tag used for deployment.
Preview first (executes database checks, then rolls the transaction back):

```bash
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps \
  -e SEED_DEMO_CONFIRM=YES -e SEED_DEMO_DATE=2026-11-20 \
  migration node dist/database/seed/standard.js --demo --dry-run
```

The preview commits no seed rows; PostgreSQL sequence counters may still advance.

Then add the data:

```bash
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps \
  -e SEED_DEMO_CONFIRM=YES -e SEED_DEMO_DATE=2026-11-20 \
  migration node dist/database/seed/standard.js --demo
```

The one-off seed process does not start API workers. Reruns reuse the dated codes
and skip existing classes, preserving demo actions. Mentor/student calendar or
approved-leave conflicts roll the whole batch back and report session IDs. Run
before the demo session starts. `SEED_DEMO_DATE` can select another dated batch;
rerunning the same batch never shifts its timetable. No database reset is needed.

### Add registration classes immediately, without CI/CD

`tools/seed-open-registration.mjs` runs against the compiled modules in the already
deployed API container; rebuilding or restarting the API is unnecessary. Copy this
single file to `/tmp/seed-open-registration.mjs` on the VPS, then run from the
existing VPS checkout:

```bash
docker compose --env-file .env.production -f compose.production.yaml exec -T \
  -e SEED_DEMO_CONFIRM=YES api node --input-type=module - \
  < /tmp/seed-open-registration.mjs
```

It adds six OPEN classes with **0/25 students**, using existing active courses and
mentors: HTML/CSS FE, JavaScript FE, React FE, JavaScript BE, Node.js BE and Python.
Codes end in `REG-20261123`. The schedule starts in the week of 23/11, so these
classes can be registered on 19/11 and 20/11. Python is OFFLINE; the others are
ONLINE. All units/sessions and weekly schedules are created; existing course
materials remain available through the usual enrollment policy. No users,
passwords, orders or enrollments are modified or inserted by this script.

Add `--dry-run` after the `-` to validate constraints/calendars and roll back;
add `--plan` to print the plan without database access. A successful real run
prints `COMMITTED` followed by six class codes; rerunning preserves existing
classes. Calendar conflicts roll back all new rows. No password setting is needed.
`SEED_REGISTRATION_START_DATE` can override the default future date.

For offline registration under the frontend/backend mentors, run the same script
with `--offline` (after the Node `-`). It inserts five additional OPEN/OFFLINE
classes, each 0/25: HTML/CSS FE, JavaScript FE, React FE, JavaScript BE and Node BE.
Codes contain `REG-OFF-20261123`, with rooms `Phòng Demo Frontend` / `Phòng Demo
Backend`. Session meeting URLs are null. These classes use different teaching
slots from the existing registration/demo classes. Existing online classes and
the Python offline class are preserved; repeating the command skips existing codes.

```bash
docker compose --env-file .env.production -f compose.production.yaml exec -T \
  -e SEED_DEMO_CONFIRM=YES api node --input-type=module - --offline \
  < /tmp/seed-open-registration.mjs
```

Use the updated script file for this command; the original six-class script did
not support `--offline`. Check the output for `COMMITTED` and `OPEN OFFLINE`.

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
