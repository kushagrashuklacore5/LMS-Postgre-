const fs = require('fs');
const path = require('path');

console.log('🐘 PostgreSQL Setup Guide\n');
console.log('This guide will help you configure PostgreSQL for the LMS system.\n');

console.log('📋 Prerequisites:');
console.log('1. PostgreSQL must be installed on your system');
console.log('2. PostgreSQL service should be running');
console.log('3. You need to know your PostgreSQL password\n');

console.log('🔧 Common PostgreSQL setups:\n');

console.log('Option 1: Default PostgreSQL installation');
console.log('- Username: postgres');
console.log('- Password: postgres (or empty password)');
console.log('- Port: 5432');
console.log('- Host: localhost\n');

console.log('Option 2: Custom setup');
console.log('- Username: postgres');
console.log('- Password: [your password]');
console.log('- Port: 5432');
console.log('- Host: localhost\n');

console.log('🔍 To check your PostgreSQL setup:');
console.log('1. Open PostgreSQL command line (psql)');
console.log('2. Try: psql -U postgres -h localhost');
console.log('3. If it asks for password, enter your PostgreSQL password\n');

console.log('⚙️  To update your database configuration:');
console.log('1. Edit the .env file in the server directory');
console.log('2. Update these variables:');
console.log('   PG_HOST=localhost');
console.log('   PG_PORT=5432');
console.log('   PG_DATABASE=lms_prod');
console.log('   PG_USER=postgres');
console.log('   PG_PASSWORD=your_password_here\n');

console.log('🔧 To reset your PostgreSQL password (if needed):');
console.log('1. Stop PostgreSQL service');
console.log('2. Edit pg_hba.conf file');
console.log('3. Set authentication to "trust" temporarily');
console.log('4. Restart PostgreSQL');
console.log('5. Connect and set new password: ALTER USER postgres PASSWORD "newpassword";');
console.log('6. Revert pg_hba.conf changes and restart\n');

console.log('🚀 Once configured, run:');
console.log('node init-postgres-db.js');
console.log('npm start\n');

// Check current environment
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  console.log('📄 Current .env configuration:');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const pgVars = envContent.split('\n')
    .filter(line => line.startsWith('PG_'))
    .map(line => line.replace(/#.*$/, '').trim());
  
  if (pgVars.length > 0) {
    pgVars.forEach(varLine => {
      if (varLine) {
        const [key, value] = varLine.split('=');
        if (key === 'PG_PASSWORD') {
          console.log(`   ${key}=********`);
        } else {
          console.log(`   ${key}=${value}`);
        }
      }
    });
  } else {
    console.log('   No PostgreSQL variables found in .env');
  }
} else {
  console.log('   No .env file found');
}

console.log('\n💡 Quick setup commands (if you have PostgreSQL installed):');
console.log('Windows:');
console.log('1. Open Services and start "postgresql-x64-XX" service');
console.log('2. Run: psql -U postgres');
console.log('3. Set password: \\password postgres');
console.log('4. Enter new password when prompted\n');

console.log('macOS (with Homebrew):');
console.log('1. brew services start postgresql');
console.log('2. psql -d postgres');
console.log('3. ALTER USER postgres PASSWORD "your_password";\n');

console.log('Linux (Ubuntu/Debian):');
console.log('1. sudo systemctl start postgresql');
console.log('2. sudo -u postgres psql');
console.log('3. ALTER USER postgres PASSWORD "your_password";\n');

console.log('🎯 After setup, the system will:');
console.log('✅ Create database "lms_prod"');
console.log('✅ Create all necessary tables');
console.log('✅ Insert default superadmin user');
console.log('✅ Set up proper indexes and constraints');
console.log('✅ Be ready for multi-tenant operations\n');
