const db = require('config/database-switch');

console.log('Starting inventory field migration...');

// Check current table structure
db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'inventory)", (err, result) => {
  if (err) {
    console.error('Error getting table info:', err);
    process.exit(1);
  }
  
  const hasOldFields = result.some(col => 
    col.name === 'itemName' || col.name === 'quantity' || col.name === 'vendorId'
  );
  
  if (hasOldFields) {
    console.log('Detected old field structure, migrating...');
    
    // Get existing data
    db.all('SELECT * FROM inventory', (err, rows) => {
      if (err) {
        console.error('Error getting existing data:', err);
        process.exit(1);
      }
      
      console.log(`Found ${rows.length} items to migrate`);
      
      // Drop old table
      db.run('DROP TABLE IF EXISTS inventory', (err) => {
        if (err) {
          console.error('Error dropping table:', err);
          process.exit(1);
        }
        
        // Recreate table with new structure
        require('./config/schema').createTables(db);
        
        // Insert migrated data
        const insertStmt = db.prepare(`
          INSERT INTO inventory (name, category, stock, minStock, unitPrice, vendorName, description, purchaseDate, university_id) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        rows.forEach((row, index) => {
          const values = [
            row.itemName || row.name || 'Unknown Item',  // Handle both old and new field names
            row.category || 'Consumable',
            row.quantity || row.stock || 0,  // Handle both old and new field names
            row.minStock || row.minStock || 10,
            row.unitPrice || 0,
            row.vendorName || 'Unknown Vendor',
            row.description || '',
            row.purchaseDate || new Date().toISOString(),
            row.university_id || 1
          ];
          
          insertStmt.run(values, (err) => {
            if (err) {
              console.error(`Error inserting item ${index + 1}:`, err);
            } else {
              console.log(`✅ Migrated item ${index + 1}: ${values[0]}`);
            }
          });
        });
        
        insertStmt.finalize((err) => {
          if (err) {
            console.error('Error finalizing insert:', err);
          } else {
            console.log('✅ Migration completed successfully!');
          }
        });
      });
    });
  } else {
    console.log('✅ Table already has correct field structure');
  }
});
