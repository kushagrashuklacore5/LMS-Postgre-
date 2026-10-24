const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  superadminId: {
    type: String,
    default: 'superadmin-1',
    unique: true
  },
  planType: {
    type: String,
    enum: ['free', 'standard', 'professional'],
    default: 'free'
  },
  planName: {
    type: String,
    default: 'Free'
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled'],
    default: 'active'
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  expiryDate: {
    type: Date,
    required: true
  },
  durationDays: {
    type: Number,
    default: 30
  },
  paymentId: {
    type: String,
    default: null
  },
  amount: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  paymentMethod: {
    type: String,
    default: null
  },
  isFreeTrial: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Subscription', SubscriptionSchema);
