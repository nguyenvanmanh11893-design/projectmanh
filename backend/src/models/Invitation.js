import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Invitation = sequelize.define('Invitation', {
  id: { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  code_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
  email: { type: DataTypes.STRING(255), allowNull: true },
  role: { type: DataTypes.ENUM('user', 'admin'), allowNull: false, defaultValue: 'user' },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  used_at: { type: DataTypes.DATE, allowNull: true },
  used_by_user_id: { type: DataTypes.CHAR(36), allowNull: true },
  created_by_user_id: { type: DataTypes.CHAR(36), allowNull: true }
}, { tableName: 'invitations', timestamps: true, underscored: true });

export default Invitation;
