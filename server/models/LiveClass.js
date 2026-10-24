const mongoose = require("mongoose");

const LiveClassSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true
    },
    instructorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    title: {
      type: String,
      required: true
    },
    description: String,
    scheduledStartTime: {
      type: Date,
      required: true
    },
    scheduledEndTime: {
      type: Date,
      required: true
    },
    actualStartTime: Date,
    actualEndTime: Date,
    meetingLink: String, // Jitsi meeting URL
    meetingId: String, // Unique meeting identifier
    platform: {
      type: String,
      enum: ["jitsi", "zoom", "teams", "custom"],
      default: "jitsi"
    },
    status: {
      type: String,
      enum: ["scheduled", "live", "completed", "cancelled"],
      default: "scheduled"
    },
    duration: Number, // in minutes
    recordingUrl: String, // For future recording integration
    attendees: [
      {
        studentId: mongoose.Schema.Types.ObjectId,
        joinedAt: Date,
        leftAt: Date,
        duration: Number // in minutes
      }
    ],
    notes: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("LiveClass", LiveClassSchema);
