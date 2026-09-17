# File lifecycle and reconciliation (Phase 7)

## API lifecycle

- `DELETE /api/files/{id}` moves an owned `READY` file to `TRASHED`. It does not call S3 and does not reduce `used_bytes`.
- `GET /api/files/trash` lists owned `TRASHED`/`PURGE_PENDING` files with status/search/folder filters and opaque cursor pagination.
- `POST /api/files/{id}/restore` restores only `TRASHED` files. The transaction locks the purge job before the file; if purge has already changed the file to `PURGE_PENDING`, restore returns conflict.
- `DELETE /api/files/{id}/permanent` changes a trashed file to `PURGE_PENDING`, makes its durable purge job due immediately, and returns HTTP 202 while work is pending.

Trash creates one deduplicated `PURGE_FILE` job due seven days after `trashed_at`. Restoring fences that job. Trashing the same restored file again reuses and reschedules it rather than creating a second job. Download still selects only `READY`, so trash and purge-pending files cannot receive a URL.

## Versioned S3 purge

The purge worker validates the tombstone key as exactly `objects/{user_id}/{file_id}`. Outside a database transaction it paginates `ListObjectVersions` for that exact key, includes ordinary versions, delete markers, and a literal `null` version, and submits explicit `(Key, VersionId)` identifiers to `DeleteObjects` in batches of at most 1000.

Every requested identifier must appear in S3's `Deleted` result. `Errors` and omitted/unconfirmed identifiers make the attempt fail. A retry inventories the exact key again, so versions already deleted by a partially successful batch do not block progress. After deletion, the worker lists the key again. Only an empty confirmed inventory permits the final transaction to subtract `file_size` once, set `PURGED`/`purged_at`, detach the row from its former folder, retain the metadata tombstone, write audit, and succeed the leased job. S3 or database ambiguity leaves quota charged and the tombstone retryable.

Required worker IAM operations for this phase are scoped to `objects/`: `s3:ListBucketVersions` with the prefix constraint and `s3:DeleteObjectVersion`. No bare-key delete is used for versioned files.

## Upload expiry and reconciliation

Migration 006 backfills `EXPIRE_UPLOAD_SESSION` jobs for active sessions. The periodic `RECONCILE` job schedules missing expiry jobs for new sessions and records uploads which remain `UPLOADED` beyond `STALLED_UPLOAD_MINUTES`; it also restores a missing finalization job using its existing dedupe key. Expiry and finalization both lock user then session after their own leased job, so exactly one transition releases or commits the reservation.

Quota reconciliation locks each user and derives counters from source rows:

- `used_bytes`: files in `READY`, `TRASHED`, or `PURGE_PENDING`;
- `reserved_bytes`: sessions in `RESERVED`, `UPLOADING`, or `UPLOADED`.

Mismatches are corrected transactionally and recorded in `reconciliation_findings` without copying secrets or object URLs.

The worker alone scans `objects/` in bounded, paginated passes. An unreferenced `(key, version_id)` is first recorded as `CANDIDATE`. It must be observed again after `ORPHAN_GRACE_HOURS` (minimum 24 hours) and rechecked against current file metadata before becoming `CONFIRMED`. `ORPHAN_CLEANUP_MODE=report-only` is the default and never deletes these objects. The explicit `delete` mode deletes only the exact confirmed version after that recheck. No request handler scans the bucket.

## Operational limits

- Reconciliation and expiry tests use injected storage/database fixtures; real InnoDB lock scheduling and real S3 version/delete-marker responses still require environment acceptance.
- A `DEAD` purge job retains its file tombstone and quota charge. Repair the S3/IAM fault, inspect `last_error`, then deliberately re-request permanent deletion to reset the bounded attempt count.
- `LEGACY_UNVERIFIED` rows have no trustworthy object-version binding and cannot enter the Phase 7 trash/purge API. They require a separately reviewed legacy inventory/migration; the API does not perform an unsafe bare-key permanent delete for them.
- Do not apply a blanket S3 lifecycle expiry to `objects/`; it would bypass database quota/tombstone ordering.
