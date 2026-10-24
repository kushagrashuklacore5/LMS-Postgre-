const db = require('config/database-switch');

// Add sample vendor stock data
const sampleData = [
  {
    vendor_id: 1,
    university_id: 1,
    name: 'Laptop Dell Inspiron',
    category: 'Electronics',
    quantity: 15,
    unit_price: 899.99,
    min_stock: 5,
    description: 'High-performance laptop for students'
  },
  {
    vendor_id: 1,
    university_id: 1,
    name: 'Office Chair',
    category: 'Furniture',
    quantity: 3,
    unit_price: 199.99,
    min_stock: 10,
    description: 'Ergonomic office chair with lumbar support'
  },
  {
    vendor_id: 1,
    university_id: 1,
    name: 'Notebook Set',
    category: 'Stationery',
    quantity: 0,
    unit_price: 12.99,
    min_stock: 20,
    description: 'Set of 5 notebooks for students'
  }
];

sampleData.forEach(item => {
  db.run(
    `INSERT OR IGNORE INTO vendor_stock (vendor_id, university_id, name, category, quantity, unit_price, min_stock, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [item.vendor_id, item.university_id, item.name, item.category, item.quantity, item.unit_price, item.min_stock, item.description],
    function(err) {
      if (err) {
        console.error('Error inserting sample data:', err);
      } else {
        console.log(`Sample stock item added: ${item.name}`);
      }
    }
  );
});

setTimeout(() => {
  console.log('Sample data insertion completed');
  process.exit(0);
}, 1000);
