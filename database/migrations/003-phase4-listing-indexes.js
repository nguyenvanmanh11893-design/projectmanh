export const id = '003-phase4-listing-indexes';

export async function up({ sequelize }) {
  // Supports stable default file cursor ordering; search remains parameterized
  // substring matching and intentionally has no misleading prefix-only index.
  await sequelize.query('ALTER TABLE files ADD KEY idx_files_cursor_created (user_id, folder_id, status, created_at, id)');
}
