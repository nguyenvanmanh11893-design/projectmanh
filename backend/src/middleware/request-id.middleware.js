import { randomUUID } from 'node:crypto';
import { log, logContext } from '../utils/logger.js';

const requestId = (req, res, next) => {
  req.requestId = randomUUID();
  res.locals.requestId = req.requestId;
  res.setHeader('X-Request-Id', req.requestId);
  const started = performance.now();
  res.once('finish', () => logContext.run({ request_id: req.requestId }, () => log('http_request', {
    method: req.method, status: res.statusCode, duration_ms: Math.round(performance.now() - started),
    server_error: res.statusCode >= 500 ? 1 : 0
  })));
  logContext.run({ request_id: req.requestId }, next);
};

export { requestId };
