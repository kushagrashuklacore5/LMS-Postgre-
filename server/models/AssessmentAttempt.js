const mongoose = require("mongoose");

const AssessmentAttemptSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assessment"
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    answers: [Number],
    score: Number,
    percentage: Number,
    isPassed: Boolean,
    submittedAt: Date
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "AssessmentAttempt",
  AssessmentAttemptSchema
);
