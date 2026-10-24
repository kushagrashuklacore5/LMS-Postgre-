const jwt = require('jsonwebtoken');
const db = require('./config/database-switch');

async function checkJWTUserData() {
  console.log('🔍 Checking JWT user data...\n');
  
  try {
    // Login to get token
    const axios = require('axios');
    const loginRes = await axios.post('http://127.0.0.1:5002/api/auth/login', {
      email: 'abhishek@core5.co.in',
      password: 'O#P$0A@7THQW'
    });
    
    const token = loginRes.data.token;
    console.log('🔑 Token received');
    
    // Decode JWT token
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_jwt_secret_key');
      console.log('✅ JWT decoded successfully');
      console.log('👤 Decoded user data:', decoded);
      
      // Check if subscriptionPlan is in the token
      console.log('📊 Subscription Plan in token:', decoded.subscriptionPlan || 'NOT FOUND');
      
      // Get user from database to compare
      const dbUser = await new Promise((resolve, reject) => {
        db.get(`
          SELECT id, name, email, role, subscriptionPlan, university_id
          FROM users 
          WHERE id = ?
        `, [decoded.userId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
      
      console.log('👤 Database user data:', dbUser);
      
      // Check if they match
      console.log('\n🔍 Comparison:');
      console.log('Token subscriptionPlan:', decoded.subscriptionPlan || 'NOT FOUND');
      console.log('DB subscriptionPlan:', dbUser.subscriptionPlan);
      console.log('Match:', decoded.subscriptionPlan === dbUser.subscriptionPlan ? 'YES' : 'NO');
      
      // Check what's missing in the JWT
      const dbFields = Object.keys(dbUser);
      const tokenFields = Object.keys(decoded);
      
      console.log('\n📋 Database fields:', dbFields);
      console.log('📋 Token fields:', tokenFields);
      
      const missingFields = dbFields.filter(field => !tokenFields.includes(field));
      console.log('📋 Missing in token:', missingFields);
      
    } catch (jwtError) {
      console.log('❌ JWT verification failed:', jwtError.message);
    }
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkJWTUserData();
