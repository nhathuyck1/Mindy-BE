# Phase 16 — Business bell notification runbook

20/11/2026. Backend local; deployment and FE/browser acceptance recorded separately
in [progress](progress/phase%2016/PHASE_16_PROGRESS.md).

## Deploy and activate

1. Backup the database. Build and verify the migration manifest. Apply compiled
   migration `1795132800000-business-notifications` before enabling the API.
   Existing chat rows/read timestamps and message FKs are preserved.
2. Set a random `NOTIFICATION_CURSOR_SECRET` of at least 32 bytes. Keep the same
   secret across restarts; rotating it invalidates cursors, not inbox/read state.
3. Enable `NOTIFICATIONS_ENABLED=true`; enable `NOTIFICATION_SOCKET_ENABLED=true`
   for Mentor/Student realtime. `CHAT_ENABLED` is independent. Workers use
   `NOTIFICATION_JOB_ENABLED=true`; all three new flags default to false.
4. Configure the reverse proxy for WebSocket Upgrade on `/ws/notifications`
   without `/api/v1`. Preserve Origin and cookies; use the existing CORS allowlist
   and secure cookie settings. Smoke-test chat `/socket.io`, whiteboards
   `/ws/whiteboards` and business `/ws/notifications` together.
5. Activate producers individually after the corresponding functional gate. The
   command below defaults to dry-run; add `--apply` only to perform the mutation.

```powershell
pnpm notifications:maintenance status
pnpm notifications:maintenance activate --producer=SCHEDULE
pnpm notifications:maintenance activate --producer=SCHEDULE --apply
```

Valid producers: SCHEDULE, ASSIGNMENT, PAYMENT, LEAVE_MAKEUP, MATERIAL, REMINDER.
Activation takes a DB row lock and preserves an existing activated_at/epoch.
Do not reset activation/epoch to suppress delivery: use the API/worker/socket
flags. Capture remains active after activation even if these flags are OFF.
There is no historical audit backfill. Reminders inspect only currently open
windows (30m before session, 24h before assignment/order expiry); no overdue catch-up.

## Monitor, retry and retention

`status` reports producer activation and job counts/oldest timestamps without
payloads. Investigate lag, DEAD jobs and `DELIVERY_RETRY_REQUIRED` or
`REPLAY_WINDOW_EXPIRED`. Worker claims a 60s lease with a fencing token, processes
up to 100 recipient checkpoints per transaction, and retries failures with capped
exponential backoff (8 failures, then DEAD). Successful checkpoints reset the
failure budget. Expired leases can be reclaimed; duplicate inbox inserts are
blocked by unique(user_id,event_id).

```powershell
pnpm notifications:maintenance replay --event=<UUID>
pnpm notifications:maintenance replay --event=<UUID> --apply
pnpm notifications:maintenance retention --limit=100
pnpm notifications:maintenance retention --limit=100 --apply
```

Replay permits only DEAD events from the current activation epoch within 90 days
and after activated_at. It resumes unprocessed recipients; it does not reset
processed recipient snapshots or regenerate a deleted inbox row. Reauthorization
still applies. Retention removes bounded batches of business inbox rows older
than 90 days; event/recipient markers remain to prevent unread resurrection.
This implementation retains these markers indefinitely; 30-day completed-job
compaction and eventual marker purge require a separately verified policy.

## Failure and rollback

- If socket delivery fails after inbox commit, REST refetch on connect/focus
  recovers the notification. No durable WebSocket ACK/replay guarantee is made.
- Disable delivery/worker to contain incidents; leave capture and compatible
  schema in place. Review backlog before re-enabling. Current state/entitlement
  is checked again, so stale reminders and revoked relations are suppressed.
- Restore notifications, notification_events, notification_recipients and
  notification_producers in one consistent database backup, together with their
  referenced users/domain rows. Restore JWT configuration and cursor secret
  separately; never log cookies, tickets, cursor secrets or private payloads.
- First run restored data with workers/socket OFF, inspect status, then enable
  bounded delivery on a test environment. Check for duplicate user/event rows and
  verify terminal notices remain generic. Do not replay events outside 90 days.
- Do not run down migration after capture: it explicitly refuses when event
  history exists. Roll back application code with all new flags OFF instead.

Current transport supports a single API replica. Multiple replicas need a shared
adapter/broker and tests for delivery to sockets connected to another replica.

## Frontend handoff

Use [the current API/WS contract](api_flow/PHASE_16_flow-api-breakdown.md).
The bell uses BUSINESS for list/count/read-all. Dedupe packets by notification.id,
refetch after connect/reconnect/focus/read, and poll every 30s only while the inbox
is visible and no socket is available. GET never marks read. Unknown types and
unavailable targets need generic UI fallbacks; resource APIs always reauthorize.
No FE code, browser acceptance or production deployment is implied by BE tests.
