require('dotenv').config();
const app = require('./app');
const { testConnection, sequelize } = require('./config/database');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  // Test Database Connection
  const isDbConnected = await testConnection();

  if (isDbConnected) {
    try {
      // Sync models without dropping existing data
      await sequelize.sync({ alter: false });
      console.log(' Database models synchronized successfully.');
    } catch (syncErr) {
      console.warn(' Database sync warning:', syncErr.message);
    }
  } else {
    console.warn('Server running without active MySQL connection. Ensure XAMPP MySQL is started.');
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
