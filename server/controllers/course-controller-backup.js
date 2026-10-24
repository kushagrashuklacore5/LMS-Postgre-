const tenantConnectionManager = require('../config/tenant-connection-manager');

/* ================= CREATE COURSE ================= */
const createCourse = async (req, res) => {
  try {
    const { title, description, category, duration, mentorId, studentIds, courseTeacher } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Course title is required" });
    }

    let assignedMentorId;
    let assignedStudents = [];
    let classroomId = null;

    /* ✅ 1. HANDLE ADMIN CREATION */
    if (req.user.role === "admin") {
      if (!mentorId) {
        return res.status(400).json({ message: "Mentor is required for admin course creation" });
      }
      assignedMentorId = mentorId;

      // Admin can explicitly assign students
      if (Array.isArray(studentIds) && studentIds.length > 0) {
        assignedStudents = studentIds;
      }
    }
    /* ✅ 2. HANDLE MENTOR CREATION */
    else if (req.user.role === "mentor") {
      assignedMentorId = req.user.userId;

      // Mentor assigns to their classroom by default
      const classroom = await Classroom.findOne({ classTeacher: assignedMentorId });

      if (classroom) {
        classroomId = classroom._id;
        // If specific students not provided, default to all classroom students
        if (!Array.isArray(studentIds) || studentIds.length === 0) {
          assignedStudents = classroom.students || [];
        } else {
          assignedStudents = studentIds;
        }
      } else {
        // Fallback if no classroom (should not happen for valid mentors usually)
        if (Array.isArray(studentIds)) {
          assignedStudents = studentIds;
        }
      }
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    const photoPath = req.file ? req.file.path : "";

    // ✅ CREATE COURSE
    const course = await Course.create({
      title,
      description: description || "",
      category: category || "",
      duration: duration || "",
      mentor: assignedMentorId,
      mentorId: assignedMentorId,
      courseTeacher: courseTeacher || assignedMentorId,
      classroom: classroomId,
      classroomId: classroomId,
      photo: photoPath,
      students: assignedStudents,
    });

    // ✅ LINK COURSE TO CLASSROOM (If applicable)
    if (classroomId) {
      await Classroom.findByIdAndUpdate(classroomId, {
        $addToSet: { courses: course._id }
      });
    }

    // ✅ ASSIGN COURSE TO STUDENTS
    if (assignedStudents.length > 0) {
      const updateOps = {
        $addToSet: { assignedCourses: course._id }
      };

      // If course has a classroom, link students to it (logic from assignStudentsToCourse)
      if (classroomId) {
        updateOps.$set = { classroom: classroomId };
      }

      await User.updateMany(
        { _id: { $in: assignedStudents } },
        updateOps
      );
    }

    res.status(201).json({
      message: "Course created successfully",
      course,
    });
  } catch (error) {
    console.error("CREATE COURSE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET STUDENT COURSES ================= */
const getStudentCourses = async (req, res) => {
  try {
    const student = await User.findById(req.user.userId);

    if (!student) {
      return res.json([]);
    }

    // 1. Get courses from student's classroom
    let classroomCourses = [];
    if (student.classroom) {
      const classroom = await Classroom.findById(student.classroom);
      if (classroom && Array.isArray(classroom.courses)) {
        classroomCourses = classroom.courses;
      }
    }

    // 2. Get manually assigned courses
    const assignedCourses = student.assignedCourses || [];

    // Combine and deduplicate
    const allCourseIds = [...new Set([
      ...classroomCourses.map(id => id.toString()),
      ...assignedCourses.map(id => id.toString())
    ])];

    // Get all courses details
    const courses = await Course.find({
      _id: { $in: allCourseIds },
    })
      .populate("mentor", "name")
      .populate("courseTeacher", "name email")
      .populate("classroom", "name section");

    // Count assessments for each course
    const Assessment = require("../models/Assessment");


    const coursesWithStats = await Promise.all(courses.map(async (course) => {
      const assessmentCount = await Assessment.countDocuments({ courseId: course._id });
      return {
        ...course.toObject(),
        assessmentCount
      };
    }));

    return res.json(coursesWithStats);
  } catch (error) {
    console.error("GET STUDENT COURSES ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET COURSE BY ID ================= */
const getCourseById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("Fetching course with ID:", id);

    if (!id || id === 'undefined') {
      return res.status(400).json({ message: "Invalid Course ID" });
    }

    const course = await Course.findById(id)
      .populate("mentor", "name email")
      .populate("courseTeacher", "name email")
      .populate("classroom", "name section");

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    return res.json(course);
  } catch (error) {
    console.error("GET COURSE ERROR:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* ================= UPDATE COURSE ================= */
const updateCourse = async (req, res) => {
  try {
    const updated = await Course.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    return res.json(updated);
  } catch (error) {
    console.error("UPDATE COURSE ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= DELETE COURSE ================= */
const deleteCourse = async (req, res) => {
  try {
    await Course.findByIdAndDelete(req.params.id);
    return res.json({ message: "Course deleted" });
  } catch (error) {
    console.error("DELETE COURSE ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET CLASSROOM COURSES ================= */
const getClassroomCourses = async (req, res) => {
  try {
    const { classroomId } = req.query;

    let classroom;
    if (classroomId && req.user.role === "admin") {
      // Admin can view any classroom's courses
      classroom = await Classroom.findById(classroomId).populate("courses");
    } else if (req.user.role === "mentor") {
      // Class teacher can view their own classroom's courses
      classroom = await Classroom.findOne({
        classTeacher: req.user.userId,
      }).populate("courses");
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!classroom || !Array.isArray(classroom.courses)) {
      return res.json([]);
    }

    const courses = await Course.find({
      _id: { $in: classroom.courses.map(c => c._id) },
    })
      .populate("courseTeacher", "name email")
      .populate("mentor", "name");

    return res.json(courses);
  } catch (error) {
    console.error("GET CLASSROOM COURSES ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET COURSE TEACHER COURSES ================= */
const getCourseTeacherCourses = async (req, res) => {
  try {
    if (req.user.role !== "mentor") {
      return res.status(403).json({ message: "Access denied" });
    }

    const courses = await Course.find({
      courseTeacher: req.user.userId,
    })
      .populate("classroom", "name section")
      .populate("students", "name email");

    return res.json(courses);
  } catch (error) {
    console.error("GET COURSE TEACHER COURSES ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET MENTOR COURSES ================= */
const getMentorCourses = async (req, res) => {
  try {
    if (req.user.role !== "mentor") {
      return res.status(403).json({ message: "Access denied" });
    }

    const courses = await Course.find({
      $or: [
        { mentorId: req.user.userId },
        { courseTeacher: req.user.userId }
      ]
    }).populate("students", "name email");

    return res.json(courses);
  } catch (error) {
    console.error("GET MENTOR COURSES ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= ASSIGN STUDENTS TO COURSE ================= */
const assignStudentsToCourse = async (req, res) => {
  try {
    const { courseId, studentIds } = req.body;

    if (!courseId || !Array.isArray(studentIds)) {
      return res.status(400).json({ message: "Invalid data" });
    }

    const course = await Course.findById(courseId).populate("classroom");
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    /* ✅ 1. Add students to course (Robust ID handling) */
    const existingStudentIds = (course.students || []).map(id => id.toString());
    const uniqueStudentIds = [...new Set([...existingStudentIds, ...studentIds])];

    course.students = uniqueStudentIds;
    await course.save();

    /* ✅ 2. Add course to students */
    const updateOps = {
      $addToSet: { assignedCourses: course._id }
    };

    if (course.classroom && course.classroom._id) {
      updateOps.$set = { classroom: course.classroom._id };

      // Add students to the classroom as well
      await Classroom.findByIdAndUpdate(course.classroom._id, {
        $addToSet: { students: { $each: studentIds } }
      });
    }

    await User.updateMany(
      { _id: { $in: studentIds } },
      updateOps
    );

    res.json({ message: "Students assigned successfully", count: studentIds.length });
  } catch (error) {
    console.error("ASSIGN STUDENTS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createCourse,
  getClassroomCourses,
  getMentorCourses,
  getCourseTeacherCourses,
  getStudentCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  assignStudentsToCourse,
};
