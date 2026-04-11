import path from "path";
import crypto from "crypto";
import fs from "fs/promises";
import { pipelineQueue } from "../queue/pipelineQueue.js";
import { pool } from "../config/db.js";
import { sanitizeFilename } from "../utils/fileUtils.js";

export const uploadDataset = async (req, res) => {
  try {
    const totalElapsed = () => Date.now() - req.uploadStartTime;
    const stepElapsed = () => {
      const now = Date.now();
      const elapsed = now - (req.lastStepTime || req.uploadStartTime);
      req.lastStepTime = now;
      return elapsed;
    };

    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded. Use key 'dataset'." });
    }

    const userEmail = req.user?.email || "default_user";
    const datasetId = crypto.randomUUID();
    const sanitizedName = sanitizeFilename(req.file.originalname);
    const finalFileName = `${datasetId}_${sanitizedName}`;
    
    // Path to central storage in project root
    const centralStorageDir = path.resolve(process.cwd(), "..", "uploads", "raw");
    const finalDestPath = path.join(centralStorageDir, finalFileName);
    
    console.log(`[UPLOAD] userEmail: ${userEmail}, datasetId: ${datasetId}, finalName: ${finalFileName}`);

    // Move file to central storage
    try {
      await fs.mkdir(centralStorageDir, { recursive: true });
      await fs.rename(req.file.path, finalDestPath);
      console.log(`[FILE] Moved ${req.file.path} -> ${finalDestPath}`);
    } catch (moveErr) {
      console.error("[FILE-MOVE] Error:", moveErr.message);
      // If rename fails (different device/partition), try copy + unlink
      try {
        await fs.copyFile(req.file.path, finalDestPath);
        await fs.unlink(req.file.path);
        console.log(`[FILE-FALLBACK] Copied and unlinked ${req.file.path} -> ${finalDestPath}`);
      } catch (copyErr) {
        throw new Error(`Failed to store uploaded file: ${copyErr.message}`);
      }
    }

    // Database insertion
    try {
      const userResult = await pool.query("SELECT user_id, company_id FROM users WHERE email = $1", [userEmail]);
      const uploadedBy = userResult.rows[0]?.user_id || null;
      let companyId = userResult.rows[0]?.company_id || null;
      
      if (!companyId) {
        const c = await pool.query("SELECT company_id FROM companies ORDER BY created_at ASC LIMIT 1");
        companyId = c.rows[0]?.company_id;
      }
      
      if (!companyId) throw new Error("No company in database environment");

      await pool.query(
        `INSERT INTO datasets (dataset_id, company_id, uploaded_by, dataset_name, file_name, file_size, upload_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          datasetId,
          companyId,
          uploadedBy,
          req.file.originalname,
          finalFileName,
          req.file.size || null,
          "processing",
        ]
      );
      
      console.log(`[DB] Dataset record created with ID: ${datasetId}`);
    } catch (dbErr) {
      console.error("[DB-INSERT] Error:", dbErr.message);
      return res.status(500).json({ success: false, message: "Database failure during upload registration" });
    }

    // Trigger ML Pipeline in background (Detached)
    // We wrap this in a self-executing async function to NOT block the response
    (async () => {
      console.log(`🚀 Queuing ML Pipeline Background for: ${datasetId}`);
      try {
        // Use BullMQ if available
        await pipelineQueue.add("processDataset", {
          datasetId,
          datasetPath: finalDestPath,
          userId: userEmail
        });
        console.log(`✅ Job added to BullMQ Queue`);
      } catch (queueErr) {
        console.warn("⚠️ Queue connection failed. Falling back to native spawn detatched:", queueErr.message);
        
        // Native Fallback
        const { spawn } = await import("child_process");
        const pythonScript = path.resolve(process.cwd(), '../ml_engine/run_pipeline.py');
        const mlCwd = path.resolve(process.cwd(), '../ml_engine');
        
        const mlProcess = spawn('python', [
            `"${pythonScript}"`,
            '--dataset_path', `"${finalDestPath}"`,
            '--dataset_id', datasetId,
            '--user_id', userEmail
        ], { cwd: mlCwd, shell: true, detached: true, stdio: 'ignore' });
        
        mlProcess.unref(); // Detach the child process
      }
    })().catch(err => console.error("Background pipeline trigger failed:", err));

    // Return response immediately
    return res.status(200).json({
      success: true,
      datasetId: datasetId,
      originalName: req.file.originalname,
      fileName: finalFileName,
      size: req.file.size,
      message: "Dataset upload successful. Processing started in background.",
      metrics: req.metrics
    });

  } catch (error) {
    console.error("❌ UPLOAD ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Upload failed" });
  }
};
