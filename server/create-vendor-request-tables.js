const db = require('config/database-switch');

// Create vendor_quotes table
db.run(`
  CREATE TABLE IF NOT EXISTS vendor_quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL,
    vendor_id INTEGER NOT NULL,
    items TEXT,
    subtotal REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    gst REAL DEFAULT 0,
    total REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES stock_requests(id),
    FOREIGN KEY (vendor_id) REFERENCES vendors(id),
    UNIQUE(request_id, vendor_id)
  )
`, (err) => {
  if (err) {
    console.error('Error creating vendor_quotes table:', err);
  } else {
    console.log('✅ vendor_quotes table created/verified');
  }
});

// Create invoice_items table
db.run(`
  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoiceId INTEGER NOT NULL,
    itemName TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unitPrice REAL NOT NULL,
    total REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoiceId) REFERENCES invoices(id)
  )
`, (err) => {
  if (err) {
    console.error('Error creating invoice_items table:', err);
  } else {
    console.log('✅ invoice_items table created/verified');
  }
});

// Add vendor_quotes column to stock_requests if not exists
db.run(`
  ALTER TABLE stock_requests ADD COLUMN vendor_quotes TEXT DEFAULT '[]'
`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Error adding vendor_quotes column:', err);
  } else {
    console.log('✅ vendor_quotes column verified in stock_requests');
  }
});

console.log('Database tables for vendor request system created successfully!');
process.exit(0);
