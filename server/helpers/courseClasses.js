/**
 * Courses taught to classes, and the two teacher views of who takes a course.
 *
 * A course's classes are its home class (courses.classroomId) and every class in
 * course_classrooms. Being in one of those classes does NOT by itself give a student the
 * course: only an enrolment in course_students does. When the admin assigns a course to a class
 * they choose its scope:
 *   all       every student of the class is enrolled, and students who join the class later too
 *             (course_classrooms.enrollAll = 1)
 *   selected  only the students the admin picked (enrollAll = 0); later joiners are not enrolled
 *
 * Who may do what:
 *   admin   -> assign or remove classes for courses of their school; see any roster of it
 *   teacher -> see the rosters of the courses they teach (courses.mentorId); nothing else
 */
const { get, all, run, withTransaction } = require('./dbAsync');
const { HttpError } = require('./teachingScope');

/** SQL: the ids of the classes of the course whose id is the SQL expression `course`. */
const COURSE_CLASS_IDS = (course) =>
  `SELECT cc.classroomId FROM course_classrooms cc WHERE cc.courseId = ${course}
   UNION SELECT hc.classroomId FROM courses hc WHERE hc.id = ${course} AND hc.classroomId IS NOT NULL`;

/** "12-A" when the class has a grade and a section, otherwise its name. */
const classLabel = (classroom) => {
  if (!classroom) return 'No class';
  const grade = String(classroom.grade ?? '').trim();
  const section = String(classroom.section ?? '').trim();
  if (grade && section) return `${grade}-${section}`;
  return classroom.name || grade || `Class ${classroom.id}`;
};

/**
 * Enrols a student who joins a class in that class's "all students" courses. Idempotent.
 * A home class that has no course_classrooms row yet (a course created by an older code path)
 * counts as "all students", which is how it behaved before.
 */
const enrollStudentInClassCourses = (studentId, classroomId) =>
  run(
    `INSERT INTO course_students (courseId, studentId, enrolledViaClassroomId)
     SELECT courseId, CAST(? AS BIGINT), CAST(? AS BIGINT) FROM course_classrooms WHERE classroomId = ? AND enrollAll = 1
     UNION SELECT co.id, CAST(? AS BIGINT), CAST(? AS BIGINT) FROM courses co WHERE co.classroomId = ?
       AND NOT EXISTS (SELECT 1 FROM course_classrooms cc WHERE cc.courseId = co.id AND cc.classroomId = co.classroomId)
     ON CONFLICT DO NOTHING`,
    [studentId, classroomId, classroomId, studentId, classroomId, classroomId]
  );

const caller = (req) => {
  const role = req.user?.role;
  const isAdmin = role === 'admin';
  const isTeacher = role === 'mentor' || role === 'teacher';
  if (!req.user?.userId || (!isAdmin && !isTeacher)) throw new HttpError(403, 'Access denied');
  return { userId: Number(req.user.userId), universityId: Number(req.user.universityId), isAdmin };
};

const positiveId = (value, what) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `Invalid ${what}`);
  return id;
};

/** The course, if the caller may see its students; otherwise 404 (other school) or 403. */
const courseForCaller = async (req, courseId) => {
  const user = caller(req);
  const course = await get('SELECT id, title, mentorId, classroomId, university_id FROM courses WHERE id = ?', [positiveId(courseId, 'course')]);
  if (!course || Number(course.university_id) !== user.universityId) throw new HttpError(404, 'Course not found');
  if (!user.isAdmin && Number(course.mentorId) !== user.userId) throw new HttpError(403, 'You do not teach this course');
  return { course, user };
};

