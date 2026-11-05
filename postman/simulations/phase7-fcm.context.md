# Phase 7 FCM transport simulation

Local only; CLI 1.77.0. Contract subset: `postman/contracts/fcm-v1.openapi.yaml`, sourced from Firebase HTTP v1 reference. No cloud workspace or deployment.

Start: `postman simulation run postman/simulations/phase7-fcm.sim.yaml --port 14970 --no-history --output ndjson`.
Read the `listening` event for the bound URL; then `pnpm build` and `node tools/push/verify-fcm-simulation.mjs http://localhost:14970/fcm`.
Stop the foreground process after verification. Do not enable verbose/body logging with real tokens.

The `simulate-200/400/403/404/429/503` dummy token names choose documented provider responses. Mock checks Bearer dummy credential and generic payload keys/REST casing; unknown routes return 501. `Retry-After: 90` is injected for 503. No external Firebase request occurs. Worker/session/source-rights behavior is covered independently by PostgreSQL tests with the injectable fake provider.

2026-10-27: 6/6 HTTP transport cases PASS. ADC/IAM, credential refresh and actual browser push remain staging evidence.
