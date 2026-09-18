# Operational runbooks — Phase 10A

These procedures are for a separately authorized test/production incident. None was executed while implementing Phase 10A. Record incident time, environment/account/region, current artifact SHA, alarm and relevant request/job/report IDs. Use Session Manager, not SSH; do not print .env, decrypted parameters, cookies, SQL bind values or signed URLs. Use read-only inspection first. Preserve data and bounded retry budgets; do not edit quota counters or mark files READY to silence an alarm. Escalate to the service owner if authority or state is ambiguous.

## DB down

Trigger: readiness 503, worker samples missing, RDS alarms. `/health/live` can still be 200.

1. Check RDS status/events, CPU, connections, free space and memory. Inspect EC2-to-RDS SG 3306, DNS, CA expiry and clock. Inspect `database_unavailable`/`worker_stopped`, not raw secret configuration. Do not expose RDS publicly or disable TLS verification.
2. If storage is exhausted or an RDS maintenance/failover is in progress, repair the identified cause using the reviewed infrastructure procedure. Credentials/CA rotation needs a coordinated reviewed change. Avoid restarting every process repeatedly while DB is unavailable.
3. Once DB is reachable, verify `/health/ready`, restart only a stopped API/worker via systemd, and confirm fresh worker samples. Check old RUNNING leases reclaim and backlog falls without duplicated quota changes. Compare a sampled owned upload/job and audit. Close incident after stable readings over at least two alarm periods; escalate rather than restoring a DB blindly.

## Worker down

Trigger: missing/zero heartbeat, oldest work/backlog rising; API may be ready.

1. Inspect `systemctl status cloud-files@worker` and safe JSON worker logs. Check DB readiness, instance RAM/disk, IAM errors via fixed job error codes, clock and current release. Distinguish idle backlog=0 with fresh heartbeat from missing telemetry/agent.
2. Repair cause; then `systemctl restart cloud-files@worker` once authorized. Allow the configured lease/shutdown window to expire. Never clear lease tokens or start an unbounded fleet of workers to force progress.
3. Verify a fresh heartbeat, job claims and decreasing oldest work; a renew-only heartbeat can coexist with a stuck S3 call. If the process is hung, stop it with the configured bounded systemd shutdown, let the lease expire, restart, and inspect exact-version copy receipts/surplus candidates. Preserve orphan copies until reference checks and grace period. Escalate persistent DEAD jobs.

## Upload stuck

Trigger: oldest-work alarm, UPLOADED session past STALLED_UPLOAD_MINUTES, user reports processing never ends.

1. Start from owner-authorized upload status and request ID, then `job_queued`/`job_started`; inspect session status/expiry, bound source version, dedupe job status/attempts/next_attempt_at/lease and fixed last_error with read-only DB access. No ownership bypass endpoint exists.
2. RESERVED/UPLOADING with no completed exact version should expire/release once; it must not be fabricated into UPLOADED. For UPLOADED, inspect deterministic report existence, Lambda errors, failure destination and matching source version. Follow the replay runbook for a missing report caused by validator failure.
3. Repair IAM/report/DB fault. Let normal retries/reconciliation work first. For DEAD jobs, prepare a reviewed single-job transaction with a finite additional attempt budget only after checking session still valid and no active lease; no bulk retry SQL is supplied. Expired/rejected uploads are not resurrected. Confirm READY only after exact-version finalization, or terminal failure with reservation released once. Inspect quota/audit, not just a green job status.

## Lambda failure queue replay

Trigger: failure queue depth/age, Lambda errors/throttles or DestinationDeliveryFailures. Queue retention is 14 days; archive incident evidence before it expires.

