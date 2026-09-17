import * as folderService from '../services/folder.service.js';
import { successResponse } from '../utils/response.js';

// Create folder
const create = async (req, res, next) => {
  try {
    const { name, parent_id } = req.body;
    const folder = await folderService.createFolder(req.user.id, { name, parent_id });
    return successResponse(res, 'Folder created successfully', folder, 201);
  } catch (error) {
    next(error);
  }
};

// Get root folders
const getRootList = async (req, res, next) => {
  try {
    const folders = await folderService.getRootFolders(req.user.id);
    return successResponse(res, 'Root folders retrieved successfully', folders, 200);
  } catch (error) {
    next(error);
  }
};

// Get folder by ID
const getById = async (req, res, next) => {
  try {
    const folder = await folderService.getFolderById(req.user.id, req.params.id);
    return successResponse(res, 'Folder details retrieved successfully', folder, 200);
  } catch (error) {
    next(error);
  }
};

// Rename folder
const rename = async (req, res, next) => {
  try {
    const { name } = req.body;
    const updatedFolder = await folderService.renameFolder(req.user.id, req.params.id, { name });
    return successResponse(res, 'Folder renamed successfully', updatedFolder, 200);
  } catch (error) {
    next(error);
  }
};

// Delete folder
const remove = async (req, res, next) => {
  try {
    await folderService.deleteFolder(req.user.id, req.params.id);
    return successResponse(res, 'Folder deleted successfully', null, 200);
  } catch (error) {
    next(error);
  }
};

export {
  create,
  getRootList,
  getById,
  rename,
  remove
};
