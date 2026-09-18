import * as quotaService from './quota.service.js';
import { createS3StorageAdapter } from './s3-storage.adapter.js';
import { AppError } from '../utils/app-error.js';

const POST_TTL_SECONDS = 5 * 60;
const conflict = (message, code) => new AppError(message, { statusCode: 409, code });
const storageFailure = (message, code) => new AppError(message, { statusCode: 502, code });
const isMissingObject = (error) => error?.$metadata?.httpStatusCode === 404 || ['NotFound', 'NoSuchKey', 'NoSuchVersion'].includes(error?.name);

const postTtlSeconds = () => {
  const configured = Number.parseInt(process.env.UPLOAD_POST_TTL_SECONDS || String(POST_TTL_SECONDS), 10);
  return Number.isInteger(configured) && configured >= 1 && configured <= POST_TTL_SECONDS ? configured : POST_TTL_SECONDS;
};

const createDirectUploadService = ({ quota = quotaService, storage = createS3StorageAdapter(), now = () => new Date() } = {}) => {
  const issuePresignedPost = async (userId, sessionId) => {
    const session = await quota.prepareDirectUpload(userId, sessionId);
    if (session.source_version_id) return { session, presigned_post: null };
    const remainingSeconds = Math.floor((new Date(session.expires_at).getTime() - now().getTime()) / 1000);
    if (remainingSeconds < 1) throw conflict('Upload session has expired', 'UPLOAD_SESSION_EXPIRED');
    const expiresInSeconds = Math.min(postTtlSeconds(), remainingSeconds);
    try {
      const post = await storage.createDirectUploadPost({
        key: session.incoming_key,
        contentType: session.declared_mime_type,
        contentLength: Number(session.requested_size),
        expiresInSeconds
      });
      return { session, presigned_post: { url: post.url, fields: post.fields, expires_at: new Date(now().getTime() + expiresInSeconds * 1000) } };
    } catch (error) {
      throw storageFailure('Upload authorization is temporarily unavailable', 'STORAGE_PRESIGN_FAILED');
    }
  };

  const completeDirectUpload = async (userId, sessionId, versionId) => {
    const session = await quota.prepareDirectUpload(userId, sessionId);
    if (session.source_version_id) {
      if (session.source_version_id === versionId) return session;
      throw conflict('A different object version has already been completed for this upload', 'UPLOAD_VERSION_CONFLICT');
    }
    let object;
    try { object = await storage.headObject({ key: session.incoming_key, versionId }); }
    catch (error) {
      if (isMissingObject(error)) throw conflict('Uploaded object version was not found', 'UPLOAD_OBJECT_NOT_FOUND');
      throw storageFailure('Uploaded object could not be verified', 'STORAGE_HEAD_FAILED');
    }
    if (String(object.contentLength) !== String(session.requested_size)) throw conflict('Uploaded object size does not match the reserved size', 'UPLOAD_SIZE_MISMATCH');
    if (object.contentType !== session.declared_mime_type) throw conflict('Uploaded object content type does not match the declared type', 'UPLOAD_CONTENT_TYPE_MISMATCH');
    return quota.bindSourceVersion(userId, sessionId, versionId);
  };

  return { issuePresignedPost, completeDirectUpload };
};

const directUploadService = createDirectUploadService();
export const { issuePresignedPost, completeDirectUpload } = directUploadService;
export { createDirectUploadService, POST_TTL_SECONDS };
