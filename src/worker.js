import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { sequelize } from './config/database.js';
import { validateConfig } from './config/validate-config.js';
import { createS3StorageAdapter } from './services/s3-storage.adapter.js';
import { createJobService, FINALIZE_UPLOAD } from './services/job.service.js';
import { createFinalizeUploadService } from './services/finalize-upload.service.js';
import { createWorkerShutdown } from './services/worker-shutdown.js';

const pollMs = Math.max(100, Number.parseInt(process.env.WORKER_POLL_MS || '1000', 10) || 1000);
const shutdownMs = Math.max(1_000, Number.parseInt(process.env.WORKER_SHUTDOWN_MS || '25000', 10) || 25000);
const leaseMs = Math.max(10_000, Number.parseInt(process.env.WORKER_LEASE_MS || '60000', 10) || 60000);
const workerId = `${process.pid}-${randomUUID()}`;
let stopping = false;
let active = null;
let stopHeartbeat = () => {};

const jobs = createJobService({ leaseMs });
const finalizer = createFinalizeUploadService({ storage: createS3StorageAdapter() });

async function runOne() {
  const claimed = await jobs.claimNext(workerId);
  if (!claimed) return false;
  if (stopping) return false; // A claim racing SIGTERM recovers by lease expiry.
  active = claimed;
  const heartbeat = setInterval(() => {
    jobs.renew(claimed.job.id, claimed.leaseToken).catch(() => {});
  }, Math.max(1_000, Math.floor(leaseMs / 3)));
  stopHeartbeat = () => clearInterval(heartbeat);
  try {
    if (claimed.job.type !== FINALIZE_UPLOAD) throw new Error(`Unsupported job type: ${claimed.job.type}`);
    await finalizer.process(claimed);
  } catch (error) {
    // This is fenced: a worker whose lease expired cannot requeue a newer run.
    await jobs.fail(claimed.job.id, claimed.leaseToken, error);
  } finally { clearInterval(heartbeat); active = null; }
  return true;
}

async function main() {
  validateConfig();
  await sequelize.authenticate();
  while (!stopping) {
    const didWork = await runOne();
    if (!didWork && !stopping) await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

// No early requeue of an in-flight copy. Stopping renewals lets lease expiry
// recover the durable job when the hard deadline terminates a stuck process.
const shutdown = createWorkerShutdown({ timeoutMs: shutdownMs,
  stop: () => { stopping = true; stopHeartbeat(); }, isActive: () => Boolean(active),
  close: () => sequelize.close(), exit: (code) => process.exit(code) });

process.once('SIGTERM', () => { shutdown('SIGTERM'); });
process.once('SIGINT', () => { shutdown('SIGINT'); });
main().catch(() => { console.error('Worker stopped: database or configuration unavailable'); process.exit(1); });
