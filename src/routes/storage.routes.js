import express from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { usage } from '../controllers/storage.controller.js';

const router = express.Router();
router.use(authenticateToken);
router.get('/usage', usage);
export default router;
