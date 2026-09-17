import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSession, getActiveSession, revokeSession, verifyCsrfToken, hash } from '../src/services/session.service.js';
import { assertPasswordPolicy } from '../src/utils/password-policy.js';
import { requireCsrf, validateOrigin } from '../src/middleware/csrf.middleware.js';

test('logout revokes a server session and the original opaque token cannot resolve', async () => {
  const rows = [];
  const SessionModel = {
    create: async (row) => {
      const saved = { ...row, update: async (values) => Object.assign(saved, values) };
      rows.push(saved);
      return saved;
    },
    findOne: async ({ where }) => rows.find((row) => row.token_hash === where.token_hash && !row.revoked_at) || null
  };
  const created = await createSession('user-1', { SessionModel });
  await revokeSession(rows[0]);
  const active = await getActiveSession(created.token, { SessionModel, UserModel: { findByPk: async () => ({ is_active: true, toJSON: () => ({ id: 'user-1' }) }) } });
  assert.equal(active, null);
  assert.notEqual(rows[0].token_hash, created.token);
});

test('inactive users cannot continue using an otherwise active session', async () => {
  const token = 'opaque-token';
  const session = { user_id: 'user-1', update: async () => {} };
  const result = await getActiveSession(token, {
    SessionModel: { findOne: async () => session },
    UserModel: { findByPk: async () => ({ is_active: false }) }
  });
  assert.equal(result, null);
});

test('CSRF middleware refuses modifying requests without a valid session-bound token', () => {
  const session = { csrf_token_hash: hash('valid-token') };
  let status;
  requireCsrf({ method: 'POST', session, get: () => 'wrong-token' }, { locals: {}, status: (code) => { status = code; return { json: () => {} }; } }, () => assert.fail('next must not be called'));
  assert.equal(status, 403);
  assert.doesNotThrow(() => verifyCsrfToken(session, 'valid-token'));
});

test('origin validation rejects cross-site state changes', () => {
  let status;
  validateOrigin({ method: 'DELETE', protocol: 'https', get: (name) => name === 'origin' ? 'https://evil.example' : 'app.example' }, { locals: {}, status: (code) => { status = code; return { json: () => {} }; } }, () => assert.fail('next must not be called'));
  assert.equal(status, 403);
});

test('bcrypt passwords obey explicit length and composition policy', () => {
  assert.doesNotThrow(() => assertPasswordPolicy('ValidPassword1'));
  assert.throws(() => assertPasswordPolicy('short1A'));
  assert.throws(() => assertPasswordPolicy(`${'A'.repeat(71)}a1`));
});

test('auth implementation keeps session and invitation secrets out of persistence and client storage', async () => {
  const [sessionSource, frontendSource, authSource, userSource] = await Promise.all([
    readFile(new URL('../src/services/session.service.js', import.meta.url), 'utf8'),
    readFile(new URL('../public/js/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/auth.service.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/user.service.js', import.meta.url), 'utf8')
  ]);
  assert.match(sessionSource, /token_hash: hash\(token\)/);
  assert.doesNotMatch(frontendSource, /localStorage\.(getItem|setItem)\(['"]token/);
  assert.match(authSource, /transaction\.LOCK\.UPDATE/);
  assert.match(authSource, /Invitation\.findOne/);
  assert.match(userSource, /revokeUserSessions\(userId\)/);
});
