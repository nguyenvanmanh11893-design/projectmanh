import express from 'express';
const router = express.Router();
import * as fileController from '../controllers/file.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { validateFileList, validateTrashList, validateIdParam, validateFileNamePayload, validateMovePayload } from '../middleware/validation.middleware.js';
import { validateOrigin, requireCsrf } from '../middleware/csrf.middleware.js';

router.use(authenticateToken);
router.use(validateOrigin);
router.use(requireCsrf);

// Phase 5B: disabled before it can bypass quota reservation, exact-version
// verification, or the future validator. Remove this route in Phase 8 after
// clients have migrated; the service remains only for legacy maintenance.
router.post('/upload', fileController.legacyUploadRemoved);

router.get('/trash', validateTrashList, fileController.listTrash);
router.get('/', validateFileList, fileController.list);
router.get('/:id/download', validateIdParam, fileController.download);
router.put('/:id', validateIdParam, validateFileNamePayload, fileController.rename);
router.put('/:id/move', validateIdParam, validateMovePayload, fileController.move);
router.post('/:id/restore', validateIdParam, fileController.restore);
router.delete('/:id/permanent', validateIdParam, fileController.permanentDelete);
router.delete('/:id', validateIdParam, fileController.remove);

export default router;
