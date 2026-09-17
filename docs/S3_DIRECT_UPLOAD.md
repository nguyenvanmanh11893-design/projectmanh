# Direct S3 upload (Phase 5B)

`POST /api/uploads` creates the quota reservation and returns a browser POST contract. The API, not the browser, selects `incoming/{user_id}/{upload_id}` and the configured bucket. The browser must submit the returned `url` and every returned `fields` entry unchanged, plus the file as the final multipart field. It must then read the object version ID and send only that `versionId` to `POST /api/uploads/{id}/complete`.

The server generates a five-minute-or-less policy with these constraints:

- exact configured bucket and exact session key;
- exact declared `Content-Type`;
- `content-length-range` whose lower and upper values both equal the reserved byte count;
- exact `success_action_status=201` and corresponding signed fields.

The POST policy is an authorization that can be replayed during its short lifetime; it is **not** a single-use token. Completion is the one-time, version-bound operation: it HEADs the exact key and supplied version, checks size and type, and atomically binds the first accepted version. Repeating completion with that version succeeds; another version conflicts. A successful completion leaves the session `UPLOADED` (waiting for Phase 6 validation), never `READY`.

## Bucket CORS

Configure CORS on the private upload bucket for the real frontend origin(s), not `*` in production. The POST response must expose S3's version header so browser code can obtain the exact version to complete:

```json
[
  {
    "AllowedOrigins": ["https://app.example.com"],
    "AllowedMethods": ["POST"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["x-amz-version-id", "ETag"],
    "MaxAgeSeconds": 300
  }
]
```

S3 bucket versioning must be enabled. If a browser/runtime does not expose `x-amz-version-id` for a POST response, the client cannot safely call complete; retain the upload session and request a fresh POST only while it remains unexpired. Do not synthesize a version ID, accept a key/bucket from the client, or use a current-object HEAD without `VersionId`.

## Storage adapter contract

`src/services/s3-storage.adapter.js` is the only AWS boundary used by Phase 5B. It exposes `createDirectUploadPost({ key, contentType, contentLength, expiresInSeconds })` and `headObject({ key, versionId })`, where HEAD returns `{ contentLength, contentType }`. Unit tests inject this interface; no AWS credentials, bucket, or network access are needed for their business-rule coverage.

## Legacy multipart endpoint removal

`POST /api/files/upload` returns `410 LEGACY_UPLOAD_DEPRECATED` with a `Link: </api/uploads>; rel="successor-version"` header as of Phase 5B. It no longer invokes Multer or the legacy S3 write service, so it cannot bypass reservation or validation. Keep this compatibility response through the Phase 8 frontend migration, then remove the route and its unused multipart dependencies after a separately approved client-usage review.
