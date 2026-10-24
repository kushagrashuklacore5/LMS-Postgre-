// Razorpay configuration.
//
// Keys come from the environment only (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET).
// Keys must never be written in source files: anyone who can read the
// repository could then confirm payments that were never made.

const getCurrentConfig = () => ({
  KEY_ID: process.env.RAZORPAY_KEY_ID || '',
  KEY_SECRET: process.env.RAZORPAY_KEY_SECRET || ''
});

const isConfigured = () => {
  const { KEY_ID, KEY_SECRET } = getCurrentConfig();
  return Boolean(KEY_ID && KEY_SECRET);
};

module.exports = {
  getCurrentConfig,
  isConfigured
};
