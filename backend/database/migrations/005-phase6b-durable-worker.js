export const id = '005-phase6b-durable-worker';

// This is deliberately additive.  run_at remains populated for older
// operational tooling, while next_attempt_at is the authoritative schedule.
export async function up({ sequelize }) {
  const qi = sequelize.getQueryInterface();
  const columns = await qi.describeTable('jobs');
  const definitions = { next_attempt_at: 'DATETIME NULL', dedupe_key: 'VARCHAR(128) NULL', lease_token: 'CHAR(36) NULL', lease_generation: 'INT UNSIGNED NOT NULL DEFAULT 0', copy_version_id: 'VARCHAR(1024) NULL' };
  for (const [name, definition] of Object.entries(definitions)) {
    if (!columns[name]) await sequelize.query(`ALTER TABLE jobs ADD COLUMN ${name} ${definition}`);
  }
  await sequelize.query('UPDATE jobs SET next_attempt_at = run_at WHERE next_attempt_at IS NULL');
  await sequelize.query('ALTER TABLE jobs MODIFY COLUMN next_attempt_at DATETIME NOT NULL');
  const indexes = await qi.showIndex('jobs');
  if (!indexes.some((index) => index.name === 'uk_jobs_dedupe_key')) await sequelize.query('ALTER TABLE jobs ADD UNIQUE KEY uk_jobs_dedupe_key (dedupe_key)');
  if (!indexes.some((index) => index.name === 'idx_jobs_due')) await sequelize.query('ALTER TABLE jobs ADD KEY idx_jobs_due (status, next_attempt_at, locked_until, id)');
  // API/worker must be stopped for upgrade. Sessions bound by Phase 5B have
  // no job yet; include expired ones so the worker can release their quota.
  await sequelize.query(`INSERT INTO jobs (id, type, status, payload, dedupe_key, run_at, next_attempt_at)
    SELECT UUID(), 'FINALIZE_UPLOAD', 'QUEUED', JSON_OBJECT('upload_session_id', s.id, 'file_id', UUID()), CONCAT('finalize:', s.id), NOW(), NOW()
    FROM upload_sessions s WHERE s.status = 'UPLOADED' AND s.source_version_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.dedupe_key = CONCAT('finalize:', s.id))`);
}
