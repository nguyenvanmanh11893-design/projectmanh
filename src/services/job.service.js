import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { sequelize, Job } from '../models/index.js';

export const FINALIZE_UPLOAD = 'FINALIZE_UPLOAD';
export const DEFAULT_LEASE_MS = 60_000;
export const MAX_BACKOFF_MS = 15 * 60_000;

export const retryDelayMs = (attempt, random = Math.random) => {
  const capped = Math.min(MAX_BACKOFF_MS, 1_000 * (2 ** Math.max(0, attempt - 1)));
  // Full jitter avoids a thundering herd after an S3/RDS outage.
  return Math.min(capped, Math.floor(random() * (capped + 1)));
};

export const createJobService = ({ sequelizeInstance = sequelize, JobModel = Job, now = () => new Date(), random = Math.random, leaseMs = DEFAULT_LEASE_MS } = {}) => {
  const claimNext = async (workerId) => sequelizeInstance.transaction(async (transaction) => {
    let current = now();
    const job = await JobModel.findOne({
      where: {
        type: FINALIZE_UPLOAD,
        [Op.or]: [
          { status: 'QUEUED', next_attempt_at: { [Op.lte]: current } },
          { status: 'RUNNING', locked_until: { [Op.lte]: current } }
        ]
      },
      order: [['next_attempt_at', 'ASC'], ['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE
    });
    if (!job) return null;
    current = now(); // The row lock may have waited; start a fresh lease now.
    if (job.attempts >= job.max_attempts) {
      job.status = 'DEAD'; job.last_error = 'Retry limit exhausted before claim';
      job.locked_at = job.locked_until = job.locked_by = job.lease_token = null;
      await job.save({ transaction });
      return null;
    }
    const token = randomUUID();
    job.status = 'RUNNING';
    job.attempts += 1;
    job.locked_at = current;
    job.locked_until = new Date(current.getTime() + leaseMs);
    job.locked_by = workerId;
    job.lease_token = token;
    job.lease_generation = Number(job.lease_generation || 0) + 1;
    await job.save({ transaction });
    return { job: job.get ? job.get({ plain: true }) : { ...job }, leaseToken: token };
  });

  const finish = async (jobId, leaseToken) => sequelizeInstance.transaction(async (transaction) => {
    const job = await JobModel.findOne({ where: { id: jobId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!job || job.status !== 'RUNNING' || job.lease_token !== leaseToken || !job.locked_until || new Date(job.locked_until) <= now()) return false;
    job.status = 'SUCCEEDED'; job.locked_at = job.locked_until = job.locked_by = job.lease_token = null;
    await job.save({ transaction });
    return true;
  });

  const renew = async (jobId, leaseToken) => sequelizeInstance.transaction(async (transaction) => {
    const job = await JobModel.findOne({ where: { id: jobId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!job || job.status !== 'RUNNING' || job.lease_token !== leaseToken || new Date(job.locked_until) <= now()) return false;
    job.locked_until = new Date(now().getTime() + leaseMs);
    await job.save({ transaction });
    return true;
  });

  const fail = async (jobId, leaseToken, error) => sequelizeInstance.transaction(async (transaction) => {
    const job = await JobModel.findOne({ where: { id: jobId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!job || job.status !== 'RUNNING' || job.lease_token !== leaseToken || !job.locked_until || new Date(job.locked_until) <= now()) return false;
    // SDK/SQL error messages may include signed URLs or SQL bind values.
    job.last_error = ['InvalidReportError', 'LeaseLostError'].includes(error?.constructor?.name) ? error.constructor.name : 'FINALIZE_ATTEMPT_FAILED';
    job.locked_at = job.locked_until = job.locked_by = job.lease_token = null;
    if (job.attempts >= job.max_attempts) job.status = 'DEAD';
    else {
      job.status = 'QUEUED';
      job.next_attempt_at = job.run_at = new Date(now().getTime() + retryDelayMs(job.attempts, random));
    }
    await job.save({ transaction });
    return true;
  });

  return { claimNext, finish, fail, renew };
};
