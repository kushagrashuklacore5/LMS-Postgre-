const db = require("../config/database-switch");
const bcrypt = require("bcryptjs");
const { isEmail } = require("../helpers/validators");
const {
  getSuperadminSubscription,
  checkUniversityQuota,
  checkUserQuotaPerUniversity,
  countUniversitiesForSuperadmin,
  countTotalUsersInUniversity,
  countUsersByRoleInUniversity,
  checkRoleQuotaInUniversity
} = require("../helpers/quotaHelper");

/* ================= CREATE UNIVERSITY + ADMIN ================= */
const createUniversityWithAdmin = async (req, res) => {
  try {
    let { 
      name, 
      address, 
      city, 
      country, 
      email, 
      phone, 
      universityName, 
      area, 
      adminName, 
      adminEmail 
    } = req.body;

    const resolvedUniversityName = (name || universityName || "").trim();
    const resolvedAdminEmail = (email || adminEmail || "").trim().toLowerCase();
    const resolvedArea = area || [address, city, country].filter(Boolean).join(", ") || city || "Main Campus";
    const resolvedAdminName = adminName || (resolvedUniversityName ? `${resolvedUniversityName} Admin` : "Institute Admin");

    if (!resolvedUniversityName) {
      return res.status(400).json({ message: "Institute name is required" });
    }

    if (!resolvedAdminEmail) {
      return res.status(400).json({ message: "Official email is required" });
    }

    if (!isEmail(resolvedAdminEmail)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }

    if (phone && !/^[0-9]{10}$/.test(String(phone).replace(/\D/g, ''))) {
      return res.status(400).json({ message: "Phone number must be exactly 10 digits" });
    }

    console.log('🏛️ Creating university with admin:', { 
      universityName: resolvedUniversityName, 
      area: resolvedArea,
      adminName: resolvedAdminName,
      adminEmail: resolvedAdminEmail,
      phone 
    });

    // Check if admin already exists
    const existingAdmin = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", [resolvedAdminEmail], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });

    if (existingAdmin) {
      return res.status(400).json({ message: `User with email ${resolvedAdminEmail} already exists` });
    }

    // 🔑 auto-generate password
    const rawPassword = require('../utils/passwordUtils').generatePassword(12);
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    // Create university first to get the ID
    const universityId = await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO universities (name, area, createdAt, updatedAt)
        VALUES (?, ?, utc_now_text(), utc_now_text())
      `, [resolvedUniversityName, resolvedArea], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });

    // Now create admin user WITH university_id
    const adminId = await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO users (name, email, password, role, isApproved, university_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, utc_now_text(), utc_now_text())
      `, [resolvedAdminName, resolvedAdminEmail, hashedPassword, "admin", 1, universityId], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });

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
        name: resolvedUniversityName,
        area: resolvedArea,
      },
      admin: {
        id: adminId,
        name: resolvedAdminName,
        email: resolvedAdminEmail,
      },
      generatedPassword: rawPassword, // 🔥 SHOW ONLY ONCE
    });

  } catch (error) {
    console.error("CREATE UNIVERSITY ERROR:", error);
    return res.status(500).json({ message: "Server error: " + (error.message || error) });
  }
};

