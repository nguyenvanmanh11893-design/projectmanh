# Implementation Status

## Current phase

**Phase 7 source implementation complete; BLOCKED for runtime acceptance.** The full explicit unit/fault-injection suite passes 75/75. Migration 006, real InnoDB lock races, and real versioned-S3 list/delete/partial-failure behavior have not been exercised; no deployment was performed. The earlier Phase 6B runtime acceptance gaps also remain.

## Phase 7 completed

- Added owned file lifecycle APIs: trash, filtered cursor-paginated trash listing, restore before purge begins, and asynchronous permanent-delete request. Trash retains `used_bytes`; only `READY` files can receive download URLs; a permanent request returns HTTP 202 while `PURGE_PENDING`.
- Trash creates/reuses one durable purge job due after seven days. Restore and purge lock the durable job before the file so one transition wins; once `PURGE_PENDING`, restore is rejected. Re-trash reschedules the same deduplicated job.
- Added exact-key versioned S3 purge. It paginates versions and delete markers (including literal `null` versions), deletes explicit `(Key, VersionId)` batches, treats S3 `Errors` and unconfirmed identifiers as partial failure, inventories the key again, and only then atomically reduces quota once and marks the retained tombstone `PURGED`.
- Expanded the worker to claim `FINALIZE_UPLOAD`, `PURGE_FILE`, `EXPIRE_UPLOAD_SESSION`, and `RECONCILE` with existing lease fencing/reclaim. Upload expiry releases a reservation once and races safely with finalization.
- Added bounded periodic reconciliation: schedules missing expiry jobs, reports stalled `UPLOADED` sessions and restores missing finalize work by dedupe key, corrects quota counters from file/session source rows, and scans `objects/` only from the worker.
- Added persistent reconciliation findings. Orphans require a later observation after a minimum 24-hour grace period and an authoritative metadata recheck. `ORPHAN_CLEANUP_MODE=report-only` is the default; automatic exact-version deletion requires explicit `delete` mode.
- Added [lifecycle and reconciliation operations](FILE_LIFECYCLE.md), `.env.example` knobs, OpenAPI endpoint documentation, and fail-closed quota underflow checks.

## Phase 7 files changed

- `database/migrations/006-phase7-lifecycle-reconciliation.js`, `src/models/{File,ReconciliationFinding,index}.js` - purge tombstone timestamp, findings table, lifecycle/reconciliation indexes, backfilled expiry/purge jobs, and the periodic reconciliation seed.
- `src/services/{file,purge-file,expire-upload,reconciliation,job,quota,s3-storage.adapter}.js` - lifecycle transitions, exact-version purge, expiry, quota/orphan reconciliation, multi-type lease claims, and partial S3 delete handling.
- `src/controllers/file.controller.js`, `src/routes/file.routes.js`, `src/middleware/validation.middleware.js`, `src/config/swagger-docs.js` - owned trash/list/restore/permanent-delete HTTP contracts and validation.
- `src/worker.js`, `.env.example`, `docs/FILE_LIFECYCLE.md`, `test/phase7.test.js` - worker dispatch, safe defaults/operations, and Phase 7 fault-injection coverage.

## Phase 7 verification

| Command/check | Result |
| --- | --- |
| `node --check src/services/file.service.js src/services/s3-storage.adapter.js src/services/purge-file.service.js src/services/expire-upload.service.js src/services/reconciliation.service.js src/services/job.service.js src/worker.js database/migrations/006-phase7-lifecycle-reconciliation.js` | Passed. |
| `node --test test/phase1.test.js test/phase2.test.js test/phase3.test.js test/phase4.test.js test/phase5a.test.js test/phase5b.test.js test/phase6a.test.js test/phase6b.test.js test/phase7.test.js` | Passed: 75/75 outside the sandbox after the sandbox returned `spawn EPERM`. Expected Phase 1 injected S3-error logs and the AWS SDK Node 20 support warning appeared. No `.env`, MySQL, or AWS target was used. |
| `git diff --check` | Passed (Git only reported existing LF-to-CRLF conversion warnings on Windows). |
| Migration 006 and real MySQL/AWS acceptance | Not run: no explicit disposable MySQL database or private versioned S3 bucket was established. Unit fixtures do not prove InnoDB scheduling, IAM, S3 pagination/consistency, or actual partial batch responses. |

## Limits and conditions to start Phase 8

