import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatDate, formatFileStatus, formatActivityAction } from '../src/lib/formatters.ts';
import { setCsrfToken, getCsrfToken, ApiError } from '../src/lib/api.ts';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../src/features/uploads/UploadContext.tsx';

test('Formatters: formatBytes correctly formats units', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1048576), '1.0 MB');
  assert.equal(formatBytes(52428800), '50.0 MB');
  assert.equal(formatBytes(1073741824), '1.0 GB');
});

test('Formatters: formatFileStatus returns proper Vietnamese labels and Antd tag colors', () => {
  assert.deepEqual(formatFileStatus('READY'), { label: 'Sẵn sàng', color: 'success' });
  assert.deepEqual(formatFileStatus('TRASHED'), { label: 'Thùng rác', color: 'error' });
  assert.deepEqual(formatFileStatus('PURGE_PENDING'), { label: 'Chờ xóa vĩnh viễn', color: 'volcano' });
  assert.deepEqual(formatFileStatus('LEGACY_UNVERIFIED'), { label: 'Chưa xác thực', color: 'warning' });
});

test('Formatters: formatActivityAction translates audit actions to Vietnamese', () => {
  assert.equal(formatActivityAction('file.uploaded'), 'Tải lên tệp');
  assert.equal(formatActivityAction('file.renamed'), 'Đổi tên tệp');
  assert.equal(formatActivityAction('file.moved'), 'Di chuyển tệp');
  assert.equal(formatActivityAction('file.trashed'), 'Đưa vào thùng rác');
  assert.equal(formatActivityAction('file.restored'), 'Khôi phục tệp');
  assert.equal(formatActivityAction('folder.created'), 'Tạo thư mục');
  assert.equal(formatActivityAction('folder.deleted'), 'Xóa thư mục');
});

test('Upload constraints: Allowed MIME types and max size 50 MiB', () => {
  assert.equal(MAX_FILE_SIZE, 50 * 1024 * 1024);
  assert.ok(ALLOWED_MIME_TYPES.has('application/pdf'));
  assert.ok(ALLOWED_MIME_TYPES.has('image/jpeg'));
  assert.ok(ALLOWED_MIME_TYPES.has('image/png'));
  assert.ok(ALLOWED_MIME_TYPES.has('text/plain'));
  assert.ok(!ALLOWED_MIME_TYPES.has('application/x-executable'));
  assert.ok(!ALLOWED_MIME_TYPES.has('application/zip'));
});

test('API Client: CSRF token state management', () => {
  setCsrfToken(null);
  assert.equal(getCsrfToken(), null);
  setCsrfToken('test-csrf-token-123');
  assert.equal(getCsrfToken(), 'test-csrf-token-123');
  setCsrfToken(null);
  assert.equal(getCsrfToken(), null);
});

test('API Client: ApiError preserves status code and backend error codes', () => {
  const err = new ApiError('File is too large', 400, 'PAYLOAD_TOO_LARGE', { max: 52428800 });
  assert.equal(err.name, 'ApiError');
  assert.equal(err.message, 'File is too large');
  assert.equal(err.statusCode, 400);
  assert.equal(err.code, 'PAYLOAD_TOO_LARGE');
  assert.deepEqual(err.details, { max: 52428800 });
});
