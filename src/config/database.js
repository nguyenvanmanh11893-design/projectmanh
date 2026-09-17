import { Sequelize } from 'sequelize';

const sequelize = new Sequelize(
  process.env.DB_NAME || 'cloud_file_manager',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? (msg) => console.log(`[DB LOG]: ${msg}`) : false,
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
    console.log('✅ Database connection established successfully.');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error.message);
    return false;
  }
};

export {
  sequelize,
  testConnection
};
