const db = require('./config/database-switch');

async function checkUserHierarchy() {
  console.log('🔍 Checking User Hierarchy...\n');
  
  try {
    // Check all users
    db.all("SELECT id, name, email, role, university_id, created_by, created_at FROM users ORDER BY created_at", (err, users) => {
      if (err) {
        console.error('❌ Error fetching users:', err);
        return;
      }
      
      console.log('📋 All Users:');
      users.forEach(user => {
        console.log(`   - ${user.name} (${user.email})`);
        console.log(`     ID: ${user.id}, Role: ${user.role}`);
        console.log(`     University: ${user.university_id}`);
        console.log(`     Created By: ${user.created_by || 'NULL'}`);
        console.log(`     Created At: ${user.created_at}`);
        console.log('');
      });
      
      // Check specific users
      const abhishek = users.find(u => u.email === 'abhishek@core5.co.in');
      const rishi = users.find(u => u.email === 'rishi@core5.co.in');
      const rashmi = users.find(u => u.email === 'rashmi.shetty@core5.co.in');
      
      console.log('🎯 HIERARCHY ANALYSIS:');
      console.log('👨‍💻 Abhishek (Admin):');
      if (abhishek) {
        console.log(`   - ID: ${abhishek.id}`);
        console.log(`   - Created By: ${abhishek.created_by || 'Self'}`);
        console.log(`   - Should be top-level admin`);
      }
      
      console.log('\n👨‍🏫 Rishi (Mentor):');
      if (rishi) {
        console.log(`   - ID: ${rishi.id}`);
        console.log(`   - Created By: ${rishi.created_by || 'Self'}`);
        console.log(`   - Should be created by Abhishek (${rishi.created_by === abhishek?.id ? '✅' : '❌'})`);
      }
      
      console.log('\n👩‍🎓 Rashmi (Student):');
      if (rashmi) {
        console.log(`   - ID: ${rashmi.id}`);
        console.log(`   - Created By: ${rashmi.created_by || 'Self'}`);
        console.log(`   - Should be created by Abhishek (${rashmi.created_by === abhishek?.id ? '✅' : '❌'})`);
      }
      
      // Fix hierarchy if needed
      if (rishi && rishi.created_by !== abhishek?.id) {
        console.log('\n🔧 FIXING RISHI HIERARCHY...');
        db.run("UPDATE users SET created_by = ? WHERE email = ?", [abhishek.id, 'rishi@core5.co.in'], (err) => {
          if (err) {
            console.error('❌ Error updating Rishi:', err);
          } else {
            console.log('✅ Rishi hierarchy updated');
          }
        });
      }
      
      if (rashmi && rashmi.created_by !== abhishek?.id) {
        console.log('\n🔧 FIXING RASHMI HIERARCHY...');
        db.run("UPDATE users SET created_by = ? WHERE email = ?", [abhishek.id, 'rashmi.shetty@core5.co.in'], (err) => {
          if (err) {
            console.error('❌ Error updating Rashmi:', err);
          } else {
            console.log('✅ Rashmi hierarchy updated');
          }
        });
      }
      
      // Check universities
      db.all("SELECT id, name FROM universities", (err, universities) => {
        if (err) {
          console.error('❌ Error fetching universities:', err);
          return;
        }
        
        console.log('\n🏛️ Universities:');
        universities.forEach(uni => {
          console.log(`   - ${uni.name} (ID: ${uni.id})`);
        });
        
        // Ensure all users are in the same university
        const targetUniversityId = universities[0]?.id;
        if (targetUniversityId) {
          console.log('\n🔧 ENSURING ALL USERS IN SAME UNIVERSITY...');
          
          users.forEach(user => {
            if (user.university_id !== targetUniversityId) {
              db.run("UPDATE users SET university_id = ? WHERE id = ?", [targetUniversityId, user.id], (err) => {
                if (err) {
                  console.error(`❌ Error updating ${user.name}:`, err);
                } else {
                  console.log(`✅ ${user.name} moved to university ${targetUniversityId}`);
                }
              });
            }
          });
        }
      });
    });
    
  } catch (error) {
    console.error('❌ Database error:', error);
  }
}

checkUserHierarchy();
