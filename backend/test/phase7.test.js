import test from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';
import { createFileService } from '../src/services/file.service.js';
import { createPurgeFileService } from '../src/services/purge-file.service.js';
import { createExpireUploadService } from '../src/services/expire-upload.service.js';
import { createFinalizeUploadService } from '../src/services/finalize-upload.service.js';
import { createReconciliationService } from '../src/services/reconciliation.service.js';
import { createS3StorageAdapter, PartialDeleteError } from '../src/services/s3-storage.adapter.js';
import { createJobService, PURGE_FILE, WORKER_JOB_TYPES } from '../src/services/job.service.js';

const now = new Date('2026-09-17T12:00:00.000Z');
const userId = '25f00dbf-4788-4b4b-8edc-e79877090f23';
const fileId = '45f00dbf-4788-4b4b-8edc-e79877090f23';
const attach = (row) => Object.assign(row, { save: async () => row, get: () => ({ ...row }) });
const db = { transaction: async (callback) => callback({ LOCK: { UPDATE: 'UPDATE' } }) };

const lifecycleFixture = ({ status = 'READY' } = {}) => {
  const file = attach({ id: fileId, user_id: userId, folder_id: null, file_name: 'report.pdf', file_size: '10', status, s3_key: `objects/${userId}/${fileId}`, s3_version_id: 'v1', trashed_at: status === 'TRASHED' ? now : null, purge_requested_at: null });
  let job = status === 'TRASHED' ? attach({ id: 'purge-job', type: 'PURGE_FILE', status: 'QUEUED', payload: { file_id: fileId }, dedupe_key: `purge:${fileId}` }) : null;
  const audits = [];
  const FileModel = {
    findOne: async ({ where }) => where.id === file.id && where.user_id === file.user_id ? file : null,
    findAll: async ({ where, limit }) => {
      assert.ok(where.status[Op.in].includes(file.status));
      return [file, attach({ ...file, id: `${file.id}-2` }), attach({ ...file, id: `${file.id}-3` })].slice(0, limit);
    }
  };
  const JobModel = {
    create: async (row) => { job = attach({ id: 'purge-job', ...row }); return job; },
    findOne: async ({ where }) => where.dedupe_key === `purge:${fileId}` ? job : null
  };
  const service = createFileService({ sequelizeInstance: db, FileModel, FolderModel: { findOne: async () => null }, JobModel, AuditEventModel: { create: async (row) => { audits.push(row); return row; } }, now: () => now });
  return { service, file, audits, get job() { return job; } };
};

test('trash retains quota semantics, creates a seven-day purge job, lists with filters, and restores before purge', async () => {
  const f = lifecycleFixture();
  await f.service.trashFile(userId, fileId, { requestId: 'request-1' });
  assert.equal(f.file.status, 'TRASHED');
  assert.equal(f.job.type, 'PURGE_FILE');
  assert.equal(f.job.next_attempt_at.getTime() - now.getTime(), 7 * 24 * 60 * 60 * 1000);
  assert.equal(f.audits[0].action, 'file.trashed');
  const page = await f.service.listTrash(userId, { status: 'TRASHED', sort: 'trashed_at', direction: 'DESC', limit: 2 });
  assert.equal(page.items.length, 2); assert.ok(page.next_cursor);
  await f.service.restoreFile(userId, fileId, { requestId: 'request-2' });
  assert.equal(f.file.status, 'READY'); assert.equal(f.file.trashed_at, null);
  assert.equal(f.job.status, 'SUCCEEDED'); assert.equal(f.audits.at(-1).action, 'file.restored');
  await f.service.trashFile(userId, fileId, { requestId: 'request-3' });
  assert.equal(f.job.status, 'QUEUED'); assert.equal(f.file.status, 'TRASHED');
  const accepted = await f.service.requestPermanentDelete(userId, fileId, { requestId: 'request-4' });
  assert.equal(accepted.accepted, true); assert.equal(f.file.status, 'PURGE_PENDING');
  await assert.rejects(() => f.service.restoreFile(userId, fileId), { code: 'FILE_PURGE_STARTED' });
});

