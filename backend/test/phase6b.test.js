import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createFinalizeUploadService, InvalidReportError, LeaseLostError } from '../src/services/finalize-upload.service.js';
import { createJobService, retryDelayMs } from '../src/services/job.service.js';
import { createFileService } from '../src/services/file.service.js';
import { createS3StorageAdapter } from '../src/services/s3-storage.adapter.js';
import { Readable } from 'node:stream';
import { readdir } from 'node:fs/promises';
import { createWorkerShutdown } from '../src/services/worker-shutdown.js';
import { Op } from 'sequelize';

const now = new Date('2026-09-17T12:00:00.000Z');
const bucket = 'private-bucket';
const userId = '25f00dbf-4788-4b4b-8edc-e79877090f23';
const sessionId = '35f00dbf-4788-4b4b-8edc-e79877090f23';
const fileId = '45f00dbf-4788-4b4b-8edc-e79877090f23';
const reportId = (key, version) => createHash('sha256').update(`s3-file-validator/1\0${bucket}\0${key}\0${version}`).digest('hex');

const fixture = ({ verdict = 'PASSED', mutateDuringCopy, fileFailure = false } = {}) => {
  const session = { id: sessionId, user_id: userId, folder_id: null, requested_size: '10', declared_mime_type: 'application/pdf', incoming_key: `incoming/${userId}/${sessionId}`, source_version_id: 'source-v1', status: 'UPLOADED', expires_at: new Date(now.getTime() + 60_000), save: async () => session };
  const user = { id: userId, quota_bytes: '100', reserved_bytes: '10', used_bytes: '0', save: async () => user };
  const job = { id: 'job-1', status: 'RUNNING', lease_token: 'lease-1', locked_until: new Date(now.getTime() + 60_000), payload: { upload_session_id: sessionId, file_id: fileId }, save: async () => job };
  const files = []; const audits = []; const deletes = []; const copies = [];
  const report = { schema_version: 'validator-report/v1', validator_version: 's3-file-validator/1', report_id: reportId(session.incoming_key, session.source_version_id), status: verdict, reason_code: verdict === 'PASSED' ? 'VALID' : 'INVALID_PDF', detected_mime_type: verdict === 'PASSED' ? 'application/pdf' : null, source: { bucket, key: session.incoming_key, version_id: session.source_version_id } };
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  let inTransaction = false;
  const faults = {};
  const data = (row) => structuredClone(Object.fromEntries(Object.entries(row).filter(([, value]) => typeof value !== 'function')));
  const db = { transaction: async (fn) => {
    const before = [session, user, job].map(data);
    const fileCount = files.length; const auditCount = audits.length;
    inTransaction = true;
    try {
      const result = await fn(transaction);
      if (files.length > fileCount && faults.commitRollback) throw new Error('commit failed');
      if (files.length > fileCount && faults.commitResponseLost) { inTransaction = false; throw Object.assign(new Error('commit response lost'), { committed: true }); }
      return result;
    } catch (error) {
      if (!error.committed) {
        [session, user, job].forEach((row, i) => { for (const key of Object.keys(row)) if (typeof row[key] !== 'function') delete row[key]; Object.assign(row, before[i]); });
        files.length = fileCount; audits.length = auditCount;
      }
      throw error;
    } finally { inTransaction = false; }
  } };
  const storage = {
    getObjectText: async () => { assert.equal(inTransaction, false); if (faults.reportError) throw new Error('NoSuchKey'); return faults.rawReport ?? JSON.stringify(report); },
    copyObjectVersion: async (input) => { assert.equal(inTransaction, false); copies.push(input); const versionId = `dest-v${copies.length}`; await mutateDuringCopy?.({ session, job, user }); return { versionId }; },
    deleteObjectVersion: async (input) => deletes.push(input)
  };
  const service = createFinalizeUploadService({
    sequelizeInstance: db, now: () => now, bucket, storage,
    UserModel: { findByPk: async () => user }, UploadSessionModel: { findByPk: async () => session },
    JobModel: { findOne: async () => job },
    FileModel: { create: async (row) => { if (fileFailure) throw new Error('injected DB failure'); const file = { ...row, save: async () => file }; files.push(file); return file; } },
    AuditEventModel: { create: async (row) => { audits.push(row); return row; } }
  });
  return { service, session, user, job, files, audits, deletes, copies, report, faults };
};

test('PASSED report copies the exact source version and atomically records READY, quota, session, and audit', async () => {
  const f = fixture();
  await f.service.process({ job: f.job, leaseToken: 'lease-1' });
  assert.deepEqual(f.copies[0], { sourceKey: f.session.incoming_key, sourceVersionId: 'source-v1', destinationKey: `objects/${userId}/${fileId}` });
  assert.equal(f.files[0].status, 'READY');
  assert.equal(f.files[0].s3_version_id, 'dest-v1');
  assert.equal(f.session.status, 'COMPLETED');
  assert.equal(f.user.reserved_bytes, '0'); assert.equal(f.user.used_bytes, '10');
  assert.equal(f.audits[0].action, 'file.finalized'); assert.equal(f.job.status, 'SUCCEEDED');
});

