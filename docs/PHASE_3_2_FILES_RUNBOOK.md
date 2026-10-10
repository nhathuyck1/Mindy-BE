# Phase 3.2 — Private uploads: local setup and handoff

Updated: 2026-10-09. This runbook covers local upload validation. Material
CRUD/review is Phase 3.3, Student download 3.4, extraction/cleanup 3.5 and
production rollout 3.6. `READY` never grants Student access by itself.

## Start the local storage

```powershell
docker compose up -d postgres
pnpm files:local:up
pnpm files:local:setup
```

The compose project is `mindy-files-test`, listening on `127.0.0.1:19000`.
MinIO is compiled from `RELEASE.2025-10-15T17-29-55Z`; SDK packages are pinned
to `3.1148.0`. The setup command only provisions the local `mindy-center-local`
bucket, refuses an existing bucket policy, enables versioning and is repeatable.
Its root credentials are local fixture values, never production credentials.
Tests create their own UUID `-test` buckets and delete only those buckets.

To try the API locally, set these values in your ignored `.env`:

```dotenv
MINIO_ENABLED=true
MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=19000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=mindy-files-test
MINIO_SECRET_KEY=mindy-files-test-only-password
MINIO_BUCKET=mindy-center-local
MINIO_PUBLIC_URL=http://127.0.0.1:19000
FILE_JOB_ENABLED=true
```

Apply migrations with `pnpm migration:run` to the intended development database,
then `pnpm build` and `pnpm start`. This slice's verification only migrated
isolated test databases; it did not migrate the development or VPS database.
The parser runner is compiled JavaScript, so Files requires a build before
processing uploads. `pnpm dev` also builds it through Nest's source compilation.
Linux workers use `/usr/bin/ffprobe` supplied by Docker's `ffmpeg` package;
Windows/macOS local workers use the bundled `ffprobe-static` binary.

## API flow

Log in as active MANAGER or the Class's assigned active MENTOR with cookie auth.
The existing Origin check applies to mutations. Prefix: `/api/v1`.

1. `POST /files/upload-intents` with
   `courseUnitId`, `originalFilename`, `declaredMimeType`, `declaredSizeBytes`.
   A Mentor must additionally supply matching `classId` and `classUnitId`.
   Manager context is optional; if supplied it is checked.
2. PUT the raw file to the returned `uploadUrl` with every `requiredHeaders`
   entry, without sending API cookies or an Authorization header to storage.
3. `POST /files/:fileId/complete` with `{}` (or no body). Returns 202 while
   PROCESSING, 200 for an already READY file. Extra body fields are rejected.
4. Poll `GET /files/:fileId` for READY/FAILED. Failure returns a safe `errorCode`;
   a FAILED intent cannot be reused. Create a new intent to upload again.

Intent and status responses use `Cache-Control: no-store`. Only create returns
the signed PUT URL. Status excludes bucket/key/version/hash diagnostics and
there is no Student download route in 3.2. The PUT URL is a capability until its
TTL expires; changing Mentor assignment blocks subsequent API access.

See Postman's `04 — Phase 3.2 Files` folder. The PUT request requires choosing a
local binary manually; signed URLs are sensitive and must not be shared.

## Bounds and configuration

