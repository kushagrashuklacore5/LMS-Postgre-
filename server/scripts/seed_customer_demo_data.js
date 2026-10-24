require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const db = require('../config/database-switch');

async function runSeed() {
  const passwordPlain = 'password';
  const hashedPassword = bcrypt.hashSync(passwordPlain, 10);
  const UNI_ID = 1;

  console.log('🚀 Starting Customer Demo Data Seeding...');

  // Helper promisified run / get / all
  const query = (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  const execute = (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

  // 1. Ensure or update User helper
  async function upsertUser(name, email, role, classroomId = null) {
    const existing = await query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing && existing.length > 0) {
      const id = existing[0].id;
      await execute(
        'UPDATE users SET name = ?, password = ?, role = ?, university_id = ?, isApproved = 1, classroom_id = ? WHERE id = ?',
        [name, hashedPassword, role, UNI_ID, classroomId, id]
      );
      return id;
    } else {
      await execute(
        `INSERT INTO users (name, email, password, role, university_id, isApproved, classroom_id, subscriptionPlan)
         VALUES (?, ?, ?, ?, ?, 1, ?, 'pro')`,
        [name, email, hashedPassword, role, UNI_ID, classroomId]
      );
      const created = await query('SELECT id FROM users WHERE email = ?', [email]);
      return created[0].id;
    }
  }

  // Create Users for each portal
  console.log('👤 Creating/Updating Portal Users...');
  const superadminId = await upsertUser('Super Admin', 'superadmin@gmail.com', 'superadmin');
  const adminId = await upsertUser('Dr. Meenakshi Sundaram (Principal)', 'admin@gmail.com', 'admin');
  const teacher1Id = await upsertUser('Dr. Rajesh Sharma', 'teacher1@gmail.com', 'mentor');
  const teacher2Id = await upsertUser('Prof. Anita Verma', 'teacher2@gmail.com', 'mentor');
  const accountantId = await upsertUser('Suresh Kumar (Accountant)', 'accountant@gmail.com', 'accountant');
  const storekeeperId = await upsertUser('Ramesh Patel (Storekeeper)', 'storekeeper@gmail.com', 'storekeeper');

  // 2. Setup Classroom: Grade 10 - Section A
  console.log('🏫 Setting up Classroom: Grade 10 - A...');
  let classroomId;
  const existingClass = await query('SELECT id FROM classrooms WHERE name = ? AND university_id = ?', ['Grade 10 - A', UNI_ID]);
  if (existingClass && existingClass.length > 0) {
    classroomId = existingClass[0].id;
    await execute(
      'UPDATE classrooms SET grade = ?, section = ?, classTeacher = ?, classTeacherId = ?, studentCount = 5 WHERE id = ?',
      ['10', 'A', 'Dr. Rajesh Sharma', teacher1Id, classroomId]
    );
  } else {
    await execute(
      `INSERT INTO classrooms (university_id, name, grade, section, classTeacher, classTeacherId, studentCount)
       VALUES (?, 'Grade 10 - A', '10', 'A', 'Dr. Rajesh Sharma', ?, 5)`,
      [UNI_ID, teacher1Id]
    );
    const createdClass = await query('SELECT id FROM classrooms WHERE name = ? AND university_id = ?', ['Grade 10 - A', UNI_ID]);
    classroomId = createdClass[0].id;
  }

  // Assign teachers to Classroom
  await execute('DELETE FROM classroomAssignments WHERE classroomId = ?', [classroomId]);
  await execute('INSERT INTO classroomAssignments (classroomId, teacherId, role) VALUES (?, ?, ?)', [classroomId, teacher1Id, 'class_teacher']);
  await execute('INSERT INTO classroomAssignments (classroomId, teacherId, role) VALUES (?, ?, ?)', [classroomId, teacher2Id, 'subject_teacher']);

  // 3. Create 5 Students and link to classroom
  console.log('🎓 Creating/Updating 5 Students...');
  const studentData = [
    { name: 'Aarav Sharma', email: 'student1@gmail.com', roll: '101' },
    { name: 'Diya Patel', email: 'student2@gmail.com', roll: '102' },
    { name: 'Rohan Gupta', email: 'student3@gmail.com', roll: '103' },
    { name: 'Sneha Iyer', email: 'student4@gmail.com', roll: '104' },
    { name: 'Kabir Mehta', email: 'student5@gmail.com', roll: '105' },
  ];

  const studentIds = [];
  for (const s of studentData) {
    const sId = await upsertUser(s.name, s.email, 'student', classroomId);
    studentIds.push(sId);

    // Update students table
    const existingStudentRow = await query('SELECT id FROM students WHERE userId = ?', [sId]);
    if (existingStudentRow && existingStudentRow.length > 0) {
      await execute(
        'UPDATE students SET studentId = ?, grade = ?, rollNumber = ?, totalFees = 15000, feesPaid = 10000, pendingFees = 5000 WHERE userId = ?',
        [`STU${s.roll}`, '10', s.roll, sId]
      );
    } else {
      await execute(
        'INSERT INTO students (userId, studentId, grade, rollNumber, totalFees, feesPaid, pendingFees) VALUES (?, ?, ?, ?, 15000, 10000, 5000)',
        [sId, `STU${s.roll}`, '10', s.roll]
      );
    }

    // Link classroom assignment
    const assignCheck = await query('SELECT id FROM student_classroom_assignment WHERE studentId = ? AND classroomId = ?', [sId, classroomId]);
    if (!assignCheck || assignCheck.length === 0) {
      await execute('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?)', [sId, classroomId]);
    }
  }

  // 4. Create Courses
  console.log('📚 Setting up Subject Courses & Chapters...');
  const coursesToSeed = [
    {
      title: 'Physics: Mechanics, Waves & Optics',
      description: 'Comprehensive study of classical mechanics, gravitational fields, wave optics, and electromagnetic principles.',
      category: 'Physics',
      mentorId: teacher1Id,
      duration: '12 Weeks',
      chapters: [
        { title: 'Chapter 1: Newton’s Laws & Particle Dynamics', description: 'Fundamentals of linear force, inertia, and equilibrium systems.' },
        { title: 'Chapter 2: Work, Energy & Conservation Theorems', description: 'Kinetic potential balance and conservative fields.' },
        { title: 'Chapter 3: Wave Optics & Dispersion Spectrum', description: 'Wave interference, diffraction, and refractive geometry.' },
      ]
    },
    {
      title: 'Advanced Mathematics: Calculus & Geometry',
      description: 'Differential calculus, integral evaluation, and 3-dimensional coordinate geometry with proofs and problem solving.',
      category: 'Mathematics',
      mentorId: teacher1Id,
      duration: '14 Weeks',
      chapters: [
        { title: 'Chapter 1: Limits, Continuity & Derivatives', description: 'Core principles of instantaneous rate of change.' },
        { title: 'Chapter 2: Integral Calculus & Area under Curves', description: 'Definite integrals, substitution, and standard forms.' },
        { title: 'Chapter 3: Analytical Solid Geometry & Vectors', description: 'Lines, planes, spheres, and dot/cross vector algebra.' },
      ]
    },
    {
      title: 'Chemistry: Organic Compounds & Reactions',
      description: 'Structure, bonding, nomenclature, and functional group mechanisms in organic and inorganic chemistry.',
      category: 'Chemistry',
      mentorId: teacher2Id,
      duration: '10 Weeks',
      chapters: [
        { title: 'Chapter 1: Chemical Bonding & Molecular Geometry', description: 'Hybridization, Lewis structures, and polarity.' },
        { title: 'Chapter 2: Aliphatic and Aromatic Hydrocarbons', description: 'Alkanes, alkenes, benzene rings, and electrophilic substitution.' },
        { title: 'Chapter 3: Solutions, pH & Ionic Equilibria', description: 'Acids, bases, buffer systems, and titration curves.' },
      ]
    },
    {
      title: 'Biology: Cell Biology & Human Anatomy',
      description: 'Cellular genetics, metabolic pathways, DNA replication, and human organ system physiology.',
      category: 'Biology',
      mentorId: teacher2Id,
      duration: '10 Weeks',
      chapters: [
        { title: 'Chapter 1: The Molecular Architecture of Cells', description: 'Organelles, membrane transport, and ATP synthesis.' },
        { title: 'Chapter 2: DNA Replication, Transcription & Translation', description: 'Genetic code expression and chromosomal heredity.' },
        { title: 'Chapter 3: The Human Circulatory & Immune System', description: 'Cardiac cycle, vascular pressure, and lymphatic defense.' },
      ]
    },
    {
      title: 'Computer Science: Python Programming',
      description: 'Logic building, object-oriented concepts, algorithms, and practical application development using modern Python.',
      category: 'Coding',
      mentorId: teacher1Id,
      duration: '8 Weeks',
      chapters: [
        { title: 'Chapter 1: Python Fundamentals & Data Structures', description: 'Variables, lists, tuples, dictionaries, and flow control.' },
        { title: 'Chapter 2: Object-Oriented Design & Functions', description: 'Classes, inheritance, polymorphism, and modular scripts.' },
        { title: 'Chapter 3: Algorithmic Thinking & Automation', description: 'Searching, sorting, recursion, and file manipulation.' },
      ]
    }
  ];

  for (const c of coursesToSeed) {
    let courseId;
    const existing = await query('SELECT id FROM courses WHERE title = ? AND university_id = ?', [c.title, UNI_ID]);
    if (existing && existing.length > 0) {
      courseId = existing[0].id;
      await execute(
        'UPDATE courses SET description = ?, mentorId = ?, classroomId = ?, category = ?, duration = ? WHERE id = ?',
        [c.description, c.mentorId, classroomId, c.category, c.duration, courseId]
      );
    } else {
      await execute(
        `INSERT INTO courses (title, description, mentorId, classroomId, category, duration, price, university_id)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        [c.title, c.description, c.mentorId, classroomId, c.category, c.duration, UNI_ID]
      );
      const created = await query('SELECT id FROM courses WHERE title = ? AND university_id = ?', [c.title, UNI_ID]);
      courseId = created[0].id;
    }

    // Link Course with Classroom
    const ccCheck = await query('SELECT id FROM course_classrooms WHERE courseId = ? AND classroomId = ?', [courseId, classroomId]);
    if (!ccCheck || ccCheck.length === 0) {
      await execute('INSERT INTO course_classrooms (courseId, classroomId, assignedBy, enrollAll) VALUES (?, ?, ?, 1)', [courseId, classroomId, adminId]);
    }

    // Enroll all 5 students into the course
    for (const studentId of studentIds) {
      const csCheck = await query('SELECT id FROM course_students WHERE courseId = ? AND studentId = ?', [courseId, studentId]);
      if (!csCheck || csCheck.length === 0) {
        await execute('INSERT INTO course_students (courseId, studentId, enrolledViaClassroomId) VALUES (?, ?, ?)', [courseId, studentId, classroomId]);
      }
    }

    // Seed Chapters for this course
    for (let i = 0; i < c.chapters.length; i++) {
      const ch = c.chapters[i];
      const chCheck = await query('SELECT id FROM chapters WHERE courseId = ? AND title = ?', [courseId, ch.title]);
      if (!chCheck || chCheck.length === 0) {
        await execute('INSERT INTO chapters (courseId, title, description, "order") VALUES (?, ?, ?, ?)', [courseId, ch.title, ch.description, i + 1]);
      }
    }
  }

  console.log('\n✅ SEEDING COMPLETE! All portals, teachers, courses, and students are linked.');
  process.exit(0);
}

runSeed().catch(err => {
  console.error('❌ Error during demo seeding:', err);
  process.exit(1);
});
