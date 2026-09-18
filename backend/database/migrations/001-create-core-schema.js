export const id = '001-create-core-schema';

export async function up({ sequelize }) {
  const qi = sequelize.getQueryInterface();
  const tables = await qi.showAllTables();
  const has = (name) => tables.some((table) => String(table).toLowerCase() === name);

  if (!has('users')) await sequelize.query(`CREATE TABLE users (
    id CHAR(36) NOT NULL, username VARCHAR(50) NOT NULL, email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL, full_name VARCHAR(100) NULL, avatar_url VARCHAR(500) NULL,
    role ENUM('user','admin') NOT NULL DEFAULT 'user', is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uk_users_username (username), UNIQUE KEY uk_users_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  if (!has('folders')) await sequelize.query(`CREATE TABLE folders (
    id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, parent_id CHAR(36) NULL, name VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_folders_user_id (user_id), KEY idx_folders_parent_id (parent_id),
    CONSTRAINT fk_folders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_folders_parent FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  if (!has('files')) await sequelize.query(`CREATE TABLE files (
    id CHAR(36) NOT NULL, user_id CHAR(36) NOT NULL, folder_id CHAR(36) NULL,
    file_name VARCHAR(255) NOT NULL, original_name VARCHAR(255) NOT NULL, s3_key VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NULL, file_size BIGINT UNSIGNED NOT NULL DEFAULT 0, extension VARCHAR(20) NULL,
    status ENUM('uploading','completed','deleted') NOT NULL DEFAULT 'completed',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_files_user_id (user_id), KEY idx_files_folder_id (folder_id),
    CONSTRAINT fk_files_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_files_folder FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}
