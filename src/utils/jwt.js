import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_key_cloud_file_manager_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';


const signToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
};

const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

export {
  signToken,
  verifyToken
};
