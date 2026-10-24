const { isWebUrl, isEmptyOrWebUrl } = require('../helpers/safeUrl');
const LiveClass = require("../models/LiveClass");
const Course = require("../models/Course");
const tenantConnectionManager = require('../config/tenant-connection-manager');
const db = require('../config/database-switch');
const { randomUUID } = require('crypto');

/**
 * ================================
 * CREATE LIVE CLASS (MENTOR)
 * ================================
 */
exports.createLiveClass = async (req, res) => {
  try {
    if (req.user.role !== "mentor" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Course teacher access only" });
    }

    const {
      courseId,
      title,
      description,
      scheduledStartTime,
      scheduledEndTime,
      duration,
      meetingLink,
      meetingId,
      platform
    } = req.body;

    if (!courseId || !title || !scheduledStartTime || !scheduledEndTime) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    if (!isEmptyOrWebUrl(meetingLink)) {
      return res.status(400).json({ message: "The meeting link must be a web address starting with http:// or https://" });
    }

    // Verify course exists and user is mentor/owner (SQLite)
    const courseCheck = await new Promise((resolve) => {
      db.get("SELECT * FROM courses WHERE id = ?", [courseId], (err, row) => {
        if (err) return resolve({ err });
        resolve({ row });
      });
    });

    if (courseCheck.err) {
      console.error('Database error when checking course:', courseCheck.err);
      return res.status(500).json({ message: 'Database error' });
    }

    if (!courseCheck.row) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Allow admin or course teacher to create live classes
    if (req.user.role !== "admin" && courseCheck.row.mentorId !== req.user.userId) {
      return res.status(403).json({ message: "Not authorized for this course" });
    }

    // If platform is jitsi and no meeting link/id provided, generate them
    const chosenPlatform = platform || 'jitsi';
    let finalMeetingId = meetingId;
    let finalMeetingLink = meetingLink;

    if (chosenPlatform === 'jitsi') {
      if (!finalMeetingId) {
        // generate short UUID for room name
        finalMeetingId = randomUUID();
      }
      if (!finalMeetingLink) {
        finalMeetingLink = `https://meet.jit.si/${finalMeetingId}`;
      }
    }

    // Insert into SQLite live_classes
    const insertResult = await new Promise((resolve) => {
      const q = `INSERT INTO live_classes (courseId, instructorId, title, description, scheduledStartTime, scheduledEndTime, duration, meetingLink, meetingId, platform, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;
      db.run(
        q,
        [
          courseId,
          req.user.userId,
          title,
          description || "",
          scheduledStartTime,
          scheduledEndTime,
          duration || 60,
          finalMeetingLink,
          finalMeetingId,
          chosenPlatform,
          'scheduled'
        ],
        function (err) {
          if (err) return resolve({ err });
          resolve({ lastID: this.lastID });
        }
      );
    });

    if (insertResult.err) {
      console.error('Error inserting live class:', insertResult.err);
      return res.status(500).json({ message: 'Database error' });
    }

    // Return created live class object for frontend
    const created = {
      id: insertResult.lastID,
      _id: insertResult.lastID,
      courseId,
      instructorId: req.user.userId,
      title,
      description: description || "",
      scheduledStartTime,
      scheduledEndTime,
      duration: duration || 60,
      meetingLink: finalMeetingLink,
      meetingId: finalMeetingId,
      platform: chosenPlatform,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    res.status(201).json({ message: "Live class scheduled successfully", liveClass: created });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ================================
 * GET LIVE CLASSES FOR COURSE
 * ================================
 */
exports.getCourseLiveClasses = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Read from SQLite live_classes table
    db.all(
      "SELECT * FROM live_classes WHERE courseId = ? ORDER BY scheduledStartTime DESC",
      [courseId],
      (err, rows) => {
        if (err) {
          console.error('Database error fetching live classes:', err);
          return res.status(500).json({ message: 'Database error' });
        }

        const mapped = (rows || []).map(r => ({
          _id: r.id,
          id: r.id,
          courseId: r.courseId,
          instructorId: r.instructorId,
          title: r.title,
          description: r.description,
          scheduledStartTime: r.scheduledStartTime,
          scheduledEndTime: r.scheduledEndTime,
          actualStartTime: r.actualStartTime,
          actualEndTime: r.actualEndTime,
          meetingLink: r.meetingLink,
          meetingId: r.meetingId,
          platform: r.platform,
          status: r.status,
          duration: r.duration,
          recordingUrl: r.recordingUrl,
          attendees: JSON.parse(r.attendees || '[]'),
          notes: r.notes,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        }));

        res.json(mapped);
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ================================
 * START LIVE CLASS (MENTOR)
 * ================================
 */
exports.startLiveClass = async (req, res) => {
  try {
    const { liveClassId } = req.params;
    const { actualStartTime, status } = req.body;

    // Fetch live class from SQLite
    const found = await new Promise((resolve) => {
      db.get("SELECT * FROM live_classes WHERE id = ?", [liveClassId], (err, row) => {
        if (err) return resolve({ err });
        resolve({ row });
      });
    });

    if (found.err) {
      console.error('Database error fetching live class:', found.err);
      return res.status(500).json({ message: 'Database error' });
    }

    const liveClass = found.row;
    if (!liveClass) return res.status(404).json({ message: 'Live class not found' });

    // Verify instructor owns this class or is admin
    if (req.user.role !== 'admin' && String(liveClass.instructorId) !== String(req.user.userId)) {
      return res.status(403).json({ message: 'Not authorized to start this class' });
    }

    const startTime = actualStartTime || new Date().toISOString();
    const newStatus = status || 'live';

    await new Promise((resolve) => {
      db.run(
        "UPDATE live_classes SET actualStartTime = ?, status = ?, updatedAt = datetime('now') WHERE id = ?",
        [startTime, newStatus, liveClassId],
        function (err) {
          resolve({ err });
        }
      );
    });

    // Emit socket.io event for real-time updates
    if (req.io) {
      req.io.emit('live-class-started', {
        liveClassId,
        courseId: liveClass.courseId,
        meetingLink: liveClass.meetingLink,
        title: liveClass.title,
      });
    }

    // Return updated live class
    const updated = { ...liveClass, actualStartTime: startTime, status: newStatus };
    res.json({ message: 'Live class started successfully', liveClass: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ================================
 * END LIVE CLASS (MENTOR)
 * ================================
 */
exports.endLiveClass = async (req, res) => {
  try {
    const { liveClassId } = req.params;

    // Fetch live class
    const found = await new Promise((resolve) => {
      db.get('SELECT * FROM live_classes WHERE id = ?', [liveClassId], (err, row) => {
        if (err) return resolve({ err });
        resolve({ row });
      });
    });

    if (found.err) {
      console.error('Database error fetching live class:', found.err);
      return res.status(500).json({ message: 'Database error' });
    }

    const liveClass = found.row;
    if (!liveClass) return res.status(404).json({ message: 'Live class not found' });

    // Verify instructor owns this class or is admin
    if (req.user.role !== 'admin' && String(liveClass.instructorId) !== String(req.user.userId)) {
      return res.status(403).json({ message: 'Not authorized to end this class' });
    }

    const endTime = new Date().toISOString();

    // Calculate duration if actualStartTime exists
    let duration = liveClass.duration;
    if (liveClass.actualStartTime) {
      const startMs = new Date(liveClass.actualStartTime).getTime();
      const endMs = new Date(endTime).getTime();
      duration = Math.round((endMs - startMs) / 60000);
    }

    await new Promise((resolve) => {
      db.run(
        "UPDATE live_classes SET status = 'completed', actualEndTime = ?, duration = ?, updatedAt = datetime('now') WHERE id = ?",
        [endTime, duration || null, liveClassId],
        function (err) {
          resolve({ err });
        }
      );
    });

    // Emit socket.io event
    if (req.io) {
      req.io.emit('live-class-ended', { liveClassId, courseId: liveClass.courseId });
    }

    const updated = { ...liveClass, status: 'completed', actualEndTime: endTime, duration };
    res.json({ message: 'Live class ended', liveClass: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * DELETE LIVE CLASS
 */
exports.deleteLiveClass = async (req, res) => {
  try {
    const { liveClassId } = req.params;

    const found = await new Promise((resolve) => {
      db.get('SELECT * FROM live_classes WHERE id = ?', [liveClassId], (err, row) => {
        if (err) return resolve({ err });
        resolve({ row });
      });
    });

    if (found.err) {
      console.error('Database error fetching live class:', found.err);
      return res.status(500).json({ message: 'Database error' });
    }

    const liveClass = found.row;
    if (!liveClass) return res.status(404).json({ message: 'Live class not found' });

    // Verify instructor owns this class or is admin
    if (req.user.role !== 'admin' && String(liveClass.instructorId) !== String(req.user.userId)) {
      return res.status(403).json({ message: 'Not authorized to delete this class' });
    }

    await new Promise((resolve) => {
      db.run('DELETE FROM live_classes WHERE id = ?', [liveClassId], function (err) {
        resolve({ err });
      });
    });

    // Emit socket event for deletion
    if (req.io) {
      req.io.emit('live-class-deleted', { liveClassId, courseId: liveClass.courseId });
    }

    res.json({ message: 'Live class deleted' });
  } catch (err) {
    console.error('DELETE LIVE CLASS ERROR:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/**
 * ================================
 * GET LIVE CLASSES FOR STUDENT
 * ================================
 */
exports.getStudentLiveClasses = async (req, res) => {
  try {
    const studentId = req.user.userId;
    const tenantConnectionManager = require('../config/tenant-connection-manager');

    // Get all courses where student is enrolled
    const courseIds = await new Promise((resolve) => {
      db.all(
        "SELECT DISTINCT courseId FROM course_students WHERE studentId = ?",
        [studentId],
        (err, rows) => {
          if (err) {
            console.error('Error fetching student courses:', err);
            return resolve([]);
          }
          resolve((rows || []).map(row => row.courseId));
        }
      );
    });

    if (courseIds.length === 0) {
      return res.json([]);
    }

    // Get live classes for those courses (scheduled or live)
    const placeholders = courseIds.map(() => '?').join(',');
    const liveClasses = await new Promise((resolve) => {
      db.all(
        `SELECT * FROM live_classes WHERE courseId IN (${placeholders}) AND status IN ('scheduled', 'live') ORDER BY scheduledStartTime ASC`,
        courseIds,
        (err, rows) => {
          if (err) {
            console.error('Error fetching live classes:', err);
            return resolve([]);
          }
          resolve(rows || []);
        }
      );
    });

    // Map rows to response format (add _id alias for frontend)
    const formattedClasses = liveClasses.map(row => ({
      ...row,
      _id: row.id,
      instructorId: row.instructorId,
    }));

    res.json(formattedClasses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ================================
 * RECORD STUDENT ATTENDANCE IN LIVE CLASS
 * ================================
 */
exports.joinLiveClass = async (req, res) => {
  try {
    const { liveClassId } = req.params;
    const studentId = req.user.userId;
    const tenantConnectionManager = require('../config/tenant-connection-manager');



    // Get live class
    const liveClass = await new Promise((resolve) => {
      db.get(
        "SELECT * FROM live_classes WHERE id = ?",
        [liveClassId],
        (err, row) => {
          if (err) {
            console.error('Error fetching live class:', err);
            return resolve(null);
          }
          resolve(row);
        }
      );
    });

    if (!liveClass) {
      return res.status(404).json({ message: "Live class not found" });
    }

    // Record attendance: create or update live_class_attendees
    await new Promise((resolve) => {
      db.run(
        `INSERT INTO live_class_attendees (liveClassId, studentId, joinedAt)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(liveClassId, studentId) DO UPDATE SET
         joinedAt = datetime('now')`,
        [liveClassId, studentId],
        function (err) {
          if (err) {
            console.error('Error recording attendance:', err);
          }
          resolve();
        }
      );
    });

    res.json({
      message: "Joined live class successfully",
      meetingLink: liveClass.meetingLink,
      meetingId: liveClass.meetingId
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * ================================
 * LEAVE LIVE CLASS
 * ================================
 */
exports.leaveLiveClass = async (req, res) => {
  try {
    const { liveClassId } = req.params;
    const studentId = req.user.userId;

    const liveClass = await LiveClass.findById(liveClassId);
    if (!liveClass) {
      return res.status(404).json({ message: "Live class not found" });
    }

    // Update student's left time
    const attendee = liveClass.attendees.find(
      a => a.studentId.toString() === studentId
    );

    if (attendee && !attendee.leftAt) {
      attendee.leftAt = new Date();
      attendee.duration = Math.round(
        (attendee.leftAt - attendee.joinedAt) / 60000
      ); // Convert to minutes
      await liveClass.save();
    }

    res.json({
      message: "Left live class"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};
