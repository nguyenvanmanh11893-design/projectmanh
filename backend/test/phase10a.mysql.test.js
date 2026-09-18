import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Job, sequelize } from '../src/models/index.js';
import { logContext } from '../src/utils/logger.js';
import { createJobService } from '../src/services/job.service.js';

test('MySQL: correlation survives persistence and concurrent claims; stale lease cannot fail job', { skip: process.env.MYSQL_TEST_ENABLED !== 'true' }, async () => {
  const id = randomUUID(); const request_id = randomUUID();
  try {
    await logContext.run({ request_id }, () => Job.create({ id, type: 'FINALIZE_UPLOAD', payload: {}, run_at: new Date(0), next_attempt_at: new Date(0) }));
    const jobs = createJobService({ JobModel: Job.scope({ where: { id } }) });
    const claims = await Promise.all([jobs.claimNext('test-one'), jobs.claimNext('test-two')]);
    assert.equal(claims.filter(Boolean).length, 1);
    assert.equal(claims.find(Boolean).job.request_id, request_id);
    assert.equal(await jobs.fail(id, randomUUID(), new Error('sensitive')), false);
    assert.equal((await Job.findByPk(id)).status, 'RUNNING');
    assert.equal(await jobs.fail(id, claims.find(Boolean).leaseToken, new Error('sensitive')), true);
    assert.equal((await Job.findByPk(id)).request_id, request_id);
    assert.ok(!(await Job.findByPk(id)).last_error.includes('sensitive'));
  } finally {
    await Job.destroy({ where: { id } });
    await sequelize.close();
  }
});
