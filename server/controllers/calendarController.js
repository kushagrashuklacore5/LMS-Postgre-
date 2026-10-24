const db = require('../config/database-switch');
const { get, all, run } = require('../helpers/dbAsync');
const notifications = require('../services/notificationService');
const { HttpError, CLASSROOM_ACCESS_SQL, authorizeClassroom, authorizeCourse, listClassrooms } = require('../helpers/teachingScope');



/**
 * ==================================
 * CREATE CALENDAR EVENT
 * ==================================
 * Admin:
 *  - publishFor required (student | faculty | both)
 *
 * Mentor:
 *  - courseId required
 */
/**
 * Optional notification for a new event. The audience is the event's own audience:
 *   course event        -> the students enrolled in that course
 *   class/section event -> the students of that classroom
 *   school-wide event   -> students / mentors / both of the creator's school (admin only)
 * Runs after the response; a notification problem never fails the event.
 */
const notifyEventAudience = async (event, user, customMessage) => {
  try {
    let recipientIds = [];
    if (event.courseId) {
      recipientIds = await notifications.studentsOfCourse(event.courseId, event.university_id);
    } else if (event.classroomId) {
      recipientIds = await notifications.studentsOfClassroom(event.classroomId, event.university_id);
    } else if (event.createdByRole === "admin") {
      const roles = [];
      if (["students", "both"].includes(event.publishFor)) roles.push("student");
      if (["mentors", "both"].includes(event.publishFor)) roles.push("mentor", "teacher");
      if (roles.length > 0) recipientIds = await notifications.usersByRole(event.university_id, roles);
    }

    await notifications.notify({
      type: "CALENDAR_EVENT",
      data: { title: event.title, date: event.startDate },
      customMessage,
      universityId: event.university_id,
      recipientIds: recipientIds.filter((id) => String(id) !== String(user.userId)),
      entityType: "calendar_event",
      entityId: event.id,
      createdBy: user.userId,
      createdByRole: user.role,
    });
  } catch (err) {
    console.error("CALENDAR NOTIFY ERROR:", err.message);
  }
};

const normalizePublishFor = (publishFor) => {
  const pf = String(publishFor || "").toLowerCase().trim();
  if (["faculty", "mentor", "mentors", "teachers"].includes(pf)) return "mentors";
  if (["student", "students"].includes(pf)) return "students";
  if (["both", "all"].includes(pf)) return "both";
  return null;
};

