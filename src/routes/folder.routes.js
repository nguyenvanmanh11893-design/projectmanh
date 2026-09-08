const express = require('express');
const router = express.Router();
const folderController = require('../controllers/folder.controller');
const { authenticateToken } = require('../middleware/auth.middleware');
router.use(authenticateToken);

router.post('/', folderController.create);
router.get('/', folderController.getRootList);
router.get('/:id', folderController.getById);
router.put('/:id', folderController.rename);
router.delete('/:id', folderController.remove);

module.exports = router;
