const db = require('./config/database-switch');

console.log('=== Checking Upgrade Result ===');

// Check the most recent subscription for superadmin-69
const query = `
  SELECT * FROM subscriptions 
  WHERE superadminId = 'superadmin-69'
  ORDER BY createdAt DESC
  LIMIT 1
`;

db.get(query, [], (err, row) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Subscription for superadmin-69:', row ? {
      id: row.id,
      superadminId: row.superadminId,
      planName: row.planName,
      status: row.status,
      createdAt: row.createdAt,
      expiryDate: row.expiryDate
    } : 'None found');
  }
  
  // Also check if there's a subscription with just '69'
  const query2 = `
    SELECT * FROM subscriptions 
    WHERE superadminId = '69'
    ORDER BY createdAt DESC
    LIMIT 1
  `;
  
  db.get(query2, [], (err, row2) => {
    if (err) {
      console.error('Error:', err);
    } else {
      console.log('Subscription for 69:', row2 ? {
        id: row2.id,
        superadminId: row2.superadminId,
        planName: row2.planName,
        status: row2.status,
        createdAt: row2.createdAt,
        expiryDate: row2.expiryDate
      } : 'None found');
    }
    
    process.exit(0);
  });
});
