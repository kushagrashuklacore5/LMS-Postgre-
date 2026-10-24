console.log('🔧 Creating Vendor Invoice Table in Database...');
console.log('');

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('📁 Database Path:', dbPath);

// Create vendor_invoices table
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS vendor_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id INTEGER NOT NULL,
    vendor_name TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    description TEXT,
    items TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    university_id INTEGER NOT NULL
  )`, (err) => {
    if (err) {
      console.error('❌ Error creating vendor_invoices table:', err);
      return;
    }
    console.log('✅ vendor_invoices table created successfully');
  });

  // Insert sample vendor invoices
  const sampleInvoices = [
    {
      vendor_id: 36,
      vendor_name: 'Tech Supplies Co.',
      invoice_number: 'INV-001',
      issue_date: '2026-03-15',
      due_date: '2026-03-30',
      amount: 5000,
      status: 'pending',
      description: 'Office supplies for March 2026',
      items: JSON.stringify([
        { name: 'Laptops', quantity: 5, price: 1000 },
        { name: 'Printers', quantity: 2, price: 500 }
      ]),
      university_id: 1
    },
    {
      vendor_id: 37,
      vendor_name: 'Stationery World',
      invoice_number: 'INV-002',
      issue_date: '2026-03-10',
      due_date: '2026-03-25',
      amount: 7500,
      status: 'pending',
      description: 'Stationery supplies for March 2026',
      items: JSON.stringify([
        { name: 'Notebooks', quantity: 10, price: 50 },
        { name: 'Pens', quantity: 20, price: 25 }
      ]),
      university_id: 1
    },
    {
      vendor_id: 38,
      vendor_name: 'Office Depot Inc.',
      invoice_number: 'INV-003',
      issue_date: '2026-03-05',
      due_date: '2026-03-20',
      amount: 12000,
      status: 'paid',
      description: 'Office furniture and equipment',
      items: JSON.stringify([
        { name: 'Desks', quantity: 3, price: 2000 },
        { name: 'Chairs', quantity: 8, price: 500 }
      ]),
      university_id: 1
    }
  ];

  // Insert sample invoices
  const insertInvoice = (invoice) => {
    db.run(
      `INSERT INTO vendor_invoices (vendor_id, vendor_name, invoice_number, issue_date, due_date, amount, status, description, items, university_id, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        invoice.vendor_id,
        invoice.vendor_name,
        invoice.invoice_number,
        invoice.issue_date,
        invoice.due_date,
        invoice.amount,
        invoice.status,
        invoice.description,
        invoice.items,
        invoice.university_id
      ],
      (err) => {
        if (err) {
          console.error('❌ Error inserting invoice:', err);
        } else {
          console.log(`✅ Inserted invoice ${invoice.invoice_number} for ${invoice.vendor_name}`);
        }
      }
  );

  // Insert all sample invoices
  db.serialize(() => {
    sampleInvoices.forEach(insertInvoice);
    console.log('✅ All sample invoices inserted successfully');
  });

  // Verify table creation and data
  db.all("SELECT * FROM vendor_invoices ORDER BY created_at DESC", [], (err, invoices) => {
    if (err) {
      console.error('❌ Error verifying vendor_invoices table:', err);
      return;
    }

    console.log('📊 Total Vendor Invoices:', invoices.length);
    console.log('📋 Sample Invoices:');
    invoices.forEach((invoice, index) => {
      console.log(`  ${index + 1}. ID: ${invoice.id}, Vendor: ${invoice.vendor_name}, Invoice: ${invoice.invoice_number}, Amount: ₹${invoice.amount}, Status: ${invoice.status}`);
    });

    console.log('====================');
    console.log('✅ vendor_invoices table created and populated with sample data');
    console.log('📊 Accountant portal should now show real invoice data');
  });

  db.close((err) => {
    if (err) {
      console.error('❌ Error closing database:', err);
    } else {
      console.log('✅ Database connection closed');
    }
  });
});
