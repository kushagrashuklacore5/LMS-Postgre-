const bcrypt = require("bcryptjs");
const db = require("../config/database-switch");
const { signToken } = require("../config/jwt");
const { verifyPassword } = require("../utils/passwordUtils");

const dbGet = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const dbRun = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });

// One answer for "no such account" and "wrong password", so the login form
// cannot be used to find out which email addresses are registered.
const INVALID_CREDENTIALS = "Invalid email or password";

// Roles a person may ask for when registering themself. Staff with authority
// over other people's data (admin, accountant, ...) are created by an admin.
const SELF_REGISTRATION_ROLES = ["student", "mentor"];

/* ================= REGISTER ================= */
// Public self-registration is off unless the operator turns it on and names the
// school new accounts join (ALLOW_PUBLIC_REGISTRATION=true and
// PUBLIC_REGISTRATION_SCHOOL_ID=<id>). Every self-registered account starts
// unapproved and cannot sign in until an admin of that school approves it.
exports.register = async (req, res) => {
  try {
    const schoolId = process.env.PUBLIC_REGISTRATION_SCHOOL_ID;
    if (process.env.ALLOW_PUBLIC_REGISTRATION !== "true" || !/^\d+$/.test(String(schoolId))) {
      return res.status(403).json({
        message: "Self-registration is not available. Please ask your school administrator for an account.",
      });
    }

    const { name, password } = req.body || {};
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (!require("../helpers/validators").isEmail(email)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters long" });
    }

    // The requested role is honoured only for the two self-service roles
    const role = SELF_REGISTRATION_ROLES.includes(req.body.role) ? req.body.role : "student";

    const school = await dbGet("SELECT id FROM universities WHERE id = ?", [schoolId]);
    if (!school) {
      console.error("Register: PUBLIC_REGISTRATION_SCHOOL_ID does not match a school");
      return res.status(403).json({ message: "Self-registration is not available." });
    }

    const existing = await dbGet("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const created = await dbRun(
      "INSERT INTO users (name, email, password, role, isApproved, university_id) VALUES (?, ?, ?, ?, 0, ?)",
      [String(name).trim(), email, hashedPassword, role, school.id]
    );

    res.status(201).json({
      message: "Registered successfully. An administrator must approve your account before you can sign in.",
      user: { id: created.lastID, name: String(name).trim(), email, role, isApproved: false },
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= LOGIN ================= */
async function loginVendor(email, password, res) {
  let vendor;
  try {
    vendor = await dbGet("SELECT * FROM vendors WHERE email = ?", [email]);
  } catch (err) {
    vendor = null;
  }
  const check = vendor ? await verifyPassword(password, vendor.password) : { valid: false };
  if (!check.valid) {
    return res.status(401).json({ message: INVALID_CREDENTIALS });
  }

  // Vendors created by older code hold an unsalted SHA-256 digest: replace it now.
  if (check.needsUpgrade) {
    await dbRun("UPDATE vendors SET password = ? WHERE id = ?", [await bcrypt.hash(password, 10), vendor.id]);
  }

  const token = signToken({
    userId: vendor.id,
    role: "vendor",
    name: vendor.name,
    email: vendor.email,
    universityId: vendor.university_id ?? null,
  });

  return res.json({
    message: "Login successful",
    token,
    user: {
      id: vendor.id,
      name: vendor.name,
      email: vendor.email,
      role: "vendor",
      university_id: vendor.university_id ?? null,
    },
  });
}

exports.login = async (req, res) => {
  try {
    const { password } = req.body || {};
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";

    if (!email || typeof password !== "string" || password === "") {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await dbGet("SELECT * FROM users WHERE email = ?", [email]);
    if (!user) {
      return loginVendor(email, password, res);
    }

    const check = await verifyPassword(password, user.password);
    if (!check.valid) {
      return res.status(401).json({ message: INVALID_CREDENTIALS });
    }
    if (check.needsUpgrade) {
      await dbRun("UPDATE users SET password = ? WHERE id = ?", [await bcrypt.hash(password, 10), user.id]);
    }

    if (!user.isApproved) {
      return res.status(403).json({ message: "Your account is waiting for approval by an administrator." });
    }

    const token = signToken({
      userId: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      universityId: user.university_id ?? null,
      subscriptionPlan: user.subscriptionPlan || "free",
    });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isApproved: Boolean(user.isApproved),
        subscriptionPlan: user.subscriptionPlan || "free",
      },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

/* ================= LOGOUT ================= */
// Ends every session of this account that exists right now, on every device: tokens issued
// before this second are refused from here on. (Tokens are stateless, so this is the
// server-side way to make "sign out" real; a stolen token stops working too.)
exports.logout = async (req, res) => {
  try {
    if (req.user.userId != null && req.user.role !== "vendor") {
      await dbRun("UPDATE users SET sessions_valid_from = ? WHERE id = ?", [Math.floor(Date.now() / 1000) + 1, req.user.userId]);
    }
    res.json({ success: true, message: "Signed out" });
  } catch (err) {
    console.error("LOGOUT ERROR:", err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/* ================= GET CURRENT USER ================= */
exports.getMe = async (req, res) => {
  try {
    const user = await dbGet(
      `SELECT u.id, u.name, u.email, u.role, u.isApproved, u.university_id,
              uni.name as university_name, uni.area as university_area,
              CASE WHEN u.role = 'student' THEN s.studentId ELSE NULL END as studentId,
              CASE WHEN u.role = 'student' THEN s.grade ELSE NULL END as grade
       FROM users u
       LEFT JOIN students s ON u.id = s.userId
       LEFT JOIN universities uni ON u.university_id = uni.id
       WHERE u.id = ?`,
      [req.user.userId]
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (err) {
    console.error("GET ME ERROR:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};
