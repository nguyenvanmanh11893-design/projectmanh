import 'dotenv/config';
import app from './app.js';
import { testConnection, sequelize } from './config/database.js';
import { validateConfig } from './config/validate-config.js';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  validateConfig();
  // Test Database Connection
  const isDbConnected = await testConnection();

  if (!isDbConnected) {
    console.error('Server not started because MySQL is unavailable.');
    await sequelize.close().catch(() => {});
    process.exitCode = 1;
    return;
  }

  const server = app.listen(PORT, () => {
    console.log(`=================================`);
    console.log(`🚀 Server running on port: ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`=================================`);
  });

  process.on('unhandledRejection', (err) => {
    console.error('[UNHANDLED REJECTION]:', err);
    server.close(() => process.exit(1));
  });
};

startServer();
