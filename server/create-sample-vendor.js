const db = require('config/database-switch');

// Create a sample vendor first
db.run(`
  INSERT OR IGNORE INTO vendors (name, email, phone, address, category, university_id)
  VALUES ('Dell Computer Supplies', 'dell@vendor.com', '+1234567890', '123 Vendor St', 'Electronics', 1)
`, function(err) {
  if (err) {
    console.error('Error creating vendor:', err);
  } else {
    console.log('✅ Sample vendor created');
  }
  process.exit(0);
});