const purgeFixture = ({ storage } = {}) => {
  const file = attach({ id: fileId, user_id: userId, file_size: '10', status: 'PURGE_PENDING', s3_key: `objects/${userId}/${fileId}`, s3_version_id: 'committed-v1', purge_requested_at: now, purged_at: null });
  const user = attach({ id: userId, used_bytes: '10' });
  const job = attach({ id: 'purge-job', type: 'PURGE_FILE', status: 'RUNNING', lease_token: 'lease-1', locked_until: new Date(now.getTime() + 60_000), payload: { file_id: fileId } });
  const audits = [];
  const service = createPurgeFileService({ sequelizeInstance: db, now: () => now, storage,
    FileModel: { findByPk: async () => file }, UserModel: { findByPk: async () => user }, JobModel: { findOne: async () => job },
    AuditEventModel: { create: async (row) => { audits.push(row); return row; } } });
  return { service, file, user, job, audits };
};

test('S3 purge error retains metadata and quota for retry', async () => {
  const f = purgeFixture({ storage: { listExactObjectVersions: async () => { throw new Error('S3 unavailable'); }, deleteObjectVersions: async () => assert.fail('must not delete') } });
  await assert.rejects(() => f.service.process({ job: f.job, leaseToken: 'lease-1' }), /S3 unavailable/);
  assert.equal(f.file.status, 'PURGE_PENDING'); assert.equal(f.user.used_bytes, '10'); assert.equal(f.file.purged_at, null);
});

test('trashed and purge-pending files cannot receive download URLs', async () => {
  for (const status of ['TRASHED', 'PURGE_PENDING']) {
    let signed = false;
    const service = createFileService({ FileModel: { findOne: async ({ where }) => {
      assert.equal(where.status, 'READY'); return null;
    } }, storage: { generatePresignedDownloadUrl: async () => { signed = true; } } });
    await assert.rejects(() => service.getDownloadUrl(userId, `${fileId}-${status}`), { code: 'NOT_FOUND' });
    assert.equal(signed, false);
  }
});

test('partial version deletion is retryable and a completed retry releases quota exactly once', async () => {
  let objects = [
    { key: `objects/${userId}/${fileId}`, versionId: 'v1', isDeleteMarker: false },
    { key: `objects/${userId}/${fileId}`, versionId: 'v2', isDeleteMarker: false },
    { key: `objects/${userId}/${fileId}`, versionId: 'marker', isDeleteMarker: true }
  ];
  let first = true;
  const storage = {
    listExactObjectVersions: async () => [...objects],
    deleteObjectVersions: async () => {
      if (first) { first = false; objects = objects.slice(1); throw new PartialDeleteError([{ key: objects[0].key, versionId: objects[0].versionId, code: 'AccessDenied' }]); }
      objects = [];
    }
  };
  const f = purgeFixture({ storage });
  await assert.rejects(() => f.service.process({ job: f.job, leaseToken: 'lease-1' }), PartialDeleteError);
  assert.equal(f.user.used_bytes, '10'); assert.equal(f.file.status, 'PURGE_PENDING');
  f.job.status = 'RUNNING'; f.job.lease_token = 'lease-2'; f.job.locked_until = new Date(now.getTime() + 60_000);
  await f.service.process({ job: f.job, leaseToken: 'lease-2' });
  assert.equal(f.user.used_bytes, '0'); assert.equal(f.file.status, 'PURGED'); assert.equal(f.job.status, 'SUCCEEDED');
  f.job.status = 'RUNNING'; f.job.lease_token = 'lease-3'; f.job.locked_until = new Date(now.getTime() + 60_000);
  await f.service.process({ job: f.job, leaseToken: 'lease-3' });
  assert.equal(f.user.used_bytes, '0');
});

