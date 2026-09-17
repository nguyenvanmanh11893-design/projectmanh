// The migration command is invoked directly (unlike src/server.js), so it
// must load the selected local environment before importing Sequelize.
import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sequelize } from '../src/config/database.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(scriptDirectory, '../database/migrations');

async function loadMigrations() {
  const files = (await readdir(migrationsDirectory)).filter((file) => /^\d+-.*\.js$/.test(file)).sort();
  const migrations = await Promise.all(files.map(async (file) => {
    const module = await import(pathToFileURL(path.join(migrationsDirectory, file)).href);
    if (!module.id || typeof module.up !== 'function') throw new Error(`Invalid migration: ${file}`);
    return { id: module.id, up: module.up };
  }));
  return migrations;
}

async function ensureMigrationTable() {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(255) NOT NULL, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function appliedIds() {
  const [rows] = await sequelize.query('SELECT id FROM schema_migrations ORDER BY id');
  return new Set(rows.map((row) => row.id));
}

async function main() {
  const command = process.argv[2] || 'up';
  if (!['up', 'status'].includes(command)) throw new Error('Usage: node scripts/migrate.js [up|status]');
  await sequelize.authenticate();
  await ensureMigrationTable();
  const migrations = await loadMigrations();
  const applied = await appliedIds();
  if (command === 'status') {
    for (const migration of migrations) console.log(`${applied.has(migration.id) ? 'applied' : 'pending'}  ${migration.id}`);
    return;
  }
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    console.log(`Applying ${migration.id}`);
    await migration.up({ sequelize });
    await sequelize.query('INSERT INTO schema_migrations (id) VALUES (?)', { replacements: [migration.id] });
    console.log(`Applied ${migration.id}`);
  }
}

main().catch((error) => {
  console.error(`Migration failed: ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  await sequelize.close();
});
