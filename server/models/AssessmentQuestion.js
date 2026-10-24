const mongoose = require("mongoose");

const AssessmentQuestionSchema = new mongoose.Schema(
  {
    assessmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assessment",
      required: true
    },
    questionType: {
      type: String,
      enum: ["text", "image"],
      default: "text"
    },
    questionText: String,
    questionImage: String,
    options: [String],
    correctOptionIndex: Number
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "AssessmentQuestion",
  AssessmentQuestionSchema
);
