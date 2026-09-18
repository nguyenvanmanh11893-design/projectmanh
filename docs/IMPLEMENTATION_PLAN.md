# Implementation Plan and Acceptance Checklists

## Delivery principles

Implement only the approved A/B scope in incremental phases. Preserve Express, Sequelize, MySQL, and the current frontend. Each phase adds migrations and automated tests before dependent work begins. No phase uses `sequelize.sync` at startup, public S3 objects, or client-side authorization.

The detailed delivery sequence below is authoritative. Phases 5, 6, and 10 are intentionally split into A/B subphases; each subphase must meet its own acceptance checklist before its successor starts. A checked item requires evidence from an executed test, review, or environment validation; a planned test is not evidence of completion.

## PHASE 1 — CORRECTNESS VÀ BACKEND FOUNDATION

Đọc docs/SPEC.md. Chưa thay cơ chế upload hiện tại sang direct upload.

Thực hiện:
1. Upload S3 lỗi phải trả lỗi, không tạo file completed.
2. Xóa S3 lỗi phải giữ metadata để có thể retry.
3. Bỏ public URL fallback khi tạo presigned download thất bại.
4. Bỏ mock AWS credentials và secret mặc định.
   Dùng AWS SDK default credential provider chain.
5. Validate cấu hình cần thiết; production thiếu cấu hình phải fail startup.
6. Không chạy server trong trạng thái DB không kết nối được rồi báo healthy.
7. Chuẩn hóa error code, request_id và production error response.
   Không trả stack trace, SQL hoặc AWS error nội bộ cho client.
8. Validate UUID, string length, kiểu dữ liệu và pagination input.
9. Sửa render tên file/folder bằng DOM textContent, không nội suy vào HTML.
10. Thiết lập test runner và test command phù hợp với project hiện tại.

Chỉ viết test tập trung:
- S3 upload thất bại không tạo metadata completed.
- S3 delete thất bại không xóa metadata.
- Presign lỗi không trả public URL.
- Input sai được từ chối.
- Tên chứa HTML không trở thành markup thực thi.

Không triển khai session mới, quota, migration hoặc Lambda trong phase này.
Báo cáo rõ các rủi ro còn tồn tại của luồng upload cũ.

## PHASE 2 — SCHEMA VÀ MIGRATION

Đọc docs/SPEC.md và schema hiện có.

Thực hiện:
1. Thêm migration có version, không dùng script DROP TABLE cho upgrade.
2. Bỏ sequelize.sync khỏi startup.
3. Giữ tương thích dữ liệu hiện tại hoặc cung cấp migration chuyển đổi rõ ràng.
4. Bổ sung model/migration:
   - sessions;
   - upload_sessions;
   - jobs;
   - audit_events;
   - invitations.
5. Bổ sung users:
   quota_bytes, used_bytes, reserved_bytes.
6. Bổ sung files:
   trạng thái mới, s3_version_id, detected_mime_type,
   trashed_at, purge_requested_at và dữ liệu cần thiết theo SPEC.
7. Bổ sung index cho listing, upload hết hạn và job polling.
8. Thêm ràng buộc bảo vệ quan hệ ownership folder/file.
   Giải thích cách xử lý FK với folder_id nullable.
9. Các giá trị BIGINT phải được xử lý an toàn khi chuyển giữa MySQL,
   JavaScript và JSON.
10. Tạo lệnh migration/status và hướng dẫn bootstrap DB mới.

Trước khi backfill dữ liệu:
- completed cũ không tự động chứng minh object S3 tồn tại;
- không tự xác nhận file cũ đã được Lambda kiểm tra;
- quota cũ phải được tính từ dữ liệu có quy tắc rõ ràng.

Test:
- Migrate một DB mới.
- Migrate schema hiện tại với dữ liệu mẫu.
- Bảo toàn users/folders/files.
- Foreign key/index hoạt động.
- Migration không chạy lại logic backfill ngoài ý muốn.

Không truy cập DB thật từ .env.
Không chạy migration phá hủy dữ liệu.

## PHASE 3 — SERVER-SIDE SESSION AUTHENTICATION

