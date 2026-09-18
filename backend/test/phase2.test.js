import test from 'node:test';
import assert from 'node:assert/strict';
import { toUnsignedBigIntString } from '../src/utils/bigint.js';
import * as coreMigration from '../database/migrations/001-create-core-schema.js';
import * as phase2Migration from '../database/migrations/002-phase2-schema.js';

test('BIGINT boundaries are serialized as exact decimal strings', () => {
  assert.equal(toUnsignedBigIntString('18446744073709551615'), '18446744073709551615');
  assert.equal(toUnsignedBigIntString(1073741824), '1073741824');
  assert.throws(() => toUnsignedBigIntString(Number.MAX_SAFE_INTEGER + 1));
  assert.throws(() => toUnsignedBigIntString('-1'));
});

test('phase 2 migrations are versioned forward migrations', () => {
  assert.equal(coreMigration.id, '001-create-core-schema');
  assert.equal(phase2Migration.id, '002-phase2-schema');
  assert.equal(typeof coreMigration.up, 'function');
  assert.equal(typeof phase2Migration.up, 'function');
});
