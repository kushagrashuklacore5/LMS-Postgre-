const db = require('config/database-switch');
const axios = require('axios');

const TRANSLATOR = process.env.LIBRETRANSLATE_URL || 'http://localhost:5000/translate';

const tables = [
  'live_classes',
  'announcements',
  'classrooms',
  'universities',
  'inventory',
  'feeStructures'
];

function getColumns(table) {
  return new Promise((resolve) => {
    db.all(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table})`, (err, cols) => {
      if (err) return resolve({ error: err.message });
      resolve({ cols });
    });
  });
}

async function translateText(text) {
  if (!text || String(text).trim() === '') return '';
  try {
    const resp = await axios.post(TRANSLATOR, { q: String(text), source: 'en', target: 'ar' }, { timeout: 8000 });
    return resp.data?.translatedText || (String(text) + ' (AR)');
  } catch (err) {
    return String(text) + ' (AR)';
  }
}

async function processTable(table) {
  const info = await getColumns(table);
  if (info.error) {
    console.log(`- ${table}: ERROR reading schema: ${info.error}`);
    return;
  }

  const colNames = info.cols.map(c => c.name);
  // Find candidate base columns (not _en/_ar and type likely text)
  const bases = colNames.filter(n => !n.endsWith('_en') && !n.endsWith('_ar') && n !== 'id' && n !== 'createdAt' && n !== 'updatedAt');
  if (bases.length === 0) {
    console.log(`- ${table}: no candidate base columns found`);
    return;
  }

  for (const base of bases) {
    const arCol = `${base}_ar`;
    const enCol = `${base}_en`;

    if (!colNames.includes(arCol)) {
      // create column if missing
      await new Promise(res => db.run(`ALTER TABLE ${table} ADD COLUMN ${arCol} TEXT`, () => res()));
      console.log(`  • ${table}: added missing column ${arCol}`);
    }

    // Select rows where arCol is null or empty and source value exists
    const sourceCol = colNames.includes(enCol) ? enCol : base;
    const selectQuery = `SELECT id, ${sourceCol} as src FROM ${table} WHERE ${arCol} IS NULL OR TRIM(${arCol}) = ''`;

    await new Promise((resolve) => {
      db.all(selectQuery, async (err, rows) => {
        if (err) {
          console.log(`  • ${table}: skip ${base} (select error: ${err.message})`);
          return resolve();
        }

        if (!rows || rows.length === 0) return resolve();

        for (const row of rows) {
          const src = row.src;
          if (!src || String(src).trim() === '') continue;
          const ar = await translateText(src);
          await new Promise(r => db.run(`UPDATE ${table} SET ${arCol} = ? WHERE id = ?`, [ar, row.id], () => r()));
        }

        console.log(`  • ${table}: translated ${rows.length} rows for base '${base}'`);
        resolve();
      });
    });
  }
}

(async () => {
  console.log('Running targeted migration to populate _ar columns...');
  for (const t of tables) {
    try {
      await processTable(t);
    } catch (e) {
      console.log(`- ${t}: ERROR ${e.message}`);
    }
  }
  console.log('Targeted migration finished.');
  process.exit(0);
})();
