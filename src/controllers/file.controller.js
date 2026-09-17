import * as fileService from '../services/file.service.js';
import { successResponse } from '../utils/response.js';
import { AppError } from '../utils/app-error.js';

const legacyUploadRemoved = async (req, res, next) => {
  res.set('Deprecation', 'true');
  res.set('Link', '</api/uploads>; rel="successor-version"');
  next(new AppError('This multipart upload endpoint is deprecated and disabled; use /api/uploads direct S3 upload sessions', { statusCode: 410, code: 'LEGACY_UPLOAD_DEPRECATED' }));
};

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

const listTrash = async (req, res, next) => {
  try {
    return successResponse(res, 'Trash retrieved successfully', await fileService.listTrash(req.user.id, req.query), 200);
  } catch (error) { next(error); }
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
    const file = await fileService.trashFile(req.user.id, req.params.id, { requestId: req.requestId });
    return successResponse(res, 'File moved to trash successfully', { file_id: file.id, status: file.status, trashed_at: file.trashed_at }, 200);
  } catch (error) {
    next(error);
  }
};

const restore = async (req, res, next) => {
  try {
    const file = await fileService.restoreFile(req.user.id, req.params.id, { requestId: req.requestId });
    return successResponse(res, 'File restored successfully', { file_id: file.id, status: file.status }, 200);
  } catch (error) { next(error); }
};

const permanentDelete = async (req, res, next) => {
  try {
    const result = await fileService.requestPermanentDelete(req.user.id, req.params.id, { requestId: req.requestId });
    return successResponse(res, result.accepted ? 'Permanent deletion accepted' : 'File was already purged', { file_id: result.file.id, status: result.file.status }, result.accepted ? 202 : 200);
  } catch (error) { next(error); }
};

export {
  legacyUploadRemoved,
  upload,
  list,
  listTrash,
  download,
  rename,
  move,
  remove,
  restore,
  permanentDelete
};
