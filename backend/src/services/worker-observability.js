import { log } from '../utils/logger.js';

// Sequential samples avoid overlapping queries during an outage. Missing samples
// alarm as unhealthy; a timer alone never claims the worker is healthy.
export function startWorkerObservability({ query, healthy, emit = log, intervalMs = 30000 }) {
  let stopped = false;
  let timer;
  async function sample() {
    try {
      const [rows] = await query(`SELECT
        SUM(status = 'QUEUED' AND next_attempt_at <= NOW()) AS backlog,
        SUM(status = 'DEAD') AS dead,
        COALESCE(MAX(CASE WHEN status = 'QUEUED' AND next_attempt_at <= NOW()
          THEN TIMESTAMPDIFF(SECOND, next_attempt_at, NOW())
          WHEN status = 'RUNNING' THEN TIMESTAMPDIFF(SECOND, locked_at, NOW()) ELSE 0 END), 0) AS oldest
        FROM jobs`);
      if (!stopped) emit('worker_sample', { heartbeat: healthy() ? 1 : 0,
        backlog: Number(rows[0].backlog || 0), dead: Number(rows[0].dead || 0), oldest: Number(rows[0].oldest || 0) });
    } catch { if (!stopped) emit('worker_sample_failed', {}, 'error'); }
    finally { if (!stopped) timer = setTimeout(sample, intervalMs); }
  }
  void sample();
  return () => { stopped = true; clearTimeout(timer); };
}
