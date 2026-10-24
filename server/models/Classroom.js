const mongoose = require("mongoose");

const classroomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    section: {
      type: String,
      trim: true,
      default: "",
    },

    classTeacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    courses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],

    // ✅ NEW: Timetable upload (PDF / Image)
    timetable: {
      type: String, // file path or URL
      default: "",
    },
    // Photo for classroom card
    photo: {
      type: String, // file path or URL
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Classroom", classroomSchema);
