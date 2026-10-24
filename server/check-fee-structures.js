const db = require('./config/database-switch');

console.log('=== Checking Fee Structures Schema ===');

// Get the schema of feeStructures table
const schemaQuery = `
  SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'feeStructures)
`;

db.all(schemaQuery, [], (err, columns) => {
  if (err) {
    console.error('Error getting schema:', err);
  } else {
    console.log('\nFeeStructures table columns:');
    columns.forEach(col => {
      console.log(`- ${col.name} (${col.type})`);
    });
  }

  // Now query the actual data with correct column names
  const dataQuery = `
    SELECT * FROM feeStructures 
    WHERE (type LIKE '%subscription%' OR type LIKE '%standard%' OR type LIKE '%professional%')
    OR (description LIKE '%subscription%' OR description LIKE '%standard%' OR description LIKE '%professional%')
    ORDER BY id
    LIMIT 10
  `;

  db.all(dataQuery, [], (err, rows) => {
    if (err) {
      console.error('Error checking feeStructures data:', err);
    } else {
      console.log(`\nFound ${rows.length} subscription-related fee structures:`);
      rows.forEach(row => {
        console.log(`- ID: ${row.id}, Type: ${row.type || 'No type'}, Amount: ${row.amount || 'No amount'}, Description: ${row.description || 'No description'}`);
      });
    }

    process.exit(0);
  });
});
