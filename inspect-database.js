// Database inspection script to check user and subscription data
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'server', 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔍 Inspecting Database for Calendar Access Issue\n');

// Check users table
console.log('📋 Users in database:');
db.all('SELECT id, name, email, role, university_id FROM users', (err, users) => {
    if (err) {
        console.error('Error fetching users:', err);
        return;
    }
    
    users.forEach(user => {
        console.log(`   ID: ${user.id}, Name: ${user.name}, Role: ${user.role}, University: ${user.university_id}`);
    });
    
    // Check universities table
    console.log('\n🏛️ Universities in database:');
    db.all('SELECT id, name, adminId FROM universities', (err, universities) => {
        if (err) {
            console.error('Error fetching universities:', err);
            return;
        }
        
        universities.forEach(uni => {
            console.log(`   ID: ${uni.id}, Name: ${uni.name}, AdminID: ${uni.adminId}`);
        });
        
        // Check subscriptions table
        console.log('\n💳 Subscriptions in database:');
        db.all('SELECT superadminId, planType, planName, status, expiryDate FROM subscriptions ORDER BY createdAt DESC', (err, subscriptions) => {
            if (err) {
                console.error('Error fetching subscriptions:', err);
                return;
            }
            
            subscriptions.forEach(sub => {
                const expiry = new Date(sub.expiryDate).toLocaleDateString();
                const isExpired = new Date() > new Date(sub.expiryDate);
                console.log(`   SuperAdmin: ${sub.superadminId}, Plan: ${sub.planName} (${sub.planType}), Status: ${sub.status}, Expires: ${expiry} ${isExpired ? '(EXPIRED)' : '(ACTIVE)'}`);
            });
            
            // Check specific user "aniket2"
            console.log('\n🎯 Checking specific user "aniket2":');
            db.get('SELECT id, name, email, role, university_id FROM users WHERE name LIKE "%aniket%" OR email LIKE "%aniket%"', (err, user) => {
                if (err) {
                    console.error('Error finding aniket2:', err);
                    return;
                }
                
                if (!user) {
                    console.log('   ❌ User "aniket2" not found in database');
                    console.log('   Available users:', users.map(u => `${u.name} (${u.email})`));
                    return;
                }
                
                console.log(`   ✅ Found user: ID=${user.id}, Name=${user.name}, Role=${user.role}, University=${user.university_id}`);
                
                // Find their university and superadmin
                db.get('SELECT adminId FROM universities WHERE id = ?', [user.university_id], (err, uni) => {
                    if (err) {
                        console.error('Error finding university:', err);
                        return;
                    }
                    
                    if (!uni) {
                        console.log(`   ❌ University ${user.university_id} not found`);
                        return;
                    }
                    
                    console.log(`   🏛️ University AdminID: ${uni.adminId}`);
                    
                    // Check subscription for that superadmin
                    const superadminId = `superadmin-${uni.adminId}`;
                    db.get('SELECT planType, planName, status, expiryDate FROM subscriptions WHERE superadminId = ? ORDER BY createdAt DESC LIMIT 1', [superadminId], (err, sub) => {
                        if (err) {
                            console.error('Error finding subscription:', err);
                            return;
                        }
                        
                        if (!sub) {
                            console.log(`   ❌ No subscription found for SuperAdmin: ${superadminId}`);
                            console.log(`   📋 Available SuperAdmins:`, subscriptions.map(s => s.superadminId));
                            return;
                        }
                        
                        const isExpired = new Date() > new Date(sub.expiryDate);
                        const canAccessCalendar = !isExpired && (sub.planType === 'standard' || sub.planType === 'professional');
                        
                        console.log(`   💳 Subscription: Plan=${sub.planName} (${sub.planType}), Status=${sub.status}`);
                        console.log(`   📅 Expires: ${new Date(sub.expiryDate).toLocaleDateString()} ${isExpired ? '(EXPIRED)' : '(ACTIVE)'}`);
                        console.log(`   📅 Calendar Access: ${canAccessCalendar ? '✅ ALLOWED' : '🚫 BLOCKED'}`);
                        
                        db.close();
                    });
                });
            });
        });
    });
});
