const db = require('../config/database-switch');

// Add password field to vendors table
function addPasswordToVendorsTable() {
  console.log('🔐 Adding password field to vendors table...');
  
  // Add password column to vendors table
  db.run(`ALTER TABLE vendors ADD COLUMN password TEXT`, (err) => {
    if (err) {
      if (err.message.includes('duplicate column name')) {
        console.log('✅ Password column already exists in vendors table');
      } else {
        console.error('❌ Error adding password column:', err);
      }
    } else {
      console.log('✅ Password column added to vendors table successfully');
    }
  });
}

// Initialize the password field
addPasswordToVendorsTable();

module.exports = { addPasswordToVendorsTable };
