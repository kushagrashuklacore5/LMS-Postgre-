const fs = require('fs');
const path = require('path');

/**
 * Safe, idempotent, additive migrations for the installment tracking system.
 * Only creates tables/indexes and adds nullable columns; it never updates or
 * deletes existing rows. If anything is pending, the database file is copied
 * to a backup BEFORE the first schema change.
 *
 * @param {sqlite3.Database} db
 * @param {{ backup?: boolean, backupDir?: string }} [options]
 * @returns {Promise<{ success: boolean, appliedMigrations: string[], errors: any[], backupPath: string|null }>}
 */

const TABLES = [
  {
    name: 'student_fee_schedules',
    sql: `
      CREATE TABLE IF NOT EXISTS student_fee_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        studentId INTEGER NOT NULL,
        feeStructureId INTEGER NOT NULL,
        planId TEXT NOT NULL,
        planName TEXT NOT NULL,
        totalFee REAL NOT NULL,
        scheduleSnapshot TEXT NOT NULL,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'completed', 'superseded')),
        assignedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (studentId) REFERENCES users(id),
        FOREIGN KEY (feeStructureId) REFERENCES feeStructures(id)
      )`
  },
  {
    name: 'payment_orders',
    sql: `
      CREATE TABLE IF NOT EXISTS payment_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderId TEXT UNIQUE NOT NULL,
        studentId INTEGER NOT NULL,
        scheduleId INTEGER NOT NULL,
        installmentStage INTEGER NOT NULL,
        feeStructureId INTEGER NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'INR',
        status TEXT DEFAULT 'created' CHECK(status IN ('created', 'captured', 'reconciled', 'failed')),
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
  }
];

const COLUMNS = [
  // Phase 1
  { table: 'payments', name: 'scheduleId', type: 'INTEGER' },
  { table: 'payments', name: 'feeStructureId', type: 'INTEGER' },
  { table: 'payments', name: 'planId', type: 'TEXT' },
  { table: 'payments', name: 'installmentStage', type: 'INTEGER DEFAULT NULL' },
  { table: 'payments', name: 'allocationStatus', type: "TEXT DEFAULT 'allocated'" },
  { table: 'payments', name: 'idempotencyKey', type: 'TEXT' },
  // Phase 2A remediation: integer paise, auditable offline collection, DB-enforced receipt numbers
  { table: 'payments', name: 'amountPaise', type: 'INTEGER' },
  { table: 'payments', name: 'paymentMethod', type: 'TEXT' },
  { table: 'payments', name: 'referenceNo', type: 'TEXT' },
  { table: 'payments', name: 'receiptNo', type: 'TEXT' },
  { table: 'payments', name: 'recordedBy', type: 'INTEGER' },
  { table: 'student_fee_schedules', name: 'totalFeePaise', type: 'INTEGER' }
];

const INDEXES = [
  {
    name: 'idx_active_student_schedule',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_active_student_schedule
          ON student_fee_schedules(studentId, feeStructureId) WHERE status = 'active'`
  },
  {
    name: 'idx_payment_orders_orderId',
    sql: `CREATE INDEX IF NOT EXISTS idx_payment_orders_orderId ON payment_orders(orderId)`
  },
  {
    name: 'idx_payments_razorpay_id',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_razorpay_id
          ON payments(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL`
  },
  {
    name: 'idx_payments_idempotency',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency
          ON payments(idempotencyKey) WHERE idempotencyKey IS NOT NULL`
  },
  {
    name: 'idx_payments_receipt_no',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_receipt_no
          ON payments(receiptNo) WHERE receiptNo IS NOT NULL`
  },
  {
    // At most one active schedule per student, regardless of fee structure
    name: 'idx_one_active_schedule_per_student',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_schedule_per_student
          ON student_fee_schedules(studentId) WHERE status = 'active'`,
    // Existing violations are reported, never auto-resolved
    precheck: `SELECT studentId FROM student_fee_schedules WHERE status = 'active' GROUP BY studentId HAVING COUNT(*) > 1`,
    precheckMessage: 'students already have more than one active schedule'
  }
];

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

function run(db, sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => err ? reject(err) : resolve());
  });
}

async function existingNames(db, type) {
  const rows = await all(db, `SELECT name FROM sqlite_master WHERE type = ?`, [type]);
  return rows.map(r => r.name);
}

async function findPendingWork(db) {
  const tables = await existingNames(db, 'table');
  const indexes = await existingNames(db, 'index');
  const pending = [];

  for (const t of TABLES) {
    if (!tables.includes(t.name)) pending.push(`table ${t.name}`);
  }
  for (const c of COLUMNS) {
    if (!tables.includes(c.table)) continue; // created by this run, or reported below
    const cols = (await all(db, `PRAGMA table_info(${c.table})`)).map(r => r.name);
    if (!cols.includes(c.name)) pending.push(`column ${c.table}.${c.name}`);
  }
  for (const i of INDEXES) {
    if (!indexes.includes(i.name)) pending.push(`index ${i.name}`);
  }
  return pending;
}

function backupDatabaseFile(db, backupDir) {
  const filename = db.filename;
  if (!filename || filename === ':memory:' || !fs.existsSync(filename)) return null;

  const dir = backupDir || path.join(path.dirname(filename), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `${path.basename(filename)}.pre-installment-migration.${stamp}.bak`);
  fs.copyFileSync(filename, target);
  return target;
}

async function runInstallmentMigrations(db, options = {}) {
  const appliedMigrations = [];
  const errors = [];
  let backupPath = null;

  const pending = await findPendingWork(db);
  if (pending.length > 0 && options.backup !== false) {
    // A failed backup aborts the migration: no schema change without a restore point.
    backupPath = backupDatabaseFile(db, options.backupDir);
    if (backupPath) appliedMigrations.push(`Backup created at ${backupPath}`);
  }

  const step = async (label, fn) => {
    try {
      await fn();
      appliedMigrations.push(label);
    } catch (err) {
      errors.push({ step: label, error: err.message });
    }
  };

  for (const t of TABLES) {
    await step(`CREATE TABLE ${t.name} verified/created`, () => run(db, t.sql));
  }

  for (const c of COLUMNS) {
    await step(`Column ${c.table}.${c.name} verified/added`, async () => {
      const cols = (await all(db, `PRAGMA table_info(${c.table})`)).map(r => r.name);
      if (cols.includes(c.name)) return;
      try {
        await run(db, `ALTER TABLE ${c.table} ADD COLUMN ${c.name} ${c.type}`);
      } catch (alterErr) {
        if (!alterErr.message.includes('duplicate column name')) throw alterErr;
      }
    });
  }

  for (const i of INDEXES) {
    await step(`CREATE INDEX ${i.name} verified/created`, async () => {
      if (i.precheck) {
        const violations = await all(db, i.precheck);
        if (violations.length > 0) {
          throw new Error(`${violations.length} ${i.precheckMessage}; resolve manually before this index can be created`);
        }
      }
      await run(db, i.sql);
    });
  }

  if (errors.length > 0) {
    throw new Error(`Migration completed with ${errors.length} errors: ${JSON.stringify(errors)}`);
  }
  return { success: true, appliedMigrations, errors, backupPath };
}

module.exports = { runInstallmentMigrations };
