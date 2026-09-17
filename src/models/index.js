import { sequelize } from '../config/database.js';
import User from './User.js';
import Folder from './Folder.js';
import File from './File.js';

// User 1 : N Folder
User.hasMany(Folder, { foreignKey: 'user_id', as: 'folders', onDelete: 'CASCADE' });
Folder.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// User 1 : N File
User.hasMany(File, { foreignKey: 'user_id', as: 'files', onDelete: 'CASCADE' });
File.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Folder 1 : N Folder (Self-Referencing Parent/Child Hierarchy)
Folder.hasMany(Folder, { foreignKey: 'parent_id', as: 'subfolders', onDelete: 'CASCADE' });
Folder.belongsTo(Folder, { foreignKey: 'parent_id', as: 'parentFolder' });

// Folder 1 : N File
Folder.hasMany(File, { foreignKey: 'folder_id', as: 'files', onDelete: 'SET NULL' });
File.belongsTo(Folder, { foreignKey: 'folder_id', as: 'folder' });

export {
  sequelize,
  User,
  Folder,
  File
};
