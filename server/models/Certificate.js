const mongoose = require("mongoose");

const certificateSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true
    },

    certificateUrl: {
      type: String,
      required: true
    },

    issuedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

/**
 * One certificate per student per course
 */
certificateSchema.index(
  { studentId: 1, courseId: 1 },
  { unique: true }
);

module.exports = mongoose.model("Certificate", certificateSchema);
