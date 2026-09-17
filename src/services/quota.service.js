import { createHash, randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { sequelize, User, Folder, UploadSession } from '../models/index.js';
import { AppError, badRequest } from '../utils/app-error.js';

export const DEFAULT_QUOTA_BYTES = 1024n * 1024n * 1024n;
export const MAX_FILE_SIZE_BYTES = 50n * 1024n * 1024n;
export const MAX_ACTIVE_UPLOAD_SESSIONS = 3;
const ACTIVE_STATUSES = ['RESERVED', 'UPLOADING'];

const notFound = (message) => new AppError(message, { statusCode: 404, code: 'NOT_FOUND' });
const conflict = (message, code = 'QUOTA_EXCEEDED') => new AppError(message, { statusCode: 409, code });
const asBigInt = (value) => BigInt(String(value));
const asDecimal = (value) => value.toString();
const sessionTtlMs = () => {
  const minutes = Number.parseInt(process.env.UPLOAD_SESSION_TTL_MINUTES || '15', 10);
  return (Number.isInteger(minutes) && minutes >= 1 && minutes <= 60 ? minutes : 15) * 60 * 1000;
};
const payloadHash = ({ requested_size, declared_mime_type, folder_id }) => createHash('sha256')
  .update(JSON.stringify({ requested_size: String(requested_size), declared_mime_type, folder_id: folder_id || null }))
  .digest('hex');

const createQuotaService = ({ sequelizeInstance = sequelize, UserModel = User, FolderModel = Folder, UploadSessionModel = UploadSession, now = () => new Date() } = {}) => {
  const expireSessions = async (user, transaction, currentTime) => {
    const expired = await UploadSessionModel.findAll({
      where: { user_id: user.id, status: { [Op.in]: ACTIVE_STATUSES }, expires_at: { [Op.lte]: currentTime } },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!expired.length) return;
    const released = expired.reduce((total, session) => total + asBigInt(session.requested_size), 0n);
    for (const session of expired) {
      session.status = 'EXPIRED';
      await session.save({ transaction });
    }
    user.reserved_bytes = asDecimal(asBigInt(user.reserved_bytes) > released ? asBigInt(user.reserved_bytes) - released : 0n);
    await user.save({ transaction });
  };

  const reserveQuota = async (userId, payload, idempotencyKey) => sequelizeInstance.transaction(async (transaction) => {
    const currentTime = now();
    const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw notFound('User not found');
    await expireSessions(user, transaction, currentTime);

    const hash = payloadHash(payload);
    const existing = await UploadSessionModel.findOne({ where: { user_id: userId, idempotency_key: idempotencyKey }, transaction, lock: transaction.LOCK.UPDATE });
    if (existing) {
      if (existing.payload_hash !== hash) throw conflict('Idempotency-Key was already used with a different payload', 'IDEMPOTENCY_CONFLICT');
      return existing;
    }

    if (payload.folder_id && !await FolderModel.findOne({ where: { id: payload.folder_id, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE })) {
      throw notFound('Target folder not found or access denied');
    }
    const activeCount = await UploadSessionModel.count({
      where: { user_id: userId, status: { [Op.in]: ACTIVE_STATUSES }, expires_at: { [Op.gt]: currentTime } },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (activeCount >= MAX_ACTIVE_UPLOAD_SESSIONS) throw conflict('Maximum of 3 active upload sessions reached', 'UPLOAD_SESSION_LIMIT_REACHED');

    const requested = asBigInt(payload.requested_size);
    const total = asBigInt(user.used_bytes) + asBigInt(user.reserved_bytes) + requested;
    if (total > asBigInt(user.quota_bytes)) throw conflict('Storage quota would be exceeded');

    const id = randomUUID();
    const session = await UploadSessionModel.create({
      id,
      user_id: userId,
      folder_id: payload.folder_id || null,
      idempotency_key: idempotencyKey,
      payload_hash: hash,
      requested_size: asDecimal(requested),
      declared_mime_type: payload.declared_mime_type,
      // This is only an internal identifier. Phase 5B will bind it to a presigned POST.
      incoming_key: `incoming/${userId}/${id}`,
      status: 'RESERVED',
      expires_at: new Date(currentTime.getTime() + sessionTtlMs())
    }, { transaction });
    user.reserved_bytes = asDecimal(asBigInt(user.reserved_bytes) + requested);
    await user.save({ transaction });
    return session;
  });

  const releaseQuota = async (userId, sessionId, { status = 'CANCELLED' } = {}) => sequelizeInstance.transaction(async (transaction) => {
    const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw notFound('User not found');
    const session = await UploadSessionModel.findOne({ where: { id: sessionId, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!session) throw notFound('Upload session not found or access denied');
    if (!ACTIVE_STATUSES.includes(session.status)) return session;
    const requested = asBigInt(session.requested_size);
    user.reserved_bytes = asDecimal(asBigInt(user.reserved_bytes) > requested ? asBigInt(user.reserved_bytes) - requested : 0n);
    session.status = status;
    await Promise.all([user.save({ transaction }), session.save({ transaction })]);
    return session;
  });

  const commitQuota = async (userId, sessionId) => sequelizeInstance.transaction(async (transaction) => {
    const currentTime = now();
    const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw notFound('User not found');
    await expireSessions(user, transaction, currentTime);
    const session = await UploadSessionModel.findOne({ where: { id: sessionId, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!session) throw notFound('Upload session not found or access denied');
    if (session.status === 'COMPLETED') return session;
    if (!ACTIVE_STATUSES.includes(session.status)) throw conflict('Upload session is no longer active', 'UPLOAD_SESSION_NOT_ACTIVE');
    const requested = asBigInt(session.requested_size);
    user.reserved_bytes = asDecimal(asBigInt(user.reserved_bytes) > requested ? asBigInt(user.reserved_bytes) - requested : 0n);
    user.used_bytes = asDecimal(asBigInt(user.used_bytes) + requested);
    session.status = 'COMPLETED';
    session.completed_at = currentTime;
    await Promise.all([user.save({ transaction }), session.save({ transaction })]);
    return session;
  });

  const getUploadSession = async (userId, sessionId) => sequelizeInstance.transaction(async (transaction) => {
    const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw notFound('User not found');
    await expireSessions(user, transaction, now());
    const session = await UploadSessionModel.findOne({ where: { id: sessionId, user_id: userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!session) throw notFound('Upload session not found or access denied');
    return session;
  });

  const getUsage = async (userId) => sequelizeInstance.transaction(async (transaction) => {
    const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw notFound('User not found');
    await expireSessions(user, transaction, now());
    const quota = asBigInt(user.quota_bytes);
    const used = asBigInt(user.used_bytes);
    const reserved = asBigInt(user.reserved_bytes);
    return { quota_bytes: asDecimal(quota), used_bytes: asDecimal(used), reserved_bytes: asDecimal(reserved), available_bytes: asDecimal(quota > used + reserved ? quota - used - reserved : 0n) };
  });

  return { reserveQuota, releaseQuota, commitQuota, getUploadSession, getUsage };
};

const quotaService = createQuotaService();
export const { reserveQuota, releaseQuota, commitQuota, getUploadSession, getUsage } = quotaService;
export { createQuotaService };
