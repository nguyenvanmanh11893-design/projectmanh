import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { sequelize, File, Folder, AuditEvent, Job } from '../models/index.js';
import * as s3Service from './s3.service.js';
import { AppError, badRequest } from '../utils/app-error.js';
import { recordAuditEvent } from './audit.service.js';

const SORT_FIELDS = new Set(['created_at', 'updated_at', 'file_name', 'file_size']);
const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const notFound = (message) => new AppError(message, { statusCode: 404, code: 'NOT_FOUND' });
const escapeLike = (value) => value.replace(/[\\%_]/g, '\\$&');
const encodeCursor = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const decodeCursor = (value, sort, direction) => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || parsed.sort !== sort || parsed.direction !== direction || typeof parsed.id !== 'string' || parsed.value === undefined) throw new Error();
    return parsed;
  } catch { throw badRequest('cursor is invalid for this sort'); }
};

const createFileService = ({ FileModel = File, FolderModel = Folder, JobModel = Job, AuditEventModel = AuditEvent, storage = s3Service, sequelizeInstance = sequelize, now = () => new Date() } = {}) => {
  const uploadFile = async (userId, { file, folder_id }, { requestId } = {}) => {
    if (!file) throw badRequest('No file uploaded');
    const fileId = randomUUID();
    const originalName = String(file.originalname || '').trim();
    if (!originalName || originalName.length > 255) throw badRequest('File name must be between 1 and 255 characters');
    const s3Key = `users/${userId}/files/${fileId}-${originalName}`;
    try { await storage.uploadToS3({ buffer: file.buffer, key: s3Key, mimeType: file.mimetype || 'application/octet-stream' }); }
    catch (error) { console.error('[S3 UPLOAD FAILED]', error); throw new AppError('File upload failed', { statusCode: 502, code: 'STORAGE_UPLOAD_FAILED' }); }
    return sequelizeInstance.transaction(async (transaction) => {
      // Serialize metadata insertion with empty-folder deletion. S3 has already
      // succeeded; a concurrent delete leaves only an orphan for later reconciliation.
      if (folder_id && !await FolderModel.findOne({ where: { id: folder_id, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE })) throw notFound('Target folder not found or access denied');
      const newFile = await FileModel.create({ id: fileId, user_id: userId, folder_id: folder_id || null, file_name: originalName, original_name: originalName, s3_key: s3Key, mime_type: file.mimetype || 'application/octet-stream', file_size: file.size, extension: path.extname(originalName).toLowerCase().replace('.', ''), status: 'LEGACY_UNVERIFIED' }, { transaction });
      await recordAuditEvent({ AuditEventModel, userId, action: 'file.uploaded', resourceType: 'file', resourceId: newFile.id, metadata: { file_name: newFile.file_name, folder_id: newFile.folder_id }, requestId, transaction });
      return newFile;
    });
  };

  const listFiles = async (userId, { folder_id = null, search, sort = 'created_at', direction = 'DESC', limit = 25, cursor } = {}) => {
    if (folder_id && !await FolderModel.findOne({ where: { id: folder_id, user_id: userId } })) throw notFound('Folder not found or access denied');
    const where = { user_id: userId, folder_id: folder_id || null, status: { [Op.in]: ['LEGACY_UNVERIFIED', 'READY'] } };
    if (search) where.file_name = { [Op.like]: `%${escapeLike(search)}%` };
    const after = decodeCursor(cursor, sort, direction);
    if (after) {
      const comparison = direction === 'ASC' ? Op.gt : Op.lt;
      where[Op.and] = [{ [Op.or]: [{ [sort]: { [comparison]: after.value } }, { [sort]: after.value, id: { [comparison]: after.id } }] }];
    }
    const rows = await FileModel.findAll({ where, order: [[sort, direction], ['id', direction]], limit: limit + 1 });
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return { items, next_cursor: rows.length > limit && last ? encodeCursor({ sort, direction, value: last.get ? last.get(sort) : last[sort], id: last.id }) : null };
  };

  const listTrash = async (userId, { folder_id, search, status = 'ALL', sort = 'trashed_at', direction = 'DESC', limit = 25, cursor } = {}) => {
    if (folder_id && !await FolderModel.findOne({ where: { id: folder_id, user_id: userId } })) throw notFound('Folder not found or access denied');
    const statuses = status === 'ALL' ? ['TRASHED', 'PURGE_PENDING'] : [status];
    const where = { user_id: userId, status: { [Op.in]: statuses } };
    if (folder_id !== undefined) where.folder_id = folder_id || null;
    if (search) where.file_name = { [Op.like]: `%${escapeLike(search)}%` };
    const after = decodeCursor(cursor, sort, direction);
    if (after) {
      const comparison = direction === 'ASC' ? Op.gt : Op.lt;
      where[Op.and] = [{ [Op.or]: [{ [sort]: { [comparison]: after.value } }, { [sort]: after.value, id: { [comparison]: after.id } }] }];
    }
    const rows = await FileModel.findAll({ where, order: [[sort, direction], ['id', direction]], limit: limit + 1 });
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return { items, next_cursor: rows.length > limit && last ? encodeCursor({ sort, direction, value: last.get ? last.get(sort) : last[sort], id: last.id }) : null };
  };

  const getDownloadUrl = async (userId, fileId) => {
    const file = await FileModel.findOne({ where: { id: fileId, user_id: userId, status: 'READY' } });
    if (!file) throw notFound('File not found or access denied');
    try {
      if (!file.s3_version_id || file.s3_version_id === 'null') throw new Error('Missing immutable object version');
      const downloadUrl = await storage.generatePresignedDownloadUrl({ key: file.s3_key, versionId: file.s3_version_id, originalName: file.original_name, expiresInSeconds: 300 });
      return { file_id: file.id, file_name: file.file_name, download_url: downloadUrl, expires_in: '5 minutes' };
    } catch { console.error('[S3 PRESIGN FAILED]'); throw new AppError('Download is temporarily unavailable', { statusCode: 502, code: 'STORAGE_PRESIGN_FAILED' }); }
  };

  const renameFile = async (userId, fileId, { file_name }, { requestId } = {}) => sequelizeInstance.transaction(async (transaction) => {
    if (typeof file_name !== 'string' || !file_name.trim()) throw badRequest('New file name is required');
    const file = await FileModel.findOne({ where: { id: fileId, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!file) throw notFound('File not found or access denied');
    file.file_name = file_name.trim();
    await file.save({ transaction });
    await recordAuditEvent({ AuditEventModel, userId, action: 'file.renamed', resourceType: 'file', resourceId: file.id, metadata: { file_name: file.file_name }, requestId, transaction });
    return file;
  });

  const moveFile = async (userId, fileId, { folder_id }, { requestId } = {}) => sequelizeInstance.transaction(async (transaction) => {
    // Lock the destination first, so delete sees a stable empty/non-empty result.
    if (folder_id && !await FolderModel.findOne({ where: { id: folder_id, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE })) throw notFound('Target folder not found or access denied');
    const file = await FileModel.findOne({ where: { id: fileId, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!file) throw notFound('File not found or access denied');
    file.folder_id = folder_id || null;
    await file.save({ transaction });
    await recordAuditEvent({ AuditEventModel, userId, action: 'file.moved', resourceType: 'file', resourceId: file.id, metadata: { folder_id: file.folder_id }, requestId, transaction });
    return file;
  });

  const deleteFile = async (userId, fileId, { requestId } = {}) => {
    const file = await FileModel.findOne({ where: { id: fileId, user_id: userId } });
    if (!file) throw notFound('File not found or access denied');
    if (file.status !== 'LEGACY_UNVERIFIED') throw new AppError('Versioned file deletion requires the lifecycle workflow', { statusCode: 409, code: 'FILE_LIFECYCLE_REQUIRED' });
    try { await storage.deleteFromS3({ key: file.s3_key }); }
    catch (error) { console.error('[S3 DELETE FAILED]', error); throw new AppError('File deletion failed; metadata was retained', { statusCode: 502, code: 'STORAGE_DELETE_FAILED' }); }
    await file.destroy();
    await recordAuditEvent({ AuditEventModel, userId, action: 'file.deleted', resourceType: 'file', resourceId: fileId, metadata: {}, requestId });
    return true;
  };

  const trashFile = async (userId, fileId, { requestId } = {}) => sequelizeInstance.transaction(async (transaction) => {
    let job = await JobModel.findOne({ where: { dedupe_key: `purge:${fileId}` }, transaction, lock: transaction.LOCK.UPDATE });
    const file = await FileModel.findOne({ where: { id: fileId, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!file) throw notFound('File not found or access denied');
    if (file.status === 'PURGE_PENDING' || file.status === 'PURGED') throw new AppError('File can no longer be moved to trash', { statusCode: 409, code: 'FILE_PURGE_STARTED' });
    if (!['READY', 'TRASHED'].includes(file.status)) throw new AppError('Only ready files can be moved to trash', { statusCode: 409, code: 'FILE_NOT_READY' });
    const newlyTrashed = file.status === 'READY';
    const trashedAt = newlyTrashed ? now() : new Date(file.trashed_at);
    const purgeAt = new Date(trashedAt.getTime() + TRASH_RETENTION_MS);
    if (newlyTrashed) {
      file.status = 'TRASHED'; file.trashed_at = trashedAt; file.purge_requested_at = null;
      await file.save({ transaction });
    }
    if (!job) {
      job = await JobModel.create({ type: 'PURGE_FILE', status: 'QUEUED', payload: { file_id: file.id }, dedupe_key: `purge:${file.id}`, attempts: 0, max_attempts: 20, run_at: purgeAt, next_attempt_at: purgeAt }, { transaction });
    } else if (job.status !== 'QUEUED' || new Date(job.next_attempt_at).getTime() !== purgeAt.getTime()) {
      job.status = 'QUEUED'; job.attempts = 0; job.last_error = null; job.payload = { file_id: file.id };
      job.run_at = job.next_attempt_at = purgeAt; job.locked_at = job.locked_until = job.locked_by = job.lease_token = null;
      await job.save({ transaction });
    }
    if (newlyTrashed) await recordAuditEvent({ AuditEventModel, userId, action: 'file.trashed', resourceType: 'file', resourceId: file.id, metadata: { purge_after: purgeAt.toISOString() }, requestId, transaction });
    return file;
  });

  const restoreFile = async (userId, fileId, { requestId } = {}) => sequelizeInstance.transaction(async (transaction) => {
    // Lock the durable job before the file. The purge worker uses the same
    // order, so either restore wins and fences it, or PURGE_PENDING wins.
    const job = await JobModel.findOne({ where: { dedupe_key: `purge:${fileId}` }, transaction, lock: transaction.LOCK.UPDATE });
    const file = await FileModel.findOne({ where: { id: fileId, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!file) throw notFound('File not found or access denied');
    if (file.status === 'READY') return file;
    if (file.status !== 'TRASHED') throw new AppError('File cannot be restored after purge has started', { statusCode: 409, code: 'FILE_PURGE_STARTED' });
    if (job) {
      job.status = 'SUCCEEDED'; job.locked_at = job.locked_until = job.locked_by = job.lease_token = null;
      await job.save({ transaction });
    }
    file.status = 'READY'; file.trashed_at = null; file.purge_requested_at = null;
    await file.save({ transaction });
    await recordAuditEvent({ AuditEventModel, userId, action: 'file.restored', resourceType: 'file', resourceId: file.id, metadata: {}, requestId, transaction });
    return file;
  });

  const requestPermanentDelete = async (userId, fileId, { requestId } = {}) => sequelizeInstance.transaction(async (transaction) => {
    let job = await JobModel.findOne({ where: { dedupe_key: `purge:${fileId}` }, transaction, lock: transaction.LOCK.UPDATE });
    const file = await FileModel.findOne({ where: { id: fileId, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!file) throw notFound('File not found or access denied');
    if (file.status === 'PURGED') return { file, accepted: false };
    if (!['TRASHED', 'PURGE_PENDING'].includes(file.status)) throw new AppError('File must be in trash before permanent deletion', { statusCode: 409, code: 'FILE_NOT_TRASHED' });
    const requestedAt = file.purge_requested_at || now();
    file.status = 'PURGE_PENDING'; file.purge_requested_at = requestedAt;
    await file.save({ transaction });
    if (!job) {
      job = await JobModel.create({ type: 'PURGE_FILE', status: 'QUEUED', payload: { file_id: file.id }, dedupe_key: `purge:${file.id}`, attempts: 0, max_attempts: 20, run_at: requestedAt, next_attempt_at: requestedAt }, { transaction });
    } else if (job.status !== 'RUNNING') {
      job.status = 'QUEUED'; job.attempts = 0; job.last_error = null;
      job.run_at = job.next_attempt_at = requestedAt;
      job.locked_at = job.locked_until = job.locked_by = job.lease_token = null;
      await job.save({ transaction });
    }
    await recordAuditEvent({ AuditEventModel, userId, action: 'file.purge_requested', resourceType: 'file', resourceId: file.id, metadata: {}, requestId, transaction });
    return { file, accepted: true };
  });

  return { uploadFile, listFiles, listTrash, getDownloadUrl, renameFile, moveFile, deleteFile, trashFile, restoreFile, requestPermanentDelete };
};

const { uploadFile, listFiles, listTrash, getDownloadUrl, renameFile, moveFile, deleteFile, trashFile, restoreFile, requestPermanentDelete } = createFileService();
export { SORT_FIELDS, TRASH_RETENTION_MS, uploadFile, listFiles, listTrash, getDownloadUrl, renameFile, moveFile, deleteFile, trashFile, restoreFile, requestPermanentDelete, createFileService };
