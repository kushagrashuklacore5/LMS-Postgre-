const User = require('../models/User');
const Course = require('../models/Course');
const Chapter = require('../models/Chapter');
const Progress = require('../models/Progress');
const Certificate = require('../models/Certificate');
const bcrypt = require('bcryptjs');

/* ================= GET ALL USERS (ADMIN ONLY) ================= */
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= APPROVE MENTOR ================= */
const approveMentor = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'mentor') {
      return res.status(400).json({ message: 'User is not a mentor' });
    }

    user.isApproved = true;
    await user.save();

    res.json({ message: 'Mentor approved successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= REJECT MENTOR ================= */
const rejectMentor = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByIdAndDelete(userId);

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'Mentor rejected successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= DELETE USER ================= */
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByIdAndDelete(userId);

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= ANALYTICS ================= */
const getAnalytics = async (req, res) => {
  try {
    // if (!global.isDbConnected) {
    //   return res.json({
    //     users: { total: 100, active: 80, inactive: 20, students: 90, mentors: 10, approvedMentors: 10 },
    //     courses: { total: 20, published: 15 },
    //     chapters: { total: 100 },
    //     progress: { total: 500, completed: 300, rate: 60 },
    //     certificates: { total: 50 }
    //   });
    // }

    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const students = await User.countDocuments({ role: 'student' });
    const mentors = await User.countDocuments({ role: 'mentor' });
    const approvedMentors = await User.countDocuments({ role: 'mentor', isApproved: true });

    const totalCourses = await Course.countDocuments();
    const publishedCourses = await Course.countDocuments({ isPublished: true });

    const totalChapters = await Chapter.countDocuments();
    const totalProgress = await Progress.countDocuments();
    const completedProgress = await Progress.countDocuments({ isCompleted: true });

    const completionRate =
      totalProgress > 0 ? ((completedProgress / totalProgress) * 100).toFixed(2) : 0;

    const totalCertificates = await Certificate.countDocuments();

    res.json({
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        students,
        mentors,
        approvedMentors
      },
      courses: {
        total: totalCourses,
        published: publishedCourses,
        completionRate: parseFloat(completionRate)
      },
      chapters: { total: totalChapters },
      progress: { total: totalProgress, completed: completedProgress },
      certificates: { total: totalCertificates }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET ALL STUDENTS (MENTOR ONLY) ================= */
const getStudents = async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }).select('-password');
    res.json(students);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= REGISTER MENTOR (ADMIN ONLY) ================= */
const registerMentor = async (req, res) => {
  try {
    const { name, email, password, preferredLanguage } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const mentor = new User({
      name,
      email,
      password: hashedPassword,
      role: 'mentor',
      isActive: true,
      isApproved: true,
      preferredLanguage: preferredLanguage || "en"
    });

    await mentor.save();

    res.status(201).json({
      message: 'Mentor registered successfully',
      mentor: {
        id: mentor._id,
        name: mentor.name,
        email: mentor.email,
        role: mentor.role,
        isApproved: mentor.isApproved,
        preferredLanguage: mentor.preferredLanguage
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET MENTORS FOR COURSE ================= */
const getMentorsForCourse = async (req, res) => {
  try {
    const mentors = await User.find({ role: 'mentor' }).select('_id name email');
    res.json(mentors);
  } catch (error) {
    console.error("GET MENTORS FOR COURSE ERROR:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= SIMPLE GET ALL MENTORS ================= */
const getAllMentorsSimple = async (req, res) => {
  try {
    const mentors = await User.find({ role: 'mentor' }, '_id name email');
    res.status(200).json(mentors);
  } catch (error) {
    console.error("GET ALL MENTORS SIMPLE ERROR:", error);
    res.status(500).json({ message: 'Server error' });
  }
};

/* ================= GET STUDENT CLASSROOM ================= */
const getStudentClassroom = async (req, res) => {
  try {
    const studentId = req.user.userId;

    const student = await User.findById(studentId)
      .populate({
        path: "assignedCourses",
        populate: { path: "classroom" }
      });

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const classrooms = new Map();
    student.assignedCourses.forEach(course => {
      if (course.classroom) {
        classrooms.set(course.classroom._id.toString(), course.classroom);
      }
    });

    res.json(Array.from(classrooms.values()));
  } catch (error) {
    console.error("GET STUDENT CLASSROOM ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

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

    /* ✅ 1. Add students to course */
    course.students = [
      ...new Set([...(course.students || []), ...studentIds])
    ];
    await course.save();

    /* ✅ 2. Add course to students */
    await User.updateMany(
      { _id: { $in: studentIds } },
      {
        $addToSet: {
          assignedCourses: course._id,
          classroom: course.classroom?._id   // 🔥 THIS IS THE FIX
        }
      }
    );

    res.json({ message: "Students assigned successfully" });
  } catch (error) {
    console.error("ASSIGN STUDENTS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= MENTOR DASHBOARD STATS ================= */
const getMentorDashboardStats = async (req, res) => {
  try {
    const mentorId = req.user.userId;

    const courses = await Course.find({ mentorId });
    const courseIds = courses.map(c => c._id);

    const assignedStudents = await User.find({
      role: 'student',
      assignedCourses: { $in: courseIds }
    });

    res.json({
      coursesCount: courses.length,
      studentsCount: new Set(assignedStudents.map(s => s._id.toString())).size
    });
  } catch (error) {
    console.error("MENTOR DASHBOARD ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getAllUsers,
  approveMentor,
  rejectMentor,
  deleteUser,
  getAnalytics,
  getStudents,
  registerMentor,
  getMentorDashboardStats,
  getMentorsForCourse,
  getAllMentorsSimple,
  assignStudentsToCourse,
  getStudentClassroom // ✅ THIS WAS THE MISSING FIX
};
