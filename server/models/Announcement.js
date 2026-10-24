const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    /* ================= CONTENT ================= */
    title: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    /* ================= CREATOR ================= */
    createdByRole: {
      type: String,
      enum: ["admin", "mentor"],
      required: true,
    },

    createdByUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /* ================= ADMIN TARGET ================= */
    // Used ONLY when createdByRole === "admin"
    publishFor: {
      type: String,
      enum: ["student", "faculty", "both"],
    },

    /* ================= MENTOR TARGET ================= */
    // Used ONLY when createdByRole === "mentor"
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
    },

    /* ================= READ TRACKING ================= */
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

/* ================= INDEXES (PERFORMANCE) ================= */
announcementSchema.index({ createdAt: -1 });
announcementSchema.index({ courseId: 1 });
announcementSchema.index({ publishFor: 1 });

module.exports = mongoose.model("Announcement", announcementSchema);
