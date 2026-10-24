const Classroom = require("../models/Classroom");
const User = require("../models/User");
const mongoose = require("mongoose");

/* ================= CREATE CLASSROOM ================= */
const createClassroom = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access only" });
    }

    const { name, section, classTeacher } = req.body;
    let studentIds = [];
    
    // Handle studentIds from FormData (can be JSON string or array)
    if (req.body.studentIds) {
      try {
        studentIds = typeof req.body.studentIds === 'string' 
          ? JSON.parse(req.body.studentIds) 
          : req.body.studentIds;
      } catch (e) {
        studentIds = Array.isArray(req.body.studentIds) ? req.body.studentIds : [];
      }
    }

    if (!name) {
      return res.status(400).json({ message: "Classroom name is required" });
    }

    const timetablePath = req.files?.timetable ? `/uploads/${req.files.timetable[0].filename}` : "";
    const photoPath = req.files?.photo ? `/uploads/${req.files.photo[0].filename}` : "";

    // ✅ IF CLASS TEACHER IS ASSIGNED, REMOVE FROM OLD CLASSROOM
    if (classTeacher) {
      const oldClassroom = await Classroom.findOne({ classTeacher });
      if (oldClassroom) {
        oldClassroom.classTeacher = null;
        await oldClassroom.save();
      }
    }

    const classroom = await Classroom.create({
      name,
      section,
      classTeacher: classTeacher || null,
      timetable: timetablePath,
      photo: photoPath,
      students: studentIds || [],
      courses: [],
    });

    // Update students' classroom assignment (remove from old, add to new)
    if (studentIds && studentIds.length > 0) {
      // Remove students from old classrooms
      await Classroom.updateMany(
        { students: { $in: studentIds } },
        { $pull: { students: { $in: studentIds } } }
      );
      
      // Add students to new classroom
      await User.updateMany(
        { _id: { $in: studentIds } },
        { $set: { classroom: classroom._id } }
      );
    }

    return res.status(201).json({
      message: "Classroom created successfully",
      classroom,
    });
  } catch (err) {
    console.error("CREATE CLASSROOM ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET ALL CLASSROOMS (ADMIN) ================= */
const getClassrooms = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access only" });
    }

    const classrooms = await Classroom.find()
      .populate("classTeacher", "name email")
      .sort({ createdAt: -1 });

    return res.json(classrooms);
  } catch (err) {
    console.error("GET CLASSROOMS ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET CLASSROOM BY ID (ADMIN) ================= */
const getClassroomById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid classroom ID" });
    }

    const classroom = await Classroom.findById(id)
      .populate("classTeacher", "name email")
      .populate("students", "name email");

    if (!classroom) {
      return res.status(404).json({ message: "Classroom not found" });
    }

    return res.json(classroom);
  } catch (err) {
    console.error("GET CLASSROOM BY ID ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET MY CLASSROOM (CLASS TEACHER) ================= */
const getMyClassroom = async (req, res) => {
  try {
    if (req.user.role !== "mentor") {
      return res.status(403).json({ message: "Access denied" });
    }

    const classroom = await Classroom.findOne({
      classTeacher: req.user.userId,
    })
      .populate("students", "name email");

    if (!classroom) {
      return res.json(null);
    }

    // Fetch courses separately to ensure proper population
    const Course = require("../models/Course");
    const courses = await Course.find({
      _id: { $in: classroom.courses },
    })
      .populate("courseTeacher", "name email")
      .select("title photo description courseTeacher category duration");

    // Return classroom with populated courses
    const classroomObj = classroom.toObject();
    classroomObj.courses = courses;

    return res.json(classroomObj);
  } catch (err) {
    console.error("GET MY CLASSROOM ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= ✅ ASSIGN STUDENTS TO CLASSROOM (ADMIN OR CLASS TEACHER) ================= */
const assignStudentsToClassroom = async (req, res) => {
  try {
    const { classroomId, studentIds } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ message: "No students selected" });
    }

    let classroom;
    if (req.user.role === "admin") {
      // Admin can assign to any classroom
      if (!classroomId) {
        return res.status(400).json({ message: "Classroom ID required" });
      }
      classroom = await Classroom.findById(classroomId);
    } else if (req.user.role === "mentor") {
      // Class teacher can only assign to their own classroom
      classroom = await Classroom.findOne({
        classTeacher: req.user.userId,
      });
    } else {
      return res.status(403).json({ message: "Access denied" });
    }

    if (!classroom) {
      return res.status(404).json({
        message: "Classroom not found or you are not assigned as a class teacher",
      });
    }

    // ✅ VALIDATE IDS
    const validStudentIds = studentIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const existingIds = classroom.students.map((id) => id.toString());

    const newStudents = validStudentIds.filter(
      (id) => !existingIds.includes(id.toString())
    );

    /* 🔥 ADD TO CLASSROOM */
    classroom.students.push(...newStudents);
    await classroom.save();

    /* 🔥🔥 UPDATE USER CLASSROOM ASSIGNMENT 🔥🔥 */
    await User.updateMany(
      { _id: { $in: newStudents } },
      { $set: { classroom: classroom._id } }
    );

    return res.json({
      message: "Students assigned successfully",
      addedCount: newStudents.length,
    });
  } catch (err) {
    console.error("ASSIGN STUDENTS ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* ================= GET STUDENT CLASSROOMS ================= */
const getStudentClassrooms = async (req, res) => {
  try {
    if (req.user.role !== "student") {
      return res.status(403).json({ message: "Student access only" });
    }

    const student = await User.findById(req.user.userId);
    if (!student || !student.classroom) {
      return res.json([]);
    }

    const classroom = await Classroom.findById(student.classroom)
      .populate("classTeacher", "name email");

    if (!classroom) {
      return res.json([]);
    }

    // Fetch courses separately to ensure proper population
    const Course = require("../models/Course");
    const courses = await Course.find({
      _id: { $in: classroom.courses },
    })
      .select("title photo description courseTeacher")
      .populate("courseTeacher", "name email");

    // Return classroom with populated courses
    const classroomObj = classroom.toObject();
    classroomObj.courses = courses;

    return res.json([classroomObj]);
  } catch (err) {
    console.error("GET STUDENT CLASSROOMS ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createClassroom,
  getClassrooms,
  getClassroomById,
  getMyClassroom,
  assignStudentsToClassroom,
  getStudentClassrooms,
};
