# Database migrations (Phase 2)

`database/cloud_file_manager.sql` is a legacy local-development initializer and contains `DROP TABLE` statements. It must never be used to upgrade an existing database.

The forward-only migration runner records applied versions in `schema_migrations`.

```powershell
npm run db:migrate
npm run db:status
```

For a new database, migrations `001-create-core-schema` and `002-phase2-schema` create the entire schema. For an existing database containing the legacy `users`, `folders`, and `files` tables, migration 001 detects the tables and records the baseline without recreating them; migration 002 then applies the additive/altering Phase 2 changes. There is no down command: restoring a backup is the rollback plan for a schema migration.

Do not point these commands at production until a backup and a non-production upgrade rehearsal have completed. The runner uses the configured Sequelize database connection; it does not invoke `sequelize.sync`.

## Backfill and compatibility rules

- Legacy `files.status` values `completed`, `uploading`, and `deleted` are converted once to `LEGACY_UNVERIFIED`.
- No migration checks S3, and no legacy row is marked `READY`, Lambda-validated, or S3-version-bound.
- `users.used_bytes` and `users.reserved_bytes` start at `0`; `quota_bytes` starts at `1073741824` (1 GiB). This intentionally avoids treating unverified historical metadata as billable S3 usage. A later reconciliation job may establish a verified usage total.
- Before adding composite ownership foreign keys, the migration checks for cross-owner parent/file references. If it finds any, it aborts before schema changes; correct those rows with an explicit, reviewed data migration rather than silently reassigning ownership.

## Folder ownership foreign keys

`folders` has unique key `(user_id, id)`. `files(user_id, folder_id)` and `upload_sessions(user_id, folder_id)` reference it, so a non-null folder must belong to the same user. `folder_id` remains nullable for root files/uploads: in MySQL, a composite foreign key containing a NULL component is not checked, while the non-null `user_id` continues to reference `users`. The old single-column `files.folder_id` FK is replaced by this composite relation. Its delete action is `RESTRICT`: `SET NULL` would also attempt to null the non-null `user_id` in a composite FK, and the later empty-folder rule already requires deletion to be rejected when files exist.

## BIGINT contract

All byte fields are MySQL `BIGINT UNSIGNED`. Sequelize model getters serialize them as base-10 strings and setters reject unsafe JavaScript numbers; callers must use decimal strings for values above `Number.MAX_SAFE_INTEGER`. JSON therefore never rounds a quota or file size.

## Phase 7 migration

Migration `006-phase7-lifecycle-reconciliation` is additive and restartable after partial MySQL DDL. It adds `files.purged_at`, trash/reference indexes, and `reconciliation_findings`; then it uses dedupe keys to backfill expiry jobs for active upload sessions, seven-day purge jobs for existing trash, and the singleton periodic reconciliation job.

Stop both API and worker before applying it. Rehearse on a disposable database first, including a rerun after an intentionally interrupted DDL step. The migration does not contact S3, purge a file, adjust quota, or delete an orphan.

## Phase 10A correlation migration

Migration `007-phase10a-correlation` adds nullable `jobs.request_id`; it is restartable and does not backfill or alter business state. Old/scheduled jobs remain nullable, and existing applications tolerate the additional column. Rehearse on disposable MySQL before release. The CD workflow runs migrations separately with services stopped. `node backend/scripts/migrate.js check` is a read-only gate that exits nonzero for missing/pending migrations; it never creates schema_migrations or applies DDL. Runtime needs SELECT on that table.

Application rollback does not reverse DDL/backfills. See [delivery and rollback limits](OBSERVABILITY_CICD.md) and [incident runbooks](RUNBOOKS.md). No live migration was performed in Phase 10A.
