import { sequelize, User, File, Job, AuditEvent } from '../models/index.js';
import { recordAuditEvent } from './audit.service.js';
import { LeaseLostError } from './finalize-upload.service.js';

const validVersion = (value) => typeof value === 'string' && value.length > 0 && value !== 'null';

export const createPurgeFileService = ({
  sequelizeInstance = sequelize, UserModel = User, FileModel = File, JobModel = Job,
  AuditEventModel = AuditEvent, storage, now = () => new Date()
} = {}) => {
  if (!storage) throw new Error('Purge storage adapter is required');
  const assertLease = (job, token) => {
    if (!job || job.status !== 'RUNNING' || job.lease_token !== token || !job.locked_until || new Date(job.locked_until) <= now()) throw new LeaseLostError('Job lease is no longer valid');
  };
  const succeed = async (job, transaction) => {
    job.status = 'SUCCEEDED'; job.locked_at = job.locked_until = job.locked_by = job.lease_token = null;
    await job.save({ transaction });
  };

  const process = async ({ job, leaseToken }) => {
    const fileId = job.payload?.file_id;
    const snapshotRow = fileId && await FileModel.findByPk(fileId);
    const snapshot = snapshotRow && (snapshotRow.get ? snapshotRow.get({ plain: true }) : { ...snapshotRow });

    const preflight = await sequelizeInstance.transaction(async (transaction) => {
      const lockedJob = await JobModel.findOne({ where: { id: job.id }, transaction, lock: transaction.LOCK.UPDATE });
      assertLease(lockedJob, leaseToken);
      if (lockedJob.payload?.file_id !== fileId) throw new Error('Job payload changed');
      const user = snapshot && await UserModel.findByPk(snapshot.user_id, { transaction, lock: transaction.LOCK.UPDATE });
      const file = fileId && await FileModel.findByPk(fileId, { transaction, lock: transaction.LOCK.UPDATE });
      assertLease(lockedJob, leaseToken);
      if (!file || !snapshot) throw new Error('Purge tombstone is missing');
      if (file.status === 'READY' || file.status === 'PURGED') {
        await succeed(lockedJob, transaction);
        return { terminal: true };
      }
      if (!user || file.user_id !== snapshot?.user_id || file.s3_key !== snapshot?.s3_key || !validVersion(file.s3_version_id)) throw new Error('Purge tombstone invariant violated');
      if (file.s3_key !== `objects/${file.user_id}/${file.id}`) throw new Error('Purge key is outside the owned objects namespace');
      if (!['TRASHED', 'PURGE_PENDING'].includes(file.status)) throw new Error('File is not purgeable');
      if (file.status === 'TRASHED') {
        file.status = 'PURGE_PENDING'; file.purge_requested_at = file.purge_requested_at || now();
        await file.save({ transaction });
        await recordAuditEvent({ AuditEventModel, userId: file.user_id, action: 'file.purge_started', resourceType: 'file', resourceId: file.id, metadata: { reason: 'retention_elapsed' }, transaction });
      }
      return { terminal: false, key: file.s3_key, userId: file.user_id, size: BigInt(file.file_size) };
    });
    if (preflight.terminal) return preflight;

    const versions = await storage.listExactObjectVersions({ key: preflight.key });
    if (versions.length) await storage.deleteObjectVersions({ objects: versions });
    // A successful DeleteObjects response is not enough: repeat the exact-key
    // inventory before releasing quota. Delete markers are included.
    if ((await storage.listExactObjectVersions({ key: preflight.key })).length) throw new Error('S3 purge verification found remaining versions');

    return sequelizeInstance.transaction(async (transaction) => {
      const lockedJob = await JobModel.findOne({ where: { id: job.id }, transaction, lock: transaction.LOCK.UPDATE });
      assertLease(lockedJob, leaseToken);
      const user = await UserModel.findByPk(preflight.userId, { transaction, lock: transaction.LOCK.UPDATE });
      const file = await FileModel.findByPk(fileId, { transaction, lock: transaction.LOCK.UPDATE });
      assertLease(lockedJob, leaseToken);
      if (file?.status === 'PURGED') { await succeed(lockedJob, transaction); return { terminal: true }; }
      if (!user || !file || file.user_id !== preflight.userId || file.status !== 'PURGE_PENDING' || file.s3_key !== preflight.key) throw new Error('Purge state changed');
      const amount = BigInt(file.file_size);
      if (amount < 0n || BigInt(user.used_bytes) < amount) throw new Error('Quota invariant violated');
      const previousFolderId = file.folder_id || null;
      user.used_bytes = (BigInt(user.used_bytes) - amount).toString();
      file.status = 'PURGED'; file.purged_at = now(); file.folder_id = null;
      await user.save({ transaction });
      await file.save({ transaction });
      await recordAuditEvent({ AuditEventModel, userId: file.user_id, action: 'file.purged', resourceType: 'file', resourceId: file.id, metadata: { bytes_released: amount.toString(), previous_folder_id: previousFolderId }, transaction });
      assertLease(lockedJob, leaseToken);
      await succeed(lockedJob, transaction);
      return { terminal: true };
    });
  };

  return { process };
};
