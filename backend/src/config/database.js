import { log } from '../utils/logger.js';
import { Sequelize } from 'sequelize';
import { readFileSync } from 'node:fs';

const sequelize = new Sequelize(
  process.env.DB_NAME || 'cloud_file_manager',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    dialect: 'mysql',
    dialectOptions: process.env.DB_SSL_CA
      ? { ssl: { ca: readFileSync(process.env.DB_SSL_CA, 'utf8'), rejectUnauthorized: true, verifyIdentity: true } }
      : {},
    logging: false,
    define: {
      timestamps: true,
      underscored: true, // Use snake_case column names in DB (created_at, updated_at)
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

/**
 * Test database connection
 */
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    log('database_connected');
    return true;
  } catch (error) {
    log('database_unavailable', {}, 'error');
    return false;
  }
};

export {
  sequelize,
  testConnection
};
