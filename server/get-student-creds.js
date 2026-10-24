const db = require('./config/database-switch');

console.log('=== Getting Student Credentials ===');

const query = `
  SELECT id, email, role, name, university_id, created_at, status
  FROM users 
  WHERE role = 'student' OR role = 'user'
  ORDER BY created_at DESC
  LIMIT 10
`;

db.all(query, [], (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log(`Found ${rows.length} student/user accounts:`);
    
    if (rows.length === 0) {
      console.log('No student accounts found. Let me check for any users...');
      
      const allUsersQuery = `
        SELECT id, email, role, name, created_at, status
        FROM users 
        ORDER BY created_at DESC
        LIMIT 10
      `;
      
      db.all(allUsersQuery, [], (err, allRows) => {
        if (err) {
          console.error('Error:', err);
        } else {
          console.log(`\nAll users in database (${allRows.length}):`);
          allRows.forEach((row, index) => {
            console.log(`\n${index + 1}. User Credentials:`);
            console.log(`   Email: ${row.email}`);
            console.log(`   Role: ${row.role}`);
            console.log(`   Name: ${row.name || 'Not set'}`);
            console.log(`   Status: ${row.status || 'Not set'}`);
            console.log(`   Created: ${new Date(row.created_at).toLocaleDateString()}`);
            console.log(`   ID: ${row.id}`);
          });
        }
        process.exit(0);
      });
    } else {
      rows.forEach((row, index) => {
        console.log(`\n${index + 1}. Student Credentials:`);
        console.log(`   Email: ${row.email}`);
        console.log(`   Role: ${row.role}`);
        console.log(`   Name: ${row.name || 'Not set'}`);
        console.log(`   University: ${row.university_id || 'Not assigned'}`);
        console.log(`   Status: ${row.status || 'Not set'}`);
        console.log(`   Created: ${new Date(row.created_at).toLocaleDateString()}`);
        console.log(`   ID: ${row.id}`);
      });
      
      console.log('\nNote: Passwords are hashed in the database for security.');
      console.log('Default password for test accounts is usually "password123" or "123456"');
    }
  }
  
  process.exit(0);
});
