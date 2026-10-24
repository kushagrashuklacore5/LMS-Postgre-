/**
 * Migration Script: Move all users from University 7 to University 1
 * This script updates all user records associated with university_id = 7
 * and reassigns them to university_id = 1
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error connecting to database:', err);
    process.exit(1);
  }
  console.log('✅ Connected to database:', dbPath);
});

async function runMigration() {
  return new Promise((resolve, reject) => {
    // Step 1: Check current status
    console.log('\n📊 Step 1: Checking current user distribution...');
    db.all(
      `SELECT university_id, COUNT(*) as count FROM users GROUP BY university_id ORDER BY university_id`,
      (err, rows) => {
        if (err) {
          console.error('Error querying universities:', err);
          reject(err);
          return;
        }

        console.log('\n📈 Current Distribution:');
        rows.forEach(row => {
          console.log(`   University ${row.university_id}: ${row.count} users`);
        });

        // Step 2: Get count of users in university 7
        console.log('\n🔍 Step 2: Finding users in University 7...');
        db.get(
          `SELECT COUNT(*) as count FROM users WHERE university_id = 7`,
          (err, row) => {
            if (err) {
              console.error('Error counting users in university 7:', err);
              reject(err);
              return;
            }

            const userCount = row.count;
            console.log(`   Found ${userCount} users in University 7`);

            if (userCount === 0) {
              console.log('\n✅ No users found in University 7 - migration not needed');
              resolve();
              return;
            }

            // Step 3: Show sample users before migration
            console.log('\n👥 Step 3: Sample users in University 7 (before migration):');
            db.all(
              `SELECT id, name, email, role, university_id FROM users WHERE university_id = 7 LIMIT 5`,
              (err, rows) => {
                if (err) {
                  console.error('Error querying users:', err);
                  reject(err);
                  return;
                }

                rows.forEach(user => {
                  console.log(`   - ${user.name} (${user.email}): role=${user.role}, university_id=${user.university_id}`);
                });

                // Step 4: Perform the migration
                console.log('\n🔄 Step 4: Migrating users from University 7 to University 1...');
                db.run(
                  `UPDATE users SET university_id = 1 WHERE university_id = 7`,
                  function(err) {
                    if (err) {
                      console.error('❌ Error updating users:', err);
                      reject(err);
                      return;
                    }

                    console.log(`✅ Successfully migrated ${this.changes} users to University 1`);

                    // Step 5: Verify migration
                    console.log('\n✔️ Step 5: Verifying migration...');
                    db.all(
                      `SELECT university_id, COUNT(*) as count FROM users GROUP BY university_id ORDER BY university_id`,
                      (err, rows) => {
                        if (err) {
                          console.error('Error verifying:', err);
                          reject(err);
                          return;
                        }

                        console.log('\n📈 Distribution After Migration:');
                        rows.forEach(row => {
                          console.log(`   University ${row.university_id}: ${row.count} users`);
                        });

                        // Step 6: Show migrated users
                        console.log('\n👥 Step 6: Sample migrated users (now in University 1):');
                        db.all(
                          `SELECT id, name, email, role, university_id FROM users WHERE university_id = 1 ORDER BY updatedAt DESC LIMIT 10`,
                          (err, rows) => {
                            if (err) {
                              console.error('Error querying migrated users:', err);
                              reject(err);
                              return;
                            }

                            rows.slice(0, 5).forEach(user => {
                              console.log(`   - ${user.name} (${user.email}): role=${user.role}, university_id=${user.university_id}`);
                            });

                            console.log('\n✨ Migration completed successfully!');
                            resolve();
                          }
                        );
                      }
                    );
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

// Run the migration
runMigration()
  .then(() => {
    console.log('\n✅ All operations completed');
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
        process.exit(1);
      }
      process.exit(0);
    });
  })
  .catch((err) => {
    console.error('\n❌ Migration failed:', err);
    db.close();
    process.exit(1);
  });
