const db = require('config/database-switch');

console.log('🔧 Setting up Internal Admin Portal database schema...');

// Check and add required columns for superadmin subscription management
const checkAndAddColumns = () => {
  // Check if expires_at column exists
  db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users)", [], (err, columns) => {
    if (err) {
      console.error('❌ Error checking table info:', err);
      return;
    }

    const columnNames = columns.map(col => col.name);
    console.log('📋 Current columns in users table:', columnNames);

    // Add expires_at column if it doesn't exist
    if (!columnNames.includes('expires_at')) {
      console.log('➕ Adding expires_at column...');
      db.run("ALTER TABLE users ADD COLUMN expires_at TEXT", (err) => {
        if (err) {
          console.error('❌ Error adding expires_at column:', err);
        } else {
          console.log('✅ expires_at column added successfully');
        }
      });
    } else {
      console.log('✅ expires_at column already exists');
    }

    // Add status column if it doesn't exist
    if (!columnNames.includes('status')) {
      console.log('➕ Adding status column...');
      db.run("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'", (err) => {
        if (err) {
          console.error('❌ Error adding status column:', err);
        } else {
          console.log('✅ status column added successfully');
        }
      });
    } else {
      console.log('✅ status column already exists');
    }

    // Add created_at column if it doesn't exist
    if (!columnNames.includes('created_at')) {
      console.log('➕ Adding created_at column...');
      db.run("ALTER TABLE users ADD COLUMN created_at TEXT", (err) => {
        if (err) {
          console.error('❌ Error adding created_at column:', err);
        } else {
          console.log('✅ created_at column added successfully');
          // Update existing records to have created_at
          db.run("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL", (err) => {
            if (err) {
              console.error('❌ Error updating created_at values:', err);
            } else {
              console.log('✅ created_at values updated for existing records');
            }
          });
        }
      });
    } else {
      console.log('✅ created_at column already exists');
    }
  });
};

// Create the portal@core5.co.in user if it doesn't exist
const createPortalUser = () => {
  const bcrypt = require('bcryptjs');
  
  db.get("SELECT * FROM users WHERE email = ?", ['portal@core5.co.in'], async (err, user) => {
    if (err) {
      console.error('❌ Error checking portal user:', err);
      return;
    }

    if (!user) {
      console.log('➕ Creating portal@core5.co.in user...');
      const hashedPassword = await bcrypt.hash('Core5@2024!', 10);
      
      db.run(
        `INSERT INTO users (name, email, password, role, isApproved, status, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['Portal Admin', 'portal@core5.co.in', hashedPassword, 'superadmin', 1, 'active', new Date().toISOString()],
        function(err) {
          if (err) {
            console.error('❌ Error creating portal user:', err);
          } else {
            console.log('✅ portal@core5.co.in user created successfully');
            console.log('🔑 Login credentials:');
            console.log('   Email: portal@core5.co.in');
            console.log('   Password: Core5@2024!');
          }
        }
      );
    } else {
      console.log('✅ portal@core5.co.in user already exists');
    }
  });
};

// Run the setup
checkAndAddColumns();
setTimeout(createPortalUser, 1000); // Wait a bit for column additions

console.log('🎯 Internal Admin Portal setup complete!');
console.log('📝 You can now login with:');
console.log('   Email: portal@core5.co.in');
console.log('   Password: Core5@2024!');
console.log('🚪 This will redirect you to: /internal-admin-portal');
