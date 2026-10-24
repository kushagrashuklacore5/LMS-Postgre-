const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true
    },

    password: {
      type: String,
      required: true
    },

    role: {
      type: String,
      enum: ["student", "mentor", "admin"],
      default: "student"
    },

    isApproved: {
      type: Boolean,
      default: false
    },

    assignedCourses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course"
      }
    ],
    // Classroom assignment for students
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    },

    lastLogin: Date,

    // ✅ NEW FIELD (LANGUAGE SUPPORT)
    preferredLanguage: {
      type: String,
      default: "en"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
