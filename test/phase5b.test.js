import test from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';
import { createQuotaService } from '../src/services/quota.service.js';
import { createDirectUploadService } from '../src/services/direct-upload.service.js';
import { createS3StorageAdapter } from '../src/services/s3-storage.adapter.js';
import { createFileService } from '../src/services/file.service.js';
import { legacyUploadRemoved } from '../src/controllers/file.controller.js';

const userId = '25f00dbf-4788-4b4b-8edc-e79877090f23';
const otherUserId = '3d7549e0-41a4-4d31-94c6-2d30b6e430ea';
const initialNow = new Date('2026-09-17T12:00:00.000Z');

const fixture = ({ now = () => initialNow, storage } = {}) => {
  const users = new Map([[userId, { id: userId, quota_bytes: '1000', used_bytes: '0', reserved_bytes: '0' }], [otherUserId, { id: otherUserId, quota_bytes: '1000', used_bytes: '0', reserved_bytes: '0' }]]);
  const sessions = [];
  const attach = (row) => Object.assign(row, { save: async () => row });
  let queue = Promise.resolve();
  const sequelizeInstance = { transaction: async (callback) => {
    const previous = queue;
    let finish;
    queue = new Promise((resolve) => { finish = resolve; });
    await previous;
    try { return await callback({ LOCK: { UPDATE: 'UPDATE' } }); } finally { finish(); }
  } };
  const UploadSessionModel = {
    findAll: async ({ where }) => {
      const statuses = where.status[Op.in];
      const expiresAt = where.expires_at[Op.lte];
      return sessions.filter((item) => item.user_id === where.user_id && statuses.includes(item.status) && item.expires_at <= expiresAt);
    },
    findOne: async ({ where }) => sessions.find((item) => item.user_id === where.user_id && (where.idempotency_key ? item.idempotency_key === where.idempotency_key : item.id === where.id)) || null,
    count: async ({ where }) => sessions.filter((item) => item.user_id === where.user_id && where.status[Op.in].includes(item.status) && item.expires_at > where.expires_at[Op.gt]).length,
    create: async (row) => { const item = attach({ ...row }); sessions.push(item); return item; }
  };
  const UserModel = { findByPk: async (id) => { const user = users.get(id); return user ? attach(user) : null; } };
  const quota = createQuotaService({ sequelizeInstance, UserModel, FolderModel: { findOne: async () => null }, UploadSessionModel, now });
  const direct = createDirectUploadService({ quota, storage, now });
  return { quota, direct, sessions };
};

const reserve = async (quota, key = 'upload-key') => quota.reserveQuota(userId, { requested_size: 10, declared_mime_type: 'application/pdf', folder_id: null }, key);

test('presigned POST policy pins bucket, key, type, exact length, and required fields', async () => {
  let received;
  const adapter = createS3StorageAdapter({ bucket: 'private-upload-bucket', client: {}, presignPost: async (client, input) => { received = input; return { url: 'https://private-upload-bucket.s3.example', fields: { key: input.Key } }; } });
  await adapter.createDirectUploadPost({ key: `incoming/${userId}/upload-id`, contentType: 'application/pdf', contentLength: 10, expiresInSeconds: 300 });
  assert.equal(received.Bucket, 'private-upload-bucket');
  assert.equal(received.Key, `incoming/${userId}/upload-id`);
  assert.deepEqual(received.Conditions, [
    { bucket: 'private-upload-bucket' },
    ['eq', '$key', `incoming/${userId}/upload-id`],
    ['eq', '$Content-Type', 'application/pdf'],
    ['eq', '$success_action_status', '201'],
    ['content-length-range', 10, 10]
  ]);
  assert.equal(received.Fields['Content-Type'], 'application/pdf');
  assert.equal(received.Fields.success_action_status, '201');
});

test('complete rejects an object/version not found under the session key', async () => {
  const storage = { createDirectUploadPost: async () => ({}), headObject: async ({ key, versionId }) => {
    assert.equal(key, `incoming/${userId}/${session.id}`);
    assert.equal(versionId, 'foreign-version');
    const error = new Error('not found'); error.name = 'NoSuchVersion'; throw error;
  } };
  const { quota, direct } = fixture({ storage });
  const session = await reserve(quota);
  await assert.rejects(() => direct.completeDirectUpload(userId, session.id, 'foreign-version'), { code: 'UPLOAD_OBJECT_NOT_FOUND', statusCode: 409 });
});

test('complete rejects a HEAD object whose size differs from reservation', async () => {
  const storage = { createDirectUploadPost: async () => ({}), headObject: async () => ({ contentLength: 9, contentType: 'application/pdf' }) };
  const { quota, direct } = fixture({ storage });
  const session = await reserve(quota);
  await assert.rejects(() => direct.completeDirectUpload(userId, session.id, 'v1'), { code: 'UPLOAD_SIZE_MISMATCH', statusCode: 409 });
});

test('complete rejects a HEAD object whose content type differs from the signed declaration', async () => {
  const storage = { createDirectUploadPost: async () => ({}), headObject: async () => ({ contentLength: 10, contentType: 'image/png' }) };
  const { quota, direct } = fixture({ storage });
  const session = await reserve(quota);
  await assert.rejects(() => direct.completeDirectUpload(userId, session.id, 'v1'), { code: 'UPLOAD_CONTENT_TYPE_MISMATCH', statusCode: 409 });
});

