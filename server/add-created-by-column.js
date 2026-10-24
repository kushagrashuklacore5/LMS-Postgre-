const db = require('./config/database-switch');

console.log('=== ADDING CREATED_BY COLUMN TO USERS TABLE ===');

async function addCreatedByColumn() {
  try {
    console.log('1. Checking if created_by column exists...');
    
    // Check if the column already exists
    db.all(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users)`, [], (err, columns) => {
      if (err) {
        console.error('Error checking table structure:', err);
        return;
      }
      
      const hasCreatedByColumn = columns.some(col => col.name === 'created_by');
      
      if (hasCreatedByColumn) {
        console.log('✅ created_by column already exists');
        updateExistingUsers();
        return;
      }
      
      console.log('2. Adding created_by column to users table...');
      
      // Add the created_by column
      db.run(`ALTER TABLE users ADD COLUMN created_by INTEGER`, function(err) {
        if (err) {
          if (err.message.includes('duplicate column name')) {
            console.log('✅ created_by column already exists');
            updateExistingUsers();
            return;
          }
          console.error('Error adding created_by column:', err);
          return;
        }
        
        console.log('✅ created_by column added successfully');
        updateExistingUsers();
      });
    });
    
    function updateExistingUsers() {
      console.log('\n3. Updating existing users with created_by information...');
      
      // Get all users
      db.all(`
        SELECT id, name, email, role, university_id 
        FROM users 
        ORDER BY id
      `, [], (err, users) => {
        if (err) {
          console.error('Error fetching users:', err);
          return;
        }
        
        console.log(`Found ${users.length} users to update`);
        
        let updatedCount = 0;
        let totalUpdates = users.length;
        
        users.forEach(user => {
          let createdBy = null;
          
          // Set created_by based on user role and university
          if (user.role === 'superadmin') {
            // SuperAdmins are created by system (null) or Portal Admin
            createdBy = null;
          } else if (user.role === 'portal_admin') {
            // Portal Admins are created by system
            createdBy = null;
          } else if (user.university_id !== null) {
            // Regular users - find the SuperAdmin for their university
            db.get(`
              SELECT id FROM users 
              WHERE role = 'superadmin' AND university_id = ?
              LIMIT 1
            `, [user.university_id], (err, superAdmin) => {
              if (err) {
                console.error(`Error finding SuperAdmin for user ${user.id}:`, err);
                return;
              }
              
              createdBy = superAdmin ? superAdmin.id : null;
              
              // Update the user
              db.run(`
                UPDATE users 
                SET created_by = ? 
                WHERE id = ?
              `, [createdBy, user.id], function(err) {
                if (err) {
                  console.error(`Error updating user ${user.id}:`, err);
                  return;
                }
                
                updatedCount++;
                console.log(`✅ Updated ${user.name} (${user.email}) - created_by: ${createdBy || 'system'}`);
                
                if (updatedCount === totalUpdates) {
                  console.log('\n✅ All users updated successfully!');
                  showFinalStatus();
                }
              });
            });
          } else {
            // Users without university - created by system
            createdBy = null;
            
            db.run(`
              UPDATE users 
              SET created_by = ? 
              WHERE id = ?
            `, [createdBy, user.id], function(err) {
              if (err) {
                console.error(`Error updating user ${user.id}:`, err);
                return;
              }
              
              updatedCount++;
              console.log(`✅ Updated ${user.name} (${user.email}) - created_by: ${createdBy || 'system'}`);
              
              if (updatedCount === totalUpdates) {
                console.log('\n✅ All users updated successfully!');
                showFinalStatus();
              }
            });
          }
        });
        
        if (totalUpdates === 0) {
          console.log('No users to update');
          showFinalStatus();
        }
      });
    }
    
    function showFinalStatus() {
      console.log('\n=== FINAL STATUS ===');
      
      // Show user distribution by created_by
      db.all(`
        SELECT 
          u.id,
          u.name,
          u.email,
          u.role,
          u.university_id,
          u.created_by,
          creator.name as creator_name
        FROM users u
        LEFT JOIN users creator ON u.created_by = creator.id
        ORDER BY u.created_by, u.role, u.name
      `, [], (err, users) => {
        if (err) {
          console.error('Error fetching final user data:', err);
          return;
        }
        
        console.log('\n📊 USER DISTRIBUTION BY CREATOR:');
        console.log('=====================================');
        
        const usersByCreator = {};
        users.forEach(user => {
          const creatorId = user.created_by || 'system';
          if (!usersByCreator[creatorId]) {
            usersByCreator[creatorId] = [];
          }
          usersByCreator[creatorId].push(user);
        });
        
        Object.keys(usersByCreator).forEach(creatorId => {
          const creatorUsers = usersByCreator[creatorId];
          const creatorName = creatorId === 'system' ? 'System' : 
                            creatorUsers[0]?.creator_name || `Unknown (${creatorId})`;
          
          console.log(`\n👤 Created by: ${creatorName} (${creatorId})`);
          creatorUsers.forEach(user => {
            console.log(`  - ${user.name} (${user.email}) - Role: ${user.role}, Uni: ${user.university_id || 'None'}`);
          });
        });
        
        console.log('\n✅ CREATED_BY COLUMN IMPLEMENTATION COMPLETED!');
        console.log('✅ Each user now has a created_by field');
        console.log('✅ Ready for SuperAdmin-specific user filtering');
        
        process.exit(0);
      });
    }
    
  } catch (error) {
    console.error('Error adding created_by column:', error);
    process.exit(1);
  }
}

addCreatedByColumn();
