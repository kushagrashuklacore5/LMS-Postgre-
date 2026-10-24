/**
 * Deterministic format checks named by `validation.format` in
 * config/studentSchema.json. The schema decides which field uses which
 * format; the exact rules are documented in the schema's conventions.formats.
 */

// local@domain.tld: no whitespace, one '@', non-empty dot-separated domain labels.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

function isValidEmail(value) {
  return EMAIL.test(value);
}

// Visual separators people type in phone numbers.
const PHONE_SEPARATORS = /[\s\-.()]/g;
// Optional '+', then 7-15 digits (E.164 allows at most 15). With '+', no leading 0.
const PHONE = /^(\+[1-9]\d{6,14}|\d{7,15})$/;

function isValidPhone(value) {
  return PHONE.test(value.replace(PHONE_SEPARATORS, ''));
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
// What the Excel import produces for a real (date-only) Excel date cell.
const EXCEL_DATE_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/;
const ANY_ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
// 03/04/2010, 3-4-10, 03.04.2010 ... day/month order cannot be known.
const NUMERIC_DMY_OR_MDY = /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/;
// The same shape with a 4-digit year, read as day/month/year when the caller knows the column is day-first.
const NUMERIC_WITH_FULL_YEAR = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

/**
 * Returns { value: 'YYYY-MM-DD' } or { code, message }.
 * dayFirst: the caller has proof that numeric dates in this column are day/month/year
 * (see StudentDataValidator.dayFirstDateFields); without it they stay AMBIGUOUS_DATE.
 */
function parseDate(value, { dayFirst = false } = {}) {
  const fromExcel = EXCEL_DATE_TIMESTAMP.exec(value);
  const datePart = fromExcel ? fromExcel[1] : value;

  const match = ISO_DATE.exec(datePart);
  if (match) {
    const [, y, m, d] = match.map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
      return { value: datePart };
    }
    return { code: 'INVALID_DATE', message: `"${value}" is not a real calendar date.` };
  }
  if (ANY_ISO_TIMESTAMP.test(value)) {
    return { code: 'INVALID_DATE', message: `"${value}" includes a time of day; a date without time is expected.` };
  }
  const dmy = dayFirst ? NUMERIC_WITH_FULL_YEAR.exec(value) : null;
  if (dmy) {
    const [, d, m, y] = dmy.map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
      return { value: date.toISOString().slice(0, 10) };
    }
    return { code: 'INVALID_DATE', message: `"${value}" is not a real calendar date.` };
  }
  if (NUMERIC_DMY_OR_MDY.test(value)) {
    return {
      code: 'AMBIGUOUS_DATE',
      message: `"${value}" could be day/month or month/day. Use YYYY-MM-DD or an Excel date cell.`,
    };
  }
  return { code: 'INVALID_DATE', message: `"${value}" is not a valid date. Use YYYY-MM-DD or an Excel date cell.` };
}

module.exports = { isValidEmail, isValidPhone, parseDate, NUMERIC_WITH_FULL_YEAR };
