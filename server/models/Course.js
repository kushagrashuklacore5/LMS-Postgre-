const mongoose = require("mongoose");

const CourseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    description: String,

    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: false,
    },

    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    classroomId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Classroom",
  required: false,
},

courseTeacher: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "User",
  required: false,
},
    // Photo for course card
    photo: {
      type: String, // file path or URL
      default: "",
    },
    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Course", CourseSchema);
