import * as fileService from '../services/file.service.js';
import { successResponse } from '../utils/response.js';

// Upload
const upload = async (req, res, next) => {
  try {
    const { folder_id } = req.body;
    const file = await fileService.uploadFile(req.user.id, { file: req.file, folder_id }, { requestId: req.requestId });
    return successResponse(res, 'File uploaded successfully', file, 201);
  } catch (error) {
    next(error);
  }
};

// List
const list = async (req, res, next) => {
  try {
    const files = await fileService.listFiles(req.user.id, req.query);
    return successResponse(res, 'Files retrieved successfully', files, 200);
  } catch (error) {
    next(error);
  }
};

// Download
const download = async (req, res, next) => {
  try {
    const downloadData = await fileService.getDownloadUrl(req.user.id, req.params.id);
    return successResponse(res, 'Download presigned URL generated successfully', downloadData, 200);
  } catch (error) {
    next(error);
  }
};

// Rename
const rename = async (req, res, next) => {
  try {
    const { file_name } = req.body;
    const updatedFile = await fileService.renameFile(req.user.id, req.params.id, { file_name }, { requestId: req.requestId });
    return successResponse(res, 'File renamed successfully', updatedFile, 200);
  } catch (error) {
    next(error);
  }
};

const move = async (req, res, next) => {
  try {
    const { folder_id } = req.body;
    const movedFile = await fileService.moveFile(req.user.id, req.params.id, { folder_id }, { requestId: req.requestId });
    return successResponse(res, 'File moved successfully', movedFile, 200);
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await fileService.deleteFile(req.user.id, req.params.id, { requestId: req.requestId });
    return successResponse(res, 'File deleted successfully', null, 200);
  } catch (error) {
    next(error);
  }
};

export {
  upload,
  list,
  download,
  rename,
  move,
  remove
};
