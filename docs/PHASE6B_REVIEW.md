# Phase 6B review

Review scope: the uncommitted Phase 6B diff plus its new files, against `docs/SPEC.md`. No AGENTS.md was found in the project. Existing changes were preserved; corrections below are within finalization and its existing API integration. No Phase 7 implementation, dependency addition, deployment, or database migration execution was performed.

Line references below identify the corrected locations in the current worktree. Reproduction describes the pre-review bug.

| Severity | File / line | Reproduction and impact | Minimal correction applied |
| --- | --- | --- | --- |
| High | `src/services/finalize-upload.service.js:17` | Supply a source-matching report with PASSED but unknown reason, invalid MIME type, or extra fields. The old partial check accepted it; a malformed validation result could produce READY. | Enforce v1 keys, types, required fields, reason enum, source/hash and approved validator; PASSED requires VALID and an allowlisted detected MIME. |
| High | `src/services/file.service.js:61`, `src/services/s3.service.js:23` | Finalize version A, then a stale attempt writes version B at the same key. Download signed the current key without VersionId for an hour, violating the committed-version invariant. | Pass stored destination VersionId through to GetObject, reject missing/null version, keep attachment and use 300 seconds. |
| High | `src/services/file.service.js:90` | DELETE a newly READY file through the existing route. Legacy deletion created a delete marker and destroyed metadata while leaving used_bytes charged and versions behind. | Reject non-legacy deletion with 409 FILE_LIFECYCLE_REQUIRED. Implementing trash/purge remains Phase 7. |
| High | `src/services/finalize-upload.service.js:53` | Finalizer locks session and waits for user while cancellation/quota API locks user and waits for session. InnoDB deadlocks can exhaust attempts. A lease can also expire while waiting for locks after the old initial check. | Use job -> user -> session and recheck lease after waits and before terminal save. No S3 call is made inside these transactions. |
| High | `src/services/worker-shutdown.js:7`, `src/worker.js:51` | SIGTERM while fail(), copy, or sequelize.close() hangs. The old deadline began after an awaited DB call and only set exitCode; heartbeat could continue keeping a job leased indefinitely. | Arm a hard process exit before awaiting, stop claims/heartbeats, drain without premature requeue, and rely on persisted lease expiry if forced to exit. |
| High | `database/migrations/004-phase5b-direct-upload.js:1`, `database/migrations/005-phase6b-durable-worker.js:19` | The migration runner rejects 004 because it lacks id, preventing 005 from loading. Even if fixed, existing UPLOADED sessions had no jobs and would never finalize after upgrade. | Export the existing migration ID; make 005 additive/resumable and backfill jobs for existing bound UPLOADED sessions. Upgrade requires API/worker stopped. |
| Medium | `src/services/finalize-upload.service.js:66`, `src/services/quota.service.js:152` | Expired upload with missing report retries toward DEAD without releasing quota. Direct-upload expiry also threw inside the transaction, rolling its own expiry/release back. | Finalizer checks expiry before S3. Direct-upload methods return the expired state from the transaction, then report the API error after commit. |
| Medium | `src/services/finalize-upload.service.js:43` | Set reserved_bytes below the session size, then finalize. The old clamp-to-zero concealed corruption and still increased used_bytes. | Abort on reservation underflow or exceeded quota; transaction rollback retains the inconsistent state for investigation rather than compounding it. |
| Medium | `src/services/quota.service.js:153`, `src/services/quota.service.js:169` | Retry complete with the same version after worker changes status to COMPLETED/REJECTED. Old code returned inactive-session error instead of the original result. | Accept bound terminal states for same-version retry, keep different-version conflict and ownership lookup, create no second job. |
| Medium | `src/services/file.service.js:43` | Finalize successfully, then list the folder. Filtering only LEGACY_UNVERIFIED hid all READY files. | Include READY while retaining legacy visibility and ownership/cursor behavior. |
| Medium | `src/services/job.service.js:68`, `src/worker.js:57` | Inject an SDK/SQL error containing a credentialed URL or SQL values. Old last_error persisted raw text and fatal worker logging emitted it. | Persist fixed allowlisted error codes and emit a fixed fatal message; do not log arbitrary exception text. |
| Medium | `src/services/finalize-upload.service.js:103`, `test/phase6b.test.js:30` | Throw during COMMIT after the callback. The old committed flag was set before commit completed, so documented cleanup did not occur; the copy receipt rolled back too. Tests merely invoked callbacks and could not detect this or a lost COMMIT acknowledgement. | Remove eager compensation and retain copies explicitly. Add rollback/lost-ack fault simulation. Document discovery from durable job key, not a supposed durable journal of every copy, and cleanup after grace plus authoritative reference recheck. |
| Medium | `src/services/s3-storage.adapter.js:42`, `src/services/s3-storage.adapter.js:54` | Return an oversized report or literal VersionId='null' from a versioning-suspended bucket. Old code buffered without a bound and accepted a mutable null version. | Cap report stream at 16 KiB and fail closed on null destination versions. |

