import express from 'express';
const router = express.Router();
import * as authController from '../controllers/auth.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { validateOrigin, requireCsrf } from '../middleware/csrf.middleware.js';
import { loginRateLimit } from '../middleware/login-rate-limit.middleware.js';

router.post('/register', validateOrigin, authController.register);
router.post('/login', validateOrigin, loginRateLimit, authController.login);
router.get('/me', authenticateToken, authController.me);
router.get('/csrf', authenticateToken, authController.csrf);
router.post('/logout', authenticateToken, validateOrigin, requireCsrf, authController.logout);

export default router;