- Stop API/worker, rehearse migration 006 on a disposable copy of Phase 6B data, rerun it after injected partial DDL, and verify backfilled jobs/findings indexes without modifying production data.
- Run two workers against MySQL for restore-versus-purge and expiry-versus-finalize races, including lease death and reclaim; verify counters from independent SQL queries.
- Against a private versioned S3 test bucket, create multiple versions plus delete markers for one exact key, inject partial `DeleteObjects` failure, and verify no quota release until the follow-up inventory is empty.
- Run at least two orphan scans separated by the configured grace period in `report-only`, review findings, and enable `delete` only in a separately approved test environment. Phase 8 may consume these APIs after these gates; do not describe the system as production-ready before them.
- `LEGACY_UNVERIFIED` rows remain outside the version-bound lifecycle because they have no trustworthy S3 version; handle them only through a separately reviewed legacy inventory/migration, not the Phase 7 API.

## Phase 6B completed

- Added migration `005-phase6b-durable-worker`: explicit `next_attempt_at`, job deduplication, lease token/generation, copy receipt, and due-job index. Source-version binding and durable finalization-job creation are now atomic.
- Added a separate `npm run worker` process with transaction/lease claims, bounded jittered exponential retry, attempt limits, expired-lease recovery, and bounded SIGTERM/SIGINT drain/exit. It uses database fencing rather than API-process memory.
- Added report validation and finalization: report/source/version/hash/validator-version checks, REJECTED one-time quota release, exact-version S3 copy, destination version persistence, and a fenced post-copy DB transaction for READY/session/quota/audit.
- Review corrections: strict schema/verdict validation; consistent user/session locking; post-wait lease checks; fail-closed quota underflow; report-independent expiry; terminal complete retries; migration prerequisite/backfill; pinned downloads and READY listing; guard against legacy deletion of versioned files; bounded shutdown and safe error codes. Failed copies retain versions for reference-checked cleanup; no immediate delete after ambiguous COMMIT.
- Tests now cover transaction rollback and lost COMMIT acknowledgement, two workers racing, expiry/cancellation, enqueue rollback, malformed/missing reports, retry cap/redaction, S3 version encoding, and stuck shutdown. See [review findings and acceptance conditions](PHASE6B_REVIEW.md) and [worker protocol](DURABLE_WORKER.md).

## Phase 6B files changed

- `database/migrations/005-phase6b-durable-worker.js`, `src/models/Job.js`, `src/services/{job,finalize-upload,quota}.service.js` - durable scheduling, fencing, atomic enqueue, and finalization.
- `src/services/s3-storage.adapter.js`, `src/worker.js`, `package.json`, `.env.example` - version-pinned S3 operations and separate worker runtime/configuration.
- `test/phase6b.test.js`, `test/phase5b.test.js`, `docs/DURABLE_WORKER.md` - failure injection and operations/recovery documentation.
- Review also changed `database/migrations/004-phase5b-direct-upload.js`, `src/services/{file,s3}.service.js`, added `src/services/worker-shutdown.js`, and updated `test/phase1.test.js`; no dependency was added.

## Phase 6B verification

| Command/check | Result |
| --- | --- |
| `node --test test/phase1.test.js test/phase2.test.js test/phase3.test.js test/phase4.test.js test/phase5a.test.js test/phase5b.test.js test/phase6a.test.js test/phase6b.test.js` | Passed: 64/64, using approved execution outside the sandbox after `spawn EPERM`. No dotenv import, MySQL or AWS access. Expected injected legacy S3 errors and Node 20 SDK warning appeared. |
| `npm test` | Not rerun during review: explicit unit-file selection avoids the opt-in DB test and loading local .env. The prior sandbox EPERM is not a test failure in application code. |
| `git diff --check` | Passed. |
| MySQL migration/lease race and real S3 process kill/restart | Not run: no explicit disposable DB/bucket target was established or used during review. Mock rollback/lease tests are not evidence of InnoDB or real process recovery. |

## Conditions to start Phase 7

- Rehearse migration 005 and competing worker claims against disposable MySQL (including an expired lease and transaction rollback).
- Run real versioned-bucket report/copy/cancellation crash drills with IAM allowing exact-version get/copy/delete only under the required prefixes.
- Establish the documented grace-period/recheck reconciliation job before automatically deleting orphan destination versions.

## Phase 6A completed

