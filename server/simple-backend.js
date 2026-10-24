const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Load email configuration
const fs = require('fs');
if (fs.existsSync(path.join(__dirname, 'email_config.txt'))) {
  const emailConfig = fs.readFileSync(path.join(__dirname, 'email_config.txt'), 'utf8');
  emailConfig.split('\n').forEach(line => {
    if (line.trim() && line.includes('=')) {
      const [key, value] = line.split('=');
      process.env[key.trim()] = value.trim();
    }
  });
}

// Email transporter setup
let transporter = null;
const initializeEmailService = async () => {
  try {
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      if (process.env.EMAIL_SERVICE === 'zoho') {
        // Try multiple Zoho Mail SMTP configurations
        const zohoConfigs = [
          {
            // Zoho with SSL (port 465)
            host: 'smtp.zoho.com',
            port: 465,
            secure: true,
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS
            }
          },
          {
            // Zoho with TLS (port 587)
            host: 'smtp.zoho.com',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS
            }
          },
          {
            // Zoho alternative configuration
            host: 'smtp.zoho.in',
            port: 465,
            secure: true,
            auth: {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASS
            }
          }
        ];

        // Try each configuration
        for (let i = 0; i < zohoConfigs.length; i++) {
          try {
            console.log(`🔄 Trying Zoho config ${i + 1}: ${zohoConfigs[i].host}:${zohoConfigs[i].port}`);
            transporter = nodemailer.createTransport(zohoConfigs[i]);
            await transporter.verify();
            console.log(`✅ Zoho config ${i + 1} successful!`);
            break;
          } catch (error) {
            console.log(`❌ Zoho config ${i + 1} failed:`, error.message);
            if (i === zohoConfigs.length - 1) {
              throw error; // Re-throw if all configs fail
            }
          }
        }
      } else {
        // Default to Gmail
        transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });
      }
      
      // Test the connection
      await transporter.verify();
      console.log(`✅ Email service initialized with ${process.env.EMAIL_SERVICE.toUpperCase()} SMTP`);
      console.log(`📧 Sending from: ${process.env.EMAIL_USER}`);
    } else {
      console.log('⚠️  Email credentials not found, using mock service');
    }
  } catch (error) {
    console.error('❌ Email service initialization failed:', error.message);
    transporter = null;
  }
};

// Initialize email service
initializeEmailService();

const app = express();

const db = require('./config/database-switch');
const superadminRoutes = require('./routes/superadminRoutes');

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Authorization', 'Cache-Control', 'Accept']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Mount superadmin routes
app.use('/api/superadmin', superadminRoutes);
app.use('/api/demo-requests', require('./routes/demoRoutes'));

