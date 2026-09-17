import test from 'node:test';
import assert from 'node:assert/strict';
import { Op } from 'sequelize';
import { createFolderService } from '../src/services/folder.service.js';
import { createFileService } from '../src/services/file.service.js';

const userA = '25f00dbf-4788-4b4b-8edc-e79877090f23';
const userB = '3d7549e0-41a4-4d31-94c6-2d30b6e430ea';
const transaction = { LOCK: { UPDATE: 'UPDATE' } };
const db = { transaction: async (...args) => (typeof args[0] === 'function' ? args[0] : args[1])(transaction) };
const audit = { create: async (row) => row };

test('User A cannot move a file into User B folder', async () => {
  const service = createFileService({ sequelizeInstance: db, AuditEventModel: audit,
    FolderModel: { findOne: async ({ where }) => where.user_id === userA ? null : { id: where.id } },
    FileModel: { findOne: async () => ({ id: 'file', save: async () => {} }) } });
  await assert.rejects(() => service.moveFile(userA, 'file', { folder_id: 'other-folder' }), { code: 'NOT_FOUND', statusCode: 404 });
});

test('the eleventh folder level is rejected', async () => {
  let calls = 0;
  const service = createFolderService({ sequelizeInstance: db, AuditEventModel: audit, FileModel: {}, FolderModel: {
    findOne: async () => ({ id: `f-${calls++}`, parent_id: calls < 10 ? `p-${calls}` : null }), create: async () => assert.fail('must not create')
  } });
  await assert.rejects(() => service.createFolder(userA, { name: 'level-11', parent_id: 'p' }), { code: 'FOLDER_DEPTH_EXCEEDED', statusCode: 409 });
});

test('deleting a folder containing even a trashed file returns 409', async () => {
  const service = createFolderService({ sequelizeInstance: db, AuditEventModel: audit,
    FolderModel: { findOne: async ({ where }) => where.id ? { id: where.id, destroy: async () => assert.fail('must not destroy') } : null },
    FileModel: { findOne: async () => ({ status: 'TRASHED' }) } });
  await assert.rejects(() => service.deleteFolder(userA, 'folder'), { code: 'FOLDER_NOT_EMPTY', statusCode: 409 });
});

test('cursor pagination uses id as a tie-breaker and has no repeated static records', async () => {
  const rows = ['d', 'c', 'b', 'a'].map((id) => ({ id, created_at: '2026-01-01T00:00:00.000Z', get: (field) => field === 'created_at' ? '2026-01-01T00:00:00.000Z' : undefined }));
  const FileModel = { findAll: async ({ where, limit, order }) => {
    assert.deepEqual(order, [['created_at', 'DESC'], ['id', 'DESC']]);
    const tie = where[Op.and]?.[0]?.[Op.or]?.[1];
    const available = tie ? rows.filter((row) => row.id < tie.id[Op.lt]) : rows;
    return available.slice(0, limit);
  } };
  const service = createFileService({ FileModel, FolderModel: {}, AuditEventModel: audit, sequelizeInstance: db });
  const first = await service.listFiles(userA, { limit: 2 });
  const second = await service.listFiles(userA, { limit: 2, cursor: first.next_cursor });
  assert.deepEqual([...first.items, ...second.items].map((row) => row.id), ['d', 'c', 'b', 'a']);
});

test('duplicate names are allowed and audit metadata never copies secrets', async () => {
  const events = [];
  const service = createFolderService({ sequelizeInstance: db, FileModel: {}, AuditEventModel: { create: async (row) => { events.push(row); return row; } }, FolderModel: {
    create: async (row) => ({ ...row, id: 'folder-id' })
  } });
  await service.createFolder(userA, { name: 'same-name' }, { requestId: 'request-id' });
  await service.createFolder(userA, { name: 'same-name' }, { requestId: 'request-id' });
  assert.equal(events.length, 2);
  assert.equal(JSON.stringify(events).includes('password'), false);
  assert.equal(JSON.stringify(events).includes('secret'), false);
});
