const fs = require('fs');
const path = require('path');
const db = require('../config/database-switch');
const translationService = require('../services/translationService');

async function exportTable(tableName, outDir, lang='ar'){
  const pragma = await new Promise((resolve, reject) => {
    db.all(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${tableName})`, (err, cols) => {
      if (err) return resolve([]);
      resolve(cols.map(c=>c.name));
    });
  });
  if (!pragma || pragma.length===0) return {table:tableName,rows:0,skipped:true};

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
      if (err) return resolve([]);
      resolve(r||[]);
    });
  });

  const outPath = path.join(outDir, `${tableName}.csv`);
  let csv = '\uFEFF';

  let headers = bases.slice();
  if (lang === 'ar') {
    try{
      const translatedHeaders = await translationService.translateBatch(headers, 'ar', 'en');
      headers = translatedHeaders.map((t,i)=>(t&&t.trim()!=='')?t:headers[i]);
    }catch(e){ /* ignore */ }
  }
  csv += headers.join(',') + '\n';

  for (const row of rows){
    const toTranslate = [];
    const translateKeys = [];
    bases.forEach(base=>{
      const arVal = row[`${base}__ar_src`];
      const enVal = row[`${base}__en_src`];
      if (lang==='ar'){
        if (arVal && String(arVal).trim()!==''){
        } else if (enVal && String(enVal).trim()!==''){
          toTranslate.push(String(enVal));
          translateKeys.push(base);
        } else {
          toTranslate.push('');
          translateKeys.push(base);
        }
      }
    });

    let translated = [];
    if (toTranslate.length>0){
      try{ translated = await translationService.translateBatch(toTranslate, 'ar', 'en'); }catch(e){ translated = toTranslate.map(t=>t); }
    }

    const values = bases.map(base=>{
      const arVal = row[`${base}__ar_src`];
      const enVal = row[`${base}__en_src`];
      let finalVal = '';
      if (lang==='ar'){
        if (arVal && String(arVal).trim()!=='') finalVal = String(arVal);
        else {
          const idx = translateKeys.indexOf(base);
          finalVal = (idx!==-1)? translated[idx] : (enVal?String(enVal):'');
        }
      } else {
        if (enVal && String(enVal).trim()!=='') finalVal = String(enVal);
        else if (arVal && String(arVal).trim()!=='') finalVal = String(arVal);
        else finalVal = '';
      }
      if (finalVal===null||finalVal===undefined) finalVal='';
      const stringValue = String(finalVal);
      if (stringValue.includes(',')||stringValue.includes('"')||stringValue.includes('\n')||stringValue.includes('\r')){
        return `"${stringValue.replace(/"/g,'""')}"`;
      }
      return stringValue;
    });

    csv += values.join(',') + '\n';
  }

  fs.writeFileSync(outPath, csv, {encoding:'utf8'});
  return {table:tableName,rows:rows.length,skipped:false,path:outPath};
}

async function exportAll(){
  try{
    await translationService.isServiceAvailable();
    const tables = await new Promise((resolve,reject)=>{
      db.all("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND name NOT LIKE 'sqlite_%'", (err, rows)=>{
        if (err) return resolve([]);
        resolve(rows.map(r=>r.name));
      });
    });

    const outDir = path.join('C:', 'Windows', 'Temp', `lms_export_ar_${new Date().toISOString().replace(/[:.]/g,'-')}`);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, {recursive:true});

    const report = [];
    for (const t of tables){
      const r = await exportTable(t, outDir, 'ar');
      report.push(r);
    }

    console.log('Export complete. Files written to:', outDir);
    report.forEach(r=> console.log(r.table, r.rows, r.skipped? 'skipped': r.path));
    process.exit(0);
  }catch(e){
    console.error('Export all failed:', e.message);
    process.exit(1);
  }
}

exportAll();