/* ================= CLASSES OF A COURSE ================= */
async function listCourseClasses(req, courseId) {
  const { course } = await courseForCaller(req, courseId);
  const classes = await all(
    `SELECT c.id, c.name, c.grade, c.section,
            (SELECT COUNT(*) FROM student_classroom_assignment sca JOIN users u ON u.id = sca.studentId
              WHERE sca.classroomId = c.id AND u.role = 'student') AS classSize,
            (SELECT COUNT(*) FROM course_students cs JOIN student_classroom_assignment sca ON sca.studentId = cs.studentId
              WHERE cs.courseId = ? AND sca.classroomId = c.id) AS enrolled,
            (SELECT cc.enrollAll FROM course_classrooms cc WHERE cc.courseId = ? AND cc.classroomId = c.id) AS enrollAll
     FROM classrooms c WHERE c.id IN (${COURSE_CLASS_IDS('?')}) ORDER BY c.grade, c.section, c.name`,
    [course.id, course.id, course.id, course.id]
  );
  return classes.map((c) => ({
    id: c.id, label: classLabel(c), name: c.name, grade: c.grade, section: c.section, classSize: c.classSize, enrolled: c.enrolled,
    scope: c.enrollAll === 0 ? 'selected' : 'all', isHome: Number(c.id) === Number(course.classroomId),
  }));
}

/**
 * Checks a class assignment before anything is written.
 *   scope 'all'      (default) every current student of each class is enrolled, and later joiners
 *   scope 'selected' only studentIds are enrolled; each must be a student of one of the classes
 * Returns the classes (in the order given: the first is a new course's home class) and, for
 * 'selected', the class each chosen student is enrolled through.
 */
