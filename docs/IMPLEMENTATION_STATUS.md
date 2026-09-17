# Implementation Status

## Current phase

**Phase 1 - Correctness and backend foundation: complete (source and unit-test scope).** No database schema, migration, session, quota, Lambda, or direct-upload work was added.

## Completed

- Preserved the multipart-to-Express upload route, but S3 upload failures now return `STORAGE_UPLOAD_FAILED` and prevent creation of `completed` file metadata.
- S3 delete failures return `STORAGE_DELETE_FAILED` and preserve metadata. Presign failures return `STORAGE_PRESIGN_FAILED`; the public S3 URL fallback is removed.
- Removed mock AWS credentials, bucket fallback, and JWT-secret fallback. The S3 client uses the AWS SDK default credential provider chain. Production startup validates required database, JWT, region, and bucket configuration before connecting.
- Startup does not bind the HTTP server unless MySQL authentication succeeds, and no longer calls `sequelize.sync()`.
- Added per-request UUID request IDs (`X-Request-Id` and response `request_id`), stable API error codes, and safe client responses that omit stack traces and internal AWS/SQL details.
- Added route validation for UUIDs, names/body types and lengths, upload folder IDs, and supplied pagination inputs. Multipart upload rejects MIME types outside PDF, JPEG, PNG, and TXT.
- Changed file/folder display names to DOM `textContent`, avoiding interpolation of user-controlled names into HTML.
- Added the built-in Node test runner and `npm test` command, with focused failure-injection and validation/XSS coverage.

## Files changed

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
| MySQL/AWS/browser/deployment validation | Not run: no real MySQL/AWS environment was accessed, and no browser E2E environment was configured. |

## Known limitations / not completed

- The legacy upload remains server-memory multipart upload. A 50 MiB request still traverses the API process; it has no upload session, quota reservation, direct-to-S3 transfer, content-byte validation, or S3 version binding.
- If metadata persistence fails after a successful S3 upload, an orphan S3 object can remain; reconciliation is deferred to later phases. Conversely, deleting S3 first preserves metadata on S3 failure, but no retry job exists yet - the client/operator must retry the delete request.
- Files are marked `completed` immediately after the legacy upload; Lambda validation/finalization and the `READY` lifecycle do not exist until later phases. S3 DeleteObject version semantics are also not implemented.
- JWT bearer tokens/localStorage, public registration, folder empty-only/depth rules, list pagination implementation, search, quotas, trash, migrations, sessions/CSRF, audit, worker/Lambda, and operational deployment remain out of this phase.

## Conditions to start Phase 2

- Provide a non-production MySQL database or approved test-database strategy for forward/upgrading migration tests.
- Preserve existing data and agree on the migration/backfill rules; `database/cloud_file_manager.sql` is destructive and must not be used for upgrades.
- Confirm the invitation/pre-provisioning workflow before Phase 3 sessions/registration work.
