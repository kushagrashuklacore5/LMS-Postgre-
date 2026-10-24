const { AssessmentError } = require('../core/errors');
const { validatePdfUpload } = require('./pdfValidation');

/**
 * Descriptive Assignments (Prompt 2) - server-side text extraction from a STORED submission PDF.
 * Library: pdf-parse 2.4.5 (PDFParse#getText, built on Mozilla pdf.js; module-local dependency).
 *
 *   bytes -> re-validate (the stored file must still be a plain, complete PDF)
 *         -> extract text (timeout, page cap) -> strip page markers -> normalize whitespace
 *         -> enforce limits: readable text required; NO silent truncation (too large = refused)
 *
 * Nothing here logs or returns the bytes; errors carry fixed, safe messages only.
 */
const LIMITS = Object.freeze({ maxPages: 40, maxChars: 24000, minLetters: 20, timeoutMs: 20000 });

const unreadable = () => new AssessmentError('PDF_TEXT_UNREADABLE', 'Unable to extract readable text from this PDF.', { statusCode: 422 });

/** Collapses runs of spaces/tabs, trims lines, keeps paragraph breaks (max one blank line). */
function normalizeText(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/^\s*-- \d+ of \d+ --\s*$/gm, '') // pdf-parse page separators
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/[ \t ]+/g, ' ')
    .split('\n').map((l) => l.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdfText(buffer, { limits = LIMITS, parserFactory } = {}) {
  // The stored file must still pass the same checks as at upload time (signature, trailer, size, no active content).
  try {
    validatePdfUpload({ buffer, contentType: 'application/pdf', filename: 'stored.pdf' });
  } catch {
    throw new AssessmentError('PDF_INVALID', 'The stored file is not a valid PDF, so it cannot be evaluated.', { statusCode: 422 });
  }
  const makeParser = parserFactory || ((data) => new (require('pdf-parse').PDFParse)({ data }));
  const parser = makeParser(new Uint8Array(buffer));
  let result;
  let timer;
  try {
    result = await Promise.race([
      parser.getText(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), limits.timeoutMs); }),
    ]);
  } catch {
    throw unreadable();
  } finally {
    clearTimeout(timer);
    try { await parser.destroy(); } catch { /* already released */ }
  }
  if (typeof result.total === 'number' && result.total > limits.maxPages) {
    throw new AssessmentError('DOCUMENT_TOO_LARGE', `This document is too large to evaluate automatically (more than ${limits.maxPages} pages). Please mark it manually.`, { statusCode: 422 });
  }
  const text = normalizeText(result.text || '');
  if ((text.match(/\p{L}/gu) || []).length < limits.minLetters) throw unreadable();
  if (text.length > limits.maxChars) {
    throw new AssessmentError('DOCUMENT_TOO_LARGE', 'This document is too large to evaluate automatically. Please mark it manually.', { statusCode: 422 });
  }
  return { text, pages: result.total ?? null };
}

module.exports = { extractPdfText, normalizeText, LIMITS };
