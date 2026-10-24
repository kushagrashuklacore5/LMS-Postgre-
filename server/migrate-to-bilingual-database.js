/**
 * BILINGUAL DATABASE MIGRATION SCRIPT
 * 
 * This script converts the entire database from single-language to bilingual (English & Arabic)
 * by adding language-specific columns to all content tables and translating existing data.
 * 
 * Tables affected:
 * - courses (title_en, title_ar, description_en, description_ar)
 * - chapters (title_en, title_ar, content_en, content_ar)
 * - announcements (title_en, title_ar, content_en, content_ar)
 * - classrooms (name_en, name_ar)
 * - universities (name_en, name_ar, area_en, area_ar)
 * - feeStructures (category_en, category_ar)
 * - live_classes (title_en, title_ar, description_en, description_ar)
 * - inventory (itemName_en, itemName_ar, description_en, description_ar)
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');

const dbPath = path.join(__dirname, 'data', 'lms-database.sqlite');

// LibreTranslate API endpoint (using your docker setup)
const TRANSLATE_API = 'http://localhost:5000/translate';

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to database:', dbPath);
  startMigration();
});

/**
 * Translate text using LibreTranslate
 */
async function translateText(text, targetLang = 'ar') {
  try {
    if (!text || text.trim() === '') return '';
    
    const response = await axios.post(TRANSLATE_API, {
      q: text,
      source: 'en',
      target: targetLang
    });
    
    return response.data.translatedText || text;
  } catch (error) {
    console.warn(`⚠️ Translation failed for "${text}":`, error.message);
    return text; // Return original if translation fails
  }
}

/**
 * Run SQL query with promise
 */
function runQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Get query results with promise
 */
function getAllQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Check if a table exists in the SQLite database
 */
function tableExists(tableName) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND name = ?`, [tableName], (err, row) => {
      if (err) return reject(err);
      resolve(!!row);
    });
  });
}

/**
 * Main migration process
 */
async function startMigration() {
  try {
    console.log('\n🚀 Starting Bilingual Database Migration...\n');
    
    // Step 1: Add columns to courses table
    await addCoursesColumns();
    
    // Step 2: Add columns to chapters table
    await addChaptersColumns();
    
    // Step 3: Add columns to announcements table
    await addAnnouncementsColumns();
    
    // Step 4: Add columns to classrooms table
    await addClassroomsColumns();
    
    // Step 5: Add columns to universities table
    await addUniversitiesColumns();
    
    // Step 6: Add columns to feeStructures table
    await addFeeStructuresColumns();
    
    // Step 7: Add columns to live_classes table
    await addLiveClassesColumns();
    
    // Step 8: Add columns to inventory table
    await addInventoryColumns();
    
    // Step 9: Add language preference to users table
    await addUserLanguagePreference();
    
    // Step 10: Populate translated data
    console.log('\n📝 Populating translated data...\n');
    await populateTranslations();
    
    console.log('\n✅ Migration completed successfully!\n');
    console.log('🎉 Your database is now fully bilingual (English & Arabic)');
    console.log('Users will see content in their preferred language.\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

/**
 * Add bilingual columns to courses table
 */
async function addCoursesColumns() {
  console.log('📚 Adding bilingual columns to courses table...');
  const exists = await tableExists('courses');
  if (!exists) {
    console.log('  ⚠️ courses table does not exist, skipping courses columns');
    return;
  }
  try {
    await runQuery(`ALTER TABLE courses ADD COLUMN title_en TEXT`);
    console.log('  ✓ Added title_en column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) {
      throw e;
    }
    console.log('  ℹ title_en column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE courses ADD COLUMN title_ar TEXT`);
    console.log('  ✓ Added title_ar column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ title_ar column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE courses ADD COLUMN description_en TEXT`);
    console.log('  ✓ Added description_en column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ description_en column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE courses ADD COLUMN description_ar TEXT`);
    console.log('  ✓ Added description_ar column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ description_ar column already exists');
  }
}

