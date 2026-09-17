import express from 'express';
const router = express.Router();
import * as folderController from '../controllers/folder.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
router.use(authenticateToken);

router.post('/', folderController.create);
router.get('/', folderController.getRootList);
router.get('/:id', folderController.getById);
router.put('/:id', folderController.rename);
router.delete('/:id', folderController.remove);

export default router;
