const fs = require('fs');
const db = require('../config/database-switch');
const translationService = require('../services/translationService');

async function exportTableToFile(tableName = 'classrooms', lang = 'ar', outPath = 'C:\\Windows\\Temp\\classrooms_ar_full.csv') {
  try {
    await translationService.isServiceAvailable();

    const pragma = await new Promise((resolve, reject) => {
      db.all(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName})`, (err, cols) => {
        if (err) return reject(err);
        resolve(cols.map(c => c.name));
      });
    });

    const cols = pragma;
    const columnMap = {};
    cols.forEach(c => {
      const m = c.match(/^(.*)_(en|ar)$/);
      if (m) {
        const base = m[1];
        const l = m[2];
        columnMap[base] = columnMap[base] || {};
        columnMap[base][l] = c;
      } else {
        columnMap[c] = columnMap[c] || {};
        columnMap[c].default = c;
      }
    });

    const selectParts = [];
    const bases = Object.keys(columnMap);
    bases.forEach(base => {
      const arCol = columnMap[base].ar || null;
      const enCol = columnMap[base].en || null;
      const defCol = columnMap[base].default || null;

      if (arCol) selectParts.push(`${arCol} as ${base}__ar_src`);
      else selectParts.push(`NULL as ${base}__ar_src`);

      if (enCol) selectParts.push(`${enCol} as ${base}__en_src`);
      else if (defCol) selectParts.push(`${defCol} as ${base}__en_src`);
      else selectParts.push(`NULL as ${base}__en_src`);
    });

    const selectQuery = `SELECT ${selectParts.join(', ')} FROM ${tableName}`;

    const rows = await new Promise((resolve, reject) => {
      db.all(selectQuery, (err, r) => {
        if (err) return reject(err);
        resolve(r || []);
      });
    });

    let csv = '\uFEFF';

    let headers = bases.slice();
    if (lang === 'ar') {
      try {
        const translatedHeaders = await translationService.translateBatch(headers, 'ar', 'en');
        headers = translatedHeaders.map((t, i) => (t && t.trim() !== '') ? t : headers[i]);
      } catch (e) {
        console.error('Header translation failed:', e.message);
      }
    }

    csv += headers.join(',') + '\n';

    for (const row of rows) {
      const toTranslate = [];
      const translateKeys = [];
      bases.forEach(base => {
        const arVal = row[`${base}__ar_src`];
        const enVal = row[`${base}__en_src`];
        if (lang === 'ar') {
          if (arVal && String(arVal).trim() !== '') {
            // ok
          } else if (enVal && String(enVal).trim() !== '') {
            toTranslate.push(String(enVal));
            translateKeys.push(base);
          } else {
            toTranslate.push('');
            translateKeys.push(base);
          }
        }
      });

      let translated = [];
      if (toTranslate.length > 0) {
        translated = await translationService.translateBatch(toTranslate, 'ar', 'en');
      }

      const values = bases.map(base => {
        const arVal = row[`${base}__ar_src`];
        const enVal = row[`${base}__en_src`];
        let finalVal = '';
        if (lang === 'ar') {
          if (arVal && String(arVal).trim() !== '') finalVal = String(arVal);
          else {
            const idx = translateKeys.indexOf(base);
            finalVal = (idx !== -1) ? translated[idx] : (enVal ? String(enVal) : '');
          }
        } else {
          if (enVal && String(enVal).trim() !== '') finalVal = String(enVal);
          else if (arVal && String(arVal).trim() !== '') finalVal = String(arVal);
          else finalVal = '';
        }

        if (finalVal === null || finalVal === undefined) finalVal = '';
        const stringValue = String(finalVal);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });

      csv += values.join(',') + '\n';
    }

    fs.writeFileSync(outPath, csv, { encoding: 'utf8' });
    console.log('Export written to', outPath);
  } catch (e) {
    console.error('Export failed:', e.message);
    process.exit(1);
  }
}

exportTableToFile();
