import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Job = sequelize.define('Job', {
  id: { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  type: { type: DataTypes.STRING(64), allowNull: false },
  status: { type: DataTypes.ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD'), allowNull: false, defaultValue: 'QUEUED' },
  payload: { type: DataTypes.JSON, allowNull: false },
  attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  max_attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 10 },
  run_at: { type: DataTypes.DATE, allowNull: false },
  locked_at: { type: DataTypes.DATE, allowNull: true },
  locked_until: { type: DataTypes.DATE, allowNull: true },
  locked_by: { type: DataTypes.STRING(128), allowNull: true },
  last_error: { type: DataTypes.STRING(1000), allowNull: true }
}, { tableName: 'jobs', timestamps: true, underscored: true });

export default Job;
