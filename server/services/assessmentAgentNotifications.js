const { get, all } = require('../helpers/dbAsync');
const notifications = require('./notificationService');

/**
 * Turns AI Assessment Agent events into notifications.
 *
 * The agent reports only WHAT happened and the ids involved, taken from the verified session
 * and its own database writes. Everything else (who is notified, the title, the deadline) is
 * read here from the LMS database, scoped to the event's school.
 */

const assessmentRecipients = async (assessment) => {
  const selected = await all(
    'SELECT student_id AS id FROM aia_assessment_recipients WHERE assessment_id = ? AND university_id = ?',
    [assessment.id, assessment.university_id]
  ).catch(() => []);
  const classStudents = await notifications.studentsOfClassroom(assessment.classroom_id, assessment.university_id);
  if (selected.length === 0) return classStudents; // whole class
  const inClass = new Set(classStudents);
  return selected.map((row) => row.id).filter((id) => inClass.has(id));
};

const handlers = {
  /* Teacher published a test -> its students */
  'assessment.published': async ({ universityId, assessmentId }) => {
    const assessment = await get(
      "SELECT * FROM aia_assessments WHERE id = ? AND university_id = ? AND status = 'published'",
      [assessmentId, universityId]
    );
    if (!assessment || !assessment.classroom_id) return;

    await notifications.notify({
      type: 'ASSESSMENT_PUBLISHED',
      data: { title: assessment.title, deadline: assessment.closes_at },
      universityId,
      recipientIds: await assessmentRecipients(assessment),
      entityType: 'aia_assessment',
      entityId: assessment.id,
      createdBy: assessment.teacher_id,
      createdByRole: 'mentor',
    });
  },

  /* Teacher published an assignment -> the class */
  'assignment.published': async ({ universityId, assignmentId }) => {
    const assignment = await get(
      "SELECT * FROM aia_assignments WHERE id = ? AND university_id = ? AND status = 'published'",
      [assignmentId, universityId]
    );
    if (!assignment) return;

    await notifications.notify({
      type: 'ASSIGNMENT_PUBLISHED',
      data: { title: assignment.title, deadline: assignment.due_at },
      universityId,
      recipientIds: await notifications.studentsOfClassroom(assignment.classroom_id, universityId),
      entityType: 'aia_assignment',
      entityId: assignment.id,
      createdBy: assignment.teacher_id,
      createdByRole: 'mentor',
    });
  },

  /* Student uploaded a submission -> the assignment's teacher */
  'assignment.submitted': async ({ universityId, actorId, assignmentId }) => {
    const submission = await get(
      `SELECT s.student_id, a.id, a.title, a.teacher_id
       FROM aia_assignment_submissions s
       JOIN aia_assignments a ON a.id = s.assignment_id
       WHERE s.assignment_id = ? AND s.student_id = ? AND s.university_id = ?`,
      [assignmentId, actorId, universityId]
    );
    if (!submission) return;

    await notifications.notify({
      type: 'ASSIGNMENT_SUBMITTED',
      data: { title: submission.title, studentName: await notifications.userName(submission.student_id) },
      universityId,
      recipientIds: [submission.teacher_id],
      entityType: 'aia_assignment',
      entityId: submission.id,
      createdBy: submission.student_id,
      createdByRole: 'student',
      dedupeSuffix: `student-${submission.student_id}`,
    });
  },

  /* Teacher saved the final marks -> that student */
  'assignment.evaluated': async ({ universityId, assignmentId, submissionId }) => {
    const submission = await get(
      `SELECT s.student_id, a.id, a.title, a.teacher_id
       FROM aia_assignment_submissions s
       JOIN aia_assignments a ON a.id = s.assignment_id
       WHERE s.id = ? AND s.assignment_id = ? AND s.university_id = ? AND s.status = 'evaluated'`,
      [submissionId, assignmentId, universityId]
    );
    if (!submission) return;

    await notifications.notify({
      type: 'RESULT_AVAILABLE',
      data: { title: submission.title },
      universityId,
      recipientIds: [submission.student_id],
      entityType: 'aia_assignment',
      entityId: submission.id,
      createdBy: submission.teacher_id,
      createdByRole: 'mentor',
    });
  },

  /* Student finished a test -> the test's teacher */
  'attempt.submitted': async ({ universityId, actorId, attemptId }) => {
    const attempt = await get(
      `SELECT t.student_id, a.id, a.title, a.teacher_id
       FROM aia_attempts t
       JOIN aia_assessments a ON a.id = t.assessment_id
       WHERE t.id = ? AND t.student_id = ? AND t.university_id = ? AND t.status IN ('submitted', 'expired')`,
      [attemptId, actorId, universityId]
    );
    if (!attempt) return;

    await notifications.notify({
      type: 'ATTEMPT_SUBMITTED',
      data: { title: attempt.title, studentName: await notifications.userName(attempt.student_id) },
      universityId,
      recipientIds: [attempt.teacher_id],
      entityType: 'aia_assessment',
      entityId: attempt.id,
      createdBy: attempt.student_id,
      createdByRole: 'student',
      dedupeSuffix: `student-${attempt.student_id}`,
    });
  },

  /* Teacher pressed "Send to Student" -> the one student the report is about */
  'report.shared': async ({ universityId, reportId }) => {
    const report = await get(
      'SELECT id, student_id, shared_by, teacher_id FROM aia_performance_reports WHERE id = ? AND university_id = ? AND shared_at IS NOT NULL',
      [reportId, universityId]
    );
    if (!report) return;

    const sharedBy = report.shared_by || report.teacher_id;
    await notifications.notify({
      type: 'REPORT_SHARED',
      data: { teacherName: await notifications.userName(sharedBy) },
      universityId,
      recipientIds: [report.student_id],
      entityType: 'performance_report',
      entityId: report.id,
      createdBy: sharedBy,
      createdByRole: 'mentor',
    });
  },
};

// Never throws: a notification problem must not affect the request that caused the event
const onAssessmentAgentEvent = (event) => {
  const handler = event && handlers[event.name];
  if (!handler) return;
  Promise.resolve()
    .then(() => handler(event))
    .catch((err) => console.error('[notifications] assessment agent event failed:', event.name, err.message));
};

module.exports = { onAssessmentAgentEvent };
