const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

// Connect to SQLite database
const db = new sqlite3.Database('./lms_database.db', async (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  
  console.log('Connected to SQLite database');
  
  try {
    // Hash the password 12345678
    const correctPassword = '12345678';
    const hashedPassword = await bcrypt.hash(correctPassword, 10);
    
    console.log('Updating all users with password: 12345678');
    
    // Update all demo users to have the correct password
    const demoUsers = [
      'admin@gmail.com',
      'mentor@gmail.com', 
      'student@gmail.com',
      'accountant@demo.com',
      'storekeeper@demo.com'
    ];
    
    for (const email of demoUsers) {
      db.run(
        'UPDATE users SET password = ? WHERE email = ?',
        [hashedPassword, email],
        function(err) {
          if (err) {
            console.error(`Error updating ${email}:`, err);
          } else {
            console.log(`✅ Updated ${email} - Changes: ${this.changes}`);
          }
        }
      );
    }
    
    // Wait a bit for updates to complete, then verify
    setTimeout(() => {
      console.log('\nVerifying passwords...');
      
      for (const email of demoUsers) {
        db.get(
          'SELECT password FROM users WHERE email = ?',
          [email],
          async (err, row) => {
            if (err) {
              console.error(`Error fetching ${email}:`, err);
              return;
            }
            
            if (row) {
              const isMatch = await bcrypt.compare('12345678', row.password);
              console.log(`${email}:`, isMatch ? '✅ OK' : '❌ FAIL');
            } else {
              console.log(`${email}: ❌ NOT FOUND`);
            }
          }
        );
      }
      
      setTimeout(() => {
        console.log('\n✅ All passwords have been reset to: 12345678');
        db.close();
      }, 1000);
    }, 1000);
    
  } catch (err) {
    console.error('Error:', err.message);
    db.close();
  }
});
