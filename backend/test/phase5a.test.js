import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuotaService } from '../src/services/quota.service.js';
import { createFileService } from '../src/services/file.service.js';

const userA = '25f00dbf-4788-4b4b-8edc-e79877090f23';
const userB = '3d7549e0-41a4-4d31-94c6-2d30b6e430ea';
const fixedNow = new Date('2026-09-17T12:00:00.000Z');

const makeFixture = ({ quota = '100', used = '0' } = {}) => {
  const users = new Map([[userA, { id: userA, quota_bytes: quota, used_bytes: used, reserved_bytes: '0' }], [userB, { id: userB, quota_bytes: quota, used_bytes: '0', reserved_bytes: '0' }]]);
  const sessions = [];
  const attach = (row) => Object.assign(row, { save: async () => row });
  let queue = Promise.resolve();
  const db = { transaction: async (callback) => {
    const previous = queue;
    let finish;
    queue = new Promise((resolve) => { finish = resolve; });
    await previous;
    try { return await callback({ LOCK: { UPDATE: 'UPDATE' } }); } finally { finish(); }
  } };
  const UploadSessionModel = {
    findAll: async ({ where }) => sessions.filter((session) => session.user_id === where.user_id && ['RESERVED', 'UPLOADING'].includes(session.status) && session.expires_at <= where.expires_at[Object.getOwnPropertySymbols(where.expires_at)[0]]),
    findOne: async ({ where }) => sessions.find((session) => session.user_id === where.user_id && (where.idempotency_key ? session.idempotency_key === where.idempotency_key : session.id === where.id)) || null,
    count: async ({ where }) => sessions.filter((session) => session.user_id === where.user_id && ['RESERVED', 'UPLOADING'].includes(session.status) && session.expires_at > where.expires_at[Object.getOwnPropertySymbols(where.expires_at)[0]]).length,
    create: async (row) => { const session = attach({ ...row }); sessions.push(session); return session; }
  };
  const UserModel = { findByPk: async (id) => { const user = users.get(id); return user ? attach(user) : null; } };
  const service = createQuotaService({ sequelizeInstance: db, UserModel, FolderModel: { findOne: async () => null }, UploadSessionModel, now: () => fixedNow });
  return { service, users, sessions };
};

test('concurrent reservations cannot both exceed the same quota', async () => {
  const { service, users } = makeFixture();
  const payload = { requested_size: 60, declared_mime_type: 'application/pdf', folder_id: null };
  const results = await Promise.allSettled([service.reserveQuota(userA, payload, 'one'), service.reserveQuota(userA, payload, 'two')]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected')[0].reason.code, 'QUOTA_EXCEEDED');
  assert.equal(users.get(userA).reserved_bytes, '60');
});

test('a same-payload idempotency retry does not reserve quota twice', async () => {
  const { service, users } = makeFixture();
  const payload = { requested_size: 40, declared_mime_type: 'application/pdf', folder_id: null };
  const first = await service.reserveQuota(userA, payload, 'retry-key');
  const retry = await service.reserveQuota(userA, payload, 'retry-key');
  assert.equal(retry.id, first.id);
  assert.equal(users.get(userA).reserved_bytes, '40');
  await assert.rejects(() => service.reserveQuota(userA, { ...payload, requested_size: 41 }, 'retry-key'), { code: 'IDEMPOTENCY_CONFLICT' });
});

test('releasing a session twice cannot make reserved quota negative', async () => {
  const { service, users } = makeFixture();
  const session = await service.reserveQuota(userA, { requested_size: 40, declared_mime_type: 'application/pdf', folder_id: null }, 'release-key');
  await service.releaseQuota(userA, session.id);
  await service.releaseQuota(userA, session.id);
  assert.equal(users.get(userA).reserved_bytes, '0');
});

test('a user cannot read another user upload session', async () => {
  const { service } = makeFixture();
  const session = await service.reserveQuota(userA, { requested_size: 40, declared_mime_type: 'application/pdf', folder_id: null }, 'read-key');
  await assert.rejects(() => service.getUploadSession(userB, session.id), { code: 'NOT_FOUND', statusCode: 404 });
});

test('PENDING files remain unavailable for download', async () => {
  const service = createFileService({ FileModel: { findOne: async ({ where }) => { assert.equal(where.status, 'READY'); return null; } } });
  await assert.rejects(() => service.getDownloadUrl(userA, 'file'), { code: 'NOT_FOUND' });
});
