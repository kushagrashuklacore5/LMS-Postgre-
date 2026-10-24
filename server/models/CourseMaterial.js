const mongoose = require("mongoose");

const CourseMaterialSchema = new mongoose.Schema(
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
    title: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ["video", "pdf", "video_link", "pdf_link"],
      required: true
    },
    // For uploaded files
    fileUrl: {
      type: String,
      default: ""
    },
    // For external links
    linkUrl: {
      type: String,
      default: ""
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("CourseMaterial", CourseMaterialSchema);
