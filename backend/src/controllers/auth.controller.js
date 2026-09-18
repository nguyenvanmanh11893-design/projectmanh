import * as authService from '../services/auth.service.js';
import { successResponse } from '../utils/response.js';
import { createSession, revokeSession } from '../services/session.service.js';

const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });

const register = async (req, res, next) => {
  try {
    const { username, email, password, full_name, invitation_token } = req.body;
    const user = await authService.register({ username, email, password, full_name, invitation_token });
    return successResponse(res, 'User registered successfully', user, 201);
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const usernameOrEmail = username || email;
    const user = await authService.login({ usernameOrEmail, password });
    const { token, csrfToken } = await createSession(user.id);
    res.cookie('session', token, { ...cookieOptions(), maxAge: Number(process.env.SESSION_TTL_DAYS || 7) * 86400000 });
    return successResponse(res, 'Login successful', { user, csrf_token: csrfToken }, 200);
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    await revokeSession(req.session);
    res.clearCookie('session', cookieOptions());
    return successResponse(res, 'Logged out successfully', null, 200);
  } catch (error) { return next(error); }
};

const csrf = async (req, res, next) => {
  try {
    // A new per-session token prevents any plaintext value from being persisted.
    const { randomBytes, createHash } = await import('node:crypto');
    const csrfToken = randomBytes(32).toString('base64url');
    req.session.csrf_token_hash = createHash('sha256').update(csrfToken).digest('hex');
    await req.session.save();
    return successResponse(res, 'CSRF token issued', { csrf_token: csrfToken });
  } catch (error) { return next(error); }
};

const me = async (req, res, next) => {
  try {
    const user = await authService.getProfile(req.user.id);
    return successResponse(res, 'User profile retrieved successfully', user, 200);
  } catch (error) {
    next(error);
  }
};

export {
  register,
  login,
  me,
  logout,
  csrf
};
