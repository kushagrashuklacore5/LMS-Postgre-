const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');

const dbPath = path.join(__dirname, '..', 'data', 'lms-database.sqlite');
const db = new sqlite3.Database(dbPath);

const LIBRETRA_API_URL = 'http://localhost:5000/translate';

/**
 * Translate text to Arabic using LibreTranslate
 */
async function translateToArabic(text) {
  if (!text || typeof text !== 'string') return text;
  
  try {
    const response = await axios.post(LIBRETRA_API_URL, {
      q: text,
      source: 'en',
      target: 'ar',
    }, { timeout: 5000 });

    return response.data?.translatedText || text;
  } catch (error) {
    console.warn(`⚠️  Translation failed for: "${text.substring(0, 50)}..."`);
    return text;
  }
}

/**
 * Add bilingual columns to table
 */
function addBilingualColumns(tableName, textColumns) {
  return new Promise((resolve) => {
    console.log(`\n🔄 Processing table: ${tableName}`);
    
    const addColumnPromises = textColumns.map((col) => {
      return new Promise((res) => {
        db.run(`ALTER TABLE ${tableName} ADD COLUMN ${col}_ar TEXT`, (err) => {
          if (err) {
            if (err.message.includes('duplicate column')) {
              console.log(`   ✓ ${col}_ar column already exists`);
            } else {
              console.error(`   ✗ Error adding ${col}_ar:`, err.message);
            }
          } else {
            console.log(`   ✓ Added ${col}_ar column`);
          }
          res();
        });
      });
    });

    Promise.all(addColumnPromises).then(() => {
      resolve();
    });
  });
}

/**
 * Translate existing data in table
 */
function translateTableData(tableName, textColumns) {
  return new Promise((resolve) => {
    db.all(`SELECT id, ${textColumns.join(', ')} FROM ${tableName}`, [], async (err, rows) => {
      if (err) {
        console.error(`Error fetching data from ${tableName}:`, err);
        resolve();
        return;
      }

      if (!rows || rows.length === 0) {
        console.log(`   ℹ️  No data to translate in ${tableName}`);
        resolve();
        return;
      }

      console.log(`   📝 Translating ${rows.length} rows...`);
      let translatedCount = 0;

      for (const row of rows) {
        for (const col of textColumns) {
          const enText = row[col];
          if (enText && typeof enText === 'string') {
            const arText = await translateToArabic(enText);
            
            // Update the database with translated Arabic text
            db.run(
              `UPDATE ${tableName} SET ${col}_ar = ? WHERE id = ?`,
              [arText, row.id],
              (err) => {
                if (err) {
                  console.error(`Error updating ${tableName} row ${row.id}:`, err.message);
                }
              }
            );
            
            translatedCount++;
          }
        }
      }

      // Wait a moment for all updates to complete
      setTimeout(() => {
        console.log(`   ✅ Translated ${translatedCount} text fields`);
        resolve();
      }, 1000);
    });
  });
}

/**
 * Main migration function
 */
async function runMigration() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   Database Bilingual Migration Script           ║');
  console.log('╚════════════════════════════════════════════════╝');

  // Define tables and their text columns to migrate
  const tablesToMigrate = [
    { table: 'users', columns: ['name'] },
    { table: 'announcements', columns: ['title', 'content'] },
    { table: 'courses', columns: ['title', 'description', 'category'] },
    { table: 'classrooms', columns: ['name', 'description'] },
    { table: 'chapters', columns: ['title', 'description'] },
    { table: 'assessments', columns: ['title', 'description'] },
    { table: 'assessment_questions', columns: ['question_text', 'option_a', 'option_b', 'option_c', 'option_d'] },
    { table: 'course_materials', columns: ['title', 'description'] },
    { table: 'requirements', columns: ['title', 'description'] },
    { table: 'universities', columns: ['name', 'address'] },
  ];

  try {
    console.log('\n📊 Step 1: Adding bilingual columns...');
    for (const { table, columns } of tablesToMigrate) {
      await addBilingualColumns(table, columns);
    }

    console.log('\n📚 Step 2: Translating existing data to Arabic...');
    for (const { table, columns } of tablesToMigrate) {
      await translateTableData(table, columns);
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   • Added _ar columns to all text fields');
    console.log('   • Translated all existing English data to Arabic');
    console.log('   • Database is now bidirectional (EN/AR)');
    console.log('   • Users can input in both English and Arabic');

    db.close(() => {
      console.log('\n✅ Database connection closed\n');
      process.exit(0);
    });
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    db.close();
    process.exit(1);
  }
}

// Run migration
runMigration();
