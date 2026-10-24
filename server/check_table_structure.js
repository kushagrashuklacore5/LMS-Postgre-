const db = require('./config/database-switch');

console.log('📋 Checking classroomAssignments table structure...');
db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'classroomAssignments)', (err, columns) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('📋 Columns:', columns.map(col => `${col.name} - ${col.type}`));
  }
});

console.log('\n📋 Checking student_classroom_assignment table structure...');
db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'student_classroom_assignment)', (err, columns) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('📋 Columns:', columns.map(col => `${col.name} - ${col.type}`));
  }
});