- Added the standalone `lambdas/s3-file-validator` entry point. It processes every S3 event record independently, decodes form-style S3 keys (`+` to space before URL decoding), requires `versionId`, and pins that version in `GetObject`.
- It applies the 50 MiB limit and basic byte-content validation for PDF, JPEG, PNG, and UTF-8 text; it does not trust MIME metadata or a filename. TXT permits an optional UTF-8 BOM but rejects malformed UTF-8, NUL bytes, and binary-like C0 controls (other than tab/LF/CR). No content is executed, decompressed, or rendered, and this is explicitly not antivirus scanning.
- Added versioned report contract `validator-report/v1` in `contracts/validator-report-v1.schema.json`. Reports have a deterministic SHA-256 ID from bucket, decoded incoming key, version ID, and validator version; contain only source metadata/verdict (not contents or secrets); and are written to `processing-results/{report_id}.json`.
- Duplicate events therefore target the same report key, while a distinct object version gets a different report. The handler skips non-`incoming/` records, so result writes cannot form an event loop when the S3 notification is prefix-filtered to `incoming/`.
- S3 read, stream, and report-write errors are deliberately rethrown for Lambda retry; only completed inspection emits `REJECTED`.

## Phase 6A files changed

- `lambdas/s3-file-validator/{index,validator}.js` - Lambda handler, exact-version S3 adapter, deterministic reports, and safe content checks.
- `lambdas/s3-file-validator/README.md`, `contracts/validator-report-v1.schema.json` - operational constraints and versioned worker-facing report schema.
- `test/phase6a.test.js` - byte-content, fake MIME, size, URL key, duplicate/version, multi-record, loop, and S3-failure coverage.

## Phase 6A verification

| Command/check | Result |
| --- | --- |
| `node --check lambdas/s3-file-validator/index.js lambdas/s3-file-validator/validator.js test/phase6a.test.js` | Passed. |
| `npm test` | Passed: 44/44 tests, including 7 Phase 6A tests and the enabled existing disposable-MySQL quota test. Expected Phase 1 S3 fault-injection logs and AWS SDK Node-version warnings appeared. |
| `git diff --check` | Passed. |
| AWS S3/Lambda event, IAM and retry behavior | Not run: this phase explicitly does not deploy AWS. |

## Conditions to start Phase 6B

- Deploy a private versioned bucket notification filtered strictly to `incoming/`, grant the Lambda least-privilege exact-version `GetObject` and `PutObject` only under `processing-results/`, and verify retry behavior with AWS fault injection.
- Confirm Phase 6B reads and validates `validator-report/v1`, `validator_version`, source bucket/key/version ID, and deterministic report ID before it changes any RDS state or quota.

## Phase 5B completed

- `POST /api/uploads` now reserves quota and returns a short-lived (maximum five minutes) presigned S3 POST. The server generates `incoming/{user_id}/{upload_id}`; the policy pins the configured bucket, exact key, declared content type, exact declared length through `content-length-range`, and `success_action_status=201`. The browser receives signed fields but does not supply a key or bucket to the API.
- Added `POST /api/uploads/:id/complete`, which accepts only `versionId`. It HEADs the exact session key and requested version, verifies declared size and content type, then locks and binds the first source version. Repeated or concurrent completion of that same version returns the stored result; a different version returns `409 UPLOAD_VERSION_CONFLICT`.
- Introduced `UPLOADED` upload-session status via migration `004-phase5b-direct-upload`. It retains reserved quota and explicitly means source version bound and awaiting Phase 6 validation. This phase creates no READY file and never commits quota.
- Added a small S3 storage adapter with injected presign/HEAD contract for unit tests. No credential fallback, key fallback, or mock production path was added.
- Disabled `POST /api/files/upload`: it now returns `410 LEGACY_UPLOAD_DEPRECATED` with a successor link before Multer or the legacy S3 writer can run. Keep that response through the Phase 8 client migration, then remove the route and unused legacy upload components after a reviewed client-usage check.
- Added [S3 direct-upload configuration](S3_DIRECT_UPLOAD.md), including CORS `ExposeHeaders` for `x-amz-version-id`, versioning requirement, POST replay semantics, and adapter contract.

## Phase 5B files changed

