const { isWebUrl, isEmptyOrWebUrl } = require('../helpers/safeUrl');
const db = require('../config/database-switch');
const BilingualDataService = require("../services/BilingualDataService");

// Helper to map chapter
const mapChapter = (c) => ({
  ...c,
  _id: c.id
});

// Create a new chapter
const createChapter = async (req, res) => {
  try {
    const { courseId, title, description, imageUrl, videoUrl, order } = req.body;
    const userId = req.user.userId;

    // Handle file upload
    const fileUrl = req.file ? `/uploads/${req.file.filename}` : "";

    // Validation
    if (!courseId || !title || !videoUrl || order === undefined) {
      return res.status(400).json({ message: "courseId, title, videoUrl, and order are required" });
    }
    if (!isWebUrl(videoUrl) || !isEmptyOrWebUrl(imageUrl)) {
      return res.status(400).json({ message: "Video and image links must be a web address starting with http:// or https://" });
    }

    db.get("SELECT * FROM courses WHERE id = ?", [courseId], (err, course) => {
      if (err) return res.status(500).json({ message: "Database error" });
      if (!course) return res.status(404).json({ message: "Course not found" });

      if (course.mentorId !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ message: "Not authorized" });
      }

      db.run(
        `INSERT INTO chapters (courseId, title, description, imageUrl, videoUrl, fileUrl, "order")
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [courseId, title, description || '', imageUrl || '', videoUrl, fileUrl, order],
        function(insertErr) {
          if (insertErr) {
            console.error("Error creating chapter:", insertErr);
            return res.status(500).json({ message: "Failed to create chapter" });
          }

          db.get("SELECT * FROM chapters WHERE id = ?", [this.lastID], (selectErr, chapter) => {
            if (selectErr || !chapter) return res.status(201).json({ message: "Chapter created successfully" });
            res.status(201).json({ message: "Chapter created successfully", chapter: mapChapter(chapter) });
          });
        }
      );
    });
  } catch (error) {
    console.error("CREATE CHAPTER ERROR:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update a chapter
const updateChapter = async (req, res) => {
  try {
    const { chapterId } = req.params;
    const { title, description, imageUrl, videoUrl, order } = req.body;
    const userId = req.user.userId;
    if (!isEmptyOrWebUrl(videoUrl) || !isEmptyOrWebUrl(imageUrl)) {
      return res.status(400).json({ message: "Video and image links must be a web address starting with http:// or https://" });
    }

    db.get("SELECT c.*, ch.courseId FROM chapters ch JOIN courses c ON ch.courseId = c.id WHERE ch.id = ?", [chapterId], (err, row) => {
      if (err) return res.status(500).json({ message: "Database error" });
      if (!row) return res.status(404).json({ message: "Chapter not found" });

      if (row.mentorId !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      let fileUrl = undefined;
      if (req.file) {
        fileUrl = `/uploads/${req.file.filename}`;
      }

      db.run(
        `UPDATE chapters SET
          title = COALESCE(?, title),
          description = COALESCE(?, description),
          imageUrl = COALESCE(?, imageUrl),
          videoUrl = COALESCE(?, videoUrl),
          fileUrl = COALESCE(?, fileUrl),
          "order" = COALESCE(?, "order")
         WHERE id = ?`,
        [title, description, imageUrl, videoUrl, fileUrl, order, chapterId],
        (updateErr) => {
          if (updateErr) return res.status(500).json({ message: "Database update error" });
          db.get("SELECT * FROM chapters WHERE id = ?", [chapterId], (sErr, chapter) => {
            res.json({ message: "Chapter updated successfully", chapter: mapChapter(chapter) });
          });
        }
      );
    });
  } catch (error) {
    console.error("UPDATE CHAPTER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete a chapter
const deleteChapter = async (req, res) => {
  try {
    const { chapterId } = req.params;
    const userId = req.user.userId;

    db.get("SELECT c.*, ch.courseId FROM chapters ch JOIN courses c ON ch.courseId = c.id WHERE ch.id = ?", [chapterId], (err, row) => {
      if (err) return res.status(500).json({ message: "Database error" });
      if (!row) return res.status(404).json({ message: "Chapter not found" });

      if (row.mentorId !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      db.run("DELETE FROM chapters WHERE id = ?", [chapterId], (delErr) => {
        if (delErr) return res.status(500).json({ message: "Database error" });
        res.json({ message: "Chapter deleted successfully" });
      });
    });
  } catch (error) {
    console.error("DELETE CHAPTER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get chapters for a course
const getChapters = async (req, res) => {
  try {
    const courseId = req.query.courseId || req.params.courseId || req.params.id;
    const userId = req.user.userId || req.user.id;
    const userRole = req.user.role;

    if (!courseId) {
      return res.status(400).json({ message: "courseId parameter is required" });
    }

    db.get("SELECT * FROM courses WHERE id = ?", [courseId], (err, course) => {
      if (err) return res.status(500).json({ message: "Database error" });
      if (!course) return res.status(404).json({ message: "Course not found" });

      // Verification for student access
      const checkAccessAndReturn = () => {
        db.all('SELECT * FROM chapters WHERE courseId = ? ORDER BY "order" ASC', [courseId], (cErr, chapters) => {
          if (cErr) return res.status(500).json({ message: "Database error" });
          const mapped = (chapters || []).map(mapChapter);
          const language = req.language || 'en';
          const formatted = BilingualDataService.formatChapters(mapped, language);
          res.json(formatted || []);
        });
      };

      if (userRole === 'admin' || (userRole === 'mentor' && course.mentorId === userId)) {
        return checkAccessAndReturn();
      }

      if (userRole === 'student') {
        db.get("SELECT id FROM course_students WHERE courseId = ? AND studentId = ?", [courseId, userId], (csErr, enrollment) => {
          // only an enrolment counts: being in the course's class is not enough
          if (enrollment) {
            return checkAccessAndReturn();
          }
          return res.status(403).json({ message: "You are not enrolled in this course" });
        });
      } else {
        checkAccessAndReturn();
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createChapter,
  updateChapter,
  deleteChapter,
  getChapters
};

