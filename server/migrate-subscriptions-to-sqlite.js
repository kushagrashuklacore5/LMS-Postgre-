#!/usr/bin/env node
/**
 * Migration Script: MongoDB/JSON Subscriptions to SQLite
 * Transfers all superadmin subscription data from MongoDB or JSON file to SQLite
 */

const sqlite3 = require('sqlite3').verbose();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Database paths
const sqlDbPath = path.join(__dirname, 'data', 'lms-database.sqlite');
const jsonStorePath = path.join(__dirname, 'data', 'subscriptions.json');

// SQLite connection
const sqlDb = new sqlite3.Database(sqlDbPath, (err) => {
  if (err) {
    console.error('❌ SQLite connection error:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to SQLite:', sqlDbPath);
});

/**
 * Read subscriptions from JSON file
 */
function readJsonSubscriptions() {
  try {
    if (fs.existsSync(jsonStorePath)) {
      const data = fs.readFileSync(jsonStorePath, 'utf8');
      return data ? JSON.parse(data) : {};
    }
  } catch (err) {
    console.warn('⚠️  Could not read JSON subscriptions:', err.message);
  }
  return {};
}

/**
 * Read subscriptions from MongoDB
 */
async function readMongoSubscriptions() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/lms-proto';
    
    // Try to connect to MongoDB with timeout
    const connectPromise = mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000
    });

    await connectPromise;
    console.log('✅ Connected to MongoDB');

    const Subscription = require('./models/Subscription');
    const subscriptions = await Subscription.find({});
    
    console.log(`📊 Found ${subscriptions.length} subscriptions in MongoDB`);
    
    // Convert MongoDB documents to plain objects
    return subscriptions.reduce((acc, sub) => {
      acc[sub.superadminId] = sub.toObject();
      return acc;
    }, {});
  } catch (err) {
    console.warn('⚠️  MongoDB connection failed:', err.message);
    return {};
  }
}

/**
 * Migrate subscriptions to SQLite
 */
async function migrateToSQLite(subscriptions) {
  return new Promise((resolve, reject) => {
    if (Object.keys(subscriptions).length === 0) {
      console.log('ℹ️  No subscriptions to migrate');
      resolve(0);
      return;
    }

    // Start transaction
    sqlDb.serialize(() => {
      sqlDb.run('BEGIN TRANSACTION');

      let migrated = 0;
      let errors = 0;

      for (const [superadminId, subscription] of Object.entries(subscriptions)) {
        const {
          planType = 'free',
          planName = 'Free',
          status = 'active',
          startDate = new Date(),
          expiryDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days default
          durationDays = 30,
          paymentId = null,
          amount = 0,
          currency = 'INR',
          paymentMethod = null,
          isFreeTrial = true
        } = subscription;

        const query = `
          INSERT OR REPLACE INTO subscriptions (
            superadminId, planType, planName, status, startDate, expiryDate,
            durationDays, paymentId, amount, currency, paymentMethod, isFreeTrial,
            createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
          superadminId,
          planType,
          planName,
          status,
          new Date(startDate).toISOString(),
          new Date(expiryDate).toISOString(),
          durationDays,
          paymentId,
          amount,
          currency,
          paymentMethod,
          isFreeTrial ? 1 : 0,
          new Date().toISOString(),
          new Date().toISOString()
        ];

        sqlDb.run(query, params, function(err) {
          if (err) {
            console.error(`❌ Error migrating ${superadminId}:`, err.message);
            errors++;
          } else {
            console.log(`✅ Migrated: ${superadminId} (${planName})`);
            migrated++;
          }
        });
      }

      // Commit transaction
      sqlDb.run('COMMIT', (err) => {
        if (err) {
          console.error('❌ Transaction error:', err.message);
          sqlDb.run('ROLLBACK');
          reject(err);
        } else {
          console.log(`\n✅ Migration complete: ${migrated} subscriptions migrated`);
          if (errors > 0) {
            console.log(`⚠️  ${errors} errors occurred during migration`);
          }
          resolve(migrated);
        }
      });
    });
  });
}

/**
 * Verify migration
 */
function verifyMigration() {
  return new Promise((resolve, reject) => {
    sqlDb.all('SELECT * FROM subscriptions', [], (err, rows) => {
      if (err) {
        console.error('❌ Verification error:', err.message);
        reject(err);
      } else {
        console.log(`\n📋 Verification: ${rows?.length || 0} subscriptions in SQLite`);
        if (rows && rows.length > 0) {
          console.log('\nSubscriptions in SQLite:');
          rows.forEach(row => {
            console.log(`  - ${row.superadminId}: ${row.planName} (${row.status})`);
          });
        }
        resolve(rows ? rows.length : 0);
      }
    });
  });
}

/**
 * Main migration function
 */
async function main() {
  try {
    console.log('🚀 Starting subscription migration to SQLite...\n');

    // Try MongoDB first, fallback to JSON
    console.log('1️⃣  Attempting to read subscriptions from MongoDB...');
    let mongoSubscriptions = await readMongoSubscriptions();

    if (Object.keys(mongoSubscriptions).length === 0) {
      console.log('2️⃣  MongoDB unavailable or empty, reading from JSON file...');
      mongoSubscriptions = readJsonSubscriptions();

      if (Object.keys(mongoSubscriptions).length > 0) {
        console.log(`✅ Read ${Object.keys(mongoSubscriptions).length} subscriptions from JSON`);
      }
    }

    // Migrate to SQLite
    console.log('\n3️⃣  Migrating to SQLite...');
    const migratedCount = await migrateToSQLite(mongoSubscriptions);

    // Verify migration
    console.log('\n4️⃣  Verifying migration...');
    const verifiedCount = await verifyMigration();

    if (verifiedCount > 0) {
      console.log('\n✨ Migration successful!');
      console.log(`\n📝 Summary:`);
      console.log(`   - Total migrated: ${migratedCount}`);
      console.log(`   - Verified in SQLite: ${verifiedCount}`);
    } else {
      console.log('\n⚠️  Migration completed but no data verified in SQLite');
    }

    // Close connections
    await mongoose.connection.close().catch(() => {});
    sqlDb.close((err) => {
      if (err) console.error('Error closing SQLite:', err);
      process.exit(verifiedCount > 0 ? 0 : 1);
    });
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    console.error(err.stack);
    
    sqlDb.close(() => {
      process.exit(1);
    });
  }
}

// Run migration
main();
