const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const tenantDatabase = require("../middleware/tenant-db");
const { 
  createUniversityWithAdmin,
  createUser,
  getAllUniversities,
  getAllUsers,
  deleteUniversity
} = require("../controllers/superAdminController");
const authMiddleware = require("../middleware/authMiddleware");
const { checkSchoolsQuota } = require("../middleware/quotaMiddleware");
const { rateLimiters } = require("../middleware/rateLimiter");

const router = express.Router();

// Superadmin login with rate limiting (50 requests per minute)
router.post("/login", rateLimiters.login, (req, res) => {
  try {
    const { email, password } = req.body;

    // For demo, check against hardcoded superadmin credentials
    // In production, you'd have a superadmins table
    if (email === "superadmin@lms.com" && password === "admin123") {
      const token = jwt.sign(
        { 
          userId: "superadmin-1", 
          role: "superadmin", 
          email: email 
        },
        process.env.JWT_SECRET || "default_jwt_secret_key",
        { expiresIn: "24h" }
      );

      return res.json({
        success: true,
        token,
        superadmin: {
          id: "superadmin-1",
          email: email,
          name: "Super Admin"
        }
      });
    }

    res.status(401).json({ success: false, message: "Invalid credentials" });
  } catch (error) {
    console.error("Superadmin login error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get all clients (superadmin credentials)
router.get("/clients", authMiddleware, (req, res) => {
  try {
    // Only allow superadmin role
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // For demo, return hardcoded clients
    // In production, you'd query a superadmin_clients table
    const clients = [
      {
        id: 1,
        name: "Demo University",
        email: "admin@demo.com",
        password: "demo123",
        created_at: new Date().toISOString()
      }
    ];

    res.json({ success: true, clients });
  } catch (error) {
    console.error("Get clients error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Create new client credentials
router.post("/create-client", authMiddleware, (req, res) => {
  try {
    // Only allow superadmin role
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { name, email, password } = req.body;

    // Validate inputs
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // For demo, just return success
    // In production, you'd save to database
    console.log("Creating client:", { name, email, password });

    res.json({
      success: true,
      message: "Client credentials created successfully",
      client: {
        id: Date.now(),
        name,
        email,
        password,
        created_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Create client error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Create university with admin
router.post(
  "/create-university",
  authMiddleware,
  checkSchoolsQuota,
  createUniversityWithAdmin
);

// Create any user (admin, teacher, accountant, storekeeper, etc.)
router.post(
  "/create-user",
  authMiddleware,
  createUser
);

// Get all universities
router.get(
  "/universities",
  authMiddleware,
  getAllUniversities
);

// Get all users
router.get(
  "/users",
  authMiddleware,
  getAllUsers
);

// Delete university
router.delete(
  "/universities/:id",
  authMiddleware,
  deleteUniversity
);

// ===== INTERNAL ADMIN PORTAL ROUTES =====

// Test endpoint
router.get("/internal/test", (req, res) => {
  console.log("🧪 Test endpoint called");
  res.json({ success: true, message: "Internal portal API is working!" });
});

// Test delete endpoint
router.get("/internal/test-delete", (req, res) => {
  console.log("🧪 Test delete endpoint called");
  res.json({ success: true, message: "Delete endpoint test is working!" });
});

// Get all superadmins for internal portal
router.get("/internal/superadmins", authMiddleware, async (req, res) => {
  try {
    console.log("Internal superadmin API called");
    console.log("User from auth middleware:", req.user);
    
    // Only allow portal@core5.co.in (with role portal_admin or superadmin)
    if (!req.user || req.user.email !== "portal@core5.co.in") {
      console.log("Access denied for user:", req.user?.email);
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    console.log("Access granted to portal@core5.co.in");

    // Use the original database for listing all superadmins
    let db;
    try {
      db = const tenantConnectionManager = require('../config/tenant-connection-manager');
      console.log("Database connection established");
    } catch (dbError) {
      console.error("Failed to connect to database:", dbError);
      return res.status(500).json({ success: false, message: "Database connection failed" });
    }
    
    const query = `
      SELECT id, email, role, created_at, expires_at, status
      FROM users 
      WHERE role = 'superadmin' 
      ORDER BY created_at DESC
    `;
    
    console.log("Executing query:", query);
    
    if (!db || typeof db.all !== 'function') {
      console.error("Database object is invalid:", typeof db);
      return res.status(500).json({ success: false, message: "Invalid database connection" });
    }
    
    db.all(query, [], (err, rows) => {
      if (err) {
        console.error("Error fetching superadmins:", err);
        console.error("Error details:", err.message);
        return res.status(500).json({ success: false, message: "Database error: " + err.message });
      }
      
      console.log(`Found ${rows.length} superadmins in database`);
      
      // Add plain password for display (in production, you might not want to show this)
      const superadmins = rows.map(row => ({
        ...row,
        plainPassword: "", // Hidden for security
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
router.post("/internal/create-superadmin", authMiddleware, tenantDatabase, async (req, res) => {
  try {
    console.log("🔍 Create superadmin endpoint called");
    console.log("📋 Request body:", req.body);
    console.log("👤 User from auth middleware:", req.user);
    
    // Only allow portal@core5.co.in (with role portal_admin or superadmin)
    if (!req.user || req.user.email !== "portal@core5.co.in") {
      console.log("❌ Access denied for user:", req.user?.email);
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { email } = req.body;
    console.log("📧 Email extracted:", email);

    // Validate inputs
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    // Set default subscription values (1 year)
    const subscriptionDuration = 365;
    const durationType = 'days';

    // Wait for database to be ready
    const db = req.db;
    
    // Check if email already exists
    const checkQuery = "SELECT id FROM users WHERE email = ?";
    const existingUser = await db.get(checkQuery, [email]);
    if (!existingUser) {
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

      // Insert new superadmin
      const insertQuery = `
        INSERT INTO users (name, email, password, role, created_at, expires_at, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      const values = [
        email.split('@')[0], // Use email prefix as name
        email,
        hashedPassword,
        'superadmin',
        now.toISOString(),
        expiresAt.toISOString(),
        'active'
      ];

      const result = await db.run(insertQuery, values);
      if (result) {
        const newSuperadmin = {
          id: result.lastID,
          email,
          role: 'superadmin',
          created_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          status: 'active',
          generatedPassword,
          databaseId: result.lastID // Use new superadmin ID as database identifier
        };

        console.log(`\n\n=== Superadmin ${email} created with database ID: ${result.lastID} ===`);
        console.log(`\n\n=== Database isolation established ===`);

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
router.post("/internal/reset-password", authMiddleware, async (req, res) => {
  try {
    // Only allow portal@core5.co.in (with role portal_admin or superadmin)
    if (!req.user || req.user.email !== "portal@core5.co.in") {
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
    
    req.db.run(updateQuery, [hashedPassword, superadminId], function(err) {
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
router.post("/internal/delete-superadmin", authMiddleware, async (req, res) => {
  try {
    console.log("POST Delete superadmin endpoint called");
    console.log("User from auth middleware:", req.user);
    console.log("Request body:", req.body);
    
    // Only allow portal@core5.co.in (with role portal_admin or superadmin)
    if (!req.user || req.user.email !== "portal@core5.co.in") {
      console.log("Access denied for user:", req.user?.email);
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { superadminId } = req.body;
    console.log("Superadmin ID to delete:", superadminId);

    if (!superadminId) {
      console.log("No superadmin ID provided");
      return res.status(400).json({ success: false, message: "Superadmin ID is required" });
    }

    // Use the main database for internal admin portal operations
    const tenantConnectionManager = require('../config/tenant-connection-manager');
    const { deleteSuperadminDatabase } = require("../config/multi-tenant-db");



    // Delete superadmin from main database
    const deleteQuery = "DELETE FROM users WHERE id = ? AND role = 'superadmin'";
    console.log("Executing delete query:", deleteQuery);
    console.log("Query parameters:", [superadminId]);
    
    db.run(deleteQuery, [superadminId], function(err) {
      if (err) {
        console.error("Error deleting superadmin from main DB:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }

      console.log("Delete operation changes:", this.changes);
      
      if (this.changes === 0) {
        console.log("No superadmin found with ID:", superadminId);
        return res.status(404).json({ success: false, message: "Superadmin not found" });
      }

      // Also delete the tenant database file
      console.log("Deleting tenant database for superadmin:", superadminId);
      const dbDeleted = deleteSuperadminDatabase(superadminId);
      
      if (dbDeleted) {
        console.log("Tenant database deleted successfully");
      } else {
        console.log("Tenant database file not found or already deleted");
      }

      console.log("Superadmin and tenant database deleted successfully");
      res.json({
        success: true,
        message: "Superadmin and isolated database deleted successfully"
      });
    });
  } catch (error) {
    console.error("Delete superadmin error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete superadmin user (DELETE method)
router.delete("/internal/delete-superadmin/:superadminId", authMiddleware, async (req, res) => {
  try {
    console.log("🗑️ Delete superadmin endpoint called");
    console.log("👤 User from auth middleware:", req.user);
    console.log("📋 URL parameters:", req.params);
    
    // Only allow portal@core5.co.in (with role portal_admin or superadmin)
    if (!req.user || req.user.email !== "portal@core5.co.in") {
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
    
    req.db.run(deleteQuery, [superadminId], function(err) {
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
router.post("/internal/disable-user", authMiddleware, async (req, res) => {
  try {
    // Only allow portal@core5.co.in (with role portal_admin or superadmin)
    if (!req.user || req.user.email !== "portal@core5.co.in") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const { superadminId } = req.body;

    if (!superadminId) {
      return res.status(400).json({ success: false, message: "Superadmin ID is required" });
    }

    // Update user status to disabled
    const updateQuery = "UPDATE users SET status = 'disabled' WHERE id = ? AND role = 'superadmin'";
    
    req.db.run(updateQuery, [superadminId], function(err) {
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

// Helper function to generate secure password
function generateSecurePassword() {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < 10; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}


module.exports = router;
