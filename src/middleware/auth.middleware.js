import { verifyToken } from '../utils/jwt.js';
import { errorResponse } from '../utils/response.js';
import { User } from '../models/index.js';

/**
 * Authentication Middleware
 * Validates Bearer JWT Token in Authorization header
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
      return errorResponse(res, { message: 'Access token is missing or invalid', statusCode: 401, code: 'UNAUTHORIZED' });
    }

    const decoded = verifyToken(token);

    if (!decoded || !decoded.id) {
      return errorResponse(res, { message: 'Invalid token payload', statusCode: 401, code: 'UNAUTHORIZED' });
    }

    // Attach decoded user info strictly to req.user
    req.user = {
      id: decoded.id,
      username: decoded.username,
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return errorResponse(res, { message: 'Token has expired. Please log in again.', statusCode: 401, code: 'UNAUTHORIZED' });
    }
    return errorResponse(res, { message: 'Authentication failed. Invalid token.', statusCode: 401, code: 'UNAUTHORIZED' });
  }
};

export {
  authenticateToken
};