1. Repair root cause first (IAM, Lambda package, source version availability, timeout/concurrency). DestinationDeliveryFailures may mean the failure never reached SQS: inspect invocation logs and reconcile missing reports; an empty queue is not proof of no loss.
2. In an authorized operator role, receive **one** message with visibility timeout long enough for inspection/replay. Preserve its message ID/receipt handle in a restricted temporary file. This is a Lambda async **destination envelope**, not an S3 event-source queue or conventional redrive DLQ.
3. Validate envelope `requestPayload.Records` against the intended account bucket, `incoming/` prefix and each exact non-null versionId. Cross-check the upload session and job; skip/retain for review if expired, unrelated, malformed or already terminal. Extract only `requestPayload` into a restricted JSON file. Do not invoke the whole destination envelope or infer the current S3 version.
4. Invoke the validator synchronously using the reviewed Lambda name, `--invocation-type RequestResponse --cli-binary-format raw-in-base64-out --payload fileb://reviewed-event.json` and a restricted output file. Check the response **FunctionError field**, not merely CLI exit code/HTTP 200. Do not print payload/results in CI logs. Duplicated records are expected; deterministic reports and fenced worker jobs make retry idempotent.
5. Verify matching report schema/source/hash for every record and worker progress or a deliberate terminal disposition. Only then explicitly delete that one SQS message with its receipt handle. On any uncertainty, do not delete; allow visibility timeout and retain evidence. Never purge the queue or run automatic bulk replay. Close when queue drains and new failures stop for two alarm periods.

## S3 purge failure

Trigger: PURGE_FILE retries/DEAD, PartialDeleteError, file stuck PURGE_PENDING.

1. Inspect the owned tombstone, job ID/error and exact `objects/<user>/<file>` binding. Check IAM ListBucketVersions/DeleteObjectVersion, retention/Object Lock if applicable and storage-service health. Inventory exact-key versions and delete markers; prefix siblings are not targets.
2. Repair the fault; normal retries can handle already-deleted versions. Metadata and quota must remain until every version is confirmed absent. Never subtract quota or delete metadata manually, delete by bare key, or enable blanket objects/ lifecycle expiry.
3. For a DEAD purge, after review use the existing owner-authorized permanent-delete action to deliberately reset the bounded retry budget. Verify empty exact-key inventory, PURGED tombstone and one quota decrement/audit event. Retain unexplained copies for reconciliation/reference checks.

## Disk full

Trigger: root disk >85%, log/agent failures, failed artifact staging, ENOSPC.

1. Inspect `df -h`, `df -i` and scoped `du` for `/var/log/cloud-files`, `/var/log/nginx`, `/opt/cloud-files/releases`. Check rotation and stopped Agent delivery. Do not dump log contents with secrets into an incident report.
2. Pause new releases. Prefer reviewed EBS expansion/filesystem growth using the actual filesystem/device procedure. If cleanup is required, retain current and rollback artifacts, incident evidence and required log retention; delete only explicitly reviewed stale release/temp files. Never recursively clean the entire application directory or touch S3/RDS data.
3. Repair logrotate/agent, confirm writable filesystem, restart only affected services and rerun readiness/heartbeat checks. Check inode pressure independently of byte capacity. Account for CloudWatch ingestion/storage cost when restoring telemetry.

## Certificate renewal

Trigger: expiry approaching, HTTPS smoke fails or renewal timer failure. CloudWatch local readiness can remain healthy when public TLS is broken.

1. Inspect the public certificate expiry/hostname, DNS A record, system clock, ACME client timer/service and port-80 `/.well-known/acme-challenge/` path. Do not expose private keys or bypass TLS validation.
2. Under authorization, run the installed ACME client's renewal dry-run (for Certbot: `certbot renew --dry-run`). Fix DNS/challenge permissions/rate-limit cause, then renew normally. Keep the old certificate until a valid replacement exists.
3. Validate `nginx -t`, reload Nginx only on success, check public HTTPS hostname/chain/expiry and `/health/ready`. Verify unattended renewal timer and reload hook. Record a calendar/monitoring expiry check; this phase does not provision an external certificate-expiry monitor.

## Cost spike

Trigger: budget/billing SNS or unexpected usage. These alerts are delayed, account-wide and are not a spending cap.

1. Confirm payer/account, region and time interval. Inspect Cost Explorer/Budgets by service/tag and compare EC2/EBS/RDS, S3 versions/requests/egress, Lambda retries, CloudWatch ingestion/custom metrics and retained releases. Separate this deployment from unrelated account usage.
2. Check upload/retry storms, failure queue backlog, orphan/version growth, log volume and metric cardinality. user_id/file_id/request_id/job_id must never be metric dimensions. Confirm no unexpected NAT/ECS resources. Examine CloudTrail through the security incident procedure if usage is unauthorized.
3. With owner approval, contain the identified source (pause admission or affected worker when necessary, fix retry loop, adjust safe retention). Do not destroy DB/buckets, blanket-delete versions or disable all alarms to reduce the bill. Document expected savings and data impact; verify subsequent usage trend and restore paused service deliberately.
