/**
 * The LMS adapter interface: the ONLY way the module will ever change the LMS.
 *
 * It is deliberately narrow and business-level. It has exactly the methods
 * the create-only tools need, and nothing generic (no query, execute,
 * update or delete). Internal LMS identifiers never come in; opaque
 * references created by the LMS may come out.
 *
 *   createStudent({ idempotencyKey, student })
 *     student: canonical creation fields (fullName, email, optional parentName,
 *              phone, dob, admissionDate, bloodGroup, address), already validated
 *     -> { studentRef: string, created: boolean }   created=false: same idempotencyKey seen before
 *
 *   assignStudentToClassroom({ idempotencyKey, studentEmail, className, section })
 *     -> { outcome: 'assigned' | 'classroom_not_found' | 'classroom_ambiguous',
 *          assignmentRef: string | null, replayed: boolean }
 *     Classroom resolution (case-insensitive exact className + section in the
 *     admin's university; zero or several matches reported, never guessed) is
 *     the adapter's job: callers never pass classroom IDs.
 *
 * Failures: throw LmsAdapterError with a safe message and a code
 * (e.g. STUDENT_ALREADY_EXISTS). Never secrets, SQL or stack traces.
 *
 * Step 8 ships only FakeLmsAdapter. The real adapter is Step 9.
 */
const LMS_ADAPTER_METHODS = Object.freeze(['createStudent', 'assignStudentToClassroom']);
const ASSIGNMENT_OUTCOMES = Object.freeze(['assigned', 'classroom_not_found', 'classroom_ambiguous']);

class LmsAdapter {
  constructor(name) {
    if (new.target === LmsAdapter) throw new TypeError('LmsAdapter is abstract; implement createStudent and assignStudentToClassroom.');
    if (typeof name !== 'string' || name.trim() === '') throw new TypeError('LmsAdapter requires a name.');
    this.name = name;
  }

  // eslint-disable-next-line no-unused-vars
  async createStudent(request) {
    throw new LmsAdapterError(`LMS adapter "${this.name}" does not implement createStudent.`, { code: 'NOT_IMPLEMENTED' });
  }

  // eslint-disable-next-line no-unused-vars
  async assignStudentToClassroom(request) {
    throw new LmsAdapterError(`LMS adapter "${this.name}" does not implement assignStudentToClassroom.`, { code: 'NOT_IMPLEMENTED' });
  }
}

class LmsAdapterError extends Error {
  constructor(message, { code = 'LMS_ERROR' } = {}) {
    super(message);
    this.name = 'LmsAdapterError';
    this.code = code;
  }
}

/**
 * What tools actually receive: a frozen object with exactly the interface
 * methods, bound to the adapter. Whatever else an adapter object has (a DB
 * pool, helper methods, ...) is unreachable through it.
 */
function createLmsFacade(adapter) {
  if (!adapter || typeof adapter !== 'object') throw new TypeError('An LMS adapter object is required.');
  for (const m of LMS_ADAPTER_METHODS) {
    if (typeof adapter[m] !== 'function') throw new TypeError(`LMS adapter must implement ${m}().`);
  }
  return Object.freeze({
    createStudent: (request) => adapter.createStudent(request),
    assignStudentToClassroom: (request) => adapter.assignStudentToClassroom(request),
  });
}

module.exports = { LmsAdapter, LmsAdapterError, createLmsFacade, LMS_ADAPTER_METHODS, ASSIGNMENT_OUTCOMES };
