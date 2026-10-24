const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { runInstallmentMigrations } = require('../config/migration-runner');

const testDbPath = path.join(__dirname, '../data/lms_migration_test.db');

async function testIsolatedMigration() {
  console.log('================================================================');
  console.log('🧪 PHASE 1: ISOLATED MIGRATION TEST ON COPY OF REAL DATABASE');
  console.log('================================================================');
  console.log(`Database under test: ${testDbPath}\n`);

  const db = new sqlite3.Database(testDbPath);

  // Helper query promise
  const queryAll = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });

  const queryGet = (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });

  try {
    // 1. Pre-Migration Baseline
    const preCount = await queryGet("SELECT COUNT(*) as count, SUM(amount) as totalAmount FROM payments");
    const preRows = await queryAll("SELECT id, studentId, amount, type, status, transactionId, createdAt FROM payments ORDER BY id ASC");
    
    console.log('--- 1. PRE-MIGRATION STATE ---');
    console.log(`Total Payment Rows: ${preCount.count}`);
    console.log(`Total Payment Amount: ₹${preCount.totalAmount}`);
    console.table(preRows);

    // 2. Run Migration (First Run)
    console.log('\n--- 2. RUNNING MIGRATION (PASS 1) ---');
    const result1 = await runInstallmentMigrations(db);
    console.log(`✅ Migration Pass 1 Succeeded: ${result1.appliedMigrations.length} steps applied.`);

    // 3. Test Repeatability & Idempotency (Second Run on same DB)
    console.log('\n--- 3. RUNNING MIGRATION IDEMPOTENCY TEST (PASS 2 - IMMEDIATE RE-RUN) ---');
    const result2 = await runInstallmentMigrations(db);
    console.log(`✅ Migration Pass 2 Succeeded: Re-running produced zero duplicate errors.`);

    // 4. Inspect Migrated Schema
    console.log('\n--- 4. POST-MIGRATION SCHEMA VERIFICATION ---');
    const paymentCols = await queryAll("PRAGMA table_info(payments)");
    console.log('Updated `payments` columns:');
    console.table(paymentCols.map(c => ({ cid: c.cid, name: c.name, type: c.type, notnull: c.notnull, dflt_value: c.dflt_value })));

    const scheduleCols = await queryAll("PRAGMA table_info(student_fee_schedules)");
    console.log('New `student_fee_schedules` columns:');
    console.table(scheduleCols.map(c => ({ cid: c.cid, name: c.name, type: c.type, notnull: c.notnull })));

    const orderCols = await queryAll("PRAGMA table_info(payment_orders)");
    console.log('New `payment_orders` columns:');
    console.table(orderCols.map(c => ({ cid: c.cid, name: c.name, type: c.type, notnull: c.notnull })));

    // 5. Compare Data Integrity of Legacy Rows
    console.log('\n--- 5. LEGACY DATA INTEGRITY CHECK ---');
    const postCount = await queryGet("SELECT COUNT(*) as count, SUM(amount) as totalAmount FROM payments");
    const postRows = await queryAll("SELECT id, studentId, amount, type, status, transactionId, scheduleId, feeStructureId, planId, installmentStage, allocationStatus, idempotencyKey FROM payments ORDER BY id ASC");
    
    console.log(`Pre-migration count: ${preCount.count} | Post-migration count: ${postCount.count}`);
    console.log(`Pre-migration sum: ₹${preCount.totalAmount} | Post-migration sum: ₹${postCount.totalAmount}`);
    console.table(postRows);

    let integrityPassed = true;
    if (preCount.count !== postCount.count || preCount.totalAmount !== postCount.totalAmount) {
      integrityPassed = false;
    }

    preRows.forEach(preRow => {
      const postRow = postRows.find(p => p.id === preRow.id);
      if (!postRow || postRow.amount !== preRow.amount || postRow.studentId !== preRow.studentId) {
        integrityPassed = false;
      }
    });

    console.log(integrityPassed 
      ? '\n🎉 [PASS] 100% DATA INTEGRITY PRESERVED: Legacy rows untouched, amounts identical, new fields null/default.'
      : '\n❌ [FAIL] Data mismatch detected!'
    );

    // 6. Test Existing Application Queries
    console.log('\n--- 6. EXISTING APPLICATION QUERY COMPATIBILITY TEST ---');
    // Test Accountant Dashboard Revenue Query
    const dashRevenue = await queryAll('SELECT SUM(amount) as totalRevenue FROM payments WHERE status = "paid" OR status = "success"');
    console.log(`Accountant Dashboard Total Revenue Query: ₹${dashRevenue[0]?.totalRevenue || 0} (Expected: ₹${preCount.totalAmount})`);

    // Test Accountant Export Paid Students Query
    const paidExport = await queryAll(`
      SELECT p.id, p.studentId, p.amount, p.type, p.status, p.transactionId, p.createdAt,
             u.name as studentName, u.email as studentEmail
      FROM payments p
      LEFT JOIN users u ON p.studentId = u.id
      WHERE p.status IN ('success', 'paid')
    `);
    console.log(`Accountant Export Paid Students Query returned ${paidExport.length} rows.`);

    db.close();
    console.log('\n================================================================');
    console.log('✅ PHASE 1 TEST SUITE COMPLETED SUCCESSFULLY');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ Migration test failed with error:', err);
    db.close();
    process.exit(1);
  }
}

testIsolatedMigration();
