import express from 'express';
const router = express.Router();
import * as authController from '../controllers/auth.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', authenticateToken, authController.me);

export default router;
