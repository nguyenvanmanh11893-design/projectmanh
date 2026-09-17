import bcrypt from 'bcryptjs';
import { User } from '../models/index.js';

/**
 * Update Profile (only full_name and avatar_url)
 */
const updateProfile = async (userId, { full_name, avatar_url }) => {
  const user = await User.findByPk(userId);

  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  // Update only allowed attributes
  if (full_name !== undefined) user.full_name = full_name;
  if (avatar_url !== undefined) user.avatar_url = avatar_url;

  await user.save();

  const updatedUser = user.toJSON();
  delete updatedUser.password_hash;

  return updatedUser;
};

/**
 * Change Password
 */
const changePassword = async (userId, { current_password, new_password }) => {
  if (!current_password || !new_password) {
    const err = new Error('Current password and new password are required');
    err.statusCode = 400;
    throw err;
  }

  if (new_password.length < 6) {
    const err = new Error('New password must be at least 6 characters long');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findByPk(userId);

  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  // Verify current password
  const isMatch = await bcrypt.compare(current_password, user.password_hash);
  if (!isMatch) {
    const err = new Error('Incorrect current password');
    err.statusCode = 400;
    throw err;
  }

  // Hash new password
  const salt = await bcrypt.genSalt(10);
  user.password_hash = await bcrypt.hash(new_password, salt);
  await user.save();

  return true;
};

export {
  updateProfile,
  changePassword
};
