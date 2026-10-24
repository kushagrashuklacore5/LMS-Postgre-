const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: false // Make optional for demo
  },
  studentName: {
    type: String,
    required: true
  },
  orderId: {
    type: String,
    required: true
  },
  paymentId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed'],
    default: 'pending'
  },
  paymentMethod: String,
  paymentOption: {
    type: String,
    enum: ['full', 'term', 'installment'],
    required: false
  },
  classroomId: {
    type: Number,
    required: false
  },
  classroomName: {
    type: String,
    required: false
  },
  feeType: {
    type: String,
    enum: ['class_fee', 'course_fee', 'misc_fee'],
    default: 'class_fee'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Transaction', transactionSchema);
