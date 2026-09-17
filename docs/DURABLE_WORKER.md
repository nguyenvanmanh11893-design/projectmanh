# Durable worker and upload finalization (Phase 6B)

Run the worker separately from the API process:

```powershell
npm run worker
```

`jobs` is the source of truth. Completing a direct upload binds the exact incoming version and inserts one `FINALIZE_UPLOAD` job in the same RDS transaction, using `dedupe_key = finalize:<upload_session_id>`. The worker claims a due or expired-lease job under a row lock, increments `attempts`, and assigns a UUID lease token plus monotonic lease generation. Every terminal/retry update checks that token, so a worker which resumed after its lease cannot write a stale result.

`next_attempt_at` is authoritative; `run_at` remains synchronized for Phase 2 compatibility. Retry uses full jitter from zero through `min(1000 * 2^(attempt-1), 15 minutes)`, and a job becomes `DEAD` after its configured `max_attempts` (default 10). The worker renews its active lease every third of `WORKER_LEASE_MS`, using the same token; a failed/expired renewal means later finalization is fenced. An API restart has no effect on jobs. On SIGTERM/SIGINT, the worker stops claims and renewals and drains active work. A hard timer is armed before any await and terminates even a hung S3 request or DB close. The durable lease then expires naturally; shutdown does not requeue an in-flight copy or consume an extra retry merely for a signal. Use a process supervisor to restart after DB failure. The supported single-EC2 deployment shares one host clock; synchronize that clock.

## Finalization protocol

1. Read deterministic `processing-results/<report-id>.json`, validate `validator-report/v1`, validator version `s3-file-validator/1`, report hash, configured bucket, incoming key, and bound source version.
2. Transactions lock job, then user, then session (the quota API also locks user before session). A `REJECTED` report changes the session to `REJECTED`, releases the reservation exactly once, writes audit, and succeeds the fenced job. Replays see a terminal session and cannot release again. A reservation underflow aborts instead of silently clamping the counter to zero.
3. A `PASSED` report calls S3 CopyObject outside any DB transaction, pinning the source `VersionId`, and copies to `objects/<user_id>/<file_id>`.
4. A short RDS transaction rechecks the lease and session. It creates the `READY` file with the returned destination `versionId`, changes session to `COMPLETED`, moves reserved bytes to used bytes, writes audit, and succeeds the job together.

If a session is cancelled or expires before this final transaction, it cannot become `READY`; its reservation is released only when still `UPLOADED`. Preflight also releases an expired upload without requiring a report. A missing/unreadable/bad report is retryable and never treated as rejection. Reports are bounded to 16 KiB, reject unknown properties and invalid enums/types, and PASSED requires VALID plus an approved detected MIME. No S3 call occurs while an RDS transaction is open. Download uses the committed destination version and a 300-second attachment URL. Legacy deletion refuses versioned files pending the Phase 7 lifecycle workflow.

## Copy recovery and surplus destination versions

The worker deliberately retains destination versions on failed or stale attempts. A DB error can mean COMMIT succeeded but its response was lost; immediate S3 compensation is unsafe. `jobs.copy_version_id` is written atomically with READY and is a receipt only for the committed copy, not a journal of every attempt. A crash after CopyObject can leave an unrecorded version, and retry may copy again. No quota is charged for those surplus versions.

Cleanup procedure (manual/reviewed until Phase 7 automation):

1. Identify the exact destination key from the persisted job file ID and owned upload session. If either is missing, retain/report the object; do not guess ownership.
2. Stop worker activity for that job and allow outstanding S3 operations to settle. Retain candidates for a grace period of at least 24 hours, longer than all lease/shutdown/retry windows; grace alone does not authorize deletion.
3. List versions for the exact key (filter out other keys sharing the prefix). Exclude every version referenced by file metadata, including non-READY lifecycle states. A DEAD or nonterminal job is report-only until explicitly resolved.
4. Re-read authoritative DB state immediately before deleting a specifically reviewed surplus version with DeleteObject VersionId. If DB is unavailable, state is ambiguous, or a worker can still commit that version, retain it. Repeat the inventory after the grace period for late copy completions.

Never delete by bare key or apply blanket expiry to `objects/`. Pinned downloads remain correct even if a stale worker's surplus copy is S3's current version. Keep incoming versions available throughout recovery; retries always copy the bound source version. Automatic reconciliation is not implemented in Phase 6B.

## Upgrade and exhausted retries

Stop API and worker before running migrations. Migration 004 must export its runner ID; migration 005 is restartable after partial DDL and backfills one job per Phase 5B UPLOADED session, including expired sessions needing release. Start the new API/worker only after migration completion. No existing file/session is deleted by the migration.

DEAD jobs remain durable for operator inspection; they are not successful uploads. Repair the underlying report/IAM/DB fault and requeue only after confirming session validity, with a reviewed bounded attempt budget. Expired sessions cannot be resurrected: their reservation is released by the existing quota read/create paths, or by a requeued finalize preflight. Periodic dead-job/session reconciliation belongs to Phase 7. Do not promise indefinite automatic retries across unlimited repeated kills.

The upload API currently has no filename field in its Phase 5B contract. Finalization uses `upload-<session-id>` as metadata; the existing ownership-scoped rename endpoint can set a user filename. This is a contract limitation, not filename detection from an untrusted S3 key.
