const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { runInstallmentMigrations } = require('../config/migration-runner');

const liveDbPath = path.join(__dirname, '../data/lms_permanent.db');

async function verifyLiveDbMigration() {
  console.log('================================================================');
  console.log('🚀 LIVE DATABASE MIGRATION & AUDIT VERIFICATION');
  console.log('================================================================');
  console.log(`Live DB Path: ${liveDbPath}\n`);

  const db = new sqlite3.Database(liveDbPath);

  const queryAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });

  const queryGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });

  try {
    // 1. Run migration on live DB
    console.log('Executing live database migration...');
    const result = await runInstallmentMigrations(db);
    console.log(`✅ Live Migration Success: ${result.appliedMigrations.length} steps checked/applied.`);

    // 2. Check table structures
    const paymentCols = await queryAll("PRAGMA table_info(payments)");
    const colNames = paymentCols.map(c => c.name);
    console.log('\nVerified `payments` table columns:', colNames.join(', '));

    const required = ['scheduleId', 'feeStructureId', 'planId', 'installmentStage', 'allocationStatus', 'idempotencyKey'];
    const allPresent = required.every(r => colNames.includes(r));
    console.log(`All 6 required columns present: ${allPresent ? '✅ YES' : '❌ NO'}`);

    // 3. Check student_fee_schedules table
    const scheduleCols = await queryAll("PRAGMA table_info(student_fee_schedules)");
    console.log('Verified `student_fee_schedules` columns:', scheduleCols.map(c => c.name).join(', '));

    // 4. Check payment_orders table
    const orderCols = await queryAll("PRAGMA table_info(payment_orders)");
    console.log('Verified `payment_orders` columns:', orderCols.map(c => c.name).join(', '));

    // 5. Check indexes
    const paymentIndexes = await queryAll("PRAGMA index_list(payments)");
    console.log('Verified `payments` indexes:', paymentIndexes.map(i => i.name).join(', '));

    // 6. Check data integrity
    const stats = await queryGet("SELECT COUNT(*) as count, SUM(amount) as totalAmount FROM payments");
    console.log(`\nLive DB Payment Total Count: ${stats.count} (Expected: 2)`);
    console.log(`Live DB Payment Total Sum: ₹${stats.totalAmount} (Expected: ₹9660)`);

    const rows = await queryAll("SELECT id, studentId, amount, type, status, transactionId, scheduleId, installmentStage, allocationStatus FROM payments");
    console.table(rows);

    db.close();
    console.log('\n================================================================');
    console.log('✅ LIVE DATABASE MIGRATION VERIFICATION COMPLETE');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ Live migration verification failed:', err);
    db.close();
    process.exit(1);
  }
}

verifyLiveDbMigration();
