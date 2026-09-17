import express from 'express';
const router = express.Router();
import * as folderController from '../controllers/folder.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { validateIdParam, validateFolderPayload } from '../middleware/validation.middleware.js';
router.use(authenticateToken);

router.post('/', validateFolderPayload, folderController.create);
router.get('/', folderController.getRootList);
router.get('/:id', validateIdParam, folderController.getById);
router.put('/:id', validateIdParam, validateFolderPayload, folderController.rename);
router.delete('/:id', validateIdParam, folderController.remove);

export default router;
