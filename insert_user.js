import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const DB_URL     = "postgresql://postgres:Garv%400035@localhost:5432/newdatainsights";
const COMPANY_ID = "a30f03c1-3378-4c49-8a9d-bdcecac1fcc3";

const pool = new Pool({ connectionString: DB_URL, ssl: false });

const password_hash = await bcrypt.hash("123", 12);

const { rows } = await pool.query(
  `INSERT INTO users (company_id, full_name, email, password_hash, role, department, designation, is_active)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
   RETURNING user_id, email, role`,
  [COMPANY_ID, "Shad Ali", "alishad846@gmail.com", password_hash, "admin", "Management", "System Admin", true]
);

console.log("Inserted:", rows[0]);
await pool.end();