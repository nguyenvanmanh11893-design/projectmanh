import express from 'express';
const router = express.Router();
import * as fileController from '../controllers/file.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import upload from '../middleware/upload.middleware.js';

router.use(authenticateToken);

router.post('/upload', upload.single('file'), fileController.upload);

router.get('/', fileController.list);
router.get('/:id/download', fileController.download);
router.put('/:id', fileController.rename);
router.put('/:id/move', fileController.move);
router.delete('/:id', fileController.remove);

export default router;