/**
 * Add bilingual columns to chapters table
 */
async function addChaptersColumns() {
  console.log('\n📖 Adding bilingual columns to chapters table...');
  const exists = await tableExists('chapters');
  if (!exists) {
    console.log('  ⚠️ chapters table does not exist, skipping chapters columns');
    return;
  }
  
  try {
    await runQuery(`ALTER TABLE chapters ADD COLUMN title_en TEXT`);
    console.log('  ✓ Added title_en column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) {
      console.log('  ℹ title_en column check/failed:', e.message);
    } else {
      console.log('  ℹ title_en column already exists');
    }
  }
  
  try {
    await runQuery(`ALTER TABLE chapters ADD COLUMN title_ar TEXT`);
    console.log('  ✓ Added title_ar column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ title_ar column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE chapters ADD COLUMN content_en TEXT`);
    console.log('  ✓ Added content_en column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ content_en column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE chapters ADD COLUMN content_ar TEXT`);
    console.log('  ✓ Added content_ar column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ content_ar column already exists');
  }
}

/**
 * Add bilingual columns to announcements table
 */
async function addAnnouncementsColumns() {
  console.log('\n📢 Adding bilingual columns to announcements table...');
  const exists = await tableExists('announcements');
  if (!exists) {
    console.log('  ⚠️ announcements table does not exist, skipping announcements columns');
    return;
  }
  try {
    await runQuery(`ALTER TABLE announcements ADD COLUMN title_en TEXT`);
    console.log('  ✓ Added title_en column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ title_en column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE announcements ADD COLUMN title_ar TEXT`);
    console.log('  ✓ Added title_ar column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ title_ar column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE announcements ADD COLUMN content_en TEXT`);
    console.log('  ✓ Added content_en column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ content_en column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE announcements ADD COLUMN content_ar TEXT`);
    console.log('  ✓ Added content_ar column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ content_ar column already exists');
  }
}

/**
 * Add bilingual columns to classrooms table
 */
async function addClassroomsColumns() {
  console.log('\n🏫 Adding bilingual columns to classrooms table...');
  const exists = await tableExists('classrooms');
  if (!exists) {
    console.log('  ⚠️ classrooms table does not exist, skipping classrooms columns');
    return;
  }
  try {
    await runQuery(`ALTER TABLE classrooms ADD COLUMN name_en TEXT`);
    console.log('  ✓ Added name_en column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ name_en column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE classrooms ADD COLUMN name_ar TEXT`);
    console.log('  ✓ Added name_ar column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ name_ar column already exists');
  }
}

/**
 * Add bilingual columns to universities table
 */
async function addUniversitiesColumns() {
  console.log('\n🎓 Adding bilingual columns to universities table...');
  const exists = await tableExists('universities');
  if (!exists) {
    console.log('  ⚠️ universities table does not exist, skipping universities columns');
    return;
  }
  try {
    await runQuery(`ALTER TABLE universities ADD COLUMN name_en TEXT`);
    console.log('  ✓ Added name_en column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ name_en column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE universities ADD COLUMN name_ar TEXT`);
    console.log('  ✓ Added name_ar column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ name_ar column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE universities ADD COLUMN area_en TEXT`);
    console.log('  ✓ Added area_en column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ area_en column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE universities ADD COLUMN area_ar TEXT`);
    console.log('  ✓ Added area_ar column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ area_ar column already exists');
  }
}

/**
 * Add bilingual columns to feeStructures table
 */
async function addFeeStructuresColumns() {
  console.log('\n💰 Adding bilingual columns to feeStructures table...');
  const exists = await tableExists('feeStructures');
  if (!exists) {
    console.log('  ⚠️ feeStructures table does not exist, skipping feeStructures columns');
    return;
  }
  try {
    await runQuery(`ALTER TABLE feeStructures ADD COLUMN category_en TEXT`);
    console.log('  ✓ Added category_en column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ category_en column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE feeStructures ADD COLUMN category_ar TEXT`);
    console.log('  ✓ Added category_ar column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ category_ar column already exists');
  }
}

/**
 * Add bilingual columns to live_classes table
 */
async function addLiveClassesColumns() {
  console.log('\n🎥 Adding bilingual columns to live_classes table...');
  const exists = await tableExists('live_classes');
  if (!exists) {
    console.log('  ⚠️ live_classes table does not exist, skipping live_classes columns');
    return;
  }
  try {
    await runQuery(`ALTER TABLE live_classes ADD COLUMN title_en TEXT`);
    console.log('  ✓ Added title_en column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ title_en column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE live_classes ADD COLUMN title_ar TEXT`);
    console.log('  ✓ Added title_ar column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ title_ar column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE live_classes ADD COLUMN description_en TEXT`);
    console.log('  ✓ Added description_en column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ description_en column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE live_classes ADD COLUMN description_ar TEXT`);
    console.log('  ✓ Added description_ar column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ description_ar column already exists');
  }
}

/**
 * Add bilingual columns to inventory table
 */
async function addInventoryColumns() {
  console.log('\n📦 Adding bilingual columns to inventory table...');
  const exists = await tableExists('inventory');
  if (!exists) {
    console.log('  ⚠️ inventory table does not exist, skipping inventory columns');
    return;
  }
  try {
    await runQuery(`ALTER TABLE inventory ADD COLUMN itemName_en TEXT`);
    console.log('  ✓ Added itemName_en column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ itemName_en column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE inventory ADD COLUMN itemName_ar TEXT`);
    console.log('  ✓ Added itemName_ar column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ itemName_ar column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE inventory ADD COLUMN description_en TEXT`);
    console.log('  ✓ Added description_en column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ description_en column already exists');
  }
  
  try {
    await runQuery(`ALTER TABLE inventory ADD COLUMN description_ar TEXT`);
    console.log('  ✓ Added description_ar column');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
    console.log('  ℹ description_ar column already exists');
  }
}

/**
 * Add language preference column to users table
 */
async function addUserLanguagePreference() {
  console.log('\n👤 Adding language preference to users table...');
  const exists = await tableExists('users');
  if (!exists) {
    console.log('  ⚠️ users table does not exist, skipping preferredLanguage column');
    return;
  }
  try {
    await runQuery(`ALTER TABLE users ADD COLUMN preferredLanguage TEXT DEFAULT 'en'`);
    console.log('  ✓ Added preferredLanguage column (default: en)');
  } catch (e) {
    if (!e.message.includes('duplicate column')) {
      console.log('  ℹ preferredLanguage column check/failed:', e.message);
    } else {
      console.log('  ℹ preferredLanguage column already exists');
    }
  }
}

/**
 * Populate translations from existing data
 */
async function populateTranslations() {
  try {
    // Courses
    console.log('Translating courses...');
    const courses = await getAllQuery('SELECT id, title, description FROM courses WHERE title IS NOT NULL');
    for (const course of courses) {
      const titleAr = await translateText(course.title, 'ar');
      const descAr = await translateText(course.description || '', 'ar');
      
      await runQuery(
        `UPDATE courses SET title_en = ?, title_ar = ?, description_en = ?, description_ar = ? WHERE id = ?`,
        [course.title, titleAr, course.description || '', descAr, course.id]
      );
      console.log(`  ✓ Translated course: ${course.title}`);
    }
    
    // Chapters
    console.log('\nTranslating chapters...');
    const chapters = await getAllQuery('SELECT id, title, content FROM chapters WHERE title IS NOT NULL');
    for (const chapter of chapters) {
      const titleAr = await translateText(chapter.title, 'ar');
      const contentAr = await translateText(chapter.content || '', 'ar');
      
      await runQuery(
        `UPDATE chapters SET title_en = ?, title_ar = ?, content_en = ?, content_ar = ? WHERE id = ?`,
        [chapter.title, titleAr, chapter.content || '', contentAr, chapter.id]
      );
      console.log(`  ✓ Translated chapter: ${chapter.title}`);
    }
    
    // Announcements
    console.log('\nTranslating announcements...');
    const announcements = await getAllQuery('SELECT id, title, content FROM announcements WHERE title IS NOT NULL');
    for (const announcement of announcements) {
      const titleAr = await translateText(announcement.title, 'ar');
      const contentAr = await translateText(announcement.content || '', 'ar');
      
      await runQuery(
        `UPDATE announcements SET title_en = ?, title_ar = ?, content_en = ?, content_ar = ? WHERE id = ?`,
        [announcement.title, titleAr, announcement.content || '', contentAr, announcement.id]
      );
      console.log(`  ✓ Translated announcement: ${announcement.title}`);
    }
    
    // Classrooms
    console.log('\nTranslating classrooms...');
    const classrooms = await getAllQuery('SELECT id, name FROM classrooms WHERE name IS NOT NULL');
    for (const classroom of classrooms) {
      const nameAr = await translateText(classroom.name, 'ar');
      
      await runQuery(
        `UPDATE classrooms SET name_en = ?, name_ar = ? WHERE id = ?`,
        [classroom.name, nameAr, classroom.id]
      );
      console.log(`  ✓ Translated classroom: ${classroom.name}`);
    }
    
    // Universities
    console.log('\nTranslating universities...');
    const universities = await getAllQuery('SELECT id, name, area FROM universities WHERE name IS NOT NULL');
    for (const uni of universities) {
      const nameAr = await translateText(uni.name, 'ar');
      const areaAr = await translateText(uni.area || '', 'ar');
      
      await runQuery(
        `UPDATE universities SET name_en = ?, name_ar = ?, area_en = ?, area_ar = ? WHERE id = ?`,
        [uni.name, nameAr, uni.area || '', areaAr, uni.id]
      );
      console.log(`  ✓ Translated university: ${uni.name}`);
    }
    
    // Fee Structures
    console.log('\nTranslating fee structures...');
    const fees = await getAllQuery('SELECT id, category FROM feeStructures WHERE category IS NOT NULL');
    for (const fee of fees) {
      const categoryAr = await translateText(fee.category, 'ar');
      
      await runQuery(
        `UPDATE feeStructures SET category_en = ?, category_ar = ? WHERE id = ?`,
        [fee.category, categoryAr, fee.id]
      );
      console.log(`  ✓ Translated fee structure: ${fee.category}`);
    }
    
    // Live Classes
    console.log('\nTranslating live classes...');
    const liveClasses = await getAllQuery('SELECT id, title, description FROM live_classes WHERE title IS NOT NULL');
    for (const liveClass of liveClasses) {
      const titleAr = await translateText(liveClass.title, 'ar');
      const descAr = await translateText(liveClass.description || '', 'ar');
      
      await runQuery(
        `UPDATE live_classes SET title_en = ?, title_ar = ?, description_en = ?, description_ar = ? WHERE id = ?`,
        [liveClass.title, titleAr, liveClass.description || '', descAr, liveClass.id]
      );
      console.log(`  ✓ Translated live class: ${liveClass.title}`);
    }
    
    // Inventory
    console.log('\nTranslating inventory items...');
    const inventory = await getAllQuery('SELECT id, itemName, description FROM inventory WHERE itemName IS NOT NULL');
    for (const item of inventory) {
      const itemAr = await translateText(item.itemName, 'ar');
      const descAr = await translateText(item.description || '', 'ar');
      
      await runQuery(
        `UPDATE inventory SET itemName_en = ?, itemName_ar = ?, description_en = ?, description_ar = ? WHERE id = ?`,
        [item.itemName, itemAr, item.description || '', descAr, item.id]
      );
      console.log(`  ✓ Translated inventory item: ${item.itemName}`);
    }
    
  } catch (error) {
    console.error('⚠️ Error during translation population:', error.message);
    console.log('Continuing with migration...');
  }
}

// Handle script termination
process.on('SIGINT', () => {
  console.log('\n\n⚠️ Migration interrupted');
  db.close();
  process.exit(1);
});
