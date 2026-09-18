import { randomUUID } from 'node:crypto';

const requestId = (req, res, next) => {
  req.requestId = randomUUID();
  res.locals.requestId = req.requestId;
  res.setHeader('X-Request-Id', req.requestId);
  next();
};

export { requestId };
