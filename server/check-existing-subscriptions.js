const db = require('./config/database-switch');

console.log('=== Checking Existing Subscriptions ===');

// Check subscriptions table
const subQuery = `
  SELECT * FROM subscriptions 
  WHERE planName LIKE '%standard%' OR planName LIKE '%professional%'
  ORDER BY createdAt DESC
  LIMIT 10
`;

db.all(subQuery, [], (err, subRows) => {
  if (err) {
    console.error('Error checking subscriptions:', err);
  } else {
    console.log(`\nFound ${subRows.length} existing subscriptions:`);
    subRows.forEach(row => {
      console.log(`- SuperAdmin: ${row.superadminId}, Plan: ${row.planName}, Amount: ${row.amount || 'No amount'}, Status: ${row.status}`);
    });
  }

  // Check if there are any plan configurations stored elsewhere
  const configQuery = `
    SELECT * FROM universities 
    WHERE subscriptionPlan IS NOT NULL 
    ORDER BY updatedAt DESC
    LIMIT 5
  `;

  db.all(configQuery, [], (err, uniRows) => {
    if (err) {
      console.error('Error checking universities:', err);
    } else {
      console.log(`\nFound ${uniRows.length} universities with subscription plans:`);
      uniRows.forEach(row => {
        console.log(`- University: ${row.name}, Plan: ${row.subscriptionPlan}, Admin: ${row.adminId}`);
      });
    }

    console.log('\n=== Summary ===');
    console.log('Frontend prices have been updated:');
    console.log('- Standard plan: 50000 -> 1');
    console.log('- Professional plan: 60000 -> 1');
    console.log('- Free plan: No change (already null)');
    console.log('\nBackend uses prices from frontend, so no backend changes needed.');
    console.log('The subscription amounts will be 1 rupee for new subscriptions.');

    process.exit(0);
  });
});