Thay JWT/localStorage authentication bằng session theo docs/SPEC.md.

Backend:
- Sinh opaque session token đủ entropy bằng crypto.
- Chỉ lưu hash token trong DB.
- Cookie HttpOnly, SameSite=Lax, Secure khi production.
- Session có hạn dùng và cơ chế thu hồi.
- Login tạo session mới.
- Logout thu hồi session phía server và xóa cookie.
- Đổi mật khẩu thu hồi các session hiện có.
- Middleware kiểm tra session và user.is_active ở mỗi request.
- CSRF token cho request thay đổi dữ liệu, kèm Origin validation.
- Login có rate limiting theo IP và tài khoản.
- Password policy rõ ràng; nếu giữ bcrypt, xử lý giới hạn 72 byte,
  không âm thầm chấp nhận mật khẩu bị truncate.
- Đăng ký cần invitation token một lần, DB giữ hash token.
- Consume invitation và tạo user trong cùng transaction.
- Không có admin bypass đọc file người khác.

Frontend:
- Bỏ đọc/ghi token vào localStorage.
- Cập nhật apiFetch để dùng session cookie và CSRF token.
- Đăng nhập/đăng xuất vẫn hoạt động.
- Xử lý session hết hạn.

Test:
- Logout làm session mất hiệu lực.
- Đổi password vô hiệu hóa session cũ.
- User bị khóa không dùng session tiếp được.
- CSRF request bị từ chối.
- Invitation không dùng được hai lần.
- Không có session token plaintext trong DB/log.
- Chống enumeration trong thông báo login.

Chưa làm UI mới ngoài phần cần để auth tiếp tục hoạt động.

## PHASE 4 — FILE/FOLDER BUSINESS APIs

Triển khai:
1. Folder create/list/detail/rename/delete.
2. Giới hạn folder tree 10 cấp.
3. Chỉ xóa folder rỗng; file trong trash cũng làm folder không rỗng.
4. File list/search/sort/rename/move.
5. Ownership trên cả file và folder đích.
6. Cursor pagination, default 25, max 100.
7. Sort fields được allowlist, có id làm tie-breaker.
8. Query search có giới hạn độ dài và parameter binding.
9. Rename/move chỉ cập nhật metadata, không đổi S3 key.
10. Audit cho mutation và kết quả quan trọng.
11. GET /api/activity chỉ trả event của chính user.
12. Cập nhật OpenAPI theo API thực tế.

Tránh race condition giữa:
- tạo/move file vào folder;
- xóa folder;
- kiểm tra folder rỗng.

Test:
- User A không thao tác tài nguyên user B.
- Pagination không lặp khi dữ liệu tĩnh có nhiều giá trị sort bằng nhau.
- Folder cấp 11 bị từ chối.
- Delete folder không rỗng trả 409.
- Move sang folder khác user bị từ chối.
- Tên trùng được phép.
- Audit không chứa secret.

Không thêm folder move, recursive delete hoặc public sharing.

## PHASE 5A — QUOTA VÀ UPLOAD SESSION

Triển khai:
- POST /api/uploads.
- GET /api/uploads/:id.
- GET /api/storage/usage.
- Service reserve/release/commit quota.

Quy tắc:
- quota mặc định 1 GiB, file tối đa 50 MiB.
- Tối đa 3 session chưa kết thúc/user.
- used + reserved + requested <= quota.
- Dùng transaction và row locking.
- Reserve/commit/release phải idempotent.
- Session có expires_at và trạng thái rõ ràng.
- File PENDING không được download.
- Ownership folder đích được kiểm tra.

POST /api/uploads yêu cầu Idempotency-Key:
- Cùng key và cùng payload trả lại session.
- Cùng key nhưng payload khác trả 409.
- Không giữ quota hai lần.

Test bằng MySQL test thật cho concurrency:
- Hai request không cùng vượt quota.
- Request retry không tăng reserved hai lần.
- Release hai lần không làm counter âm.
- User không đọc được session của user khác.

Chưa phát presigned POST nếu phần storage contract chưa hoàn thành.

## PHASE 5B — DIRECT S3 UPLOAD

