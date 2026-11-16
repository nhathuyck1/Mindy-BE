# Assignment ZIP — rollout, jobs and retention

## Schema update — 2026-11-05

Assignment hiện còn 10 bảng riêng. Audit/receipt đã chuyển sang tracking chung;
file binding, trạng thái điểm và danh sách bản sao file đã được gộp.
Đọc [schema và hướng dẫn migration](ASSIGNMENT_CONSOLIDATION.md) trước khi rollout.
Các phần có ngày cũ bên dưới ghi lại rollout trước khi consolidation.


2026-11-02. Backend local implementation; this task does not deploy or migrate
development/production. [API](../api_flow/PHASE_5_flow-api-breakdown.md#5-zip-instruction-files-grading-and-reporting--implemented)
· [Flow](../api_flow/PHASE_5_FLOW.md) · [Progress](../progress/phase%205/PHASE_5_PROGRESS.md).

## Rollout

1. Back up the database/object storage using the existing deployment process.
   Apply additive migration1793577600000 through the compiled migration runner;
   existing quiz submissions/results/triggers remain intact. Clean installation,
   an upgrade with graded QUIZ history, and populated-down refusal have local tests.
2. Deploy app with ASSIGNMENT_ZIP_ENABLED=false. Keep normal QUIZ timeout worker
   enabled. Assignment file worker uses ASSIGNMENT_FILE_JOB_ENABLED=true by default;
   poll3s, at most5 jobs sequentially per poll. MINIO_ENABLED must be true for uploads.
3. Provision the private versioned MinIO bucket/backend IAM using the existing
   provisioning script. Assignment objects use assignment-staging/* and
   assignment-verified/*, independently of material/chat metadata. Cleanup requires
   ListBucketVersions scoped to these prefixes and DeleteObjectVersion on these
   object prefixes. The updated script adds those rights; it does not grant delete
   on material prefixes. Review/apply in the target environment before enabling.
4. Ensure FILE_SCRATCH_DIRECTORY is private/writable with capacity for a25MiB
   instruction or20MiB ZIP plus parser overhead. Production Files overlay provisions
   the existing scratch tmpfs. ZIP parser child uses128MiB V8 heap,35s process timeout;
   archive traversal has30s budget. Worker task timeout90s, lease180s/heartbeat15s.
   Multiple API processes can safely claim jobs using SKIP LOCKED + lease tokens.
5. In a nonproduction smoke environment, enable ASSIGNMENT_ZIP_ENABLED=true, restart
   the app to load config, and exercise instruction upload, ZIP upload/complete,
   READY/attach/submit, mentor draft grade/release, history and scoped download.
   Verify no draft feedback/grade version is in student JSON. Confirm real backend
   IAM can list/delete old unreferenced assignment versions, including staging
   overwrites and abandoned copy keys. Local tests use isolated MinIO test credentials;
   they do not prove production IAM/network/CDN/scratch configuration.
6. Verify the public proxy bulk questions limit per [VPS runbook](VPS_DEPLOYMENT.md#3-reverse-proxy).
   Storage PUT goes to MinIO directly, not the API JSON parser. Ensure bucket CORS
   permits the configured FE Origin for presigned PUT with content-type. Enable ZIP
   for the target environment only after that smoke succeeds.

## Jobs and recovery

complete pins the staging version before queueing VALIDATE. The worker reads that
exact version with a byte cap into a private scratch file, validates actual bytes,
copies the pinned version to a unique verified key, and rechecks permission, draft
state, deadline, pinned version and current lease before committing READY. READY
never submits. All network/storage calls happen outside DB transactions.

Validation accepts ZIP <=20MiB compressed, <=100MiB actual expanded, <=1000 entries,
per-entry ratio<=100; checks streamed size/CRC and archive signatures. Encrypted,
nested (including renamed archives), symlink/special entries, unsafe/ambiguous paths,
duplicate normalized names, malformed directories and unsupported compression are
rejected. No extraction/execution/compilation of student code occurs. PDF/DOCX/PNG/
JPEG instructions reuse the existing isolated binary validators with their own scope.

Storage/launch failures retry after10s up to5 claims. An expired lease is claimable
after restart; stale workers cannot commit. A worker dying on its fifth lease is
marked FAILED by maintenance after lease expiry. Parser/policy/revocation failures
are terminal. Inspect assignment_file_jobs status,attempts,error_code,lease_until
and assignment_files status,error_code; do not log raw uploads, ZIP entries or grade
feedback. Revoke/archive/cancel blocks new writes immediately under the shared locks;
maintenance durably voids revoked drafts in bounded batches of50. Submitted history
and grades are preserved. DB deadline is checked again in the final submit write.

## Cleanup and retention

ASSIGNMENT_FILE_CLEANUP_GRACE_HOURS defaults24 (allowed1..8760). Maintenance queues
up to50 old files after both intent expiry and grace. Cleanup rechecks age, file
state and references under a file lock, marks DELETING, deletes all versions of the
exact staging key and all recorded verified-copy keys, then marks DELETED. Recording
each copy key before copying handles crashes before copy-version persistence.
No extraction directory or other bucket/prefix is swept.

Current instruction bindings, submitted instruction snapshots and DRAFT/SUBMITTED
ZIP bindings block cleanup; DB guards also refuse deleting referenced byte metadata.
VOIDED drafts do not pin files indefinitely. Abandoned uploads, invalid files and
replaced/unattached files become eligible after grace. Signed PUT URLs expire within
5min, intents15min; a pending URL never reserves a deadline. DELETED tombstones are
rechecked daily in bounded cleanup batches to catch late storage writes from requests
already in flight and copies finishing after a lost lease. FAILED cleanup jobs remain
terminal for operator investigation rather than restarting an unbounded retry loop.
Storage lifecycle/backups are separate from DB retention. Do not apply
a blanket expiry rule to assignment-verified/*, which includes submitted history.

## Rollback

Set ASSIGNMENT_ZIP_ENABLED=false and restart to stop new upload/draft/attach/submit/
grade/release/extend/instruction mutations. Retain the schema and object versions.
Own submitted history/released results/downloads remain readable with an active
account; a committed submit can replay its receipt after the deadline/flag rollback.
Quiz continues independently. ASSIGNMENT_FILE_JOB_ENABLED=false pauses validation,
cleanup and durable draft voiding; request-time permission checks still deny writes.
Do not claim processing completion while the worker is disabled.

Migration down rejects existing ZIP submissions/files/audits. Do not force-drop
tables, alter terminal submissions, rewrite grade revisions or delete referenced
versions as a rollback mechanism. A60s download URL already issued stays usable
until its TTL; new signing rechecks authorization after presign. Immediate revoke
of an issued URL would require a streaming gateway, which is outside this backend slice.
