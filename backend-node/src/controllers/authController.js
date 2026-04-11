import jwt from "jsonwebtoken";
import { pool } from "../config/db.js";
import { logEmployeeLogin } from "./activityController.js";

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

function generateInitials(fullName) {
  if (!fullName) return "??";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return fullName.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = ["#c84b2f", "#1d4ed8", "#2d6a4f", "#b45309", "#7c3aed", "#0891b2", "#dc2626", "#059669"];

function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SIGNUP — Admin-only internal operation
//  companyId must be provided (from admin's JWT)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const signup = async (req, res) => {
  const { fullName, companyName, email, password, role, department, designation } = req.body;

  if (!fullName) return res.status(400).json({ message: "Full Name is required" });
  if (!companyName) return res.status(400).json({ message: "Company Name is required" });
  if (!email) return res.status(400).json({ message: "Email is required" });
  if (!password || password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

  try {
    // Check if user already exists
    const existing = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "A user with this email already exists" });
    }

    // Validate company exists by name
    const companyResult = await pool.query("SELECT company_id FROM companies WHERE company_name = $1", [companyName]);
    if (companyResult.rows.length === 0) {
      return res.status(400).json({ message: "Company does not exist in our records." });
    }
    const companyId = companyResult.rows[0].company_id;

    // Check if there are any existing admins for this company
    const adminResult = await pool.query("SELECT * FROM users WHERE company_id = $1 AND role = 'admin'", [companyId]);
    
    const resolvedName = fullName.trim();
    const resolvedRole = role || "employee";
    
    // Auto-activate ONLY if this is the very first admin for this company. Otherwise, inactive by default.
    let isActive = false;
    if (resolvedRole === "admin" && adminResult.rows.length === 0) {
       isActive = true;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const newUser = await pool.query(
      `INSERT INTO users (company_id, full_name, email, password_hash, role, department, designation, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING user_id, full_name`,
      [companyId, resolvedName, email, passwordHash, resolvedRole, department || null, designation || null, isActive]
    );

    const userId = newUser.rows[0].user_id;

    // Log the signup into activity_logs
    await pool.query(
      `INSERT INTO activity_logs (company_id, user_id, activity_type, activity_description, module_name, status, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [companyId, userId, "SIGNUP", `New user ${resolvedName} signed up as ${resolvedRole}. ${!isActive ? 'Activation requested.' : 'Auto-activated.'}`, "AUTH", "ok"]
    );

    res.json({
      message: isActive ? "Admin account created and auto-activated successfully." : "Account created successfully. Pending admin approval."
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LOGIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const login = async (req, res) => {
  const { email, password, role } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });
  if (!password) return res.status(400).json({ message: "Password is required" });

  try {
    const result = await pool.query(
      `SELECT user_id, company_id, full_name, email, password_hash, role, is_active
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = result.rows[0];

    // Verify password
    if (user.password_hash) {
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
    }

    // Check active status
    if (!user.is_active) {
      return res.status(403).json({
        message: "Account is pending approval or inactive. Please contact an administrator.",
        pending: true,
      });
    }

    // If admin login requested but user is not admin
    if (role === "admin" && user.role !== "admin") {
      return res.status(403).json({ message: "This account is not authorized for admin access" });
    }

    // Update last_login
    await pool.query("UPDATE users SET last_login = NOW() WHERE user_id = $1", [user.user_id]);

    const token = jwt.sign(
      { email, role: user.role, userId: user.user_id, companyId: user.company_id },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "1d" }
    );

    await logEmployeeLogin(user.user_id, user.full_name, user.email);

    res.json({
      token,
      role: user.role,
      name: user.full_name,
      email,
      userId: user.user_id,
      companyId: user.company_id,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GET ALL USERS (Admin)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const getAllUsers = async (req, res) => {
  const { role: roleFilter } = req.query;
  try {
    let query = `
      SELECT user_id, company_id, full_name, email, role, department, designation, is_active, created_at
      FROM users
    `;
    const params = [];

    if (roleFilter && roleFilter !== "all") {
      query += ` WHERE role = $1`;
      params.push(roleFilter);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);
    res.json({ success: true, users: formatUsers(result.rows), count: result.rows.length });
  } catch (err) {
    console.error("getAllUsers error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

function formatUsers(rows) {
  return rows.map(u => ({
    ...u,
    initials: generateInitials(u.full_name || u.email),
    color: AVATAR_COLORS[Math.abs(hashCode(u.email)) % AVATAR_COLORS.length],
  }));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  UPDATE USER ROLE (Admin)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const updateUserRole = async (req, res) => {
  const { email } = req.params;
  const { role } = req.body;

  const validRoles = ["admin", "employee"];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ success: false, message: `Invalid role. Must be one of: ${validRoles.join(", ")}` });
  }

  try {
    const result = await pool.query(
      "UPDATE users SET role = $1 WHERE email = $2 RETURNING user_id",
      [role, email]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: "User not found" });

    res.json({ success: true, message: `Role updated to ${role}` });
  } catch (err) {
    console.error("updateUserRole error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  UPDATE USER STATUS (Admin)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const updateUserStatus = async (req, res) => {
  const { email } = req.params;
  const { status } = req.body;

  const validStatuses = ["active", "inactive"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
  }

  try {
    const result = await pool.query(
      "UPDATE users SET is_active = $1 WHERE email = $2 RETURNING user_id",
      [status === "active", email]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: "User not found" });

    res.json({ success: true, message: `Status updated to ${status}` });
  } catch (err) {
    console.error("updateUserStatus error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DELETE USER (Admin)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const deleteUser = async (req, res) => {
  const { email } = req.params;
  try {
    const result = await pool.query("DELETE FROM users WHERE email = $1 RETURNING user_id", [email]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    console.error("deleteUser error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  USER STATS (Admin Dashboard)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const getUserStats = async (req, res) => {
  try {
    const total    = await pool.query("SELECT COUNT(*)::int AS count FROM users");
    const active   = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE is_active = true");
    const inactive = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE is_active = false");
    const byRole   = await pool.query("SELECT role, COUNT(*)::int AS count FROM users GROUP BY role");

    res.json({
      success: true,
      stats: {
        total:    total.rows[0].count,
        active:   active.rows[0].count,
        inactive: inactive.rows[0].count,
        byRole:   Object.fromEntries(byRole.rows.map(r => [r.role, r.count])),
      },
    });
  } catch (err) {
    console.error("getUserStats error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GET ME (Token-based identity)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const getMe = async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    const result = await pool.query(
      `SELECT user_id, company_id, full_name, email, role, department, designation, is_active, created_at
       FROM users WHERE email = $1`,
      [decoded.email]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "User not found" });

    const user = result.rows[0];
    res.json({
      success: true,
      user: {
        ...user,
        initials: generateInitials(user.full_name || user.email),
      },
    });
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  GET PENDING USERS (Admin — approval queue)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const getPendingUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT user_id, company_id, full_name, email, role, department, designation, is_active, created_at
      FROM users
      WHERE is_active = false
      ORDER BY created_at DESC
    `);
    res.json({
      success: true,
      users: formatUsers(result.rows).map(u => ({ ...u, status: "pending" })),
      count: result.rows.length,
    });
  } catch (err) {
    console.error("getPendingUsers error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  APPROVE USER (Admin — activate or reject)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const approveUser = async (req, res) => {
  const { email } = req.params;
  const { approved } = req.body;

  try {
    const user = await pool.query("SELECT user_id FROM users WHERE email = $1", [email]);
    if (user.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (approved) {
      await pool.query("UPDATE users SET is_active = true WHERE email = $1", [email]);
      res.json({ success: true, message: "User approved and activated" });
    } else {
      await pool.query("DELETE FROM users WHERE email = $1", [email]);
      res.json({ success: true, message: "User registration rejected and removed" });
    }
  } catch (err) {
    console.error("approveUser error:", err);
    res.status(500).json({ message: "Server error" });
  }
};