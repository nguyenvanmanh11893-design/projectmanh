import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { sequelize, User, Invitation } from '../models/index.js';
import { AppError } from '../utils/app-error.js';
import { assertPasswordPolicy } from '../utils/password-policy.js';
import { hash } from './session.service.js';

const genericCredentialError = () => new AppError('Invalid username/email or password', { statusCode: 401, code: 'INVALID_CREDENTIALS' });
const DUMMY_BCRYPT_HASH = '$2a$10$7EqJtq98hPqEX7fNZaFWoO5sp2DnIAalTUAezolrqsnBMLJ7Z5e9m';

/**
 * Register a new User
 */
const register = async ({ username, email, password, full_name, invitation_token }) => {
  if (!username || !email || !password || !invitation_token) {
    throw new AppError('Username, email, password, and invitation token are required', { statusCode: 400, code: 'REGISTRATION_INVALID' });
  }
  assertPasswordPolicy(password);
  return sequelize.transaction(async (transaction) => {
    const invitation = await Invitation.findOne({ where: { code_hash: hash(invitation_token) }, transaction, lock: transaction.LOCK.UPDATE });
    if (!invitation || invitation.used_at || invitation.expires_at <= new Date() || (invitation.email && invitation.email.toLowerCase() !== email.toLowerCase())) {
      throw new AppError('Invitation is invalid or expired', { statusCode: 400, code: 'INVITATION_INVALID' });
    }
    const existingUser = await User.findOne({ where: { [Op.or]: [{ username }, { email }] }, transaction, lock: transaction.LOCK.UPDATE });
    if (existingUser) throw new AppError('Username or email is already registered', { statusCode: 409, code: 'REGISTRATION_CONFLICT' });
    const password_hash = await bcrypt.hash(password, 12);
    const newUser = await User.create({ username, email, password_hash, full_name: full_name || null, role: invitation.role, is_active: true }, { transaction });
    invitation.used_at = new Date();
    invitation.used_by_user_id = newUser.id;
    await invitation.save({ transaction });
    const userJson = newUser.toJSON();
    delete userJson.password_hash;
    return userJson;
  });
};

/**
 * Login User by username or email
 */
const login = async ({ usernameOrEmail, password }) => {
  if (!usernameOrEmail || !password) throw genericCredentialError();

  const user = await User.findOne({
    where: {
      [Op.or]: [
        { username: usernameOrEmail },
        { email: usernameOrEmail }
      ]
    }
  });

  const isMatch = await bcrypt.compare(password, user?.password_hash || DUMMY_BCRYPT_HASH);
  if (!user || !user.is_active || !isMatch) throw genericCredentialError();

  const userJson = user.toJSON();
  delete userJson.password_hash;

  return userJson;
};

/**
 * Get Profile by User ID
 */
const getProfile = async (userId) => {
  const user = await User.findByPk(userId, {
    attributes: { exclude: ['password_hash'] }
  });

  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  return user;
};

export {
  register,
  login,
  getProfile
};