// Test route for university creation without auth
app.post('/api/test/create-university', async (req, res) => {
  try {
    console.log('🧪 Test Create University - No Auth');
    
    const { universityName, area, adminName, adminEmail } = req.body;

    if (!universityName || !area || !adminName || !adminEmail) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Normalize email
    const normalizedEmail = adminEmail.trim().toLowerCase();

    console.log('🏛️ Creating university with admin:', { universityName, adminEmail: normalizedEmail });

    // Check if admin already exists
    const existingAdmin = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM users WHERE email = ?", [normalizedEmail], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });

    if (existingAdmin) {
      return res.status(400).json({ message: "Admin already exists" });
    }

    // Auto-generate password
    const rawPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    // Create university first to get the ID
    const universityId = await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO universities (name, area, createdAt, updatedAt)
        VALUES (?, ?, datetime('now'), datetime('now'))
      `, [universityName, area], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });

    console.log(`✅ University created with ID: ${universityId}`);

    // Create admin user
    const adminId = await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO users (name, email, password, role, is_approved, university_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `, [adminName, normalizedEmail, hashedPassword, "admin", 1, universityId], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });

    console.log(`✅ Admin user created with ID: ${adminId}`);

    // Update university adminId
    await new Promise((resolve, reject) => {
      db.run(`UPDATE universities SET adminId = ? WHERE id = ?`, [adminId, universityId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return res.status(201).json({
      message: "University and Admin created successfully",
      university: {
        id: universityId,
        name: universityName,
        area: area
      },
      admin: {
        id: adminId,
        name: adminName,
        email: normalizedEmail,
        generatedPassword: rawPassword
      }
    });

  } catch (error) {
    console.error("Create university error:", error);
    return res.status(500).json({ message: "Server error: " + (error.message || error) });
  }
});

// Test superadmin credentials
const TEST_CREDENTIALS = {
  email: 'superadmin@test.com',
  password: 'admin123',
  passwordHash: '$2a$12$a6oO7Bz9oOQYhx3Y2jCMaO2ACte9g4GSWP8iDlxl7HhTAYybKklla' // bcrypt hash of 'admin123'
};

console.log('\n🔑 TEST SUPERADMIN CREDENTIALS:');
console.log('📧 Email:', TEST_CREDENTIALS.email);
console.log('🔑 Password:', TEST_CREDENTIALS.password);

// Mock JWT token for testing
const generateMockToken = (user) => {
  return jwt.sign(
    {
      superadminId: 'test-superadmin-1',
      email: user.email,
      role: 'superadmin',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (15 * 60) // 15 minutes
    },
    process.env.JWT_SECRET || 'fallback_jwt_secret_key_change_in_production',
    { algorithm: 'HS256' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      superadminId: 'test-superadmin-1',
      email: user.email,
      role: 'superadmin'
    },
    process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret_key_change_in_production',
    { expiresIn: '7d' }
  );
};

// Superadmin login endpoint
app.post('/api/superadmin/login', async (req, res) => {
  try {
    // Validate request body
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        error: "invalid_request",
        message: "Request body is missing or not valid JSON."
      });
    }

    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Email and password are required.",
        fields: {
          email: email ? undefined : "Email is required.",
          password: password ? undefined : "Password is required."
        }
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Email and password are required.",
        fields: {
          email: "Enter a valid email address.",
          password: undefined
        }
      });
    }

    // Check credentials
    if (email === TEST_CREDENTIALS.email) {
      const passwordMatch = await bcrypt.compare(password, TEST_CREDENTIALS.passwordHash);
      
      if (passwordMatch) {
        // Generate tokens
        const accessToken = generateMockToken({ email });
        const refreshToken = generateRefreshToken({ email });

        // Set refresh token cookie
        res.cookie('refreshToken', refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        console.log("✅ Login successful for:", email);

        return res.status(200).json({
          success: true,
          message: "Login successful.",
          data: {
            accessToken: accessToken,
            superadmin: {
              id: 'test-superadmin-1',
              email: email,
              name: 'Test Superadmin',
              role: 'superadmin'
            }
          }
        });
      }
    }

    // Invalid credentials
    console.log("❌ Login failed for:", email);
    return res.status(401).json({
      success: false,
      error: "invalid_credentials",
      message: "Incorrect email or password."
    });

  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      error: "server_error",
      message: "An unexpected error occurred. Please try again."
    });
  }
});

// General user login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Input validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid email address.'
      });
    }

    // Check user in PostgreSQL database
    console.log(`🔍 Login attempt for ${email}...`);
    
    db.get('SELECT id, name, email, password, role, university_id FROM users WHERE email = ?', [email.toLowerCase()], async (err, user) => {
      if (err) {
        console.error('❌ Database error:', err);
        return res.status(500).json({
          success: false,
          message: 'Database error occurred'
        });
      }
      
      console.log(`👤 User found: ${user ? 'YES' : 'NO'}`);

      if (!user) {
        console.log(`❌ User not found: ${email}`);
        return res.status(401).json({
          success: false,
          message: 'Incorrect email or password.'
        });
      }

      console.log(`👤 User details:`, {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        universityId: user.university_id,
        hasPassword: !!user.password,
        passwordHash: user.password.substring(0, 20) + '...'
      });

      // Verify password
      console.log(`🔐 Verifying password for ${email}...`);
      const passwordMatch = await bcrypt.compare(password, user.password);
      console.log(`🔍 Password match result: ${passwordMatch}`);
      
      if (!passwordMatch) {
        console.log(`❌ Password mismatch for ${email}`);
        return res.status(401).json({
          success: false,
          message: 'Incorrect email or password.'
        });
      }

      // Generate tokens
      const accessToken = generateMockToken({ email: user.email });
      const refreshToken = generateRefreshToken({ email: user.email });

      // Set refresh token cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      console.log(`✅ User login successful for: ${user.email}`);

      return res.status(200).json({
        success: true,
        message: 'Login successful.',
        data: {
          accessToken: accessToken,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            universityId: user.university_id,
            universityName: null // Will be populated if needed
          }
        }
      });
    });

  } catch (error) {
    console.error('User login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.'
    });
  }
});

