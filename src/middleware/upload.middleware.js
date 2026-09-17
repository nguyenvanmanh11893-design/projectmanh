import multer from 'multer';

const storage = multer.memoryStorage();
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'text/plain']);

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE
  },
  fileFilter: (req, file, callback) => {
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      const error = new Error('Only PDF, JPEG, PNG, and TXT files are accepted');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      return callback(error);
    }
    callback(null, true);
  }
});

export default upload;
