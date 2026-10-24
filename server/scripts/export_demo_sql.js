require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const db = require('../config/database-switch');

async function exportSql() {
  const query = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });

  const tables = [
    'users',
    'classrooms',
    'classroomAssignments',
    'students',
    'student_classroom_assignment',
    'courses',
    'course_classrooms',
    'course_students',
    'chapters'
  ];

  let sqlOutput = `-- LMS PostgreSQL Customer Demo Data Dump\n-- Generated on: ${new Date().toISOString()}\n\n`;

  for (const table of tables) {
    const rows = await query(`SELECT * FROM ${table}`);
    if (rows.length === 0) continue;

    sqlOutput += `-- Data for ${table} (${rows.length} rows)\n`;
    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = cols.map(c => {
        const val = row[c];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number') return val;
        return `'${String(val).replace(/'/g, "''")}'`;
      });
      sqlOutput += `INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${vals.join(', ')}) ON CONFLICT DO NOTHING;\n`;
    }
    sqlOutput += '\n';
  }

  const outPath = path.join(__dirname, '../database/postgres/demo_database_dump.sql');
  fs.writeFileSync(outPath, sqlOutput, 'utf8');
  console.log(`✅ Exported demo database dump to ${outPath} (${sqlOutput.length} bytes)`);
  process.exit(0);
}

exportSql().catch(err => {
  console.error('Export error:', err);
  process.exit(1);
});
