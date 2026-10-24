/**
 * Data minimization before anything reaches an LLM.
 *
 * Masking is the DEFAULT: a cell value is sent as written only if it matches
 * a short allowlist of shapes that are useful for recognising a column and
 * are not personal data on their own (class numbers, section letters, blood
 * groups, gender words, dates, true/false, small numbers). Everything else is
 * replaced by a type token such as <NAME>, <EMAIL>, <PHONE>, <ADDRESS>,
 * <CODE>, <NUMBER> or <TEXT>. Tokens are rough hints only; they are chosen by
 * shape and can be wrong (a remark written in Title Case looks like <NAME>).
 *
 * This is a minimization boundary, not a privacy guarantee: dates and short
 * values are sent as written, and a column's header is always sent.
 *
 * Deterministic: same rows + same limit = same samples.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_SEPARATORS = /[\s\-.()]/g;
const PHONE = /^\+?\d{7,15}$/;
const ISO_DATE_OR_EXCEL_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/;
const NUMERIC_DATE_TEXT = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;
const BLOOD_GROUP = /^(A|B|AB|O)\s?[+-]$/i;
const SHORT_DIGITS = /^\d{1,3}$/;
const SINGLE_LETTER = /^[A-Za-z]$/;
const CLASS_SECTION = /^\d{1,2}\s?[-/ ]?\s?[A-Za-z]$/; // 10-A, 10A, 9 B
const ROMAN_CLASS = /^(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)$/; // upper case only
const SAFE_WORDS = new Set(['male', 'female', 'other', 'm', 'f', 'boy', 'girl', 'yes', 'no', 'y', 'n', 'true', 'false', 'na', 'n/a']);
const DIGITS_ONLY = /^\d+$/;
const HAS_DIGIT = /\d/;
const HAS_LETTER = /[A-Za-z]/;
const WORD = /^[A-Za-z][A-Za-z.'-]*$/;
const ADDRESS_WORDS = /\b(road|rd|street|st|lane|ln|nagar|sector|colony|flat|house|apartment|apt|block|floor|city|village|district|pin|pincode|near|opp|marg|chowk|society)\b/i;

/** Returns the value to show the LLM for one cell, or undefined for a blank cell. */
function maskSampleValue(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return maskNumber(value);
  if (typeof value !== 'string') return '<VALUE>';

  const text = value.trim();
  if (text === '') return undefined;

  if (ISO_DATE_OR_EXCEL_DATE.test(text) || NUMERIC_DATE_TEXT.test(text)) return text;
  if (EMAIL.test(text)) return '<EMAIL>';
  const compact = text.replace(PHONE_SEPARATORS, '');
  if (PHONE.test(compact)) return '<PHONE>';
  if (BLOOD_GROUP.test(text) || SHORT_DIGITS.test(text) || SINGLE_LETTER.test(text) || CLASS_SECTION.test(text) || ROMAN_CLASS.test(text)) {
    return text;
  }
  if (SAFE_WORDS.has(text.toLowerCase())) return text;
  if (DIGITS_ONLY.test(text)) return '<NUMBER>';

  const words = text.split(/\s+/);
  if (HAS_DIGIT.test(text) && HAS_LETTER.test(text) && (text.includes(',') || words.length >= 3)) return '<ADDRESS>';
  if (ADDRESS_WORDS.test(text) && words.length >= 2) return '<ADDRESS>';
  if (words.length === 1 && HAS_DIGIT.test(text)) return '<CODE>'; // ADM2024001, S-1024
  if (words.length >= 2 && words.length <= 4 && words.every((w) => WORD.test(w) && /^[A-Z]/.test(w))) return '<NAME>';
  return '<TEXT>';
}

function maskNumber(n) {
  if (!Number.isFinite(n)) return '<VALUE>';
  if (!Number.isInteger(n)) return '<DECIMAL>';
  const digits = String(Math.abs(n)).length;
  if (digits <= 3) return n;
  if (digits >= 7 && digits <= 15) return '<PHONE>';
  return '<NUMBER>';
}

/**
 * Headers that look like credentials or secrets. For these columns NO sample value is sent at all
 * (not even masked or short ones such as a 3-digit PIN); the LLM sees only the header, and the
 * guard refuses system fields such as "password" anyway.
 */
const SENSITIVE_HEADER = /pass(word|wd|code)?|pwd|\bpin\b|otp|token|secret|jwt|api[\s_-]*key|smtp|credential|login|auth|cvv|aadhaar|aadhar|\bssn\b|\bpan\b|bank|account[\s_-]*(no|number)|card/i;

function isSensitiveHeader(header) {
  return typeof header === 'string' && SENSITIVE_HEADER.test(header);
}

/**
 * Up to `limit` distinct masked samples per header, taken in row order.
 * Returns [{ sourceColumn, samples }] in header order. Sensitive-looking headers get no samples.
 */
function buildMaskedSamples(headers, rows, limit) {
  return headers.map((header) => {
    if (isSensitiveHeader(header)) return { sourceColumn: header, samples: [] };
    const samples = [];
    const seen = new Set();
    for (const row of rows) {
      if (samples.length >= limit) break;
      const values = row && row.values;
      if (!values || !Object.prototype.hasOwnProperty.call(values, header)) continue;
      const masked = maskSampleValue(values[header]);
      if (masked === undefined) continue;
      const key = JSON.stringify(masked);
      if (seen.has(key)) continue;
      seen.add(key);
      samples.push(masked);
    }
    return { sourceColumn: header, samples };
  });
}

module.exports = { maskSampleValue, buildMaskedSamples, isSensitiveHeader };
