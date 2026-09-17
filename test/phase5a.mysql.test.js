// This test intentionally uses the application's configured Sequelize pool so
// two concurrent service calls obtain real InnoDB transactions. It is opt-in:
// point DB_* at a disposable, already-migrated MySQL database and set
// MYSQL_TEST_ENABLED=true. The test command loads .env but this test never
// reads the file directly or logs connection values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sequelize, User, UploadSession } from '../src/models/index.js';
import { reserveQuota, releaseQuota, getUploadSession } from '../src/services/quota.service.js';

const enabled = process.env.MYSQL_TEST_ENABLED === 'true';

test('MySQL: quota locking, retry, release, and ownership hold under concurrent calls', { skip: !enabled }, async () => {
  const userA = randomUUID();
  const userB = randomUUID();
  const baseUser = (id) => ({ id, username: `quota-${id}`, email: `quota-${id}@example.test`, password_hash: 'test-only-hash', quota_bytes: '100', used_bytes: '0', reserved_bytes: '0' });
  try {
    await User.bulkCreate([baseUser(userA), baseUser(userB)]);
    const payload = { requested_size: 60, declared_mime_type: 'application/pdf', folder_id: null };
    const concurrent = await Promise.allSettled([reserveQuota(userA, payload, 'mysql-one'), reserveQuota(userA, payload, 'mysql-two')]);
    assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(concurrent.filter((result) => result.status === 'rejected')[0].reason.code, 'QUOTA_EXCEEDED');

    const user = await User.findByPk(userA);
    assert.equal(user.reserved_bytes, '60');
    const first = concurrent.find((result) => result.status === 'fulfilled').value;
    const retry = await reserveQuota(userA, payload, first.idempotency_key);
    assert.equal(retry.id, first.id);
    assert.equal((await User.findByPk(userA)).reserved_bytes, '60');
    await releaseQuota(userA, first.id);
    await releaseQuota(userA, first.id);
    assert.equal((await User.findByPk(userA)).reserved_bytes, '0');
    await assert.rejects(() => getUploadSession(userB, first.id), { code: 'NOT_FOUND', statusCode: 404 });
  } finally {
    await UploadSession.destroy({ where: { user_id: [userA, userB] } });
    await User.destroy({ where: { id: [userA, userB] } });
    await sequelize.close();
  }
});
