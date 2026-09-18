import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('deployment DB TLS verifies both issuer and hostname and fails closed on missing CA', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cfm-tls-test-'));
  const previous = process.env.DB_SSL_CA;
  try {
    const ca = join(directory, 'test-ca.pem');
    // A fixture string checks configuration only; no connection or certificate validation is claimed.
    await writeFile(ca, 'test CA fixture');
    process.env.DB_SSL_CA = ca;
    const { sequelize } = await import('../src/config/database.js?phase9-tls');
    assert.equal(sequelize.options.dialectOptions.ssl.ca, 'test CA fixture');
    assert.equal(sequelize.options.dialectOptions.ssl.rejectUnauthorized, true);
    assert.equal(sequelize.options.dialectOptions.ssl.verifyIdentity, true);
    await sequelize.close();
    process.env.DB_SSL_CA = join(directory, 'missing.pem');
    await assert.rejects(import('../src/config/database.js?phase9-missing'), { code: 'ENOENT' });
  } finally {
    if (previous === undefined) delete process.env.DB_SSL_CA;
    else process.env.DB_SSL_CA = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
