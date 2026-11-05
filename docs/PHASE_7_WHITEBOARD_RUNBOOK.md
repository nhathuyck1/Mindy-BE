# Phase 7 whiteboard local runtime

Runtime is opt-in; no production deployment is implied. Apply the normal compiled
migration catalog before enabling `WHITEBOARD_ENABLED=true`. Keep one API instance
for collaboration. PostgreSQL owns checkpoints, command receipts, update receipts,
snapshots and media jobs. MinIO must have private policy, versioning and the existing
Files IAM/CORS setup. Worker PUT permission is required for `whiteboards/*`.

## Decisions after the implementation spike

- Yjs 13.6.32 with a custom Socket.IO 4.8.1 adapter, path `/ws/whiteboards`, namespace
  `/`, websocket transport only. It is **not** the y-websocket wire protocol.
- Browser cookie authentication and exact `CORS_ORIGINS` checks; no bearer/query
  tokens or BroadcastChannel. Five connections per account; 30 commands/second per
  connection; 256 KiB decoded update, 4 MiB checkpoint, 2,000 elements, 100,000 total
  stroke points, 10,000 points per stroke, coordinates within ±100,000.
- Schema v1 has `shapes: Y.Map<Y.Map>`; IDs are UUIDv4. Common fields are id, type,
  x, y, width, height, color (#RRGGBB). Sticky text is `Y.Text` (5,000 characters),
  strokes use points and strokeWidth 1–48; images contain assetId, never a URL.
- Every accepted update stores the complete native Yjs checkpoint and projection
  in the **same transaction** as its actor/updateId/hash/sequence receipt. The
  checkpoint is synchronous, so a separate binary journal/compaction worker is
  unnecessary for recovery. Rejected candidate documents are discarded. Updates
  with unresolved CRDT dependencies are rejected; clients send their queued changes
  in order after synchronizing. Checkpoint quota includes CRDT history; reset/restore
  starts a fresh epoch rather than silently discarding pending changes.
- Lock order: Class → Session → current auth/user/enrollment → Board. Writers use
  exclusive locks, readers shared locks. Mode control version is independent of
  content sequence. Idempotency keys are global per actor, route/body-bound and
  replay only after current authorization. New keys for new user intentions.
- Session-end is consumed synchronously by a PostgreSQL lifecycle trigger under
  the existing finalize transaction. Unique SESSION_END snapshot per board prevents
  duplicate consumption. This replaces a separate outbox worker for this local DB
  side effect; no storage/render calls occur in finalize.
- FULL enrollment or the public Classes makeup participant grants Student view;
  only IN_PROGRESS + COLLABORATIVE grants Student edits. Primary/current effective
  substitute can manage. Cancelled session/class and inactive users are denied.
  Completed-session editing uses board policy, independent of attendance deadlines.

## WebSocket messages

Client events all require an ACK callback. Success `{ok:true,data:...}`; failure
`{ok:false,error:{statusCode,code}}`. Do not equate socket connection with persistence.

| Event | Payload | Result |
| --- | --- | --- |
| board:join | `{boardId}` | metadata, capabilities, full base64 Yjs binary, server identity |
| board:update | `{epoch,updateId,binary}` | durable `{epoch,sequence,updateId}` after commit |
| board:awareness | `{x,y}` | ephemeral server identity + coordinates to authorized peers |

Server `board:state` contains the same sync state after a committed change, mode,
epoch or capability change. Passive authorization is checked every 500 ms. Before
every send the recipient is reauthorized. `board:revoked` and disconnect clear the
client document. On disconnect the UI locks editing; on reconnect it joins again,
checks epoch and only then replays same-epoch pending IDs. Epoch changes discard
pending/undo with an explicit UI notice. No durable offline editing.

## Storage and jobs

Mentor-only `POST /whiteboards/:id/assets` declares filename/mimeType/sizeBytes;
PNG/JPEG ≤10 MiB, ≤20 megapixels. PDF additionally supplies unique `pages` (1–10
selected pages, source ≤100 pages, page numbers 1–100) and requires
`WHITEBOARD_PDF_ENABLED=true`. PUT with credentials omitted; complete pins the
server-observed version. GET status until READY/IMPORTED/FAILED; processing retries
three times under 180-second fenced leases. Validation uses Files' isolated binary
validator. Images are decoded and re-encoded to PNG. Each PDF page runs Poppler with
timeout and a 1,400px longest edge. READY image ID is the bound board asset; there is
no separate attach/bind endpoint. PDF status returns its generated image asset IDs.

Exports capture server projection/epoch/sequence atomically. `POST /exports` accepts
PNG/PDF, CONTENT or VIEWPORT; viewport is `{x,y,width,height,scale}`. Max 4,096px per
dimension/16 MP. CONTENT includes 24 world-unit padding; empty board is 1024×768.
White background, no grid/cursor/selection. PDF is one page scaled to the requested
bounds (no multi-frame pagination). Renderer runs in a bounded subprocess; jobs
are durable QUEUED/RUNNING/COMPLETED/FAILED and restart expired leases. Signed
downloads expire in 60 seconds and are reauthorized on each request. Issued URLs
remain usable up to their TTL after revocation, as with existing Files.

Asset cleanup has a seven-day grace and checks current document, **all snapshots**
and export source projections under the board lock before claiming DELETING.
Deleting a canvas shape does not remove a snapshot's file. Retain DB and bucket
versions together. Export/snapshot retention is conservative (no automatic pruning).
Failed writes between storage PUT and DB commit can leave unreferenced object
versions; include prefix inventory in operational cleanup instead of blindly
deleting versions. Quota/retention should be tuned with deployment evidence.

## WSS and recovery

Proxy this path directly to Nest, in addition to the existing REST proxy:

```nginx
location /ws/whiteboards/ {
    proxy_pass http://mindy_api;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header Cookie $http_cookie;
    proxy_read_timeout 75s;
}
```

Use the FE origin in CORS_ORIGINS, preserve Origin, TLS and HttpOnly cookie security.
Next's REST catch-all cannot upgrade this socket. Local development needs the same
reverse proxy or a trusted explicit WS development proxy. Do not use an arbitrary
client-provided API host. Docker installs Poppler and Noto fonts. On Windows set
WHITEBOARD_PDFTOPPM_PATH to the actual executable. PDF flag defaults off separately.

Back up PostgreSQL and private object versions. Restore to a separate environment,
check native checkpoint checksum and snapshot restore, then verify media by pinned
version. Acknowledged edits live in the committed checkpoint; no in-memory state is
needed after restart. Roll back by disabling WHITEBOARD_ENABLED, preserving tables
and objects. Reverting the migration drops feature data and is only for disposable
test DBs or an explicitly approved destructive rollback.

## Validation evidence

### Export diagnostics — 2026-11-04

- Worker retries now log `WHITEBOARD_MEDIA_RETRY` / `WHITEBOARD_MEDIA_FAILED`
  with job ID, board ID, attempt, stage and safe filesystem/SDK identifiers.
  Export `error_code` identifies the failing step, for example
  `BOARD_EXPORT_RENDER_FAILED`, `BOARD_EXPORT_CREATE_SCRATCH_FAILED` or
  `BOARD_EXPORT_STORE_OUTPUT_FAILED`. Messages, signed URLs and parser payloads
  are not logged. Successful export retries clear the previous error code.
- To check deployed scratch access and the actual isolated PNG/PDF subprocess,
  run `node dist/operations/check-whiteboard-render.js` inside the API container.
  This creates and removes only temporary files and does not start application
  workers or modify database/storage data. It does not prove storage PUT access.
- `pnpm build` then `pnpm exec vitest run --config vitest.http.config.ts
  test/http/whiteboard-renderer.spec.ts` exercises the production subprocess with
  Vietnamese text and an embedded image. Earlier feature integration tests used
  an in-process renderer substitute and did not cover this runtime boundary.
- Local subprocess checks pass. VPS blank PNG check returned `PNG_OK`; rendering
  the latest failed PDF job also returned `RENDER_OK` (17,565 bytes). Its subsequent
  storage PUT failed with `EPROTO` / `tls_get_more_records:packet length too long`,
  indicating TLS was sent to an HTTP endpoint. For the bundled Compose MinIO use
  `MINIO_ENDPOINT=minio`, `MINIO_PORT=9000`, `MINIO_USE_SSL=false`; keep the separate
  browser-facing `MINIO_PUBLIC_URL` HTTPS. Recreate the API container to reload env,
  then create a new export. Existing FAILED rows are retained; VPS success after
  correcting the configuration has not yet been verified.

Automated feature suites: `test/integration/phase7-whiteboards.spec.ts` and
`test/http/phase7-whiteboards.spec.ts`. The former uses isolated PostgreSQL/MinIO,
the latter boots the compiled app with real cookies and Socket.IO. Full gate counts
and FE/VPS acceptance are recorded in Phase 7 progress. Load target 30 people / 5
writers / 2,000 elements / p95 <300ms has **not** been established by these suites;
checkpoint fanout is conservative and must be measured before release.
