import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFileService } from '../src/services/file.service.js';
import { validateIdParam, validateFileList, validateFolderPayload } from '../src/middleware/validation.middleware.js';

const userId = '25f00dbf-4788-4b4b-8edc-e79877090f23';
const fileId = '3d7549e0-41a4-4d31-94c6-2d30b6e430ea';
const upload = { originalname: 'report.pdf', mimetype: 'application/pdf', size: 3, buffer: Buffer.from('pdf') };

test('S3 upload failure does not create completed metadata', async () => {
  let createCalls = 0;
  const service = createFileService({
    FileModel: { create: async () => { createCalls += 1; } },
    storage: { uploadToS3: async () => { throw new Error('AWS access denied'); } }
  });

  await assert.rejects(() => service.uploadFile(userId, { file: upload }), { code: 'STORAGE_UPLOAD_FAILED', statusCode: 502 });
  assert.equal(createCalls, 0);
});

test('S3 delete failure retains metadata for retry', async () => {
  let destroyed = false;
  const service = createFileService({
    FileModel: { findOne: async () => ({ s3_key: 'users/x/file.pdf', destroy: async () => { destroyed = true; } }) },
    storage: { deleteFromS3: async () => { throw new Error('S3 timeout'); } }
  });

  await assert.rejects(() => service.deleteFile(userId, fileId), { code: 'STORAGE_DELETE_FAILED', statusCode: 502 });
  assert.equal(destroyed, false);
});

test('presign failure does not return a public URL', async () => {
  const service = createFileService({
    FileModel: { findOne: async () => ({ id: fileId, file_name: 'report.pdf', original_name: 'report.pdf', s3_key: 'private/key' }) },
    storage: { generatePresignedDownloadUrl: async () => { throw new Error('credential error'); } }
  });

  await assert.rejects(() => service.getDownloadUrl(userId, fileId), { code: 'STORAGE_PRESIGN_FAILED', statusCode: 502 });
});

const runMiddleware = (middleware, req) => new Promise((resolve) => middleware(req, {}, (error) => resolve(error)));

test('invalid UUID, pagination, and payload types are rejected', async () => {
  const invalidId = await runMiddleware(validateIdParam, { params: { id: 'not-a-uuid' } });
  const invalidPage = await runMiddleware(validateFileList, { query: { page_size: '101' } });
  const invalidName = await runMiddleware(validateFolderPayload, { body: { name: 7 } });

  for (const error of [invalidId, invalidPage, invalidName]) {
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(error.statusCode, 400);
  }
});

test('file and folder names are assigned with textContent, never interpolated into markup', async () => {
  const source = await readFile(new URL('../public/js/app.js', import.meta.url), 'utf8');
  assert.match(source, /folder-name'\)\.textContent = folder\.name/);
  assert.match(source, /file-name'\)\.textContent = file\.file_name/);
});
