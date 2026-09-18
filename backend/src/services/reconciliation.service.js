import { createHash, randomUUID } from 'node:crypto';
import { Op } from 'sequelize';
import { sequelize, User, File, UploadSession, Job, ReconciliationFinding } from '../models/index.js';

const ACTIVE_UPLOADS = ['RESERVED', 'UPLOADING', 'UPLOADED'];
const USED_FILE_STATES = ['READY', 'TRASHED', 'PURGE_PENDING'];
const fingerprint = (...parts) => createHash('sha256').update(parts.join('\0')).digest('hex');
const plain = (row) => row?.get ? row.get({ plain: true }) : row;

export const createReconciliationService = ({
  sequelizeInstance = sequelize, UserModel = User, FileModel = File,
  UploadSessionModel = UploadSession, JobModel = Job, FindingModel = ReconciliationFinding,
  storage, now = () => new Date(), batchSize = 100,
  intervalMs = Math.max(60_000, Number.parseInt(process.env.RECONCILE_INTERVAL_MS || '900000', 10) || 900000),
  stalledUploadMs = Math.max(60_000, (Number.parseInt(process.env.STALLED_UPLOAD_MINUTES || '10', 10) || 10) * 60_000),
  orphanGraceMs = Math.max(24, Number.parseInt(process.env.ORPHAN_GRACE_HOURS || '24', 10) || 24) * 60 * 60 * 1000,
  orphanCleanupMode = process.env.ORPHAN_CLEANUP_MODE === 'delete' ? 'delete' : 'report-only'
} = {}) => {
  if (!storage) throw new Error('Reconciliation storage adapter is required');

  const recordFinding = async ({ kind, key, versionId, isDeleteMarker = false, userId = null, details = {}, transaction }) => {
    const id = fingerprint(kind, key || '', versionId || '', userId || '');
    const [finding, created] = await FindingModel.findOrCreate({
      where: { fingerprint: id },
      defaults: { id: randomUUID(), fingerprint: id, kind, status: 'CANDIDATE', object_key: key || null, object_version_id: versionId || null, is_delete_marker: isDeleteMarker, user_id: userId, details, first_seen_at: now(), last_seen_at: now() },
      transaction
    });
    if (!created) {
      finding.last_seen_at = now(); finding.details = details;
      await finding.save({ transaction });
    }
    return { finding, created };
  };

  const scheduleAndDetectUploads = async (cursor) => {
    const where = { status: { [Op.in]: ACTIVE_UPLOADS } };
    if (cursor) where.id = { [Op.gt]: cursor };
    const sessions = await UploadSessionModel.findAll({ where, order: [['id', 'ASC']], limit: batchSize });
    const jobs = [];
    for (const row of sessions) {
      const session = plain(row);
      jobs.push({ type: 'EXPIRE_UPLOAD_SESSION', status: 'QUEUED', payload: { upload_session_id: session.id }, dedupe_key: `expire-upload:${session.id}`, attempts: 0, max_attempts: 10, run_at: session.expires_at, next_attempt_at: session.expires_at });
      if (session.status === 'UPLOADED' && new Date(session.updated_at || session.completed_at || session.created_at) <= new Date(now().getTime() - stalledUploadMs)) {
        await recordFinding({ kind: 'STALLED_UPLOAD', key: session.id, userId: session.user_id, details: { status: session.status } });
        if (session.source_version_id) jobs.push({ type: 'FINALIZE_UPLOAD', status: 'QUEUED', payload: { upload_session_id: session.id, file_id: randomUUID() }, dedupe_key: `finalize:${session.id}`, attempts: 0, max_attempts: 10, run_at: now(), next_attempt_at: now() });
      }
    }
    for (const candidate of jobs) {
      await JobModel.findOrCreate({ where: { dedupe_key: candidate.dedupe_key }, defaults: candidate });
    }
    return sessions.length === batchSize ? plain(sessions.at(-1)).id : null;
  };

  const reconcileUserQuota = async (userId) => sequelizeInstance.transaction(async (transaction) => {
    const user = await UserModel.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) return null;
    // Keep statements sequential on the transaction's single MySQL
    // connection and lock in the same user -> child-row order as quota flows.
    const files = await FileModel.findAll({ where: { user_id: userId, status: { [Op.in]: USED_FILE_STATES } }, attributes: ['file_size'], transaction, lock: transaction.LOCK.UPDATE });
    const sessions = await UploadSessionModel.findAll({ where: { user_id: userId, status: { [Op.in]: ACTIVE_UPLOADS } }, attributes: ['requested_size'], transaction, lock: transaction.LOCK.UPDATE });
    const expectedUsed = files.reduce((sum, file) => sum + BigInt(file.file_size), 0n);
    const expectedReserved = sessions.reduce((sum, session) => sum + BigInt(session.requested_size), 0n);
    const before = { used_bytes: String(user.used_bytes), reserved_bytes: String(user.reserved_bytes) };
    if (BigInt(user.used_bytes) === expectedUsed && BigInt(user.reserved_bytes) === expectedReserved) return { corrected: false, expectedUsed, expectedReserved };
    user.used_bytes = expectedUsed.toString(); user.reserved_bytes = expectedReserved.toString();
    await user.save({ transaction });
    const { finding } = await recordFinding({ kind: 'QUOTA_MISMATCH', key: userId, userId, details: { before, after: { used_bytes: user.used_bytes, reserved_bytes: user.reserved_bytes } }, transaction });
    finding.status = 'RESOLVED'; finding.resolved_at = now(); await finding.save({ transaction });
    return { corrected: true, expectedUsed, expectedReserved };
  });

  const reconcileQuotas = async (cursor) => {
    const where = cursor ? { id: { [Op.gt]: cursor } } : {};
    const users = await UserModel.findAll({ where, attributes: ['id'], order: [['id', 'ASC']], limit: batchSize });
    for (const user of users) await reconcileUserQuota(user.id);
    return users.length === batchSize ? plain(users.at(-1)).id : null;
  };

  const referenced = (item) => FileModel.findOne({ where: { s3_key: item.key, s3_version_id: item.versionId, status: { [Op.ne]: 'PURGED' } }, attributes: ['id'] });

  const inspectOrphan = async (item) => {
    if (!item.key?.startsWith('objects/') || typeof item.versionId !== 'string' || !item.versionId) return;
    const existingReference = await referenced(item);
    const id = fingerprint('ORPHAN_OBJECT', item.key, item.versionId, '');
    const existing = await FindingModel.findOne({ where: { fingerprint: id } });
    if (existingReference) {
      if (existing && !['RESOLVED', 'DELETED'].includes(existing.status)) {
        existing.status = 'RESOLVED'; existing.resolved_at = now(); existing.last_seen_at = now(); await existing.save();
      }
      return;
    }
    if (!existing) {
      await recordFinding({ kind: 'ORPHAN_OBJECT', key: item.key, versionId: item.versionId, isDeleteMarker: item.isDeleteMarker, details: { report_only: orphanCleanupMode !== 'delete' } });
      return;
    }
    const seenPreviously = new Date(existing.last_seen_at) < now();
    existing.last_seen_at = now();
    if (!seenPreviously || now().getTime() - new Date(existing.first_seen_at).getTime() < orphanGraceMs) { await existing.save(); return; }
    // This query is the authoritative recheck after the grace period.
    if (await referenced(item)) { existing.status = 'RESOLVED'; existing.resolved_at = now(); await existing.save(); return; }
    existing.status = 'CONFIRMED'; existing.confirmed_at = existing.confirmed_at || now(); await existing.save();
    if (orphanCleanupMode === 'delete') {
      await storage.deleteObjectVersion({ key: item.key, versionId: item.versionId });
      existing.status = 'DELETED'; existing.resolved_at = now(); await existing.save();
    }
  };

  const reconcileOrphans = async ({ keyMarker, versionIdMarker } = {}) => {
    const page = await storage.listObjectVersionsPage({ prefix: 'objects/', keyMarker, versionIdMarker, maxKeys: batchSize });
    for (const item of page.items) await inspectOrphan(item);
    return page.isTruncated ? { keyMarker: page.nextKeyMarker, versionIdMarker: page.nextVersionIdMarker } : {};
  };

  const process = async ({ job }) => {
    const payload = job.payload || {};
    const uploadCursor = await scheduleAndDetectUploads(payload.upload_cursor || null);
    const userCursor = await reconcileQuotas(payload.user_cursor || null);
    const orphan = await reconcileOrphans({ keyMarker: payload.orphan_key_marker, versionIdMarker: payload.orphan_version_marker });
    const continuing = Boolean(uploadCursor || userCursor || orphan.keyMarker);
    return {
      nextRunAt: new Date(now().getTime() + (continuing ? 1_000 : intervalMs)),
      payload: {
        upload_cursor: uploadCursor,
        user_cursor: userCursor,
        orphan_key_marker: orphan.keyMarker || null,
        orphan_version_marker: orphan.versionIdMarker || null
      }
    };
  };

  return { process, reconcileUserQuota, inspectOrphan, scheduleAndDetectUploads };
};
