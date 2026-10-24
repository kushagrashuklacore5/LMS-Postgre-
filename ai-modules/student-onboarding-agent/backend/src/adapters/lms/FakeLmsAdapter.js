const { LmsAdapter, LmsAdapterError } = require('./LmsAdapter');

/**
 * Deterministic in-memory LMS for Step 8 (standalone development and tests).
 * Touches no real LMS, database or network.
 *
 * - createStudent: refs are "fake-student-1", "fake-student-2", ... in call order.
 *   Same idempotencyKey again -> the same result with created=false (no duplicate).
 *   An email that already exists under another key -> STUDENT_ALREADY_EXISTS
 *   (the real LMS rejects existing emails too).
 * - assignStudentToClassroom: matches the configured classrooms by trimmed,
 *   case-insensitive className + section (decision OD-7). 0 matches ->
 *   classroom_not_found, >1 -> classroom_ambiguous; never guesses.
 * - `calls` records every request (as received) so tests can inspect exactly
 *   what reached the adapter. `failOnEmails` simulates LMS failures.
 */
class FakeLmsAdapter extends LmsAdapter {
  constructor({ classrooms = [], existingEmails = [], failOnEmails = [] } = {}) {
    super('fake');
    this.classrooms = classrooms.map((c) => ({ className: c.className, section: c.section }));
    this.failOnEmails = new Set(failOnEmails.map((e) => e.toLowerCase()));
    this.calls = [];
    this.students = []; // { studentRef, email, student }
    this.assignments = []; // { assignmentRef, studentRef, className, section }
    this.byEmail = new Map(existingEmails.map((e, i) => [e.toLowerCase(), { studentRef: `existing-student-${i + 1}` }]));
    this.byKey = new Map();
    this.seq = { student: 0, assignment: 0 };
  }

  async createStudent(request) {
    this.calls.push({ method: 'createStudent', request });
    const { idempotencyKey, student } = request;
    if (this.byKey.has(idempotencyKey)) return { ...this.byKey.get(idempotencyKey), created: false };
    const email = student.email.toLowerCase();
    if (this.failOnEmails.has(email)) throw new LmsAdapterError('The LMS could not create this student (simulated failure).', { code: 'SIMULATED_FAILURE' });
    if (this.byEmail.has(email)) throw new LmsAdapterError('A student with this email already exists in the LMS.', { code: 'STUDENT_ALREADY_EXISTS' });

    const studentRef = `fake-student-${++this.seq.student}`;
    this.byEmail.set(email, { studentRef });
    this.students.push({ studentRef, email: student.email, student });
    this.byKey.set(idempotencyKey, { studentRef });
    return { studentRef, created: true };
  }

  async assignStudentToClassroom(request) {
    this.calls.push({ method: 'assignStudentToClassroom', request });
    const { idempotencyKey, studentEmail, className, section } = request;
    if (this.byKey.has(idempotencyKey)) return { ...this.byKey.get(idempotencyKey), replayed: true };
    const student = this.byEmail.get(studentEmail.toLowerCase());
    if (!student) throw new LmsAdapterError('No student with this email exists in the LMS.', { code: 'STUDENT_NOT_FOUND' });

    const norm = (s) => s.trim().toLowerCase();
    const matches = this.classrooms.filter((c) => norm(c.className) === norm(className) && norm(c.section) === norm(section));
    let result;
    if (matches.length === 1) {
      const assignmentRef = `fake-assignment-${++this.seq.assignment}`;
      this.assignments.push({ assignmentRef, studentRef: student.studentRef, className: matches[0].className, section: matches[0].section });
      result = { outcome: 'assigned', assignmentRef };
    } else {
      result = { outcome: matches.length === 0 ? 'classroom_not_found' : 'classroom_ambiguous', assignmentRef: null };
    }
    this.byKey.set(idempotencyKey, result);
    return { ...result, replayed: false };
  }
}

module.exports = { FakeLmsAdapter };
