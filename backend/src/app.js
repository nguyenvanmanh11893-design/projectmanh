import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger.js';

import { successResponse } from './utils/response.js';
import { notFoundHandler, errorHandler } from './middleware/error.middleware.js';
import { requestId } from './middleware/request-id.middleware.js';

// Import Routes
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import folderRoutes from './routes/folder.routes.js';
import fileRoutes from './routes/file.routes.js';
import activityRoutes from './routes/activity.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import storageRoutes from './routes/storage.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { sequelize } from './config/database.js';
import { createReadiness } from './services/health.service.js';
const app = express();
app.locals.stopping = false;
const ready = createReadiness(() => sequelize.authenticate(), { isStopping: () => app.locals.stopping });
app.use(requestId);

app.get('/health/live', (req, res) => res.json({ status: 'live' }));
app.get('/health/ready', async (req, res) => {
  const healthy = await ready();
  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ready' : 'unavailable' });
});

// Security Middlewares
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      // Direct upload POSTs are issued only to API-provided S3 endpoints.
      connectSrc: ["'self'", 'https://*.amazonaws.com']
    }
  }
}));
app.use(cors({ origin: process.env.APP_ORIGIN || true, credentials: true }));
app.set('trust proxy', process.env.TRUST_PROXY === 'true');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
}

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/', (req, res, next) => {
  const indexPath = path.join(frontendDistPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
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
app.use('/api/activity', activityRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/storage', storageRoutes);

// SPA client-side routing fallback for non-API requests
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/api-docs')) {
    return next();
  }
  const indexPath = path.join(frontendDistPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return next();
});

app.use(notFoundHandler); 

app.use(errorHandler);

export default app;
