import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { File, Folder } from '../models/index.js';
import * as s3Service from './s3.service.js';
import { AppError, badRequest } from '../utils/app-error.js';

const createFileService = ({ FileModel = File, FolderModel = Folder, storage = s3Service } = {}) => {
const uploadFile = async (userId, { file, folder_id }) => {
  if (!file) {
    throw badRequest('No file uploaded');
  }

  // Validate folder ownership if folder_id is provided
  if (folder_id) {
    const folder = await FolderModel.findOne({
      where: { id: folder_id, user_id: userId }
    });

    if (!folder) {
      throw new AppError('Target folder not found or access denied', { statusCode: 404, code: 'NOT_FOUND' });
    }
  }

  const fileId = randomUUID();
  const originalName = String(file.originalname || '').trim();
  if (!originalName || originalName.length > 255) throw badRequest('File name must be between 1 and 255 characters');
  const extension = path.extname(originalName).toLowerCase().replace('.', '');
  const mimeType = file.mimetype || 'application/octet-stream';
  const fileSize = file.size;

  // Format S3 key strictly: users/{user_id}/files/{file_id}-{filename}
  const s3Key = `users/${userId}/files/${fileId}-${originalName}`;

  // Upload to Amazon S3
  try {
    await storage.uploadToS3({
      buffer: file.buffer,
      key: s3Key,
      mimeType
    });
  } catch (s3Error) {
    console.error('[S3 UPLOAD FAILED]', s3Error);
    throw new AppError('File upload failed', { statusCode: 502, code: 'STORAGE_UPLOAD_FAILED' });
  }

  // Save metadata to MySQL
  const newFile = await FileModel.create({
    id: fileId,
    user_id: userId,
    folder_id: folder_id || null,
    file_name: originalName,
    original_name: originalName,
    s3_key: s3Key,
    mime_type: mimeType,
    file_size: fileSize,
    extension,
    // The legacy multipart endpoint has no Lambda validation/version binding.
    // Phase 2 therefore never represents its output as READY/completed.
    status: 'LEGACY_UNVERIFIED'
  });

  return newFile;
};

/**
 * List files for the authenticated user
 */
const listFiles = async (userId, folderId = null) => {
  const whereClause = {
    user_id: userId,
    status: 'LEGACY_UNVERIFIED'
  };

  if (folderId) {
    whereClause.folder_id = folderId;
  } else {
    whereClause.folder_id = null; // Root files
  }

  const files = await FileModel.findAll({
    where: whereClause,
    order: [['created_at', 'DESC']]
  });

  return files;
};

/**
 * Generate Presigned Download URL for a file
 */
const getDownloadUrl = async (userId, fileId) => {
  const file = await FileModel.findOne({
    where: {
      id: fileId,
      user_id: userId,
      status: 'READY'
    }
  });

  if (!file) {
    throw new AppError('File not found or access denied', { statusCode: 404, code: 'NOT_FOUND' });
  }

  // Generate S3 presigned URL
  try {
    const downloadUrl = await storage.generatePresignedDownloadUrl({
      key: file.s3_key,
      originalName: file.original_name,
      expiresInSeconds: 3600
    });

    return {
      file_id: file.id,
      file_name: file.file_name,
      download_url: downloadUrl,
      expires_in: '1 hour'
    };
  } catch (error) {
    console.error('[S3 PRESIGN FAILED]', error);
    throw new AppError('Download is temporarily unavailable', { statusCode: 502, code: 'STORAGE_PRESIGN_FAILED' });
  }
};

/**
 * Rename File
 */
const renameFile = async (userId, fileId, { file_name }) => {
  if (typeof file_name !== 'string' || file_name.trim() === '') {
    throw badRequest('New file name is required');
  }

  if (file_name.trim().length > 255) throw badRequest('file_name must be no more than 255 characters');
  const file = await FileModel.findOne({
    where: {
      id: fileId,
      user_id: userId
    }
  });

  if (!file) throw new AppError('File not found or access denied', { statusCode: 404, code: 'NOT_FOUND' });

  file.file_name = file_name.trim();
  await file.save();

  return file;
};

/**
 * Move File to another folder or root
 */
const moveFile = async (userId, fileId, { folder_id }) => {
  const file = await FileModel.findOne({
    where: {
      id: fileId,
      user_id: userId
    }
  });

  if (!file) throw new AppError('File not found or access denied', { statusCode: 404, code: 'NOT_FOUND' });

  // If folder_id provided, verify target folder exists and belongs to user
  if (folder_id) {
    const targetFolder = await FolderModel.findOne({
      where: {
        id: folder_id,
        user_id: userId
      }
    });

    if (!targetFolder) {
      throw new AppError('Target folder not found or access denied', { statusCode: 404, code: 'NOT_FOUND' });
    }
  }

  file.folder_id = folder_id || null;
  await file.save();

  return file;
};

/**
 * Delete File from S3 and MySQL
 */
const deleteFile = async (userId, fileId) => {
  const file = await FileModel.findOne({
    where: {
      id: fileId,
      user_id: userId
    }
  });

  if (!file) throw new AppError('File not found or access denied', { statusCode: 404, code: 'NOT_FOUND' });

  // Delete from S3
  try {
    await storage.deleteFromS3({ key: file.s3_key });
  } catch (error) {
    console.error('[S3 DELETE FAILED]', error);
    throw new AppError('File deletion failed; metadata was retained', { statusCode: 502, code: 'STORAGE_DELETE_FAILED' });
  }

  // Delete metadata from MySQL
  await file.destroy();

  return true;
};

return { uploadFile, listFiles, getDownloadUrl, renameFile, moveFile, deleteFile };
};

const { uploadFile, listFiles, getDownloadUrl, renameFile, moveFile, deleteFile } = createFileService();

export {
  uploadFile,
  listFiles,
  getDownloadUrl,
  renameFile,
  moveFile,
  deleteFile,
  createFileService
};
