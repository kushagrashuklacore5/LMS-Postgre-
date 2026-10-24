const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/database-switch");
const { 
  createUniversityWithAdmin,
  createUser,
  getAllUniversities,
  getAllUsers,
  updateUser,
  deleteUser,
  deleteUniversity
} = require("../controllers/superAdminController");

// Helper function to get database from request context or fallback to master
function getDatabaseFromRequest(req) {
  return req.tenant?.database || require('../config/database-switch');
}
const authMiddleware = require("../middleware/authMiddleware");

// Every route below the login is for the platform owner only. The session is
// verified by authMiddleware (signature, expiry, account still exists); this adds the role.
const requireSuperadmin = (req, res, next) => {
  if (req.user?.role !== "superadmin") {
    return res.status(403).json({ success: false, message: "Access denied" });
  }
  next();
};
const portalAuthMiddleware = [authMiddleware, requireSuperadmin];

// The refresh token travels in an httpOnly cookie; read it without a cookie-parser dependency.
const readCookie = (req, name) => {
  const pair = (req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
};

const { checkSchoolsQuota } = require("../middleware/quotaMiddleware");
const { rateLimiters } = require("../middleware/rateLimiter");

const router = express.Router();

// Superadmin login with rate limiting (50 requests per minute)
router.post("/login", rateLimiters.login, async (req, res) => {
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

    // Ensure JWT secrets are set
    if (!process.env.JWT_SECRET) {
      console.error('JWT_SECRET environment variable is not set');
      return res.status(500).json({
        success: false,
        error: "server_error",
        message: "Server configuration error."
      });
    }

    if (!process.env.JWT_REFRESH_SECRET) {
      console.error('JWT_REFRESH_SECRET environment variable is not set');
      return res.status(500).json({
        success: false,
        error: "server_error",
        message: "Server configuration error."
      });
    }

    // Database lookup - query master database for superadmin
    const query = "SELECT id, email, password_hash FROM superadmins WHERE email = ? AND status = 'active'";
    
    getDatabaseFromRequest(req).get(query, [email], async (err, user) => {
      if (err) {
        console.error("Database error during login:", err);
        return res.status(500).json({
          success: false,
          error: "server_error",
          message: "An unexpected error occurred. Please try again."
        });
      }

      if (!user) {
          return res.status(401).json({
          success: false,
          error: "invalid_credentials",
          message: "Incorrect email or password."
        });
      }

      // Password verification
      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      
      if (!passwordMatch) {
          return res.status(401).json({
          success: false,
          error: "invalid_credentials",
          message: "Incorrect email or password."
        });
      }

      // Token generation
      const accessExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
      const refreshExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';

      // Access token
      const accessToken = jwt.sign(
        {
          superadminId: user.id,
          email: user.email,
          role: 'superadmin',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + (15 * 60) // 15 minutes
        },
        process.env.JWT_SECRET,
        { algorithm: 'HS256' }
      );

      // Refresh token
      const refreshToken = jwt.sign(
        {
          superadminId: user.id,
          email: user.email,
          role: 'superadmin'
        },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: refreshExpiry }
      );

      // Set refresh token cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      console.log("Login successful for:", email, "Role: superadmin");

      return res.status(200).json({
        success: true,
        message: "Login successful.",
        data: {
          accessToken: accessToken,
          superadmin: {
            id: user.id,
            email: user.email,
            name: user.name || email.split('@')[0],
            role: 'superadmin'
          }
        }
      });
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

// Refresh token endpoint
router.post("/refresh-token", (req, res) => {
  try {
    // Get refresh token from cookie
    const refreshToken = readCookie(req, "refreshToken");
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: "refresh_failed",
        message: "Session expired. Please log in again."
      });
    }

    // Ensure JWT refresh secret is set
    if (!process.env.JWT_REFRESH_SECRET) {
      console.error('JWT_REFRESH_SECRET environment variable is not set');
      return res.status(500).json({
        success: false,
        error: "server_error",
        message: "Server configuration error."
      });
    }

    // Verify refresh token
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, { algorithms: ["HS256"] });
      
      // Generate new access token
      const accessToken = jwt.sign(
        {
          superadminId: decoded.superadminId,
          email: decoded.email,
          role: decoded.role,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + (15 * 60) // 15 minutes
        },
        process.env.JWT_SECRET,
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
      
      // Clear invalid cookie
      res.clearCookie('refreshToken');
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: "refresh_failed",
          message: "Session expired. Please log in again."
        });
      } else {
        return res.status(401).json({
          success: false,
          error: "refresh_failed",
          message: "Session expired. Please log in again."
        });
      }
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

// Create university with admin
router.post(
  "/create-university",
  portalAuthMiddleware,
  requireSuperadmin,
  createUniversityWithAdmin
);

// Create any user (admin, teacher, accountant, storekeeper, etc.)
router.post(
  "/create-user",
  portalAuthMiddleware,
  requireSuperadmin,
  createUser
);

// Get all universities
router.get(
  "/universities",
  portalAuthMiddleware,
  requireSuperadmin,
  getAllUniversities
);

// Get all users
router.get(
  "/users",
  portalAuthMiddleware,
  requireSuperadmin,
  getAllUsers
);

// Update user
router.put(
  "/users/:id",
  portalAuthMiddleware,
  requireSuperadmin,
  updateUser
);

// Delete user
router.delete(
  "/users/:id",
  portalAuthMiddleware,
  requireSuperadmin,
  deleteUser
);

// Delete university
router.delete(
  "/universities/:id",
  portalAuthMiddleware,
  requireSuperadmin,
  deleteUniversity
);

// ===== INTERNAL ADMIN PORTAL ROUTES =====

// Get all superadmins for internal portal
router.get("/internal/superadmins", portalAuthMiddleware, async (req, res) => {
  try {
    console.log("Internal superadmin API called");
    
    // Special handling for portal user - check if user exists and has valid token
    if (!req.user) {
      console.log("No user found in auth middleware");
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    
    // Allow portal@core5.co.in regardless of role in token
    // The database will confirm the actual role
    if (req.user.email !== "portal@core5.co.in") {
      console.log("Access denied for user:", req.user?.email);
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    console.log("Access granted to portal@core5.co.in");

    const query = `
      SELECT id, email, role, created_at, expires_at, status
      FROM users 
      WHERE role = 'superadmin'
      ORDER BY created_at DESC
    `;
    
    console.log("Executing query:", query);
    
    getDatabaseFromRequest(req).all(query, [], (err, rows) => {
      if (err) {
        console.error("Error fetching superadmins:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }
      
      console.log(`Found ${rows.length} superadmins in database`);
       
      // Add plain password for display (in production, you might not want to show this)
      const superadmins = rows.map(row => ({
        ...row,
        plainPassword: "Password hidden", // Hidden for security
        serverTime: new Date().toISOString() // Add server timestamp
      }));
       
      console.log("Sending response:", { success: true, data: superadmins });
      res.json({ success: true, data: superadmins });
    });
  } catch (error) {
    console.error("Internal server error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Create new superadmin with auto-generated password
router.post("/internal/create-superadmin", portalAuthMiddleware, async (req, res) => {
  try {
    console.log("Create superadmin endpoint called");
    
    // Special handling for portal user
    if (!req.user) {
      console.log("No user found in auth middleware");
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    
    // Allow portal@core5.co.in regardless of role in token
    if (req.user.email !== "portal@core5.co.in") {
      console.log("Access denied for user:", req.user?.email);
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { email } = req.body;
    console.log(" Email extracted:", email);

    // Validate inputs
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    // Set default subscription values (1 year)
    const subscriptionDuration = 365;
    const durationType = 'days';

    // Check if email already exists
    const checkQuery = "SELECT id FROM users WHERE email = ?";
    getDatabaseFromRequest(req).get(checkQuery, [email], async (err, existingUser) => {
      if (err) {
        console.error("Error checking existing user:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }

      if (existingUser) {
        return res.status(400).json({ success: false, message: "Email already exists" });
      }

      // Generate secure random password
      const generatedPassword = generateSecurePassword();
      const hashedPassword = await bcrypt.hash(generatedPassword, 10);

      // Calculate expiry date
      const now = new Date();
      const expiresAt = new Date(now);
      
      if (durationType === 'months') {
        expiresAt.setMonth(expiresAt.getMonth() + subscriptionDuration);
      } else {
        expiresAt.setDate(expiresAt.getDate() + subscriptionDuration);
      }

      // Generate unique database ID for this superadmin
      const databaseId = `superadmin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Insert new superadmin into main database
      const insertQuery = `
        INSERT INTO users (name, email, password, role, university_id)
          VALUES (?, ?, ?, ?, ?)
      `;
      
      const values = [
        email.split('@')[0], // Use email prefix as name
        email,
        hashedPassword,
        'superadmin',
        null // No university assignment initially
      ];

      getDatabaseFromRequest(req).run(insertQuery, values, function(err) {
        if (err) {
          console.error("Error creating superadmin:", err);
          return res.status(500).json({ success: false, message: "Database error" });
        }

        const newSuperadmin = {
          id: this.lastID,
          email,
          role: 'superadmin',
          name: email.split('@')[0],
          university_id: null,
          generatedPassword
        };

        console.log(`Superadmin ${email} created successfully with ID: ${this.lastID}`);

        res.json({
          success: true,
          message: "Superadmin created successfully",
          data: newSuperadmin
        });
      });
    });
  } catch (error) {
    console.error("Create superadmin error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Reset superadmin password
router.post("/internal/reset-password", portalAuthMiddleware, async (req, res) => {
  try {
    // Special handling for portal user
    if (!req.user) {
      console.log("No user found in auth middleware");
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    
    // Allow portal@core5.co.in regardless of role in token
    if (req.user.email !== "portal@core5.co.in") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { superadminId } = req.body;

    if (!superadminId) {
      return res.status(400).json({ success: false, message: "Superadmin ID is required" });
    }

    // Generate new password
    const newPassword = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    const updateQuery = "UPDATE users SET password = ? WHERE id = ? AND role = 'superadmin'";
    
    getDatabaseFromRequest(req).run(updateQuery, [hashedPassword, superadminId], function(err) {
      if (err) {
        console.error("Error resetting password:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ success: false, message: "Superadmin not found" });
      }

      res.json({
        success: true,
        message: "Password reset successfully",
        newPassword
      });
    });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete superadmin user (POST method as alternative)
router.post("/internal/delete-superadmin", portalAuthMiddleware, async (req, res) => {
  try {
    console.log("POST Delete superadmin endpoint called");
    
    // Special handling for portal user
    if (!req.user) {
      console.log("No user found in auth middleware");
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    
    // Allow portal@core5.co.in regardless of role in token
    if (req.user.email !== "portal@core5.co.in") {
      console.log("Access denied for user:", req.user?.email);
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { superadminId } = req.body;
    console.log("Superadmin ID to delete:", superadminId);

    if (!superadminId) {
      console.log("No superadmin ID provided");
      return res.status(400).json({ success: false, message: "Superadmin ID is required" });
    }

    // Delete superadmin from main database
    const deleteQuery = "DELETE FROM users WHERE id = ? AND role = 'superadmin'";
    console.log("Executing delete query:", deleteQuery);
    console.log("Query parameters:", [superadminId]);
    
    getDatabaseFromRequest(req).run(deleteQuery, [superadminId], function(err) {
      if (err) {
        console.error("Error deleting superadmin:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }

      console.log("Delete operation changes:", this.changes);
      
      if (this.changes === 0) {
        console.log("No superadmin found with ID:", superadminId);
        return res.status(404).json({ success: false, message: "Superadmin not found" });
      }

      console.log("Superadmin deleted successfully");
      res.json({
        success: true,
        message: "Superadmin deleted successfully"
      });
    });
  } catch (error) {
    console.error("Delete superadmin error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete superadmin user (DELETE method)
router.delete("/internal/delete-superadmin/:superadminId", portalAuthMiddleware, async (req, res) => {
  try {
    console.log("🗑️ Delete superadmin endpoint called");
    
    // Special handling for portal user
    if (!req.user) {
      console.log("No user found in auth middleware");
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    
    // Allow portal@core5.co.in regardless of role in token
    if (req.user.email !== "portal@core5.co.in") {
      console.log("❌ Access denied for user:", req.user?.email);
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { superadminId } = req.params;
    console.log("🎯 Superadmin ID to delete:", superadminId);

    if (!superadminId) {
      console.log("❌ No superadmin ID provided");
      return res.status(400).json({ success: false, message: "Superadmin ID is required" });
    }

    // Delete superadmin from database
    const deleteQuery = "DELETE FROM users WHERE id = ? AND role = 'superadmin'";
    console.log("📝 Executing delete query:", deleteQuery);
    console.log("🔢 Query parameters:", [superadminId]);
    
    getDatabaseFromRequest(req).run(deleteQuery, [superadminId], function(err) {
      if (err) {
        console.error("❌ Error deleting superadmin:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }

      console.log("📊 Delete operation changes:", this.changes);
      
      if (this.changes === 0) {
        console.log("❌ No superadmin found with ID:", superadminId);
        return res.status(404).json({ success: false, message: "Superadmin not found" });
      }

      console.log("✅ Superadmin deleted successfully");
      res.json({
        success: true,
        message: "Superadmin deleted successfully"
      });
    });
  } catch (error) {
    console.error("❌ Delete superadmin error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Disable superadmin user (keeping for backward compatibility)
router.post("/internal/disable-user", portalAuthMiddleware, async (req, res) => {
  try {
    // Special handling for portal user
    if (!req.user) {
      console.log("No user found in auth middleware");
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    
    // Allow portal@core5.co.in regardless of role in token
    if (req.user.email !== "portal@core5.co.in") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { superadminId } = req.body;

    if (!superadminId) {
      return res.status(400).json({ success: false, message: "Superadmin ID is required" });
    }

    // Update user status to disabled
    const updateQuery = "UPDATE users SET status = 'disabled' WHERE id = ? AND role = 'superadmin'";
    
    getDatabaseFromRequest(req).run(updateQuery, [superadminId], function(err) {
      if (err) {
        console.error("Error disabling user:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }

      if (this.changes === 0) {
        return res.status(404).json({ success: false, message: "Superadmin not found" });
      }

      res.json({
        success: true,
        message: "User disabled successfully"
      });
    });
  } catch (error) {
    console.error("Disable user error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Helper function to generate secure password (cryptographic randomness, shown to the portal admin once)
function generateSecurePassword() {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  let password = "";
  for (let i = 0; i < 16; i++) {
    password += charset[require("crypto").randomInt(charset.length)];
  }
  return password;
}


// Catch-all route for debugging
router.use("*", (req, res) => {
  console.log("Method:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("Path:", req.path);
  res.status(404).json({ success: false, message: "Route not found in superadmin routes" });
});

module.exports = router;