Triển khai dựa trên phase 5A:
- Backend sinh key incoming/{user_id}/{upload_id}.
- Presigned POST khoảng 5 phút.
- Policy ràng buộc bucket, exact key, content type khai báo,
  content-length-range và các field cần thiết.
- Client không tự chọn key hoặc bucket.
- POST /api/uploads/:id/complete nhận versionId.
- Backend HEAD đúng key/version để đối chiếu object và kích thước.
- Complete lần đầu chốt source version.
- Complete lặp cùng version trả cùng kết quả.
- Complete bằng version khác sau khi đã chốt trả 409.
- Không chuyển READY trong phase này.
- Lưu trạng thái chờ validation.

Tạo storage adapter để unit test không cần AWS.
Tài liệu hóa S3 CORS và headers cần expose để lấy versionId.
Không giả lập rằng presigned POST chỉ dùng được một lần.

Test:
- Object không tồn tại.
- Version không thuộc session key.
- Kích thước khác khai báo.
- Complete lặp và complete đồng thời.
- Session hết hạn.
- File PENDING không download được.

Endpoint upload cũ phải được đánh dấu deprecated và có kế hoạch loại bỏ,
không để nó trở thành đường vòng bỏ qua quota/validation.

## PHASE 6A — S3 FILE VALIDATOR LAMBDA

Tạo Lambda độc lập với Express, không kết nối RDS.

Input:
- S3 ObjectCreated event cho incoming/.
- Xử lý từng record, decode object key đúng cách.
- Yêu cầu versionId vì bucket bật versioning.

Validation:
- Đọc đúng object version.
- Giới hạn kích thước 50 MiB.
- Cho phép PDF/JPEG/PNG/TXT.
- Kiểm tra actual content cơ bản; không chỉ tin Content-Type hoặc extension.
- TXT phải có quy tắc encoding/binary rejection rõ ràng.
- Không chạy file, không giải nén, không render nội dung.
- Không tuyên bố đây là antivirus.

Output:
- Report JSON vào processing-results/.
- Report ID xác định từ bucket/key/versionId/validator_version.
- PASSED hoặc REJECTED kèm reason code.
- Lỗi AWS/tạm thời phải throw để Lambda retry, không giả làm REJECTED.
- Report không chứa nội dung file hoặc secret.

Idempotency:
- Event trùng không tạo kết quả nghiệp vụ khác.
- Event version khác có report khác.
- Trigger chỉ áp dụng incoming/, không tạo vòng lặp.

Test:
- Valid/invalid sample của từng loại.
- MIME giả.
- File quá giới hạn.
- Key có URL encoding.
- Event trùng, nhiều record và version khác.
- S3 read/write lỗi.

Tạo contract/schema report dùng chung hoặc được version hóa rõ ràng.
Chưa deploy AWS.

## PHASE 6B — DURABLE WORKER VÀ FINALIZE

Tạo background worker riêng, dùng bảng jobs trong RDS.

Yêu cầu:
- Claim job bằng transaction/lease.
- Có lease expiry, attempt count, next_attempt_at.
- Retry exponential backoff có jitter và giới hạn.
- Worker restart không làm mất job.
- Shutdown có thời hạn, không bỏ job ở trạng thái khóa vĩnh viễn.

Finalize:
1. Đọc report đúng source version.
2. Kiểm tra schema và validator_version.
3. REJECTED: kết thúc session và release quota đúng một lần.
4. PASSED: copy đúng source version sang objects/{user_id}/{file_id}.
5. Lưu destination versionId.
6. Transaction chuyển file READY, session COMPLETED,
   reserved sang used và ghi audit.
7. Không giữ DB transaction mở trong khi chờ gọi S3.

Recovery:
- Copy thành công nhưng DB update thất bại.
- Worker chết trước/sau copy.
- Lease hết hạn trong khi worker cũ vẫn đang xử lý.
- Report chưa có hoặc bị lỗi schema.
- Session bị hủy/hết hạn trong lúc finalize.

Dùng conditional updates/fencing phù hợp để worker cũ không commit sai.
Không chỉ dựa vào biến memory hoặc setInterval trong API process.

