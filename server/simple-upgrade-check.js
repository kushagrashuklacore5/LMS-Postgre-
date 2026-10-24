const axios = require('axios');
require('dotenv').config();

console.log('=== Simple Upgrade Check ===');

const API_BASE = 'http://127.0.0.1:5002';

// Generate real portal token
function generatePortalToken() {
  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_SECRET || 'default_jwt_secret_key';
  
  return jwt.sign(
    { 
      userId: 69, 
      email: 'portal@core5.co.in', 
      role: 'portal_admin',
      name: 'Portal Admin'
    },
    secret,
    { expiresIn: '24h' }
  );
}

async function simpleUpgradeCheck() {
  try {
    const token = generatePortalToken();
    console.log('Generated portal token');
    
    // Perform upgrade with detailed error handling
    console.log('\n1. Performing upgrade...');
    try {
      const upgradeResponse = await axios.post(`${API_BASE}/api/subscriptions/test-upgrade`, {
        planId: 'standard',
        planName: 'Standard',
        durationDays: 30
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Upgrade status:', upgradeResponse.status);
      console.log('Upgrade success:', upgradeResponse.data.success);
      console.log('Upgrade message:', upgradeResponse.data.message);
      console.log('Upgrade plan:', upgradeResponse.data.subscription.planName);
      console.log('Upgrade subscription ID:', upgradeResponse.data.subscription.id || 'No ID');
      
    } catch (upgradeError) {
      console.error('Upgrade failed:', upgradeError.response?.status, upgradeError.response?.data || upgradeError.message);
      return;
    }
    
    // Wait a moment for database to update
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check subscription after upgrade
    console.log('\n2. Checking subscription after upgrade...');
    try {
      const checkResponse = await axios.get(`${API_BASE}/api/subscriptions/current`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Current plan:', checkResponse.data.subscription.planName);
      console.log('Current subscription ID:', checkResponse.data.subscription.id || 'No ID');
      
    } catch (checkError) {
      console.error('Check failed:', checkError.response?.status, checkError.response?.data || checkError.message);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

simpleUpgradeCheck();