test('REJECTED releases reservation once without copying and becomes idempotently terminal', async () => {
  const f = fixture({ verdict: 'REJECTED' });
  await f.service.process({ job: f.job, leaseToken: 'lease-1' });
  assert.equal(f.copies.length, 0); assert.equal(f.session.status, 'REJECTED');
  assert.equal(f.user.reserved_bytes, '0'); assert.equal(f.job.status, 'SUCCEEDED');
  // A replay sees the terminal session and cannot release quota a second time.
  f.job.status = 'RUNNING'; f.job.lease_token = 'lease-2'; f.job.locked_until = new Date(now.getTime() + 60_000);
  await f.service.process({ job: f.job, leaseToken: 'lease-2' });
  assert.equal(f.user.reserved_bytes, '0');
});

test('copy success followed by DB failure retains the version for safe reconciliation', async () => {
  const f = fixture({ fileFailure: true });
  await assert.rejects(() => f.service.process({ job: f.job, leaseToken: 'lease-1' }), /injected DB failure/);
  assert.deepEqual(f.deletes, []);
  assert.equal(f.session.status, 'UPLOADED'); assert.equal(f.user.reserved_bytes, '10');
});

test('lease expiry or cancellation during copy fences an old worker and leaves no committed READY file', async () => {
  const f = fixture({ mutateDuringCopy: async ({ job }) => { job.lease_token = 'new-worker-lease'; } });
  await assert.rejects(() => f.service.process({ job: f.job, leaseToken: 'lease-1' }), LeaseLostError);
  assert.equal(f.files.length, 0); assert.equal(f.deletes.length, 0);
  const cancelled = fixture({ mutateDuringCopy: async ({ session, user }) => { session.status = 'CANCELLED'; user.reserved_bytes = '0'; } });
  await cancelled.service.process({ job: cancelled.job, leaseToken: 'lease-1' });
  assert.equal(cancelled.files.length, 0); assert.equal(cancelled.deletes.length, 0); assert.equal(cancelled.user.reserved_bytes, '0');
});

test('missing/bad report is retryable failure and exponential retry is bounded with jitter', async () => {
  const f = fixture(); f.report.source.version_id = 'wrong-version';
  f.service = createFinalizeUploadService({ sequelizeInstance: { transaction: async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }) }, now: () => now, bucket, storage: { ...{ copyObjectVersion: async () => assert.fail('must not copy'), deleteObjectVersion: async () => {} }, getObjectText: async () => JSON.stringify(f.report) }, UserModel: { findByPk: async () => f.user }, UploadSessionModel: { findByPk: async () => f.session }, JobModel: { findOne: async () => f.job }, FileModel: { create: async () => assert.fail('must not create') }, AuditEventModel: { create: async () => {} } });
  await assert.rejects(() => f.service.process({ job: f.job, leaseToken: 'lease-1' }), InvalidReportError);
  assert.equal(retryDelayMs(1, () => 0), 0);
  assert.equal(retryDelayMs(1, () => 1), 1000);
  assert.equal(retryDelayMs(99, () => 1), 15 * 60_000);
});

test('transactional lease claim fences stale completion and expired leases are reclaimable', async () => {
  let clock = new Date(now);
  const row = { id: 'lease-job', status: 'QUEUED', attempts: 0, max_attempts: 2, next_attempt_at: clock, run_at: clock, lease_generation: 0, save: async () => row, get: () => ({ ...row }) };
  const jobs = createJobService({ sequelizeInstance: { transaction: async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }) }, JobModel: { findOne: async () => row }, now: () => clock, random: () => 0, leaseMs: 100 });
  const first = await jobs.claimNext('worker-a');
  assert.equal(row.status, 'RUNNING'); assert.equal(row.attempts, 1);
  clock = new Date(clock.getTime() + 101);
  const second = await jobs.claimNext('worker-b');
  assert.notEqual(first.leaseToken, second.leaseToken); assert.equal(row.lease_generation, 2);
  assert.equal(await jobs.finish(row.id, first.leaseToken), false);
  assert.equal(await jobs.finish(row.id, second.leaseToken), true);
  assert.equal(row.status, 'SUCCEEDED');
});

