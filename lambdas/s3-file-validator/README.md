# S3 file-validator Lambda (Phase 6A)

This standalone Node Lambda has no Express, Sequelize, or RDS dependency. Configure an S3 `ObjectCreated` notification filtered to prefix `incoming/`; never configure it for `processing-results/`, which prevents a report-trigger loop. Bucket versioning is mandatory because every read uses the event's exact `versionId`.

The Lambda accepts at most 50 MiB and identifies PDF, JPEG, and PNG from basic signatures. PDF additionally requires a `%%EOF` marker; JPEG requires SOI/EOI markers; PNG requires its eight-byte signature. Plain text must be valid UTF-8 (an optional UTF-8 BOM is accepted), contain no NUL byte, and contain no C0 controls other than tab, LF, and CR. It does not execute, decompress, or render a file, and it is not antivirus software.

Reports conform to [`contracts/validator-report-v1.schema.json`](../../contracts/validator-report-v1.schema.json), are JSON-only, contain no file content or credentials, and use deterministic SHA-256 IDs based on `bucket`, decoded `key`, `versionId`, and `s3-file-validator/1`. They are written as `processing-results/{report_id}.json`; duplicate events therefore target the same report key. Different S3 versions produce different report IDs.

AWS SDK and stream failures are intentionally allowed to throw from the handler so Lambda/S3 retry policy can handle them. Only a completed content inspection produces a `REJECTED` report.

## Runtime contract

- Runtime target: Node.js 22, ES modules.
- Handler: `index.handler`.
- Configuration: `AWS_REGION`; bucket/key/version come from each S3 event record.
- Event source: versioned S3 `ObjectCreated` events restricted to `incoming/`.
- Output: `application/json` reports under `processing-results/` in the same bucket.
- Failure behavior: infrastructure/stream errors throw a sanitized `VALIDATION_FAILED` error so the configured Lambda retry and failure destination can handle the event.

The execution role must be limited to reading exact incoming object versions and writing validation reports. It does not require database, Parameter Store, or application-object write access.

## Test

From the repository root:

```sh
node --test backend/test/phase6a.test.js
```

The test suite covers accepted/rejected content, the size boundary, version requirements, deterministic report IDs, output-prefix isolation, and injected storage failures without contacting AWS.

## Packaging and deployment

The Lambda is deployed as a reviewed ZIP containing `index.js`, `validator.js`, an ES-module `package.json`, and locked dependencies. Do not include `.env`, credentials, application data, or the repository as a whole. See the [Phase 9 deployment runbook](../../deployment/phase9/README.md#local-preparation-no-aws-writes) for the authoritative packaging procedure, infrastructure assumptions, IAM boundaries, failure queue, and live acceptance gates.
