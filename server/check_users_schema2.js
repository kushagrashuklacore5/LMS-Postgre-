const db = require('./config/database-switch');

async function checkUsersSchema() {
  console.log('🔍 Checking Users Table Schema...\n');
  
  try {
    // Check users table schema
    db.all("PRAGMA table_info(users)", (err, columns) => {
      if (err) {
        console.error('❌ Error checking schema:', err);
        return;
      }
      
      console.log('📋 Users Table Schema:');
      columns.forEach(col => {
        console.log(`   - ${col.name}: ${col.type} (${col.notNull ? 'NOT NULL' : 'NULL'})`);
      });
      
      // Check if created_by column exists
      const hasCreatedBy = columns.some(col => col.name === 'created_by');
      
      if (!hasCreatedBy) {
        console.log('\n🔧 ADDING created_by COLUMN...');
        db.run("ALTER TABLE users ADD COLUMN created_by INTEGER", (err) => {
          if (err) {
            console.error('❌ Error adding created_by column:', err);
          } else {
            console.log('✅ created_by column added successfully');
            
            // Now update the hierarchy
            updateHierarchy();
          }
        });
      } else {
        console.log('\n✅ created_by column already exists');
        updateHierarchy();
      }
    });
    
  } catch (error) {
    console.error('❌ Database error:', error);
  }
}

function updateHierarchy() {
  console.log('\n🔧 UPDATING USER HIERARCHY...');
  
  // Get all users
  db.all("SELECT id, name, email, role, university_id FROM users", (err, users) => {
    if (err) {
      console.error('❌ Error fetching users:', err);
      return;
    }
    
    const abhishek = users.find(u => u.email === 'abhishek@core5.co.in');
    const rishi = users.find(u => u.email === 'rishi@core5.co.in');
    const rashmi = users.find(u => u.email === 'rashmi.shetty@core5.co.in');
    
    console.log('📋 Current Users:');
    users.forEach(user => {
      console.log(`   - ${user.name} (${user.email}) - ID: ${user.id}`);
    });
    
    if (abhishek) {
      console.log('\n👨‍💻 Setting Abhishek as top-level admin...');
      db.run("UPDATE users SET created_by = NULL WHERE id = ?", [abhishek.id], (err) => {
        if (err) {
          console.error('❌ Error updating Abhishek:', err);
        } else {
          console.log('✅ Abhishek set as top-level admin');
        }
      });
    }
    
    if (rishi && abhishek) {
      console.log('\n👨‍🏫 Setting Rishi under Abhishek...');
      db.run("UPDATE users SET created_by = ? WHERE id = ?", [abhishek.id, rishi.id], (err) => {
        if (err) {
          console.error('❌ Error updating Rishi:', err);
        } else {
          console.log('✅ Rishi set under Abhishek');
        }
      });
    }
    
    if (rashmi && abhishek) {
      console.log('\n👩‍🎓 Setting Rashmi under Abhishek...');
      db.run("UPDATE users SET created_by = ? WHERE id = ?", [abhishek.id, rashmi.id], (err) => {
        if (err) {
          console.error('❌ Error updating Rashmi:', err);
        } else {
          console.log('✅ Rashmi set under Abhishek');
        }
      });
    }
    
    // Verify the hierarchy
    setTimeout(() => {
      console.log('\n🔍 VERIFYING HIERARCHY...');
      db.all("SELECT id, name, email, created_by FROM users", (err, users) => {
        if (err) {
          console.error('❌ Error verifying hierarchy:', err);
          return;
        }
        
        console.log('📋 Updated Hierarchy:');
        users.forEach(user => {
          const creator = user.created_by ? users.find(u => u.id === user.created_by) : null;
          console.log(`   - ${user.name} (${user.email})`);
          console.log(`     Created By: ${creator ? creator.name : 'Self'}`);
          console.log('');
        });
      });
    }, 1000);
  });
}

checkUsersSchema();
