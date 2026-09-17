export const id = '006-phase7-lifecycle-reconciliation';

const tableExists = async (qi, name) => (await qi.showAllTables()).some((table) => String(table).toLowerCase() === name);

export async function up({ sequelize }) {
  const qi = sequelize.getQueryInterface();
  const fileColumns = await qi.describeTable('files');
  if (!fileColumns.purged_at) await sequelize.query('ALTER TABLE files ADD COLUMN purged_at DATETIME NULL');
  const fileIndexes = await qi.showIndex('files');
  if (!fileIndexes.some((index) => index.name === 'idx_files_s3_reference')) await sequelize.query('ALTER TABLE files ADD KEY idx_files_s3_reference (s3_key(191), s3_version_id(191), status)');
  if (!fileIndexes.some((index) => index.name === 'idx_files_trash_listing')) await sequelize.query('ALTER TABLE files ADD KEY idx_files_trash_listing (user_id, status, trashed_at, id)');

  if (!await tableExists(qi, 'reconciliation_findings')) {
    await sequelize.query(`CREATE TABLE reconciliation_findings (
      id CHAR(36) NOT NULL, fingerprint CHAR(64) NOT NULL, kind VARCHAR(64) NOT NULL,
      status ENUM('CANDIDATE','CONFIRMED','RESOLVED','DELETED') NOT NULL DEFAULT 'CANDIDATE',
      object_key VARCHAR(500) NULL, object_version_id VARCHAR(1024) NULL,
      is_delete_marker BOOLEAN NOT NULL DEFAULT FALSE, user_id CHAR(36) NULL, details JSON NULL,
      first_seen_at DATETIME NOT NULL, last_seen_at DATETIME NOT NULL,
      confirmed_at DATETIME NULL, resolved_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id), UNIQUE KEY uk_reconciliation_fingerprint (fingerprint),
      KEY idx_reconciliation_status_seen (kind, status, first_seen_at),
      KEY idx_reconciliation_object (object_key(191), object_version_id(191))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }

  // Existing active sessions receive an independently retryable expiry job.
  await sequelize.query(`INSERT IGNORE INTO jobs
    (id, type, status, payload, dedupe_key, attempts, max_attempts, run_at, next_attempt_at, lease_generation, created_at, updated_at)
    SELECT UUID(), 'EXPIRE_UPLOAD_SESSION', 'QUEUED', JSON_OBJECT('upload_session_id', s.id),
      CONCAT('expire-upload:', s.id), 0, 10, s.expires_at, s.expires_at, 0, NOW(), NOW()
    FROM upload_sessions s WHERE s.status IN ('RESERVED','UPLOADING','UPLOADED')`);

  // A delayed purge job exists even before the user asks for immediate purge.
  await sequelize.query(`INSERT IGNORE INTO jobs
    (id, type, status, payload, dedupe_key, attempts, max_attempts, run_at, next_attempt_at, lease_generation, created_at, updated_at)
    SELECT UUID(), 'PURGE_FILE', 'QUEUED', JSON_OBJECT('file_id', f.id), CONCAT('purge:', f.id),
      0, 20, DATE_ADD(f.trashed_at, INTERVAL 7 DAY), DATE_ADD(f.trashed_at, INTERVAL 7 DAY), 0, NOW(), NOW()
    FROM files f WHERE f.status = 'TRASHED' AND f.trashed_at IS NOT NULL`);

  await sequelize.query(`INSERT IGNORE INTO jobs
    (id, type, status, payload, dedupe_key, attempts, max_attempts, run_at, next_attempt_at, lease_generation, created_at, updated_at)
    VALUES (UUID(), 'RECONCILE', 'QUEUED', JSON_OBJECT(), 'reconcile:periodic', 0, 10, NOW(), NOW(), 0, NOW(), NOW())`);
}
