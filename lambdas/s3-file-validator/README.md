# S3 file-validator Lambda (Phase 6A)

This standalone Node Lambda has no Express, Sequelize, or RDS dependency. Configure an S3 `ObjectCreated` notification filtered to prefix `incoming/`; never configure it for `processing-results/`, which prevents a report-trigger loop. Bucket versioning is mandatory because every read uses the event's exact `versionId`.

The Lambda accepts at most 50 MiB and identifies PDF, JPEG, and PNG from basic signatures. PDF additionally requires a `%%EOF` marker; JPEG requires SOI/EOI markers; PNG requires its eight-byte signature. Plain text must be valid UTF-8 (an optional UTF-8 BOM is accepted), contain no NUL byte, and contain no C0 controls other than tab, LF, and CR. It does not execute, decompress, or render a file, and it is not antivirus software.

Reports conform to [`contracts/validator-report-v1.schema.json`](../../contracts/validator-report-v1.schema.json), are JSON-only, contain no file content or credentials, and use deterministic SHA-256 IDs based on `bucket`, decoded `key`, `versionId`, and `s3-file-validator/1`. They are written as `processing-results/{report_id}.json`; duplicate events therefore target the same report key. Different S3 versions produce different report IDs.

AWS SDK and stream failures are intentionally allowed to throw from the handler so Lambda/S3 retry policy can handle them. Only a completed content inspection produces a `REJECTED` report.