async function checkAssignment(user, classroomIds, { scope = 'all', studentIds } = {}) {
  if (!['all', 'selected'].includes(scope)) throw new HttpError(400, 'scope must be "all" or "selected"');
  if (!Array.isArray(classroomIds) || classroomIds.length === 0) throw new HttpError(400, 'Choose at least one class');
  const ids = [...new Set(classroomIds.map((id) => positiveId(id, 'class')))];
  if (ids.length > 200) throw new HttpError(400, 'Too many classes in one request');
  const found = await all(`SELECT id, name, grade, section, university_id FROM classrooms WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  if (found.length !== ids.length || found.some((c) => Number(c.university_id) !== user.universityId)) {
    throw new HttpError(404, 'Class not found');
  }
  const byId = new Map(found.map((c) => [Number(c.id), c]));

  // For 'selected': which class each chosen student belongs to (one of the classes named)
  const chosenClassOf = new Map();
  if (scope === 'selected') {
    if (!Array.isArray(studentIds) || studentIds.length === 0) throw new HttpError(400, 'Choose at least one student');
    const sids = [...new Set(studentIds.map((id) => positiveId(id, 'student')))];
    if (sids.length > 2000) throw new HttpError(400, 'Too many students in one request');
    const members = await all(
      `SELECT sca.studentId, sca.classroomId FROM student_classroom_assignment sca JOIN users u ON u.id = sca.studentId
       WHERE u.role = 'student' AND u.university_id = ? AND sca.studentId IN (${sids.map(() => '?').join(',')})
         AND sca.classroomId IN (${ids.map(() => '?').join(',')})`,
      [user.universityId, ...sids, ...ids]
    );
    members.forEach((m) => { if (!chosenClassOf.has(Number(m.studentId))) chosenClassOf.set(Number(m.studentId), Number(m.classroomId)); });
    const outside = sids.filter((id) => !chosenClassOf.has(id));
    if (outside.length > 0) throw new HttpError(400, `${outside.length} selected student(s) are not in the chosen class(es)`);
  }
  return { classes: ids.map((id) => byId.get(id)), scope, chosenClassOf };
}

/**
 * Writes a checked assignment; the caller runs it inside a transaction.
 * Students already enrolled (individually or through another class) are left as they are, so no
 * enrolment is duplicated and an individual exception keeps its origin. Assigning 'all' to a class
 * that was 'selected' widens it; assigning 'selected' never narrows an 'all' class.
 * Returns, per class: its size, how many were enrolled now, how many already were.
 */
async function applyAssignment(course, user, { classes, scope, chosenClassOf }) {
  const results = [];
  for (const classroom of classes) {
    const link = await run('INSERT INTO course_classrooms (courseId, classroomId, assignedBy, enrollAll) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING',
      [course.id, classroom.id, user.userId, scope === 'all' ? 1 : 0]);
    if (scope === 'all' && link.changes === 0) await run('UPDATE course_classrooms SET enrollAll = 1 WHERE courseId = ? AND classroomId = ?', [course.id, classroom.id]);
    const size = (await get(
      `SELECT COUNT(DISTINCT sca.studentId) AS n FROM student_classroom_assignment sca JOIN users u ON u.id = sca.studentId
       WHERE sca.classroomId = ? AND u.role = 'student' AND u.university_id = ?`,
      [classroom.id, user.universityId]
    )).n;
    let wanted;
    let added;
    if (scope === 'all') {
      wanted = size;
      added = await run(
        `INSERT INTO course_students (courseId, studentId, enrolledViaClassroomId)
         SELECT DISTINCT CAST(? AS BIGINT), sca.studentId, CAST(? AS BIGINT) FROM student_classroom_assignment sca JOIN users u ON u.id = sca.studentId
         WHERE sca.classroomId = ? AND u.role = 'student' AND u.university_id = ?
         ON CONFLICT DO NOTHING`,
        [course.id, classroom.id, classroom.id, user.universityId]
      );
    } else {
      const mine = [...chosenClassOf].filter(([, cid]) => cid === Number(classroom.id)).map(([sid]) => sid);
      wanted = mine.length;
      added = { changes: 0 };
      for (const sid of mine) {
        const r = await run('INSERT INTO course_students (courseId, studentId, enrolledViaClassroomId) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [course.id, sid, classroom.id]);
        added.changes += r.changes;
      }
    }
    results.push({
      classroomId: classroom.id,
      label: classLabel(classroom),
      scope: (await get('SELECT enrollAll FROM course_classrooms WHERE courseId = ? AND classroomId = ?', [course.id, classroom.id])).enrollAll === 1 ? 'all' : 'selected',
      newlyAssigned: link.changes > 0,
      students: size,
      selected: wanted,
      enrolledNow: added.changes,
      alreadyEnrolled: wanted - added.changes,
    });
  }
  // A course without a home class takes the first class assigned to it, so the class views
  // that read the home class show it too.
  if (!course.classroomId) await run('UPDATE courses SET classroomId = ? WHERE id = ? AND classroomId IS NULL', [classes[0].id, course.id]);
  return results;
}

/** Assigns an existing course to more classes (see checkAssignment for the scopes). */
async function assignCourseToClasses(req, courseId, classroomIds, { scope = 'all', studentIds } = {}) {
  const user = caller(req);
  if (!user.isAdmin) throw new HttpError(403, 'Only an admin assigns courses to classes');
  const { course } = await courseForCaller(req, courseId);
  const plan = await checkAssignment(user, classroomIds, { scope, studentIds });
  return withTransaction(() => applyAssignment(course, user, plan));
}

/**
 * Creates a course for its classes in one transaction: the course, its class assignments and its
 * enrolments are saved together, or nothing is (no course is left without its classes).
 * Everything is checked before the transaction starts.
 */
async function createCourseWithClasses(req, { title, description, category, duration, price, mentorId, classroomIds, scope = 'all', studentIds } = {}) {
  const user = caller(req);
  if (!user.isAdmin) throw new HttpError(403, 'Only an admin creates a course for classes');
  const name = String(title ?? '').trim();
  if (!name) throw new HttpError(400, 'Course title is required');
  const teacherId = Number(mentorId);
  const mentor = Number.isInteger(teacherId) && teacherId > 0
    ? await get("SELECT id, name FROM users WHERE id = ? AND role IN ('mentor', 'teacher') AND university_id = ?", [teacherId, user.universityId])
    : null;
  if (!mentor) throw new HttpError(400, 'Choose a teacher of your school');
  const plan = await checkAssignment(user, classroomIds, { scope, studentIds });

  return withTransaction(async () => {
    const homeId = plan.classes[0].id;
    const inserted = await run(
      'INSERT INTO courses (title, description, category, duration, mentorId, price, classroomId, university_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, description || '', category || '', duration || 0, mentor.id, price || 0, homeId, user.universityId]
    );
    const course = { id: inserted.lastID, title: name, mentorId: mentor.id, classroomId: homeId };
    const classes = await applyAssignment(course, user, plan);
    return {
      course: { ...course, _id: course.id, description: description || '', category: category || '', duration: duration || 0, price: price || 0, mentorName: mentor.name },
      classes,
      totalStudents: (await get('SELECT COUNT(*) AS n FROM course_students WHERE courseId = ?', [course.id])).n,
    };
  });
}

/**
 * Removes a class from a course. Enrolments that this class assignment created are removed;
 * individual enrolments and enrolments through another class stay, and so do the students'
 * accounts, class memberships, marks and submissions. A course keeps at least one class: its home
 * class can be removed only while another class is assigned, which then becomes the home class.
 */
async function removeCourseClass(req, courseId, classroomId) {
  const user = caller(req);
  if (!user.isAdmin) throw new HttpError(403, 'Only an admin assigns courses to classes');
  const { course } = await courseForCaller(req, courseId);
  const id = positiveId(classroomId, 'class');

  return withTransaction(async () => {
    const isHome = Number(course.classroomId) === id;
    let newHome = null;
    if (isHome) {
      const other = await get('SELECT classroomId FROM course_classrooms WHERE courseId = ? AND classroomId != ? ORDER BY createdAt, classroomId LIMIT 1', [course.id, id]);
      if (!other) throw new HttpError(400, 'A course needs at least one class: assign another class before removing this one');
      newHome = other.classroomId;
    }
    const link = await run('DELETE FROM course_classrooms WHERE courseId = ? AND classroomId = ?', [course.id, id]);
    if (link.changes === 0 && !isHome) throw new HttpError(404, 'This class is not assigned to the course');
    if (newHome) await run('UPDATE courses SET classroomId = ? WHERE id = ?', [newHome, course.id]);
    const removed = await run('DELETE FROM course_students WHERE courseId = ? AND enrolledViaClassroomId = ?', [course.id, id]);
    return { classroomId: id, enrolmentsRemoved: removed.changes, newHomeClassroomId: newHome };
  });
}

/* ================= THE STUDENTS OF ONE CLASS, FOR ONE COURSE ================= */
// A class of the course (its home class or an assigned one) of the caller's school; 404 otherwise.
async function classOfCourse(course, classroomId, user) {
  const classroom = await get(
    `SELECT id, name, grade, section FROM classrooms WHERE id = ? AND university_id = ? AND id IN (${COURSE_CLASS_IDS('?')})`,
    [positiveId(classroomId, 'class'), user.universityId, course.id, course.id]
  );
  if (!classroom) throw new HttpError(404, 'This class is not assigned to the course');
  return classroom;
}

// Every student of the class, each with whether they are enrolled in the course
const classMembers = (course, classroom, user) =>
  all(
    `SELECT u.id, u.name, u.email,
            (SELECT s.rollNumber FROM students s WHERE s.userId = u.id LIMIT 1) AS rollNumber,
            EXISTS (SELECT 1 FROM course_students cs WHERE cs.courseId = ? AND cs.studentId = u.id) AS enrolled
     FROM users u
     WHERE u.role = 'student' AND u.university_id = ?
       AND u.id IN (SELECT sca.studentId FROM student_classroom_assignment sca WHERE sca.classroomId = ?)
     ORDER BY LOWER(u.name)`,
    [course.id, user.universityId, classroom.id]
  );

const scopeOf = async (course, classroom) => {
  const link = await get('SELECT enrollAll FROM course_classrooms WHERE courseId = ? AND classroomId = ?', [course.id, classroom.id]);
  return !link || link.enrollAll === 1 ? 'all' : 'selected';
};

/**
 * The complete roster of one class of the course, for the admin: every student of the class,
 * ticked when enrolled in the course. Students of other classes or schools never appear.
 * (A teacher sees only the enrolled students, through courseRoster.)
 */
async function courseClassRoster(req, courseId, classroomId) {
  const user = caller(req);
  if (!user.isAdmin) throw new HttpError(403, 'Only an admin manages who takes a course');
  const { course } = await courseForCaller(req, courseId);
  const classroom = await classOfCourse(course, classroomId, user);
  const students = (await classMembers(course, classroom, user)).map((s) => ({ ...s, enrolled: s.enrolled === 1 }));
  return {
    course: { id: course.id, title: course.title },
    classroom: { id: classroom.id, label: classLabel(classroom) },
    scope: await scopeOf(course, classroom),
    isHome: Number(course.classroomId) === Number(classroom.id),
    classSize: students.length,
    enrolled: students.filter((s) => s.enrolled).length,
    students,
  };
}

/**
 * Sets who of one class takes the course.
 *   studentIds  the students of this class who should be enrolled; the others of this class are
 *               unenrolled (only their course_students row: account, class, marks, submissions stay)
 *   scope 'all' enrols the whole class and students who join it later (studentIds are ignored)
 * Removing anyone makes the class "selected students", so a later joiner is not enrolled either.
 */
async function setClassEnrolment(req, courseId, classroomId, { studentIds, scope } = {}) {
  const user = caller(req);
  if (!user.isAdmin) throw new HttpError(403, 'Only an admin manages who takes a course');
  const { course } = await courseForCaller(req, courseId);
  const classroom = await classOfCourse(course, classroomId, user);
  if (scope !== undefined && !['all', 'selected'].includes(scope)) throw new HttpError(400, 'scope must be "all" or "selected"');
  let wanted = null;
  if (scope !== 'all') {
    if (!Array.isArray(studentIds)) throw new HttpError(400, 'studentIds must be a list');
    if (studentIds.length > 2000) throw new HttpError(400, 'Too many students in one request');
    wanted = new Set(studentIds.map((id) => positiveId(id, 'student')));
  }

  return withTransaction(async () => {
    const members = await classMembers(course, classroom, user);
    const memberIds = new Set(members.map((m) => Number(m.id)));
    if (wanted) {
      const outside = [...wanted].filter((id) => !memberIds.has(id));
      if (outside.length > 0) throw new HttpError(400, `${outside.length} selected student(s) are not in ${classLabel(classroom)}`);
    }
    const add = members.filter((m) => m.enrolled !== 1 && (!wanted || wanted.has(Number(m.id))));
    const remove = wanted ? members.filter((m) => m.enrolled === 1 && !wanted.has(Number(m.id))) : [];
    for (const m of add) {
      await run('INSERT INTO course_students (courseId, studentId, enrolledViaClassroomId) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [course.id, m.id, classroom.id]);
    }
    for (const m of remove) {
      await run('DELETE FROM course_students WHERE courseId = ? AND studentId = ?', [course.id, m.id]);
    }
    // the class's scope: 'all' when asked for, 'selected' once anyone of it is removed
    const enrollAll = scope === 'all' ? 1 : remove.length > 0 ? 0 : null;
    if (enrollAll !== null) {
      await run('INSERT INTO course_classrooms (courseId, classroomId, assignedBy, enrollAll) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', [course.id, classroom.id, user.userId, enrollAll]);
      await run('UPDATE course_classrooms SET enrollAll = ? WHERE courseId = ? AND classroomId = ?', [enrollAll, course.id, classroom.id]);
    }
    const enrolled = (await get(
      `SELECT COUNT(*) AS n FROM course_students cs WHERE cs.courseId = ?
         AND cs.studentId IN (SELECT sca.studentId FROM student_classroom_assignment sca WHERE sca.classroomId = ?)`,
      [course.id, classroom.id]
    )).n;
    return {
      classroomId: classroom.id,
      label: classLabel(classroom),
      scope: await scopeOf(course, classroom),
      added: add.map((m) => ({ id: m.id, name: m.name })),
      removed: remove.map((m) => ({ id: m.id, name: m.name })),
      classSize: members.length,
      enrolled,
    };
  });
}

/* ================= WHO TAKES WHICH COURSE ================= */
// Rows { courseId, studentId, name, email, rollNumber }: the students enrolled in the given
// courses (course_students), students of the given school only.
async function enrolledStudents(courseIds, universityId) {
  if (courseIds.length === 0) return [];
  return all(
    `SELECT cs.courseId, u.id AS studentId, u.name, u.email, s.rollNumber
     FROM course_students cs
     JOIN users u ON u.id = cs.studentId AND u.role = 'student' AND u.university_id = ?
     LEFT JOIN students s ON s.userId = u.id
     WHERE cs.courseId IN (${courseIds.map(() => '?').join(',')})
     ORDER BY LOWER(u.name)`,
    [universityId, ...courseIds]
  );
}

// The class each student is shown under for a course: a class of the course if the student
// is in one, otherwise any class of theirs, otherwise none.
async function classOfStudents(studentIds, courseClassIds) {
  if (studentIds.length === 0) return new Map();
  const rows = await all(
    `SELECT sca.studentId, c.id, c.name, c.grade, c.section FROM student_classroom_assignment sca
     JOIN classrooms c ON c.id = sca.classroomId WHERE sca.studentId IN (${studentIds.map(() => '?').join(',')})
     ORDER BY sca.createdAt`,
    studentIds
  );
  const preferred = new Map();
  for (const row of rows) {
    const current = preferred.get(row.studentId);
    const inCourse = courseClassIds.has(Number(row.id));
    if (!current || (inCourse && !current.inCourse)) preferred.set(row.studentId, { classroom: row, inCourse });
  }
  return new Map([...preferred].map(([studentId, value]) => [studentId, value.classroom]));
}

/**
 * The students of one course, grouped by class.
 *   inClass     -> only that class (the class-first view)
 *   q           -> name, email or roll number contains q (case-insensitive)
 * `classes` always lists every group with its full count, for filter buttons.
 */
async function courseRoster(req, courseId, { inClass: classroomId, q } = {}) {
  const { course, user } = await courseForCaller(req, courseId);
  const classIds = new Set((await all(COURSE_CLASS_IDS('?'), [course.id, course.id])).map((r) => Number(r.classroomId)));
  const students = await enrolledStudents([course.id], user.universityId);
  const classOf = await classOfStudents(students.map((s) => s.studentId), classIds);

  const groups = new Map();
  for (const student of students) {
    const classroom = classOf.get(student.studentId) || null;
    const key = classroom ? classroom.id : 0;
    if (!groups.has(key)) groups.set(key, { classroom: classroom ? { id: classroom.id, label: classLabel(classroom) } : null, students: [] });
    groups.get(key).students.push({ id: student.studentId, name: student.name, email: student.email, rollNumber: student.rollNumber || null });
  }
  const ordered = [...groups.values()].sort((a, b) => (a.classroom ? a.classroom.label : '￿').localeCompare(b.classroom ? b.classroom.label : '￿', undefined, { numeric: true }));
  const classes = ordered.map((g) => ({ id: g.classroom ? g.classroom.id : null, label: g.classroom ? g.classroom.label : 'No class', count: g.students.length }));

  let wantedClass = null;
  if (classroomId !== undefined && classroomId !== null && classroomId !== '') {
    wantedClass = positiveId(classroomId, 'class');
    // the class must be one of the course's classes, or hold one of its students
    if (!classIds.has(wantedClass) && !classes.some((c) => c.id === wantedClass)) throw new HttpError(404, 'This class does not take this course');
  }
  const needle = String(q ?? '').trim().toLowerCase().slice(0, 100);
  const matches = (s) => !needle || [s.name, s.email, s.rollNumber].some((v) => String(v ?? '').toLowerCase().includes(needle));

  const filtered = ordered
    .filter((g) => wantedClass === null || (g.classroom && g.classroom.id === wantedClass))
    .map((g) => ({ classroom: g.classroom, students: g.students.filter(matches) }))
    .filter((g) => g.students.length > 0)
    .map((g) => ({ ...g, count: g.students.length }));

  return {
    course: { id: course.id, title: course.title },
    total: students.length,
    shown: filtered.reduce((sum, g) => sum + g.count, 0),
    classes,
    groups: filtered,
  };
}

/**
 * Both teacher views in one answer: the caller's courses with their classes and counts
 * (course-first), and the classes with the caller's courses in each (class-first).
 * Admin: every course of the school.
 */
async function teachingOverview(req) {
  const user = caller(req);
  const courses = user.isAdmin
    ? await all('SELECT id, title, mentorId, classroomId FROM courses WHERE university_id = ? ORDER BY LOWER(title)', [user.universityId])
    : await all('SELECT id, title, mentorId, classroomId FROM courses WHERE mentorId = ? AND university_id = ? ORDER BY LOWER(title)', [user.userId, user.universityId]);
  if (courses.length === 0) return { courses: [], classes: [] };

  const ids = courses.map((c) => c.id);
  const links = await all(
    `SELECT cc.courseId, cc.classroomId FROM course_classrooms cc WHERE cc.courseId IN (${ids.map(() => '?').join(',')})
     UNION SELECT id, classroomId FROM courses WHERE id IN (${ids.map(() => '?').join(',')}) AND classroomId IS NOT NULL`,
    [...ids, ...ids]
  );
  const enrolled = await enrolledStudents(ids, user.universityId);

  // Each student is counted under one class per course, by the same rule as the roster:
  // a class of the course if they are in one, otherwise their own class. So the two views
  // always agree, and a class whose students were enrolled one by one still appears.
  const linkedIds = (courseId) => new Set(links.filter((l) => l.courseId === courseId).map((l) => Number(l.classroomId)));
  const perCourse = [];
  for (const course of courses) {
    const students = enrolled.filter((e) => e.courseId === course.id);
    const classOf = await classOfStudents(students.map((s) => s.studentId), linkedIds(course.id));
    const counts = new Map();
    let withoutClass = 0;
    for (const s of students) {
      const classroom = classOf.get(s.studentId);
      if (classroom) counts.set(Number(classroom.id), (counts.get(Number(classroom.id)) || 0) + 1);
      else withoutClass += 1;
    }
    linkedIds(course.id).forEach((id) => { if (!counts.has(id)) counts.set(id, 0); });
    perCourse.push({ course, total: students.length, counts, withoutClass });
  }

  const allClassIds = [...new Set(perCourse.flatMap((p) => [...p.counts.keys()]))];
  const classRows = allClassIds.length
    ? await all(`SELECT id, name, grade, section FROM classrooms WHERE university_id = ? AND id IN (${allClassIds.map(() => '?').join(',')})`, [user.universityId, ...allClassIds])
    : [];
  const classById = new Map(classRows.map((c) => [Number(c.id), c]));

  const courseView = perCourse.map(({ course, total, counts, withoutClass }) => ({
    id: course.id,
    title: course.title,
    mentorId: course.mentorId,
    total,
    withoutClass,
    classes: [...counts.entries()]
      .filter(([id]) => classById.has(id))
      .map(([id, count]) => ({ id, label: classLabel(classById.get(id)), count, isHome: Number(course.classroomId) === id, assigned: linkedIds(course.id).has(id) }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
  }));

  const classView = [...classById.values()]
    .map((classroom) => ({
      id: classroom.id,
      label: classLabel(classroom),
      courses: courseView.filter((c) => c.classes.some((k) => k.id === Number(classroom.id)))
        .map((c) => ({ id: c.id, title: c.title, count: c.classes.find((k) => k.id === Number(classroom.id)).count })),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

  return { courses: courseView, classes: classView };
}

module.exports = {
  COURSE_CLASS_IDS,
  classLabel,
  enrollStudentInClassCourses,
  listCourseClasses,
  assignCourseToClasses,
  createCourseWithClasses,
  removeCourseClass,
  courseClassRoster,
  setClassEnrolment,
  courseRoster,
  teachingOverview,
};