- `src/services/{direct-upload.service,s3-storage.adapter,quota.service}.js`, `src/models/UploadSession.js`, `database/migrations/004-phase5b-direct-upload.js` - direct-upload policy/HEAD boundary, atomic source-version binding, expiry handling, and `UPLOADED` state.
- `src/controllers/upload.controller.js`, `src/routes/upload.routes.js`, `src/middleware/validation.middleware.js`, `src/config/swagger-docs.js` - direct POST response, complete endpoint, strict version-only input, and API documentation.
- `src/routes/file.routes.js`, `src/controllers/file.controller.js` - legacy multipart upload deprecation/disablement.
- `.env.example`, `package.json`, `package-lock.json`, `docs/S3_DIRECT_UPLOAD.md`, `test/phase5b.test.js` - short-post configuration, AWS official presigned-POST dependency, S3 CORS/contract documentation, and tests.

## Phase 5B verification

| Command/check | Result |
| --- | --- |
| `node --check src/services/quota.service.js src/services/direct-upload.service.js src/services/s3-storage.adapter.js src/controllers/upload.controller.js src/routes/upload.routes.js src/routes/file.routes.js test/phase5b.test.js` | Passed. |
| `npm test` | Passed: 37 tests, including the enabled existing Phase 5A disposable-MySQL reservation test. Phase 5B additionally covers ownership-before-HEAD, transient HEAD/presign failures, declared-type mismatch, concurrent different-version completion, expiry, and protection against pre-validation quota commit. Expected Phase 1 S3 fault-injection logs and an AWS SDK Node-version warning appeared. |
| `git diff --check` | Passed. |
| AWS S3/browser direct-upload E2E | Not run: no AWS bucket/CORS/versioning configuration or browser environment was used. |
| Phase 5B MySQL complete race/migration | Not run: no explicit migration rehearsal was authorized; the concurrent complete test uses an injected serialized transaction fixture. Run migration 004 and repeat competing same/different-version complete requests against a disposable MySQL database before deployment. |

## Conditions to start Phase 6A

- Rehearse migration `004-phase5b-direct-upload` and the direct-upload completion race against disposable MySQL.
- Configure a private, versioned S3 bucket with the documented CORS rule and least-privilege signing role; manually verify S3 returns/exposes `x-amz-version-id` for browser POST.
- Keep complete responses in `UPLOADED`; do not create READY metadata or final object copies until the Phase 6 validator/report contract is approved.

## Phase 5A completed

- Added `POST /api/uploads`, requiring `Idempotency-Key`, and `GET /api/uploads/:id`. The create payload is `requested_size`, `declared_mime_type`, and optional `folder_id`; it accepts only the approved MIME declarations and the 50 MiB maximum. It intentionally does not call S3 or issue a presigned POST.
- Added `GET /api/storage/usage`, returning exact decimal-string `quota_bytes`, `used_bytes`, `reserved_bytes`, and `available_bytes`.
- Added a transactional quota service. It locks the user's row before checking/updating quota, active-session count, and idempotency record; destination folders are ownership-checked and locked. It enforces `used + reserved + requested <= quota`, a maximum of three active sessions, and defaults to the existing 1 GiB schema quota.
- Session states are `RESERVED`, `UPLOADING`, `COMPLETED`, `REJECTED`, `EXPIRED`, and `CANCELLED`. Expired active sessions are marked `EXPIRED` and released during the user's next create/read/usage/commit transaction. `reserveQuota`, `releaseQuota`, and `commitQuota` are idempotent and avoid negative reservation counters.
- The `incoming_key` is an internal schema-required identifier only; it is not exposed as an S3 capability and no presigned POST contract has been introduced. Existing file download continues to require `READY`, so `PENDING` files cannot download.

## Phase 5A files changed

- `src/models/User.js`, `src/services/quota.service.js` - ORM default 1 GiB quota; locking, expiry, quota reservation/release/commit, session ownership lookup, and usage calculations.
- `src/controllers/{upload,storage}.controller.js`, `src/routes/{upload,storage}.routes.js`, `src/app.js` - new protected endpoints.
- `scripts/migrate.js`, `package.json` - direct migration and test commands now load `.env`, so they use the selected disposable test database rather than Sequelize's fallback database name.
- `src/middleware/validation.middleware.js`, `src/config/swagger-docs.js`, `.env.example` - request/config/API contract documentation.
- `test/phase5a.test.js` - reservation race, idempotent retry, double release, cross-user read denial, and pending-download coverage.

## Phase 5A verification

