const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

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
  file_size: {
    type: DataTypes.BIGINT.UNSIGNED,
    allowNull: false,
    defaultValue: 0
  },
  extension: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('uploading', 'completed', 'deleted'),
    allowNull: false,
    defaultValue: 'completed'
  }
}, {
  tableName: 'files',
  timestamps: true,
  underscored: true
});

module.exports = File;
