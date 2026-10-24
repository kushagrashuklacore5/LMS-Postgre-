const mongoose = require('mongoose');

const connectDB = async () => {
  console.log("Attempting to connect to MongoDB...");
  
  // Set MongoDB URI directly to use IPv4
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/lms-proto';
  console.log("MongoDB URI:", mongoUri);
  
  // Set JWT_SECRET if not available
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'your_jwt_secret_key_here';
    console.log("JWT_SECRET set to default value");
  }
  
  try {
    const conn = await mongoose.connect(mongoUri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    global.isDbConnected = true;
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    console.error("Full error details:", error);
    console.log("⚠️ Running in Offline Mode (Mock Data Enabled)");
    global.isDbConnected = false;
    // process.exit(1); // Do not exit, keep server running for diagnostics
  }
};

module.exports = connectDB;
