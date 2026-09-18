import { log } from './utils/logger.js';
import './config/load-env.js';
import app from './app.js';
import { testConnection, sequelize } from './config/database.js';
import { validateConfig } from './config/validate-config.js';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  validateConfig();
  // Test Database Connection
  const isDbConnected = await testConnection();

  if (!isDbConnected) {
    log('startup_database_unavailable', {}, 'error');
    await sequelize.close().catch(() => {});
    process.exitCode = 1;
    return;
  }

  const server = app.listen(PORT, '127.0.0.1', () => {
    log('server_started');
  });

  const stop = () => {
    app.locals.stopping = true;
    const deadline = setTimeout(() => process.exit(1), 25000);
    deadline.unref();
    server.close(async () => { await sequelize.close(); process.exit(0); });
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  process.on('unhandledRejection', (err) => {
    log('unhandled_rejection', { error: err }, 'error');
    server.close(() => process.exit(1));
  });
};

startServer().catch(() => { log('startup_failed', {}, 'error'); process.exitCode = 1; });
