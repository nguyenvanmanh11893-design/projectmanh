const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

const { successResponse } = require('./utils/response');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

// Import Routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const folderRoutes = require('./routes/folder.routes');
const fileRoutes = require('./routes/file.routes');

const app = express();

// Security Middlewares
app.use(helmet({
  contentSecurityPolicy: false 
}));
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use(express.static(path.join(__dirname, '../public')));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/', (req, res) => {
  return successResponse(res, 'Welcome to Cloud File Manager API', {
    version: '1.0.0',
    documentation: '/api-docs',
    healthCheck: '/api/health'
  });
});


app.get('/api/health', (req, res) => {
  return successResponse(res, 'Cloud File Manager API is running');
});
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/files', fileRoutes);

app.use(notFoundHandler); 

app.use(errorHandler);

module.exports = app;
