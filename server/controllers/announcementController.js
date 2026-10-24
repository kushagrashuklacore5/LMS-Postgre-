const BilingualDataService = require("../services/BilingualDataService");
const { generateText, NOTIFICATION_TYPES } = require("../services/notificationText");
const { HttpError, authorizeClassroom, authorizeCourse, listClassrooms } = require("../helpers/teachingScope");
const { run, get: dbGet } = require("../helpers/dbAsync");

function getDb(req) {
  return req?.tenant?.database || require("../config/database-switch");
}



/* ======================================================
   CREATE ANNOUNCEMENT
====================================================== */
const createAnnouncement = async (req, res) => {
  try {
    const { title, message, publishFor, courseId, classroomId, allClasses } = req.body;
    const userId = req.user.userId;
    const role = req.user.role;
    const universityId = req.user?.universityId || req.user?.university_id;

    if (!title || !message) {
      return res.status(400).json({ message: "Title and message required" });
    }

    // Build announcement payload
    let announcementData = {
      title,
      content: message,
      university_id: universityId,
      createdByUser: userId,
      createdByRole: role,
    };

    /* ================= ADMIN ================= */
    if (role === "admin") {
      if (!publishFor) {
        return res.status(400).json({ message: "publishFor is required" });
      }

      // Normalize publishFor - accept: 'students', 'mentors'/'faculty', 'both'/'all'
      const pf = String(publishFor).toLowerCase().trim();
      let normalized = pf;
      
      // Normalize to canonical values
      if (pf === "both" || pf === "all") normalized = "both";
      else if (pf === "faculty" || pf === "teacher" || pf === "teachers" || pf === "mentor" || pf === "mentors") normalized = "mentors";
      else if (pf === "student" || pf === "students") normalized = "students";
      else {
        return res.status(400).json({ 
          message: "publishFor must be 'students', 'mentors', or 'both'" 
        });
      }

      announcementData.publishFor = normalized;
    }

    /* ================= MENTOR ================= */
    if (role === "mentor" || role === "teacher") {
      // "Whole class and section": every class and section this teacher is assigned to.
      // The list comes from the server, never from the browser; one announcement per classroom.
      if ((allClasses === true || allClasses === "true") && !classroomId && !courseId) {
        const classrooms = await listClassrooms(req);
        if (classrooms.length === 0) {
          return res.status(400).json({ message: "You are not assigned to any class yet" });
        }
        const ids = [];
        for (const classroom of classrooms) {
          const inserted = await run(
            "INSERT INTO announcements (title, content, university_id, createdByUser, createdByRole, classroomId) VALUES (?, ?, ?, ?, ?, ?)",
            [title, message, universityId, userId, role, classroom.id]
          );
          ids.push(inserted.lastID);
        }
        return res.json({
          success: true,
          message: "Announcement created successfully",
          data: { ids, classrooms: classrooms.map((c) => ({ id: c.id, name: c.name })) },
        });
      }

      if (!classroomId && !courseId) {
        return res.status(400).json({ message: "Class and section are required" });
      }
      // The class/section and the course are both checked against what this teacher may manage.
      // A course-only request (older clients) is still accepted for a course the teacher teaches.
      const classroom = classroomId ? await authorizeClassroom(req, classroomId) : null;
      const course = courseId ? await authorizeCourse(req, courseId, classroom ? classroom.id : null) : null;

      if (course) announcementData.courseId = course.id;
      announcementData.classroomId = classroom ? classroom.id : (course && course.classroomId) || null;
    }

    // Insert announcement into announcements table using simplified approach
    const columns = ['title', 'content', 'university_id', 'createdByUser', 'createdByRole'];
    const values = [announcementData.title, announcementData.content, universityId, userId, role];

    // Add publishFor for admin announcements
    if (announcementData.publishFor) {
      columns.push('publishFor');
      values.push(announcementData.publishFor);
    }

    // Add courseId for mentor announcements
    if (announcementData.courseId) {
      columns.push('courseId');
      values.push(announcementData.courseId);
    }

    // Class/section the announcement is for (general class announcement when there is no course)
    if (announcementData.classroomId) {
      columns.push('classroomId');
      values.push(announcementData.classroomId);
    }

    // Add targetUserId for direct personal user announcements
    if (announcementData.targetUserId) {
      columns.push('targetUserId');
      values.push(announcementData.targetUserId);
    }

    // Build the INSERT query
    const placeholders = columns.map(() => '?').join(', ');
    const insertQuery = `INSERT INTO announcements (${columns.join(', ')}) VALUES (${placeholders})`;

    getDb(req).run(insertQuery, values, function(err) {
      if (err) {
        console.error("Error creating announcement:", err);
        return res.status(500).json({ message: "Error creating announcement" });
      }

      console.log("✅ Announcement created successfully");
      res.json({
        success: true,
        message: "Announcement created successfully",
        data: {
          id: this.lastID,
          ...announcementData
        }
      });
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("CREATE ANNOUNCEMENT ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   GET ALL ANNOUNCEMENTS
====================================================== */
const getAllAnnouncements = async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user.userId;
    const universityId = req.user?.universityId || req.user?.university_id;
    // Newest first, never unbounded: ?limit=N (1-500), default and maximum 500. The bell asks for 30.
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 500);

    // The platform owner belongs to no school: only notifications addressed to this account
    if (role === "superadmin") {
      return getDb(req).all(
        `SELECT a.*, u.name as createdByUserName
         FROM announcements a LEFT JOIN users u ON a.createdByUser = u.id
         WHERE a.recipientUserId = ?
         ORDER BY a.createdAt DESC, a.id DESC
         LIMIT ?`,
        [userId, limit],
        (err, rows) => {
          if (err) {
            console.error("Error fetching announcements:", err);
            return res.status(500).json({ message: "Database error" });
          }
          res.json((rows || []).map((a) => ({ ...a, readBy: a.readBy || '[]' })));
        }
      );
    }

    let query = `
      SELECT a.*, u.name as createdByUserName
      FROM announcements a
      LEFT JOIN users u ON a.createdByUser = u.id
      WHERE a.university_id = ?
    `;

    // Filter based on role (ordinary announcements only)
    let audience = "1 = 1"; // admin: every announcement of their university
    const roleParams = [];
    if (role === "student") {
      // Students see:
      // 1. Announcements for 'students' or 'both': a personal one (targetUserId, e.g. a fee reminder) only when it
      //    is theirs; general ones only when they are not a fee reminder meant for someone else
      // 2. Announcements created by mentors for courses the student is enrolled in
      // 3. General class announcements (no course) for a classroom the student belongs to
      audience = `(
        (a.publishFor IN ('students', 'both') AND (
          a.targetUserId = ?
          OR (a.targetUserId IS NULL AND a.title NOT ILIKE '%Fee Payment Reminder%')
        ))
        OR (a.createdByRole = 'mentor' AND a.courseId IN (SELECT courseId FROM course_students WHERE studentId = ?))
        OR (a.courseId IS NULL AND a.classroomId IN (SELECT classroomId FROM student_classroom_assignment WHERE studentId = ?))
      )`;
      roleParams.push(userId, userId, userId);
    } else if (role === "mentor" || role === "teacher" || role === "faculty") {
      // Mentors see:
      // 1. Announcements published for 'mentors' or 'both'
      // 2. Their own course announcements (where publishFor is NULL and courseId is set)
      // 3. Announcements they created themselves (including general class announcements)
      audience = `(
        a.publishFor IN ('mentors', 'both')
        OR (a.courseId IN (SELECT id FROM courses WHERE mentorId = ?))
        OR a.createdByUser = ?
      )`;
      roleParams.push(userId, userId);
    } else if (role !== "admin") {
      // Any other role (accountant, storekeeper, ...) only sees broadcasts to everyone, never announcements
      // targeted at a specific user or student fee reminders.
      audience = `(
        a.publishFor = 'both'
        AND a.targetUserId IS NULL
        AND a.title NOT ILIKE '%Fee Payment Reminder%'
      )`;
    }

    // A targeted notification (recipientUserId set) is visible to that one user only
    query += ` AND (
      a.recipientUserId = ?
      OR (a.recipientUserId IS NULL AND ${audience})
    )`;

    query += ` ORDER BY a.createdAt DESC, a.id DESC LIMIT ?`;

    // universityId, the user (targeted rows), then the role's own parameters in the order they appear
    const params = [universityId, userId, ...roleParams, limit];

    getDb(req).all(query, params, (err, announcements) => {
      if (err) {
        console.error("Error fetching announcements:", err);
        return res.status(500).json({ message: "Database error" });
      }

      // Ensure readBy field is properly parsed for each announcement
      const processedAnnouncements = (announcements || []).map(announcement => ({
        ...announcement,
        readBy: announcement.readBy || '[]' // Ensure readBy field exists
      }));

      // Format announcements according to language (fallback to 'en' if not provided)
      const language = req.language || req.headers['accept-language'] || 'en';
      const formatted = BilingualDataService.formatAnnouncements(processedAnnouncements, language);

      console.log(`📋 Retrieved ${formatted.length} announcements for ${role}`);
      res.json(formatted);
    });
  } catch (error) {
    console.error("GET ALL ANNOUNCEMENTS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   DELETE ANNOUNCEMENT
====================================================== */
const deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const role = req.user.role;
    const universityId = req.user?.universityId;

    // Check if announcement exists and user has permission
    getDb(req).get("SELECT * FROM announcements WHERE id = ? AND university_id = ?", [id, universityId], (err, announcement) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (!announcement) {
        return res.status(404).json({ message: "Announcement not found" });
      }

      // Check permissions (admin can delete all, mentor can delete their own)
      if (role !== "admin" && announcement.createdByUser !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Delete announcement
      getDb(req).run("DELETE FROM announcements WHERE id = ? AND university_id = ?", [id, universityId], function(err) {
        if (err) {
          console.error("Error deleting announcement:", err);
          return res.status(500).json({ message: "Error deleting announcement" });
        }

        res.json({ message: "Announcement deleted successfully" });
      });
    });
  } catch (error) {
    console.error("DELETE ANNOUNCEMENT ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   MARK ANNOUNCEMENT AS READ
====================================================== */
const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    // Extract userId from req.user (handle both userId and id properties)
    const userId = req.user?.userId || req.user?.id;


    if (!userId) {
      console.warn(`⚠️ No userId for announcement ${id}, skipping mark as read`);
      // Return success anyway - don't block the UI
      return res.status(200).json({ message: "OK - no userId to mark read" });
    }

    // Only an announcement of the caller's own school, or a notification addressed to the caller
    // (the platform owner has no school, so only the latter). Anything else is "not found".
    const universityId = req.user?.universityId ?? null;
    const userIdStr = String(userId);
    // Compare-and-set: two people marking the same announcement at once must not lose each other's mark
    for (let attempt = 0; attempt < 5; attempt++) {
      const announcement = await dbGet(
        "SELECT id, readBy, recipientUserId FROM announcements WHERE id = ? AND (university_id = ? OR recipientUserId = ?)",
        [id, universityId, userId]
      );
      if (!announcement) return res.status(404).json({ message: "Announcement not found" });

      // A targeted notification can only be marked read by its recipient
      if (announcement.recipientUserId && String(announcement.recipientUserId) !== userIdStr) {
        return res.status(404).json({ message: "Announcement not found" });
      }

      let readBy = [];
      try {
        readBy = JSON.parse(announcement.readBy || '[]');
      } catch (e) {
        readBy = [];
      }
      readBy = (Array.isArray(readBy) ? readBy : []).map(String);
      if (readBy.includes(userIdStr)) return res.json({ message: "Announcement marked as read" });
      readBy.push(userIdStr);

      const previous = announcement.readBy;
      const { changes } = await run(
        previous == null
          ? "UPDATE announcements SET readBy = ? WHERE id = ? AND readBy IS NULL"
          : "UPDATE announcements SET readBy = ? WHERE id = ? AND readBy = ?",
        previous == null ? [JSON.stringify(readBy), id] : [JSON.stringify(readBy), id, previous]
      );
      if (changes) return res.json({ message: "Announcement marked as read" });
      // someone else changed readBy in between: read it again
    }
    res.status(409).json({ message: "Please try again" });
  } catch (error) {
    console.error("MARK AS READ ERROR:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* ======================================================
   GET ONE ANNOUNCEMENT / NOTIFICATION
====================================================== */
const getAnnouncement = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const universityId = req.user?.universityId || req.user?.university_id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    db.get(
      "SELECT * FROM announcements WHERE id = ? AND university_id = ?",
      [req.params.id, universityId],
      (err, announcement) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }
        // Another user's targeted notification does not exist as far as this user is concerned
        if (!announcement || (announcement.recipientUserId && String(announcement.recipientUserId) !== String(userId))) {
          return res.status(404).json({ message: "Announcement not found" });
        }
        res.json(announcement);
      }
    );
  } catch (error) {
    console.error("GET ANNOUNCEMENT ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   SUGGEST NOTIFICATION TEXT (PREVIEW BEFORE SENDING)
   Returns a short message only. Recipients, type and target are decided by the server
   when the item is actually created.
====================================================== */
const suggestNotificationText = async (req, res) => {
  try {
    const role = req.user?.role;
    if (!["admin", "mentor", "teacher"].includes(role)) {
      return res.status(403).json({ message: "Not allowed" });
    }

    const { type, title, date, deadline } = req.body || {};
    if (!NOTIFICATION_TYPES.includes(type)) {
      return res.status(400).json({ message: "Unknown notification type" });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: "Title is required" });
    }

    const text = await generateText(type, { title, date, deadline });
    res.json({ title: text.title, message: text.message, source: text.source });
  } catch (error) {
    console.error("SUGGEST NOTIFICATION TEXT ERROR:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getAnnouncement,
  suggestNotificationText,
  createAnnouncement,
  getAllAnnouncements,
  deleteAnnouncement,
  markAsRead,
};