test('COMMIT rollback after callback preserves reservation; restart copies again and charges once', async () => {
  const f = fixture(); f.faults.commitRollback = true;
  await assert.rejects(() => f.service.process({ job: f.job, leaseToken: 'lease-1' }), /commit failed/);
  assert.equal(f.files.length, 0); assert.equal(f.audits.length, 0); assert.equal(f.user.used_bytes, '0');
  assert.equal(f.session.status, 'UPLOADED'); assert.equal(f.deletes.length, 0);
  f.faults.commitRollback = false;
  await f.service.process({ job: f.job, leaseToken: 'lease-1' });
  assert.equal(f.files.length, 1); assert.equal(f.files[0].s3_version_id, 'dest-v2');
  assert.equal(f.user.used_bytes, '10'); assert.equal(f.user.reserved_bytes, '0');
});

test('COMMIT succeeds but response is lost: retry cannot delete file or double-charge', async () => {
  const f = fixture(); f.faults.commitResponseLost = true;
  await assert.rejects(() => f.service.process({ job: f.job, leaseToken: 'lease-1' }), /response lost/);
  assert.equal(f.files.length, 1); assert.equal(f.user.used_bytes, '10'); assert.equal(f.deletes.length, 0);
  f.job.status = 'RUNNING'; f.job.lease_token = 'new'; f.job.locked_until = new Date(now.getTime() + 60000);
  await f.service.process({ job: f.job, leaseToken: 'new' });
  assert.equal(f.files.length, 1); assert.equal(f.user.used_bytes, '10'); assert.equal(f.copies.length, 1);
});

test('expired session releases quota even if report never arrived; expiry during copy prevents READY', async () => {
  const f = fixture(); f.session.expires_at = now; f.faults.reportError = true;
  await f.service.process({ job: f.job, leaseToken: 'lease-1' });
  assert.equal(f.session.status, 'EXPIRED'); assert.equal(f.user.reserved_bytes, '0'); assert.equal(f.copies.length, 0);
  const g = fixture({ mutateDuringCopy: ({ session }) => { session.expires_at = now; } });
  await g.service.process({ job: g.job, leaseToken: 'lease-1' });
  assert.equal(g.files.length, 0); assert.equal(g.session.status, 'EXPIRED'); assert.equal(g.user.used_bytes, '0');
});

test('lease expires without another claim: post-copy commit is rejected', async () => {
  const f = fixture({ mutateDuringCopy: ({ job }) => { job.locked_until = now; } });
  await assert.rejects(() => f.service.process({ job: f.job, leaseToken: 'lease-1' }), LeaseLostError);
  assert.equal(f.files.length, 0); assert.equal(f.user.reserved_bytes, '10');
});

test('strict report schema and verdict consistency fail closed before copy', async () => {
  for (const change of [
    (r) => { r.extra = true; }, (r) => { r.source.extra = true; },
    (r) => { r.reason_code = 'UNKNOWN'; }, (r) => { r.reason_code = 'INVALID_PDF'; },
    (r) => { r.detected_mime_type = {}; }, (r) => { r.detected_mime_type = 'text/html'; },
    (r) => { r.validator_version = 'unapproved/2'; }, (r) => { delete r.status; },
    (r) => { r.source.version_id = 'other'; }, (r) => { r.source.bucket = 'other'; }
  ]) {
    const f = fixture(); change(f.report);
    await assert.rejects(() => f.service.process({ job: f.job, leaseToken: 'lease-1' }), InvalidReportError);
    assert.equal(f.copies.length, 0); assert.equal(f.user.reserved_bytes, '10');
  }
  for (const rawReport of ['{', 'null', '[]']) {
    const f = fixture(); f.faults.rawReport = rawReport;
    await assert.rejects(() => f.service.process({ job: f.job, leaseToken: 'lease-1' }), InvalidReportError);
  }
  const missing = fixture(); missing.faults.reportError = true;
  await assert.rejects(() => missing.service.process({ job: missing.job, leaseToken: 'lease-1' }), /NoSuchKey/);
  assert.equal(missing.session.status, 'UPLOADED');
});

test('quota underflow blocks READY instead of hiding accounting corruption', async () => {
  const f = fixture(); f.user.reserved_bytes = '9';
  await assert.rejects(() => f.service.process({ job: f.job, leaseToken: 'lease-1' }), /Quota invariant/);
  assert.equal(f.files.length, 0); assert.equal(f.user.used_bytes, '0'); assert.equal(f.user.reserved_bytes, '9');
});

test('download pins referenced version; READY cannot enter legacy destructive delete', async () => {
  let signed;
  const service = createFileService({ FileModel: { findOne: async ({ where }) => {
    assert.equal(where.user_id, userId);
    return { id: fileId, status: 'READY', s3_key: 'objects/key', s3_version_id: 'committed-version', original_name: 'file' };
  } }, storage: { generatePresignedDownloadUrl: async (input) => { signed = input; return 'url'; }, deleteFromS3: async () => assert.fail('must not delete') } });
  await service.getDownloadUrl(userId, fileId);
  assert.equal(signed.versionId, 'committed-version'); assert.equal(signed.expiresInSeconds, 300);
  await assert.rejects(() => service.deleteFile(userId, fileId), { code: 'FILE_LIFECYCLE_REQUIRED' });
});

