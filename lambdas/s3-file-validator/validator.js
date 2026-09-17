import { createHash } from 'node:crypto';

export const VALIDATOR_VERSION = 's3-file-validator/1';
export const REPORT_SCHEMA_VERSION = 'validator-report/v1';
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const INCOMING_PREFIX = 'incoming/';
const RESULT_PREFIX = 'processing-results/';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const decodeS3Key = (encodedKey) => decodeURIComponent(encodedKey.replace(/\+/g, ' '));

export const createReportId = ({ bucket, key, versionId, validatorVersion = VALIDATOR_VERSION }) => createHash('sha256')
  .update(`${validatorVersion}\0${bucket}\0${key}\0${versionId}`, 'utf8')
  .digest('hex');

const isPdf = (data) => data.length >= 10
  && data.subarray(0, 5).equals(Buffer.from('%PDF-'))
  && data.includes(Buffer.from('%%EOF'));

const isJpeg = (data) => data.length >= 4
  && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
  && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9;

const isPng = (data) => data.length >= PNG_SIGNATURE.length && data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
const hasPngPrefix = (data) => data.length > 0 && data.subarray(0, Math.min(data.length, PNG_SIGNATURE.length)).equals(PNG_SIGNATURE.subarray(0, Math.min(data.length, PNG_SIGNATURE.length)));

const validateText = (data) => {
  if (data.includes(0)) return { status: 'REJECTED', reasonCode: 'BINARY_TEXT', detectedMimeType: null };
  try {
    // UTF-8 only (BOM is permitted); fatal decoding rejects malformed byte sequences.
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
    // Permit normal whitespace but reject other C0 control characters as binary-like text.
    if (/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) {
      return { status: 'REJECTED', reasonCode: 'BINARY_TEXT', detectedMimeType: null };
    }
    return { status: 'PASSED', reasonCode: 'VALID', detectedMimeType: 'text/plain; charset=utf-8' };
  } catch {
    return { status: 'REJECTED', reasonCode: 'INVALID_TEXT_ENCODING', detectedMimeType: null };
  }
};

export const validateContent = (data, contentLength) => {
  if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > MAX_FILE_SIZE_BYTES || data.length > MAX_FILE_SIZE_BYTES) {
    return { status: 'REJECTED', reasonCode: 'FILE_TOO_LARGE', detectedMimeType: null };
  }
  if (data.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    return isPdf(data)
      ? { status: 'PASSED', reasonCode: 'VALID', detectedMimeType: 'application/pdf' }
      : { status: 'REJECTED', reasonCode: 'INVALID_PDF', detectedMimeType: null };
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return isJpeg(data)
      ? { status: 'PASSED', reasonCode: 'VALID', detectedMimeType: 'image/jpeg' }
      : { status: 'REJECTED', reasonCode: 'INVALID_JPEG', detectedMimeType: null };
  }
  if (hasPngPrefix(data)) {
    return isPng(data)
      ? { status: 'PASSED', reasonCode: 'VALID', detectedMimeType: 'image/png' }
      : { status: 'REJECTED', reasonCode: 'INVALID_PNG', detectedMimeType: null };
  }
  return validateText(data);
};

const bodyToBuffer = async (body) => {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body && typeof body.transformToByteArray === 'function') return Buffer.from(await body.transformToByteArray());
  if (!body || typeof body[Symbol.asyncIterator] !== 'function') throw new Error('S3 GetObject response body is unreadable');
  const chunks = [];
  let length = 0;
  for await (const chunk of body) {
    const bytes = Buffer.from(chunk);
    length += bytes.length;
    if (length > MAX_FILE_SIZE_BYTES) return Buffer.alloc(MAX_FILE_SIZE_BYTES + 1);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, length);
};

const reportFor = ({ bucket, key, versionId, verdict }) => ({
  schema_version: REPORT_SCHEMA_VERSION,
  validator_version: VALIDATOR_VERSION,
  report_id: createReportId({ bucket, key, versionId }),
  status: verdict.status,
  reason_code: verdict.reasonCode,
  detected_mime_type: verdict.detectedMimeType,
  source: { bucket, key, version_id: versionId }
});

export const createValidator = ({ storage }) => {
  const processRecord = async (record) => {
    const bucket = record?.s3?.bucket?.name;
    const encodedKey = record?.s3?.object?.key;
    const versionId = record?.s3?.object?.versionId;
    if (!bucket || !encodedKey || !versionId) throw new Error('S3 ObjectCreated record must contain bucket, key, and versionId');
    const key = decodeS3Key(encodedKey);
    if (!key.startsWith(INCOMING_PREFIX)) return { skipped: true, key };

    // This read deliberately pins VersionId; current-object reads are unsafe in a versioned bucket.
    const object = await storage.getObject({ bucket, key, versionId });
    const body = await bodyToBuffer(object.body);
    const verdict = validateContent(body, object.contentLength);
    const report = reportFor({ bucket, key, versionId, verdict });
    await storage.putObject({
      bucket,
      key: `${RESULT_PREFIX}${report.report_id}.json`,
      body: JSON.stringify(report),
      contentType: 'application/json'
    });
    return { skipped: false, report };
  };

  const handle = async (event) => {
    if (!Array.isArray(event?.Records)) throw new Error('S3 event must contain Records');
    const results = [];
    for (const record of event.Records) results.push(await processRecord(record));
    return results;
  };

  return { handle, processRecord };
};
