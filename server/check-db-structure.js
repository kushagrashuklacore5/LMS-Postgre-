const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/lms-database.sqlite');

console.log('🔍 Checking current database structure...\n');

// Check users table structure
db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users)", (err, columns) => {
  if (err) {
    console.error('Error getting users table schema:', err);
    return;
  }
  
  console.log('📋 Users table columns:');
  columns.forEach(col => {
    console.log(`- ${col.name} (${col.type})`);
  });
  
  // Check universities table structure
  db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'universities)", (err, uniColumns) => {
    if (err) {
      console.error('Error getting universities table schema:', err);
      return;
    }
    
    console.log('\n🏢 Universities table columns:');
    uniColumns.forEach(col => {
      console.log(`- ${col.name} (${col.type})`);
    });
    
    // Check subscriptions table structure
    db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'subscriptions)", (err, subColumns) => {
      if (err) {
        console.error('Error getting subscriptions table schema:', err);
        return;
      }
      
      console.log('\n📋 Subscriptions table columns:');
      subColumns.forEach(col => {
        console.log(`- ${col.name} (${col.type})`);
      });
      
      // Check current data relationships
      console.log('\n🔍 Current Data Relationships:');
      
      // Check superadmin relationships
      db.all(`
        SELECT u.id, u.name, u.role, u.university_id, uni.name as uni_name, uni.adminId
        FROM users u
        LEFT JOIN universities uni ON u.university_id = uni.id
        WHERE u.role IN ('superadmin', 'admin')
        ORDER BY u.role, u.name
      `, (err, admins) => {
        if (err) {
          console.error('Error checking admin relationships:', err);
          return;
        }
        
        console.log('\n👑 SuperAdmins and Admins:');
        admins.forEach(admin => {
          console.log(`- ${admin.name} (${admin.role})`);
          console.log(`  User ID: ${admin.id}`);
          console.log(`  University: ${admin.uni_name} (ID: ${admin.university_id})`);
          console.log(`  University Admin ID: ${admin.adminId}`);
          console.log('');
        });
        
        // Check current subscriptions
        db.all('SELECT * FROM subscriptions', (err, subscriptions) => {
          if (err) {
            console.error('Error checking subscriptions:', err);
            return;
          }
          
          console.log('📋 Current Subscriptions:');
          subscriptions.forEach(sub => {
            console.log(`- SuperAdmin ID: ${sub.superadminId}`);
            console.log(`  Plan: ${sub.planName} (${sub.planType})`);
            console.log(`  Status: ${sub.status}`);
            console.log(`  Expiry: ${new Date(sub.expiryDate).toLocaleDateString()}`);
            console.log('');
          });
          
          db.close();
        });
      });
    });
  });
});
