const db = require('../config/database-switch');
const { isUniqueViolation } = require('../helpers/dbErrors');



/* ================= CREATE WEEK ================= */
const createWeek = async (req, res) => {
  try {
    if (req.user.role !== "mentor") {
      return res.status(403).json({ message: "Course teacher access only" });
    }

    const { courseId, weekNumber, title, description } = req.body;

    if (!courseId || !weekNumber || !title) {
      return res.status(400).json({ message: "Course ID, week number, and title are required" });
    }

    // Verify course exists and user is mentor of the course
    db.get("SELECT * FROM courses WHERE id = ? AND mentorId = ?", [courseId, req.user.userId], (err, course) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (!course) {
        return res.status(403).json({ message: "Not authorized for this course" });
      }

      // Create week
      db.run(
        `INSERT INTO weeks (courseId, weekNumber, title, description, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, utc_now_text(), utc_now_text())`,
        [courseId, weekNumber, title, description || ""],
        function(insertErr) {
          if (insertErr) {
            console.error("Error creating week:", insertErr);
            if (isUniqueViolation(insertErr)) {
              return res.status(400).json({ message: "Week number already exists for this course" });
            }
            return res.status(500).json({ message: "Server error" });
          }

          res.status(201).json({
            message: "Week created successfully",
            week: {
              id: this.lastID,
              _id: this.lastID,
              courseId,
              weekNumber,
              title,
              description: description || "",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          });
        }
      );
    });
  } catch (err) {
    console.error("CREATE WEEK ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET WEEKS ================= */
const getWeeks = async (req, res) => {
  try {
    const { courseId } = req.query;

    if (!courseId) {
      return res.status(400).json({ message: "Course ID required" });
    }

    db.all(
      "SELECT * FROM weeks WHERE courseId = ? ORDER BY weekNumber ASC",
      [courseId],
      (err, weeks) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        // Map id to _id for frontend compatibility
        const mappedWeeks = (weeks || []).map(week => ({
          ...week,
          _id: week.id
        }));

        res.json(mappedWeeks);
      }
    );
  } catch (err) {
    console.error("GET WEEKS ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= UPDATE WEEK ================= */
const updateWeek = async (req, res) => {
  try {
    const weekId = req.params.weekId;
    const { title, description } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }

    db.get("SELECT courseId FROM weeks WHERE id = ?", [weekId], (err, week) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (!week) {
        return res.status(404).json({ message: "Week not found" });
      }

      // Verify user is course mentor
      db.get("SELECT mentorId FROM courses WHERE id = ?", [week.courseId], (courseErr, course) => {
        if (courseErr || !course || course.mentorId !== req.user.userId) {
          return res.status(403).json({ message: "Not authorized" });
        }

        db.run(
          "UPDATE weeks SET title = ?, description = ?, updatedAt = utc_now_text() WHERE id = ?",
          [title, description || "", weekId],
          function(updateErr) {
            if (updateErr) {
              console.error("Error updating week:", updateErr);
              return res.status(500).json({ message: "Server error" });
            }

            res.json({ message: "Week updated successfully" });
          }
        );
      });
    });
  } catch (err) {
    console.error("UPDATE WEEK ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= DELETE WEEK ================= */
const deleteWeek = async (req, res) => {
  try {
    const weekId = req.params.weekId;

    db.get("SELECT courseId FROM weeks WHERE id = ?", [weekId], (err, week) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (!week) {
        return res.status(404).json({ message: "Week not found" });
      }

      // Verify user is course mentor
      db.get("SELECT mentorId FROM courses WHERE id = ?", [week.courseId], (courseErr, course) => {
        if (courseErr || !course || course.mentorId !== req.user.userId) {
          return res.status(403).json({ message: "Not authorized" });
        }

        db.run("DELETE FROM weeks WHERE id = ?", [weekId], function(deleteErr) {
          if (deleteErr) {
            console.error("Error deleting week:", deleteErr);
            return res.status(500).json({ message: "Server error" });
          }

          res.json({ message: "Week deleted successfully" });
        });
      });
    });
  } catch (err) {
    console.error("DELETE WEEK ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createWeek,
  getWeeks,
  updateWeek,
  deleteWeek,
};
