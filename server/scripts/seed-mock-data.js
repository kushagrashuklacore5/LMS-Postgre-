// Development only: fills the local SQLite database with mock users and data.
// Usage: node scripts/seed-mock-data.js   (safe to re-run; skips users that already exist)
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { DB_PATH } = require('../config/dbPath');

if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed mock data in production');

const PASSWORD = 'Demo@1234';
const UNI = 1;
const db = new Database(DB_PATH);
// Match the server, which does not enforce foreign keys: the payments.studentId FK
// points at students.id, but the app stores (and joins on) users.id there.
db.pragma('foreign_keys = OFF');
const hash = bcrypt.hashSync(PASSWORD, 10);

const userId = (name, email, role, classroomId = null) => {
  const found = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (found) return found.id;
  return db.prepare(`INSERT INTO users (name, email, password, role, university_id, isApproved, classroom_id, subscriptionPlan)
    VALUES (?, ?, ?, ?, ?, 1, ?, 'free')`).run(name, email, hash, role, UNI, classroomId).lastInsertRowid;
};

const seed = db.transaction(() => {
  const created = [];
  const add = (name, email, role, classroomId) => {
    const id = userId(name, email, role, classroomId);
    created.push({ role, name, email, password: PASSWORD });
    return id;
  };

  add('Riya Sharma', 'riya.admin@demo.com', 'admin');
  add('Karan Mehta', 'karan.accounts@demo.com', 'accountant');
  add('Pooja Iyer', 'pooja.store@demo.com', 'storekeeper');

  const mentors = [
    ['Anil Verma', 'anil.mentor@demo.com', 'Mathematics'],
    ['Neha Kapoor', 'neha.mentor@demo.com', 'Science'],
    ['Suresh Nair', 'suresh.mentor@demo.com', 'English'],
  ].map(([n, e, subject]) => ({ id: add(n, e, 'mentor'), subject }));

  const classrooms = [['Grade 6', '6', 'A'], ['Grade 8', '8', 'B']].map(([name, grade, section], i) => {
    const existing = db.prepare('SELECT id FROM classrooms WHERE university_id = ? AND name = ? AND section = ?').get(UNI, name, section);
    const id = existing ? existing.id : db.prepare(`INSERT INTO classrooms (university_id, name, grade, section, classTeacher, classTeacherId, studentCount)
      VALUES (?, ?, ?, ?, ?, ?, 0)`).run(UNI, name, grade, section, String(mentors[i].id), mentors[i].id).lastInsertRowid;
    if (!existing) db.prepare('INSERT INTO classroomAssignments (classroomId, teacherId) VALUES (?, ?)').run(id, mentors[i].id);
    return { id, grade };
  });

  const courseIds = [];
  for (const c of classrooms) {
    for (const m of mentors) {
      const title = `${m.subject} - Grade ${c.grade}`;
      const existing = db.prepare('SELECT id FROM courses WHERE title = ? AND university_id = ?').get(title, UNI);
      const id = existing ? existing.id : db.prepare(`INSERT INTO courses (title, description, mentorId, classroomId, category, duration, price, university_id)
        VALUES (?, ?, ?, ?, ?, '1 year', 0, ?)`).run(title, `${m.subject} curriculum for grade ${c.grade}`, m.id, c.id, m.subject, UNI).lastInsertRowid;
      if (!existing) db.prepare('INSERT INTO course_classrooms (courseId, classroomId, assignedBy, enrollAll) VALUES (?, ?, ?, 1)').run(id, c.id, 2);
      courseIds.push({ id, classroomId: c.id });
    }
  }

  const studentNames = ['Aarav Gupta', 'Diya Patel', 'Ishaan Reddy', 'Ananya Singh', 'Vivaan Joshi', 'Saanvi Rao', 'Arjun Das', 'Meera Pillai'];
  const today = new Date();
  const day = (offset) => new Date(today.getTime() - offset * 864e5).toISOString().slice(0, 10);

  studentNames.forEach((name, i) => {
    const c = classrooms[i % 2];
    const email = `${name.split(' ')[0].toLowerCase()}.student@demo.com`;
    const isNew = !db.prepare('SELECT 1 FROM users WHERE email = ?').get(email);
    const id = add(name, email, 'student', c.id);
    if (!isNew) return;

    const fee = 12100; // "Secondary" (grades 5-12) fee structure total
    const paid = i % 3 === 0 ? fee : i % 3 === 1 ? fee / 2 : 0;
    db.prepare(`INSERT INTO students (userId, studentId, grade, rollNumber, totalFees, feesPaid, pendingFees) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, `STU${1000 + id}`, c.grade, String(i + 1), fee, paid, fee - paid);
    db.prepare('INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?)').run(id, c.id);
    for (const co of courseIds.filter(x => x.classroomId === c.id)) {
      db.prepare('INSERT INTO course_students (courseId, studentId, enrolledViaClassroomId) VALUES (?, ?, ?)').run(co.id, id, c.id);
    }
    if (paid > 0) {
      db.prepare(`INSERT INTO payments (studentId, amount, amountPaise, type, status, transactionId, description, paymentMethod, receiptNo, recordedBy, createdAt)
        VALUES (?, ?, ?, 'fee', 'success', ?, 'Tuition fee', 'cash', ?, 5, ?)`)
        .run(id, paid, paid * 100, `MOCK-TXN-${id}`, `RCPT-${2000 + id}`, day(i * 3));
    }
    for (let d = 1; d <= 10; d++) {
      db.prepare('INSERT INTO attendance (classroomId, studentId, date, status, markedBy) VALUES (?, ?, ?, ?, ?)')
        .run(c.id, id, day(d), (i + d) % 7 === 0 ? 'absent' : 'present', mentors[classrooms.indexOf(c)].id);
    }
    const subjects = mentors.map((m, k) => ({ subject: m.subject, marks: 60 + ((i * 7 + k * 11) % 38), maxMarks: 100 }));
    const pct = subjects.reduce((s, x) => s + x.marks, 0) / subjects.length;
    db.prepare(`INSERT INTO results (classroomId, studentId, term, subjects, overallPercentage, overallStatus, comments) VALUES (?, ?, 'Term 1', ?, ?, ?, ?)`)
      .run(c.id, id, JSON.stringify(subjects), Math.round(pct * 10) / 10, pct >= 40 ? 'Pass' : 'Fail', 'Mock result');
  });

  for (const c of classrooms) {
    const n = db.prepare('SELECT COUNT(*) n FROM student_classroom_assignment WHERE classroomId = ?').get(c.id).n;
    db.prepare('UPDATE classrooms SET studentCount = ? WHERE id = ?').run(n, c.id);
  }

  if (!db.prepare("SELECT 1 FROM announcements WHERE title = 'Welcome to the new term'").get()) {
    db.prepare(`INSERT INTO announcements (university_id, title, content, createdByUser, createdByRole, publishFor, priority)
      VALUES (?, 'Welcome to the new term', 'Classes begin Monday. Please check your timetable.', 2, 'admin', 'all', 'high')`).run(UNI);
    db.prepare(`INSERT INTO announcements (university_id, title, content, createdByUser, createdByRole, publishFor, priority)
      VALUES (?, 'Fee due reminder', 'Term 1 fees are due by the end of this month.', 2, 'admin', 'all', 'medium')`).run(UNI);
    const ev = (t, offset) => {
      const s = new Date(today.getTime() + offset * 864e5); s.setHours(10, 0, 0, 0);
      const e = new Date(s.getTime() + 2 * 36e5);
      db.prepare(`INSERT INTO calendar_events (title, description, startDate, endDate, publishFor, createdByUser, createdByRole, university_id)
        VALUES (?, ?, ?, ?, 'all', 2, 'admin', ?)`).run(t, t, s.toISOString(), e.toISOString(), UNI);
    };
    ev('Parent-Teacher Meeting', 3); ev('Science Fair', 7); ev('Mid-term Exams Begin', 14);
  }

  return created;
});

const created = seed();
console.table(created);
console.log(`\nAll mock accounts use password: ${PASSWORD}`);
