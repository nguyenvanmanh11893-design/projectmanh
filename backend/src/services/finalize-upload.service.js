import { createHash } from 'node:crypto';
import { sequelize, User, UploadSession, File, Job, AuditEvent } from '../models/index.js';
import { recordAuditEvent } from './audit.service.js';
import { S3_BUCKET_NAME } from '../config/aws.js';

const VALIDATOR_VERSION = 's3-file-validator/1';
const reportId = ({ bucket, key, versionId }) => createHash('sha256').update(`${VALIDATOR_VERSION}\0${bucket}\0${key}\0${versionId}`, 'utf8').digest('hex');
const extensions = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'text/plain; charset=utf-8': 'txt' };
const reasons = ['VALID', 'FILE_TOO_LARGE', 'UNSUPPORTED_CONTENT', 'INVALID_PDF', 'INVALID_JPEG', 'INVALID_PNG', 'INVALID_TEXT_ENCODING', 'BINARY_TEXT'];
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value, keys) => Object.keys(value).every((key) => keys.includes(key));
const version = (value) => typeof value === 'string' && value.length > 0 && value.length <= 1024 && value !== 'null';

export class InvalidReportError extends Error {}
export class LeaseLostError extends Error {}

export const validateReport = (report, session, bucket) => {
  if (!object(report) || !onlyKeys(report, ['schema_version', 'validator_version', 'report_id', 'status', 'reason_code', 'detected_mime_type', 'source'])
    || report.schema_version !== 'validator-report/v1' || report.validator_version !== VALIDATOR_VERSION
    || !['PASSED', 'REJECTED'].includes(report.status) || !reasons.includes(report.reason_code)
    || ('detected_mime_type' in report && report.detected_mime_type !== null && typeof report.detected_mime_type !== 'string')
    || !object(report.source) || !onlyKeys(report.source, ['bucket', 'key', 'version_id'])
    || typeof bucket !== 'string' || !bucket || report.source.bucket !== bucket
    || !session.incoming_key?.startsWith('incoming/') || report.source.key !== session.incoming_key
    || !version(session.source_version_id) || report.source.version_id !== session.source_version_id
    || report.report_id !== reportId({ bucket, key: session.incoming_key, versionId: session.source_version_id })
    || (report.status === 'PASSED' && (report.reason_code !== 'VALID' || !Object.hasOwn(extensions, report.detected_mime_type)))
    || (report.status === 'REJECTED' && report.reason_code === 'VALID')) {
    throw new InvalidReportError('Invalid validator report');
  }
  return report;
};

