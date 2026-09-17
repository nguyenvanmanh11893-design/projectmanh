import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FILE_SIZE_BYTES, createReportId, createValidator, validateContent } from '../lambdas/s3-file-validator/validator.js';

const incomingKey = 'incoming/user id/upload id';
const event = (key = 'incoming/user+id/upload+id', versionId = 'v1') => ({ Records: [{ s3: { bucket: { name: 'private-bucket' }, object: { key, versionId } } }] });
const pdf = Buffer.from('%PDF-1.7\nhello\n%%EOF');
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

test('validates actual PDF, JPEG, PNG, and UTF-8 TXT content, independent of claimed MIME', () => {
  assert.equal(validateContent(pdf, pdf.length).detectedMimeType, 'application/pdf');
  assert.equal(validateContent(jpeg, jpeg.length).detectedMimeType, 'image/jpeg');
  assert.equal(validateContent(png, png.length).detectedMimeType, 'image/png');
  assert.equal(validateContent(Buffer.from('chào thế giới\n', 'utf8'), 16).detectedMimeType, 'text/plain; charset=utf-8');
});

test('rejects malformed samples for PDF, JPEG, PNG and binary or invalidly encoded text', () => {
  assert.equal(validateContent(Buffer.from('%PDF-1.7'), 8).reasonCode, 'INVALID_PDF');
  assert.equal(validateContent(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 4).reasonCode, 'INVALID_JPEG');
  assert.equal(validateContent(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]), 5).reasonCode, 'INVALID_PNG');
  assert.equal(validateContent(Buffer.from([0x68, 0x69, 0x00]), 3).reasonCode, 'BINARY_TEXT');
  assert.equal(validateContent(Buffer.from([0xc3, 0x28]), 2).reasonCode, 'INVALID_TEXT_ENCODING');
});

test('rejects an object exceeding 50 MiB before accepting its content', () => {
  assert.equal(validateContent(Buffer.from('text'), MAX_FILE_SIZE_BYTES + 1).reasonCode, 'FILE_TOO_LARGE');
});

test('decodes URL-encoded S3 keys and writes a version-pinned report without file content', async () => {
  const writes = [];
  const validator = createValidator({ storage: {
    getObject: async (input) => { assert.deepEqual(input, { bucket: 'private-bucket', key: incomingKey, versionId: 'v1' }); return { contentLength: pdf.length, body: pdf, contentType: 'application/octet-stream' }; },
    putObject: async (input) => writes.push(input)
  } });
  const [result] = await validator.handle(event());
  assert.equal(result.report.status, 'PASSED');
  assert.equal(writes[0].key, `processing-results/${result.report.report_id}.json`);
  assert.doesNotMatch(writes[0].body, /hello/);
  assert.equal(JSON.parse(writes[0].body).source.version_id, 'v1');
});

test('duplicate events use one deterministic business report and different versions use distinct reports', async () => {
  const writes = [];
  const validator = createValidator({ storage: { getObject: async () => ({ contentLength: 2, body: Buffer.from('ok') }), putObject: async ({ key }) => writes.push(key) } });
  await validator.handle({ Records: [...event().Records, ...event().Records, ...event(undefined, 'v2').Records] });
  assert.equal(writes[0], writes[1]);
  assert.notEqual(writes[0], writes[2]);
  assert.equal(createReportId({ bucket: 'private-bucket', key: incomingKey, versionId: 'v1' }), createReportId({ bucket: 'private-bucket', key: incomingKey, versionId: 'v1' }));
});

test('skips non-incoming records to prevent report loops and requires a version ID', async () => {
  const validator = createValidator({ storage: { getObject: async () => assert.fail('must not read'), putObject: async () => assert.fail('must not write') } });
  const [result] = await validator.handle(event('processing-results/abc.json'));
  assert.equal(result.skipped, true);
  await assert.rejects(() => validator.handle({ Records: [{ s3: { bucket: { name: 'private-bucket' }, object: { key: 'incoming/a' } } }] }), /versionId/);
});

test('S3 read and report-write failures reject so Lambda can retry rather than creating REJECTED reports', async () => {
  const readFailure = createValidator({ storage: { getObject: async () => { throw new Error('S3 timeout'); }, putObject: async () => assert.fail('must not write') } });
  await assert.rejects(() => readFailure.handle(event()), /S3 timeout/);
  const writeFailure = createValidator({ storage: { getObject: async () => ({ contentLength: 2, body: Buffer.from('ok') }), putObject: async () => { throw new Error('S3 write timeout'); } } });
  await assert.rejects(() => writeFailure.handle(event()), /S3 write timeout/);
});
