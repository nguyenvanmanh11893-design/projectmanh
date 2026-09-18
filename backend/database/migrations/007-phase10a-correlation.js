export const id = '007-phase10a-correlation';
export async function up({ sequelize }) {
  const columns = await sequelize.getQueryInterface().describeTable('jobs');
  if (!columns.request_id) await sequelize.query('ALTER TABLE jobs ADD COLUMN request_id CHAR(36) NULL');
}
