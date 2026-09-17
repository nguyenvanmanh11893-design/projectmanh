import * as quotaService from '../services/quota.service.js';
import * as directUploadService from '../services/direct-upload.service.js';
import { successResponse } from '../utils/response.js';

const safeSession = (session) => ({
  id: session.id,
  status: session.status,
  requested_size: String(session.requested_size),
  declared_mime_type: session.declared_mime_type,
  folder_id: session.folder_id,
  expires_at: session.expires_at,
  source_version_id: session.source_version_id || null
});

const create = async (req, res, next) => {
  try {
    const reserved = await quotaService.reserveQuota(req.user.id, req.body, req.get('Idempotency-Key'));
    const issued = await directUploadService.issuePresignedPost(req.user.id, reserved.id);
    return successResponse(res, 'Upload session reserved successfully', { upload_session: safeSession(issued.session), presigned_post: issued.presigned_post }, 201);
  } catch (error) { next(error); }
};

const getById = async (req, res, next) => {
  try { return successResponse(res, 'Upload session retrieved successfully', safeSession(await quotaService.getUploadSession(req.user.id, req.params.id))); }
  catch (error) { next(error); }
};

const complete = async (req, res, next) => {
  try { return successResponse(res, 'Upload object version accepted and awaiting validation', safeSession(await directUploadService.completeDirectUpload(req.user.id, req.params.id, req.body.versionId))); }
  catch (error) { next(error); }
};

export { create, getById, complete };
