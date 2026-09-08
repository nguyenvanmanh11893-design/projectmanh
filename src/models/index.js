const { sequelize } = require('../config/database');
const User = require('./User');
const Folder = require('./Folder');
const File = require('./File');

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

module.exports = {
  sequelize,
  User,
  Folder,
  File
};
