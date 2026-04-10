import dotenv from "dotenv";
import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const { Pool, Client } = pg;

const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    database: "postgres",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
});

const runSchema = async () => {
    const client = await pool.connect();
    
    try {
        // Check if database exists
        const dbCheck = await client.query(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            [process.env.DB_NAME || "datainsights"]
        );
        
        if (dbCheck.rows.length === 0) {
            // Create database
            await client.query(`CREATE DATABASE ${process.env.DB_NAME || "datainsights"}`);
            console.log("✅ Database created");
        }
        
        // Connect to the target database
        const targetPool = new Pool({
            host: process.env.DB_HOST || "localhost",
            port: Number(process.env.DB_PORT) || 5432,
            database: process.env.DB_NAME || "datainsights",
            user: process.env.DB_USER || "postgres",
            password: process.env.DB_PASSWORD || "",
        });
        
        const targetClient = await targetPool.connect();
        
        // Run schema
        const schemaPath = path.join(process.cwd(), "src", "config", "schema.sql");
        const schema = fs.readFileSync(schemaPath, "utf8");
        await targetClient.query(schema);
        console.log("✅ Schema created successfully");
        
        // Check and add default company if not exists
        const companyCheck = await targetClient.query(
            "SELECT 1 FROM companies WHERE company_id = '00000000-0000-0000-0000-000000000001'"
        );
        if (companyCheck.rows.length === 0) {
            await targetClient.query(
                "INSERT INTO companies (company_id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Default Company')"
            );
            console.log("✅ Default company created");
        }
        
        // Check and add roles if not exists
        const roleCheck = await targetClient.query("SELECT COUNT(*) FROM roles");
        if (parseInt(roleCheck.rows[0].count) === 0) {
            await targetClient.query(`INSERT INTO roles (role_name) VALUES 
                ('admin'),
                ('analyst'),
                ('viewer'),
                ('employee')`);
            console.log("✅ Roles created");
        }
        
        // List tables
        const result = await targetClient.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        );
        console.log("Tables created:", result.rows.map(r => r.table_name).join(", "));
        
        targetClient.release();
        await targetPool.end();
        
        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
};

runSchema();