test('restore racing after purge preflight is rejected before S3 completion', async () => {
  const l = lifecycleFixture({ status: 'TRASHED' });
  l.job.status = 'RUNNING'; l.job.lease_token = 'lease'; l.job.locked_until = new Date(now.getTime() + 60_000);
  const user = attach({ id: userId, used_bytes: '10' });
  let resume; let started;
  const waiting = new Promise((resolve) => { started = resolve; });
  const pause = new Promise((resolve) => { resume = resolve; });
  const purger = createPurgeFileService({ sequelizeInstance: db, now: () => now,
    storage: { listExactObjectVersions: async () => { started(); await pause; return []; }, deleteObjectVersions: async () => {} },
    FileModel: { findByPk: async () => l.file }, UserModel: { findByPk: async () => user }, JobModel: { findOne: async () => l.job }, AuditEventModel: { create: async () => ({}) } });
  const purge = purger.process({ job: l.job, leaseToken: 'lease' });
  await waiting;
  await assert.rejects(() => l.service.restoreFile(userId, fileId), { code: 'FILE_PURGE_STARTED' });
  resume(); await purge;
  assert.equal(l.file.status, 'PURGED'); assert.equal(user.used_bytes, '0');
});

test('batch delete treats S3 partial success and unconfirmed items as failures', async () => {
  const sent = [];
  const adapter = createS3StorageAdapter({ bucket: 'private-bucket', client: { send: async (command) => {
    sent.push(command.input.Delete.Objects);
    return { Deleted: [{ Key: 'objects/u/f', VersionId: 'v1' }], Errors: [{ Key: 'objects/u/f', VersionId: 'v2', Code: 'AccessDenied' }] };
  } } });
  await assert.rejects(() => adapter.deleteObjectVersions({ objects: [
    { key: 'objects/u/f', versionId: 'v1' }, { key: 'objects/u/f', versionId: 'v2' }, { key: 'objects/u/f', versionId: 'v3' }
  ] }), (error) => error instanceof PartialDeleteError && error.failures.map((item) => item.versionId).join(',') === 'v2,v3');
  assert.equal(sent[0].length, 3);
});

test('exact-key inventory includes versions, delete markers, and literal null versions but excludes prefix collisions', async () => {
  let page = 0;
  const adapter = createS3StorageAdapter({ bucket: 'private-bucket', client: { send: async () => ++page === 1 ? {
    Versions: [{ Key: 'objects/u/file', VersionId: 'v1' }], IsTruncated: true,
    NextKeyMarker: 'objects/u/file', NextVersionIdMarker: 'v1'
  } : {
    Versions: [{ Key: 'objects/u/file-extra', VersionId: 'v2' }],
    DeleteMarkers: [{ Key: 'objects/u/file', VersionId: 'null' }], IsTruncated: false
  } } });
  assert.deepEqual((await adapter.listExactObjectVersions({ key: 'objects/u/file' })).map((item) => item.versionId).sort(), ['null', 'v1']);
  assert.equal(page, 2);
});

test('expired leases are reclaimable for Phase 7 job types', async () => {
  let clock = new Date(now);
  const row = attach({ id: 'purge-job', type: PURGE_FILE, status: 'RUNNING', attempts: 1, max_attempts: 5, next_attempt_at: now, locked_until: now, lease_generation: 1 });
  const service = createJobService({ sequelizeInstance: db, now: () => clock, leaseMs: 60_000, JobModel: { findOne: async ({ where }) => {
    if (where.id) return row;
    assert.ok(where.type[Op.in].includes(PURGE_FILE)); return row;
  } } });
  const claim = await service.claimNextOfTypes('worker-b', WORKER_JOB_TYPES);
  assert.equal(claim.job.type, PURGE_FILE); assert.equal(row.status, 'RUNNING'); assert.equal(row.lease_generation, 2); assert.notEqual(claim.leaseToken, null);
});

