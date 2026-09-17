import { AppError } from './app-error.js';

const MAX_BCRYPT_BYTES = 72;

const assertPasswordPolicy = (password, field = 'Password') => {
  if (typeof password !== 'string') {
    throw new AppError(`${field} is required`, { statusCode: 400, code: 'PASSWORD_POLICY_FAILED' });
  }
  const bytes = Buffer.byteLength(password, 'utf8');
  if (bytes > MAX_BCRYPT_BYTES) {
    throw new AppError(`${field} must be at most ${MAX_BCRYPT_BYTES} UTF-8 bytes`, { statusCode: 400, code: 'PASSWORD_POLICY_FAILED' });
  }
  if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new AppError(`${field} must be at least 12 characters and include uppercase, lowercase, and a number`, { statusCode: 400, code: 'PASSWORD_POLICY_FAILED' });
  }
};

export { assertPasswordPolicy, MAX_BCRYPT_BYTES };
