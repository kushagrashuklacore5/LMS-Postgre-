const jwt = require('jsonwebtoken');
const db = require('./config/database-switch');

console.log('🔍 Checking JWT Token Content...\n');

// Check the admin user in database
db.get("SELECT * FROM users WHERE email = ?", ['abhishek@core5.co.in'], (err, user) => {
  if (err) {
    console.error('❌ Error finding user:', err);
    return;
  }
  
  if (user) {
    console.log('✅ Found user in database:');
    console.log('   - ID:', user.id);
    console.log('   - Name:', user.name);
    console.log('   - Email:', user.email);
    console.log('   - Role:', user.role);
    console.log('   - university_id:', user.university_id);
    
    // Create a test JWT token with the correct universityId
    const token = jwt.sign(
      { 
        userId: user.id, 
        role: user.role, 
        name: user.name, 
        email: user.email, 
        universityId: user.university_id || 1,
        subscriptionPlan: user.subscriptionPlan || 'free' 
      },
      process.env.JWT_SECRET || "default_jwt_secret_key",
      { expiresIn: "7d" }
    );
    
    console.log('\n🔑 Test JWT Token Created:');
    console.log('   - Token:', token.substring(0, 50) + '...');
    
    // Decode the token to verify
    const decoded = jwt.decode(token);
    console.log('\n📋 Decoded JWT Token:');
    console.log(JSON.stringify(decoded, null, 2));
    
    console.log('\n💡 Expected universityId in JWT:', user.university_id || 1);
  }
});