const createCalendarEvent = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user.userId;
    const role = req.user.role;
    const universityId = req.user.universityId;
    const isTeacher = role === "mentor" || role === "teacher";

    const { title, description, startDate, endDate, publishFor, courseId, classroomId, allClasses, notify, notifyMessage } =
      req.body;
    const shouldNotify = notify === true || notify === "true";

    if (!title || !startDate || !endDate) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (role !== "admin" && !isTeacher) {
      return res.status(403).json({ message: "Not allowed" });
    }

    // Teacher, "Whole class and section": one event for every class and section the teacher is
    // assigned to. The list comes from the server, never from the browser.
    if (isTeacher && (allClasses === true || allClasses === "true") && !classroomId && !courseId) {
      const classrooms = await listClassrooms(req);
      if (classrooms.length === 0) {
        return res.status(400).json({ message: "You are not assigned to any class yet" });
      }
      const events = [];
      for (const classroom of classrooms) {
        const added = await run(
          `INSERT INTO calendar_events
             (title, description, startDate, endDate, publishFor, courseId, classroomId, university_id, createdByRole, createdByUser, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 'mentor', ?, utc_now_text(), utc_now_text())`,
          [title, description, startDate, endDate, classroom.id, universityId, userId]
        );
        const created = await get(`SELECT * FROM calendar_events WHERE id = ?`, [added.lastID]);
        events.push(created);
        if (shouldNotify) notifyEventAudience(created, req.user, notifyMessage);
      }
      return res.status(201).json({ ...events[0], events });
    }

    // Class / section and course are checked against what this user may manage.
    let targetClassroomId = null;
    let targetCourseId = null;
    let audience = null; // school-wide audience (admin only)

    if (classroomId) {
      const classroom = await authorizeClassroom(req, classroomId);
      targetClassroomId = classroom.id;
      if (courseId) targetCourseId = (await authorizeCourse(req, courseId, classroom.id)).id;
    } else if (isTeacher) {
      // Older clients send a course only: accepted for a course the teacher may manage
      if (!courseId) {
        return res.status(400).json({ message: "Class and section are required" });
      }
      const course = await authorizeCourse(req, courseId);
      targetCourseId = course.id;
      targetClassroomId = course.classroomId || null;
    } else {
      // Admin, whole school
      audience = normalizePublishFor(publishFor);
      if (!publishFor) {
        return res.status(400).json({ message: "publishFor is required" });
      }
      if (!audience) {
        return res.status(400).json({ message: "publishFor must be 'students', 'mentors', or 'both'" });
      }
    }

    const inserted = await run(
      `INSERT INTO calendar_events
         (title, description, startDate, endDate, publishFor, courseId, classroomId, university_id, createdByRole, createdByUser, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, utc_now_text(), utc_now_text())`,
      [title, description, startDate, endDate, audience, targetCourseId, targetClassroomId, universityId, isTeacher ? "mentor" : "admin", userId]
    );
    const event = await get(`SELECT * FROM calendar_events WHERE id = ?`, [inserted.lastID]);

    if (shouldNotify) notifyEventAudience(event, req.user, notifyMessage);
    return res.status(201).json(event);
  } catch (err) {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error("CREATE EVENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ==================================
 * GET CALENDAR EVENTS (ROLE BASED)
 * ==================================
 * Always limited to the user's own school.
 */
const getCalendarEvents = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = req.user.userId;
    const role = req.user.role;
    const universityId = req.user.universityId;

    // ========= ADMIN: every event of the school =========
    if (role === "admin") {
      return res.json(
        await all(`SELECT * FROM calendar_events WHERE university_id = ? ORDER BY startDate ASC`, [universityId])
      );
    }

    // ========= MENTOR =========
    // Their own events, school-wide events for mentors, and events of classrooms they manage
    if (role === "mentor" || role === "teacher") {
      return res.json(
        await all(
          `SELECT e.* FROM calendar_events e
           WHERE e.university_id = ? AND (
             e.createdByUser = ?
             OR (e.createdByRole = 'admin' AND e.classroomId IS NULL AND e.courseId IS NULL AND e.publishFor IN ('mentors', 'both'))
             OR e.classroomId IN (SELECT c.id FROM classrooms c WHERE c.university_id = ? AND ${CLASSROOM_ACCESS_SQL})
           )
           ORDER BY e.startDate ASC`,
          [universityId, userId, universityId, userId, userId, userId, userId]
        )
      );
    }

    // ========= STUDENT =========
    // School-wide events for students, events of their courses, and class events of their classrooms
    if (role === "student") {
      return res.json(
        await all(
          `SELECT e.* FROM calendar_events e
           WHERE e.university_id = ? AND (
             (e.createdByRole = 'admin' AND e.classroomId IS NULL AND e.courseId IS NULL AND e.publishFor IN ('students', 'both'))
             OR (e.courseId IS NOT NULL AND e.courseId IN (SELECT courseId FROM course_students WHERE studentId = ?))
             OR (e.courseId IS NULL AND e.classroomId IN (SELECT classroomId FROM student_classroom_assignment WHERE studentId = ?))
           )
           ORDER BY e.startDate ASC`,
          [universityId, userId, userId]
        )
      );
    }

    return res.status(403).json({ message: "Invalid role" });
  } catch (err) {
    console.error("FETCH EVENTS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ==================================
 * UPDATE CALENDAR EVENT
 * ==================================
 * Only creator (admin/mentor) can edit
 */
const updateCalendarEvent = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;
    const userId = req.user.userId;
    const role = req.user.role;

    db.get(
      `SELECT * FROM calendar_events WHERE id = ?`,
      [id],
      (err, event) => {
        if (err || !event) {
          return res.status(404).json({ message: "Event not found" });
        }

        // 🔐 Ownership check - Admin can update their own events, Mentor can update their own events
        if (event.createdByUser !== userId) {
          return res.status(403).json({ message: "Permission denied" });
        }
        
        // If mentor, must be their own event
        if (role === "mentor" && event.createdByRole !== "mentor") {
          return res.status(403).json({ message: "Permission denied" });
        }
        
        // If admin, can update admin events
        if (role === "admin" && event.createdByRole !== "admin") {
          return res.status(403).json({ message: "Permission denied" });
        }

        // Build update query
        const allowedFields = ['title', 'description', 'startDate', 'endDate']; // who the event is for cannot be changed here
        const updates = {};
        for (const field of allowedFields) {
          if (req.body.hasOwnProperty(field)) {
            updates[field] = req.body[field];
          }
        }

        if (Object.keys(updates).length === 0) {
          return res.json({ message: "No fields to update", event });
        }

        const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);
        values.push(id);

        db.run(
          `UPDATE calendar_events SET ${setClause}, updatedAt = utc_now_text() WHERE id = ?`,
          values,
          (err) => {
            if (err) {
              console.error("UPDATE EVENT ERROR:", err);
              return res.status(500).json({ message: "Server error" });
            }

            db.get(
              `SELECT * FROM calendar_events WHERE id = ?`,
              [id],
              (err, updatedEvent) => {
                if (err) {
                  return res.status(500).json({ message: "Server error" });
                }
                return res.json({
                  message: "Event updated successfully",
                  event: updatedEvent,
                });
              }
            );
          }
        );
      }
    );
  } catch (err) {
    console.error("UPDATE EVENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ==================================
 * DELETE CALENDAR EVENT
 * ==================================
 * Only creator (admin/mentor) can delete
 */
const deleteCalendarEvent = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { id } = req.params;
    const userId = req.user.userId;
    const role = req.user.role;

    db.get(
      `SELECT * FROM calendar_events WHERE id = ?`,
      [id],
      (err, event) => {
        if (err || !event) {
          return res.status(404).json({ message: "Event not found" });
        }

        // 🔐 Ownership check - Admin can delete their own events, Mentor can delete their own events
        if (event.createdByUser !== userId) {
          return res.status(403).json({ message: "Permission denied" });
        }
        
        // If mentor, must be their own event (already checked userId)
        if (role === "mentor" && event.createdByRole !== "mentor") {
          return res.status(403).json({ message: "Permission denied" });
        }
        
        // If admin, can delete admin events
        if (role === "admin" && event.createdByRole !== "admin") {
          return res.status(403).json({ message: "Permission denied" });
        }

        db.run(
          `DELETE FROM calendar_events WHERE id = ?`,
          [id],
          (err) => {
            if (err) {
              console.error("DELETE EVENT ERROR:", err);
              return res.status(500).json({ message: "Server error" });
            }
            return res.json({ message: "Event deleted successfully" });
          }
        );
      }
    );
  } catch (err) {
    console.error("DELETE EVENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createCalendarEvent,
  getCalendarEvents,
  updateCalendarEvent,
  deleteCalendarEvent,
};
