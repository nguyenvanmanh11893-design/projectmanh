import { Transaction } from 'sequelize';
import { sequelize, Folder, File, AuditEvent } from '../models/index.js';
import { AppError, badRequest } from '../utils/app-error.js';
import { recordAuditEvent } from './audit.service.js';

const notFound = (message) => new AppError(message, { statusCode: 404, code: 'NOT_FOUND' });
const conflict = (message) => new AppError(message, { statusCode: 409, code: 'FOLDER_NOT_EMPTY' });

const createFolderService = ({ sequelizeInstance = sequelize, FolderModel = Folder, FileModel = File, AuditEventModel = AuditEvent } = {}) => {
  const createFolder = async (userId, { name, parent_id }, { requestId } = {}) => sequelizeInstance.transaction(async (transaction) => {
    const cleanName = name.trim();
    if (!cleanName) throw badRequest('Folder name is required');
    if (parent_id) {
      let parent = await FolderModel.findOne({ where: { id: parent_id, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!parent) throw notFound('Parent folder not found or access denied');
      let depth = 1;
      while (parent.parent_id) {
        depth += 1;
        if (depth >= 10) throw new AppError('Folder depth cannot exceed 10 levels', { statusCode: 409, code: 'FOLDER_DEPTH_EXCEEDED' });
        parent = await FolderModel.findOne({ where: { id: parent.parent_id, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
        if (!parent) throw new AppError('Folder hierarchy is invalid', { statusCode: 409, code: 'FOLDER_HIERARCHY_INVALID' });
      }
    }
    const folder = await FolderModel.create({ user_id: userId, parent_id: parent_id || null, name: cleanName }, { transaction });
    await recordAuditEvent({ AuditEventModel, userId, action: 'folder.created', resourceType: 'folder', resourceId: folder.id, metadata: { name: folder.name, parent_id: folder.parent_id }, requestId, transaction });
    return folder;
  });

  const getRootFolders = async (userId) => FolderModel.findAll({ where: { user_id: userId, parent_id: null }, order: [['name', 'ASC'], ['id', 'ASC']] });

  const getFolderById = async (userId, folderId) => {
    const folder = await FolderModel.findOne({
      where: { id: folderId, user_id: userId },
      include: [
        { model: FolderModel, as: 'subfolders', required: false },
        { model: FileModel, as: 'files', where: { status: 'LEGACY_UNVERIFIED' }, required: false }
      ]
    });
    if (!folder) throw notFound('Folder not found or access denied');
    return folder;
  };

  const renameFolder = async (userId, folderId, { name }, { requestId } = {}) => sequelizeInstance.transaction(async (transaction) => {
    const cleanName = name.trim();
    if (!cleanName) throw badRequest('New folder name is required');
    const folder = await FolderModel.findOne({ where: { id: folderId, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!folder) throw notFound('Folder not found or access denied');
    folder.name = cleanName;
    await folder.save({ transaction });
    await recordAuditEvent({ AuditEventModel, userId, action: 'folder.renamed', resourceType: 'folder', resourceId: folder.id, metadata: { name: folder.name }, requestId, transaction });
    return folder;
  });

  const deleteFolder = async (userId, folderId, { requestId } = {}) => sequelizeInstance.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED }, async (transaction) => {
    // Creators and file movers lock this same destination row before insert/update.
    const folder = await FolderModel.findOne({ where: { id: folderId, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!folder) throw notFound('Folder not found or access denied');
    const [child, file] = await Promise.all([
      FolderModel.findOne({ where: { user_id: userId, parent_id: folderId }, transaction, lock: transaction.LOCK.UPDATE }),
      FileModel.findOne({ where: { user_id: userId, folder_id: folderId }, transaction, lock: transaction.LOCK.UPDATE })
    ]);
    // Includes TRASHED files: nothing in the query filters status.
    if (child || file) throw conflict('Folder is not empty');
    await folder.destroy({ transaction });
    await recordAuditEvent({ AuditEventModel, userId, action: 'folder.deleted', resourceType: 'folder', resourceId: folderId, metadata: {}, requestId, transaction });
    return true;
  });
  return { createFolder, getRootFolders, getFolderById, renameFolder, deleteFolder };
};

const { createFolder, getRootFolders, getFolderById, renameFolder, deleteFolder } = createFolderService();
export { createFolder, getRootFolders, getFolderById, renameFolder, deleteFolder, createFolderService };
