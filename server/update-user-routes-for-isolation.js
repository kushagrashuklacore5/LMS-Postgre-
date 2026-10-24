const fs = require('fs');
const path = require('path');

console.log('🔧 Updating User Routes for Database Isolation');
console.log('=============================================\n');

const SERVER_DIR = path.join(__dirname);
const ROUTES_DIR = path.join(SERVER_DIR, 'routes');

// Update superadminRoutes.js to handle user creation properly
function updateSuperadminRoutes() {
  console.log('📋 Updating superadminRoutes.js...');
  
  const routesPath = path.join(ROUTES_DIR, 'superadminRoutes.js');
  
  if (!fs.existsSync(routesPath)) {
    console.log('❌ superadminRoutes.js not found');
    return false;
  }
  
  let content = fs.readFileSync(routesPath, 'utf8');
  
  // Find the createUser route and update it
  const createUserRegex = /router\.post\('\/create-user',[^}]+}\);/s;
  const newCreateUser = `// Create user in the superadmin's tenant database
router.post('/create-user', async (req, res) => {
  try {
    const { name, email, password, role, university_id } = req.body;
    const superadmin = req.user;
    
    console.log('Creating user in tenant database:', {
      superadminId: superadmin.id,
      superadminEmail: superadmin.email,
      newUserEmail: email,
      role
    });
    
    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, email, password, and role are required' 
      });
    }
    
    // Hash password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Use tenant database (req.db is set by middleware)
    const db = req.db;
    
    // Check if user already exists in this tenant database
    db.get('SELECT id FROM users WHERE email = ?', [email], (err, existingUser) => {
      if (err) {
        console.error('Error checking existing user:', err);
        return res.status(500).json({ 
          success: false, 
          message: 'Database error' 
        });
      }
      
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          message: 'User with this email already exists' 
        });
      }
      
      // Insert user with superadmin_id
      db.run(\`
        INSERT INTO users (name, email, password, role, university_id, superadmin_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      \`, [name, email, hashedPassword, role, university_id || 1, superadmin.id], function(err) {
        if (err) {
          console.error('Error creating user:', err);
          return res.status(500).json({ 
            success: false, 
            message: 'Error creating user' 
          });
        }
        
        console.log('User created successfully:', {
          userId: this.lastID,
          email: email,
          superadminId: superadmin.id,
          role: role
        });
        
        res.status(201).json({ 
          success: true, 
          message: 'User created successfully',
          user: {
            id: this.lastID,
            name: name,
            email: email,
            role: role,
            university_id: university_id || 1,
            superadmin_id: superadmin.id
          }
        });
      });
    });
    
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});`;

  if (createUserRegex.test(content)) {
    content = content.replace(createUserRegex, newCreateUser);
  } else {
    // If the route doesn't exist, add it
    const insertPoint = content.indexOf('module.exports = router;');
    if (insertPoint !== -1) {
      content = content.substring(0, insertPoint) + 
        '\n\n' + newCreateUser + '\n\n' + 
        content.substring(insertPoint);
    }
  }
  
  fs.writeFileSync(routesPath, content);
  console.log('✅ superadminRoutes.js updated');
  return true;
}

// Update getAllUsers to only show users from the tenant database
function updateGetAllUsers() {
  console.log('📋 Updating getAllUsers route...');
  
  const routesPath = path.join(ROUTES_DIR, 'superadminRoutes.js');
  let content = fs.readFileSync(routesPath, 'utf8');
  
  // Find and replace the getAllUsers route
  const getAllUsersRegex = /router\.get\('\/users',[^}]+}\);/s;
  const newGetAllUsers = `// Get all users from the superadmin's tenant database
router.get('/users', (req, res) => {
  try {
    const superadmin = req.user;
    const db = req.db;
    
    console.log('Fetching users from tenant database:', {
      superadminId: superadmin.id,
      superadminEmail: superadmin.email
    });
    
    // Get all users from this tenant database only
    db.all(\`
      SELECT id, name, email, role, university_id, status, created_at, updated_at
      FROM users 
      ORDER BY created_at DESC
    \`, [], (err, users) => {
      if (err) {
        console.error('Error fetching users:', err);
        return res.status(500).json({ 
          success: false, 
          message: 'Database error' 
        });
      }
      
      console.log(\`Found \${users.length} users in tenant database for superadmin \${superadmin.id}\`);
      
      res.json({
        success: true,
        users: users,
        count: users.length,
        superadminId: superadmin.id
      });
    });
    
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error' 
    });
  }
});`;

  if (getAllUsersRegex.test(content)) {
    content = content.replace(getAllUsersRegex, newGetAllUsers);
  } else {
    // If the route doesn't exist, add it
    const insertPoint = content.indexOf('module.exports = router;');
    if (insertPoint !== -1) {
      content = content.substring(0, insertPoint) + 
        '\n\n' + newGetAllUsers + '\n\n' + 
        content.substring(insertPoint);
    }
  }
  
  fs.writeFileSync(routesPath, content);
  console.log('✅ getAllUsers route updated');
  return true;
}