| Command/check | Result |
| --- | --- |
| `node --check src/services/quota.service.js src/controllers/upload.controller.js src/controllers/storage.controller.js src/routes/upload.routes.js src/routes/storage.routes.js` | Passed. |
| `npm test` | Passed: 23 tests; 1 opt-in real-MySQL test skipped. The test command loads `.env`; the integration test runs when `MYSQL_TEST_ENABLED=true` and `DB_*` target a disposable migrated MySQL database. Expected Phase 1 S3 failure-injection logs appeared. |
| `git diff --check` | Passed. |
| MySQL concurrency integration | Not run: no separately configured disposable MySQL test database is available. `test/phase5a.mysql.test.js` is ready to execute the required two-transaction quota/idempotency/release/ownership scenario once that environment is supplied. |

## Conditions to start Phase 5B

- Run migrations and the Phase 5A concurrent reservation/idempotency/release/ownership scenarios against a disposable MySQL database.
- Define and review the S3 presigned-POST policy, CORS exposure of `versionId`, and exact-object HEAD/version contract before issuing direct-upload credentials.

## Phase 4 completed

- Folder create, root list, detail, rename, and empty-only delete are ownership-scoped. Creation rejects level 11; duplicate names remain valid. A folder with child folders or any file, including `TRASHED`, returns `409 FOLDER_NOT_EMPTY`.
- File list supports bound substring search (maximum 100 characters), an allowlisted sort (`created_at`, `updated_at`, `file_name`, `file_size`), ASC/DESC ordering, and opaque cursor pagination (default 25, maximum 100). `id` is always the final ordering tie-breaker.
- File rename and move update database metadata only; neither updates `s3_key`. Destination-folder ownership is checked server-side. Folder creation, upload metadata insertion, and file moves lock the destination folder; folder deletion locks/checks the folder and its children/files in the same transaction.
- Added transactional audit records for Phase 4 mutations and `GET /api/activity`, which filters by the calling user's `subject_user_id` and returns only safe event fields. Audit metadata is explicitly selected and excludes requests, headers, tokens, credentials, and S3 keys.
- Added migration `003-phase4-listing-indexes` for default stable file cursor ordering and updated OpenAPI documentation for search/sort/cursor and activity.

## Phase 4 files changed

- `src/services/folder.service.js`, `src/services/file.service.js`, `src/services/audit.service.js` - ownership queries, depth/empty constraints, transaction locks, file cursor search/sort/listing, and safe audit writes.
- `src/controllers/{folder,file,activity}.controller.js`, `src/routes/activity.routes.js`, `src/app.js`, `src/middleware/validation.middleware.js` - request IDs in audits, activity endpoint, and query validation.
- `database/migrations/003-phase4-listing-indexes.js`, `src/config/swagger-docs.js` - listing index and API contract.
- `test/phase4.test.js` - cross-user move denial, depth limit, trashed-file delete conflict, no-repeat cursor tie-breaker, duplicate names, and audit-secret coverage.

## Phase 4 verification

| Command/check | Result |
| --- | --- |
| `node --check src/services/folder.service.js src/services/file.service.js src/controllers/activity.controller.js src/config/swagger-docs.js` | Passed. |
| `npm test` | Passed: 18/18. The initial sandbox run was blocked by `spawn EPERM`; rerunning outside the sandbox passed. Expected Phase 1 S3 failure-injection logs appeared. |
| `git diff --check` | Passed. |
| MySQL migration/concurrency integration, AWS, browser E2E | Not run: no disposable MySQL/AWS/browser environment is available. In particular, verify row-lock behavior with concurrent create/move/delete transactions on MySQL before production. |

## Phase 3 completed

- Replaced runtime JWT/Bearer authentication with a 256-bit opaque session cookie named `session`. The browser cookie is `HttpOnly`, `SameSite=Lax`, scoped to `/`, and marked `Secure` in production. Only SHA-256 hashes of session and CSRF tokens are persisted in `sessions`.
- Login creates a distinct session, logout revokes its DB row and clears the cookie, and a password change revokes all of the user's active sessions. Each authenticated request resolves the server-side session and confirms `user.is_active`.
- Added state-changing-request Origin validation and session-bound `X-CSRF-Token` validation. The frontend uses credentialed same-origin fetches, obtains/refreshes a CSRF token, and no longer reads or writes an authentication token in `localStorage`.
- Added a process-local, 15-minute login limiter (10 attempts separately per IP and account), generic invalid-credential responses for missing/invalid/disabled accounts, and a bcrypt policy: 12+ characters with uppercase, lowercase, and digit; passwords over bcrypt's 72 UTF-8 byte limit are explicitly rejected.
- Registration now requires a one-use invitation token. Its hash is looked up under a transaction row lock; invitation consumption and user creation occur in the same transaction. The invitation's optional email restriction and expiry are enforced.
- Updated the existing registration form only with the required invitation field and password guidance; no unrelated UI was added.

