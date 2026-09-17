import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger.js';

import { successResponse } from './utils/response.js';
import { notFoundHandler, errorHandler } from './middleware/error.middleware.js';

// Import Routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import folderRoutes from './routes/folder.routes.js';
import fileRoutes from './routes/file.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export default app;
