const mongoose = require("mongoose");

const AssessmentSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true
    },
    weekId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Week",
      required: false
    },
    title: String,
    description: String,
    startTime: {
      type: Date,
      required: true
    },
    endTime: {
      type: Date,
      required: true
    },
    timer: {
      type: Number, // Duration in minutes
      default: 60
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    isPublished: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Assessment", AssessmentSchema);
