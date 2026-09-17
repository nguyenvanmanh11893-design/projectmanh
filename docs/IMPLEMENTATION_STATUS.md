# Implementation Status

## Current phase

**Phase 2 - Schema and migration: implemented (source/static-test scope).** No MySQL instance was accessed in this phase, so database integration validation remains pending.

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
| `npm test` | Passed: 5/5 tests (S3 upload/delete/presign failure, invalid input, safe name rendering). Failure-injection logs are expected during these tests. |
| `node --check src/server.js src/services/file.service.js src/middleware/validation.middleware.js public/js/app.js` | Passed. |
| Production config validation with a non-secret in-memory environment object | Passed: missing configuration rejects and a complete configuration is accepted. |
| `git diff --check` | Passed. |
| `npm test` | Passed: 7/7 tests, including Phase 2 BIGINT boundary and versioned-migration static contracts. Expected S3 failure-injection logs were emitted by Phase 1 tests. |
| MySQL/AWS/browser/deployment validation | Not run: no real MySQL/AWS environment was accessed, and no browser E2E environment was configured. |
| MySQL migration integration (clean DB, legacy sample-data upgrade, FK/index and rerun checks) | Not run: the task prohibits access to the configured real database and no disposable MySQL test database is available. |

## Known limitations / not completed

- The legacy upload remains server-memory multipart upload. A 50 MiB request still traverses the API process; it has no upload session, quota reservation, direct-to-S3 transfer, content-byte validation, or S3 version binding.
- If metadata persistence fails after a successful S3 upload, an orphan S3 object can remain; reconciliation is deferred to later phases. Conversely, deleting S3 first preserves metadata on S3 failure, but no retry job exists yet - the client/operator must retry the delete request.
- Legacy multipart uploads now create `LEGACY_UNVERIFIED` metadata. The route still bypasses the future direct-upload, quota reservation, validation, and version-binding workflow; it must be replaced in the designated later phases.
- JWT bearer tokens/localStorage, public registration, folder empty-only/depth rules, list pagination implementation, search, quota services, trash APIs, sessions/CSRF, audit APIs, worker/Lambda, and operational deployment remain out of this phase.

## Conditions to start Phase 3

- Run clean-DB and legacy sample-data migration rehearsals against a disposable MySQL database, including FK/index and repeat-run verification.
- Resolve any detected cross-owner legacy folder/file references through a reviewed data migration before applying Phase 2 to production.
- Confirm the invitation/pre-provisioning workflow before Phase 3 sessions/registration work.
