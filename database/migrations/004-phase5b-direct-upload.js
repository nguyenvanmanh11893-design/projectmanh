export const id = '004-phase5b-direct-upload';

export async function up({ sequelize }) {
  await sequelize.query("ALTER TABLE upload_sessions MODIFY COLUMN status ENUM('RESERVED','UPLOADING','UPLOADED','COMPLETED','REJECTED','EXPIRED','CANCELLED') NOT NULL DEFAULT 'RESERVED'");
}
