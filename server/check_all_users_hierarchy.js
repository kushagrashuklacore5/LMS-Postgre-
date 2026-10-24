const db = require('./config/database-switch');

async function checkAllUsersHierarchy() {
  console.log('🔍 Checking All Users Hierarchy...\n');
  
  try {
    // Get all users with hierarchy info
    db.all(`
      SELECT u.id, u.name, u.email, u.role, u.university_id, u.created_at as createdAt, u.created_by,
             creator.name as createdByName, creator.email as createdByEmail,
             uni.name as universityName
      FROM users u
      LEFT JOIN users creator ON u.created_by = creator.id
      LEFT JOIN universities uni ON u.university_id = uni.id
      ORDER BY u.created_at ASC
    `, (err, users) => {
      if (err) {
        console.error('❌ Error fetching users:', err);
        return;
      }
      
      console.log('📋 All Users with Hierarchy:');
      users.forEach(user => {
        console.log(`📄 ${user.name} (${user.role})`);
        console.log(`   📧 Email: ${user.email}`);
        console.log(`   🏛️  University: ${user.universityName || 'Unknown'} (ID: ${user.university_id})`);
        console.log(`   👤 Created By: ${user.createdByName || 'Self'} (${user.createdByEmail || 'Self'})`);
        console.log(`   📅 Created: ${user.createdAt}`);
        console.log('');
      });
      
      // Check specific users
      const abhishek = users.find(u => u.email === 'abhishek@core5.co.in');
      const rishi = users.find(u => u.email === 'rishi@core5.co.in');
      const rashmi = users.find(u => u.email === 'rashmi.shetty@core5.co.in');
      
      console.log('🎯 SPECIFIC USERS CHECK:');
      console.log('👨‍💻 Abhishek:');
      if (abhishek) {
        console.log(`   - ID: ${abhishek.id}`);
        console.log(`   - University: ${abhishek.universityName} (ID: ${abhishek.university_id})`);
        console.log(`   - Created By: ${abhishek.createdByName || 'Self'}`);
      } else {
        console.log('   - ❌ Not found');
      }
      
      console.log('\n👨‍🏫 Rishi:');
      if (rishi) {
        console.log(`   - ID: ${rishi.id}`);
        console.log(`   - University: ${rishi.universityName} (ID: ${rishi.university_id})`);
        console.log(`   - Created By: ${rishi.createdByName || 'Self'}`);
        console.log(`   - ✅ Under Abhishek: ${rishi.created_by === abhishek?.id ? 'YES' : 'NO'}`);
      } else {
        console.log('   - ❌ Not found');
      }
      
      console.log('\n👩‍🎓 Rashmi:');
      if (rashmi) {
        console.log(`   - ID: ${rashmi.id}`);
        console.log(`   - University: ${rashmi.universityName} (ID: ${rashmi.university_id})`);
        console.log(`   - Created By: ${rashmi.createdByName || 'Self'}`);
        console.log(`   - ✅ Under Abhishek: ${rashmi.created_by === abhishek?.id ? 'YES' : 'NO'}`);
      } else {
        console.log('   - ❌ Not found');
      }
      
      // Fix university assignment if needed
      if (abhishek && rishi && rishi.university_id !== abhishek.university_id) {
        console.log('\n🔧 FIXING RISHI UNIVERSITY ASSIGNMENT...');
        db.run("UPDATE users SET university_id = ? WHERE id = ?", [abhishek.university_id, rishi.id], (err) => {
          if (err) {
            console.error('❌ Error updating Rishi university:', err);
          } else {
            console.log('✅ Rishi university updated');
          }
        });
      }
      
      if (abhishek && rashmi && rashmi.university_id !== abhishek.university_id) {
        console.log('\n🔧 FIXING RASHMI UNIVERSITY ASSIGNMENT...');
        db.run("UPDATE users SET university_id = ? WHERE id = ?", [abhishek.university_id, rashmi.id], (err) => {
          if (err) {
            console.error('❌ Error updating Rashmi university:', err);
          } else {
            console.log('✅ Rashmi university updated');
          }
        });
      }
    });
    
  } catch (error) {
    console.error('❌ Database error:', error);
  }
}

checkAllUsersHierarchy();