## Completed

- Added forward-only, versioned migrations and `npm run db:migrate` / `npm run db:status`. Startup remains free of `sequelize.sync()`.
- Added Phase 2 schema/models for sessions, upload sessions, jobs, audit events, invitations, user quota counters, file lifecycle/version/trash fields, and operational indexes.
- Replaced the single-column folder references with composite ownership foreign keys; legacy files are backfilled once to `LEGACY_UNVERIFIED`, never to `READY`.
- Added exact decimal-string handling for MySQL unsigned BIGINT values in Sequelize models/JSON.

- Preserved the multipart-to-Express upload route, but S3 upload failures now return `STORAGE_UPLOAD_FAILED` and prevent creation of `completed` file metadata.
- S3 delete failures return `STORAGE_DELETE_FAILED` and preserve metadata. Presign failures return `STORAGE_PRESIGN_FAILED`; the public S3 URL fallback is removed.
- Removed mock AWS credentials, bucket fallback, and JWT-secret fallback. The S3 client uses the AWS SDK default credential provider chain. Production startup validates required database, JWT, region, and bucket configuration before connecting.
- Startup does not bind the HTTP server unless MySQL authentication succeeds, and no longer calls `sequelize.sync()`.
- Added per-request UUID request IDs (`X-Request-Id` and response `request_id`), stable API error codes, and safe client responses that omit stack traces and internal AWS/SQL details.
- Added route validation for UUIDs, names/body types and lengths, upload folder IDs, and supplied pagination inputs. Multipart upload rejects MIME types outside PDF, JPEG, PNG, and TXT.
- Changed file/folder display names to DOM `textContent`, avoiding interpolation of user-controlled names into HTML.
- Added the built-in Node test runner and `npm test` command, with focused failure-injection and validation/XSS coverage.

## Files changed

- `src/services/session.service.js`, `src/middleware/auth.middleware.js`, `src/middleware/csrf.middleware.js`, `src/middleware/login-rate-limit.middleware.js` - opaque token creation/hashing, revocation, active-user session resolution, CSRF/Origin enforcement, and login throttling.
- `src/services/auth.service.js`, `src/services/user.service.js`, `src/utils/password-policy.js`, `src/controllers/auth.controller.js`, `src/routes/auth.routes.js` - invitation-only transactional registration, generic login behavior, cookie session endpoints, password policy, and password-change revocation. Removed the unused JWT helper so no application auth path remains available for Bearer tokens.
- `src/routes/user.routes.js`, `src/routes/folder.routes.js`, `src/routes/file.routes.js`, `src/app.js` - apply session/CSRF/Origin middleware to protected mutation routes and enable credentialed CORS.
- `public/js/app.js`, `public/index.html`, `.env.example`, `README.md`, `src/config/swagger.js`, `src/config/swagger-docs.js`, `package.json`, `package-lock.json` - cookie/CSRF frontend flow, logout/session-expiry handling, invitation input, session/API documentation, and removal of the obsolete JWT dependency.
- `test/phase3.test.js` - session revocation, inactive-user rejection, CSRF/Origin rejection, password policy, and static contract coverage for hash-only persistence, invitation locking, client storage removal, and password session revocation.

- `database/migrations/001-create-core-schema.js`, `database/migrations/002-phase2-schema.js`, `scripts/migrate.js` - forward-only bootstrap/upgrade migrations and migration-status runner.
- `src/models/*.js`, `src/models/index.js`, `src/utils/bigint.js` - Phase 2 schema models, associations, and exact BIGINT serialization.
- `src/services/file.service.js`, `src/services/folder.service.js` - legacy multipart-created metadata is explicitly unverified rather than completed.
- `docs/MIGRATIONS.md`, `package.json`, `test/phase2.test.js` - operational instructions, commands, and static contract tests.

