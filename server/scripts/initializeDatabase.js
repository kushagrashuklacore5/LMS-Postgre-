// Comprehensive Database Initialization Script
// This script ensures all database tables are created and properly initialized

const db = require('../config/database-switch');

// Initialize all database tables for complete LMS functionality
function initializeAllTables() {
  console.log('🚀 Initializing complete LMS database...');

  // Users table (already exists, but ensure it's complete)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL,
      isApproved BOOLEAN DEFAULT 0,
      classroom_id INTEGER,
      grade TEXT,
      section TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating users table:', err);
    } else {
      console.log('✅ Users table ready');
      
      // Add missing columns if they don't exist
      db.run(`ALTER TABLE users ADD COLUMN grade TEXT`, () => {});
      db.run(`ALTER TABLE users ADD COLUMN section TEXT`, () => {});
      db.run(`ALTER TABLE users ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Classrooms table
  db.run(`
    CREATE TABLE IF NOT EXISTS classrooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      grade TEXT NOT NULL,
      section TEXT,
      classTeacher TEXT,
      studentCount INTEGER DEFAULT 0,
      teacherId INTEGER,
      academicYear TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (teacherId) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating classrooms table:', err);
    } else {
      console.log('✅ Classrooms table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE classrooms ADD COLUMN teacherId INTEGER`, () => {});
      db.run(`ALTER TABLE classrooms ADD COLUMN academicYear TEXT`, () => {});
      db.run(`ALTER TABLE classrooms ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Courses table
  db.run(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      mentorId INTEGER,
      classroomId INTEGER,
      category TEXT,
      duration INTEGER,
      price REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (mentorId) REFERENCES users(id),
      FOREIGN KEY (classroomId) REFERENCES classrooms(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating courses table:', err);
    } else {
      console.log('✅ Courses table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE courses ADD COLUMN status TEXT DEFAULT 'active'`, () => {});
      db.run(`ALTER TABLE courses ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Materials table
  db.run(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      courseId INTEGER,
      classroomId INTEGER,
      mentorId INTEGER,
      type TEXT,
      fileUrl TEXT,
      fileName TEXT,
      fileSize INTEGER,
      status TEXT DEFAULT 'active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (courseId) REFERENCES courses(id),
      FOREIGN KEY (classroomId) REFERENCES classrooms(id),
      FOREIGN KEY (mentorId) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating materials table:', err);
    } else {
      console.log('✅ Materials table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE materials ADD COLUMN status TEXT DEFAULT 'active'`, () => {});
      db.run(`ALTER TABLE materials ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Assignments table
  db.run(`
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      courseId INTEGER,
      classroomId INTEGER,
      mentorId INTEGER,
      dueDate DATE,
      totalMarks INTEGER DEFAULT 100,
      status TEXT DEFAULT 'active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (courseId) REFERENCES courses(id),
      FOREIGN KEY (classroomId) REFERENCES classrooms(id),
      FOREIGN KEY (mentorId) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating assignments table:', err);
    } else {
      console.log('✅ Assignments table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE assignments ADD COLUMN status TEXT DEFAULT 'active'`, () => {});
      db.run(`ALTER TABLE assignments ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Attendance table
  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classroomId INTEGER NOT NULL,
      studentId INTEGER NOT NULL,
      date DATE NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late')),
      markedBy INTEGER NOT NULL,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(classroomId) REFERENCES classrooms(id),
      FOREIGN KEY(studentId) REFERENCES users(id),
      FOREIGN KEY(markedBy) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating attendance table:', err);
    } else {
      console.log('✅ Attendance table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE attendance ADD COLUMN notes TEXT`, () => {});
      db.run(`ALTER TABLE attendance ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Announcements table
  db.run(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      authorId INTEGER NOT NULL,
      targetType TEXT,
      targetId INTEGER,
      priority TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (authorId) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating announcements table:', err);
    } else {
      console.log('✅ Announcements table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE announcements ADD COLUMN priority TEXT DEFAULT 'normal'`, () => {});
      db.run(`ALTER TABLE announcements ADD COLUMN status TEXT DEFAULT 'active'`, () => {});
      db.run(`ALTER TABLE announcements ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Calendar events table
  db.run(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      startDate DATETIME NOT NULL,
      endDate DATETIME,
      type TEXT DEFAULT 'general',
      location TEXT,
      organizerId INTEGER,
      status TEXT DEFAULT 'active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (organizerId) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating calendar_events table:', err);
    } else {
      console.log('✅ Calendar events table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE calendar_events ADD COLUMN status TEXT DEFAULT 'active'`, () => {});
      db.run(`ALTER TABLE calendar_events ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Results table
  db.run(`
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      assignmentId INTEGER,
      courseId INTEGER,
      classroomId INTEGER,
      marksObtained INTEGER,
      totalMarks INTEGER DEFAULT 100,
      grade TEXT,
      status TEXT DEFAULT 'published',
      evaluatedBy INTEGER,
      feedback TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(studentId) REFERENCES users(id),
      FOREIGN KEY(assignmentId) REFERENCES assignments(id),
      FOREIGN KEY(courseId) REFERENCES courses(id),
      FOREIGN KEY(classroomId) REFERENCES classrooms(id),
      FOREIGN KEY(evaluatedBy) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating results table:', err);
    } else {
      console.log('✅ Results table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE results ADD COLUMN status TEXT DEFAULT 'published'`, () => {});
      db.run(`ALTER TABLE results ADD COLUMN feedback TEXT`, () => {});
      db.run(`ALTER TABLE results ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Requirements table
  db.run(`
    CREATE TABLE IF NOT EXISTS requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacherId INTEGER,
      teacherName TEXT NOT NULL,
      classroomName TEXT NOT NULL,
      priority TEXT DEFAULT 'medium',
      status TEXT DEFAULT 'pending',
      requestedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (teacherId) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating requirements table:', err);
    } else {
      console.log('✅ Requirements table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE requirements ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Requirement items table
  db.run(`
    CREATE TABLE IF NOT EXISTS requirement_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requirementId INTEGER,
      itemName TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit TEXT,
      status TEXT DEFAULT 'pending',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requirementId) REFERENCES requirements(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating requirement_items table:', err);
    } else {
      console.log('✅ Requirement items table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE requirement_items ADD COLUMN unit TEXT`, () => {});
      db.run(`ALTER TABLE requirement_items ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Expenses table
  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      category TEXT,
      date DATE,
      approvedBy INTEGER,
      status TEXT DEFAULT 'pending',
      receiptUrl TEXT,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (approvedBy) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating expenses table:', err);
    } else {
      console.log('✅ Expenses table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE expenses ADD COLUMN receiptUrl TEXT`, () => {});
      db.run(`ALTER TABLE expenses ADD COLUMN notes TEXT`, () => {});
      db.run(`ALTER TABLE expenses ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Inventory table
  db.run(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      itemName TEXT NOT NULL,
      category TEXT,
      quantity INTEGER DEFAULT 0,
      unitPrice REAL DEFAULT 0,
      vendorId INTEGER,
      purchaseDate DATE,
      description TEXT,
      status TEXT DEFAULT 'available',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vendorId) REFERENCES vendors(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating inventory table:', err);
    } else {
      console.log('✅ Inventory table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE inventory ADD COLUMN status TEXT DEFAULT 'available'`, () => {});
      db.run(`ALTER TABLE inventory ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Vendors table
  db.run(`
    CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      category TEXT,
      rating REAL DEFAULT 0,
      totalOrders INTEGER DEFAULT 0,
      totalValue REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating vendors table:', err);
    } else {
      console.log('✅ Vendors table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE vendors ADD COLUMN status TEXT DEFAULT 'active'`, () => {});
      db.run(`ALTER TABLE vendors ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Chapters table
  db.run(`
    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      courseId INTEGER,
      orderIndex INTEGER,
      content TEXT,
      status TEXT DEFAULT 'active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (courseId) REFERENCES courses(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating chapters table:', err);
    } else {
      console.log('✅ Chapters table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE chapters ADD COLUMN status TEXT DEFAULT 'active'`, () => {});
      db.run(`ALTER TABLE chapters ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Weeks table
  db.run(`
    CREATE TABLE IF NOT EXISTS weeks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      courseId INTEGER,
      weekNumber INTEGER,
      startDate DATE,
      endDate DATE,
      status TEXT DEFAULT 'active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (courseId) REFERENCES courses(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating weeks table:', err);
    } else {
      console.log('✅ Weeks table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE weeks ADD COLUMN status TEXT DEFAULT 'active'`, () => {});
      db.run(`ALTER TABLE weeks ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Assessments table
  db.run(`
    CREATE TABLE IF NOT EXISTS assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT,
      courseId INTEGER,
      classroomId INTEGER,
      mentorId INTEGER,
      totalMarks INTEGER DEFAULT 100,
      duration INTEGER,
      startDate DATETIME,
      endDate DATETIME,
      status TEXT DEFAULT 'draft',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (courseId) REFERENCES courses(id),
      FOREIGN KEY (classroomId) REFERENCES classrooms(id),
      FOREIGN KEY (mentorId) REFERENCES users(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating assessments table:', err);
    } else {
      console.log('✅ Assessments table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE assessments ADD COLUMN status TEXT DEFAULT 'draft'`, () => {});
      db.run(`ALTER TABLE assessments ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Certificates table
  db.run(`
    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      courseId INTEGER,
      certificateType TEXT,
      issueDate DATE,
      certificateUrl TEXT,
      status TEXT DEFAULT 'issued',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (studentId) REFERENCES users(id),
      FOREIGN KEY (courseId) REFERENCES courses(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating certificates table:', err);
    } else {
      console.log('✅ Certificates table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE certificates ADD COLUMN status TEXT DEFAULT 'issued'`, () => {});
      db.run(`ALTER TABLE certificates ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  // Progress table
  db.run(`
    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      studentId INTEGER NOT NULL,
      courseId INTEGER,
      chapterId INTEGER,
      weekId INTEGER,
      completionPercentage REAL DEFAULT 0,
      status TEXT DEFAULT 'not_started',
      lastAccessed DATETIME,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (studentId) REFERENCES users(id),
      FOREIGN KEY (courseId) REFERENCES courses(id),
      FOREIGN KEY (chapterId) REFERENCES chapters(id),
      FOREIGN KEY (weekId) REFERENCES weeks(id)
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error creating progress table:', err);
    } else {
      console.log('✅ Progress table ready');
      
      // Add missing columns
      db.run(`ALTER TABLE progress ADD COLUMN lastAccessed DATETIME`, () => {});
      db.run(`ALTER TABLE progress ADD COLUMN updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});
    }
  });

  console.log('🎉 All LMS database tables initialized successfully!');
}

// Initialize the database
initializeAllTables();

module.exports = { initializeAllTables };