Test các failure point trên bằng fault injection.
Tài liệu hóa cơ chế loại bỏ destination version dư thừa nếu retry tạo ra.

## PHASE 7 — FILE LIFECYCLE VÀ RECONCILIATION

Triển khai:
- Trash file.
- List trash bằng filter có pagination.
- Restore file.
- Yêu cầu permanent delete.
- Job purge sau 7 ngày hoặc theo yêu cầu.
- Job hết hạn upload session.
- Reconciliation định kỳ.

Quy tắc:
- Trash vẫn tính used_bytes.
- TRASHED/PURGE_PENDING không được cấp download URL.
- Restore chỉ được khi chưa PURGE_PENDING.
- Permanent delete trả trạng thái accepted khi đang chờ xử lý.
- Chỉ giảm quota sau khi purge S3 được xác nhận.
- Bucket versioning: xử lý versions và delete markers của exact key.
- Xử lý partial failure của batch delete.
- Retry purge không làm quota âm.
- Metadata/tombstone phải đủ để tiếp tục retry và audit.

Reconciliation:
- Session hết hạn trả reserved một lần.
- Job lease chết có thể được claim lại.
- Phát hiện session chờ report quá lâu.
- Kiểm tra quota counter theo dữ liệu nguồn.
- Phát hiện object không được tham chiếu.

Không xóa orphan chỉ vì một lần kiểm tra không thấy DB reference.
Dùng grace period, kiểm tra lại và chế độ report-only mặc định cho
orphan cleanup của objects/.
Không scan toàn bộ bucket trên mỗi request.

Test:
- Trash/restore.
- Restore đua với purge.
- Delete S3 lỗi.
- Partial version deletion.
- Purge retry.
- Session expiry đua với finalize.
- Quota reconciliation.

## PHASE 8 — FRONTEND NHÓM A

Hoàn thiện:
- Login/logout và invitation registration.
- Folder navigation và breadcrumb.
- File/folder rename.
- File move bằng chọn folder đích.
- Search, filter, sort và pagination.
- Usage bar gồm used/reserved/quota.
- Direct upload vào S3 có tiến trình.
- Phân biệt uploading, validating, ready, rejected, failed.
- Poll trạng thái có backoff và điểm dừng.
- Retry tạo session mới khi session cũ kết thúc.
- Trash list, restore, permanent delete.
- Activity list.
- Empty/loading/error states.
- Disable thao tác khi request đang chạy.
- Mobile layout cơ bản và keyboard accessibility.

Bảo mật:
- Không innerHTML với dữ liệu người dùng.
- Không lưu session/token/presigned URL trong localStorage.
- Không render file người dùng inline.
- Pin/self-host frontend dependency.
- CSP phù hợp, không tắt toàn bộ CSP để né lỗi.

Loại bỏ upload cũ qua Express sau khi direct upload hoạt động.

Test browser các hành trình:
login → create folder → upload → ready → move → download →
trash → restore → purge → logout.

Nếu backend/Lambda chưa có môi trường chạy thật, nêu rõ phần nào chỉ
được kiểm tra bằng mock; không báo end-to-end pass.

## PHASE 9 — AWS INFRASTRUCTURE AS CODE

Tạo Terraform và deployment documentation.
Không terraform apply, không tạo tài nguyên AWS trong phase này.

Cấu hình đích:
- Region ap-southeast-1.
- VPC 10.0.0.0/16.
- Public subnet AZ A: EC2.
- Private DB subnet AZ A và AZ B: RDS subnet group.
- RDS MySQL Single-AZ, public access false, encryption, backup 7 ngày.
- EC2 + encrypted EBS, IMDSv2, instance role.
- Nginx HTTPS, API bind loopback, API/worker chạy systemd.
- Không inbound SSH; dùng Session Manager.
- SG RDS chỉ nhận 3306 từ EC2 SG.
- S3 gateway endpoint.
- S3 private, versioning, TLS-only policy.
- incoming/ lifecycle, processing-results/ lifecycle.
- Không blanket expiration cho objects/.
- Lambda ngoài VPC.
- S3 notification chỉ incoming/.
- Lambda async failure destination SQS.
- IAM least privilege cho EC2, Lambda, CI.
- Parameter Store cho cấu hình nhạy cảm.
- CloudWatch log groups có retention.
- SNS alert destination.
- Budget và billing alarm với region phù hợp.

