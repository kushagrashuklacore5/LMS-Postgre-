const mongoose = require("mongoose");

const ResultSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Classroom",
      required: true,
    },
    term: {
      type: String,
      default: "General",
    },
    subjects: [
      {
        name: { type: String, required: true },
        marks: { type: Number, required: true },
        total: { type: Number, required: true },
        status: { type: String, enum: ["PASS", "FAIL"], default: "PASS" },
      },
    ],
    overallPercentage: {
      type: Number,
      default: 0,
    },
    overallStatus: {
      type: String,
      enum: ["PASS", "FAIL"],
      default: "PASS",
    },
    comments: {
      type: String,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Result", ResultSchema);
