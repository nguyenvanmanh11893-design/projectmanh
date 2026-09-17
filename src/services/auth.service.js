import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { User } from '../models/index.js';
import { signToken } from '../utils/jwt.js';

/**
 * Register a new User
 */
const register = async ({ username, email, password, full_name }) => {
  if (!username || !email || !password) {
    const err = new Error('Username, email, and password are required');
    err.statusCode = 400;
    throw err;
  }

  if (password.length < 6) {
    const err = new Error('Password must be at least 6 characters long');
    err.statusCode = 400;
    throw err;
  }

  const existingUser = await User.findOne({
    where: {
      [Op.or]: [{ username }, { email }]
    }
  });

  if (existingUser) {
    const err = new Error(
      existingUser.username === username ? 'Username already exists' : 'Email already registered'
    );
    err.statusCode = 409;
    throw err;
  }

  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);

  const newUser = await User.create({
    username,
    email,
    password_hash,
    full_name: full_name || null,
    role: 'user',
    is_active: true
  });

  const userJson = newUser.toJSON();
  delete userJson.password_hash;

  return userJson;
};

/**
 * Login User by username or email
 */
const login = async ({ usernameOrEmail, password }) => {
  if (!usernameOrEmail || !password) {
    const err = new Error('Username/email and password are required');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findOne({
    where: {
      [Op.or]: [
        { username: usernameOrEmail },
        { email: usernameOrEmail }
      ]
    }
  });

  if (!user) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  if (!user.is_active) {
    const err = new Error('Account is deactivated');
    err.statusCode = 403;
    throw err;
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  const token = signToken({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role
  });

  const userJson = user.toJSON();
  delete userJson.password_hash;

  return {
    token,
    user: userJson
  };
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
