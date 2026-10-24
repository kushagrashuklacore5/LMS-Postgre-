// Where a notification leads when it is clicked.
// The server stores only WHAT the notification is about (type + entityType + entityId);
// the screen is decided here, so no URL ever travels inside a notification.
export const notificationTarget = (notification, role) => {
  if (!notification || !notification.type) return null; // an ordinary announcement
  const id = notification.entityId;
  const isMentor = role === "mentor" || role === "teacher";

  switch (notification.type) {
    case "ASSESSMENT_PUBLISHED":
      return notification.entityType === "course" && id ? `/student/course/${id}` : "/student/assessment-agent/tests";
    case "ASSIGNMENT_PUBLISHED":
    case "ASSIGNMENT_DUE_SOON":
    case "ASSIGNMENT_MISSED":
      return id ? `/student/assessment-agent/assignments/${id}` : "/student/assessment-agent/assignments";
    case "RESULT_AVAILABLE":
      return notification.entityType === "aia_assignment" && id
        ? `/student/assessment-agent/assignments/${id}`
        : "/student/results";
    case "REPORT_SHARED":
      return id ? `/student/assessment-agent/reports/${id}` : "/student/assessment-agent/tests";
    case "CALENDAR_EVENT": {
      const page = role === "admin" ? "/admin/calendar" : isMentor ? "/mentor/calendar" : "/student/calendar";
      return id ? `${page}?eventId=${id}` : page; // the calendar opens on that event's month
    }
    case "ASSIGNMENT_SUBMITTED":
      return "/teacher/assessments/assignments";
    case "ATTEMPT_SUBMITTED":
      return "/teacher/assessments";
    case "ATTENDANCE_PENDING":
      return id ? `/mentor/attendance?classroomId=${id}` : "/mentor/attendance";
    case "LIVE_CLASS_STARTED":
      return id ? `/live/${id}` : "/student/lectures";
    case "LIVE_CLASS_SCHEDULED":
      return "/student/lectures";
    case "MENTOR_PENDING_APPROVAL":
      return "/admin/mentors";
    default:
      return null;
  }
};