Additional small fixes: remove duplicate max_attempts model property; restrict claims to FINALIZE_UPLOAD; compute lease start after row-lock wait; finish/fail reject expired leases rather than relying only on token equality.

## Verification

Executed outside the sandbox after the sandbox rejected Node child-process spawning with EPERM:

```powershell
node --test test/phase1.test.js test/phase2.test.js test/phase3.test.js test/phase4.test.js test/phase5a.test.js test/phase5b.test.js test/phase6a.test.js test/phase6b.test.js
```

Result: **64 passed, 0 failed**. This command does not load .env or execute the optional MySQL test. Expected legacy S3 fault-injection messages and the AWS SDK Node 20 support warning appeared. `git diff --check` passed.

Added coverage includes report schema/semantic failures, missing/non-JSON reports, lease expiry with and without reclaim, stale worker after newer commit, enqueue rollback, transaction rollback after callback, lost COMMIT response, cancellation/expiry during copy, quota underflow, terminal complete retry/ownership, exact-version copy/download, retry scheduling/cap/error redaction, migration exports, and shutdown with stuck work/DB close.

The transaction fixture snapshots and rolls back changes; it still serially simulates individual transactions and is not an InnoDB implementation. The shutdown test injects exit rather than killing a real service. No claim is made that an actual worker kill, network partition, migration, or AWS IAM/versioning behavior was exercised.

## Acceptance: BLOCKED

The implemented unit-level gate now permits READY only after an approved source-matching PASSED report and immutable-version copy. Fault injection shows one file and one quota charge when the old attempt resumes after a newer commit or the COMMIT response is lost. Runtime acceptance still requires:

1. Establish explicit disposable MySQL and private versioned S3 targets. Rehearse migration 004/005 from Phase 5B data and rerun after partial DDL, verifying one job per bound upload. No migration was applied during this review.
2. Run two independent workers against InnoDB while cancelling/expiring the same user's sessions. Verify actual row-lock contention, rollback, lease reclaim, and exact reserved/used counters.
3. Kill/restart the process before copy, after S3 succeeds, before DB COMMIT, and after COMMIT. Include a delayed stale worker and lost copy/COMMIT responses. Assert one READY record, one quota charge, matching downloadable version, and retention of every referenced S3 version.
4. Exercise real SIGTERM with a stalled S3/DB operation and confirm exit within WORKER_SHUTDOWN_MS plus supervisor restart/lease recovery. Verify browser cannot write reports or objects directly; report-write authority belongs to the validator.

Until these conditions are met, do not claim deploy-ready or start the next phase based on this acceptance. DEAD jobs retain evidence and require operator intervention; finite retry budgets cannot promise automatic recovery after unlimited kills. Surplus S3 versions are retained under the documented manual review procedure; automatic reconciliation remains deferred.
