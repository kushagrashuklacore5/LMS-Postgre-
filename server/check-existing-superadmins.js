const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const MAIN_DB_PATH = path.join(__dirname, 'data', 'lms-main.sqlite');

console.log('🔍 Checking Your Existing SuperAdmins');
console.log('===================================\n');

const db = new sqlite3.Database(MAIN_DB_PATH);

db.all('SELECT id, name, email, role, created_at FROM users WHERE role = "superadmin" ORDER BY id', [], (err, superadmins) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  console.log(`Found ${superadmins.length} superadmins in main database:`);
  superadmins.forEach(sa => {
    console.log(`  - ID: ${sa.id}, Name: ${sa.name}, Email: ${sa.email}`);
  });
  
  console.log('\n🔍 Checking if tenant databases exist for your superadmins...');
  
  const TENANT_DB_DIR = path.join(__dirname, 'data', 'tenants');
  let existingTenants = 0;
  let missingTenants = 0;
  
  superadmins.forEach(sa => {
    const tenantPath = path.join(TENANT_DB_DIR, `tenant_${sa.id}.sqlite`);
    if (fs.existsSync(tenantPath)) {
      console.log(`  ✅ Tenant database exists for SuperAdmin ${sa.id} (${sa.email})`);
      existingTenants++;
    } else {
      console.log(`  ❌ Missing tenant database for SuperAdmin ${sa.id} (${sa.email})`);
      missingTenants++;
    }
  });
  
  console.log(`\n📊 Summary: ${existingTenants} existing, ${missingTenants} missing`);
  
  if (missingTenants > 0) {
    console.log('\n⚠️  Some tenant databases are missing. Creating them now...');
    createMissingTenantDatabases(superadmins.filter(sa => {
      const tenantPath = path.join(TENANT_DB_DIR, `tenant_${sa.id}.sqlite`);
      return !fs.existsSync(tenantPath);
    }));
  } else {
    console.log('\n✅ All tenant databases exist! Your isolation is ready.');
    console.log('\n🔧 To test the isolation:');
    console.log('1. Start the server');
    console.log('2. Login as different superadmins');
    console.log('3. Create users - they will be isolated to each superadmin');
    
    db.close();
  }
});

function createMissingTenantDatabases(missingSuperadmins) {
  console.log(`\n🏗️ Creating ${missingSuperadmins.length} missing tenant databases...`);
  
  let completed = 0;
  
  missingSuperadmins.forEach(superadmin => {
    const tenantDbPath = path.join(__dirname, 'data', 'tenants', `tenant_${superadmin.id}.sqlite`);
    const tenantDb = new sqlite3.Database(tenantDbPath);
    
    console.log(`\n🏗️ Creating database for SuperAdmin: ${superadmin.name} (${superadmin.email})`);
    
    tenantDb.serialize(() => {
      // Create universities table
      tenantDb.run(`
        CREATE TABLE universities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          address TEXT,
          established_year INTEGER,
          type TEXT,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create users table (with superadmin_id)
      tenantDb.run(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT NOT NULL,
          university_id INTEGER DEFAULT 1,
          superadmin_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          status TEXT DEFAULT 'active',
          FOREIGN KEY (university_id) REFERENCES universities(id)
        )
      `);
      
      // Create other tables
      const tables = [
        `CREATE TABLE students (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER UNIQUE NOT NULL,
          roll_number TEXT UNIQUE,
          enrollment_date DATE,
          semester INTEGER DEFAULT 1,
          section TEXT,
          batch TEXT,
          academic_year TEXT,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )`,
        `CREATE TABLE teachers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER UNIQUE NOT NULL,
          employee_id TEXT UNIQUE,
          department TEXT,
          designation TEXT,
          specialization TEXT,
          experience_years INTEGER DEFAULT 0,
          joining_date DATE,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )`,
        `CREATE TABLE classrooms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          capacity INTEGER DEFAULT 30,
          building TEXT,
          floor TEXT,
          room_number TEXT,
          university_id INTEGER DEFAULT 1,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (university_id) REFERENCES universities(id)
        )`,
        `CREATE TABLE courses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          code TEXT UNIQUE NOT NULL,
          description TEXT,
          credits INTEGER DEFAULT 3,
          duration_weeks INTEGER DEFAULT 16,
          university_id INTEGER DEFAULT 1,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (university_id) REFERENCES universities(id)
        )`,
        `CREATE TABLE feeStructures (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          amount DECIMAL(10,2) NOT NULL,
          type TEXT NOT NULL,
          frequency TEXT DEFAULT 'monthly',
          university_id INTEGER DEFAULT 1,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (university_id) REFERENCES universities(id)
        )`,
        `CREATE TABLE vendors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          address TEXT,
          category TEXT,
          rating REAL DEFAULT 0,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE inventory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          quantity INTEGER DEFAULT 0,
          unit TEXT,
          vendorId INTEGER,
          price DECIMAL(10,2),
          status TEXT DEFAULT 'active',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (vendorId) REFERENCES vendors(id)
        )`
      ];
      
      let tablesCreated = 0;
      tables.forEach(sql => {
        tenantDb.run(sql, (err) => {
          if (err) console.error('Error creating table:', err);
          tablesCreated++;
          if (tablesCreated === tables.length) {
            // Insert default university
            tenantDb.run(`
              INSERT INTO universities (name, email, status)
              VALUES (?, ?, 'active')
            `, [`${superadmin.name}'s University`, superadmin.email], (err) => {
              if (err) {
                console.error('Error inserting default university:', err);
              } else {
                console.log(`  ✅ Database created for SuperAdmin ${superadmin.id}`);
              }
              
              completed++;
              if (completed === missingSuperadmins.length) {
                console.log('\n🎉 All missing tenant databases created!');
                console.log('\n✅ Your existing superadmins now have complete database isolation!');
                console.log('\n🔧 To test:');
                console.log('1. Start the server');
                console.log('2. Login as your existing superadmins');
                console.log('3. Create users - they will be isolated to each superadmin');
                console.log('4. Each superadmin will only see their own users');
                
                // Show superadmin credentials
                console.log('\n🔑 Your Existing SuperAdmins:');
                missingSuperadmins.forEach(sa => {
                  console.log(`  - ${sa.name}: ${sa.email}`);
                });
              }
            });
          }
        });
      });
    });
  });
}
