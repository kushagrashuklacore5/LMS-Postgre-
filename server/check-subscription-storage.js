const db = require('./config/database-switch');

console.log('=== Checking Subscription Storage ===');

// Check subscriptions table
const subQuery = `
  SELECT * FROM subscriptions 
  WHERE userId = 69 OR superadminId LIKE '%69%'
  ORDER BY createdAt DESC
  LIMIT 5
`;

db.all(subQuery, [], (err, subRows) => {
  if (err) {
    console.error('Error checking subscriptions:', err);
  } else {
    console.log(`\nFound ${subRows.length} subscriptions for user 69:`);
    subRows.forEach(row => {
      console.log(`- ID: ${row.id}, User: ${row.userId}, SuperAdmin: ${row.superadminId}, Plan: ${row.planName}, Status: ${row.status}, Amount: ${row.amount}`);
      console.log(`  Created: ${row.createdAt}, Expires: ${row.expiryDate}`);
    });
  }

  // Check universities table for subscriptionPlan
  const uniQuery = `
    SELECT * FROM universities 
    WHERE adminId = 69
    ORDER BY updatedAt DESC
    LIMIT 3
  `;

  db.all(uniQuery, [], (err, uniRows) => {
    if (err) {
      console.error('Error checking universities:', err);
    } else {
      console.log(`\nFound ${uniRows.length} universities for admin 69:`);
      uniRows.forEach(row => {
        console.log(`- University: ${row.name}, Plan: ${row.subscriptionPlan}, Updated: ${row.updatedAt}`);
      });
    }

    // Check users table for subscriptionPlan
    const userQuery = `
      SELECT id, email, subscriptionPlan, university_id FROM users 
      WHERE id = 69 OR university_id IN (SELECT id FROM universities WHERE adminId = 69)
      ORDER BY id
      LIMIT 5
    `;

    db.all(userQuery, [], (err, userRows) => {
      if (err) {
        console.error('Error checking users:', err);
      } else {
        console.log(`\nFound ${userRows.length} users related to admin 69:`);
        userRows.forEach(row => {
          console.log(`- User: ${row.email}, ID: ${row.id}, Plan: ${row.subscriptionPlan}, University: ${row.university_id}`);
        });
      }

      process.exit(0);
    });
  });
});
