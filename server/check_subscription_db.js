const db = require('./config/database-switch');

async function checkSubscriptionDB() {
  console.log('🔍 Checking subscription database...\n');
  
  try {
    // Check subscriptions table
    const subscriptions = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM subscriptions ORDER BY createdAt DESC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    console.log('📊 All subscriptions in database:');
    subscriptions.forEach((sub, index) => {
      console.log(`${index + 1}. ID: ${sub.id}`);
      console.log(`   SuperAdmin ID: ${sub.superadminId}`);
      console.log(`   Plan Type: ${sub.planType}`);
      console.log(`   Plan Name: ${sub.planName}`);
      console.log(`   Status: ${sub.status}`);
      console.log(`   Start Date: ${sub.startDate}`);
      console.log(`   Expiry Date: ${sub.expiryDate}`);
      console.log(`   Is Free Trial: ${sub.isFreeTrial}`);
      console.log(`   Created At: ${sub.createdAt}`);
      console.log(`   Updated At: ${sub.updatedAt}`);
      console.log('---');
    });
    
    // Check the latest subscription for superadmin-1
    const latestSub = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM subscriptions WHERE superadminId = ? ORDER BY updatedAt DESC LIMIT 1',
        ['superadmin-1'],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
    
    if (latestSub) {
      console.log('\n🎯 Latest subscription for superadmin-1:');
      console.log(`   Plan: ${latestSub.planName} (${latestSub.planType})`);
      console.log(`   Status: ${latestSub.status}`);
      console.log(`   Expires: ${latestSub.expiryDate}`);
      console.log(`   Updated: ${latestSub.updatedAt}`);
    } else {
      console.log('\n❌ No subscription found for superadmin-1');
    }
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
  }
}

checkSubscriptionDB();
