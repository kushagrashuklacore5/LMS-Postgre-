/**
 * One CSV cell. A text value starting with = + - @ (or a tab / carriage return) would run as a formula
 * when the file is opened in Excel or Sheets (CSV / formula injection), so it is prefixed with ' and
 * shown as text. Real numbers such as -250 or 12.5 are left as they are. Commas, quotes and line breaks
 * are quoted as CSV requires.
 */
const csvCell = (value) => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  const isNumber = typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(text);
  if (!isNumber && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

module.exports = { csvCell };
