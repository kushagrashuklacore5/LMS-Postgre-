const { ValidationError } = require('../errors');

/**
 * Cheap structural checks on an .xlsx (a ZIP archive) BEFORE ExcelJS loads it.
 *
 * ExcelJS decompresses every entry into memory, so a small upload could
 * expand to gigabytes (a "zip bomb"). Reading the ZIP central directory lets
 * us reject that, and files that are not really XLSX, without decompressing
 * anything. Declared sizes can lie; this is a first line of defence, bounded
 * further by the upload size limit and the row limit.
 */

const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_ENTRIES = 10000;

const LOCAL_FILE_SIG = 0x04034b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;
const EOCD_MIN_SIZE = 22;
const MAX_ZIP_COMMENT = 0xffff;

function invalidWorkbook(detail) {
  return new ValidationError('The file could not be opened as an Excel workbook.', [detail], {
    code: 'INVALID_WORKBOOK',
  });
}

function findEndOfCentralDirectory(buffer) {
  const lowest = Math.max(0, buffer.length - EOCD_MIN_SIZE - MAX_ZIP_COMMENT);
  for (let offset = buffer.length - EOCD_MIN_SIZE; offset >= lowest; offset--) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIR_SIG) {
      return offset;
    }
  }
  return -1;
}

/** Returns the list of entry names. Throws ValidationError on any problem. */
function inspectXlsxContainer(buffer) {
  if (buffer.length < EOCD_MIN_SIZE || buffer.readUInt32LE(0) !== LOCAL_FILE_SIG) {
    throw new ValidationError('The file is not an XLSX workbook.', ['File content is not a ZIP-based .xlsx file.'], {
      code: 'UNSUPPORTED_FILE_TYPE',
    });
  }

  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) {
    throw invalidWorkbook('ZIP directory not found; the file is truncated or corrupted.');
  }

  const entryCount = buffer.readUInt16LE(eocd + 10);
  const dirOffset = buffer.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || dirOffset === 0xffffffff) {
    throw invalidWorkbook('ZIP64 archives are not supported.');
  }
  if (entryCount > MAX_ENTRIES) {
    throw invalidWorkbook(`Workbook contains too many internal parts (${entryCount}).`);
  }

  const names = [];
  let totalUncompressed = 0;
  let offset = dirOffset;
  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_DIR_SIG) {
      throw invalidWorkbook('ZIP directory is corrupted.');
    }
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    if (offset + 46 + nameLength > buffer.length) {
      throw invalidWorkbook('ZIP directory is corrupted.');
    }
    names.push(buffer.toString('utf8', offset + 46, offset + 46 + nameLength).replace(/^\//, ''));

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new ValidationError(
        'The workbook expands to too much data to process safely.',
        [`Uncompressed content exceeds ${MAX_UNCOMPRESSED_BYTES / (1024 * 1024)} MB.`],
        { code: 'WORKBOOK_TOO_LARGE', statusCode: 413 }
      );
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }

  if (!names.includes('[Content_Types].xml') || !names.includes('xl/workbook.xml')) {
    throw new ValidationError(
      'The file is not an XLSX workbook.',
      ['ZIP file does not contain an Excel workbook (it may be another Office format).'],
      { code: 'UNSUPPORTED_FILE_TYPE' }
    );
  }
  if (names.includes('xl/vbaProject.bin')) {
    throw new ValidationError(
      'Macro-enabled workbooks are not supported.',
      ['The file contains VBA macros. Save it as a regular .xlsx workbook without macros.'],
      { code: 'UNSUPPORTED_FILE_TYPE' }
    );
  }

  return names;
}

module.exports = { inspectXlsxContainer, MAX_UNCOMPRESSED_BYTES };
