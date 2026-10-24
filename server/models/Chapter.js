const mongoose = require("mongoose");

const chapterSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true
    },

    title: {
      type: String,
      required: true,
      trim: true
    },

    description: {
      type: String,
      required: true
    },

    imageUrl: {
      type: String,
      default: ""
    },

    videoUrl: {
      type: String,
      required: true
    },

    fileUrl: {
      type: String,
      default: ""
    },

    order: {
      type: Number,
      required: true,
      min: 1
    }
  },
  {
    timestamps: true
  }
);

/**
 * Ensure unique chapter order per course
 * (No two chapters can have same order in one course)
 */
chapterSchema.index({ courseId: 1, order: 1 }, { unique: true });

module.exports = mongoose.model("Chapter", chapterSchema);
