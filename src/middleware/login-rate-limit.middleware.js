import { errorResponse } from '../utils/response.js';

const WINDOW_MS = 15 * 60 * 1000;
const LIMIT = 10;
const attempts = new Map();
const keysFor = (req) => [`ip:${req.ip}`, `account:${String(req.body?.username || req.body?.email || '').trim().toLowerCase()}`];

const loginRateLimit = (req, res, next) => {
  const now = Date.now();
  const records = keysFor(req).map((key) => [key, (attempts.get(key) || []).filter((time) => now - time < WINDOW_MS)]);
  if (records.some(([, recent]) => recent.length >= LIMIT)) {
    return errorResponse(res, { message: 'Too many login attempts. Try again later.', statusCode: 429, code: 'LOGIN_RATE_LIMITED' });
  }
  records.forEach(([key, recent]) => { recent.push(now); attempts.set(key, recent); });
  return next();
};

const resetLoginRateLimit = () => attempts.clear();
export { loginRateLimit, resetLoginRateLimit };
