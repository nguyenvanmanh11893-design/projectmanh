import { sequelize } from '../config/database.js';
import User from './User.js';
import Folder from './Folder.js';
import File from './File.js';
import Session from './Session.js';
import UploadSession from './UploadSession.js';
import Job from './Job.js';
import AuditEvent from './AuditEvent.js';
import Invitation from './Invitation.js';
import ReconciliationFinding from './ReconciliationFinding.js';

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
Folder.hasMany(File, { foreignKey: 'folder_id', as: 'files', onDelete: 'RESTRICT' });
File.belongsTo(Folder, { foreignKey: 'folder_id', as: 'folder' });

User.hasMany(Session, { foreignKey: 'user_id', as: 'sessions', onDelete: 'CASCADE' });
Session.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(UploadSession, { foreignKey: 'user_id', as: 'uploadSessions', onDelete: 'CASCADE' });
UploadSession.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Folder.hasMany(UploadSession, { foreignKey: 'folder_id', as: 'uploadSessions', onDelete: 'RESTRICT' });
UploadSession.belongsTo(Folder, { foreignKey: 'folder_id', as: 'folder' });
File.hasMany(UploadSession, { foreignKey: 'file_id', as: 'uploadSessions', onDelete: 'SET NULL' });
UploadSession.belongsTo(File, { foreignKey: 'file_id', as: 'file' });
User.hasMany(AuditEvent, { foreignKey: 'actor_user_id', as: 'auditEvents', onDelete: 'SET NULL' });
AuditEvent.belongsTo(User, { foreignKey: 'actor_user_id', as: 'actor' });

export {
  sequelize,
  User,
  Folder,
  File,
  Session,
  UploadSession,
  Job,
  AuditEvent,
  Invitation,
  ReconciliationFinding
};