- `src/services/file.service.js`, `src/config/aws.js`, `src/config/validate-config.js`, `src/server.js` - S3 failure semantics, provider-chain configuration, production validation, and fail-closed DB startup.
- `src/app.js`, `src/utils/response.js`, `src/utils/app-error.js`, `src/middleware/request-id.middleware.js`, `src/middleware/error.middleware.js`, `src/middleware/auth.middleware.js` - request IDs and safe standardized errors.
- `src/middleware/validation.middleware.js`, `src/middleware/upload.middleware.js`, `src/routes/file.routes.js`, `src/routes/folder.routes.js` - request/input validation.
- `public/js/app.js` - safe file/folder name rendering.
- `src/utils/jwt.js`, `.env.example` - removed default secret and documented IAM/default AWS credentials.
- `package.json`, `test/phase1.test.js` - Node test command and Phase 1 tests.

## Verification performed

| Command/check | Result |
| --- | --- |
| `node --check src/services/auth.service.js src/services/session.service.js src/controllers/auth.controller.js src/middleware/csrf.middleware.js public/js/app.js` | Passed. |
| `npm test` | Passed: 13/13 tests, including Phase 3 session/CSRF/password/invitation contracts. The expected Phase 1 S3 failure-injection logs appeared. Initial sandbox execution was blocked by `spawn EPERM`; the same command passed outside the sandbox. |
| `git diff --check` | Passed. |

| Command/check | Result |
| --- | --- |
| `npm test` | Passed: 5/5 tests (S3 upload/delete/presign failure, invalid input, safe name rendering). Failure-injection logs are expected during these tests. |
| `node --check src/server.js src/services/file.service.js src/middleware/validation.middleware.js public/js/app.js` | Passed. |
| Production config validation with a non-secret in-memory environment object | Passed: missing configuration rejects and a complete configuration is accepted. |
| `git diff --check` | Passed. |
| `npm test` | Passed: 7/7 tests, including Phase 2 BIGINT boundary and versioned-migration static contracts. Expected S3 failure-injection logs were emitted by Phase 1 tests. |
| MySQL/AWS/browser/deployment validation | Not run: no real MySQL/AWS environment was accessed, and no browser E2E environment was configured. |
| MySQL migration integration (clean DB, legacy sample-data upgrade, FK/index and rerun checks) | Not run: the task prohibits access to the configured real database and no disposable MySQL test database is available. |

## Known limitations / not completed

- MySQL integration was not run. In particular, a disposable database should verify the invitation transaction under concurrent registration requests, cookie/session persistence, session revocation after password change, and migration compatibility before production use.
- Browser E2E testing was not run; verify HTTPS production cookie behavior and the configured `APP_ORIGIN` behind the actual reverse proxy. `TRUST_PROXY=true` is required only when that proxy is trusted.
- The login limiter is intentionally process-local for this single-instance phase. If a later deployment becomes multi-instance, replace it with an explicitly designed shared limiter as part of that deployment work; no Redis was added here.

- The legacy upload remains server-memory multipart upload. A 50 MiB request still traverses the API process; it has no upload session, quota reservation, direct-to-S3 transfer, content-byte validation, or S3 version binding.
- If metadata persistence fails after a successful S3 upload, an orphan S3 object can remain; reconciliation is deferred to later phases. Conversely, deleting S3 first preserves metadata on S3 failure, but no retry job exists yet - the client/operator must retry the delete request.
- Legacy multipart uploads now create `LEGACY_UNVERIFIED` metadata. The route still bypasses the future direct-upload, quota reservation, validation, and version-binding workflow; it must be replaced in the designated later phases.
- Quota services, trash/restore APIs, worker/Lambda, and operational deployment remain for later phases. The legacy upload lifecycle remains intentionally outside Phase 4.

## Historical prerequisites for Phase 3

- Run clean-DB and legacy sample-data migration rehearsals against a disposable MySQL database, including FK/index and repeat-run verification.
- Resolve any detected cross-owner legacy folder/file references through a reviewed data migration before applying Phase 2 to production.
- Confirm the invitation/pre-provisioning workflow before Phase 3 sessions/registration work.

## Conditions to start Phase 5

- Rehearse Phase 2/3 migrations and concurrent invitation consumption on a disposable MySQL database, then review the result before applying to production.
- Configure a production HTTPS origin (`APP_ORIGIN`) and validate cookie, CSRF, logout, password-revocation, and inactive-account browser flows through the deployed proxy.
- Apply and rehearse migration `003-phase4-listing-indexes` on a disposable MySQL database; concurrently exercise create/move/delete on the same folder to confirm InnoDB locking under the deployment's isolation settings.
- Preserve Phase 4 ownership, cursor, and audit rules while implementing only the next approved phase.
