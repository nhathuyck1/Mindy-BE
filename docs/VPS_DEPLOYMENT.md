# VPS deployment

The production stack builds one immutable backend image, runs database migrations once,
then starts the API only after PostgreSQL is healthy and the migration job succeeds.
PostgreSQL is private to Docker. The API bind address is configurable: use `0.0.0.0`
to expose Swagger directly on the VPS port, or `127.0.0.1` when Nginx/Caddy provides
the public HTTPS endpoint.

## 1. Prepare `.env.production`

Create `.env.production` on the VPS. Do not commit it. Start from
`.env.production.example`, then
set production values for every item below:

```dotenv
# Values consumed by Compose
POSTGRES_DB=mindy_center
POSTGRES_USER=mindy
POSTGRES_PASSWORD=CHANGE_TO_A_LONG_RANDOM_PASSWORD
API_BIND_ADDRESS=0.0.0.0
API_PORT=3000
IMAGE_TAG=latest

# Application
NODE_ENV=production
PORT=3000
CORS_ORIGINS=https://app.example.com
SWAGGER_ENABLED=true
DATABASE_URL=postgresql://mindy:URL_ENCODED_PASSWORD@postgres:5432/mindy_center
DATABASE_LOGGING=false
COOKIE_SECURE=true

# Authentication
JWT_PRIVATE_KEY_BASE64=CHANGE_ME
JWT_PUBLIC_KEY_BASE64=CHANGE_ME
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=2592000

# Google OIDC
GOOGLE_AUTH_ENABLED=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://api.example.com/api/v1/auth/google/callback
GOOGLE_OAUTH_STATE_TTL_SECONDS=600
REGISTRATION_INTENT_TTL_SECONDS=900
FRONTEND_BASE_URL=https://app.example.com
GOOGLE_REGISTRATION_PATH=/register/complete
GOOGLE_AUTH_SUCCESS_PATH=/
GOOGLE_AUTH_ERROR_PATH=/login

# Email
MAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=sender@example.com
SMTP_PASSWORD=CHANGE_ME
MAIL_FROM=Mindy Center <sender@example.com>
EMAIL_VERIFICATION_TTL_SECONDS=1800
EMAIL_RESEND_COOLDOWN_SECONDS=60
EMAIL_VERIFICATION_PATH=/verify-email

# Optional services
REDIS_ENABLED=false
REDIS_URL=redis://localhost:6379
MINIO_ENABLED=false
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET=mindy-center
```

If the PostgreSQL password contains reserved URL characters, percent-encode it in
`DATABASE_URL`. Keep the original value in `POSTGRES_PASSWORD`.

Generate a dedicated RSA key pair for production instead of copying development keys:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem
openssl rsa -pubout -in private.pem -out public.pem
base64 -w 0 private.pem
base64 -w 0 public.pem
rm private.pem public.pem
```

Put the two one-line Base64 outputs into `JWT_PRIVATE_KEY_BASE64` and
`JWT_PUBLIC_KEY_BASE64`. Rotate any credential that has ever been committed, pasted in
chat, or shared outside the VPS secret store.

## 2. Build and start

Run from the repository directory on the VPS:

```bash
cp .env.production.example .env.production
# Edit every CHANGE_ME value and all public URLs before continuing.
docker compose --env-file .env.production -f compose.production.yaml config --quiet
docker compose --env-file .env.production -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.production.yaml ps
docker compose --env-file .env.production -f compose.production.yaml logs migration
docker compose --env-file .env.production -f compose.production.yaml logs -f api
```

With `API_BIND_ADDRESS=0.0.0.0`, allow TCP port `API_PORT` in the VPS firewall/security
group. Swagger is then available at `http://VPS_IP:3000/docs` and readiness at
`http://VPS_IP:3000/api/v1/health/ready`.

Direct HTTP publishing is useful for a short smoke test, but authentication cookies
configured with `COOKIE_SECURE=true` require HTTPS. For a normal public deployment,
set `API_BIND_ADDRESS=127.0.0.1`, keep `COOKIE_SECURE=true`, and use the reverse proxy
configuration below.

## 3. Reverse proxy

Configure Nginx or Caddy to proxy the public API hostname to `127.0.0.1:3000` and issue
an HTTPS certificate. Only ports 22, 80 and 443 should normally be public. Do not expose
PostgreSQL port 5432. Swagger will be available at `https://api.example.com/docs` when
`SWAGGER_ENABLED=true`.

## 4. Updating

Back up PostgreSQL before applying a release, then run:

```bash
git pull --ff-only
IMAGE_TAG=$(git rev-parse --short HEAD) docker compose --env-file .env.production -f compose.production.yaml up -d --build
```

The migration container must finish successfully before the API is started.

## Phase 2.2 payment release

For payOS migration, exact Cloudflare callback routing, BE re-confirmation, live smoke
and rollback while retaining pending settlements, follow the
[Phase 2.2 deployment runbook](./PAYOS_PHASE_2_2_DEPLOYMENT.md).
