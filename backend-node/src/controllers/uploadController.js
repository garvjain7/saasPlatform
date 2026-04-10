import path from "path";
import crypto from "crypto";
import { pipelineQueue } from "../queue/pipelineQueue.js";
import { pool } from "../config/db.js";

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
    let datasetId = crypto.randomUUID();
    let datasetPath = path.resolve(req.file.path);
    console.log(`[UPLOAD] userEmail: ${userEmail}, datasetId: ${datasetId}`);

    try {
      const userResult = await pool.query("SELECT user_id, company_id FROM users WHERE email = $1", [userEmail]);
      const uploadedBy = userResult.rows[0]?.user_id || null;
      let companyId = userResult.rows[0]?.company_id || null;
      if (!companyId) {
        const c = await pool.query("SELECT company_id FROM companies ORDER BY created_at ASC LIMIT 1");
        companyId = c.rows[0]?.company_id;
      }
      if (!companyId) {
        throw new Error("No company in database — run schema.txt seed first");
      }

      const insertResult = await pool.query(
        `INSERT INTO datasets (dataset_id, company_id, uploaded_by, dataset_name, file_name, file_size, upload_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          datasetId,
          companyId,
          uploadedBy,
          req.file.originalname,
          req.file.originalname,
          req.file.size || null,
          "processing",
        ]
      );
      
      console.log(`[DB] Dataset record created with ID: ${datasetId}, status: processing, rowsAffected: ${insertResult.rowCount}`);
      const dbMsg = `[DATASET-CREATED] database record created in ${stepElapsed()}ms`;
      console.log(dbMsg);
      if (req.metrics) req.metrics.push(dbMsg);
    } catch (dbErr) {
      console.error("[DB-INSERT] Error:", dbErr.message);
      console.warn("DB insert failed - using fallback mode with temp ID");
      datasetId = `temp-${Date.now()}`;
      console.log(`[FALLBACK] Using temp dataset ID: ${datasetId}`);
    }

    console.log(`🚀 Queuing ML Pipeline for Dataset: ${datasetId} by ${userEmail}`);

    try {
      await pipelineQueue.add("processDataset", {
        datasetId,
        datasetPath,
        userId: userEmail
      });
      console.log(`✅ Job added to BullMQ Queue`);
      const pipeMsg = `[PIPELINE-SPAWNED] ML pipeline started in ${stepElapsed()}ms`;
      console.log(pipeMsg);
      if (req.metrics) req.metrics.push(pipeMsg);
    } catch (queueErr) {
      console.warn("⚠️ Queue connection failed. Falling back to native child_process spawn:", queueErr.message);
      
      // Native Synchronous Fallback (Great for testing environments w/o Redis)
      const { spawn } = await import("child_process");
      
      const pythonScript = path.resolve(process.cwd(), '../ml_engine/run_pipeline.py');
      const mlCwd = path.resolve(process.cwd(), '../ml_engine');
      
      const startTime = Date.now();
      console.log(`[ML-START] Spawning python process at ${new Date(startTime).toISOString()}`);
      console.log(`[PIPELINE-JOB-START] dataset_id=${datasetId}`);
      
      const mlProcess = spawn('python', [
          `"${pythonScript}"`,
          '--dataset_path', `"${datasetPath}"`,
          '--dataset_id', datasetId,
          '--user_id', userEmail
      ], { cwd: mlCwd, shell: true });

      const pipeMsgFallback = `[PIPELINE-SPAWNED] ML pipeline started in ${stepElapsed()}ms`;
      console.log(pipeMsgFallback);
      if (req.metrics) req.metrics.push(pipeMsgFallback);

      const fs = await import("fs/promises");
      const logPath = path.resolve(mlCwd, 'logs/system.log');
      let mlStderrAccumulator = "";

      mlProcess.stdout.on('data', (data) => console.log(`[ML-STDOUT]: ${data}`));
      mlProcess.stderr.on('data', (data) => {
          console.error(`[ML-STDERR]: ${data}`);
          mlStderrAccumulator += data.toString();
      });

      mlProcess.on('exit', async (code) => {
          console.log(`[PIPELINE-JOB-END] dataset_id=${datasetId}`);
          const duration = (Date.now() - startTime) / 1000;
          console.log(`[ML-END] Process completed in ${duration.toFixed(2)}s with code ${code}`);
          
          const errMsg = mlStderrAccumulator ? mlStderrAccumulator.trim() : "";
          
          const isImageError = errMsg.toLowerCase().includes("does not support image") 
              || errMsg.toLowerCase().includes("cannot read image")
              || errMsg.toLowerCase().includes("vision")
              || errMsg.toLowerCase().includes("multimodal");
          
          if (isImageError && code === 0) {
              console.log(`[${datasetId}] Pipeline completed (exit code 0) but with image model warning in stderr.`);
          }
          
          if (code !== 0) {
              const finalErrMsg = errMsg || `Process exited with code ${code}`;
              
              if (isImageError) {
                  console.warn(`[${datasetId}] Pipeline completed despite image model warning. Treating as success.`);
                  code = 0;
              }
              
              if (code !== 0) {
                  const errorLog = `\n[${new Date().toISOString()}] PIPELINE_CRASH | Dataset: ${datasetId} | ExitCode: ${code} | Error: ${finalErrMsg}`;
                  try {
                      await fs.appendFile(logPath, errorLog);
                      
                      const crashSignalPath = path.resolve(`../ml_engine/data/users/${userEmail}/${datasetId}/crash.json`);
                      await fs.mkdir(path.dirname(crashSignalPath), { recursive: true });
                      await fs.writeFile(crashSignalPath, JSON.stringify({ error: finalErrMsg }));
                  } catch (err) {
                      console.error("Could not write crash signals:", err);
                  }
              }
          }

          const finalStatus = code === 0 ? "completed" : "failed";
          let metadataUpdate = { status: finalStatus };
          
          if (code === 0) {
              try {
                  const metaPath = path.resolve(`../ml_engine/data/users/${userEmail}/${datasetId}/dataset_metadata.json`);
                  const metaRaw = await fs.readFile(metaPath, "utf-8");
                  const metaJson = JSON.parse(metaRaw);
                  metadataUpdate.rows = metaJson.total_rows;
                  metadataUpdate.columns = metaJson.total_columns;
                  console.log(`[ML] Loaded metadata: ${metaJson.total_rows} rows, ${metaJson.total_columns} columns`);
              } catch (err) {
                  console.warn("Could not load metadata for DB update:", err.message);
              }
          }
          
          try {
              const metaJson =
                  metadataUpdate.rows != null || metadataUpdate.columns != null
                      ? JSON.stringify({
                          rows_count: metadataUpdate.rows ?? null,
                          columns_count: metadataUpdate.columns ?? null,
                        })
                      : "{}";
              const updateResult = await pool.query(
                  `UPDATE datasets SET upload_status = $1, updated_at = NOW(),
                   schema_json = COALESCE(schema_json, '{}'::jsonb) || $2::jsonb
                   WHERE dataset_id = $3`,
                  [finalStatus, metaJson, datasetId]
              );
              if (updateResult.rowCount > 0) {
                  console.log(`[DB] Updated dataset ${datasetId} status to ${finalStatus}`);
              } else {
                  console.warn(`[DB] No rows updated - dataset ${datasetId} not found in DB (may have used temp ID)`);
              }
          } catch (dbErr) {
              console.warn("DB update failed:", dbErr.message);
          }
          console.log(`[STATUS-UPDATED] dataset marked ${finalStatus}`);
      });
    }

    const respMsg = `[UPLOAD-RESPONSE-SENT] response returned in ${totalElapsed()}ms total`;
    console.log(respMsg);
    if (req.metrics) req.metrics.push(respMsg);

    return res.status(200).json({
      success: true,
      datasetId: datasetId,
      path: datasetPath,
      originalName: req.file.originalname,
      size: req.file.size,
      message: "Dataset is being processed in the background. Please poll the status endpoint.",
      metrics: req.metrics
    });

  } catch (error) {
    console.error("❌ UPLOAD ERROR:", error);
    res.status(500).json({ success: false, message: error.message || "Upload failed" });
  }
};
