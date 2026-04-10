import { pool } from "../config/db.js";

const createSessionsTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS user_sessions (
      session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      user_email VARCHAR(255),
      login_time TIMESTAMP DEFAULT NOW(),
      logout_time TIMESTAMP,
      total_duration_seconds INT DEFAULT 0,
      is_active BOOLEAN DEFAULT true
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_login_time ON user_sessions(login_time);
  `;

  try {
    await pool.query(query);
    console.log("✅ user_sessions table created successfully");
  } catch (error) {
    console.error("❌ Error creating user_sessions table:", error.message);
  }

  process.exit(0);
};

createSessionsTable();