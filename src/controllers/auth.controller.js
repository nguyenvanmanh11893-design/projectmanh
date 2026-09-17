import * as authService from '../services/auth.service.js';
import { successResponse } from '../utils/response.js';

const register = async (req, res, next) => {
  try {
    const { username, email, password, full_name } = req.body;
    const user = await authService.register({ username, email, password, full_name });
    return successResponse(res, 'User registered successfully', user, 201);
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const usernameOrEmail = username || email;
    const result = await authService.login({ usernameOrEmail, password });
    return successResponse(res, 'Login successful', result, 200);
  } catch (error) {
    next(error);
  }
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
  me
};
