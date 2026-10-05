This is not the normal nestjs you know. Before coding, check docs folder for all the logic and plan. Also after do something, write an update to the PROGRESS.md.
Every phase will have it own implement plan and progress file.

Before changing business rules, read all of document/Flow.txt and the related docs.
The progress file to update is docs/progress/Progress.md; distinguish planned work,
local checks, VPS evidence and real payment results.

Phase 2 status (2026-10-05): server webhook probe and PayOS sample confirmation
passed; BE Phase 2.2 payment is now implemented and locally verified. VPS payment
deployment and real transactions remain pending and will be performed by the user. Follow
docs/implement_phase/PHASE_2_2_PAYOS_BE_REAL_PAYMENT.md for the current payment plan,
docs/progress/PHASE_2_2_PROGRESS.md for evidence and docs/PAYOS_PHASE_2_2_DEPLOYMENT.md
for the deployment runbook.
Preserve full payment, online confirmation email, cash pending preview and assigned
mentor cash confirmation from Flow.txt; pending group chat/DM is deferred to chat.
Activate existing checkout holds after verified settlement; do not recreate enrollment
tables or edit deployed migrations. Keep the remaining Phase 2.1 A1 checks explicit.

docker compose up -d postgres
pnpm migration:run
pnpm seed:admin
pnpm dev
This is the command for build and run the project

Host: localhost
Port: 5433
Database: mindy_center
Username: mindy
Password: mindy
Dbeaver login
