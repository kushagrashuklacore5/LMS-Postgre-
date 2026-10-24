const db = require('./config/database-switch');
const bcrypt = require('bcryptjs');

console.log('=== SETTING PORTAL ADMIN PASSWORD ===');

const newPassword = 'Core5@2022';
const portalEmail = 'portal@core5.co.in';

// Hash the new password
bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
  if (err) {
    console.error('Error hashing password:', err);
    return;
  }
  
  console.log('New password hashed successfully');
  
  // Update the portal admin password
  db.run(`
    UPDATE users 
    SET password = ? 
    WHERE email = ? AND role = 'portal_admin'
  `, [hashedPassword, portalEmail], function(err) {
    if (err) {
      console.error('Error updating password:', err);
      return;
    }
    
    if (this.changes > 0) {
      console.log('✅ PASSWORD UPDATED SUCCESSFULLY!');
      console.log(`Email: ${portalEmail}`);
      console.log(`New Password: ${newPassword}`);
      console.log(`Role: portal_admin`);
      console.log(`Updated ${this.changes} record(s)`);
      
      // Verify the update
      db.get(`
        SELECT id, name, email, role 
        FROM users 
        WHERE email = ? AND role = 'portal_admin'
      `, [portalEmail], (err, user) => {
        if (err) {
          console.error('Error verifying update:', err);
          return;
        }
        
        if (user) {
          console.log('\n✅ VERIFICATION SUCCESSFUL:');
          console.log(`User ID: ${user.id}`);
          console.log(`Name: ${user.name}`);
          console.log(`Email: ${user.email}`);
          console.log(`Role: ${user.role}`);
          console.log(`Password: ${newPassword}`);
        } else {
          console.log('❌ VERIFICATION FAILED: User not found');
        }
        
        console.log('\n=== LOGIN DETAILS ===');
        console.log('URL: http://localhost:3000/login');
        console.log(`Email: ${portalEmail}`);
        console.log(`Password: ${newPassword}`);
        
        process.exit(0);
      });
    } else {
      console.log('❌ NO RECORDS UPDATED - User not found');
      
      // Check if user exists with different role
      db.get(`
        SELECT id, name, email, role 
        FROM users 
        WHERE email = ?
      `, [portalEmail], (err, user) => {
        if (err) {
          console.error('Error checking user:', err);
          return;
        }
        
        if (user) {
          console.log(`User found but with different role: ${user.role}`);
          console.log('Updating password anyway...');
          
          db.run(`
            UPDATE users 
            SET password = ? 
            WHERE email = ?
          `, [hashedPassword, portalEmail], function(err) {
            if (err) {
              console.error('Error updating password:', err);
              return;
            }
            
            console.log(`✅ Password updated for user ${user.name} (Role: ${user.role})`);
            console.log(`New Password: ${newPassword}`);
          });
        } else {
          console.log('❌ User not found in database');
        }
        
        process.exit(0);
      });
    }
  });
});
