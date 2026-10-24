const db = require('../config/database-switch');
const BilingualDataService = require("../services/BilingualDataService");
const {
  getSuperadminSubscription,
  checkMentorCourseQuotaPerClass
} = require("../helpers/quotaHelper");
const { get, all, run, withTransaction } = require("../helpers/dbAsync");
const { HttpError, authorizeClassroom, authorizeCourse } = require("../helpers/teachingScope");
const { createCourseWithClasses } = require("../helpers/courseClasses");

// Sends the response for an access error and returns true; false for any other error
const sendAccessError = (err, res) => {
  if (!(err instanceof HttpError)) return false;
  res.status(err.status).json({ message: err.message });
  return true;
};



// Helper function to add _id field to courses for frontend compatibility
const mapCourse = (course) => {
  if (!course) return course;
  return { ...course, _id: course.id };
};

const mapCourses = (courses) => {
  if (!Array.isArray(courses)) return courses;
  return courses.map(mapCourse);
};

// Get all courses
const getAllCourses = async (req, res) => {
  try {
    // Filter by university_id for tenant isolation
    const universityId = req.user?.universityId;
    const role = req.user?.role;
    const userId = req.user?.userId;
    let query;
    let params = [];
    if (role === 'superadmin') {
      query = "SELECT * FROM courses";
    } else if (role === 'admin') {
      query = "SELECT * FROM courses WHERE university_id = ?";
      params = [universityId];
    } else if (role === 'mentor' || role === 'teacher') {
      query = "SELECT * FROM courses WHERE mentorId = ?"; // the courses this teacher teaches
      params = [userId];
    } else if (role === 'student') {
      query = "SELECT c.* FROM courses c JOIN course_students cs ON cs.courseId = c.id WHERE cs.studentId = ?";
      params = [userId];
    } else {
      return res.json([]);
    }

    db.all(query, params, (err, courses) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      // Format courses according to requested language (default 'en')
      const language = req.language || 'en';
      const formatted = BilingualDataService.formatCourses(courses || [], language);
      res.json(mapCourses(formatted) || []);
    });
  } catch (err) {
    console.error("GET ALL COURSES ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Create course
const createCourse = async (req, res) => {
  try {
    const { title, title_en, title_ar, description, description_en, description_ar, category, duration, mentorId, price, classroomId, studentIds, enrollScope } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Course title is required" });
    }
    // An admin creating a course for its classes (classroomIds, with scope "all" or "selected"):
    // the course, its classes and its enrolments are saved in one transaction.
    if (req.user.role === "admin" && Array.isArray(req.body.classroomIds)) {
      try {
        const subscription = await getSuperadminSubscription("superadmin-1");
        // counted as the single-class form counts it: the teacher's courses with this home class
        // (the first class chosen becomes the new course's home class)
        const homeId = Number(req.body.classroomIds[0]);
        if (homeId) {
          const row = await get("SELECT COUNT(*) AS count FROM courses WHERE mentorId = ? AND classroomId = ?", [mentorId, homeId]);
          const quota = checkMentorCourseQuotaPerClass(subscription.planType, row ? row.count : 0);
          if (!quota.allowed) return res.status(400).json({ message: quota.message });
        }
        const created = await createCourseWithClasses(req, { ...req.body, scope: req.body.scope });
        const course = BilingualDataService.formatCourse({ ...created.course, totalStudents: created.totalStudents }, req.language || "en");
        return res.status(201).json({ message: "Course created successfully", course, classes: created.classes });
      } catch (err) {
        if (sendAccessError(err, res)) return;
        throw err;
      }
    }
    // Class first: an admin creates a course for a class that already exists
    if (req.user.role === "admin" && !classroomId) {
      return res.status(400).json({ message: "Choose a class for this course. Create the class under Classrooms first." });
    }
    // enrollScope "none": the course is created for the class without enrolling anyone yet; the
    // caller then enrols all or selected students (POST /courses/:id/classrooms).
    if (enrollScope !== undefined && !["all", "none"].includes(enrollScope)) {
      return res.status(400).json({ message: 'enrollScope must be "all" or "none"' });
    }

    // A course can only be created in a classroom the user may manage
    if (classroomId) {
      try {
        await authorizeClassroom(req, classroomId);
      } catch (accessErr) {
        if (sendAccessError(accessErr, res)) return;
        throw accessErr;
      }
    }

    // A teacher creates courses they teach themselves; an admin names a teacher of the school.
    // Students named must be students of the school.
    let assignedMentorId = req.user.role === "admin" ? (mentorId || req.user.userId) : req.user.userId;
    const universityId = req.user?.universityId;
    if (req.user.role === "admin" && mentorId) {
      const mentor = await get("SELECT id FROM users WHERE id = ? AND role IN ('mentor', 'teacher') AND university_id = ?", [mentorId, universityId]);
      if (!mentor) return res.status(400).json({ message: "Choose a teacher of your school" });
    }
    if (Array.isArray(studentIds) && studentIds.length > 0) {
      const uniqueIds = [...new Set(studentIds.map(String))];
      const found = await all(
        `SELECT id FROM users WHERE role = 'student' AND university_id = ? AND id IN (${uniqueIds.map(() => "?").join(",")})`,
        [universityId, ...uniqueIds]
      );
      if (found.length !== uniqueIds.length) return res.status(400).json({ message: "Only students of your school can be assigned" });
    }

    // Helper functions inside createCourse
    const autoAssignStudentsFromClassroom = (courseId, classroomId, callback) => {
      console.log(`\n🔗 === AUTO-ASSIGN STUDENTS FROM CLASSROOM START ===`);
      console.log(`🔗 Course ID: ${courseId}, Classroom ID: ${classroomId}`);

      db.all(
        "SELECT sca.studentId FROM student_classroom_assignment sca WHERE sca.classroomId = ?",
        [classroomId],
        (err, students) => {
          if (err) {
            console.error(`❌ Error fetching students from classroom:`, err);
            if (callback) callback();
            console.log(`🔗 === AUTO-ASSIGN STUDENTS FROM CLASSROOM END (ERROR) ===\n`);
            return;
          }

          console.log(`🔗 Students found in classroom: ${students ? students.length : 0}`);

          if (!students || students.length === 0) {
            console.warn(`⚠️ No students found in classroom ${classroomId} - skipping auto-assign`);
            if (callback) callback();
            console.log(`🔗 === AUTO-ASSIGN STUDENTS FROM CLASSROOM END (NO STUDENTS) ===\n`);
            return;
          }

          console.log(`🔗 Students to assign:`, students.map(s => s.studentId));

          const stmt = db.prepare(
            // enrolled through the class (removing the class from the course removes these)
            "INSERT INTO course_students (courseId, studentId, enrolledViaClassroomId) VALUES (?, ?, ?) ON CONFLICT DO NOTHING"
          );

          let assignedCount = 0;
          students.forEach((student) => {
            stmt.run([courseId, student.studentId, classroomId], function(runErr) {
              if (runErr) {
                console.error(`❌ Error assigning student ${student.studentId}:`, runErr);
              } else {
                assignedCount++;
                console.log(`✅ Assigned student ${student.studentId} to course ${courseId}`);
              }
            });
          });

          stmt.finalize(() => {
            console.log(`🔗 === AUTO-ASSIGN STUDENTS FROM CLASSROOM END (SUCCESS) ===\n`);
            console.log(`🔗 Total students assigned: ${assignedCount}`);
            if (callback) callback(assignedCount);
          });
        }
      );
    };

    const autoAssignSpecificStudents = (courseId, studentIds, callback) => {
      const stmt = db.prepare(
        "INSERT INTO course_students (courseId, studentId) VALUES (?, ?) ON CONFLICT DO NOTHING"
      );

      let assignedCount = 0;
      studentIds.forEach((studentId) => {
        stmt.run([courseId, studentId], function(runErr) {
          if (runErr) {
            console.error(`❌ Error assigning student ${studentId}:`, runErr);
          } else {
            assignedCount++;
            console.log(`✅ Assigned student ${studentId} to course ${courseId}`);
          }
        });
      });

      stmt.finalize(() => {
        console.log(`🔗 === AUTO-ASSIGN SPECIFIC STUDENTS END ===\n`);
        console.log(`🔗 Total students assigned: ${assignedCount}`);
        if (callback) callback(assignedCount);
      });
    };

    // If classroomId is provided, check mentor course quota for that classroom
    let quotaCheckPromise = Promise.resolve(true);
    if (classroomId) {
      quotaCheckPromise = new Promise((resolve, reject) => {
        // Count courses by this mentor in this classroom
        db.get(
          "SELECT COUNT(*) as count FROM courses WHERE mentorId = ? AND classroomId = ?",
          [assignedMentorId, classroomId],
          async (err, row) => {
            if (err) {
              console.error("Error counting mentor courses:", err);
              resolve(true); // Allow on error (graceful fallback)
              return;
            }

            const currentCourseCount = row ? row.count : 0;

            // Get subscription for quota check
            const subscription = await getSuperadminSubscription("superadmin-1");

            // Check course quota per class
            const quotaCheck = checkMentorCourseQuotaPerClass(subscription.planType, currentCourseCount);
            if (!quotaCheck.allowed) {
              reject(new Error(quotaCheck.message));
            } else {
              resolve(true);
            }
          }
        );
      });
    }

    quotaCheckPromise.then(() => {
      // Get mentor name for storing in course record
      db.get(
        "SELECT id, name FROM users WHERE id = ?",
        [assignedMentorId],
        (mentorErr, mentorUser) => {
          if (mentorErr || !mentorUser) {
            console.error("Error fetching mentor:", mentorErr);
            return res.status(500).json({ message: "Error fetching mentor details" });
          }

          db.run(
            "INSERT INTO courses (title, description, category, duration, mentorId, price, classroomId, university_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
              title || title_en || '',
              description || description_en || '',
              category || "",
              duration || 0,
              assignedMentorId,
              price || 0,
              classroomId || null,
              universityId
            ],
            function(err) {
              if (err) {
                console.error("Error creating course:", err);
                return res.status(500).json({ message: "Error creating course" });
              }

            const courseId = this.lastID;

            // the home class is one of the course's classes, with its enrolment scope
            if (classroomId) {
              db.run("INSERT INTO course_classrooms (courseId, classroomId, assignedBy, enrollAll) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
                [courseId, classroomId, req.user.userId, enrollScope === "none" ? 0 : 1],
                (linkErr) => { if (linkErr) console.warn("Could not record the course's class:", linkErr.message); });
            }

            // ✅ AUTO-ASSIGN STUDENTS FROM CLASSROOM IF PROVIDED
            if (classroomId && enrollScope !== "none") {
              autoAssignStudentsFromClassroom(courseId, classroomId, (assignedStudents) => {
                // Get the assigned students' details
                db.all(
                  `SELECT cs.studentId, u.name as studentName
                   FROM course_students cs
                   LEFT JOIN users u ON cs.studentId = u.id
                   WHERE cs.courseId = ?`,
                  [courseId],
                  (studentErr, students) => {
                    const studentList = students || [];
                    const createdCourse = {
                      id: courseId,
                      title: title || title_en || '',
                      description: description || description_en || '',
                      category,
                      duration,
                      mentorId: assignedMentorId,
                      mentorName: mentorUser.name,
                      price,
                      classroomId,
                      assignedStudents: studentList,
                      totalStudents: studentList.length
                    };
                    const formatted = BilingualDataService.formatCourse(createdCourse, req.language || 'en');
                    res.status(201).json({
                      message: "Course created successfully and students auto-assigned from classroom",
                      course: formatted
                    });
                  }
                );
              });
            } else if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
              // Auto-assign specific students
              autoAssignSpecificStudents(courseId, studentIds, () => {
                db.all(
                  `SELECT cs.studentId, u.name as studentName
                   FROM course_students cs
                   LEFT JOIN users u ON cs.studentId = u.id
                   WHERE cs.courseId = ?`,
                  [courseId],
                  (studentErr, students) => {
                    const studentList = students || [];
                    const createdCourse = {
                      id: courseId,
                      title: title || title_en || '',
                      title_en: title_en || title || '',
                      title_ar: title_ar || '',
                      description: description || description_en || '',
                      description_en: description_en || description || '',
                      description_ar: description_ar || '',
                      category,
                      duration,
                      mentorId: assignedMentorId,
                      mentorName: mentorUser.name,
                      price,
                      classroomId,
                      assignedStudents: studentList,
                      totalStudents: studentList.length
                    };
                    const formatted = BilingualDataService.formatCourse(createdCourse, req.language || 'en');
                    res.status(201).json({
                      message: "Course created successfully and students assigned",
                      course: formatted
                    });
                  }
                );
              });
            } else {
              // No students assigned
              const createdCourse = {
                id: courseId,
                title: title || title_en || '',
                description: description || description_en || '',
                category,
                duration,
                mentorId: assignedMentorId,
                mentorName: mentorUser.name,
                price,
                classroomId,
                assignedStudents: [],
                totalStudents: 0
              };
              const formatted = BilingualDataService.formatCourse(createdCourse, req.language || 'en');
              res.status(201).json({ message: "Course created successfully", course: formatted });
            }
          }
        );
      }
    );
    }).catch((quotaErr) => {
      console.error("COURSE QUOTA ERROR:", quotaErr);
      return res.status(400).json({ message: quotaErr.message || "Course quota exceeded" });
    });
  } catch (err) {
    console.error("CREATE COURSE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get courses by mentor
const getCoursesByMentor = async (req, res) => {
  try {
    const mentorId = req.user.userId || req.user.id;

    db.all(
      `SELECT c.*, u.name as teacherName
       FROM courses c
       LEFT JOIN users u ON c.mentorId = u.id
       WHERE c.mentorId = ?`,
      [mentorId],
      (err, courses) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        if (!courses || courses.length === 0) {
          return res.json([]);
        }

        // For each course, fetch the assigned students
        let completedCourses = 0;
        const coursesWithStudents = courses.map(course => ({
          ...course,
          _id: course.id,
          mentor: course.mentorUserId ? { id: course.mentorUserId, name: course.mentorName } : null,
          students: []
        }));

        courses.forEach((course, index) => {
          db.all(
            `SELECT cs.studentId, u.name as studentName
             FROM course_students cs
             LEFT JOIN users u ON cs.studentId = u.id
             WHERE cs.courseId = ?`,
            [course.id],
            (studentErr, students) => {
              coursesWithStudents[index].students = students || [];
              completedCourses++;

              // Send response once all student data is fetched
                if (completedCourses === courses.length) {
                const language = req.language || 'en';
                const formatted = BilingualDataService.formatCourses(coursesWithStudents, language);
                res.json(mapCourses(formatted));
              }
            }
          );
        });
      }
    );
  } catch (err) {
    console.error("GET COURSES BY MENTOR ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get courses by student
const getCoursesByStudent = async (req, res) => {
  try {
    const studentId = req.user.userId;
    console.log(`\n📚 === COURSE FETCH START ===`);
    console.log(`📚 Student ID: ${studentId}`);
    console.log(`📚 Endpoint: /api/courses/student`);

    db.all(
      `SELECT c.*, u.name as courseTeacherName, u.email as courseTeacherEmail
       FROM courses c
       LEFT JOIN users u ON c.mentorId = u.id
       WHERE c.university_id = ? AND (
         EXISTS (SELECT 1 FROM course_students cs WHERE cs.courseId = c.id AND cs.studentId = ?)
       )`,
      [req.user.universityId, studentId],
      (err, courses) => {
        if (err) {
          console.error(`❌ Database error:`, err);
          return res.status(500).json({ message: "Database error", error: err.message });
        }

        console.log(`📚 Query executed successfully`);
        console.log(`📚 Courses found: ${courses ? courses.length : 0}`);

        if (courses && courses.length > 0) {
          console.log(`📚 First course:`, courses[0]);
        }

        // Enhance courses with courseTeacher object
        const enhancedCourses = (courses || []).map(course => ({
          ...mapCourse(course),
          courseTeacher: course.courseTeacherName ? {
            name: course.courseTeacherName,
            email: course.courseTeacherEmail
          } : null
        }));

        console.log(`✅ Returning ${enhancedCourses.length} enhanced courses`);
        console.log(`📚 === COURSE FETCH END ===\n`);
        res.json(enhancedCourses);
      }
    );
  } catch (err) {
    console.error("❌ GET COURSES BY STUDENT ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get course by ID
const getCourseById = async (req, res) => {
  try {
    const courseId = req.params.id;
    const userId = req.user.userId || req.user.id;
    const userRole = req.user.role;

    db.get(
      `SELECT c.*, u.name as mentorName, u.email as mentorEmail
       FROM courses c
       LEFT JOIN users u ON c.mentorId = u.id
       WHERE c.id = ?`,
      [courseId],
      (err, course) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        if (!course) {
          return res.status(404).json({ message: "Course not found" });
        }

        // Fetch assigned students
        db.all(
          `SELECT cs.studentId as id, cs.studentId as _id, u.name, u.email, u.name as studentName
           FROM course_students cs
           LEFT JOIN users u ON cs.studentId = u.id
           WHERE cs.courseId = ?`,
          [courseId],
          (stuErr, assignedStudents) => {
            let studentList = assignedStudents || [];

            // A student sees a course only when enrolled in it (being in its class is not enough),
            // and sees classmates' names, not their email addresses
            if (userRole === 'student') {
              if (!studentList.some(s => Number(s.id) === Number(userId))) {
                return res.status(403).json({ message: "You are not enrolled in this course" });
              }
              studentList = studentList.map(({ email, ...rest }) => rest);
            }

            respondWithCourse();

            function respondWithCourse() {
              const language = req.language || 'en';
              const courseWithDetails = {
                ...course,
                students: studentList,
                mentor: course.mentorId ? {
                  id: course.mentorId,
                  _id: course.mentorId,
                  name: course.mentorName,
                  email: course.mentorEmail
                } : null
              };
              const formatted = BilingualDataService.formatCourse(courseWithDetails, language);
              res.json({
                ...mapCourse(formatted),
                students: studentList,
                mentor: courseWithDetails.mentor
              });
            }
          }
        );
      }
    );
  } catch (err) {
    console.error("GET COURSE BY ID ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// Update course
const updateCourse = async (req, res) => {
  try {
    const courseId = req.params.id;
    const { title, description, category, duration, price } = req.body;
    const sent = (value) => (value === undefined ? null : value);
    let { classroomId, mentorId } = req.body;

    try {
      await authorizeCourse(req, courseId);
      // Moving a course to another class or teacher is an admin decision
      if (req.user.role !== "admin") {
        classroomId = undefined;
        mentorId = undefined;
      }
      if (classroomId !== undefined && classroomId !== null && classroomId !== "") {
        await authorizeClassroom(req, classroomId);
      }
      if (mentorId !== undefined && mentorId !== null && mentorId !== "") {
        const mentor = await get("SELECT id FROM users WHERE id = ? AND role IN ('mentor', 'teacher') AND university_id = ?", [mentorId, req.user.universityId]);
        if (!mentor) return res.status(400).json({ message: "Choose a teacher of your school" });
      }
    } catch (accessErr) {
      if (sendAccessError(accessErr, res)) return;
      throw accessErr;
    }
    if (title !== undefined && String(title).trim() === "") {
      return res.status(400).json({ message: "Course title cannot be empty" });
    }

    // COALESCE keeps the stored value for every field the request did not send
    db.run(
      `UPDATE courses SET title = COALESCE(?, title), description = COALESCE(?, description), category = COALESCE(?, category),
         duration = COALESCE(?, duration), price = COALESCE(?, price), classroomId = COALESCE(?, classroomId), mentorId = COALESCE(?, mentorId)
       WHERE id = ?`,
      [sent(title), sent(description), sent(category), sent(duration), sent(price), sent(classroomId || undefined), sent(mentorId || undefined), courseId],
      function(err) {
        if (err) {
          console.error("Error updating course:", err);
          return res.status(500).json({ message: "Error updating course" });
        }

        res.json({ message: "Course updated successfully" });
      }
    );
  } catch (err) {
    console.error("UPDATE COURSE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete course
const deleteCourse = async (req, res) => {
  try {
    const courseId = req.params.id;

    try {
      await authorizeCourse(req, courseId);
    } catch (accessErr) {
      if (sendAccessError(accessErr, res)) return;
      throw accessErr;
    }

    // the course's class assignments go with it (enrolments are handled as before)
    db.run("DELETE FROM course_classrooms WHERE courseId = ?", [courseId], () => {});
    db.run("DELETE FROM courses WHERE id = ?", [courseId], function(err) {
      if (err) {
        console.error("Error deleting course:", err);
        return res.status(500).json({ message: "Error deleting course" });
      }

      res.json({ message: "Course deleted successfully" });
    });
  } catch (err) {
    console.error("DELETE COURSE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get courses by classroom
const getCoursesByClassroom = async (req, res) => {
  try {
    // Accept both route param and query param
    const classroomId = req.params.classroomId || req.query.classroomId;

    // Who may list a classroom's courses: its school admin (all of them), a teacher who may use
    // the class (only the courses that teacher mentors: being the class teacher gives no access
    // to another teacher's course), or a student who is a member.
    const viewer = req.user || {};
    let ownCoursesOnly = false;
    try {
      if (viewer.role === "student") {
        const member = await get(
          "SELECT id FROM student_classroom_assignment WHERE classroomId = ? AND studentId = ?",
          [classroomId, viewer.userId]
        );
        if (!member) throw new HttpError(403, "You are not a member of this classroom");
      } else {
        await authorizeClassroom(req, classroomId);
        ownCoursesOnly = viewer.role !== "admin";
      }
    } catch (accessErr) {
      if (sendAccessError(accessErr, res)) return;
      throw accessErr;
    }

    // a course of the class: its home class, or a class it is assigned to
    db.all(
      `SELECT
         c.*,
         u.id as mentorUserId,
         u.name as mentorName,
         u.email as mentorEmail
       FROM courses c
       LEFT JOIN users u ON c.mentorId = u.id
       WHERE (c.classroomId = ? OR EXISTS (SELECT 1 FROM course_classrooms cc WHERE cc.courseId = c.id AND cc.classroomId = ?))
         AND (? = 0 OR c.mentorId = ?)
       ORDER BY c.createdAt DESC`,
      [classroomId, classroomId, ownCoursesOnly ? 1 : 0, viewer.userId || 0],
      (err, courses) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        if (!courses || courses.length === 0) {
          return res.json([]);
        }

        // For each course, fetch the assigned students
        let completedCourses = 0;
        // courseTeacher is the shape the other course lists already send (null = no mentor);
        // mentorUserId / mentorName stay for pages that read them
        const coursesWithStudents = courses.map(course => ({
          ...course,
          _id: course.id,
          courseTeacher: course.mentorUserId ? { id: course.mentorUserId, name: course.mentorName, email: course.mentorEmail } : null,
          students: [],
        }));

        courses.forEach((course, index) => {
          db.all(
            `SELECT cs.studentId, u.name as studentName
             FROM course_students cs
             LEFT JOIN users u ON cs.studentId = u.id
             WHERE cs.courseId = ?`,
            [course.id],
            (studentErr, students) => {
              coursesWithStudents[index].students = students || [];
              completedCourses++;

              // Send response once all student data is fetched
              if (completedCourses === courses.length) {
                res.json(mapCourses(coursesWithStudents));
              }
            }
          );
        });
      }
    );
  } catch (err) {
    console.error("GET COURSES BY CLASSROOM ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Assign students to course
const assignStudentsToCourse = async (req, res) => {
  try {
    const courseId = req.params.id;
    const { studentIds } = req.body;

    if (!courseId || !Array.isArray(studentIds)) {
      return res.status(400).json({ message: "Invalid course ID or student IDs" });
    }

    // The teacher of the course (or an admin of its school); throws 403 / 404 otherwise
    await authorizeCourse(req, courseId);

    // Every id must be a student of the caller's school. Duplicates count once.
    const uniqueIds = [...new Set(studentIds.map((id) => String(id)))];
    if (uniqueIds.length > 0) {
      const placeholders = uniqueIds.map(() => "?").join(",");
      const students = await all(
        `SELECT id FROM users WHERE role = 'student' AND university_id = ? AND id IN (${placeholders})`,
        [req.user.universityId, ...uniqueIds]
      );
      if (students.length !== uniqueIds.length) {
        return res.status(400).json({ message: "Only students of your school can be assigned" });
      }
    }

    // Set the roster in one transaction: if anything fails, the old roster stays. Students who stay
    // enrolled keep their enrolment row (and so the class it came through); only the difference
    // is written.
    await withTransaction(async () => {
      const current = await all("SELECT studentId FROM course_students WHERE courseId = ?", [courseId]);
      const wanted = new Set(uniqueIds);
      for (const row of current) {
        if (!wanted.has(String(row.studentId))) await run("DELETE FROM course_students WHERE courseId = ? AND studentId = ?", [courseId, row.studentId]);
      }
      for (const studentId of uniqueIds) {
        await run("INSERT INTO course_students (courseId, studentId) VALUES (?, ?) ON CONFLICT DO NOTHING", [courseId, studentId]);
      }
    });

    if (uniqueIds.length === 0) {
      return res.json({ message: "No students to assign" });
    }
    res.json({ message: "Students assigned successfully", count: uniqueIds.length });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ message: err.message });
    console.error("ASSIGN STUDENTS ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Get assigned students for a course
const getAssignedStudents = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      return res.status(400).json({ message: "Course ID is required" });
    }

    db.all(
      `SELECT cs.id, cs.studentId, u.name, u.email
       FROM course_students cs
       LEFT JOIN users u ON cs.studentId = u.id
       WHERE cs.courseId = ?
       ORDER BY u.name ASC`,
      [courseId],
      (err, students) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).json({ message: "Database error" });
        }

        // Map id to _id for frontend compatibility
        // (the route's guard allows only the course's teacher, an admin of its school, or an
        // enrolled student; a student does not get classmates' email addresses)
        const isStudent = req.user.role === 'student';
        const mappedStudents = (students || []).map(({ email, ...student }) => ({
          ...student,
          ...(isStudent ? {} : { email }),
          _id: student.studentId
        }));

        res.json(mappedStudents || []);
      }
    );
  } catch (err) {
    console.error("GET ASSIGNED STUDENTS ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Debug: Get student data for diagnosis
const getStudentDebugData = async (req, res) => {
  try {
    const studentId = req.user.userId || req.user.id;

    console.log(`\n🐛 === STUDENT DEBUG DATA START ===`);
    console.log(`🐛 Student ID: ${studentId}`);

    // Get classrooms
    db.all(
      `SELECT sc.id, sc.classroom_id, c.name as classroom_name
       FROM student_classrooms sc
       LEFT JOIN classrooms c ON sc.classroom_id = c.id
       WHERE sc.student_id = ?`,
      [studentId],
      (err, classrooms) => {
        console.log(`🐛 Classrooms (student_classrooms):`, classrooms || []);

        // Get classroom assignments
        db.all(
          `SELECT sca.id, sca.classroomId, c.name as classroom_name
           FROM student_classroom_assignment sca
           LEFT JOIN classrooms c ON sca.classroomId = c.id
           WHERE sca.studentId = ?`,
          [studentId],
          (err2, assignments) => {
            console.log(`🐛 Classroom Assignments (student_classroom_assignment):`, assignments || []);

            // Get course_students
            db.all(
              `SELECT cs.id, cs.courseId, cs.studentId, c.title as course_title
               FROM course_students cs
               LEFT JOIN courses c ON cs.courseId = c.id
               WHERE cs.studentId = ?`,
              [studentId],
              (err3, courseStudents) => {
                console.log(`🐛 Course Students (course_students):`, courseStudents || []);

                // Get all courses in classrooms
                if (assignments && assignments.length > 0) {
                  const classroomIds = assignments.map(a => a.classroomId);
                  db.all(
                    `SELECT c.id, c.title, c.classroomId
                     FROM courses c
                     WHERE c.classroomId IN (${classroomIds.map(() => '?').join(',')})`,
                    classroomIds,
                    (err4, coursesInClassrooms) => {
                      console.log(`🐛 Courses in assigned classrooms:`, coursesInClassrooms || []);
                      console.log(`🐛 === STUDENT DEBUG DATA END ===\n`);

                      res.json({
                        studentId,
                        classrooms: classrooms || [],
                        classroom_assignments: assignments || [],
                        course_students: courseStudents || [],
                        courses_in_classrooms: coursesInClassrooms || []
                      });
                    }
                  );
                } else {
                  console.log(`🐛 === STUDENT DEBUG DATA END ===\n`);
                  res.json({
                    studentId,
                    classrooms: classrooms || [],
                    classroom_assignments: assignments || [],
                    course_students: courseStudents || [],
                    courses_in_classrooms: []
                  });
                }
              }
            );
          }
        );
      }
    );
  } catch (err) {
    console.error("DEBUG DATA ERROR:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = {
  getAllCourses,
  createCourse,
  getCoursesByMentor,
  getCoursesByStudent,
  getCourseById,
  updateCourse,
  deleteCourse,
  getCoursesByClassroom,
  assignStudentsToCourse,
  getAssignedStudents,
  getStudentDebugData
};
