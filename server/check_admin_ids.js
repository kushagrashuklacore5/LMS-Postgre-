const db = require('./config/database-switch');

async function checkAdminIds() {
  console.log('🔍 Checking adminId values in universities...\n');
  
  try {
    const universities = await new Promise((resolve, reject) => {
      db.all('SELECT id, name, adminId, subscriptionPlan FROM universities ORDER BY id', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('📊 Universities and their adminId values:');
    universities.forEach((uni, index) => {
      console.log(`${index + 1}. ${uni.name} - ID: ${uni.id} - adminId: ${uni.adminId} - Plan: ${uni.subscriptionPlan || 'Free'}`);
    });
    
    // Check users as well
    const users = await new Promise((resolve, reject) => {
      db.all('SELECT id, name, university_id, subscriptionPlan FROM users ORDER BY id', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('\n👥 Users and their university_id values:');
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} - ID: ${user.id} - University ID: ${user.university_id} - Plan: ${user.subscriptionPlan || 'Free'}`);
    });
    
    console.log('\n🎯 Analysis:');
    console.log('The triggerImmediatePropagation function extracts adminId: 1 from superadmin-1');
    console.log('But the universities might have different adminId values.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkAdminIds();
