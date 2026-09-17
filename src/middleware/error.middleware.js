import { errorResponse } from '../utils/response.js';

/**
 * 404 Not Found Middleware
 */
const notFoundHandler = (req, res, next) => {
  return errorResponse(res, `Route ${req.originalUrl} not found`, 404);
};

/**
 * Global Centralized Error Handling Middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error('[SERVER ERROR]:', err);

  // Default status code and error message
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  return errorResponse(res, message, statusCode, process.env.NODE_ENV === 'development' ? err.stack : null);
};

export {
  notFoundHandler,
  errorHandler
};
