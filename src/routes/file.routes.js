const express = require('express');
const router = express.Router();
const fileController = require('../controllers/file.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

router.use(authenticateToken);

router.post('/upload', upload.single('file'), fileController.upload);

router.get('/', fileController.list);
router.get('/:id/download', fileController.download);
router.put('/:id', fileController.rename);
router.put('/:id/move', fileController.move);
router.delete('/:id', fileController.remove);

module.exports = router;
