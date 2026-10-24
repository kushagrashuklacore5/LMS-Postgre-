const express = require('express');
const multer = require('multer');
const { ValidationError } = require('../errors');

const PREVIEW_ROW_LIMIT = 20;
const UPLOAD_HINT = 'Send multipart/form-data with one .xlsx file in a field named "file".';

/**
 * HTTP adapter for the Excel import layer. Uploads are held in memory only
 * (bounded by maxFileBytes) and never written to disk.
 */
function createImportRoutes({ importService, maxFileBytes }) {
  const router = express.Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileBytes, files: 1, fields: 5, parts: 6, fieldSize: 1024 },
    defParamCharset: 'utf8',
    fileFilter(req, file, cb) {
      // First gate only; the file content is verified in the import service.
      if (!/\.xlsx$/i.test(file.originalname || '')) {
        return cb(
          new ValidationError('Only .xlsx files are supported.', ['Save the file as an Excel Workbook (.xlsx).'], {
            code: 'UNSUPPORTED_FILE_TYPE',
          })
        );
      }
      return cb(null, true);
    },
  }).single('file');

  function receiveUpload(req, res, next) {
    upload(req, res, (err) => {
      if (!err || err instanceof ValidationError) return next(err);
      return next(toUploadError(err, maxFileBytes));
    });
  }

  // POST /import/parse — parse an uploaded workbook and return a bounded preview.
  router.post('/parse', receiveUpload, async (req, res) => {
    if (!req.file) {
      throw new ValidationError('No file was uploaded.', [UPLOAD_HINT], { code: 'MISSING_FILE' });
    }
    const result = await importService.parse(req.file.buffer, { fileName: req.file.originalname });
    res.json(toPreviewResponse(result));
  });

  return router;
}

function toUploadError(err, maxFileBytes) {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    const limit =
      maxFileBytes >= 1024 * 1024
        ? `${Math.round((maxFileBytes / (1024 * 1024)) * 100) / 100} MB`
        : `${Math.ceil(maxFileBytes / 1024)} KB`;
    return new ValidationError(`The file is larger than the ${limit} limit.`, [], {
      code: 'FILE_TOO_LARGE',
      statusCode: 413,
    });
  }
  if (err instanceof multer.MulterError && ['LIMIT_UNEXPECTED_FILE', 'LIMIT_FILE_COUNT'].includes(err.code)) {
    return new ValidationError('Upload exactly one file in the field "file".', [UPLOAD_HINT], {
      code: 'UNEXPECTED_FILE_FIELD',
    });
  }
  // Other multer limits and malformed multipart bodies (raised by busboy).
  return new ValidationError('The upload could not be read.', [UPLOAD_HINT], { code: 'INVALID_UPLOAD' });
}

function toPreviewResponse(result) {
  const previewRows = result.rows.slice(0, PREVIEW_ROW_LIMIT);
  return {
    success: true,
    file: {
      name: result.fileName,
      sheetName: result.sheetName,
      sheetNames: result.sheetNames,
      headerRowNumber: result.headerRowNumber,
    },
    summary: {
      rowCount: result.rowCount,
      columnCount: result.columnCount,
      skippedBlankRows: result.skippedBlankRows,
      previewRowCount: previewRows.length,
    },
    headers: result.headers,
    previewRows,
    warnings: result.warnings,
  };
}

module.exports = { createImportRoutes, PREVIEW_ROW_LIMIT };
