import { pool } from "../config/db.js";

const createActivityLogsTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS activity_logs (
      log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      user_name VARCHAR(255),
      user_email VARCHAR(255),
      event_type VARCHAR(50) NOT NULL,
      event_description TEXT,
      dataset_id UUID,
      dataset_name VARCHAR(255),
      detail TEXT,
      status VARCHAR(20) DEFAULT 'ok',
      duration_seconds INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_event_type ON activity_logs(event_type);
  `;

  try {
    await pool.query(query);
    console.log("✅ activity_logs table created successfully");
  } catch (error) {
    console.error("❌ Error creating activity_logs table:", error.message);
  }

  process.exit(0);
};

createActivityLogsTable();