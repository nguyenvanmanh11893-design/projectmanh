import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const ReconciliationFinding = sequelize.define('ReconciliationFinding', {
  id: { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  fingerprint: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
  kind: { type: DataTypes.STRING(64), allowNull: false },
  status: { type: DataTypes.ENUM('CANDIDATE', 'CONFIRMED', 'RESOLVED', 'DELETED'), allowNull: false, defaultValue: 'CANDIDATE' },
  object_key: { type: DataTypes.STRING(500), allowNull: true },
  object_version_id: { type: DataTypes.STRING(1024), allowNull: true },
  is_delete_marker: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  user_id: { type: DataTypes.CHAR(36), allowNull: true },
  details: { type: DataTypes.JSON, allowNull: true },
  first_seen_at: { type: DataTypes.DATE, allowNull: false },
  last_seen_at: { type: DataTypes.DATE, allowNull: false },
  confirmed_at: { type: DataTypes.DATE, allowNull: true },
  resolved_at: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'reconciliation_findings', timestamps: true, underscored: true });

export default ReconciliationFinding;
