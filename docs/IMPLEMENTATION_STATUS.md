# Implementation Status

## Current phase

**Phase 4 - File/folder business APIs: implemented (unit/static-test scope).** No MySQL instance, browser E2E environment, or AWS environment was accessed in this phase.

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
