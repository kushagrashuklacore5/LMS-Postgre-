const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const srcDb = path.join(__dirname, '../data/lms_permanent.db');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDb = path.join(__dirname, `../data/lms_permanent.db.backup_${timestamp}`);
const testDb = path.join(__dirname, '../data/lms_migration_test.db');

console.log('--- PHASE 1: DATABASE BACKUP & BASELINE AUDIT ---');

// 1. Copy database to permanent backup
fs.copyFileSync(srcDb, backupDb);
console.log(`✅ Backup created successfully: ${backupDb}`);

// 2. Copy database to test database for isolated test execution
fs.copyFileSync(srcDb, testDb);
console.log(`✅ Test database created: ${testDb}`);

// 3. Inspect baseline data on the original database
const db = new sqlite3.Database(srcDb, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err);
    process.exit(1);
  }
});

db.serialize(() => {
  // Check tables
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) console.error(err);
    console.log('\n📊 Existing Tables in DB:', tables.map(t => t.name).join(', '));
  });

  // Check payments columns
  db.all("PRAGMA table_info(payments)", [], (err, columns) => {
    if (err) console.error(err);
    console.log('\n📊 Baseline columns in `payments` table:');
    console.table(columns.map(c => ({ cid: c.cid, name: c.name, type: c.type, notnull: c.notnull, dflt_value: c.dflt_value })));
  });

  // Check existing payment counts & sums
  db.get("SELECT COUNT(*) as totalCount, SUM(amount) as totalSum, COUNT(DISTINCT studentId) as studentCount FROM payments", [], (err, row) => {
    if (err) console.error(err);
    console.log('\n📊 Baseline `payments` statistics:');
    console.log(`Total Rows: ${row?.totalCount || 0}, Total Sum: ₹${row?.totalSum || 0}, Distinct Students: ${row?.studentCount || 0}`);
  });

  // Check legacy payment details
  db.all("SELECT id, studentId, amount, type, status, transactionId, createdAt FROM payments ORDER BY id ASC LIMIT 20", [], (err, rows) => {
    if (err) console.error(err);
    console.log('\n📊 Baseline payment rows (Sample up to 20):');
    console.table(rows || []);
    db.close();
  });
});