test('session expiry wins against finalization and returns reserved quota only once', async () => {
  const session = attach({ id: 'session-1', user_id: userId, requested_size: '10', status: 'UPLOADED', expires_at: now, incoming_key: `incoming/${userId}/session-1`, source_version_id: 'source-v1' });
  const user = attach({ id: userId, reserved_bytes: '10', used_bytes: '0' });
  const expiryJob = attach({ id: 'expiry-job', status: 'RUNNING', lease_token: 'expiry-lease', locked_until: new Date(now.getTime() + 60_000), payload: { upload_session_id: session.id } });
  const expiry = createExpireUploadService({ sequelizeInstance: db, now: () => now, UserModel: { findByPk: async () => user }, UploadSessionModel: { findByPk: async () => session }, JobModel: { findOne: async () => expiryJob }, AuditEventModel: { create: async () => ({}) } });
  await expiry.process({ job: expiryJob, leaseToken: 'expiry-lease' });
  assert.equal(session.status, 'EXPIRED'); assert.equal(user.reserved_bytes, '0');
  const finalizeJob = attach({ id: 'finalize-job', status: 'RUNNING', lease_token: 'finalize-lease', locked_until: new Date(now.getTime() + 60_000), payload: { upload_session_id: session.id, file_id: fileId } });
  const finalizer = createFinalizeUploadService({ sequelizeInstance: db, now: () => now, bucket: 'private-bucket', storage: { getObjectText: async () => assert.fail('terminal expiry must not read S3'), copyObjectVersion: async () => assert.fail('must not copy') }, UserModel: { findByPk: async () => user }, UploadSessionModel: { findByPk: async () => session }, JobModel: { findOne: async () => finalizeJob }, FileModel: { create: async () => assert.fail('must not create') }, AuditEventModel: { create: async () => ({}) } });
  await finalizer.process({ job: finalizeJob, leaseToken: 'finalize-lease' });
  assert.equal(user.reserved_bytes, '0'); assert.equal(user.used_bytes, '0');
});

test('quota reconciliation derives used and reserved counters from authoritative rows', async () => {
  const user = attach({ id: userId, used_bytes: '999', reserved_bytes: '999' });
  const files = [{ file_size: '10', status: 'READY' }, { file_size: '20', status: 'TRASHED' }, { file_size: '30', status: 'PURGE_PENDING' }, { file_size: '40', status: 'PURGED' }];
  const sessions = [{ requested_size: '5', status: 'RESERVED' }, { requested_size: '6', status: 'UPLOADED' }, { requested_size: '7', status: 'COMPLETED' }];
  const findings = [];
  const FindingModel = { findOrCreate: async ({ defaults }) => { const row = attach({ ...defaults }); findings.push(row); return [row, true]; } };
  const service = createReconciliationService({ sequelizeInstance: db, now: () => now, storage: {}, FindingModel,
    UserModel: { findByPk: async () => user },
    FileModel: { findAll: async ({ where }) => files.filter((row) => where.status[Op.in].includes(row.status)) },
    UploadSessionModel: { findAll: async ({ where }) => sessions.filter((row) => where.status[Op.in].includes(row.status)) },
    JobModel: {} });
  const result = await service.reconcileUserQuota(userId);
  assert.equal(result.corrected, true); assert.equal(user.used_bytes, '60'); assert.equal(user.reserved_bytes, '11');
  assert.equal(findings[0].kind, 'QUOTA_MISMATCH'); assert.equal(findings[0].status, 'RESOLVED');
});

test('orphan cleanup requires a later grace-period recheck and defaults to report-only', async () => {
  let clock = new Date(now); let deletes = 0;
  const findings = new Map();
  const FindingModel = {
    findOne: async ({ where }) => findings.get(where.fingerprint) || null,
    findOrCreate: async ({ where, defaults }) => {
      const current = findings.get(where.fingerprint); if (current) return [current, false];
      const row = attach({ ...defaults }); findings.set(where.fingerprint, row); return [row, true];
    }
  };
  const service = createReconciliationService({ now: () => clock, orphanGraceMs: 24 * 60 * 60 * 1000, orphanCleanupMode: 'report-only',
    storage: { deleteObjectVersion: async () => { deletes += 1; } }, FindingModel,
    FileModel: { findOne: async () => null }, UserModel: {}, UploadSessionModel: {}, JobModel: {}, sequelizeInstance: db });
  const item = { key: 'objects/user/orphan', versionId: 'v1', isDeleteMarker: false };
  await service.inspectOrphan(item); assert.equal([...findings.values()][0].status, 'CANDIDATE');
  clock = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  await service.inspectOrphan(item);
  assert.equal([...findings.values()][0].status, 'CONFIRMED'); assert.equal(deletes, 0);
});
