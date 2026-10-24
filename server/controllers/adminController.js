const bcrypt = require("bcryptjs");
const { isEmail } = require("../helpers/validators");
const db = require('../config/database-switch');
const {
  checkAdminMentorQuota,
  checkAdminStudentQuota,
  checkAdminClassQuota,
  countUsersByRoleInUniversity
} = require("../helpers/quotaHelper");
const { get, all, run, withTransaction } = require("../helpers/dbAsync");
const {
  resolveClassroomSelection,
  refreshStudentCount,
  enrollStudentInClassroom,
} = require("../helpers/classroomEnrollment");



const getUniversitySubscriptionPlan = (universityId) => {
  return new Promise((resolve) => {
    db.get(
      'SELECT subscriptionPlan FROM universities WHERE id = ?',
      [universityId],
      (err, row) => {
        if (err) {
          console.warn('Error fetching university subscription plan:', err.message);
          return resolve('free');
        }
        resolve(row?.subscriptionPlan || 'free');
      }
    );
  });
};

/* ================= CREATE STUDENT ================= */
exports.createStudent = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const {
      fullName,
      parentName,
      email,
      phone,
      bloodGroup,
      address,
      admissionDate,
      dob,
      className,
      section,
      classroomId,
    } = req.body;

    if (!fullName || !email) {
      return res.status(400).json({
        message: "Name and Email are required",
      });
    }

    if (!isEmail(email)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }

    if (phone && !/^[0-9]{10}$/.test(String(phone).replace(/\D/g, ''))) {
      return res.status(400).json({
        message: "Phone number must be exactly 10 digits",
      });
    }

    // Get admin's university for tenant isolation
    const universityId = req.user.universityId;

    // Class + Section must resolve to an existing classroom BEFORE the student is created
    const selection = await resolveClassroomSelection({ classroomId, className, section, universityId });
    if (selection.error) {
      return res.status(selection.error.status).json({ message: selection.error.message });
    }
    const classroom = selection.classroom;

    // Check quota synchronously first
    countUsersByRoleInUniversity(universityId, 'student').then(async (currentStudentCount) => {
      try {
        // Use the university's current subscriptionPlan (propagated by superadmin upgrades)
        const planType = await getUniversitySubscriptionPlan(universityId);
        
        // Check student quota
        const quotaCheck = checkAdminStudentQuota(universityId, planType, currentStudentCount);
        if (!quotaCheck.allowed) {
          return res.status(400).json({ message: quotaCheck.message });
        }

        // Check if student already exists
        db.get("SELECT * FROM users WHERE email = ?", [email], async (err, exists) => {
          if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Database error" });
          }

          if (exists) {
            return res.status(400).json({
              message: "Student already exists",
            });
          }

          // AUTO PASSWORD (SAME LOGIC)
          const rawPassword = require('../utils/passwordUtils').generatePassword(12);
          const hashedPassword = await bcrypt.hash(rawPassword, 10);

          // Generate unique 10-digit student ID with 2026 prefix
          const generateStudentId = async () => {
            const prefix = "2026";
            const randomSuffix = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
            return prefix + randomSuffix;
          };

          let studentId;
          let isUnique = false;
          let attempts = 0;
          
          // Ensure unique student ID
          while (!isUnique && attempts < 10) {
            studentId = await generateStudentId();
            
            // Check if ID already exists synchronously
            const existing = await new Promise((resolve, reject) => {
              db.get("SELECT studentId FROM students WHERE studentId = ?", [studentId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
              });
            });
            
            if (!existing) {
              isUnique = true;
            }
            attempts++;
          }

          if (!isUnique) {
            return res.status(500).json({ message: "Unable to generate unique student ID" });
          }

          // Create user + student record + classroom membership together,
          // so a failure never leaves a student without a class.
          try {
            const created = await withTransaction(async () => {
              const userResult = await run(
                "INSERT INTO users (name, email, password, role, isApproved, university_id, classroom_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [fullName, email, hashedPassword, "student", 1, universityId, classroom.id]
              );
              const userId = userResult.lastID;

              await run(
                "INSERT INTO students (userId, studentId, grade, rollNumber, totalFees, feesPaid, pendingFees) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [userId, studentId, classroom.grade || "", classroom.section || "", 0, 0, 0]
              );

              const enrollment = await enrollStudentInClassroom(userId, classroom.id);
              return { userId, enrollment };
            });

            res.status(201).json({
              message: "Student created successfully",
              student: {
                id: created.userId,
                name: fullName,
                email,
                role: "student",
                grade: classroom.grade,
                section: classroom.section,
                studentId: studentId,
                password: rawPassword, // Return password for admin
                classroom: {
                  id: classroom.id,
                  name: classroom.name,
                  grade: classroom.grade,
                  section: classroom.section,
                  studentCount: created.enrollment.studentCount,
                },
              },
            });
          } catch (createErr) {
            console.error("Error creating student:", createErr);
            return res.status(500).json({ message: "Error creating student" });
          }
        });
      } catch (error) {
        console.error("CREATE STUDENT ERROR:", error);
        return res.status(500).json({ message: "Server error: " + error.message });
      }
    }).catch(err => {
      console.error("ERROR counting students:", err);
      return res.status(500).json({ message: "Server error" });
    });
  } catch (err) {
    console.error("CREATE STUDENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET STUDENT CLASSROOMS (ADMIN) ================= */
const findStudentInUniversity = (studentId, universityId) =>
  get(
    "SELECT id, name, email FROM users WHERE id = ? AND role = 'student' AND university_id = ?",
    [studentId, universityId]
  );

const getStudentMemberships = (studentId, universityId) =>
  all(
    `SELECT c.id, c.name, c.grade, c.section
     FROM student_classroom_assignment sca
     JOIN classrooms c ON c.id = sca.classroomId
     WHERE sca.studentId = ? AND c.university_id = ?
     ORDER BY sca.createdAt ASC, sca.id ASC`,
    [studentId, universityId]
  );

exports.getStudentClassrooms = async (req, res) => {
  try {
    const universityId = req.user.universityId;
    const student = await findStudentInUniversity(req.params.studentId, universityId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const classrooms = await getStudentMemberships(student.id, universityId);
    res.json({ success: true, data: { student, classrooms } });
  } catch (err) {
    console.error("GET STUDENT CLASSROOMS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= CHANGE STUDENT CLASS/SECTION (ADMIN) ================= */
// Moves the classroom membership only. Results, attendance, course enrolments and
// progress are keyed by classroom + student and are never deleted here.
exports.changeStudentClassroom = async (req, res) => {
  try {
    const universityId = req.user.universityId;
    const { classroomId, className, section, fromClassroomId } = req.body;

    const student = await findStudentInUniversity(req.params.studentId, universityId);
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const selection = await resolveClassroomSelection({ classroomId, className, section, universityId });
    if (selection.error) {
      return res.status(selection.error.status).json({ message: selection.error.message });
    }
    const target = selection.classroom;

    const memberships = await getStudentMemberships(student.id, universityId);

    // Work out which existing membership is being replaced
    let source = null;
    if (fromClassroomId) {
      source = memberships.find((m) => Number(m.id) === Number(fromClassroomId)) || null;
      if (!source) {
        return res.status(400).json({ message: "Student is not a member of the classroom being changed" });
      }
    } else {
      const others = memberships.filter((m) => Number(m.id) !== Number(target.id));
      if (others.length > 1) {
        return res.status(409).json({
          message: "Student belongs to more than one classroom. Select which classroom to change.",
          classrooms: memberships,
        });
      }
      source = others[0] || null;
    }
    if (source && Number(source.id) === Number(target.id)) {
      source = null;
    }

    const outcome = await withTransaction(async () => {
      if (source) {
        await run(
          "DELETE FROM student_classroom_assignment WHERE studentId = ? AND classroomId = ?",
          [student.id, source.id]
        );
        await refreshStudentCount(source.id);
      }

      // One classroom per student: the change replaces every other membership in this transaction
      const enrollment = await enrollStudentInClassroom(student.id, target.id, { replaceExisting: true });

      await run("UPDATE students SET grade = ?, rollNumber = ? WHERE userId = ?", [
        target.grade || "",
        target.section || "",
        student.id,
      ]);
      await run("UPDATE users SET classroom_id = ? WHERE id = ?", [target.id, student.id]);

      return enrollment;
    });

    res.json({
      success: true,
      message:
        outcome.alreadyEnrolled && !source && !outcome.replaced.length
          ? "Student is already in this class and section"
          : "Student class updated successfully",
      student,
      previousClassroom: source,
      classroom: {
        id: target.id,
        name: target.name,
        grade: target.grade,
        section: target.section,
        studentCount: outcome.studentCount,
      },
    });
  } catch (err) {
    console.error("CHANGE STUDENT CLASSROOM ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= DELETE USER (STUDENT/MENTOR) ================= */
exports.deleteUser = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const { userId } = req.params;

    // Check if user exists
    db.get("SELECT * FROM users WHERE id = ?", [userId], (err, user) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Prevent deletion of admin users
      if (user.role === "admin") {
        return res.status(403).json({ message: "Cannot delete admin users" });
      }

      // Ensure admin can only delete users in their university
      const adminUniversityId = req.user?.universityId;
      if (user.university_id && Number(user.university_id) !== Number(adminUniversityId)) {
        return res.status(403).json({ message: "Cannot delete users from another university" });
      }

      // Delete related records first (for students)
      if (user.role === "student") {
        db.run("DELETE FROM students WHERE userId = ?", [userId], (err) => {
          if (err) {
            console.error("Error deleting student record:", err);
            return res.status(500).json({ message: "Error deleting student record" });
          }

          // Delete the user
          db.run("DELETE FROM users WHERE id = ?", [userId], function(err) {
            if (err) {
              console.error("Error deleting user:", err);
              return res.status(500).json({ message: "Error deleting user" });
            }

            res.json({ message: "User deleted successfully" });
          });
        });
      } else {
        // For mentors/teachers, just delete the user
        db.run("DELETE FROM users WHERE id = ?", [userId], function(err) {
          if (err) {
            console.error("Error deleting user:", err);
            return res.status(500).json({ message: "Error deleting user" });
          }

          res.json({ message: "User deleted successfully" });
        });
      }
    });
  } catch (err) {
    console.error("DELETE USER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= CREATE TEACHER ================= */
exports.createTeacher = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const {
      name,
      email,
      phone,
      joiningDate,
      qualification,
      subject,
    } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        message: "Name and Email are required",
      });
    }

    if (!isEmail(email)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }

    if (phone && !/^[0-9]{10}$/.test(String(phone).replace(/\D/g, ''))) {
      return res.status(400).json({
        message: "Phone number must be exactly 10 digits",
      });
    }

    // Get admin's university for tenant isolation
    const universityId = req.user.universityId;

    // Check quota synchronously first
    countUsersByRoleInUniversity(universityId, 'mentor').then(async (currentMentorCount) => {
      try {
        // Use the university's current subscriptionPlan (propagated by superadmin upgrades)
        const planType = await getUniversitySubscriptionPlan(universityId);
        
        // Check mentor quota
        const quotaCheck = checkAdminMentorQuota(universityId, planType, currentMentorCount);
        if (!quotaCheck.allowed) {
          return res.status(400).json({ message: quotaCheck.message });
        }

        // Check if teacher already exists
        db.get("SELECT * FROM users WHERE email = ?", [email], async (err, exists) => {
          if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ message: "Database error" });
          }

          if (exists) {
            return res.status(400).json({
              message: "Teacher already exists",
            });
          }

          // 🔐 SAME AUTO PASSWORD LOGIC AS STUDENT
          const rawPassword = require('../utils/passwordUtils').generatePassword(12);
          const hashedPassword = await bcrypt.hash(rawPassword, 10);

          // Create teacher WITH university_id
          db.run(
            "INSERT INTO users (name, email, password, role, isApproved, university_id) VALUES (?, ?, ?, ?, ?, ?)",
            [name, email, hashedPassword, "mentor", 1, universityId],
            function(err) {
              if (err) {
                console.error("Error creating teacher:", err);
                return res.status(500).json({ message: "Error creating teacher" });
              }

              res.status(201).json({
                message: "Teacher created successfully",
                teacher: {
                  id: this.lastID,
                  name,
                  email,
                  role: "mentor",
                  phone,
                  joiningDate,
                  qualification,
                  subject,
                  universityId,
                },
                generatedPassword: rawPassword,
              });
            }
          );
        });
      } catch (error) {
        console.error("CREATE TEACHER ERROR:", error);
        return res.status(500).json({ message: "Server error: " + error.message });
      }
    }).catch(err => {
      console.error("ERROR counting mentors:", err);
      return res.status(500).json({ message: "Server error" });
    });
  } catch (err) {
    console.error("CREATE TEACHER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET ALL MENTORS (FOR CLASSROOM DROPDOWN) ================= */
exports.getMentors = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access only" });
    }

    // Get all mentors from the database
    const adminUniversityId = req.user?.universityId;
    db.all("SELECT id, name, email FROM users WHERE role = ? AND university_id = ? ORDER BY name", ["mentor", adminUniversityId], (err, mentors) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      res.json(mentors);
    });
  } catch (err) {
    console.error("GET MENTORS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};
