import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { unsignedBigIntAttribute } from '../utils/bigint.js';

const User = sequelize.define('User', {
  id: {
    type: DataTypes.CHAR(36),
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  full_name: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  avatar_url: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  role: {
    type: DataTypes.ENUM('user', 'admin'),
    defaultValue: 'user',
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  // Keep ORM-created users aligned with the schema default of 1 GiB. Without
  // this explicit override Sequelize's generic unsigned-BIGINT default (0)
  // would be sent during User.create and bypass MySQL's column default.
  quota_bytes: { ...unsignedBigIntAttribute(DataTypes, 'quota_bytes'), defaultValue: '1073741824' },
  used_bytes: unsignedBigIntAttribute(DataTypes, 'used_bytes'),
  reserved_bytes: unsignedBigIntAttribute(DataTypes, 'reserved_bytes')
}, {
  tableName: 'users',
  timestamps: true,
  underscored: true
});

export default User;
