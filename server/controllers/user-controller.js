const bcrypt = require('bcryptjs');
const db = require('../config/database-switch');

// Roles that exist inside one school
const SCHOOL_ROLES = ['student', 'mentor', 'teacher', 'admin', 'accountant', 'storekeeper'];



/* ================= GET ALL USERS (ADMIN ONLY) ================= */
const getAllUsers = async (req, res) => {
  try {
    const adminUniversityId = req.user?.universityId;
    db.all(`
      SELECT u.id, u.name, u.email, u.role, u.isApproved, u.created_at as createdAt,
             CASE WHEN u.role = 'student' THEN s.studentId ELSE NULL END as studentId,
             CASE WHEN u.role = 'student' THEN s.grade ELSE NULL END as grade
      FROM users u 
      LEFT JOIN students s ON u.id = s.userId 
      WHERE u.university_id = ?
      ORDER BY u.created_at DESC
    `, [adminUniversityId], (err, users) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }
      res.json(users || []);
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET MENTORS (ADMIN ONLY) ================= */
const getMentors = async (req, res) => {
  try {
    const adminUniversityId = req.user?.universityId;
    db.all("SELECT id, name, email, isApproved, createdAt FROM users WHERE role = ? AND university_id = ? ORDER BY name", ["mentor", adminUniversityId], (err, mentors) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }
      res.json(mentors || []);
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET MENTORS SIMPLE (FOR DROPDOWNS) ================= */
const getAllMentorsSimple = async (req, res) => {
  try {
    const adminUniversityId = req.user?.universityId;
    db.all("SELECT id, name, email FROM users WHERE role = 'mentor' AND isApproved = 1 AND university_id = ? ORDER BY name", [adminUniversityId], (err, mentors) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }
      res.json(mentors || []);
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET MENTORS FOR COURSE TEACHERS ================= */
const getMentorsForCourseTeachers = async (req, res) => {
  try {
    const adminUniversityId = req.user?.universityId;
    db.all("SELECT id as _id, name, email FROM users WHERE role = 'mentor' AND isApproved = 1 AND university_id = ? ORDER BY name", [adminUniversityId], (err, mentors) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }
      res.json(mentors || []);
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET STUDENTS FOR MENTORS ================= */
const getStudentsForMentors = async (req, res) => {
  try {
    const adminUniversityId = req.user?.universityId;
    db.all(`
      SELECT u.id as _id, u.id, u.name, u.email, s.grade, s.rollNumber
      FROM users u
      LEFT JOIN students s ON u.id = s.userId
      WHERE u.role = 'student' AND u.university_id = ?
      ORDER BY u.name
    `, [adminUniversityId], (err, students) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }
      res.json(students || []);
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET STUDENTS (ADMIN ONLY) ================= */
const getStudents = async (req, res) => {
  try {
    const adminUniversityId = req.user?.universityId;
    db.all(`
      SELECT u.id, u.name, u.email, u.isApproved, u.createdAt,
             s.grade, s.rollNumber, s.totalFees, s.feesPaid, s.pendingFees
      FROM users u
      LEFT JOIN students s ON u.id = s.userId
      WHERE u.role = ? AND u.university_id = ?
      ORDER BY u.createdAt DESC
    `, ["student", adminUniversityId], (err, students) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }
      res.json(students || []);
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= APPROVE MENTOR ================= */
const approveMentor = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists and is a mentor
    db.get("SELECT * FROM users WHERE id = ? AND role = ?", [userId, "mentor"], (err, user) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      if (!user) return res.status(404).json({ message: 'User not found' });

      // Update approval status
      db.run("UPDATE users SET isApproved = 1 WHERE id = ?", [userId], function(err) {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: 'Database error' });
        }

        res.json({ message: 'Mentor approved successfully' });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= REJECT MENTOR ================= */
const rejectMentor = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists and is a mentor
    db.get("SELECT * FROM users WHERE id = ? AND role = ?", [userId, "mentor"], (err, user) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      if (!user) return res.status(404).json({ message: 'User not found' });

      // Delete user
      db.run("DELETE FROM users WHERE id = ?", [userId], function(err) {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: 'Database error' });
        }

        res.json({ message: 'Mentor rejected successfully' });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= DELETE USER ================= */
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      if (!user) return res.status(404).json({ message: 'User not found' });

      // Delete user
      db.run("DELETE FROM users WHERE id = ?", [userId], function(err) {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: 'Database error' });
        }

        res.json({ message: 'User deleted successfully' });
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= UPDATE USER ================= */
const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, role, isApproved } = req.body;

    // A school admin can hand out school roles only - never the platform owner role.
    if (role !== undefined && role !== null && role !== '' && !SCHOOL_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    // Check if user exists
    db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: 'Database error' });
      }

      if (!user) return res.status(404).json({ message: 'User not found' });

      // Update user
      db.run(
        "UPDATE users SET name = ?, email = ?, role = ?, isApproved = ? WHERE id = ?",
        [name || user.name, email || user.email, role || user.role, isApproved !== undefined ? isApproved : user.isApproved, userId],
        function(err) {
          if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: 'Database error' });
          }

          res.json({ message: 'User updated successfully' });
        }
      );
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET ADMIN DASHBOARD DATA ================= */
const getAdminDashboard = async (req, res) => {
  try {
    const adminUniversityId = req.user?.universityId;
    
    // Get user statistics for admin's university only
    const userStats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT role, COUNT(*) as count
        FROM users
        WHERE university_id = ?
        GROUP BY role
      `, [adminUniversityId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Get course statistics for admin's university only
    const courseStats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT COUNT(*) as totalCourses 
        FROM courses 
        WHERE university_id = ?
      `, [adminUniversityId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Get payment statistics for admin's university (if applicable)
    const paymentStats = await new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          COUNT(*) as totalPayments,
          SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) as totalRevenue
        FROM payments
        WHERE studentId IN (SELECT id FROM users WHERE university_id = ?)
      `, [adminUniversityId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Get recent users for admin's university only with hierarchy
    const recentUsers = await new Promise((resolve, reject) => {
      db.all(`
        SELECT u.id, u.name, u.email, u.role, u.created_at as createdAt, u.created_by,
               creator.name as createdByName
        FROM users u
        LEFT JOIN users creator ON u.created_by = creator.id
        WHERE u.university_id = ?
        ORDER BY u.created_at DESC
        LIMIT 10
      `, [adminUniversityId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.json({
      userStats: userStats || [],
      totalCourses: courseStats?.totalCourses || 0,
      totalPayments: paymentStats?.totalPayments || 0,
      totalRevenue: paymentStats?.totalRevenue || 0,
      recentUsers: recentUsers || [],
      universityId: adminUniversityId, // Include for frontend reference
    });
    
  } catch (error) {
    console.error("GET ADMIN DASHBOARD ERROR:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET USER HIERARCHY ================= */
const getUserHierarchy = async (req, res) => {
  try {
    const adminUniversityId = req.user?.universityId;
    
    // Get all users with their creator information
    const users = await new Promise((resolve, reject) => {
      db.all(`
        SELECT u.id, u.name, u.email, u.role, u.created_at as createdAt, u.created_by,
               creator.name as createdByName, creator.email as createdByEmail
        FROM users u
        LEFT JOIN users creator ON u.created_by = creator.id
        WHERE u.university_id = ?
        ORDER BY u.created_at ASC
      `, [adminUniversityId], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Build hierarchy tree
    const hierarchy = users.reduce((acc, user) => {
      const userNode = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        created_by: user.created_by,
        createdByName: user.createdByName,
        createdByEmail: user.createdByEmail,
        children: []
      };
      
      if (!user.created_by) {
        // Top-level user (admin)
        acc[user.id] = userNode;
      } else {
        // Child user - will be added to parent
        acc[user.id] = userNode;
      }
      
      return acc;
    }, {});

    // Build the tree structure
    const tree = [];
    Object.values(hierarchy).forEach(user => {
      if (!user.created_by) {
        // Top-level user
        tree.push(user);
      } else if (hierarchy[user.created_by]) {
        // Add to parent's children
        hierarchy[user.created_by].children.push(user);
      }
    });

    res.json({
      hierarchy: tree,
      totalUsers: users.length,
      universityId: adminUniversityId
    });
    
  } catch (error) {
    console.error("GET USER HIERARCHY ERROR:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  getAllUsers,
  getMentors,
  getStudents,
  approveMentor,
  rejectMentor,
  deleteUser,
  updateUser,
  getAdminDashboard,
  getAllMentorsSimple,
  getMentorsForCourseTeachers,
  getStudentsForMentors,
  getUserHierarchy,
};
