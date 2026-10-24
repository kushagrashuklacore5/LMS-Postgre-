const { get, all } = require('./dbAsync');
const { HttpError, authorizeClassroom, listClassrooms } = require('./teachingScope');

const MAX_MARKS_LIMIT = 1000;
const MAX_SUBJECT_NAME_LENGTH = 100;

/* ================= ERRORS ================= */
// Wraps an async route handler so HttpError becomes a clean JSON response
const handle = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ success: false, message: err.message, ...err.extra });
    }
    console.error('SUBJECT CONFIG ERROR:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/* ================= VALIDATION ================= */
const cleanName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ');
const nameKey = (name) => cleanName(name).toLowerCase();

const requireSubjectName = (name) => {
  const cleaned = cleanName(name);
  if (!cleaned) throw new HttpError(400, 'Subject name is required');
  if (cleaned.length > MAX_SUBJECT_NAME_LENGTH) {
    throw new HttpError(400, `Subject name must be ${MAX_SUBJECT_NAME_LENGTH} characters or fewer`);
  }
  return cleaned;
};

const requireMaxMarks = (value, subjectName) => {
  const num = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(num) || num <= 0 || num > MAX_MARKS_LIMIT) {
    const label = subjectName ? ` for ${subjectName}` : '';
    throw new HttpError(400, `Maximum marks${label} must be a number between 1 and ${MAX_MARKS_LIMIT}`);
  }
  return num;
};

// Validates a list of { name, maxMarks } and rejects duplicate subject names
const requireSubjectList = (subjects) => {
  if (!Array.isArray(subjects)) throw new HttpError(400, 'Subjects must be a list');
  if (subjects.length > 50) throw new HttpError(400, 'A maximum of 50 subjects is allowed');

  const seen = new Set();
  return subjects.map((item) => {
    const name = requireSubjectName(item?.name);
    const key = nameKey(name);
    if (seen.has(key)) throw new HttpError(400, `Duplicate subject: ${name}`);
    seen.add(key);
    return { id: item?.id ? Number(item.id) : null, name, nameKey: key, maxMarks: requireMaxMarks(item?.maxMarks, name) };
  });
};

/* ================= AUTHORIZATION ================= */
// Classroom access (school + teacher assignment) lives in helpers/teachingScope.js
const listManageableClassrooms = (req) => listClassrooms(req);

const requireStudentInClassroom = async (classroom, studentId) => {
  const id = Number(studentId);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid student');

  const student = await get(
    "SELECT id, name, email FROM users WHERE id = ? AND role = 'student' AND university_id = ?",
    [id, classroom.university_id]
  );
  if (!student) throw new HttpError(404, 'Student not found');

  const membership = await get(
    'SELECT id FROM student_classroom_assignment WHERE studentId = ? AND classroomId = ?',
    [id, classroom.id]
  );
  if (!membership) throw new HttpError(400, 'Student is not a member of this classroom');

  return student;
};

/* ================= INHERITANCE ================= */
const getClassSubjects = (classroomId) =>
  all(
    'SELECT id, name, maxMarks, sortOrder FROM classroom_subjects WHERE classroomId = ? ORDER BY sortOrder ASC, id ASC',
    [classroomId]
  );

// Class template -> student inherits -> student-specific additions/removals/overrides.
// source: 'default' (inherited as is), 'override' (inherited, own max marks), 'custom' (student only)
const computeEffectiveSubjects = (classSubjects, overrides, mode) => {
  const customSubjects = overrides.filter((o) => o.action === 'add');
  const customKeys = new Set(customSubjects.map((o) => o.nameKey));
  const inheritedOverrides = new Map(
    overrides.filter((o) => o.classSubjectId != null).map((o) => [Number(o.classSubjectId), o])
  );

  const subjects = [];
  const removed = [];

  if (mode !== 'custom') {
    classSubjects.forEach((subject) => {
      // A student's own subject with the same name wins over the class one
      if (customKeys.has(nameKey(subject.name))) return;

      const override = inheritedOverrides.get(Number(subject.id));
      if (override?.action === 'remove') {
        removed.push({ classSubjectId: subject.id, name: subject.name, maxMarks: subject.maxMarks });
        return;
      }

      if (override?.action === 'max') {
        subjects.push({
          name: subject.name,
          maxMarks: override.maxMarks,
          defaultMaxMarks: subject.maxMarks,
          source: 'override',
          classSubjectId: subject.id,
        });
        return;
      }

      subjects.push({
        name: subject.name,
        maxMarks: subject.maxMarks,
        defaultMaxMarks: subject.maxMarks,
        source: 'default',
        classSubjectId: subject.id,
      });
    });
  }

  customSubjects.forEach((custom) => {
    subjects.push({
      name: custom.subjectName,
      maxMarks: custom.maxMarks,
      defaultMaxMarks: null,
      source: 'custom',
      classSubjectId: null,
    });
  });

  return {
    mode: mode === 'custom' ? 'custom' : 'inherit',
    customized: mode === 'custom' || overrides.length > 0,
    subjects,
    removed,
  };
};

const getEffectiveSubjects = async (classroomId, studentId) => {
  const classSubjects = await getClassSubjects(classroomId);
  const overrides = await all(
    'SELECT * FROM student_subject_overrides WHERE classroomId = ? AND studentId = ? ORDER BY id ASC',
    [classroomId, studentId]
  );
  const setting = await get(
    'SELECT mode FROM student_subject_settings WHERE classroomId = ? AND studentId = ?',
    [classroomId, studentId]
  );
  return computeEffectiveSubjects(classSubjects, overrides, setting?.mode);
};

module.exports = {
  HttpError,
  handle,
  cleanName,
  nameKey,
  requireSubjectName,
  requireMaxMarks,
  requireSubjectList,
  authorizeClassroom,
  listManageableClassrooms,
  requireStudentInClassroom,
  getClassSubjects,
  computeEffectiveSubjects,
  getEffectiveSubjects,
};
