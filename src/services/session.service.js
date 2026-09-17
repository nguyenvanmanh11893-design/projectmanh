import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { Session, User } from '../models/index.js';
import { AppError } from '../utils/app-error.js';

const SESSION_TOKEN_BYTES = 32;
const hash = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const randomToken = () => crypto.randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const sessionDurationMs = () => {
  const days = Number.parseInt(process.env.SESSION_TTL_DAYS || '7', 10);
  return Number.isInteger(days) && days >= 1 && days <= 30 ? days * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
};

const createSession = async (userId, { SessionModel = Session, now = new Date() } = {}) => {
  const token = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(now.getTime() + sessionDurationMs());
  const session = await SessionModel.create({
    user_id: userId,
    token_hash: hash(token),
    csrf_token_hash: hash(csrfToken),
    expires_at: expiresAt,
    last_seen_at: now
  });
  return { token, csrfToken, session };
};

const getActiveSession = async (token, { SessionModel = Session, UserModel = User, now = new Date() } = {}) => {
  if (!token || typeof token !== 'string') return null;
  const session = await SessionModel.findOne({
    where: { token_hash: hash(token), revoked_at: null, expires_at: { [Op.gt]: now } }
  });
  if (!session) return null;
  const user = await UserModel.findByPk(session.user_id);
  if (!user || !user.is_active) return null;
  // This is deliberately best-effort: a request remains valid even if telemetry update fails.
  await session.update({ last_seen_at: now }).catch(() => {});
  return { session, user };
};

const revokeSession = async (session, { now = new Date() } = {}) => {
  if (session && !session.revoked_at) await session.update({ revoked_at: now });
};

const revokeUserSessions = async (userId, { SessionModel = Session, transaction, now = new Date() } = {}) =>
  SessionModel.update({ revoked_at: now }, { where: { user_id: userId, revoked_at: null }, transaction });

const verifyCsrfToken = (session, csrfToken) => {
  if (!csrfToken || !safeEqual(hash(csrfToken), session.csrf_token_hash)) {
    throw new AppError('CSRF token is missing or invalid', { statusCode: 403, code: 'CSRF_INVALID' });
  }
};

export { createSession, getActiveSession, revokeSession, revokeUserSessions, verifyCsrfToken, hash };
