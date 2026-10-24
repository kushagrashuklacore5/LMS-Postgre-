/**
 * The contract between the assessment core and a host LMS. The core
 * (AssessmentService) never runs SQL or knows LMS table names; everything
 * LMS-specific goes through an object with these methods. To move the agent
 * to another LMS, write one new adapter; the core and HTTP layer stay as they are.
 *
 * All methods are synchronous and act on one request-scoped connection.
 *
 * Actor = { userId, universityId, kind: 'teacher' | 'student' }, built ONLY
 * from the authenticated session and re-checked against the LMS.
 *
 * --- LMS directory (reads existing LMS data; never writes it) ---
 *   resolveActor(sessionUser)                     -> Actor (throws FORBIDDEN / TENANT_MISMATCH)
 *   getClassroom(universityId, classroomId)       -> { id, name, grade, section } | null   (same school only)
 *   listClassrooms(universityId)                  -> [{ id, name, grade, section }]
 *   getStudentClassroomIds(universityId, userId)  -> [classroomId]                          (same school only)
 *
 * --- Assessment store (the module's own aia_* tables) ---
 *   isReady()                                     -> boolean (migration applied?)
 *   transaction(fn)                               -> fn's result; rolls back if fn throws
 *   insertAssessment(row)                         -> id      row: { universityId, teacherId, title, description, subject, classroomId, durationMinutes }
 *   updateAssessment(universityId, id, fields)    -> void    fields: subset of the row's editable fields
 *   setAssessmentStatus(universityId, id, status) -> void    'draft' | 'published' (manages published_at)
 *   findAssessment(universityId, id)              -> AssessmentRow | null
 *   listAssessmentsByTeacher(universityId, teacherId)            -> [AssessmentRow]
 *   listPublishedForClassrooms(universityId, classroomIds)       -> [AssessmentRow]
 *   listQuestions(assessmentId)                   -> [{ id, position, text, explanation, difficulty, options: [{ position, text, isCorrect }] }]
 *   insertQuestion(assessmentId, question)        -> id      question: { text, explanation, difficulty, options: [{ text, isCorrect }] } (already validated)
 *   replaceQuestion(assessmentId, questionId, question) -> boolean (false: no such question in that assessment)
 *   deleteQuestion(assessmentId, questionId)      -> boolean (positions of later questions close the gap)
 *
 * --- Step 3: roster + attempts (migration 003) ---
 *   listClassroomStudents(universityId, classroomId)             -> [{ id, name }]   (same school, role student)
 *   getUserNames(universityId, userIds)                          -> Map(id -> name) (same school only)
 *   insertAttempt({ universityId, assessmentId, studentId, startedAt, deadlineAt }) -> id
 *   findAttempt(universityId, attemptId)                         -> AttemptRow | null
 *   findAttemptFor(universityId, assessmentId, studentId)        -> AttemptRow | null
 *   listAttemptsForAssessment(universityId, assessmentId)        -> [AttemptRow]
 *   listAttemptsForStudent(universityId, studentId)              -> [AttemptRow]
 *   countAttempts(assessmentId)                                  -> number
 *   saveAnswer(attemptId, questionId, optionPosition | null)     -> void
 *   listAnswers(attemptId)                                       -> [{ questionId, optionPosition, isCorrect }]
 *   finalizeAttempt(attemptId, { status, finishedAt, result, gradedAnswers }) -> boolean (false: already final)
 *
 * --- Step 5: test windows (migration 004) ---
 *   closeAssessment(universityId, id, closedAtIso)              -> boolean (false: not published or already closed)
 *   (insertAssessment/updateAssessment also take opensAt/closesAt; AssessmentRow gains opensAt, closesAt, closedAt;
 *    setAssessmentStatus(..., 'draft') clears closedAt)
 *
 * --- Step 6: attempt reset with history (migration 005) ---
 *   archiveAttempt(attemptRow, { answers, resetBy, resetAt })     -> void (moves a FINISHED attempt to the archive,
 *                                                                   deleting it and its answers from the current tables)
 *   listArchivedAttempts(universityId, assessmentId)              -> [ArchivedAttemptRow] oldest first
 *   countArchivedAttemptsFor(universityId, assessmentId, studentId) -> number
 *   (countAttempts now counts current + archived attempts)
 *
 * --- Student Performance Analyst (read-only, no migration) ---
 *   getSchoolStudent(universityId, studentId)        -> { id, name } | null  (role student, same school)
 *   listStudentMemberships(universityId, studentId)  -> [{ classroomId, name, grade, section, joinedAt }]
 *
 * --- Advanced generation: question types (migration 006; optional, see supportsQuestionTypes) ---
 *   supportsQuestionTypes()                          -> boolean (false: single_mcq only, as before 006)
 *   saveResponse(attemptId, questionId, { selectedPositions } | { numericValue } | null) -> void
 *   (listQuestions rows gain type and numericAnswer { format, value } | null; insertQuestion/replaceQuestion
 *    take type/numericAnswer; listAnswers rows gain optionPositions and value)
 *
 * AttemptRow = { id, universityId, assessmentId, studentId, status, startedAt, deadlineAt, finishedAt,
 *                totalQuestions, attempted, correct, incorrect, unattempted, score, percentage }
 *
 * AssessmentRow = { id, universityId, teacherId, title, description, subject, classroomId,
 *                   durationMinutes, status, questionCount, createdAt, updatedAt, publishedAt }
 */
const REQUIRED_METHODS = Object.freeze([
  'resolveActor', 'getClassroom', 'listClassrooms', 'getStudentClassroomIds',
  'isReady', 'transaction', 'insertAssessment', 'updateAssessment', 'setAssessmentStatus',
  'findAssessment', 'listAssessmentsByTeacher', 'listPublishedForClassrooms',
  'listQuestions', 'insertQuestion', 'replaceQuestion', 'deleteQuestion',
  'listClassroomStudents', 'getUserNames', 'insertAttempt', 'findAttempt', 'findAttemptFor',
  'listAttemptsForAssessment', 'listAttemptsForStudent', 'countAttempts', 'saveAnswer', 'listAnswers', 'finalizeAttempt',
  'closeAssessment',
  'archiveAttempt', 'listArchivedAttempts', 'countArchivedAttemptsFor',
  'getSchoolStudent', 'listStudentMemberships',
  'supportsQuestionTypes', 'saveResponse',
]);

/** Throws a TypeError naming every missing method; used by the service constructor. */
function assertAssessmentLmsAdapter(adapter) {
  const missing = REQUIRED_METHODS.filter((m) => !adapter || typeof adapter[m] !== 'function');
  if (missing.length > 0) throw new TypeError(`LMS adapter is missing: ${missing.join(', ')}`);
  return adapter;
}

module.exports = { REQUIRED_METHODS, assertAssessmentLmsAdapter };