/* ================= CREATE ANY USER ================= */
const createUser = async (req, res) => {
  try {
    let { name, email, password, role, universityId } = req.body;

    if (!name || !email || !password || !role || !universityId) {
      return res.status(400).json({ message: "All fields are required (including universityId)" });
    }

    if (!isEmail(email)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }

    // ✅ normalize email
    email = email.trim().toLowerCase();

    // Verify university exists
    const university = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM universities WHERE id = ?", [universityId], (err, uni) => {
        if (err) reject(err);
        else resolve(uni);
      });
    });

    if (!university) {
      return res.status(400).json({ message: "University not found" });
    }

    console.log('🔍 DEBUG: About to call getSuperadminSubscription');
    // Get subscription to check plan type
    const subscription = await getSuperadminSubscription(req, "superadmin-1");
    const activePlan = university.subscriptionPlan || subscription?.planType || 'professional';
    console.log('🔍 DEBUG: Effective Plan:', activePlan);
    
    // Check per-role quota
    const roleCount = await countUsersByRoleInUniversity(req, universityId, role);
    const roleQuotaCheck = checkRoleQuotaInUniversity(activePlan, role, roleCount);
    
    if (!roleQuotaCheck.allowed) {
      return res.status(400).json({
        message: roleQuotaCheck.message
      });
    }

    // Check if user already exists
    const existingUser = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", [email], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });

    if (existingUser) {
      return res.status(400).json({ message: `User with email ${email} already exists` });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user WITH university_id
    const userId = await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO users (name, email, password, role, isApproved, university_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, utc_now_text(), utc_now_text())
      `, [name, email, hashedPassword, role, 1, universityId], function(err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });

    return res.status(201).json({
      message: "User created successfully",
      user: {
        id: userId,
        name: name,
        email: email,
        role: role,
        universityId: universityId,
      },
    });

  } catch (error) {
    console.error("CREATE USER ERROR:", error);
    return res.status(500).json({ message: "Server error: " + (error.message || error) });
  }
};

/* ================= GET ALL UNIVERSITIES ================= */
const getAllUniversities = (req, res) => {
  try {
    db.all(`
      SELECT u.id, u.name, u.area, u.adminId, u.createdAt, u.updatedAt,
             us.name as admin_name, us.email as admin_email
      FROM universities u
      LEFT JOIN users us ON u.adminId = us.id
    `, [], (err, universities) => {
      if (err) {
        console.error("GET UNIVERSITIES ERROR:", err);
        return res.status(500).json({ message: "Server error: " + err.message });
      }

      // Format response
      const formatted = universities.map(uni => ({
        id: uni.id,
        name: uni.name,
        area: uni.area,
        createdAt: uni.createdAt,
        updatedAt: uni.updatedAt,
        admin: {
          id: uni.adminId,
          name: uni.admin_name,
          email: uni.admin_email
        }
      }));

      return res.status(200).json({
        success: true,
        data: formatted,
      });
    });
  } catch (error) {
    console.error("GET UNIVERSITIES ERROR:", error);
    return res.status(500).json({ message: "Server error: " + error.message });
  }
};

/* ================= GET ALL USERS ================= */
const getAllUsers = (req, res) => {
  try {
    db.all(`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.role, 
        u.isApproved, 
        u.university_id,
        un.name as university,
        u.created_at, 
        u.updated_at
      FROM users u
      LEFT JOIN universities un ON u.university_id = un.id
      ORDER BY u.created_at DESC
    `, [], (err, users) => {
      if (err) {
        console.error("GET USERS ERROR:", err);
        return res.status(500).json({ message: "Server error: " + err.message });
      }

      return res.status(200).json({
        success: true,
        data: users || [],
      });
    });
  } catch (error) {
    console.error("GET USERS ERROR:", error);
    return res.status(500).json({ message: "Server error: " + error.message });
  }
};

/* ================= UPDATE USER ================= */
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    let { name, email, role, isApproved, password, universityId } = req.body;

    if (!id) return res.status(400).json({ message: "User ID is required" });

    // Check if user exists
    const user = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const updatedName = name !== undefined ? name.trim() : user.name;
    const updatedEmail = email !== undefined ? email.trim().toLowerCase() : user.email;
    if (email !== undefined && !isEmail(updatedEmail)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }
    const updatedRole = role !== undefined ? role : user.role;
    const updatedApproved = isApproved !== undefined ? (isApproved ? 1 : 0) : user.isApproved;
    const updatedUniId = universityId !== undefined ? universityId : user.university_id;

    let updateQuery = `
      UPDATE users 
      SET name = ?, email = ?, role = ?, isApproved = ?, university_id = ?, updated_at = utc_now_text()
    `;
    let params = [updatedName, updatedEmail, updatedRole, updatedApproved, updatedUniId];

    if (password && password.trim()) {
      const hashedPassword = await bcrypt.hash(password.trim(), 10);
      updateQuery += `, password = ?`;
      params.push(hashedPassword);
    }

    updateQuery += ` WHERE id = ?`;
    params.push(id);

    await new Promise((resolve, reject) => {
      db.run(updateQuery, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
      user: {
        id,
        name: updatedName,
        email: updatedEmail,
        role: updatedRole,
        isApproved: updatedApproved,
        university_id: updatedUniId
      }
    });
  } catch (error) {
    console.error("UPDATE USER ERROR:", error);
    return res.status(500).json({ message: "Server error: " + (error.message || error) });
  }
};

/* ================= DELETE USER ================= */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: "User ID is required" });

    await new Promise((resolve, reject) => {
      db.run("DELETE FROM users WHERE id = ?", [id], function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });

    return res.status(200).json({
      success: true,
      message: "User deleted successfully"
    });
  } catch (error) {
    console.error("DELETE USER ERROR:", error);
    return res.status(500).json({ message: "Server error: " + (error.message || error) });
  }
};

/* ================= DELETE UNIVERSITY ================= */
const deleteUniversity = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ message: "University ID is required" });
    }

    // Check if university exists
    const university = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM universities WHERE id = ?", [id], (err, uni) => {
        if (err) reject(err);
        else resolve(uni);
      });
    });

    if (!university) {
      return res.status(404).json({ message: "University not found" });
    }

    // Delete all users associated with this university
    await new Promise((resolve, reject) => {
      db.run("DELETE FROM users WHERE university_id = ?", [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Delete the university
    await new Promise((resolve, reject) => {
      db.run("DELETE FROM universities WHERE id = ?", [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return res.status(200).json({
      success: true,
      message: "University and all associated users deleted successfully"
    });

  } catch (error) {
    console.error("DELETE UNIVERSITY ERROR:", error);
    return res.status(500).json({ message: "Server error: " + (error.message || error) });
  }
};

module.exports = {
  createUniversityWithAdmin,
  createUser,
  getAllUniversities,
  getAllUsers,
  updateUser,
  deleteUser,
  deleteUniversity,
};
