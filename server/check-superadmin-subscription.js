#!/usr/bin/env node
/**
 * Check SuperAdmin Subscription Status
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const sqlDbPath = path.join(__dirname, 'data', 'lms-database.sqlite');

// Connect to SQLite
const db = new sqlite3.Database(sqlDbPath, (err) => {
  if (err) {
    console.error('❌ SQLite connection error:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to SQLite:', sqlDbPath);
  checkSubscriptionStatus();
});

function checkSubscriptionStatus() {
  console.log('\n🔍 Checking SuperAdmin Subscription Status...\n');
  
  // Check users with superadmin role
  db.all(
    "SELECT id, name, email, role, subscriptionPlan, university_id FROM users WHERE role = 'superadmin' OR role = 'admin' ORDER BY id",
    [],
    (err, users) => {
      if (err) {
        console.error('❌ Error fetching users:', err.message);
        return;
      }
      
      console.log('📋 Users Found:');
      users.forEach(user => {
        console.log(`   ID: ${user.id}, Name: ${user.name}, Email: ${user.email}, Role: ${user.role}, Plan: ${user.subscriptionPlan || 'None'}`);
      });
      
      // Check subscriptions table
      db.all(
        "SELECT * FROM subscriptions ORDER BY createdAt DESC",
        [],
        (err, subscriptions) => {
          if (err) {
            console.error('❌ Error fetching subscriptions:', err.message);
            return;
          }
          
          console.log('\n💳 Active Subscriptions:');
          if (subscriptions.length === 0) {
            console.log('   No subscriptions found');
          } else {
            subscriptions.forEach(sub => {
              const isExpired = new Date(sub.expiryDate) < new Date();
              const status = isExpired ? '❌ EXPIRED' : '✅ ACTIVE';
              console.log(`   SuperAdmin: ${sub.superadminId}`);
              console.log(`   Plan: ${sub.planName} (${sub.planType})`);
              console.log(`   Status: ${status}`);
              console.log(`   Start: ${new Date(sub.startDate).toLocaleDateString()}`);
              console.log(`   Expiry: ${new Date(sub.expiryDate).toLocaleDateString()}`);
              console.log(`   Amount: ₹${sub.amount/100}`);
              console.log(`   Payment ID: ${sub.paymentId}`);
              console.log('   ---');
            });
          }
          
          // Check current active subscription for each superadmin
          console.log('\n🎯 Current Status Summary:');
          users.forEach(user => {
            if (user.role === 'superadmin' || user.role === 'admin') {
              const userSub = subscriptions.find(sub => 
                sub.superadminId.includes(user.id.toString()) || 
                sub.superadminId === `superadmin-${user.id}`
              );
              
              if (userSub) {
                const isExpired = new Date(userSub.expiryDate) < new Date();
                const daysLeft = Math.ceil((new Date(userSub.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
                console.log(`   ${user.name} (${user.email}): ${isExpired ? '❌ EXPIRED' : '✅ ACTIVE'} - ${userSub.planName} (${daysLeft > 0 ? daysLeft + ' days left' : 'Expired'})`);
              } else {
                console.log(`   ${user.name} (${user.email}): ❌ NO SUBSCRIPTION`);
              }
            }
          });
          
          db.close((err) => {
            if (err) console.error('Error closing database:', err);
            process.exit(0);
          });
        }
      );
    }
  );
}
