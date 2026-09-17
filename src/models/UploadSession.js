import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { unsignedBigIntAttribute } from '../utils/bigint.js';

const UploadSession = sequelize.define('UploadSession', {
  id: { type: DataTypes.CHAR(36), primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  user_id: { type: DataTypes.CHAR(36), allowNull: false },
  folder_id: { type: DataTypes.CHAR(36), allowNull: true },
  file_id: { type: DataTypes.CHAR(36), allowNull: true },
  idempotency_key: { type: DataTypes.STRING(255), allowNull: false },
  payload_hash: { type: DataTypes.CHAR(64), allowNull: false },
  requested_size: unsignedBigIntAttribute(DataTypes, 'requested_size'),
  declared_mime_type: { type: DataTypes.STRING(100), allowNull: false },
  incoming_key: { type: DataTypes.STRING(500), allowNull: false },
  source_version_id: { type: DataTypes.STRING(1024), allowNull: true },
  status: { type: DataTypes.ENUM('RESERVED', 'UPLOADING', 'UPLOADED', 'COMPLETED', 'REJECTED', 'EXPIRED', 'CANCELLED'), allowNull: false, defaultValue: 'RESERVED' },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  completed_at: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'upload_sessions', timestamps: true, underscored: true });

export default UploadSession;
