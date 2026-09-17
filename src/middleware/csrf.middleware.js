import { errorResponse } from '../utils/response.js';
import { verifyCsrfToken } from '../services/session.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const expectedOrigin = (req) => process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`;
const validateOrigin = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (!origin || origin !== expectedOrigin(req)) {
    return errorResponse(res, { message: 'Request origin is not allowed', statusCode: 403, code: 'ORIGIN_INVALID' });
  }
  return next();
};

const requireCsrf = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  try {
    verifyCsrfToken(req.session, req.get('x-csrf-token'));
    return next();
  } catch (error) {
    return errorResponse(res, { message: error.message, statusCode: error.statusCode, code: error.code });
  }
};

export { validateOrigin, requireCsrf };
