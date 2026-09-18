class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.expose = statusCode < 500;
  }
}

const badRequest = (message, details) => new AppError(message, {
  statusCode: 400,
  code: 'VALIDATION_ERROR',
  details
});

export { AppError, badRequest };
