const mongoose = require("mongoose");

const calendarEventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

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

    // Admin only
    publishFor: {
      type: String,
      enum: ["faculty", "student", "both"],
    },

    // Mentor only
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CalendarEvent", calendarEventSchema);
