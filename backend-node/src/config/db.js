import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
});

const connectDB = async () => {
    try {
        const client = await pool.connect();
        console.log("✅ PostgreSQL Connected");
        client.release();
    } catch (error) {
        console.error("❌ PostgreSQL Connection Error:", error.message);
        process.exit(1);
    }
};

export default connectDB;
export { pool };