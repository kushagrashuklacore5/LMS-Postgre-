const db = require('../config/database-switch');

// Create invoices table
function createInvoicesTable() {
  console.log('📄 Creating invoices table...');
  
  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoiceNumber TEXT UNIQUE NOT NULL,
      vendorId INTEGER NOT NULL,
      vendorName TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
      issueDate DATE NOT NULL,
      dueDate DATE,
      paidDate DATE,
      description TEXT,
      items TEXT, -- JSON string of invoice items
      university_id INTEGER NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vendorId) REFERENCES vendors(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating invoices table:', err);
    } else {
      console.log('✅ Invoices table created successfully');
      
      // Add university_id column to vendors table if it doesn't exist
      db.run(`ALTER TABLE vendors ADD COLUMN university_id INTEGER`, () => {});
    }
  });
}

// Initialize the invoices table
createInvoicesTable();

module.exports = { createInvoicesTable };
