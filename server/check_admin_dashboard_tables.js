const db = require('./config/database-switch');

async function checkAdminDashboardTables() {
  console.log('🔍 Checking admin dashboard required tables...\n');
  
  try {
    const tables = ['users', 'courses', 'payments'];
    
    for (const table of tables) {
      console.log(`📊 Checking ${table} table...`);
      
      const schema = await new Promise((resolve, reject) => {
        db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [table], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      if (schema) {
        console.log(`✅ ${table} table exists`);
        
        // Check if required columns exist
        const columns = await new Promise((resolve, reject) => {
          db.all(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${table})`, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
        
        console.log(`📋 Columns in ${table}:`);
        columns.forEach((col, index) => {
          console.log(`   ${index + 1}. ${col.name} (${col.type})`);
        });
        
        // Check if table has data
        const count = await new Promise((resolve, reject) => {
          db.get(`SELECT COUNT(*) as count FROM ${table}`, [], (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
        
        console.log(`📈 Total records in ${table}: ${count.count}`);
        
      } else {
        console.log(`❌ ${table} table does not exist`);
      }
      
      console.log('');
    }
    
    // Test the exact queries from admin dashboard
    console.log('🔍 Testing admin dashboard queries...');
    
    const adminUniversityId = 1; // Default university ID
    
    console.log('\n📊 Query 1: User statistics');
    try {
      const userStats = await new Promise((resolve, reject) => {
        db.all(`
          SELECT role, COUNT(*) as count
          FROM users
          WHERE university_id = ?
          GROUP BY role
        `, [adminUniversityId], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      console.log('✅ User statistics query working:', userStats);
    } catch (error) {
      console.log('❌ User statistics query failed:', error.message);
    }
    
    console.log('\n📊 Query 2: Course statistics');
    try {
      const courseStats = await new Promise((resolve, reject) => {
        db.get(`
          SELECT COUNT(*) as totalCourses 
          FROM courses 
          WHERE university_id = ?
        `, [adminUniversityId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      console.log('✅ Course statistics query working:', courseStats);
    } catch (error) {
      console.log('❌ Course statistics query failed:', error.message);
    }
    
    console.log('\n📊 Query 3: Payment statistics');
    try {
      const paymentStats = await new Promise((resolve, reject) => {
        db.get(`
          SELECT 
            COUNT(*) as totalPayments,
            SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as totalRevenue
          FROM payments
          WHERE studentId IN (SELECT id FROM users WHERE university_id = ?)
        `, [adminUniversityId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      console.log('✅ Payment statistics query working:', paymentStats);
    } catch (error) {
      console.log('❌ Payment statistics query failed:', error.message);
    }
    
    console.log('\n📊 Query 4: Recent users');
    try {
      const recentUsers = await new Promise((resolve, reject) => {
        db.all(`
          SELECT id, name, email, role, createdAt
          FROM users
          WHERE university_id = ?
          ORDER BY createdAt DESC
          LIMIT 5
        `, [adminUniversityId], (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
      
      console.log('✅ Recent users query working:', recentUsers.length, 'users');
    } catch (error) {
      console.log('❌ Recent users query failed:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkAdminDashboardTables();