// Refresh token endpoint
app.post('/api/superadmin/refresh-token', (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: "refresh_failed",
        message: "Session expired. Please log in again."
      });
    }

    // Verify refresh token
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret_key_change_in_production');
      
      // Generate new access token
      const accessToken = jwt.sign(
        {
          superadminId: decoded.superadminId,
          email: decoded.email,
          role: decoded.role,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + (15 * 60) // 15 minutes
        },
        process.env.JWT_SECRET || 'fallback_jwt_secret_key_change_in_production',
        { algorithm: 'HS256' }
      );

      return res.json({
        success: true,
        data: {
          accessToken: accessToken
        }
      });
    } catch (jwtError) {
      console.log('Refresh token verification failed:', jwtError.message);
      
      res.clearCookie('refreshToken');
      
      return res.status(401).json({
        success: false,
        error: "refresh_failed",
        message: "Session expired. Please log in again."
      });
    }
  } catch (error) {
    console.error("Refresh token error:", error);
    return res.status(500).json({
      success: false,
      error: "server_error",
      message: "An unexpected error occurred. Please try again."
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Password Reset Endpoints

// In-memory OTP storage (for demo)
const otpStore = new Map(); // email -> { otp, expiresAt, attempts }

// Send OTP
app.post('/api/password-reset/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store OTP
    otpStore.set(email.toLowerCase(), {
      otp,
      expiresAt,
      attempts: 0
    });

    console.log(`🔐 OTP generated for ${email}: ${otp}`);

    // Send email with OTP
    let emailSent = false;
    if (transporter) {
      try {
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
              <h1 style="color: white; margin: 0; font-size: 32px; font-weight: bold;">Core5 Academy</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 16px;">Password Reset OTP</p>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 10px; margin: 20px 0; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h2 style="color: #333; text-align: center; margin-bottom: 20px; font-size: 24px;">Your OTP Code</h2>
              <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; text-align: center; border: 2px dashed #667eea; margin: 20px 0;">
                <span style="font-size: 42px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: monospace;">${otp}</span>
              </div>
              <p style="color: #666; text-align: center; margin-top: 20px; font-size: 16px;">
                This OTP will expire in <strong style="color: #e74c3c;">10 minutes</strong>
              </p>
              <p style="color: #999; text-align: center; margin-top: 10px; font-size: 14px;">
                Requested at: ${new Date().toLocaleString()}
              </p>
            </div>
            
            <div style="background: #fff3cd; padding: 20px; border-radius: 10px; border-left: 4px solid #ffc107; margin: 20px 0;">
              <p style="color: #856404; margin: 0; font-size: 14px; line-height: 1.5;">
                <strong>🔒 Security Notice:</strong> Never share this OTP with anyone. Our team will never ask for your OTP via phone or email. This code can only be used once.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #999; margin: 0; font-size: 12px;">
                This is an automated message from Core5 Academy LMS System.<br>
                If you didn't request this password reset, please ignore this email.
              </p>
              <p style="color: #999; margin: 10px 0 0; font-size: 11px;">
                &copy; 2024 Core5 Academy. All rights reserved.
              </p>
            </div>
          </div>
        `;

        const mailOptions = {
          from: process.env.EMAIL_FROM || '"Core5 Academy" <support@core5.co.in>',
          to: email,
          subject: '🔐 Password Reset OTP - Core5 Academy',
          html: htmlContent
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('📧 ===== OTP EMAIL SENT =====');
        console.log(`📬 To: ${email}`);
        console.log(`📋 Message ID: ${info.messageId}`);
        console.log(`✅ Real email sent via Gmail SMTP`);
        console.log('📱 Check your email inbox for the OTP');
        console.log('========================');
        
        emailSent = true;
      } catch (emailError) {
        console.error('❌ Error sending email:', emailError.message);
        console.log('🔄 Falling back to development mode');
      }
    }

    res.json({
      success: true,
      message: emailSent ? 'OTP sent successfully to your email' : 'OTP generated (development mode)',
      emailService: emailSent ? 'gmail-smtp' : 'development',
      developmentOTP: otp // Only for development/testing
    });

  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP'
    });
  }
});

// Verify OTP
app.post('/api/password-reset/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    const storedData = otpStore.get(email.toLowerCase());
    
    if (!storedData) {
      return res.status(400).json({
        success: false,
        message: 'OTP not found or expired'
      });
    }

    // Check if OTP expired
    if (new Date() > storedData.expiresAt) {
      otpStore.delete(email.toLowerCase());
      return res.status(400).json({
        success: false,
        message: 'OTP expired'
      });
    }

    // Check attempts
    if (storedData.attempts >= 3) {
      otpStore.delete(email.toLowerCase());
      return res.status(400).json({
        success: false,
        message: 'Too many attempts. Please request a new OTP'
      });
    }

    // Verify OTP
    if (storedData.otp !== otp) {
      storedData.attempts++;
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // OTP verified - mark as verified
    storedData.verified = true;
    
    res.json({
      success: true,
      message: 'OTP verified successfully'
    });

  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP'
    });
  }
});

// Reset Password
app.post('/api/password-reset/reset-password', async (req, res) => {
  try {
    const { email, newPassword, confirmPassword } = req.body;
    
    if (!email || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const storedData = otpStore.get(email.toLowerCase());
    
    if (!storedData || !storedData.verified) {
      return res.status(400).json({
        success: false,
        message: 'OTP not verified. Please verify OTP first'
      });
    }

    // Check if OTP expired
    if (new Date() > storedData.expiresAt) {
      otpStore.delete(email.toLowerCase());
      return res.status(400).json({
        success: false,
        message: 'OTP expired'
      });
    }

    // Hash the new password
    console.log(`🔧 Hashing new password for ${email}...`);
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    console.log(`🔐 Password hashed successfully: ${hashedPassword.substring(0, 20)}...`);

    // Update password in PostgreSQL database
    console.log(`💾 Updating password in PostgreSQL database for ${email}...`);
    
    // First check if user exists
    db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()], (err, existingUser) => {
      if (err) {
        console.error('❌ Database error checking user:', err);
        return res.status(500).json({
          success: false,
          message: 'Database error occurred'
        });
      }
      
      if (existingUser) {
        // Update existing user password
        console.log(`✅ Found existing user, updating password...`);
        
        db.run('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?', 
          [hashedPassword, email.toLowerCase()], function(err) {
            if (err) {
              console.error('❌ Error updating password:', err);
              return res.status(500).json({
                success: false,
                message: 'Failed to update password'
              });
            }
            
            console.log(`💾 Database update result: ${this.changes} rows affected`);
            console.log(`🔑 Password updated for user: ${email}`);
            
            // Verify the update
            db.get('SELECT password FROM users WHERE email = ?', [email.toLowerCase()], (err, verifyUser) => {
              if (err) {
                console.error('❌ Error verifying update:', err);
              } else {
                console.log(`🔍 Verification - stored hash: ${verifyUser.password.substring(0, 20)}...`);
                console.log(`🔍 Verification - hashes match: ${verifyUser.password === hashedPassword}`);
              }
            });
            
            // Clear OTP and respond
            otpStore.delete(email.toLowerCase());
            
            res.json({
              success: true,
              message: 'Password reset successfully'
            });
          });
      } else {
        // Create new user with this email and password
        console.log(`👤 Creating new user for ${email}...`);
        
        db.run(`
          INSERT INTO users (name, email, password, role, university_id, is_approved, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [
          email.split('@')[0], // Default name from email
          email.toLowerCase(),
          hashedPassword,
          'user',
          1, // university_id default
          1  // is_approved
        ], function(err) {
          if (err) {
            console.error('❌ Error creating new user:', err);
            return res.status(500).json({
              success: false,
              message: 'Failed to create new user'
            });
          }
          
          console.log(`💾 New user created with ID: ${this.lastID}`);
          console.log(`🔑 New user created with password: ${email}`);
          
          // Clear OTP and respond
          otpStore.delete(email.toLowerCase());
          
          res.json({
            success: true,
            message: 'Password reset successfully'
          });
        });
      }
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

// Check cooldown
app.get('/api/password-reset/check-cooldown', async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const storedData = otpStore.get(email.toLowerCase());
    
    let cooldown = 0;
    if (storedData && storedData.attempts >= 3) {
      // 5 minute cooldown after 3 attempts
      cooldown = 300;
    }

    res.json({
      success: true,
      cooldown
    });

  } catch (error) {
    console.error('Check cooldown error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check cooldown'
    });
  }
});

// Create user endpoint
app.post('/api/superadmin/create-user', async (req, res) => {
  try {
    console.log('🔍 Backend - Create User - Bypassing auth');
    
    const { name, email, role, universityId, password } = req.body;

    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'User name is required'
      });
    }

    if (!email || email.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'User email is required'
      });
    }

    if (!role || !['admin', 'accountant', 'storekeeper'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'Valid role is required (admin, accountant, storekeeper)'
      });
    }

    if (!universityId || universityId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'University selection is required'
      });
    }

    // Get superadmin ID (simplified for demo)
    const superadminId = 'test-superadmin-1';
    
    // Check if university belongs to this superadmin
    const universities = getUniversities(superadminId);
    const university = universities.find(uni => uni.id === universityId);
    
    if (!university) {
      return res.status(400).json({
        success: false,
        error: 'validation_error',
        message: 'University not found or access denied'
      });
    }

    // Create user object
    const user = {
      id: 'user-' + Date.now(),
      superadminId: superadminId,
      universityId: universityId,
      universityName: university.name,
      name: name.trim(),
      email: email.trim(),
      role: role,
      password: password, // In production, this would be hashed
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Store user using persistent storage
    const success = addUser(superadminId, user);
    
    if (!success) {
      return res.status(500).json({
        success: false,
        error: 'storage_error',
        message: 'Failed to save user'
      });
    }

    console.log('✅ User created and saved:', user);
    console.log('📊 Total users for superadmin:', getUsers(superadminId).length);

    res.status(201).json({
      success: true,
      data: user,
      message: 'User created successfully'
    });

  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Failed to create user'
    });
  }
});

