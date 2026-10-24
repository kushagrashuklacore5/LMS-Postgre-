const db = require('config/database-switch');

const sql = 'SELECT name FROM sqlite_master WHERE type="table" AND name="results"';

db.get(sql, (err, row) => {
  if (err) {
    console.error('Error checking table:', err);
    process.exit(1);
  }

  if (row) {
    console.log('✓ Results table exists');
    db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'results)', (err2, cols) => {
      console.log('Columns:', cols.map(c => c.name).join(', '));
      process.exit(0);
    });
  } else {
    console.log('✗ Results table does NOT exist - creating it...');
    const createSql = `
      CREATE TABLE results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        classroomId INTEGER NOT NULL,
        studentId INTEGER NOT NULL,
        term TEXT DEFAULT 'General',
        subjects TEXT,
        overallPercentage REAL DEFAULT 0,
        overallStatus TEXT DEFAULT 'PASS',
        comments TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(classroomId) REFERENCES classrooms(id),
        FOREIGN KEY(studentId) REFERENCES users(id)
      )
    `;
    
    db.run(createSql, (err3) => {
      if (err3) {
        console.error('✗ Error creating table:', err3);
        process.exit(1);
      } else {
        console.log('✓ Results table created successfully');
        console.log('Table schema:');
        db.all('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'results)', (err4, cols) => {
          console.log(cols.map(c => `  - ${c.name} (${c.type})`).join('\n'));
          process.exit(0);
        });
      }
    });
  }
});
