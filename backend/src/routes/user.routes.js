import express from 'express';
const router = express.Router();
import * as userController from '../controllers/user.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { validateOrigin, requireCsrf } from '../middleware/csrf.middleware.js';
router.use(authenticateToken);
router.use(validateOrigin);
router.use(requireCsrf);

router.get('/me', userController.getProfile);
router.put('/me', userController.updateProfile);
router.put('/me/password', userController.changePassword);

export default router;
