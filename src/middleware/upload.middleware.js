const multer = require('multer');

const storage = multer.memoryStorage();
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

module.exports = upload;
