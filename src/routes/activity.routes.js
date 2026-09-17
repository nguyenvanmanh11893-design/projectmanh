import express from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { list } from '../controllers/activity.controller.js';

const router = express.Router();
router.use(authenticateToken);
router.get('/', list);
export default router;