test('complete maps a transient HEAD failure without binding a source version', async () => {
  const storage = { createDirectUploadPost: async () => ({}), headObject: async () => { throw new Error('S3 unavailable'); } };
  const { quota, direct, sessions } = fixture({ storage });
  const session = await reserve(quota);
  await assert.rejects(() => direct.completeDirectUpload(userId, session.id, 'v1'), { code: 'STORAGE_HEAD_FAILED', statusCode: 502 });
  assert.equal(sessions[0].source_version_id, undefined);
  assert.equal(sessions[0].status, 'RESERVED');
});

test('complete is ownership-scoped before it calls storage HEAD', async () => {
  let headed = false;
  const storage = { createDirectUploadPost: async () => ({}), headObject: async () => { headed = true; return { contentLength: 10, contentType: 'application/pdf' }; } };
  const { quota, direct } = fixture({ storage });
  const session = await reserve(quota);
  await assert.rejects(() => direct.completeDirectUpload(otherUserId, session.id, 'v1'), { code: 'NOT_FOUND', statusCode: 404 });
  assert.equal(headed, false);
});

test('same-version repeated and concurrent complete calls bind exactly once', async () => {
  let heads = 0;
  const storage = { createDirectUploadPost: async () => ({}), headObject: async () => { heads += 1; return { contentLength: 10, contentType: 'application/pdf' }; } };
  const { quota, direct, sessions } = fixture({ storage });
  const session = await reserve(quota);
  const results = await Promise.all([direct.completeDirectUpload(userId, session.id, 'v1'), direct.completeDirectUpload(userId, session.id, 'v1')]);
  assert.equal(results[0].source_version_id, 'v1');
  assert.equal(results[1].source_version_id, 'v1');
  assert.equal(sessions[0].status, 'UPLOADED');
  assert.ok(heads >= 1);
  await assert.rejects(() => direct.completeDirectUpload(userId, session.id, 'v2'), { code: 'UPLOAD_VERSION_CONFLICT', statusCode: 409 });
});

test('concurrent completion with different versions binds one version and conflicts the other', async () => {
  const storage = { createDirectUploadPost: async () => ({}), headObject: async () => ({ contentLength: 10, contentType: 'application/pdf' }) };
  const { quota, direct, sessions } = fixture({ storage });
  const session = await reserve(quota);
  const results = await Promise.allSettled([direct.completeDirectUpload(userId, session.id, 'v1'), direct.completeDirectUpload(userId, session.id, 'v2')]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected')[0].reason.code, 'UPLOAD_VERSION_CONFLICT');
  assert.ok(['v1', 'v2'].includes(sessions[0].source_version_id));
});

test('an expired session cannot issue or complete a direct upload', async () => {
  let current = initialNow;
  const storage = { createDirectUploadPost: async () => ({}), headObject: async () => ({ contentLength: 10, contentType: 'application/pdf' }) };
  const { quota, direct, sessions } = fixture({ storage, now: () => current });
  const session = await reserve(quota);
  current = new Date(initialNow.getTime() + 16 * 60 * 1000);
  await assert.rejects(() => direct.issuePresignedPost(userId, session.id), { code: 'UPLOAD_SESSION_EXPIRED', statusCode: 409 });
  await assert.rejects(() => direct.completeDirectUpload(userId, session.id, 'v1'), { code: 'UPLOAD_SESSION_EXPIRED', statusCode: 409 });
  assert.equal(sessions[0].status, 'EXPIRED');
});

test('a presign failure keeps the reserved session retryable without committing quota', async () => {
  let attempts = 0;
  const storage = { createDirectUploadPost: async () => { attempts += 1; if (attempts === 1) throw new Error('IAM unavailable'); return { url: 'https://s3.example', fields: { key: 'signed-key' } }; }, headObject: async () => ({}) };
  const { quota, direct, sessions } = fixture({ storage });
  const session = await reserve(quota);
  await assert.rejects(() => direct.issuePresignedPost(userId, session.id), { code: 'STORAGE_PRESIGN_FAILED', statusCode: 502 });
  assert.equal(sessions[0].status, 'RESERVED');
  assert.equal(sessions[0].source_version_id, undefined);
  const issued = await direct.issuePresignedPost(userId, session.id);
  assert.equal(issued.session.id, session.id);
  assert.equal(issued.presigned_post.url, 'https://s3.example');
});

test('an UPLOADED session cannot use the pre-validation commitQuota helper', async () => {
  const storage = { createDirectUploadPost: async () => ({}), headObject: async () => ({ contentLength: 10, contentType: 'application/pdf' }) };
  const { quota, direct, sessions } = fixture({ storage });
  const session = await reserve(quota);
  await direct.completeDirectUpload(userId, session.id, 'v1');
  await assert.rejects(() => quota.commitQuota(userId, session.id), { code: 'UPLOAD_SESSION_NOT_ACTIVE', statusCode: 409 });
  assert.equal(sessions[0].status, 'UPLOADED');
});

test('PENDING files are not downloadable before validation', async () => {
  const service = createFileService({ FileModel: { findOne: async ({ where }) => { assert.equal(where.status, 'READY'); return null; } } });
  await assert.rejects(() => service.getDownloadUrl(userId, 'file'), { code: 'NOT_FOUND' });
});

test('legacy multipart endpoint is explicitly disabled instead of bypassing direct-upload controls', async () => {
  const headers = new Map();
  let error;
  await legacyUploadRemoved({}, { set: (name, value) => headers.set(name, value) }, (nextError) => { error = nextError; });
  assert.equal(error.code, 'LEGACY_UPLOAD_DEPRECATED');
  assert.equal(error.statusCode, 410);
  assert.equal(headers.get('Deprecation'), 'true');
  assert.equal(headers.get('Link'), '</api/uploads>; rel="successor-version"');
});
