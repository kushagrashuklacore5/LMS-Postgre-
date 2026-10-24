const db = require('./config/database-switch');

// Create superadmins table for SQLite
const createSuperadminsTable = () => {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS superadmins (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || lower(hex(randomblob(2))) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6)))),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      db_name TEXT UNIQUE NOT NULL,
      db_host TEXT NOT NULL,
      db_port INTEGER NOT NULL,
      db_user TEXT NOT NULL,
      db_password TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.run(createTableSQL, (err) => {
    if (err) {
      console.error('Error creating superadmins table:', err);
    } else {
      console.log('✅ Superadmins table created successfully');
      
      // Create indexes
      db.run('CREATE INDEX IF NOT EXISTS idx_superadmins_email ON superadmins(email)', (err) => {
        if (err) console.error('Error creating email index:', err);
        else console.log('✅ Email index created');
      });
      
      db.run('CREATE INDEX IF NOT EXISTS idx_superadmins_status ON superadmins(status)', (err) => {
        if (err) console.error('Error creating status index:', err);
        else console.log('✅ Status index created');
      });
      
      // Insert sample superadmin for testing
      const bcrypt = require('bcryptjs');
      const hashedPassword = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6ukx.LFvOe'; // 'admin123'
      
      db.run(`
        INSERT OR IGNORE INTO superadmins (email, password_hash, db_name, db_host, db_port, db_user, db_password)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        'superadmin@test.com',
        hashedPassword,
        'lms_tenant_demo',
        'localhost',
        5432,
        'postgres',
        'postgres'
      ], (err) => {
        if (err) console.error('Error inserting sample superadmin:', err);
        else console.log('✅ Sample superadmin inserted');
      });
    }
  });
};

createSuperadminsTable();
