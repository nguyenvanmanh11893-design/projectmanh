import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, logContext, redact } from '../src/utils/logger.js';
import { createReadiness } from '../src/services/health.service.js';
import { startWorkerObservability } from '../src/services/worker-observability.js';
import Job from '../src/models/Job.js';
import express from 'express';
import { requestId } from '../src/middleware/request-id.middleware.js';
import { once } from 'node:events';

test('logs remove nested secrets, signed URLs, arbitrary errors and circular objects', () => {
  const input = { cookie: 'canary', nested: { password: 'canary', message: 'https://s3.test/key?X-Amz-Signature=canary' }, error: new Error('canary'), headers: { x: 'canary' } };
  input.self = input;
  assert.ok(!JSON.stringify(redact(input)).includes('canary'));
});
test('concurrent async requests and durable jobs retain independent correlation', async () => {
  const lines = []; const log = createLogger((line) => lines.push(JSON.parse(line)));
  await Promise.all(['a', 'b'].map((request_id) => logContext.run({ request_id }, async () => {
    await new Promise((resolve) => setTimeout(resolve, request_id === 'a' ? 5 : 1));
    const job = Job.build({ type: 'RECONCILE', payload: {} });
    assert.equal(job.request_id, request_id);
    log('queued', { job_id: job.id });
  })));
  assert.deepEqual(lines.map((line) => line.request_id).sort(), ['a', 'b']);
  assert.ok(lines.every((line) => line.job_id));
  assert.equal(logContext.getStore(), undefined);
});
test('readiness handles DB down, timeout, recovery, concurrent probes and shutdown', async () => {
  let calls = 0; let release;
  const ready = createReadiness(() => { calls++; return new Promise((resolve) => { release = resolve; }); }, { timeoutMs: 10 });
  assert.deepEqual(await Promise.all([ready(), ready()]), [false, false]);
  assert.equal(calls, 1);
  release(); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(await createReadiness(async () => {})(), true);
  assert.equal(await createReadiness(async () => { throw new Error('secret'); })(), false);
  assert.equal(await createReadiness(() => { throw new Error('must not run'); }, { isStopping: () => true })(), false);
});
test('heartbeat emits stalled worker as unhealthy and stops late samples after shutdown', async () => {
  const events = []; let release;
  const stop = startWorkerObservability({ query: () => new Promise((resolve) => { release = resolve; }), healthy: () => true, emit: (...args) => events.push(args) });
  stop(); release([[{ backlog: 1 }]]); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events.length, 0);
  const stop2 = startWorkerObservability({ query: async () => [[{ backlog: '2', dead: '1', oldest: '600' }]], healthy: () => false, emit: (...args) => events.push(args) });
  await new Promise((resolve) => setImmediate(resolve)); stop2();
  assert.deepEqual(events[0][1], { heartbeat: 0, backlog: 2, dead: 1, oldest: 600 });
});

test('HTTP assigns server IDs, ignores malicious inbound ID and preserves async context', async () => {
  const app = express(); app.use(requestId);
  app.get('/', async (req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 2));
    res.json({ request_id: logContext.getStore().request_id });
  });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}`;
    const replies = await Promise.all([fetch(url, { headers: { 'X-Request-Id': 'untrusted-secret' } }), fetch(url)]);
    const ids = replies.map((response) => response.headers.get('x-request-id'));
    assert.notEqual(ids[0], ids[1]);
    for (let i = 0; i < replies.length; i++) {
      assert.match(ids[i], /^[0-9a-f-]{36}$/);
      assert.equal((await replies[i].json()).request_id, ids[i]);
    }
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

test('shutdown racing a successful readiness query remains unavailable', async () => {
  let stopping = false; let release;
  const ready = createReadiness(() => new Promise((resolve) => { release = resolve; }), { isStopping: () => stopping });
  const result = ready(); await new Promise((resolve) => setImmediate(resolve));
  stopping = true; release(); assert.equal(await result, false);
});
