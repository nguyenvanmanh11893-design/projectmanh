import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const Folder = sequelize.define('Folder', {
  id: {
    type: DataTypes.CHAR(36),
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  user_id: {
    type: DataTypes.CHAR(36),
    allowNull: false
  },
  parent_id: {
    type: DataTypes.CHAR(36),
    allowNull: true,
    defaultValue: null
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  }
}, {
  tableName: 'folders',
  timestamps: true,
  underscored: true
});

export default Folder;
