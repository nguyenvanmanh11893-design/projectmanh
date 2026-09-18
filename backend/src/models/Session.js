import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Session = sequelize.define('Session', {
  id: { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  user_id: { type: DataTypes.CHAR(36), allowNull: false },
  token_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
  csrf_token_hash: { type: DataTypes.CHAR(64), allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  revoked_at: { type: DataTypes.DATE, allowNull: true },
  last_seen_at: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'sessions', timestamps: true, underscored: true });

export default Session;
