'use strict';
/**
 * Demo accounts and default fee structures for an EMPTY database, when SEED_DEMO_DATA=true.
 * Development only: the demo accounts share one publicly known password, so this never runs
 * in production. Each part runs only when its table is empty, inside one transaction.
 */
const demoSeedEnabled = () => process.env.SEED_DEMO_DATA === 'true' && process.env.NODE_ENV !== 'production';

// Passwords that are published (in this repository, its history or its documentation). An account that
// still uses one must not exist on a production server: see findAccountsWithPublishedPasswords.
const PUBLISHED_PASSWORDS = ['password', 'Demo@1234'];

/**
 * Accounts that still sign in with a published password. To stay fast on any size of database it checks
 * every privileged account (superadmin, admin, accountant, storekeeper) plus demo addresses, not every
 * student. Returns [{ email, role }] (no passwords).
 */
async function findAccountsWithPublishedPasswords(db) {
  const bcrypt = require('../helpers/passwords');
  const rows = await new Promise((resolve, reject) => db.all(
    `SELECT email, role, password FROM users
     WHERE role IN ('superadmin', 'admin', 'accountant', 'storekeeper')
        OR LOWER(email) LIKE '%@demo.com' OR LOWER(email) IN ('admin@gmail.com', 'mentor@gmail.com', 'student@gmail.com')`,
    [],
    (err, result) => (err ? reject(err) : resolve(result || []))
  ));
  const found = [];
  for (const row of rows) {
    if (typeof row.password !== 'string' || !row.password.startsWith('$2')) continue;
    for (const candidate of PUBLISHED_PASSWORDS) {
      if (await bcrypt.compare(candidate, row.password)) { found.push({ email: row.email, role: row.role }); break; }
    }
  }
  return found;
}

// bcrypt hash of the well-known demo password "password"
const DEMO_HASH = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

async function seedDemoData(db) {
  if (!demoSeedEnabled()) return;
  await db.transaction(async (tx) => {
    const users = await tx.get('SELECT COUNT(*) AS count FROM users');
    if (users.count === 0) {
      console.log('📝 Inserting demo data...');
      // the demo accounts belong to school 1, so that school has to exist
      await tx.run("INSERT INTO universities (name, area) SELECT 'Demo School', 'Demo' WHERE NOT EXISTS (SELECT 1 FROM universities)");
      const demoUsers = [
        ['Superadmin User', 'superadmin@core5.com', 'superadmin'],
        ['Admin User', 'admin@gmail.com', 'admin'],
        ['Mentor User', 'mentor@gmail.com', 'mentor'],
        ['Student User', 'student@gmail.com', 'student'],
        ['Accountant User', 'accountant@demo.com', 'accountant'],
        ['Storekeeper User', 'storekeeper@demo.com', 'storekeeper'],
      ];
      for (const [name, email, role] of demoUsers) {
        await tx.run('INSERT INTO users (name, email, password, role, isApproved) VALUES (?, ?, ?, ?, 1)', [name, email, DEMO_HASH, role]);
      }
      const inventory = [
        ['Chalk', 'Stationery', 100, 2, 'White chalk for classroom use'],
        ['Whiteboard Marker', 'Stationery', 25, 15, 'Black markers for whiteboards'],
        ['Duster', 'Stationery', 15, 5, 'Board dusters'],
        ['Notebooks', 'Stationery', 100, 20, 'Student notebooks'],
        ['Pens', 'Stationery', 50, 5, 'Ball point pens'],
      ];
      for (const [itemName, category, quantity, unitPrice, description] of inventory) {
        await tx.run("INSERT INTO inventory (itemName, category, quantity, unitPrice, vendorId, purchaseDate, description) VALUES (?, ?, ?, ?, NULL, '2024-01-01', ?)", [itemName, category, quantity, unitPrice, description]);
      }
      const vendors = [
        ['Office Supplies Co.', 'contact@officesupplies.com', '123-456-7890', '123 Office St', 'Stationery', 4.5, 10, 5000],
        ['Education Materials Ltd', 'info@edumat.com', '987-654-3210', '456 Edu Ave', 'Books', 4.2, 5, 3000],
      ];
      for (const vendor of vendors) {
        await tx.run('INSERT INTO vendors (name, email, phone, address, category, rating, totalOrders, totalValue) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', vendor);
      }
      console.log('✅ Demo data inserted successfully');
    }

    const fees = await tx.get('SELECT COUNT(*) AS count FROM feeStructures');
    if (fees.count === 0) {
      const defaults = [
        ['Primary', '1-4', 5000, 1000, 800, 500, 300, 700, 200, 8050, '2026-01-31'],
        ['Secondary', '5-12', 7000, 1500, 1200, 700, 500, 900, 300, 12100, '2026-01-31'],
      ];
      for (const row of defaults) {
        await tx.run(
          `INSERT INTO feeStructures (category, grade, tuitionFee, transportFee, computerLabFee, libraryFee, sportsFee, examinationFee, miscellaneousFee, totalFee, dueDate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          row
        );
      }
      console.log('✅ Default fee structures initialized');
    }
  });
}

module.exports = { seedDemoData, demoSeedEnabled, findAccountsWithPublishedPasswords, PUBLISHED_PASSWORDS };
