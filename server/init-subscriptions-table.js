#!/usr/bin/env node
/**
 * Initialize SQLite Subscriptions Table
 * Creates the subscriptions table if it doesn't exist
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const sqlDbPath = path.join(__dirname, 'data', 'lms-database.sqlite');

console.log('🔧 Initializing subscriptions table...\n');

// Connect to SQLite
const db = new sqlite3.Database(sqlDbPath, (err) => {
  if (err) {
    console.error('❌ SQLite connection error:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to SQLite:', sqlDbPath);
  createTable();
});

function createTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      superadminId TEXT UNIQUE NOT NULL,
      planType TEXT NOT NULL CHECK (planType IN ('free', 'standard', 'professional')),
      planName TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
      startDate DATETIME NOT NULL,
      expiryDate DATETIME NOT NULL,
      durationDays INTEGER DEFAULT 30,
      paymentId TEXT,
      amount REAL DEFAULT 0,
      currency TEXT DEFAULT 'INR',
      paymentMethod TEXT,
      isFreeTrial BOOLEAN DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.run(sql, (err) => {
    if (err) {
      console.error('❌ Error creating table:', err.message);
      db.close();
      process.exit(1);
    } else {
      console.log('✅ Subscriptions table created successfully');
      
      // Verify table was created
      db.all(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND name='subscriptions'",
        [],
        (err, rows) => {
          if (err || !rows || rows.length === 0) {
            console.error('❌ Failed to verify table creation');
            process.exit(1);
          }

          // Get table info
          db.all("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'subscriptions)", [], (err, columns) => {
            if (err) {
              console.error('❌ Error getting table info:', err.message);
              process.exit(1);
            }

            console.log('\n📋 Subscriptions table structure:');
            columns.forEach(col => {
              console.log(`   - ${col.name}: ${col.type}`);
            });

            console.log('\n✨ Initialization complete!');
            db.close((err) => {
              if (err) console.error('Error closing database:', err);
              process.exit(0);
            });
          });
        }
      );
    }
  });
}
