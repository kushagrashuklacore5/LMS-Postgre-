const db = require('config/database-switch');

console.log('=== CHECKING SUBSCRIPTION TABLE ===');
db.all('SELECT * FROM subscriptions ORDER BY createdAt DESC', (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Total subscriptions:', rows.length);
    rows.forEach(row => {
      console.log(`ID: ${row.id}, SuperAdmin: ${row.superadminId}, Plan: ${row.planName} (${row.planType}), Status: ${row.status}, Expires: ${row.expiryDate}`);
    });
  }
  
  console.log('\n=== CHECKING USERS TABLE SUBSCRIPTION PLANS ===');
  db.all('SELECT id, name, email, role, subscriptionPlan, university_id FROM users WHERE role IN ("superadmin", "admin", "mentor", "student") LIMIT 10', (err2, rows2) => {
    if (err2) {
      console.error('Error:', err2);
    } else {
      rows2.forEach(row => {
        console.log(`User: ${row.name} (${row.role}), Plan: ${row.subscriptionPlan}, University: ${row.university_id}`);
      });
    }
    
    console.log('\n=== CHECKING UNIVERSITIES TABLE ===');
    db.all('SELECT id, name, adminId, subscriptionPlan FROM universities', (err3, rows3) => {
      if (err3) {
        console.error('Error:', err3);
      } else {
        rows3.forEach(row => {
          console.log(`University: ${row.name}, Admin: ${row.adminId}, Plan: ${row.subscriptionPlan}`);
        });
      }
      
      console.log('\n=== CHECKING CURRENT TIME ===');
      console.log('Current server time:', new Date().toISOString());
      
      process.exit(0);
    });
  });
});
