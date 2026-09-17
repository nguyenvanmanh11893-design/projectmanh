import express from 'express';
const router = express.Router();
import * as fileController from '../controllers/file.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import upload from '../middleware/upload.middleware.js';
import { validateFileList, validateIdParam, validateFileNamePayload, validateMovePayload, validateUploadPayload } from '../middleware/validation.middleware.js';

router.use(authenticateToken);

router.post('/upload', upload.single('file'), validateUploadPayload, fileController.upload);

router.get('/', validateFileList, fileController.list);
router.get('/:id/download', validateIdParam, fileController.download);
router.put('/:id', validateIdParam, validateFileNamePayload, fileController.rename);
router.put('/:id/move', validateIdParam, validateMovePayload, fileController.move);
router.delete('/:id', validateIdParam, fileController.remove);

export default router;