// Get users endpoint
app.get('/api/superadmin/users', async (req, res) => {
  try {
    // Get superadmin ID (simplified for demo)
    const superadminId = 'test-superadmin-1';
    
    console.log('🔍 Backend - Get Users - Fetching for superadmin:', superadminId);

    // Get users for this superadmin only from persistent storage
    const users = getUsers(superadminId);
    
    console.log('📊 Found', users.length, 'users for superadmin:', superadminId);

    res.json({
      success: true,
      data: users,
      message: 'Users retrieved successfully'
    });

  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Failed to retrieve users'
    });
  }
});

app.get('/api/superadmin/universities', async (req, res) => {
  try {
    // Get superadmin ID from token (simplified for demo)
    const superadminId = 'test-superadmin-1'; // In real implementation, extract from JWT
    
    console.log('🔍 Backend - Get Universities - Fetching for superadmin:', superadminId);

    // Get universities for this superadmin only from persistent storage
    const universities = getUniversities(superadminId);
    
    console.log('📊 Found', universities.length, 'universities for superadmin:', superadminId);

    res.json({
      success: true,
      data: universities, // Return as array to match frontend expectation
      message: 'Universities retrieved successfully'
    });

  } catch (error) {
    console.error('Get universities error:', error);
    return res.status(500).json({
      success: false,
      error: 'server_error',
      message: 'Failed to retrieve universities'
    });
  }
});

// Root
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 LMS API Running - Simple Backend',
    credentials: TEST_CREDENTIALS
  });
});

// Start server
const PORT = 5002; // Force port 5002
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📍 API: http://localhost:${PORT}`);
  console.log(`📍 Frontend: http://localhost:5174`);
  console.log('\n📋 Ready for testing!');
});

module.exports = app;
