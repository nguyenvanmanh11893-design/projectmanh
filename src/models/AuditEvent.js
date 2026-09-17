import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const AuditEvent = sequelize.define('AuditEvent', {
  id: { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  actor_user_id: { type: DataTypes.CHAR(36), allowNull: true },
  subject_user_id: { type: DataTypes.CHAR(36), allowNull: true },
  action: { type: DataTypes.STRING(100), allowNull: false },
  resource_type: { type: DataTypes.STRING(64), allowNull: true },
  resource_id: { type: DataTypes.CHAR(36), allowNull: true },
  request_id: { type: DataTypes.CHAR(36), allowNull: true },
  metadata: { type: DataTypes.JSON, allowNull: true }
}, { tableName: 'audit_events', timestamps: true, underscored: true, updatedAt: false });

export default AuditEvent;
