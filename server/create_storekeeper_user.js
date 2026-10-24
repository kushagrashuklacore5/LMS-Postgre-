const db = require('./config/database-switch');
const bcrypt = require('bcryptjs');

async function createStorekeeperUser() {
  console.log('🏪 Creating Storekeeper User...\n');
  
  try {
    // Get Abhishek's university ID
    db.get("SELECT id, name, university_id FROM users WHERE email = ?", ['abhishek@core5.co.in'], (err, abhishek) => {
      if (err) {
        console.error('❌ Error finding Abhishek:', err);
        return;
      }
      
      if (!abhishek) {
        console.log('❌ Abhishek not found');
        return;
      }
      
      console.log('👨‍💻 Abhishek found:');
      console.log(`   - ID: ${abhishek.id}`);
      console.log(`   - University: ${abhishek.university_id}`);
      
      // Check if storekeeper already exists
      db.get("SELECT id, name, email FROM users WHERE email = ?", ['storekeeper@core5.co.in'], (err, existingUser) => {
        if (err) {
          console.error('❌ Error checking existing user:', err);
          return;
        }
        
        if (existingUser) {
          console.log('ℹ️ Storekeeper user already exists:');
          console.log(`   - Name: ${existingUser.name}`);
          console.log(`   - Email: ${existingUser.email}`);
          console.log(`   - ID: ${existingUser.id}`);
          return;
        }
        
        // Create storekeeper user
        const storekeeperData = {
          name: 'Store Keeper',
          email: 'storekeeper@core5.co.in',
          password: 'storekeeper123',
          role: 'storekeeper',
          university_id: abhishek.university_id,
          created_by: abhishek.id,
          isApproved: 1
        };
        
        console.log('\n🔧 Creating Storekeeper User...');
        console.log(`   - Name: ${storekeeperData.name}`);
        console.log(`   - Email: ${storekeeperData.email}`);
        console.log(`   - Role: ${storekeeperData.role}`);
        console.log(`   - University: ${storekeeperData.university_id}`);
        console.log(`   - Created By: Abhishek (ID: ${abhishek.id})`);
        console.log(`   - Password: ${storekeeperData.password}`);
        
        // Hash password
        bcrypt.hash(storekeeperData.password, 10, (err, hashedPassword) => {
          if (err) {
            console.error('❌ Error hashing password:', err);
            return;
          }
          
          // Insert storekeeper user
          db.run(`
            INSERT INTO users (name, email, password, role, university_id, created_by, isApproved, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          `, [
            storekeeperData.name,
            storekeeperData.email,
            hashedPassword,
            storekeeperData.role,
            storekeeperData.university_id,
            storekeeperData.created_by,
            storekeeperData.isApproved
          ], function(err) {
            if (err) {
              console.error('❌ Error creating storekeeper:', err);
              return;
            }
            
            console.log(`✅ Storekeeper user created successfully!`);
            console.log(`   - User ID: ${this.lastID}`);
            
            // Verify the creation
            db.get("SELECT id, name, email, role, created_by FROM users WHERE id = ?", [this.lastID], (err, newUser) => {
              if (err) {
                console.error('❌ Error verifying:', err);
                return;
              }
              
              console.log('\n🔍 Verification:');
              console.log(`   - Name: ${newUser.name}`);
              console.log(`   - Email: ${newUser.email}`);
              console.log(`   - Role: ${newUser.role}`);
              console.log(`   - Created By: ${newUser.created_by}`);
              
              console.log('\n🌐 STOREKEEPER LOGIN:');
              console.log(`🏪 Store Portal: http://localhost:5174/storekeeper/dashboard`);
              console.log(`🔐 Email: ${newUser.email}`);
              console.log(`🔑 Password: ${storekeeperData.password}`);
              
              console.log('\n📋 REQUIREMENT ROUTING:');
              console.log('✅ All requirements from Rishi will go to Storekeeper');
              console.log('✅ Storekeeper can view and manage all requirements');
              console.log('✅ Storekeeper can update requirement item status');
              
              // Check Rishi's requirements
              setTimeout(() => {
                db.all("SELECT id, classroomName, priority, status FROM requirements WHERE teacherId IN (SELECT id FROM users WHERE email = ?)", ['rishi@core5.co.in'], (err, requirements) => {
                  if (err) {
                    console.error('❌ Error checking Rishi requirements:', err);
                    return;
                  }
                  
                  console.log('\n📋 Rishi Current Requirements:');
                  if (requirements.length === 0) {
                    console.log('   No requirements found for Rishi');
                  } else {
                    requirements.forEach((req, index) => {
                      console.log(`   ${index + 1}. ${req.classroomName} - ${req.priority} (${req.status})`);
                    });
                  }
                  
                  console.log('\n🎯 NEXT STEPS:');
                  console.log('1. Login as Storekeeper to manage requirements');
                  console.log('2. Rishi can create new requirements');
                  console.log('3. Storekeeper will receive and manage all requirements');
                });
              }, 1000);
            });
          });
        });
      });
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

createStorekeeperUser();
