const ExcelJS = require('exceljs');
const { ValidationError } = require('../errors');
const { inspectXlsxContainer } = require('./xlsxContainer');

const MAX_DETAILS = 20; // cap per-cell problem lists in errors
const MAX_ADDRESSES = 5; // cap example cell addresses in warnings
const MAX_FILE_NAME_LENGTH = 255;

/**
 * Deterministic XLSX → tabular structure. No semantic interpretation:
 * headers are kept exactly as written (trimmed), values are kept as data.
 *
 * Result:
 *   fileName, sheetName, sheetNames, headerRowNumber,
 *   headers: string[],
 *   rows: [{ rowNumber, values: { [header]: value } }],   rowNumber = Excel row
 *   rowCount, columnCount, skippedBlankRows,
 *   warnings: [{ code, message }]
 *
 * Values are string | number | boolean | null; dates become ISO-8601 strings.
 * Formulas are never evaluated: the result Excel last saved is used.
 */
class ExcelImportService {
  constructor({ maxRows }) {
    if (!Number.isInteger(maxRows) || maxRows <= 0) {
      throw new TypeError('ExcelImportService requires a positive integer maxRows.');
    }
    this.maxRows = maxRows;
  }

  async parse(buffer, { fileName = 'upload.xlsx' } = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new ValidationError('The uploaded file is empty.', [], { code: 'EMPTY_FILE' });
    }

    inspectXlsxContainer(buffer);

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer);
    } catch {
      throw new ValidationError(
        'The file could not be opened as an Excel workbook.',
        ['The workbook is corrupted or uses an unsupported structure.'],
        { code: 'INVALID_WORKBOOK' }
      );
    }

    const notes = { formulas: [], formulasWithoutResult: 0, errors: [], merged: [], outside: [] };
    const warnings = [];
    const { sheet, sheetRows } = pickWorksheet(workbook, warnings);

    const headerIndex = sheetRows.findIndex(([, row]) => rowHasContent(row));
    const [headerRowNumber, headerRow] = sheetRows[headerIndex];
    const { headers, firstCol, lastCol } = readHeaders(sheet, headerRow, headerRowNumber, notes);

    const rows = [];
    let lastDataRowNumber = headerRowNumber;
    for (const [rowNumber, row] of sheetRows.slice(headerIndex + 1)) {
      const cells = new Array(headers.length).fill(null);
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const value = readCell(cell, notes);
        if (col >= firstCol && col <= lastCol) {
          cells[col - firstCol] = value;
        } else if (!isBlank(value)) {
          notes.outside.push(cell.address);
        }
      });
      if (cells.every(isBlank)) {
        continue;
      }
      if (rows.length >= this.maxRows) {
        throw new ValidationError(
          `The worksheet has more than ${this.maxRows} data rows.`,
          [`Split the file into batches of at most ${this.maxRows} rows.`],
          { code: 'TOO_MANY_ROWS' }
        );
      }
      rows.push({ rowNumber, values: Object.fromEntries(headers.map((h, i) => [h, cells[i]])) });
      lastDataRowNumber = rowNumber;
    }

    // Blank rows are counted only between the header and the last data row;
    // trailing empty or merely formatted rows are not reported.
    const skippedBlankRows = lastDataRowNumber - headerRowNumber - rows.length;

    if (rows.length === 0) {
      warnings.push({ code: 'NO_DATA_ROWS', message: 'The worksheet has a header row but no data rows.' });
    }
    warnings.push(...cellWarnings(notes));

    return {
      fileName: sanitizeFileName(fileName),
      sheetName: sheet.name,
      sheetNames: workbook.worksheets.map((ws) => ws.name),
      headerRowNumber,
      headers,
      rows,
      rowCount: rows.length,
      columnCount: headers.length,
      skippedBlankRows,
      warnings,
    };
  }
}

/** First visible worksheet with any content. Records skipped/ignored sheets as warnings. */
function pickWorksheet(workbook, warnings) {
  const worksheets = workbook.worksheets;
  const skipped = [];
  for (let i = 0; i < worksheets.length; i++) {
    const sheet = worksheets[i];
    if (sheet.state === 'hidden' || sheet.state === 'veryHidden') {
      skipped.push(`"${sheet.name}" (hidden)`);
      continue;
    }
    const sheetRows = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => sheetRows.push([rowNumber, row]));
    if (!sheetRows.some(([, row]) => rowHasContent(row))) {
      skipped.push(`"${sheet.name}" (empty)`);
      continue;
    }

    if (skipped.length > 0) {
      warnings.push({
        code: 'SKIPPED_WORKSHEETS',
        message: `Skipped worksheet(s) before "${sheet.name}": ${skipped.join(', ')}.`,
      });
    }
    const ignored = worksheets.slice(i + 1).map((ws) => `"${ws.name}"`);
    if (ignored.length > 0) {
      warnings.push({
        code: 'OTHER_WORKSHEETS_IGNORED',
        message: `Only worksheet "${sheet.name}" was read. Ignored: ${ignored.join(', ')}.`,
      });
    }
    return { sheet, sheetRows };
  }

  throw new ValidationError(
    'The workbook has no usable worksheet.',
    worksheets.length === 0 ? ['The workbook contains no worksheets.'] : skipped.map((s) => `Worksheet ${s}.`),
    { code: 'NO_USABLE_WORKSHEET' }
  );
}

