import { sequelize, User, UploadSession, Job, AuditEvent } from '../models/index.js';
import { recordAuditEvent } from './audit.service.js';
import { LeaseLostError } from './finalize-upload.service.js';

const ACTIVE = new Set(['RESERVED', 'UPLOADING', 'UPLOADED']);

export const createExpireUploadService = ({
  sequelizeInstance = sequelize, UserModel = User, UploadSessionModel = UploadSession,
  JobModel = Job, AuditEventModel = AuditEvent, now = () => new Date()
} = {}) => {
  const assertLease = (job, token) => {
    if (!job || job.status !== 'RUNNING' || job.lease_token !== token || !job.locked_until || new Date(job.locked_until) <= now()) throw new LeaseLostError('Job lease is no longer valid');
  };
  const unlock = (job) => { job.locked_at = job.locked_until = job.locked_by = job.lease_token = null; };

  const process = async ({ job, leaseToken }) => {
    const sessionId = job.payload?.upload_session_id;
    const snapshot = sessionId && await UploadSessionModel.findByPk(sessionId);
    return sequelizeInstance.transaction(async (transaction) => {
      const lockedJob = await JobModel.findOne({ where: { id: job.id }, transaction, lock: transaction.LOCK.UPDATE });
      assertLease(lockedJob, leaseToken);
      if (lockedJob.payload?.upload_session_id !== sessionId) throw new Error('Job payload changed');
      const user = snapshot && await UserModel.findByPk(snapshot.user_id, { transaction, lock: transaction.LOCK.UPDATE });
      const session = sessionId && await UploadSessionModel.findByPk(sessionId, { transaction, lock: transaction.LOCK.UPDATE });
      assertLease(lockedJob, leaseToken);
      if (!session || !ACTIVE.has(session.status)) {
        lockedJob.status = 'SUCCEEDED'; unlock(lockedJob); await lockedJob.save({ transaction });
        return { expired: false };
      }
      if (!user || session.user_id !== snapshot?.user_id) throw new Error('Upload expiry ownership invariant violated');
      const expiresAt = new Date(session.expires_at);
      if (expiresAt > now()) {
        lockedJob.status = 'QUEUED'; lockedJob.attempts = 0; lockedJob.last_error = null;
        lockedJob.run_at = lockedJob.next_attempt_at = expiresAt; unlock(lockedJob);
        await lockedJob.save({ transaction });
        return { expired: false };
      }
      const amount = BigInt(session.requested_size);
      if (amount <= 0n || BigInt(user.reserved_bytes) < amount) throw new Error('Quota invariant violated');
      user.reserved_bytes = (BigInt(user.reserved_bytes) - amount).toString();
      const previousStatus = session.status;
      session.status = 'EXPIRED'; session.completed_at = now();
      lockedJob.status = 'SUCCEEDED'; unlock(lockedJob);
      await user.save({ transaction });
      await session.save({ transaction });
      await recordAuditEvent({ AuditEventModel, userId: session.user_id, action: 'upload.expired', resourceType: 'upload_session', resourceId: session.id, metadata: { previous_status: previousStatus, waiting_for_report: previousStatus === 'UPLOADED' }, transaction });
      await lockedJob.save({ transaction });
      return { expired: true };
    });
  };

  return { process };
};
