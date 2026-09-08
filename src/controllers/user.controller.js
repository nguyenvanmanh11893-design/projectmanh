const userService = require('../services/user.service');
const authService = require('../services/auth.service');
const { successResponse } = require('../utils/response');

// Get profile
const getProfile = async (req, res, next) => {
  try {
    const user = await authService.getProfile(req.user.id);
    return successResponse(res, 'User profile retrieved', user, 200);
  } catch (error) {
    next(error);
  }
};

// Update profile
const updateProfile = async (req, res, next) => {
  try {
    const { full_name, avatar_url } = req.body;
    const updatedUser = await userService.updateProfile(req.user.id, { full_name, avatar_url });
    return successResponse(res, 'Profile updated successfully', updatedUser, 200);
  } catch (error) {
    next(error);
  }
};

// Change password
const changePassword = async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body;
    await userService.changePassword(req.user.id, { current_password, new_password });
    return successResponse(res, 'Password changed successfully', null, 200);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword
};
