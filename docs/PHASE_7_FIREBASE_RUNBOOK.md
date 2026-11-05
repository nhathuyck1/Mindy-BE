# Phase 7 — FCM web push operations

2026-10-27 — Backend implemented locally. Staging Firebase/IAM, browser and VPS sign-off remain pending.
[Progress](progress/phase%207/PHASE_7_PROGRESS.md) · [API/FE](api_flow/PHASE_7_flow-api-breakdown.md).

## Deployment

1. Back up PostgreSQL, the push encryption keyring and fingerprint key together. Use a separate Firebase project per environment. Keep database query logging off.
2. Run the additive migration with `pnpm migration:run:build` using the deployment migrator. Deploy both push flags false first. Inbox and Socket.IO retain existing flags.
3. Mount ADC service-account credentials outside the image/repository, set `GOOGLE_APPLICATION_CREDENTIALS`, or use workload ADC. Enable the FCM HTTP v1 API and grant the service identity permission `cloudmessaging.messages.create` for the target project. Never send these credentials to FE.
4. Supply `FIREBASE_PROJECT_ID`, independent `PUSH_TOKEN_KEYRING` (JSON map of positive versions to canonical Base64 32-byte keys), active version and a stable `PUSH_TOKEN_FINGERPRINT_KEY` (Base64 32 bytes).
5. Agree with FE on HTTPS origin, `PUSH_WEB_INBOX_PATH` (default `/notifications`), public Firebase web config and public VAPID key. The frontend origin must appear exactly in `CORS_ORIGINS`; all paths reject absolute, network-relative, escaped and query/fragment URLs.
6. Set a new fixed `PUSH_ACTIVATED_AT` UTC timestamp and `PUSH_ENABLED=true`, keep `PUSH_WORKER_ENABLED=false`. Restart. Enabled startup validates crypto, project/link/cutoff and obtains an ADC access token with a 10-second deadline. This validates credential availability, not FCM project IAM.
7. Turn on `CHAT_ENABLED` and `CHAT_JOB_ENABLED` for message/inbox fanout. FE registers tokens through the two authenticated installation routes. Registration does not enqueue inbox history.
8. Enable the worker on one canary instance, restart, send a new staging chat message and record provider accept ID separately from browser receipt. Validate denied permission, foreground/background, click, logout/account-switch and revoke scenarios in the browser matrix below.
9. Inspect metrics, DEAD rows, retry age and invalid tokens before expanding worker replicas. Claim leases use SKIP LOCKED; lease fencing prevents stale DB completion. Network requests hold no DB/source locks.

The adapter uses Firebase Admin 14.5.0 ADC and HTTP v1 with a cancellable 10-second send deadline. Credential lookup also has a 10-second deadline. The durable worker owns retries; no hidden Admin SDK send retry loop. HTTP v1 `webpush.fcm_options` is serialized explicitly from the Admin typed message shape. Provider timeout can still mean accepted; duplicate display is possible.

## Operations and key rotation

Build before using the CLI. It disables all background workers in its process and never prints tokens, ciphertext, credentials or provider response bodies.

```sh
pnpm push:maintenance metrics
pnpm push:maintenance replay --limit=20
pnpm push:maintenance replay --limit=20 --apply
pnpm push:maintenance retention --limit=100
pnpm push:maintenance retention --limit=100 --apply
pnpm push:maintenance rotate --limit=100
pnpm push:maintenance rotate --limit=100 --apply
```

Default is dry-run. Replay only considers allowed failure codes, unexpired DEAD rows, matching active generation/session and unread notification. Source rights/read/delete/TTL are checked again by the send worker. Attempts reset only by explicit operator replay. Each invocation touches at most the limit in each retention category.

Run bounded retention repeatedly through existing operational scheduling: terminal deliveries older than 30 days, ACTIVE installations not refreshed for 30 days become STALE, revoked/invalid/stale tokens older than 30 days with no remaining delivery references can be purged. Session rate-budget records older than one minute are removed in bounded batches. Inbox retention remains 90 days. FK cascade permits inbox deletion without stranded deliveries; normal retention removes terminal deliveries earlier.

Rotation: add a new random key version alongside all old keys, deploy the keyring with the new active version, run `rotate` dry-run then applied batches until no eligible rows remain. Rotation preserves token fingerprints, installation generation, status and queued bindings. Keep old keys until no token row references them and all backups requiring them expire. **Do not rotate the fingerprint key in place**: v1 requires a separate migration with dual lookup to preserve uniqueness.

Restore rehearsal: restore database plus the matching keyring/fingerprint secret to an isolated environment with worker flags false, inspect counts/key dependencies, decrypt via bounded rotation dry-run, verify auth/inbox and register a new test token. Never turn restored deliveries on against production tokens. Browser token validity after restore is a separate live staging check.

Metrics expose delivery status/error counts, oldest timestamp, total attempts, installation statuses/key versions. `PUSH_ACCEPTED` logs internal delivery ID/attempt/latency; `PUSH_SEND_FAILED` only allowlisted reason. Alert on CONFIGURATION, INVALID_PAYLOAD, provider errors, DEAD growth and pending age close to TTL. SENT means provider accepted, never browser received/read.

## Rollback

Set `PUSH_ENABLED=false` and `PUSH_WORKER_ENABLED=false`, restart/redeploy every worker process. Keep schema/data and encryption secrets for investigation. Runtime gate is checked before new requests; changing the env file alone does not affect running processes. In-flight provider accepts cannot be recalled. Inbox/socket remain governed by Phase 6 and do not require Firebase.

## Local verification and browser evidence

Automated tests use `_test` databases and fake injected provider. The transport simulation uses dummy credentials/tokens only:

```sh
pnpm build
postman simulation run postman/simulations/phase7-fcm.sim.yaml --port 14970 --no-history
node tools/push/verify-fcm-simulation.mjs http://localhost:14970/fcm
```

The local Postman mock is derived from the official HTTP v1 contract subset; owner-workspace lookup was not used because this is a public-provider fixture. No mock was published and no workspace binding was changed. Simulation verifies accepted/400/403/unregistered/429/503 including Retry-After and REST payload casing. It does not verify ADC/IAM or browser delivery.

| Browser gate | Required evidence | State |
|---|---|---|
| User gesture / denied / unsupported | Browser/version, HTTPS origin, permission state, chat/inbox unaffected | Pending FE |
| Foreground + Socket.IO dedupe | notificationId, one toast, refetched badge | Pending FE |
| Background display | SW scope, SDK version, one displayed notification | Pending FE |
| Click logged-in / logged-out | Login then inbox; no auto-read; hidden/deleted target refetch | Pending FE |
| Multi-tab/device/token rotate | generation responses and old delivery skipped | Pending FE |
| Logout/account switch/revoke | Auth invalidated, no stale account content; clear local displays | Pending FE |
| Live staging canary/rollback | Provider ID + UTC time, browser received time separately, queue metrics, flags/restarts | Pending VPS |

References: [Admin setup](https://firebase.google.com/docs/admin/setup), [HTTP v1](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages), [errors](https://firebase.google.com/docs/cloud-messaging/error-codes), [web receive](https://firebase.google.com/docs/cloud-messaging/web/receive-messages).