| Setting | Default / hard limit |
|---|---|
| Declaration/binary size | 25 MiB except MP4 200 MiB; nonempty and actual exactly equals declared |
| Filename | 1..250 chars; no outer whitespace, control chars or path separators |
| `FILE_PUT_TTL_SECONDS` | 600 (30..600) |
| `FILE_INTENT_TTL_SECONDS` | 1800 (600..3600) |
| `FILE_MAX_OPEN_INTENTS` | 20 per actor (1..100), serialized in PostgreSQL |
| `FILE_JOB_POLL_SECONDS` / `FILE_JOB_CONCURRENCY` | 5 / 2 (1..60 / 1..4) |
| `FILE_JOB_LEASE_SECONDS` / `FILE_JOB_HEARTBEAT_SECONDS` | 300 / 30 (60..600 / 5..30) |
| `FILE_JOB_MAX_ATTEMPTS` | 5 (1..20); backoff cap 60s plus <1s jitter |
| `FILE_JOB_TIMEOUT_SECONDS` | 180 (30..240) |
| `FILE_VALIDATION_TIMEOUT_SECONDS` | 60 (5..120); isolated Node heap 128 MiB |
| `FILE_SCRATCH_DIRECTORY` | OS temp/mindy-file-validation; private random subdirs, removed after processing |
| ZIP | <=4096 entries, <=128 MiB expanded total, ratio <=200 for entries >1 MiB, captured XML <=4 MiB each; CRC checked |
| Images / PDF | <=40 million pixels, single image; PDF 1..10,000 pages, parseable and unencrypted |
| Media probe | <=20s, output <=1 MiB, allocation <=64 MiB, file/pipe protocols only |

Office validation checks OPC content types, main-part namespace and the root
officeDocument relationship, XML syntax, CRC and bounded decompression.
Encrypted/macro containers, unsafe paths, mismatched/truncated binaries and
invalid UTF-8/NUL source files fail. Source code/JSON need not compile/parse.
Validators establish binary structure, not a malware scan or content approval.

## Verification

Create a dedicated database whose name ends `_test` once; helpers create and
reset their own suffixed databases. Never point these tests at development or
production data. With the local compose Postgres:

```powershell
docker compose exec -T postgres psql -U mindy -d postgres -c 'CREATE DATABASE mindy_phase32_test'
$env:TEST_DATABASE_URL='postgresql://mindy:mindy@localhost:5433/mindy_phase32_test'
pnpm check
pnpm test:http
```

For a focused storage regression: `pnpm test:files`. Missing database/MinIO
fails the Files suites; these critical tests do not silently skip. Migration
coverage includes clean schema and the new migration down/up on test DB only.
The full suite also covers auth/catalog/CASH/PayOS/mail regressions with mocked
payment providers, without evidence of real payment settlement.

## Durable jobs and handoff

`FilesService.assertReadyReference(principal, fileId, courseUnitId, manager)`
requires an active caller transaction, locks the File row and returns a verified
immutable summary. Materials must insert its own reference in that same
transaction. Mentor references require ownership and original Class provenance
with current assignment; Manager can take over a same-unit READY file.

VALIDATE uses SKIP LOCKED, expiring leases/heartbeats and fenced writes.
Staging version is pinned once; each copy candidate token/key/version remains
in bounded history. READY, verified version/hash, metadata PENDING and one
EXTRACT job commit together. Only VALIDATE is claimed; EXTRACT/PURGE remain
pending until handlers in 3.5. Staging expiry marks unused intents FAILED but
does not delete binaries. Inspect queue/errors through fileId/jobId structured
logs and database rows; do not log signed URLs or payloads.

## Before staging/VPS enablement (Phase 3.6)

Keep `MINIO_ENABLED=false` until private bucket/versioning, bucket-scoped IAM,
HTTPS public signer origin and real frontend CORS have been provisioned. Local
tests verify CORS preflight and signed PUT via HTTP clients; a deployed browser
journey is separate evidence. Test credentials and root access are local only.

The current production compose `/tmp` is 64 MiB. Provision a writable bounded
scratch volume with at least concurrency * 200 MiB plus headroom before enabling
Files, set `FILE_SCRATCH_DIRECTORY`, and verify worker memory/CPU/storage and
proxy ingress limits. Presigned PUT is not a hard ingress size limit. Actor
quota bounds open intents, not all historical bytes or object versions;
capacity/retention/cleanup must be configured before production exposure.
Production compose/credentials/domain/rollout remain unchanged in this slice.
Do not run migration down on databases containing Files/material references;
rollback production requires a separate reviewed data plan.
