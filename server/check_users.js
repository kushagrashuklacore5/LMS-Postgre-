const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('=== Checking Available Users ===\n');

// Check all users
console.log('1. Checking all users in database...');
db.all('SELECT id, email, role, isApproved FROM users ORDER BY id', (err, users) => {
  if (err) {
    console.error('Error fetching users:', err);
    return;
  }
  
  console.log(`Found ${users.length} users:`);
  users.forEach((user, index) => {
    console.log(`\nUser ${index + 1}:`);
    console.log(`- ID: ${user.id}`);
    console.log(`- Email: ${user.email}`);
    console.log(`- Role: ${user.role}`);
    console.log(`- Is Approved: ${user.isApproved}`);
  });
  
  // Find storekeeper users
  console.log('\n2. Finding storekeeper users...');
  const storekeepers = users.filter(user => user.role === 'storekeeper');
  
  if (storekeepers.length > 0) {
    console.log(`Found ${storekeepers.length} storekeeper users:`);
    storekeepers.forEach((sk, index) => {
      console.log(`${index + 1}. ID: ${sk.id}, Email: ${sk.email}, Approved: ${sk.isApproved}`);
    });
    
    // Test with first storekeeper
    const testStorekeeper = storekeepers[0];
    console.log(`\n3. Testing with storekeeper ID: ${testStorekeeper.id}`);
    
    // Test the vendor creation with valid storekeeper
    testVendorCreationWithValidUser(testStorekeeper.id);
    
  } else {
    console.log('❌ No storekeeper users found');
    console.log('💡 You need to create a storekeeper user first');
    
    // Create a test storekeeper user
    console.log('\n4. Creating test storekeeper user...');
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync('storekeeper123', 10);
    
    db.run(
      'INSERT INTO users (email, password, role, isApproved, created_at, updated_at) VALUES (?, ?, ?, 1, datetime("now"), datetime("now"))',
      ['storekeeper@test.com', hashedPassword, 'storekeeper'],
      function(err) {
        if (err) {
          console.error('Error creating storekeeper:', err);
          return;
        }
        
        console.log(`✅ Created storekeeper user with ID: ${this.lastID}`);
        console.log('Email: storekeeper@test.com');
        console.log('Password: storekeeper123');
        
        testVendorCreationWithValidUser(this.lastID);
      }
    );
  }
});

function testVendorCreationWithValidUser(userId) {
  console.log(`\n5. Testing vendor creation with valid user ID: ${userId}`);
  
  // Get user's university_id from database
  db.get(
    'SELECT university_id FROM users WHERE id = ?',
    [userId],
    (err, user) => {
      if (err) {
        console.error('❌ Get user error:', err);
        return;
      }

      console.log('✅ User found:', user);

      if (!user) {
        console.log('❌ User still not found');
        return;
      }

      console.log('✅ User authentication test passed');
      console.log('University ID:', user.university_id);
      
      console.log('\n🎉 Issue Identified!');
      console.log('📋 Root Cause:');
      console.log('❌ The frontend is likely not authenticated properly');
      console.log('❌ Or the user ID in the request is invalid');
      console.log('❌ Or the authentication middleware is not working');
      
      console.log('\n🔧 Fix Required:');
      console.log('1. Ensure user is logged in as storekeeper');
      console.log('2. Check authentication token is valid');
      console.log('3. Verify user ID exists in database');
      console.log('4. Test with valid storekeeper credentials');
      
      console.log('\n📋 Available Storekeeper Credentials:');
      db.all('SELECT id, email FROM users WHERE role = "storekeeper"', (err, storekeepers) => {
        if (err) {
          console.error('Error:', err);
          return;
        }
        
        storekeepers.forEach(sk => {
          console.log(`- ID: ${sk.id}, Email: ${sk.email}, Password: storekeeper123`);
        });
        
        db.close((err) => {
          if (err) {
            console.error('Error closing database:', err);
          } else {
            console.log('\n✅ Database connection closed');
          }
        });
      });
    }
  );
}
