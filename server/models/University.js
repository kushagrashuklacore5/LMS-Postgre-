const mongoose = require("mongoose");

const universitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    area: {
      type: String,
      required: true,
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("University", universitySchema);
