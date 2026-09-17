import { badRequest } from '../utils/app-error.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

const assertObject = (value, field) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest(`${field} must be an object`);
  }
};

const assertString = (value, field, { min = 1, max, required = false } = {}) => {
  if (value === undefined && !required) return;
  if (typeof value !== 'string') throw badRequest(`${field} must be a string`);
  const length = value.trim().length;
  if (length < min || (max !== undefined && length > max)) {
    throw badRequest(`${field} must be between ${min} and ${max} characters`);
  }
};

const assertOptionalUuid = (value, field) => {
  if (value === undefined || value === null || value === '') return;
  if (!isUuid(value)) throw badRequest(`${field} must be a UUID`);
};

const validateFileList = (req, res, next) => {
  try {
    assertOptionalUuid(req.query.folder_id, 'folder_id');
    for (const name of ['page', 'page_size']) {
      if (req.query[name] !== undefined && (typeof req.query[name] !== 'string' || !/^\d+$/.test(req.query[name]) || Number(req.query[name]) < 1 || Number(req.query[name]) > (name === 'page_size' ? 100 : Number.MAX_SAFE_INTEGER))) throw badRequest(`${name} must be a positive integer${name === 'page_size' ? ' no greater than 100' : ''}`);
    }
    if (req.query.limit !== undefined && (typeof req.query.limit !== 'string' || !/^\d+$/.test(req.query.limit) || Number(req.query.limit) < 1 || Number(req.query.limit) > 100)) throw badRequest('limit must be a positive integer no greater than 100');
    if (req.query.search !== undefined && (typeof req.query.search !== 'string' || req.query.search.trim().length > 100)) throw badRequest('search must be a string no more than 100 characters');
    if (req.query.sort !== undefined && !['created_at', 'updated_at', 'file_name', 'file_size'].includes(req.query.sort)) throw badRequest('sort is not allowed');
    if (req.query.direction !== undefined && !['ASC', 'DESC'].includes(req.query.direction.toUpperCase())) throw badRequest('direction must be ASC or DESC');
    if (req.query.cursor !== undefined && (typeof req.query.cursor !== 'string' || req.query.cursor.length > 500)) throw badRequest('cursor is invalid');
    req.query.limit = Number(req.query.limit || 25);
    req.query.sort = req.query.sort || 'created_at';
    req.query.direction = (req.query.direction || 'DESC').toUpperCase();
    if (typeof req.query.search === 'string') req.query.search = req.query.search.trim() || undefined;
    next();
  } catch (error) { next(error); }
};

const validateIdParam = (req, res, next) => {
  if (!isUuid(req.params.id)) return next(badRequest('id must be a UUID'));
  next();
};

const validateFolderPayload = (req, res, next) => {
  try {
    assertObject(req.body, 'body');
    assertString(req.body.name, 'name', { required: true, max: 255 });
    assertOptionalUuid(req.body.parent_id, 'parent_id');
    next();
  } catch (error) { next(error); }
};

const validateFileNamePayload = (req, res, next) => {
  try { assertObject(req.body, 'body'); assertString(req.body.file_name, 'file_name', { required: true, max: 255 }); next(); } catch (error) { next(error); }
};

const validateMovePayload = (req, res, next) => {
  try { assertObject(req.body, 'body'); assertOptionalUuid(req.body.folder_id, 'folder_id'); next(); } catch (error) { next(error); }
};

const validateUploadPayload = (req, res, next) => {
  try { assertOptionalUuid(req.body.folder_id, 'folder_id'); next(); } catch (error) { next(error); }
};

const validateUploadSessionPayload = (req, res, next) => {
  try {
    assertObject(req.body, 'body');
    const key = req.get('Idempotency-Key');
    if (typeof key !== 'string' || !key.trim() || key.length > 255) throw badRequest('Idempotency-Key header is required and must be at most 255 characters');
    if (!Number.isSafeInteger(req.body.requested_size) || req.body.requested_size < 1 || req.body.requested_size > 50 * 1024 * 1024) throw badRequest('requested_size must be an integer between 1 and 52428800');
    if (typeof req.body.declared_mime_type !== 'string' || !['application/pdf', 'image/jpeg', 'image/png', 'text/plain'].includes(req.body.declared_mime_type.toLowerCase())) throw badRequest('declared_mime_type is not allowed');
    assertOptionalUuid(req.body.folder_id, 'folder_id');
    req.body = { requested_size: req.body.requested_size, declared_mime_type: req.body.declared_mime_type.toLowerCase(), folder_id: req.body.folder_id || null };
    next();
  } catch (error) { next(error); }
};

export { isUuid, validateFileList, validateIdParam, validateFolderPayload, validateFileNamePayload, validateMovePayload, validateUploadPayload, validateUploadSessionPayload };
