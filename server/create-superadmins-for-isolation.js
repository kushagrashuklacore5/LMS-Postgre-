const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const MAIN_DB_PATH = path.join(__dirname, 'data', 'lms-main.sqlite');

console.log('👥 Creating SuperAdmins for Database Isolation');
console.log('=============================================\n');

// Create main database and superadmins
function createSuperadmins() {
  return new Promise((resolve, reject) => {
    // Ensure data directory exists
    const dataDir = path.dirname(MAIN_DB_PATH);
    if (!require('fs').existsSync(dataDir)) {
      require('fs').mkdirSync(dataDir, { recursive: true });
    }

    const db = new sqlite3.Database(MAIN_DB_PATH);
    
    console.log('📋 Creating main database and superadmins...');
    
    db.serialize(() => {
      // Create users table for superadmins
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME,
          status TEXT DEFAULT 'active',
          database_id TEXT UNIQUE
        )
      `, (err) => {
        if (err) {
          console.error('Error creating users table:', err);
          reject(err);
        } else {
          console.log('✅ Users table created');
        }
      });

      // Superadmin accounts to create
      const superadmins = [
        {
          name: 'Main SuperAdmin',
          email: 'superadmin@lms.com',
          password: 'Admin@123',
          role: 'superadmin'
        },
        {
          name: 'Test SuperAdmin 1',
          email: 'test1@lms.com',
          password: 'Test@123',
          role: 'superadmin'
        },
        {
          name: 'Test SuperAdmin 2',
          email: 'test2@lms.com',
          password: 'Test@123',
          role: 'superadmin'
        }
      ];

      let created = 0;
      let errors = [];

      superadmins.forEach(async (superadmin) => {
        try {
          const hashedPassword = await bcrypt.hash(superadmin.password, 10);
          
          db.run(`
            INSERT OR IGNORE INTO users (name, email, password, role, status)
            VALUES (?, ?, ?, ?, 'active')
          `, [superadmin.name, superadmin.email, hashedPassword, superadmin.role], function(err) {
            if (err) {
              console.error(`Error creating superadmin ${superadmin.email}:`, err);
              errors.push(err);
            } else if (this.changes > 0) {
              console.log(`✅ Created superadmin: ${superadmin.name} (${superadmin.email}) - ID: ${this.lastID}`);
            } else {
              console.log(`ℹ️ Superadmin already exists: ${superadmin.email}`);
            }
            
            created++;
            if (created === superadmins.length) {
              if (errors.length === 0) {
                console.log('\n✅ All superadmins created successfully!');
                
                // Display created superadmins
                db.all('SELECT id, name, email, role FROM users WHERE role = "superadmin"', [], (err, superadmins) => {
                  if (err) {
                    console.error('Error fetching superadmins:', err);
                  } else {
                    console.log('\n📋 Created SuperAdmins:');
                    superadmins.forEach(sa => {
                      console.log(`  - ID: ${sa.id}, Name: ${sa.name}, Email: ${sa.email}`);
                    });
                    console.log('\n🔑 Login Credentials:');
                    console.log('  SuperAdmin 1: superadmin@lms.com / Admin@123');
                    console.log('  SuperAdmin 2: test1@lms.com / Test@123');
                    console.log('  SuperAdmin 3: test2@lms.com / Test@123');
                  }
                  db.close((err) => {
                    if (err) reject(err);
                    else resolve();
                  });
                });
              } else {
                console.log('\n❌ Some errors occurred while creating superadmins');
                db.close((err) => {
                  if (err) reject(err);
                  else reject(errors);
                });
              }
            }
          });
        } catch (error) {
          console.error(`Error hashing password for ${superadmin.email}:`, error);
          errors.push(error);
          created++;
          if (created === superadmins.length) {
            if (errors.length > 0) {
              reject(errors);
            } else {
              resolve();
            }
          }
        }
      });
    });
  });
}

createSuperadmins().then(() => {
  console.log('\n🎉 SuperAdmins created successfully!');
  console.log('Now run: node config/database-isolation-fix.js');
  process.exit(0);
}).catch((error) => {
  console.error('❌ Error creating superadmins:', error);
  process.exit(1);
});
