const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  pendingFees: {
    type: Number,
    default: 0
  },
  totalFees: {
    type: Number,
    default: 0
  },
  role: {
    type: String,
    default: 'student'
  }
});

module.exports = mongoose.model('Student', studentSchema);
