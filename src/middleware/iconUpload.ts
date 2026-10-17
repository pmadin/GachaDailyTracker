import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ICON_MAX_INPUT_BYTES } from '../services/iconService';

// Memory storage only: the file goes straight to processIcon() and then the DB, never to disk.
// The type is checked from the bytes in processIcon(), not from the client's Content-Type.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ICON_MAX_INPUT_BYTES, files: 1, fields: 20 },
});

/** Optional single `icon` file field. Turns multer's errors into 400s instead of 500s. */
export function iconUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single('icon')(req, res, err => {
    if (!err) return next();
    const message = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
      ? 'Icon must be 2 MB or smaller'
      : err instanceof multer.MulterError
        ? `Upload rejected: ${err.message}`
        : 'Upload failed';
    res.status(400).json({ error: message });
  });
}
