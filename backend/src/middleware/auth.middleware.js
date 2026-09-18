import { errorResponse } from '../utils/response.js';
import { getActiveSession } from '../services/session.service.js';

/**
 * Authentication Middleware
 * Validates an opaque server-side session from an HttpOnly cookie.
 */
const authenticateToken = async (req, res, next) => {
  try {
    const token = parseCookies(req.headers.cookie || '').session;

    if (!token) {
      return errorResponse(res, { message: 'Authentication is required', statusCode: 401, code: 'UNAUTHORIZED' });
    }

    const active = await getActiveSession(token);
    if (!active) {
      return errorResponse(res, { message: 'Session has expired or is no longer valid', statusCode: 401, code: 'UNAUTHORIZED' });
    }
    req.session = active.session;
    req.user = active.user.toJSON();
    return next();
  } catch (error) {
    return errorResponse(res, { message: 'Authentication failed', statusCode: 401, code: 'UNAUTHORIZED' });
  }
};

const parseCookies = (header) => Object.fromEntries(header.split(';').map((part) => {
  const index = part.indexOf('=');
  return index < 0 ? [] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
}).filter((pair) => pair.length));

export {
  authenticateToken,
  parseCookies
};
