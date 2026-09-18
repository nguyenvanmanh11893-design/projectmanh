import { errorResponse } from '../utils/response.js';

/**
 * 404 Not Found Middleware
 */
const notFoundHandler = (req, res, next) => {
  return errorResponse(res, { message: 'Route not found', statusCode: 404, code: 'NOT_FOUND' });
};

/**
 * Global Centralized Error Handling Middleware
 */
const errorHandler = (err, req, res, next) => {
  console.error(`[SERVER ERROR] request_id=${req.requestId || 'unknown'}:`, err);

  const statusCode = Number.isInteger(err.statusCode) ? err.statusCode : 500;
  const isClientError = statusCode >= 400 && statusCode < 500;
  const message = isClientError ? (err.message || 'Request failed') : 'Internal Server Error';
  const code = err.code || (isClientError ? 'REQUEST_ERROR' : 'INTERNAL_ERROR');

  return errorResponse(res, { message, statusCode, code, details: isClientError ? err.details : null });
};

export {
  notFoundHandler,
  errorHandler
};
