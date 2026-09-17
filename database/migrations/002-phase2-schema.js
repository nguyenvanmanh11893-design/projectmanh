export const id = '002-phase2-schema';

const create = (name, sql) => async ({ sequelize }) => {
  const tables = await sequelize.getQueryInterface().showAllTables();
  if (!tables.some((table) => String(table).toLowerCase() === name)) await sequelize.query(sql);
};

async function assertOwnershipIsConsistent(sequelize) {
  const [[badFile]] = await sequelize.query(`SELECT COUNT(*) AS count FROM files f JOIN folders d ON d.id = f.folder_id WHERE f.folder_id IS NOT NULL AND f.user_id <> d.user_id`);
  const [[badFolder]] = await sequelize.query(`SELECT COUNT(*) AS count FROM folders c JOIN folders p ON p.id = c.parent_id WHERE c.parent_id IS NOT NULL AND c.user_id <> p.user_id`);
  if (Number(badFile.count) || Number(badFolder.count)) {
    throw new Error('Cannot add ownership foreign keys: existing cross-owner folder/file references must be corrected manually before migration. No rows were changed.');
  }
}

export async function up(context) {
  const { sequelize } = context;
  await assertOwnershipIsConsistent(sequelize);

  await sequelize.query("ALTER TABLE users ADD COLUMN quota_bytes BIGINT UNSIGNED NOT NULL DEFAULT 1073741824, ADD COLUMN used_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0, ADD COLUMN reserved_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0");
  await sequelize.query("ALTER TABLE files ADD COLUMN s3_version_id VARCHAR(1024) NULL, ADD COLUMN detected_mime_type VARCHAR(100) NULL, ADD COLUMN trashed_at DATETIME NULL, ADD COLUMN purge_requested_at DATETIME NULL");
  // Old completed rows are intentionally not treated as S3-present or Lambda-validated.
  await sequelize.query("ALTER TABLE files MODIFY COLUMN status ENUM('uploading','completed','deleted','LEGACY_UNVERIFIED','PENDING','UPLOADED','VALIDATING','READY','REJECTED','TRASHED','PURGE_PENDING','PURGED') NOT NULL DEFAULT 'PENDING'");
  await sequelize.query("UPDATE files SET status = 'LEGACY_UNVERIFIED' WHERE status IN ('completed','uploading','deleted')");
  await sequelize.query("ALTER TABLE files MODIFY COLUMN status ENUM('LEGACY_UNVERIFIED','PENDING','UPLOADED','VALIDATING','READY','REJECTED','TRASHED','PURGE_PENDING','PURGED') NOT NULL DEFAULT 'PENDING'");

  await sequelize.query('ALTER TABLE files DROP FOREIGN KEY fk_files_folder');
  await sequelize.query('ALTER TABLE folders DROP FOREIGN KEY fk_folders_parent');
  await sequelize.query('ALTER TABLE folders ADD UNIQUE KEY uk_folders_user_id_id (user_id, id)');
  // SET NULL is invalid for this composite key because user_id is NOT NULL.
  // RESTRICT also supports the Phase 4 empty-folder deletion rule.
  await sequelize.query('ALTER TABLE files ADD CONSTRAINT fk_files_owned_folder FOREIGN KEY (user_id, folder_id) REFERENCES folders(user_id, id) ON DELETE RESTRICT ON UPDATE CASCADE');
  await sequelize.query('ALTER TABLE folders ADD CONSTRAINT fk_folders_owned_parent FOREIGN KEY (user_id, parent_id) REFERENCES folders(user_id, id) ON DELETE CASCADE ON UPDATE CASCADE');
  await sequelize.query('ALTER TABLE files ADD KEY idx_files_listing (user_id, folder_id, status, updated_at, id), ADD KEY idx_files_purge (status, purge_requested_at)');
  await sequelize.query('ALTER TABLE folders ADD KEY idx_folders_listing (user_id, parent_id, updated_at, id)');

  await create('sessions', `CREATE TABLE sessions (
    id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, token_hash CHAR(64) NOT NULL, csrf_token_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL, revoked_at DATETIME NULL, last_seen_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_sessions_token_hash (token_hash), KEY idx_sessions_user_active (user_id, revoked_at, expires_at), KEY idx_sessions_expiry (expires_at),
    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)(context);
  await create('upload_sessions', `CREATE TABLE upload_sessions (
    id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, folder_id CHAR(36) NULL, file_id CHAR(36) NULL,
    idempotency_key VARCHAR(255) NOT NULL, payload_hash CHAR(64) NOT NULL, requested_size BIGINT UNSIGNED NOT NULL,
    declared_mime_type VARCHAR(100) NOT NULL, incoming_key VARCHAR(500) NOT NULL, source_version_id VARCHAR(1024) NULL,
    status ENUM('RESERVED','UPLOADING','COMPLETED','REJECTED','EXPIRED','CANCELLED') NOT NULL DEFAULT 'RESERVED',
    expires_at DATETIME NOT NULL, completed_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_upload_sessions_idempotency (user_id, idempotency_key), KEY idx_upload_sessions_expiry (status, expires_at), KEY idx_upload_sessions_user_status (user_id, status),
    CONSTRAINT fk_upload_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_upload_sessions_owned_folder FOREIGN KEY (user_id, folder_id) REFERENCES folders(user_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_upload_sessions_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)(context);
  await create('jobs', `CREATE TABLE jobs (
    id CHAR(36) NOT NULL, type VARCHAR(64) NOT NULL, status ENUM('QUEUED','RUNNING','SUCCEEDED','FAILED','DEAD') NOT NULL DEFAULT 'QUEUED',
    payload JSON NOT NULL, attempts INT UNSIGNED NOT NULL DEFAULT 0, max_attempts INT UNSIGNED NOT NULL DEFAULT 10,
    run_at DATETIME NOT NULL, locked_at DATETIME NULL, locked_until DATETIME NULL, locked_by VARCHAR(128) NULL, last_error VARCHAR(1000) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_jobs_polling (status, run_at, locked_until, id), KEY idx_jobs_lease (status, locked_until)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)(context);
  await create('audit_events', `CREATE TABLE audit_events (
    id CHAR(36) NOT NULL, actor_user_id CHAR(36) NULL, subject_user_id CHAR(36) NULL, action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(64) NULL, resource_id CHAR(36) NULL, request_id CHAR(36) NULL, metadata JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id),
    KEY idx_audit_subject_created (subject_user_id, created_at, id), KEY idx_audit_resource (resource_type, resource_id, created_at),
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_audit_subject FOREIGN KEY (subject_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)(context);
  await create('invitations', `CREATE TABLE invitations (
    id CHAR(36) NOT NULL, code_hash CHAR(64) NOT NULL, email VARCHAR(255) NULL, role ENUM('user','admin') NOT NULL DEFAULT 'user',
    expires_at DATETIME NOT NULL, used_at DATETIME NULL, used_by_user_id CHAR(36) NULL, created_by_user_id CHAR(36) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_invitations_code_hash (code_hash), KEY idx_invitations_available (used_at, expires_at),
    CONSTRAINT fk_invitations_used_by FOREIGN KEY (used_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_invitations_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)(context);
}
