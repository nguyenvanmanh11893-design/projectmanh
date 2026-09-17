import express from 'express';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { validateOrigin, requireCsrf } from '../middleware/csrf.middleware.js';
import { validateIdParam, validateUploadCompletePayload, validateUploadSessionPayload } from '../middleware/validation.middleware.js';
import * as uploadController from '../controllers/upload.controller.js';

const router = express.Router();
router.use(authenticateToken);
router.use(validateOrigin);
router.use(requireCsrf);
router.post('/', validateUploadSessionPayload, uploadController.create);
router.post('/:id/complete', validateIdParam, validateUploadCompletePayload, uploadController.complete);
router.get('/:id', validateIdParam, uploadController.getById);
export default router;
