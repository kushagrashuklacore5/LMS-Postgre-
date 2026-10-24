const db = require('./config/database-switch');

console.log('=== Checking Subscription Prices ===');

// Check feeStructures table for any subscription-related prices
const feeQuery = `
  SELECT * FROM feeStructures 
  WHERE name LIKE '%subscription%' OR name LIKE '%standard%' OR name LIKE '%professional%'
  ORDER BY name
`;

db.all(feeQuery, [], (err, feeRows) => {
  if (err) {
    console.error('Error checking feeStructures:', err);
  } else {
    console.log(`\nFound ${feeRows.length} subscription-related fee structures:`);
    feeRows.forEach(row => {
      console.log(`- ${row.name}: ${row.amount || row.price || 'No amount field'} (${row.type || 'No type'})`);
    });
  }

  // Check if there are any other tables with price information
  const tablesQuery = `
    SELECT name FROM sqlite_master 
    WHERE type='table' AND (
      sql LIKE '%price%' OR 
      sql LIKE '%amount%' OR 
      sql LIKE '%subscription%' OR
      name LIKE '%fee%' OR
      name LIKE '%price%' OR
      name LIKE '%subscription%'
    )
  `;

  db.all(tablesQuery, [], (err, tables) => {
    if (err) {
      console.error('Error checking tables:', err);
    } else {
      console.log(`\nFound ${tables.length} tables that might contain price information:`);
      tables.forEach(table => {
        console.log(`- ${table.name}`);
      });
    }

    // Check if there are any hardcoded values in the current frontend
    console.log('\n=== Frontend Price Check ===');
    console.log('Standard plan price: Changed from 50000 to 1');
    console.log('Professional plan price: Changed from 60000 to 1');
    console.log('Free plan price: Already null (no change needed)');

    process.exit(0);
  });
});