test('S3 adapter encodes source version and rejects null destination versions and oversized reports', async () => {
  const commands = [];
  const adapter = createS3StorageAdapter({ bucket, client: { send: async (command) => { commands.push(command.input); return { VersionId: 'null', Body: Readable.from([Buffer.alloc(16385)]) }; } } });
  await assert.rejects(() => adapter.copyObjectVersion({ sourceKey: 'incoming/a b', sourceVersionId: 'v+/=', destinationKey: 'objects/a' }), /immutable/);
  assert.equal(commands[0].CopySource, `${bucket}/incoming/a%20b?versionId=v%2B%2F%3D`);
  await assert.rejects(() => adapter.getObjectText({ key: 'processing-results/x' }), /size limit/);
});

test('all migrations export the runner contract', async () => {
  for (const name of await readdir(new URL('../database/migrations/', import.meta.url))) {
    if (!name.endsWith('.js')) continue;
    const migration = await import(`../database/migrations/${name}`);
    assert.equal(migration.id, name.slice(0, -3)); assert.equal(typeof migration.up, 'function');
  }
});

test('worker A resumes after worker B commits: one file, one quota charge, B version retained', async () => {
  let resume; let started;
  const copied = new Promise((resolve) => { started = resolve; });
  const pause = new Promise((resolve) => { resume = resolve; });
  let calls = 0;
  const f = fixture({ mutateDuringCopy: async () => { if (++calls === 1) { started(); await pause; } } });
  const old = f.service.process({ job: { ...f.job }, leaseToken: 'lease-1' });
  await copied;
  f.job.lease_token = 'lease-2';
  await f.service.process({ job: { ...f.job }, leaseToken: 'lease-2' });
  resume();
  await assert.rejects(() => old, LeaseLostError);
  assert.equal(f.files.length, 1); assert.equal(f.files[0].s3_version_id, 'dest-v2');
  assert.equal(f.user.used_bytes, '10'); assert.equal(f.user.reserved_bytes, '0'); assert.equal(f.deletes.length, 0);
});

test('retry scheduling, attempt cap, type filter and error redaction', async () => {
  let clock = new Date(now);
  const row = { id: 'job', type: 'FINALIZE_UPLOAD', status: 'QUEUED', attempts: 0, max_attempts: 2, next_attempt_at: clock,
    save: async () => {}, get: () => ({ ...row }) };
  const service = createJobService({ now: () => clock, random: () => 1, leaseMs: 60000,
    sequelizeInstance: { transaction: async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }) },
    JobModel: { findOne: async ({ where, lock }) => {
      assert.equal(lock, 'UPDATE');
      if (where.id) return row;
      assert.equal(where.type, 'FINALIZE_UPLOAD'); assert.ok(where[Op.or]);
      return (row.status === 'QUEUED' && row.next_attempt_at <= clock) || (row.status === 'RUNNING' && row.locked_until <= clock) ? row : null;
    } } });
  const first = await service.claimNext('a');
  assert.equal(await service.claimNext('b'), null);
  await service.fail(row.id, first.leaseToken, new Error('https://s3/?X-Amz-Signature=secret SQL password'));
  assert.equal(row.last_error, 'FINALIZE_ATTEMPT_FAILED');
  assert.equal(row.next_attempt_at.getTime() - now.getTime(), 1000);
  assert.equal(await service.claimNext('b'), null);
  clock = new Date(now.getTime() + 1000);
  const second = await service.claimNext('b');
  await service.fail(row.id, second.leaseToken, new Error('fail'));
  assert.equal(row.status, 'DEAD'); assert.equal(row.attempts, 2);
  assert.equal(await service.claimNext('c'), null);
});

test('shutdown deadline fires while work or database close hangs', async () => {
  for (const active of [true, false]) {
    let stopped = false; let exit;
    const exited = new Promise((resolve) => { exit = resolve; });
    const shutdown = createWorkerShutdown({ timeoutMs: 20, stop: () => { stopped = true; }, isActive: () => active,
      close: () => new Promise(() => {}), sleep: () => new Promise(() => {}), exit });
    void shutdown();
    assert.equal(await exited, 1); assert.equal(stopped, true);
  }
});

test('graceful shutdown closes DB once and exits successfully', async () => {
  const events = [];
  const shutdown = createWorkerShutdown({ timeoutMs: 1000, stop: () => events.push('stop'), isActive: () => false,
    close: async () => events.push('close'), exit: (code) => events.push(code) });
  await shutdown(); await shutdown();
  assert.deepEqual(events, ['stop', 'close', 0]);
});
