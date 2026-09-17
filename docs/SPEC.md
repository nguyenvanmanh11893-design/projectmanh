# Cloud File Management System — Specification

## 1. Scope and product decisions

This product is a **multi-user personal file-management system**. The approved initial scope is limited to groups A/B:

- authentication, server-side ownership enforcement, folder CRUD, file rename/move, pagination and search;
- direct upload, quota, trash/restore, audit trail;
- Lambda validation, retry/reconciliation and monitoring;
- backup/restore and repeatable deployment.

Explicitly out of scope: public sharing, thumbnails, collaboration, password-reset email, antivirus, and multipart upload.

## 2. Product limits

| Rule | Decision |
| --- | --- |
| Maximum file size | 50 MiB |
| Default storage quota | 1 GiB per user |
| Active upload sessions | Maximum 3 per user |
| Accepted formats | PDF, JPEG, PNG, TXT |
| Folder depth | Maximum 10 levels |
| Trash retention | 7 days; trashed files still consume quota |
| Pagination | Default 25; maximum 100 |
| Folder deletion | Only if it has no files, including trashed files, and no child folders |
| Registration | Invitation code or a pre-provisioned account only |
| Naming | File and folder names may repeat; UUID is the identifier |

## 3. Target architecture

- Express modular monolith, Sequelize, and MySQL; preserve the existing static frontend.
- Authentication uses an HttpOnly session cookie (`Secure` in production, `SameSite=Lax`). The database stores only a session-token hash. State-changing browser requests require CSRF protection.
- One EC2 instance runs Nginx, API/static frontend, and the worker. RDS is Single-AZ in a private subnet. This first deployment has no high availability.
- S3 is private, versioned, and uses `incoming/`, `objects/`, and `processing-results/` prefixes.
- Browser upload is direct to S3 using a presigned POST. Lambda, outside the VPC, validates the exact S3 object version and writes a report to S3. The worker reads the report, copies an accepted version to `objects/`, then updates database state and quota.
- SQS is Lambda's failure destination only. Application jobs are stored in RDS.
- Do not introduce NAT Gateway, ECS, DynamoDB, API Gateway, Redis, or microservices in this release.

## 4. Integrity and security invariants

- Every resource action checks ownership on the server; client-provided user identity never authorizes access.
- A file is never `READY` before validation and finalization both succeed.
- Complete/finalize/purge operations are idempotent.
- Quota changes use a transaction and row locking. Metadata and quota are not removed before S3 purge succeeds.
- Download authorizes the owner, pins the requested S3 `versionId`, uses a short-lived URL, and forces attachment disposition. There is no public URL fallback.
- Schema changes use migrations. Application startup must not invoke `sequelize.sync`.
- No hard-coded AWS access key, default secret, or production mock fallback is permitted.

## 5. Baseline: verified from repository (not runtime-tested)

- `package.json` declares Node ESM, Express 4, Sequelize 6, MySQL2, AWS SDK S3, JWT, Multer, Swagger, and no test command.
- `src/app.js` mounts static frontend, Swagger, `/api/auth`, `/api/users`, `/api/folders`, and `/api/files`.
- UUID primary keys are defined for users, folders, and files in `src/models/User.js`, `Folder.js`, and `File.js`.
- Existing service queries generally include `user_id` for folder/file lookup and destination-folder checks (for example `src/services/folder.service.js:17-19`, `src/services/file.service.js:94-100`, and `:181-185`).
- Existing frontend is static HTML/CSS/JavaScript and currently sends a Bearer token from the browser.
- The SQL initializer creates only `users`, `folders`, and `files`; the deployment guide describes EC2/Nginx/PM2 but currently pairs it with local MySQL.

These are source-level observations only. No MySQL, S3, Lambda, EC2, RDS, Nginx, or browser workflow was exercised during Phase 0.

## 6. Baseline gaps and risks (verified source references)

| Area | Finding |
| --- | --- |
| Sessions and CSRF | JWT is returned in JSON (`src/services/auth.service.js:92-105`) and accepted from an Authorization header (`src/middleware/auth.middleware.js:11-30`); session storage, cookies, logout/revocation, and CSRF protection do not exist. |
| Registration policy | Public registration is mounted at `src/routes/auth.routes.js:6` and accepts no invitation/pre-provisioning control (`src/controllers/auth.controller.js:4-8`). |
| Startup migrations | `sequelize.sync({ alter: false })` is called at `src/server.js:13-18`; no migration framework/directory exists. |
| Secrets/configuration | Default mock AWS keys are present in `src/config/aws.js:3-15`; a default JWT secret is present at `src/utils/jwt.js:3`. The deployment guide contains credential-shaped examples at `deployment/AWS_EC2_DEPLOYMENT.md:62-80`; future docs must instead refer to environment-variable names and IAM roles. |
| Upload path | Multer keeps uploads in server memory (`src/middleware/upload.middleware.js:3-10`) and `/upload` receives multipart through the API (`src/routes/file.routes.js:9`), rather than direct presigned POST. |
| File validation | Only a size limit is set; MIME/extension allowlisting for PDF/JPEG/PNG/TXT is absent (`src/middleware/upload.middleware.js:4-11`, `src/services/file.service.js:30-33`). |
| Validation lifecycle | Upload suppresses S3 errors then creates `completed` metadata (`src/services/file.service.js:39-62`). No incoming/version/report/Lambda/worker lifecycle exists; current enum lacks READY/failed/trashed states (`src/models/File.js:44-48`). |
| Quota/concurrency | No user quota fields, upload-session model, transactional locking, or per-user active-session limit exists. |
| Trash/purge | Delete catches S3 failure and deletes metadata anyway (`src/services/file.service.js:218-226`); it is permanent rather than 7-day trash and not safe for purge retry. |
| Folders | Parent ownership is checked but depth is unrestricted (`src/services/folder.service.js:15-32`). Deletion destroys directly (`:118-135`) despite model/SQL cascade and `SET NULL` relations (`src/models/index.js:15-20`), so the specified empty-only rule is not enforced. |
| Listing | File and folder listing has no pagination/search (`src/controllers/file.controller.js:16-20`, `src/services/file.service.js:70-87`, `src/services/folder.service.js:40-47`). |
| Download | URL lasts one hour (`src/services/file.service.js:108-120`), does not supply `versionId`, and returns a public S3 URL on signing failure (`:122-130`). |
| Audit/jobs/operations | No audit, application-job, reconciliation, backup/restore, monitoring, Lambda, SQS, IaC, worker, or RDS deployment modules were found. |
| Deployment | The guide documents MySQL installed on EC2 and an HTTP-only proxy (`deployment/AWS_EC2_DEPLOYMENT.md:28-42`, `:103-117`), which conflicts with the target private RDS, worker, and repeatable secure deployment. |

## 7. Open assumptions to validate before implementation

- Existing database data and the actual MySQL schema version were not connected or inspected at runtime.
- S3 bucket versioning, policies, CORS, event routing, and IAM roles are unknown.
- No AWS account, DNS/TLS, VPC, RDS, EC2, Lambda, SQS, monitoring, or backup configuration was inspected.
- Browser compatibility and the current frontend workflow were not manually tested.
- The intended definition of groups A and B beyond the supplied feature list is not documented in the repository.