// Update authentication middleware to set superadminId for non-superadmin users
function updateAuthMiddleware() {
  console.log('📋 Updating authentication middleware...');
  
  const authPath = path.join(SERVER_DIR, 'middleware', 'auth.js');
  
  if (!fs.existsSync(authPath)) {
    console.log('❌ auth.js not found, checking for authMiddleware.js...');
    authPath = path.join(SERVER_DIR, 'middleware', 'authMiddleware.js');
    
    if (!fs.existsSync(authPath)) {
      console.log('❌ No authentication middleware found');
      return false;
    }
  }
  
  let content = fs.readFileSync(authPath, 'utf8');
  
  // Add superadminId to user object for non-superadmin users
  const jwtRegex = /jwt\.verify\(token, process\.env\.JWT_SECRET[^;]+;/;
  
  if (jwtRegex.test(content)) {
    content = content.replace(jwtRegex, `jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    
    // Attach user info to request
    req.user = decoded;
    
    // For non-superadmin users, ensure superadminId is set
    if (decoded.role !== 'superadmin' && !decoded.superadminId) {
      // This should come from the user's record in the tenant database
      // The tenant middleware will handle this
      console.log('Non-superadmin user without superadminId:', decoded);
    }
    
    next();`);
  }
  
  fs.writeFileSync(authPath, content);
  console.log('✅ Authentication middleware updated');
  return true;
}

// Create a test script to verify isolation
function createTestScript() {
  console.log('📋 Creating database isolation test script...');
  
  const testScript = `
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const MAIN_DB_PATH = path.join(__dirname, 'data', 'lms-main.sqlite');
const TENANT_DB_DIR = path.join(__dirname, 'data', 'tenants');

console.log('🧪 Testing Database Isolation');
console.log('============================\\n');

async function testIsolation() {
  // Test 1: Check main database only has superadmins
  console.log('📋 Test 1: Main database should only contain superadmins');
  const mainDb = new sqlite3.Database(MAIN_DB_PATH);
  
  mainDb.all('SELECT id, name, email, role FROM users', [], (err, users) => {
    if (err) {
      console.error('Error checking main database:', err);
      return;
    }
    
    const nonSuperadmins = users.filter(u => u.role !== 'superadmin');
    
    if (nonSuperadmins.length === 0) {
      console.log('✅ Main database contains only superadmins');
    } else {
      console.log('❌ Main database contains non-superadmin users:');
      nonSuperadmins.forEach(u => console.log(\`  - \${u.name} (\${u.email}) - \${u.role}\`));
    }
    
    console.log(\`   Total users in main DB: \${users.length}\`);
    
    // Test 2: Check each tenant database
    console.log('\\n📋 Test 2: Each tenant database should be isolated');
    
    users.filter(u => u.role === 'superadmin').forEach(superadmin => {
      const tenantDbPath = path.join(TENANT_DB_DIR, \`tenant_\${superadmin.id}.sqlite\`);
      
      if (require('fs').existsSync(tenantDbPath)) {
        const tenantDb = new sqlite3.Database(tenantDbPath);
        
        tenantDb.all('SELECT COUNT(*) as count FROM users', [], (err, result) => {
          if (err) {
            console.error(\`Error checking tenant \${superadmin.id}:\`, err);
          } else {
            console.log(\`   Tenant \${superadmin.id} (\${superadmin.email}): \${result[0].count} users\`);
          }
        });
        
        // Check that no superadmins exist in tenant databases
        tenantDb.all('SELECT * FROM users WHERE role = "superadmin"', [], (err, superadminsInTenant) => {
          if (err) {
            console.error(\`Error checking for superadmins in tenant \${superadmin.id}:\`, err);
          } else if (superadminsInTenant.length > 0) {
            console.log(\`❌ Tenant \${superadmin.id} contains \${superadminsInTenant.length} superadmins!\`);
          } else {
            console.log(\`✅ Tenant \${superadmin.id} contains no superadmins\`);
          }
        });
        
        // Check that all users have superadmin_id
        tenantDb.all('SELECT * FROM users WHERE superadmin_id IS NULL', [], (err, usersWithoutSuperadmin) => {
          if (err) {
            console.error(\`Error checking superadmin_id in tenant \${superadmin.id}:\`, err);
          } else if (usersWithoutSuperadmin.length > 0) {
            console.log(\`❌ Tenant \${superadmin.id} has \${usersWithoutSuperadmin.length} users without superadmin_id!\`);
          } else {
            console.log(\`✅ All users in tenant \${superadmin.id} have superadmin_id\`);
          }
        });
      } else {
        console.log(\`❌ Tenant database not found for superadmin \${superadmin.id}\`);
      }
    });
  });
}

testIsolation();
`;
  
  const testPath = path.join(SERVER_DIR, 'test-database-isolation.js');
  fs.writeFileSync(testPath, testScript);
  console.log('✅ Test script created: test-database-isolation.js');
}

// Execute all updates
function updateAllRoutes() {
  console.log('🔧 Starting user routes update...\n');
  
  const results = [
    updateSuperadminRoutes(),
    updateGetAllUsers(),
    updateAuthMiddleware()
  ];
  
  if (results.every(r => r !== false)) {
    createTestScript();
    
    console.log('\n🎉 User routes update completed!');
    console.log('================================');
    console.log('✅ User creation routes updated for database isolation');
    console.log('✅ getAllUsers routes updated to use tenant databases');
    console.log('✅ Authentication middleware updated');
    console.log('✅ Test script created');
    console.log('\n📋 NEXT STEPS:');
    console.log('1. Run: node test-database-isolation.js to verify isolation');
    console.log('2. Restart the server');
    console.log('3. Test user creation as different superadmins');
    console.log('4. Verify users are isolated to their superadmin\'s database');
    
  } else {
    console.log('\n❌ Some updates failed. Please check the errors above.');
  }
}

updateAllRoutes();