export const createFinalizeUploadService = ({ sequelizeInstance = sequelize, UserModel = User, UploadSessionModel = UploadSession, FileModel = File, JobModel = Job, AuditEventModel = AuditEvent, storage, bucket = S3_BUCKET_NAME, now = () => new Date() } = {}) => {
  if (!storage) throw new Error('Finalize storage adapter is required');
  const assertLease = (job, token) => {
    if (!job || job.status !== 'RUNNING' || job.lease_token !== token || !job.locked_until || new Date(job.locked_until) <= now()) throw new LeaseLostError('Job lease is no longer valid');
  };
  const succeed = async (job, transaction) => {
    job.status = 'SUCCEEDED'; job.locked_at = job.locked_until = job.locked_by = job.lease_token = null;
    await job.save({ transaction });
  };
  const subtractReservation = (user, amount) => {
    if (!user || BigInt(user.reserved_bytes) < amount) throw new Error('Quota invariant violated');
    user.reserved_bytes = (BigInt(user.reserved_bytes) - amount).toString();
  };

  const process = async ({ job, leaseToken }) => {
    const sessionId = job.payload?.upload_session_id;
    const row = await UploadSessionModel.findByPk(sessionId);
    const snapshot = row && (row.get ? row.get({ plain: true }) : { ...row });
    // Quota API uses user -> session. Never hold session while waiting for user.
    const transition = (report, copy) => sequelizeInstance.transaction(async (transaction) => {
      const lockedJob = await JobModel.findOne({ where: { id: job.id }, transaction, lock: transaction.LOCK.UPDATE });
      assertLease(lockedJob, leaseToken);
      if (lockedJob.payload.upload_session_id !== sessionId || lockedJob.payload.file_id !== job.payload.file_id) throw new Error('Job payload changed');
      const user = snapshot && await UserModel.findByPk(snapshot.user_id, { transaction, lock: transaction.LOCK.UPDATE });
      const session = await UploadSessionModel.findByPk(sessionId, { transaction, lock: transaction.LOCK.UPDATE });
      assertLease(lockedJob, leaseToken); // Locks may have waited past expiry.
      if (!session || ['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(session.status)) {
        await succeed(lockedJob, transaction);
        return { terminal: true };
      }
      if (!snapshot || session.user_id !== snapshot.user_id || session.status !== 'UPLOADED'
        || session.incoming_key !== snapshot.incoming_key || session.source_version_id !== snapshot.source_version_id) throw new Error('Upload binding changed');
      const expired = new Date(session.expires_at) <= now();
      if (!expired && !report) return { terminal: false };
      const amount = BigInt(session.requested_size);
      subtractReservation(user, amount);
      let file;
      if (expired || report.status === 'REJECTED') {
        session.status = expired ? 'EXPIRED' : 'REJECTED';
        session.completed_at = now();
        await recordAuditEvent({ AuditEventModel, userId: session.user_id, action: expired ? 'upload.expired_before_finalize' : 'upload.rejected', resourceType: 'upload_session', resourceId: session.id, metadata: { reason_code: expired ? 'SESSION_EXPIRED' : report.reason_code }, transaction });
      } else {
        validateReport(report, session, bucket);
        if (!version(copy?.versionId)) throw new Error('Missing immutable destination version');
        if (amount <= 0n || amount > 52428800n || BigInt(user.used_bytes) + BigInt(user.reserved_bytes) + amount > BigInt(user.quota_bytes)) throw new Error('Quota invariant violated');
        file = await FileModel.create({ id: job.payload.file_id, user_id: session.user_id, folder_id: session.folder_id,
          file_name: `upload-${session.id}`, original_name: `upload-${session.id}`, s3_key: `objects/${session.user_id}/${job.payload.file_id}`,
          s3_version_id: copy.versionId, mime_type: session.declared_mime_type, detected_mime_type: report.detected_mime_type,
          extension: extensions[report.detected_mime_type], file_size: amount.toString(), status: 'READY' }, { transaction });
        session.file_id = file.id; session.status = 'COMPLETED'; session.completed_at = now();
        user.used_bytes = (BigInt(user.used_bytes) + amount).toString();
        lockedJob.copy_version_id = copy.versionId;
        await recordAuditEvent({ AuditEventModel, userId: session.user_id, action: 'file.finalized', resourceType: 'file', resourceId: file.id, metadata: { upload_session_id: session.id, validator_version: report.validator_version }, transaction });
      }
      await user.save({ transaction });
      await session.save({ transaction });
      assertLease(lockedJob, leaseToken);
      await succeed(lockedJob, transaction);
      return { terminal: true, file };
    });

    if ((await transition()).terminal) return { terminal: true };
    let parsed;
    try { parsed = JSON.parse(await storage.getObjectText({ key: `processing-results/${reportId({ bucket, key: snapshot.incoming_key, versionId: snapshot.source_version_id })}.json` })); }
    catch (error) { if (error instanceof SyntaxError) throw new InvalidReportError('Validator report is not JSON'); throw error; }
    const report = validateReport(parsed, snapshot, bucket);
    if (report.status === 'REJECTED') return transition(report);
    if ((await transition()).terminal) return { terminal: true };
    const copy = await storage.copyObjectVersion({ sourceKey: snapshot.incoming_key, sourceVersionId: snapshot.source_version_id, destinationKey: `objects/${snapshot.user_id}/${job.payload.file_id}` });
    // COMMIT may succeed but lose its response. Never compensate by deleting
    // S3 here; retain surplus versions for reference-checked cleanup after grace.
    return transition(report, copy);
  };
  return { process, validateReport };
};