function readHeaders(sheet, headerRow, headerRowNumber, notes) {
  const raw = new Map();
  const mergedCols = new Set();
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    if (isMergedSlave(cell)) mergedCols.add(col);
    const value = readCell(cell, notes);
    if (!isBlank(value)) raw.set(col, value);
  });
  // Columns covered by a merged header cell count as header columns (with an
  // empty name), so their data is rejected rather than silently dropped.
  const cols = [...raw.keys(), ...mergedCols];
  const firstCol = Math.min(...cols);
  const lastCol = Math.max(...cols);

  const headers = [];
  const emptyProblems = [];
  const duplicateProblems = [];
  const seen = new Map(); // lower-cased header → column letter of first occurrence
  for (let col = firstCol; col <= lastCol; col++) {
    const letter = sheet.getColumn(col).letter;
    const header = raw.has(col) ? String(raw.get(col)).trim() : '';
    if (header === '') {
      emptyProblems.push(
        `Column ${letter} (row ${headerRowNumber}) has an empty header` +
          (mergedCols.has(col) ? ' because it is part of a merged cell.' : '.')
      );
    } else if (seen.has(header.toLowerCase())) {
      duplicateProblems.push(
        `Header "${header}" in column ${letter} duplicates column ${seen.get(header.toLowerCase())} (headers are compared ignoring case).`
      );
    } else {
      seen.set(header.toLowerCase(), letter);
    }
    headers.push(header);
  }

  if (emptyProblems.length > 0 || duplicateProblems.length > 0) {
    const empty = emptyProblems.length > 0;
    throw new ValidationError(
      empty ? 'The header row has empty column names.' : 'The header row has duplicate column names.',
      capList([...emptyProblems, ...duplicateProblems], MAX_DETAILS),
      { code: empty ? 'EMPTY_HEADER' : 'DUPLICATE_HEADER' }
    );
  }
  return { headers, firstCol, lastCol };
}

/** Converts an ExcelJS cell to a plain JSON value, recording notable cells. */
function readCell(cell, notes) {
  if (isMergedSlave(cell)) {
    notes.merged.push(cell.address);
    return null; // value lives in the merge's top-left cell only
  }
  return normalizeValue(cell.value, cell, notes);
}

/** `notes` may be null when only checking for content. */
function normalizeValue(value, cell, notes) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text ?? '').join('');
  if ('formula' in value || 'sharedFormula' in value) {
    if (notes) notes.formulas.push(cell.address);
    if (value.result === undefined) {
      if (notes) notes.formulasWithoutResult++;
      return null;
    }
    return normalizeValue(value.result, cell, notes);
  }
  if ('error' in value) {
    if (notes) notes.errors.push(cell.address);
    return String(value.error);
  }
  if ('hyperlink' in value) return normalizeValue(value.text ?? null, cell, notes);
  return typeof cell.text === 'string' ? cell.text : null;
}

function cellWarnings(notes) {
  const warnings = [];
  if (notes.formulas.length > 0) {
    const missing = notes.formulasWithoutResult
      ? ` ${notes.formulasWithoutResult} of them had no saved result and were read as empty (null).`
      : '';
    warnings.push({
      code: 'FORMULA_CELLS',
      message: `${notes.formulas.length} cell(s) contain formulas (${sample(notes.formulas)}). The result Excel last saved was used; formulas were not evaluated.${missing}`,
    });
  }
  if (notes.errors.length > 0) {
    warnings.push({
      code: 'ERROR_CELLS',
      message: `${notes.errors.length} cell(s) contain Excel errors such as #N/A (${sample(notes.errors)}). The error text was kept as the value.`,
    });
  }
  if (notes.merged.length > 0) {
    warnings.push({
      code: 'MERGED_CELLS',
      message: `${notes.merged.length} cell(s) are covered by merged cells (${sample(notes.merged)}) and were read as empty; each merged value is kept only in its top-left cell.`,
    });
  }
  if (notes.outside.length > 0) {
    warnings.push({
      code: 'VALUES_OUTSIDE_HEADER',
      message: `${notes.outside.length} non-empty cell(s) are outside the header columns and were ignored (${sample(notes.outside)}).`,
    });
  }
  return warnings;
}

function isMergedSlave(cell) {
  return cell.isMerged && cell.master !== cell;
}

function isBlank(value) {
  return value === null || (typeof value === 'string' && value.trim() === '');
}

function rowHasContent(row) {
  let found = false;
  row.eachCell({ includeEmpty: false }, (cell) => {
    if (!found && !isMergedSlave(cell) && !isBlank(normalizeValue(cell.value, cell, null))) found = true;
  });
  return found;
}

function sample(addresses) {
  const shown = addresses.slice(0, MAX_ADDRESSES).join(', ');
  return addresses.length > MAX_ADDRESSES ? `${shown}, …` : shown;
}

function capList(items, max) {
  return items.length > max ? [...items.slice(0, max), `…and ${items.length - max} more.`] : items;
}

/** The client-supplied name is untrusted: keep only a display-safe base name. */
function sanitizeFileName(name) {
  const base = String(name).split(/[\\/]/).pop();
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (clean || 'upload.xlsx').slice(0, MAX_FILE_NAME_LENGTH);
}

module.exports = { ExcelImportService };
