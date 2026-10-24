/**
 * Migration: Add university_id to users table for multi-tenancy
 * This enables data isolation per university
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database/lms.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('✅ Connected to database');
});

async function runMigration() {
  return new Promise((resolve, reject) => {
    // Step 1: Add university_id column if it doesn't exist
    console.log('Step 1: Adding university_id column to users table...');
    db.run(
      `ALTER TABLE users ADD COLUMN university_id INTEGER DEFAULT 1`,
      (err) => {
        if (err) {
          if (err.message.includes('duplicate column name')) {
            console.log('ℹ️  Column already exists');
          } else {
            console.error('Error adding university_id column:', err);
            reject(err);
            return;
          }
        } else {
          console.log('✅ university_id column added to users table');
        }

        // Step 2: Update all existing users to have a default university
        console.log('\nStep 2: Setting default university_id for existing users...');
        db.run(
          `UPDATE users SET university_id = 1 WHERE university_id IS NULL`,
          function(err) {
            if (err) {
              console.error('Error updating users:', err);
              reject(err);
              return;
            }
            console.log(`✅ Updated ${this.changes} users with default university_id = 1`);

            // Step 3: Verify the migration
            console.log('\nStep 3: Verifying migration...');
            db.all(
              `SELECT id, name, email, role, university_id FROM users LIMIT 5`,
              (err, rows) => {
                if (err) {
                  console.error('Error verifying:', err);
                  reject(err);
                  return;
                }
                console.log('✅ Sample users:');
                rows.forEach(user => {
                  console.log(`   - ${user.name} (${user.email}): role=${user.role}, university_id=${user.university_id}`);
                });

                // Step 4: Check column info
                console.log('\nStep 4: Checking table schema...');
                db.all(
                  `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users)`,
                  (err, columns) => {
                    if (err) {
                      console.error('Error getting schema:', err);
                      reject(err);
                      return;
                    }
                    const universityIdColumn = columns.find(c => c.name === 'university_id');
                    if (universityIdColumn) {
                      console.log('✅ university_id column confirmed in schema:');
                      console.log(`   - Type: ${universityIdColumn.type}`);
                      console.log(`   - NotNull: ${universityIdColumn.notnull}`);
                      console.log(`   - Default: ${universityIdColumn.dflt_value}`);
                    } else {
                      console.error('❌ university_id column NOT found in schema');
                    }

                    console.log('\n✅ Migration completed successfully!');
                    console.log('\nNext steps:');
                    console.log('1. Update authMiddleware.js to extract universityId from JWT token');
                    console.log('2. Update auth-routes.js to include universityId in JWT token');
                    console.log('3. Update universalRoutes.js to filter by universityId');
                    console.log('4. Update individual routes (student, course, etc.) for university filtering');
                    console.log('5. Test: Create users in different universities and verify data isolation');

                    resolve();
                  }
                );
              }
            );
          }
        );
      }
    );
  });
}

// Run migration
runMigration()
  .then(() => {
    console.log('\n🎉 All done!');
    db.close();
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Migration failed:', err);
    db.close();
    process.exit(1);
  });
