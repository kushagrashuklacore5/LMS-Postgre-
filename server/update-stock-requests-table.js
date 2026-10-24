const db = require('config/database-switch');

// Add missing columns to stock_requests table
const columns = [
  'delivery_address TEXT DEFAULT ""',
  'contact_person TEXT DEFAULT ""',
  'contact_phone TEXT DEFAULT ""',
  'contact_email TEXT DEFAULT ""',
  'department TEXT DEFAULT ""',
  'budget_code TEXT DEFAULT ""',
  'requested_by TEXT DEFAULT ""'
];

columns.forEach((column, index) => {
  const [columnName] = column.split(' ');
  
  db.run(`ALTER TABLE stock_requests ADD COLUMN ${column}`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.error(`Error adding ${columnName} column:`, err);
    } else {
      console.log(`✅ ${columnName} column added/verified`);
    }
    
    if (index === columns.length - 1) {
      console.log('All stock_requests table columns updated successfully!');
      process.exit(0);
    }
  });
});