Không thêm NAT Gateway, ALB, ECS, API Gateway hoặc DynamoDB.

Yêu cầu:
- Không đưa secret plaintext vào Terraform variables/state hoặc user data.
- Document cách bootstrap secret riêng.
- Document DNS/domain và cấp/gia hạn TLS.
- Hạ tầng dữ liệu có deletion protection/retain strategy phù hợp.
- Có file example values không chứa secret.
- Có cost assumptions và teardown checklist.
- Phân biệt RDS Single-AZ với DB subnet group hai AZ.
- Bucket policy không chặn presigned browser requests bằng điều kiện
  bắt buộc mọi request phải qua VPC endpoint.

Chạy fmt/validate và static checks nếu môi trường cho phép.
Không tuyên bố plan/apply đã chạy nếu chưa chạy.

## PHASE 10A — OBSERVABILITY VÀ CI/CD

Triển khai:
- Structured JSON logs.
- Request ID và job ID xuyên suốt.
- Redaction cookie, secret, presigned URL.
- /health/live và /health/ready.
- Worker heartbeat.
- CloudWatch dashboard và alarms cho API, EC2, RDS, Lambda,
  failure queue và job backlog.
- RAM/disk metrics bằng CloudWatch Agent.
- Không dùng user_id/file_id làm metric dimension.
- SNS notification configuration.

CI:
- Lint.
- Unit/integration tests.
- Dependency/security checks.
- Terraform validation.
- Build artifact gắn commit SHA.

CD:
- OIDC role, không long-lived AWS key.
- Migration là bước riêng.
- Deploy artifact rồi readiness/smoke test.
- Rollback application artifact.
- Document giới hạn rollback migration.
- Không auto deploy chỉ vì push nếu chưa cấu hình môi trường rõ ràng.

Viết runbooks:
- DB down.
- Worker down.
- Upload stuck.
- Lambda failure queue replay.
- S3 purge failure.
- Disk full.
- Certificate renewal.
- Cost spike.

Chưa thực hiện deploy hoặc recovery trên tài nguyên thật.

## PHASE 10B — FINAL ACCEPTANCE

Đối chiếu toàn bộ implementation với docs/SPEC.md.
Không thêm tính năng mới.

Tạo acceptance matrix: yêu cầu → implementation → test → kết quả.

Kiểm tra:
- Ownership/IDOR.
- Session revocation/CSRF/XSS.
- Quota concurrency.
- Presigned replay và version binding.
- Lambda duplicate events.
- Worker crash recovery.
- Trash/restore/purge race.
- Orphan report-only và grace period.
- Không có secret hoặc public S3 fallback.
- Không còn upload bypass qua endpoint cũ.

Tạo:
- Load test metadata API với dữ liệu mẫu.
- Failure injection scenarios.
- RDS restore drill guide.
- Kiểm tra metadata đối chiếu S3 version sau restore.
- Deployment/rollback/teardown guide.
- Portfolio demo script.
- Cost tracking template.

Báo cáo riêng:
1. Test đã chạy và kết quả.
2. Test chưa chạy vì thiếu AWS/MySQL/môi trường.
3. Lỗi cần sửa trước deploy.
4. Giới hạn được chấp nhận: một EC2, RDS Single-AZ,
   chưa antivirus, chưa region disaster recovery.

Không ghi “production-ready” nếu còn điều kiện nghiệm thu chưa đạt.

## Acceptance checklists

### Phase 1 — Correctness and backend foundation

- [ ] S3 upload failure returns an error and creates no completed metadata.
- [ ] S3 delete failure retains metadata for retry, and presign failure never returns a public URL.
- [ ] AWS mock credentials and default secrets are absent; invalid production configuration fails startup safely.
- [ ] Unavailable database prevents a false healthy/running state.
- [ ] Request IDs, safe production errors, validation, and frontend text rendering are covered by tests.
- [ ] A working test command is documented and executed; residual risks in the legacy upload flow are reported.

