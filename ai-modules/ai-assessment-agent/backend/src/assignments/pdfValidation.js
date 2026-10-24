const { AssessmentError } = require('../core/errors');

/**
 * Descriptive Assignments - validation of an uploaded submission (deterministic, no I/O).
 *
 * Nothing the client says about the file is trusted on its own:
 *   - the declared Content-Type must be application/pdf AND
 *   - the bytes must start with the PDF signature "%PDF-<d>.<d>" (magic bytes) AND
 *   - end with a PDF trailer ("%%EOF" within the last 2 KB) - truncated/corrupt uploads fail AND
 *   - the display filename must end in .pdf.
 * Size: 1 byte .. MAX_PDF_BYTES (the HTTP layer also caps the raw body). Empty files fail.
 * Active content: PDFs that declare JavaScript, launch actions or embedded files are refused
 * (best-effort byte scan; compressed object streams can hide names, so downloads are ALSO served
 * as attachments with nosniff and are never rendered by this module).
 * The original filename is reduced to a safe display string: directory parts, control characters
 * and anything outside a conservative character set are removed. It is NEVER used as a path.
 */
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MIN_PDF_BYTES = 64; // a real PDF (header + one object + xref + trailer) is larger than this
const FILENAME_MAX = 120;
const SIGNATURE = /^%PDF-[12]\.\d/;
const ACTIVE = /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA)\b/;

const reject = (code, message, statusCode = 400) => new AssessmentError(code, message, { statusCode, details: [{ field: 'file', code }] });

/** Safe display name ("../../x/Essay (final).PDF" -> "Essay (final).PDF"), or null when not a .pdf name. */
function safeDisplayName(raw) {
  if (typeof raw !== 'string') return null;
  let name = raw.split(/[\\/]/).pop() || '';
  name = name.normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim();
  name = name.replace(/^\.+/, ''); // no hidden-file / dot-dot names
  if (!/\.pdf$/i.test(name) || name.length <= 4) return null;
  if (name.length > FILENAME_MAX) name = `${name.slice(0, FILENAME_MAX - 4)}.pdf`;
  return name;
}

/**
 * @param {{ buffer: Buffer|undefined, contentType: string|undefined, filename: string|undefined }} upload
 * @returns {{ buffer: Buffer, originalFilename: string, size: number, contentType: 'application/pdf' }}
 */
function validatePdfUpload({ buffer, contentType, filename }) {
  const mime = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (mime !== 'application/pdf') throw reject('INVALID_FILE_TYPE', 'Only PDF files can be submitted.', 415);
  const originalFilename = safeDisplayName(filename);
  if (!originalFilename) throw reject('INVALID_FILE_NAME', 'Choose a file whose name ends in .pdf.');
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw reject('EMPTY_FILE', 'The file is empty.');
  if (buffer.length > MAX_PDF_BYTES) throw reject('FILE_TOO_LARGE', `The file is larger than ${MAX_PDF_BYTES / (1024 * 1024)} MB.`, 413);
  if (!SIGNATURE.test(buffer.subarray(0, 16).toString('latin1'))) throw reject('INVALID_FILE_TYPE', 'This file is not a PDF.', 415);
  if (buffer.length < MIN_PDF_BYTES || !buffer.subarray(Math.max(0, buffer.length - 2048)).toString('latin1').includes('%%EOF')) {
    throw reject('CORRUPT_FILE', 'The PDF looks incomplete or damaged. Please export it again and re-upload.');
  }
  if (ACTIVE.test(buffer.toString('latin1'))) throw reject('ACTIVE_CONTENT', 'PDFs with scripts, launch actions or embedded files are not accepted. Please export a plain PDF.');
  return { buffer, originalFilename, size: buffer.length, contentType: 'application/pdf' };
}

module.exports = { validatePdfUpload, safeDisplayName, MAX_PDF_BYTES };
