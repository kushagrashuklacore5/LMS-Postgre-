// The handlers below use the shared LMS database connection.
const db = require('../config/database-switch');



/* ================= GET STUDENT DASHBOARD DATA ================= */
const getStudentDashboard = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get student information
    db.get(`
      SELECT u.id, u.name, u.email, u.role, u.isApproved,
             s.id as studentId, s.grade, s.rollNumber, s.totalFees, s.feesPaid, s.pendingFees
      FROM users u
      LEFT JOIN students s ON u.id = s.userId
      WHERE u.id = ?
    `, [userId], (err, student) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      // Get enrolled courses
      db.all(`
        SELECT c.id, c.title, c.description, c.category, c.duration, c.price, c.createdAt,
               u.name as mentorName
        FROM courses c
        LEFT JOIN users u ON c.mentorId = u.id
        WHERE c.university_id = ? AND (
          EXISTS (SELECT 1 FROM course_students cs WHERE cs.courseId = c.id AND cs.studentId = ?)
        )
        ORDER BY c.createdAt DESC
        LIMIT 5
      `, [req.user.universityId, userId], (err, courses) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        // Get recent payments
        db.all(`
          SELECT id, amount, type, status, description, createdAt
          FROM payments 
          WHERE studentId = ?
          ORDER BY createdAt DESC
          LIMIT 5
        `, [student.studentId || 0], (err, payments) => {
          if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Database error" });
          }

          res.json({
            student: {
              id: student.id,
              name: student.name,
              email: student.email,
              role: student.role,
              grade: student.grade,
              rollNumber: student.rollNumber,
              totalFees: student.totalFees || 0,
              feesPaid: student.feesPaid || 0,
              pendingFees: student.pendingFees || 0,
            },
            courses: courses || [],
            payments: payments || [],
          });
        });
      });
    });
  } catch (err) {
    console.error("GET STUDENT DASHBOARD ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET STUDENT COURSES ================= */
const getStudentCourses = async (req, res) => {
  try {
    // The student's own courses (enrolled, or taught to their classroom)
    db.all(`
      SELECT c.id, c.title, c.description, c.category, c.duration, c.price, c.createdAt,
             u.name as mentorName, u.email as mentorEmail
      FROM courses c
      LEFT JOIN users u ON c.mentorId = u.id
      WHERE c.university_id = ? AND (
        EXISTS (SELECT 1 FROM course_students cs WHERE cs.courseId = c.id AND cs.studentId = ?)
      )
      ORDER BY c.createdAt DESC
    `, [req.user.universityId, req.user.userId], (err, courses) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      res.json(courses || []);
    });
  } catch (err) {
    console.error("GET STUDENT COURSES ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET STUDENT PAYMENTS ================= */
const getStudentPayments = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get student ID first
    db.get("SELECT id FROM students WHERE userId = ?", [userId], (err, student) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (!student) {
        return res.json([]);
      }

      // Get payments
      db.all(`
        SELECT id, amount, type, status, description, createdAt
        FROM payments 
        WHERE studentId = ?
        ORDER BY createdAt DESC
      `, [student.id], (err, payments) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        res.json(payments || []);
      });
    });
  } catch (err) {
    console.error("GET STUDENT PAYMENTS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET STUDENT CLASSROOM ================= */
const getStudentClassroom = (req, res) => {
  try {
    const userId = req.user.userId;
    const studentId = req.params.studentId;

    // Verify the student ID matches the current user
    if (userId != studentId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    db.get(`
      SELECT c.id, c.name, c.grade, c.section
      FROM classrooms c
      INNER JOIN student_classroom_assignment sca ON c.id = sca.classroomId
      WHERE sca.studentId = ?
      LIMIT 1
    `, [userId], (err, classroom) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (!classroom) {
        return res.status(404).json({ message: "No classroom assigned" });
      }

      res.json(classroom);
    });
  } catch (err) {
    console.error("GET STUDENT CLASSROOM ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getStudentDashboard,
  getStudentCourses,
  getStudentPayments,
  getStudentClassroom,
};