### Phase 2 — Schema and migrations

- [ ] Versioned migrations, migration status, and clean-database bootstrap are available; server startup does not call `sequelize.sync`.
- [ ] Existing users, folders, and files survive an upgrade migration without destructive initialization.
- [ ] Sessions, upload sessions, jobs, audit events, invitations, quota fields, file lifecycle fields, indexes, and ownership constraints are migrated as specified.
- [ ] BIGINT values round-trip safely across MySQL, JavaScript, and JSON.
- [ ] Forward migration, sample-data upgrade, FK/index behavior, and backfill idempotency are verified on a non-production MySQL database.

### Phase 3 — Server-side session authentication

- [ ] Only hashed opaque session tokens are persisted; cookies are HttpOnly, SameSite=Lax, and Secure in production.
- [ ] Logout, password change, expiry, inactive users, CSRF, Origin checks, rate limits, and password-byte limits enforce the stated rules.
- [ ] Invitation use and user creation are atomic, one-time, and cannot be replayed.
- [ ] Frontend no longer reads/writes auth tokens in localStorage and works through cookie plus CSRF authentication.
- [ ] Tests cover revocation, inactive users, CSRF rejection, invitation replay, secret/log redaction, and non-enumerating login errors.

### Phase 4 — File/folder business APIs

- [ ] Every resource and destination-folder operation rejects cross-user access.
- [ ] Folder depth above 10 is rejected, and a folder with child folders or any file (including trash) returns conflict on delete.
- [ ] Cursor pagination is stable with an ID tie-breaker; default/max page size, search bounds, and sort allowlists are enforced.
- [ ] Rename/move changes metadata only; duplicate names remain valid; no folder move, recursive delete, or sharing is added.
- [ ] Audit and activity endpoints expose only the calling user's safe event data.
- [ ] Concurrency and IDOR tests cover create/move/delete races and updated OpenAPI matches the implemented API.

### Phase 5A — Quota and upload sessions

- [ ] Default quota is 1 GiB, per-file limit is 50 MiB, and no user has more than three active sessions.
- [ ] Reservation uses transaction/row locking and guarantees `used + reserved + requested <= quota` under concurrent MySQL requests.
- [ ] Reserve, commit, and release are idempotent; counters cannot become negative.
- [ ] Idempotency-Key returns the same session for the same payload and conflict for a changed payload.
- [ ] Pending files are not downloadable and upload-session ownership includes the destination folder.

### Phase 5B — Direct S3 upload

- [ ] A short-lived presigned POST restricts exact bucket/key, declared type, and content-length range; the client chooses neither bucket nor key.
- [ ] Complete binds one exact S3 version after HEAD verification; repeated/concurrent completion is idempotent and a later version conflicts.
- [ ] Session expiry, missing/mismatched object, size mismatch, and pending-download denial are tested.
- [ ] The legacy Express upload route is explicitly deprecated with a removal path and cannot bypass quota or validation.
- [ ] S3 CORS/version-ID exposure and the storage-adapter test contract are documented.

### Phase 6A — S3 file-validator Lambda

- [ ] Lambda handles each `incoming/` event record and exact version, validates size plus actual PDF/JPEG/PNG/TXT content, and never claims antivirus protection.
- [ ] Reports are versioned, deterministic, non-secret JSON under `processing-results/`, with PASSED/REJECTED reason codes.
- [ ] Temporary/AWS faults cause retry rather than a false rejection; duplicate events are harmless and do not form trigger loops.
- [ ] Tests cover valid/invalid samples, fake MIME, limits, URL-encoded keys, multiple records/versions, duplicates, and S3 read/write errors.
- [ ] Lambda remains independent of Express and RDS, and is not declared deployed in this phase.

### Phase 6B — Durable worker and finalization

