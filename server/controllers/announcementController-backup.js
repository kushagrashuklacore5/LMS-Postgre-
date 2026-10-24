const Announcement = require("../models/Announcement");
const Course = require("../models/Course");

/* ======================================================
   CREATE ANNOUNCEMENT
====================================================== */
const createAnnouncement = async (req, res) => {
  try {
    const { title, message, publishFor, courseId } = req.body;
    const userId = req.user.userId;
    const role = req.user.role;

    if (!title || !message) {
      return res.status(400).json({ message: "Title and message required" });
    }

    let announcementData = {
      title,
      message,
      createdByUser: userId,
      createdByRole: role,
    };

    /* ================= ADMIN ================= */
    if (role === "admin") {
      if (!publishFor) {
        return res
          .status(400)
          .json({ message: "publishFor is required" });
      }

      announcementData.publishFor = publishFor;
    }

    /* ================= MENTOR ================= */
    if (role === "mentor") {
      if (!courseId) {
        return res
          .status(400)
          .json({ message: "courseId is required" });
      }

      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      announcementData.courseId = courseId;
    }

    const announcement = await Announcement.create(announcementData);

    /* 🔥 REAL-TIME PUSH */
    if (req.io) {
      req.io.emit("new-announcement", announcement);
    }

    res.status(201).json(announcement);
  } catch (err) {
    console.error("CREATE ANNOUNCEMENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   GET ANNOUNCEMENTS (ROLE BASED)
====================================================== */
const getAnnouncements = async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;

    /* ================= ADMIN ================= */
    if (role === "admin") {
      const announcements = await Announcement.find()
        .sort({ createdAt: -1 });
      return res.json(announcements);
    }

    /* ================= MENTOR ================= */
    if (role === "mentor") {
      const announcements = await Announcement.find({
        $or: [
          {
            createdByRole: "admin",
            publishFor: { $in: ["faculty", "both"] },
          },
          {
            createdByUser: userId,
          },
        ],
      }).sort({ createdAt: -1 });

      return res.json(announcements);
    }

    /* ================= STUDENT ================= */
    if (role === "student") {
      const courses = await Course.find({
        students: userId,
      }).select("_id");

      const courseIds = courses.map((c) => c._id);

      const announcements = await Announcement.find({
        $or: [
          {
            createdByRole: "admin",
            publishFor: { $in: ["student", "both"] },
          },
          {
            createdByRole: "mentor",
            courseId: { $in: courseIds },
          },
        ],
      }).sort({ createdAt: -1 });

      return res.json(announcements);
    }

    res.status(403).json({ message: "Invalid role" });
  } catch (err) {
    console.error("GET ANNOUNCEMENTS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ======================================================
   MARK ANNOUNCEMENT AS READ
====================================================== */
const markAsRead = async (req, res) => {
  try {
    await Announcement.findByIdAndUpdate(req.params.id, {
      $addToSet: { readBy: req.user.userId },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("MARK READ ERROR:", err);
    res.status(500).json({ message: "Failed to mark read" });
  }
};

/* ======================================================
   EXPORTS
====================================================== */
module.exports = {
  createAnnouncement,
  getAnnouncements,
  markAsRead,
};
