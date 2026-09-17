import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { unsignedBigIntAttribute } from '../utils/bigint.js';

const File = sequelize.define('File', {
  id: {
    type: DataTypes.CHAR(36),
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  user_id: {
    type: DataTypes.CHAR(36),
    allowNull: false
  },
  folder_id: {
    type: DataTypes.CHAR(36),
    allowNull: true,
    defaultValue: null
  },
  file_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  original_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  s3_key: {
    type: DataTypes.STRING(500),
    allowNull: false
  },
  mime_type: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  file_size: unsignedBigIntAttribute(DataTypes, 'file_size'),
  extension: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('LEGACY_UNVERIFIED', 'PENDING', 'UPLOADED', 'VALIDATING', 'READY', 'REJECTED', 'TRASHED', 'PURGE_PENDING', 'PURGED'),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  s3_version_id: { type: DataTypes.STRING(1024), allowNull: true },
  detected_mime_type: { type: DataTypes.STRING(100), allowNull: true },
  trashed_at: { type: DataTypes.DATE, allowNull: true },
  purge_requested_at: { type: DataTypes.DATE, allowNull: true },
  purged_at: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'files',
  timestamps: true,
  underscored: true
});

export default File;
