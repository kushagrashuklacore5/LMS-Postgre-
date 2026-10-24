const { get, all, run, withTransaction } = require('../helpers/dbAsync');
const {
  HttpError,
  handle,
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
} = require('../helpers/subjectConfig');

const classroomSummary = (classroom) => ({
  id: classroom.id,
  name: classroom.name,
  grade: classroom.grade,
  section: classroom.section,
  studentCount: classroom.studentCount,
});

const parseSavedSubjects = (raw) => {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

// Finds one of the student's current subjects by class subject id or by name
const findEffectiveSubject = (effective, { classSubjectId, name }) => {
  if (classSubjectId) {
    return effective.subjects.find((s) => Number(s.classSubjectId) === Number(classSubjectId)) || null;
  }
  const key = nameKey(name);
  if (!key) return null;
  return effective.subjects.find((s) => nameKey(s.name) === key) || null;
};

const studentSubjectResponse = async (classroom, student) => ({
  success: true,
  data: {
    classroom: classroomSummary(classroom),
    student,
    ...(await getEffectiveSubjects(classroom.id, student.id)),
  },
});

/* ================= CLASSROOMS THE USER MAY MANAGE ================= */
const getManageableClassrooms = handle(async (req, res) => {
  const classrooms = await listManageableClassrooms(req);
  res.json({ success: true, data: classrooms.map(classroomSummary) });
});

/* ================= GET CLASS/SECTION SUBJECT TEMPLATE ================= */
const getClassroomSubjects = handle(async (req, res) => {
  const classroom = await authorizeClassroom(req, req.params.classroomId);
  const subjects = await getClassSubjects(classroom.id);
  res.json({ success: true, data: { classroom: classroomSummary(classroom), subjects } });
});

/* ================= SAVE CLASS/SECTION SUBJECT TEMPLATE ================= */
// Replaces the template with the submitted list. Saved results keep their own
// subject snapshot, so they are not touched by template changes.
const saveClassroomSubjects = handle(async (req, res) => {
  const classroom = await authorizeClassroom(req, req.params.classroomId);
  const incoming = requireSubjectList(req.body?.subjects);
  const userId = req.user.userId;

  await withTransaction(async () => {
    const existing = await getClassSubjects(classroom.id);
    const existingById = new Map(existing.map((s) => [Number(s.id), s]));

    incoming.forEach((item) => {
      if (item.id && !existingById.has(item.id)) {
        throw new HttpError(400, `Subject "${item.name}" does not belong to this classroom`);
      }
    });

    // A new row with the name of an existing subject is that same subject
    const claimed = new Set(incoming.filter((i) => i.id).map((i) => i.id));
    incoming.forEach((item) => {
      if (item.id) return;
      const match = existing.find((s) => nameKey(s.name) === item.nameKey && !claimed.has(Number(s.id)));
      if (match) {
        item.id = Number(match.id);
        claimed.add(item.id);
      }
    });

    // Remove subjects that are no longer in the template (and their per-student overrides)
    for (const subject of existing) {
      if (claimed.has(Number(subject.id))) continue;
      await run('DELETE FROM student_subject_overrides WHERE classSubjectId = ?', [subject.id]);
      await run('DELETE FROM classroom_subjects WHERE id = ?', [subject.id]);
    }

    // Free the unique names first so subjects can swap names in one save
    for (const item of incoming) {
      if (item.id) {
        await run('UPDATE classroom_subjects SET nameKey = ? WHERE id = ?', [`__pending__${item.id}`, item.id]);
      }
    }

    for (let index = 0; index < incoming.length; index++) {
      const item = incoming[index];
      if (item.id) {
        await run(
          `UPDATE classroom_subjects
           SET name = ?, nameKey = ?, maxMarks = ?, sortOrder = ?, updatedAt = utc_now_text()
           WHERE id = ?`,
          [item.name, item.nameKey, item.maxMarks, index, item.id]
        );
        await run(
          'UPDATE student_subject_overrides SET subjectName = ?, nameKey = ? WHERE classSubjectId = ?',
          [item.name, item.nameKey, item.id]
        );
      } else {
        await run(
          `INSERT INTO classroom_subjects (classroomId, name, nameKey, maxMarks, sortOrder, createdBy)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [classroom.id, item.name, item.nameKey, item.maxMarks, index, userId]
        );
      }
    }
  });

  const subjects = await getClassSubjects(classroom.id);
  res.json({
    success: true,
    message: 'Class subjects saved successfully',
    data: { classroom: classroomSummary(classroom), subjects },
  });
});

/* ================= RESULT ENTRY DATA FOR A CLASSROOM ================= */
// Every student of the classroom with their effective subjects and the result
// already saved for the requested term (if any).
const getClassroomResultEntry = handle(async (req, res) => {
  const classroom = await authorizeClassroom(req, req.params.classroomId);
  const term = String(req.query.term || '').trim() || 'General';

  const classSubjects = await getClassSubjects(classroom.id);
  const students = await all(
    `SELECT u.id, u.name, u.email
     FROM users u
     JOIN student_classroom_assignment sca ON u.id = sca.studentId
     WHERE sca.classroomId = ? AND u.role = 'student' AND u.university_id = ?
     ORDER BY u.name ASC`,
    [classroom.id, classroom.university_id]
  );
  const overrides = await all(
    'SELECT * FROM student_subject_overrides WHERE classroomId = ? ORDER BY id ASC',
    [classroom.id]
  );
  const settings = await all('SELECT studentId, mode FROM student_subject_settings WHERE classroomId = ?', [classroom.id]);
  const results = await all('SELECT * FROM results WHERE classroomId = ? AND term = ? ORDER BY id ASC', [classroom.id, term]);

  const modeByStudent = new Map(settings.map((s) => [Number(s.studentId), s.mode]));
  const resultByStudent = new Map(results.map((r) => [Number(r.studentId), r]));

  const data = students.map((student) => {
    const effective = computeEffectiveSubjects(
      classSubjects,
      overrides.filter((o) => Number(o.studentId) === Number(student.id)),
      modeByStudent.get(Number(student.id))
    );
    const saved = resultByStudent.get(Number(student.id));

    return {
      student,
      ...effective,
      result: saved
        ? {
            id: saved.id,
            term: saved.term,
            subjects: parseSavedSubjects(saved.subjects),
            overallPercentage: saved.overallPercentage,
            overallStatus: saved.overallStatus,
            comments: saved.comments,
            updatedAt: saved.updatedAt,
          }
        : null,
    };
  });

  res.json({
    success: true,
    data: { classroom: classroomSummary(classroom), term, classSubjects, students: data },
  });
});

/* ================= GET EFFECTIVE SUBJECTS FOR ONE STUDENT ================= */
const getStudentSubjects = handle(async (req, res) => {
  const classroom = await authorizeClassroom(req, req.params.classroomId);
  const student = await requireStudentInClassroom(classroom, req.params.studentId);
  res.json(await studentSubjectResponse(classroom, student));
});

/* ================= ADD A SUBJECT FOR ONE STUDENT ================= */
const addStudentSubject = handle(async (req, res) => {
  const classroom = await authorizeClassroom(req, req.params.classroomId);
  const student = await requireStudentInClassroom(classroom, req.params.studentId);

  const name = requireSubjectName(req.body?.name);
  const maxMarks = requireMaxMarks(req.body?.maxMarks, name);
  const key = nameKey(name);

  const effective = await getEffectiveSubjects(classroom.id, student.id);
  if (effective.subjects.some((s) => nameKey(s.name) === key)) {
    throw new HttpError(409, `${student.name} already has the subject "${name}"`);
  }
  if (effective.removed.some((s) => nameKey(s.name) === key)) {
    throw new HttpError(409, `"${name}" is a class subject that was removed for this student. Restore it instead.`);
  }

  await run(
    `INSERT INTO student_subject_overrides (classroomId, studentId, classSubjectId, subjectName, nameKey, action, maxMarks, createdBy)
     VALUES (?, ?, NULL, ?, ?, 'add', ?, ?)`,
    [classroom.id, student.id, name, key, maxMarks, req.user.userId]
  );

  res.status(201).json(await studentSubjectResponse(classroom, student));
});

/* ================= REMOVE A SUBJECT FOR ONE STUDENT ================= */
// A custom subject is deleted; an inherited one is only hidden for this student.
const removeStudentSubject = handle(async (req, res) => {
  const classroom = await authorizeClassroom(req, req.params.classroomId);
  const student = await requireStudentInClassroom(classroom, req.params.studentId);

  const selector = {
    classSubjectId: req.body?.classSubjectId || req.query.classSubjectId,
    name: req.body?.name || req.query.name,
  };
  const effective = await getEffectiveSubjects(classroom.id, student.id);
  const subject = findEffectiveSubject(effective, selector);
  if (!subject) throw new HttpError(404, 'Subject not found for this student');

  await withTransaction(async () => {
    if (subject.source === 'custom') {
      await run(
        "DELETE FROM student_subject_overrides WHERE classroomId = ? AND studentId = ? AND action = 'add' AND nameKey = ?",
        [classroom.id, student.id, nameKey(subject.name)]
      );
      return;
    }

    await run(
      'DELETE FROM student_subject_overrides WHERE classroomId = ? AND studentId = ? AND classSubjectId = ?',
      [classroom.id, student.id, subject.classSubjectId]
    );
    await run(
      `INSERT INTO student_subject_overrides (classroomId, studentId, classSubjectId, subjectName, nameKey, action, maxMarks, createdBy)
       VALUES (?, ?, ?, ?, ?, 'remove', NULL, ?)`,
      [classroom.id, student.id, subject.classSubjectId, subject.name, nameKey(subject.name), req.user.userId]
    );
  });

  res.json(await studentSubjectResponse(classroom, student));
});

/* ================= OVERRIDE MAXIMUM MARKS FOR ONE STUDENT ================= */
const setStudentMaxMarks = handle(async (req, res) => {
  const classroom = await authorizeClassroom(req, req.params.classroomId);
  const student = await requireStudentInClassroom(classroom, req.params.studentId);

  const effective = await getEffectiveSubjects(classroom.id, student.id);
  const subject = findEffectiveSubject(effective, { classSubjectId: req.body?.classSubjectId, name: req.body?.name });
  if (!subject) throw new HttpError(404, 'Subject not found for this student');

  const maxMarks = requireMaxMarks(req.body?.maxMarks, subject.name);

  await withTransaction(async () => {
    if (subject.source === 'custom') {
      await run(
        `UPDATE student_subject_overrides SET maxMarks = ?, updatedAt = utc_now_text()
         WHERE classroomId = ? AND studentId = ? AND action = 'add' AND nameKey = ?`,
        [maxMarks, classroom.id, student.id, nameKey(subject.name)]
      );
      return;
    }

    await run(
      'DELETE FROM student_subject_overrides WHERE classroomId = ? AND studentId = ? AND classSubjectId = ?',
      [classroom.id, student.id, subject.classSubjectId]
    );
    // Same value as the class default means there is nothing to override
    if (Number(maxMarks) !== Number(subject.defaultMaxMarks)) {
      await run(
        `INSERT INTO student_subject_overrides (classroomId, studentId, classSubjectId, subjectName, nameKey, action, maxMarks, createdBy)
         VALUES (?, ?, ?, ?, ?, 'max', ?, ?)`,
        [classroom.id, student.id, subject.classSubjectId, subject.name, nameKey(subject.name), maxMarks, req.user.userId]
      );
    }
  });

  res.json(await studentSubjectResponse(classroom, student));
});

/* ================= REPLACE ALL SUBJECTS FOR ONE STUDENT ================= */
// The student stops inheriting the class template and uses only custom subjects.
const replaceAllStudentSubjects = handle(async (req, res) => {
  const classroom = await authorizeClassroom(req, req.params.classroomId);
  const student = await requireStudentInClassroom(classroom, req.params.studentId);

  if (req.body?.confirm !== true) {
    throw new HttpError(400, 'Replacing all subjects must be confirmed');
  }
  const subjects = requireSubjectList(req.body?.subjects || []);

  await withTransaction(async () => {
    await run('DELETE FROM student_subject_overrides WHERE classroomId = ? AND studentId = ?', [classroom.id, student.id]);
    await run('DELETE FROM student_subject_settings WHERE classroomId = ? AND studentId = ?', [classroom.id, student.id]);
    await run(
      "INSERT INTO student_subject_settings (classroomId, studentId, mode, updatedBy) VALUES (?, ?, 'custom', ?)",
      [classroom.id, student.id, req.user.userId]
    );

    for (const subject of subjects) {
      await run(
        `INSERT INTO student_subject_overrides (classroomId, studentId, classSubjectId, subjectName, nameKey, action, maxMarks, createdBy)
         VALUES (?, ?, NULL, ?, ?, 'add', ?, ?)`,
        [classroom.id, student.id, subject.name, subject.nameKey, subject.maxMarks, req.user.userId]
      );
    }
  });

  res.json(await studentSubjectResponse(classroom, student));
});

/* ================= RESTORE CLASS DEFAULTS FOR ONE STUDENT ================= */
// With classSubjectId: restore that one inherited subject (undo remove / max override).
// Without it: drop every student-specific change and inherit the class template again.
const restoreStudentDefaults = handle(async (req, res) => {
  const classroom = await authorizeClassroom(req, req.params.classroomId);
  const student = await requireStudentInClassroom(classroom, req.params.studentId);
  const classSubjectId = req.body?.classSubjectId;

  if (classSubjectId) {
    const outcome = await run(
      'DELETE FROM student_subject_overrides WHERE classroomId = ? AND studentId = ? AND classSubjectId = ?',
      [classroom.id, student.id, classSubjectId]
    );
    if (!outcome.changes) throw new HttpError(404, 'This subject has no student-specific change to restore');
  } else {
    await withTransaction(async () => {
      await run('DELETE FROM student_subject_overrides WHERE classroomId = ? AND studentId = ?', [classroom.id, student.id]);
      await run('DELETE FROM student_subject_settings WHERE classroomId = ? AND studentId = ?', [classroom.id, student.id]);
    });
  }

  res.json(await studentSubjectResponse(classroom, student));
});

module.exports = {
  getManageableClassrooms,
  getClassroomSubjects,
  saveClassroomSubjects,
  getClassroomResultEntry,
  getStudentSubjects,
  addStudentSubject,
  removeStudentSubject,
  setStudentMaxMarks,
  replaceAllStudentSubjects,
  restoreStudentDefaults,
};
