const mongoose = require("mongoose");

const progressSchema = new mongoose.Schema(
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

    // Content type: 'chapter', 'material', or 'assessment'
    contentType: {
      type: String,
      enum: ['chapter', 'material', 'assessment'],
      required: true
    },

    // Reference to the content (could be chapter, material, or assessment)
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    // Legacy field for backward compatibility
    chapterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      index: true
    },

    completed: {
      type: Boolean,
      default: false
    },

    completedAt: {
      type: Date
    },

    // Additional metadata for different content types
    metadata: {
      score: Number, // For assessments
      timeSpent: Number, // Time spent on content in minutes
      attempts: Number // Number of attempts for assessments
    }
  },
  {
    timestamps: true
  }
);

/**
 * Prevent duplicate progress entries
 * (One student can complete one content item only once)
 */
progressSchema.index(
  { studentId: 1, contentId: 1, contentType: 1 },
  { unique: true }
);

// Legacy index for backward compatibility
progressSchema.index(
  { studentId: 1, chapterId: 1 },
  { unique: true, sparse: true }
);

module.exports = mongoose.model("Progress", progressSchema);