- [ ] RDS jobs have transactionally claimed leases, expiry, attempts, bounded jittered retry, and safe restart/shutdown behavior.
- [ ] Finalization reads the matching report/source version, copies only a passed exact version, and atomically records READY/session/quota/audit state after S3 work completes.
- [ ] Rejected work releases quota once; no database transaction remains open while waiting on S3.
- [ ] Conditional updates/fencing prevent stale workers from committing after lease loss.
- [ ] Fault-injection tests cover copy/DB failure boundaries, crashes, stale leases, missing/bad reports, and session expiry/cancellation races.

### Phase 7 — File lifecycle and reconciliation

- [ ] Trash retains quota; trashed and purge-pending files cannot download; restore and permanent-delete state rules are enforced.
- [ ] S3 version/delete-marker purge completes before quota/metadata removal, and partial failures/retries cannot double-release quota.
- [ ] Upload-session expiry, dead job lease recovery, stalled validation, quota reconciliation, and orphan detection run through durable jobs/reconciliation.
- [ ] Orphan deletion has a grace period, recheck, and report-only default; no per-request whole-bucket scan exists.
- [ ] Tests cover trash/restore, restore-versus-purge, S3/version partial failure, purge retry, expiry-versus-finalize, and quota reconciliation.

### Phase 8 — Frontend group A

- [ ] Static frontend supports session login/logout, invitation registration, navigation, rename/move, list search/filter/sort/pagination, storage usage, and activity/trash flows.
- [ ] Direct uploads show lifecycle/progress, use bounded polling/backoff, and create a new session on retry when required.
- [ ] Loading/error/empty states, double-submit protection, basic mobile layout, and keyboard access are present.
- [ ] User-supplied data is rendered with DOM APIs, tokens/presigned URLs are not stored in localStorage, and user files are not rendered inline.
- [ ] Legacy API upload UI is removed only after direct upload works; browser E2E results distinguish real-environment verification from mocks.

### Phase 9 — AWS infrastructure as code

- [ ] Terraform and documentation describe the specified Singapore VPC, EC2, private Single-AZ RDS, private/versioned S3, Lambda outside VPC, SQS failure destination, IAM roles, Parameter Store, logs, SNS, and budget alarms.
- [ ] No NAT Gateway, ALB, ECS, API Gateway, DynamoDB, public SSH, static AWS key, plaintext secret/state secret, or blanket `objects/` expiry is introduced.
- [ ] EC2 uses IMDSv2, encrypted EBS, HTTPS/Nginx with loopback API and systemd API/worker; RDS access is only from EC2 security group.
- [ ] S3 policy permits intended presigned browser access while retaining TLS-only/private controls, and lifecycle/retention/deletion strategies are documented.
- [ ] Formatting/validation/static checks are run when tools are available, with no claim that plan/apply ran unless evidenced.

### Phase 10A — Observability and CI/CD

- [ ] JSON logs propagate request/job IDs and redact cookies, secrets, and presigned URLs.
- [ ] Liveness/readiness, worker heartbeat, dashboards, alarms, CloudWatch Agent metrics, and SNS escalation cover the stated operational failures without high-cardinality resource IDs as metric dimensions.
- [ ] CI executes lint, tests, dependency/security checks, Terraform validation, and creates commit-SHA artifacts.
- [ ] CD uses OIDC, separates migration, deploys then runs readiness/smoke tests, and documents application versus migration rollback limits.
- [ ] Required operational runbooks are complete; no real deploy or recovery is claimed without execution evidence.

### Phase 10B — Final acceptance

- [ ] An acceptance matrix maps every SPEC requirement to implementation, executed test, and result.
- [ ] Security, ownership, session/CSRF/XSS, quota, version binding/replay, Lambda duplicates, worker recovery, lifecycle races, and orphan-report-only controls are verified.
- [ ] Load, failure-injection, RDS restore, S3-version reconciliation, deployment/rollback/teardown, demo, and cost artifacts are produced or explicitly marked blocked.
- [ ] The final report distinguishes run tests, environment-blocked tests, deployment blockers, and accepted limitations.
- [ ] No claim of production readiness is made while acceptance conditions remain unmet.

## Deferred scope

Do not add public sharing, thumbnails, collaboration, password-reset email, antivirus, multipart upload, Redis, DynamoDB, API Gateway, ECS, microservices, or NAT Gateway unless a later approved phase changes this specification.
