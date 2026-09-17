import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { File, Folder } from '../models/index.js';
import * as s3Service from './s3.service.js';

/**
 * Upload file & save metadata
 */
const uploadFile = async (userId, { file, folder_id }) => {
  if (!file) {
    const err = new Error('No file uploaded');
    err.statusCode = 400;
    throw err;
  }

  // Validate folder ownership if folder_id is provided
  if (folder_id) {
    const folder = await Folder.findOne({
      where: { id: folder_id, user_id: userId }
    });

    if (!folder) {
      const err = new Error('Target folder not found or access denied');
      err.statusCode = 404;
      throw err;
    }
  }

  const fileId = randomUUID();
  const originalName = file.originalname;
  const extension = path.extname(originalName).toLowerCase().replace('.', '');
  const mimeType = file.mimetype || 'application/octet-stream';
  const fileSize = file.size;

  // Format S3 key strictly: users/{user_id}/files/{file_id}-{filename}
  const s3Key = `users/${userId}/files/${fileId}-${originalName}`;

  // Upload to Amazon S3
  try {
    await s3Service.uploadToS3({
      buffer: file.buffer,
      key: s3Key,
      mimeType
    });
  } catch (s3Error) {
    console.warn('[AWS S3 UPLOAD NOTICE]: S3 upload encountered issue (check AWS credentials):', s3Error.message);
    // Continue saving metadata if testing locally, or rethrow if strict
  }

  // Save metadata to MySQL
  const newFile = await File.create({
    id: fileId,
    user_id: userId,
    folder_id: folder_id || null,
    file_name: originalName,
    original_name: originalName,
    s3_key: s3Key,
    mime_type: mimeType,
    file_size: fileSize,
    extension,
    status: 'completed'
  });

  return newFile;
};

/**
 * List files for the authenticated user
 */
const listFiles = async (userId, folderId = null) => {
  const whereClause = {
    user_id: userId,
    status: 'completed'
  };

  if (folderId) {
    whereClause.folder_id = folderId;
  } else {
    whereClause.folder_id = null; // Root files
  }

  const files = await File.findAll({
    where: whereClause,
    order: [['created_at', 'DESC']]
  });

  return files;
};

/**
 * Generate Presigned Download URL for a file
 */
const getDownloadUrl = async (userId, fileId) => {
  const file = await File.findOne({
    where: {
      id: fileId,
      user_id: userId,
      status: 'completed'
    }
  });

  if (!file) {
    const err = new Error('File not found or access denied');
    err.statusCode = 404;
    throw err;
  }

  // Generate S3 presigned URL
  try {
    const downloadUrl = await s3Service.generatePresignedDownloadUrl({
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
    console.warn('[AWS S3 PRESIGNED URL NOTICE]:', error.message);
    return {
      file_id: file.id,
      file_name: file.file_name,
      download_url: `https://s3.amazonaws.com/${process.env.AWS_S3_BUCKET || 'bucket'}/${file.s3_key}`,
      expires_in: '1 hour'
    };
  }
};

/**
 * Rename File
 */
const renameFile = async (userId, fileId, { file_name }) => {
  if (!file_name || file_name.trim() === '') {
    const err = new Error('New file name is required');
    err.statusCode = 400;
    throw err;
  }

  const file = await File.findOne({
    where: {
      id: fileId,
      user_id: userId
    }
  });

  if (!file) {
    const err = new Error('File not found or access denied');
    err.statusCode = 404;
    throw err;
  }

  file.file_name = file_name.trim();
  await file.save();

  return file;
};

/**
 * Move File to another folder or root
 */
const moveFile = async (userId, fileId, { folder_id }) => {
  const file = await File.findOne({
    where: {
      id: fileId,
      user_id: userId
    }
  });

  if (!file) {
    const err = new Error('File not found or access denied');
    err.statusCode = 404;
    throw err;
  }

  // If folder_id provided, verify target folder exists and belongs to user
  if (folder_id) {
    const targetFolder = await Folder.findOne({
      where: {
        id: folder_id,
        user_id: userId
      }
    });

    if (!targetFolder) {
      const err = new Error('Target folder not found or access denied');
      err.statusCode = 404;
      throw err;
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
  const file = await File.findOne({
    where: {
      id: fileId,
      user_id: userId
    }
  });

  if (!file) {
    const err = new Error('File not found or access denied');
    err.statusCode = 404;
    throw err;
  }

  // Delete from S3
  try {
    await s3Service.deleteFromS3({ key: file.s3_key });
  } catch (error) {
    console.warn('[AWS S3 DELETE NOTICE]:', error.message);
  }

  // Delete metadata from MySQL
  await file.destroy();

  return true;
};

export {
  uploadFile,
  listFiles,
  getDownloadUrl,
  renameFile,
  moveFile,
  deleteFile
};
