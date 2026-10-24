const { get, all, run } = require('./dbAsync');

const sameText = (a, b) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/* ================= RESOLVE CLASS + SECTION TO A CLASSROOM ================= */
// In this LMS a classroom IS a class (grade) + section, so the Class/Section
// dropdowns resolve to exactly one classrooms row of the admin's university.
// Returns { classroom } or { error: { status, message } }.
const resolveClassroomSelection = async ({ classroomId, className, section, universityId }) => {
  const hasClass = String(className ?? '').trim() !== '';
  const hasSection = String(section ?? '').trim() !== '';

  if (!classroomId && !hasClass) {
    return { error: { status: 400, message: 'Class is required' } };
  }

  if (classroomId) {
    const id = Number(classroomId);
    if (!Number.isInteger(id) || id <= 0) {
      return { error: { status: 400, message: 'Selected class/section does not exist' } };
    }

    const classroom = await get(
      'SELECT * FROM classrooms WHERE id = ? AND university_id = ?',
      [id, universityId]
    );
    if (!classroom) {
      return { error: { status: 400, message: 'Selected class/section does not exist' } };
    }

    // The dropdown values must agree with the classroom they point to
    if (hasClass && !sameText(classroom.grade, className)) {
      return { error: { status: 400, message: 'Selected class does not match the selected classroom' } };
    }
    if (hasSection && !sameText(classroom.section, section)) {
      return { error: { status: 400, message: 'Selected section does not match the selected classroom' } };
    }
    if (!hasSection && String(classroom.section ?? '').trim() !== '') {
      return { error: { status: 400, message: 'Section is required' } };
    }

    return { classroom };
  }

  const sameClass = (
    await all('SELECT * FROM classrooms WHERE university_id = ?', [universityId])
  ).filter((c) => sameText(c.grade, className));

  if (sameClass.length === 0) {
    return { error: { status: 400, message: 'Selected class does not exist' } };
  }

  const usesSections = sameClass.some((c) => String(c.section ?? '').trim() !== '');
  if (!hasSection && usesSections) {
    return { error: { status: 400, message: 'Section is required' } };
  }

  const matches = sameClass.filter((c) => sameText(c.section, section));
  if (matches.length === 0) {
    return { error: { status: 400, message: 'Selected section does not exist in this class' } };
  }
  if (matches.length > 1) {
    return {
      error: {
        status: 400,
        message: 'More than one classroom matches this class and section. Please select the exact classroom.',
      },
    };
  }

  return { classroom: matches[0] };
};

/* ================= KEEP classrooms.studentCount IN SYNC ================= */
const refreshStudentCount = async (classroomId) => {
  const row = await get(
    'SELECT COUNT(*) as count FROM student_classroom_assignment WHERE classroomId = ?',
    [classroomId]
  );
  const count = row?.count || 0;
  await run('UPDATE classrooms SET studentCount = ? WHERE id = ?', [count, classroomId]);
  return count;
};

/* ================= ENROLL STUDENT (IDEMPOTENT) ================= */
// Safe to call when the student is already a member: no duplicate row is created.
const enrollStudentInClassroom = async (studentId, classroomId) => {
  const existing = await get(
    'SELECT id FROM student_classroom_assignment WHERE studentId = ? AND classroomId = ?',
    [studentId, classroomId]
  );

  if (!existing) {
    await run(
      'INSERT INTO student_classroom_assignment (studentId, classroomId) VALUES (?, ?)',
      [studentId, classroomId]
    );
  }

  const studentCount = await refreshStudentCount(classroomId);

  // Same follow-up as the existing "assign student" flow: give the student the
  // courses that belong to this classroom.
  // (required here, not at the top: courseClasses -> teachingScope -> dbAsync is a longer chain)
  await require('./courseClasses').enrollStudentInClassCourses(studentId, classroomId);

  return { alreadyEnrolled: !!existing, studentCount };
};

// Marks and attendance may only be recorded for a student who is in that classroom.
const isStudentOfClassroom = async (studentId, classroomId) => {
  const membership = await get(
    'SELECT id FROM student_classroom_assignment WHERE studentId = ? AND classroomId = ?',
    [studentId, classroomId]
  );
  return Boolean(membership);
};

module.exports = {
  isStudentOfClassroom,
  resolveClassroomSelection,
  refreshStudentCount,
  enrollStudentInClassroom,
};
