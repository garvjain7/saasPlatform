import path from "path";
import { spawn } from "child_process";
import { pool } from "../config/db.js";
import { validateDatasetAccess, getDatasetPaths } from "../utils/accessUtils.js";
import fs from "fs/promises";

export const askQuestion = async (req, res) => {
  const { message, question, datasetId } = req.body;
  const queryText = (message || question || "").trim();
  const userEmail = req.user?.email;

  if (!queryText || !datasetId) {
    return res.status(400).json({ success: false, message: "Message and datasetId are required." });
  }

  try {
    const userRes = await pool.query("SELECT user_id, role FROM users WHERE email = $1", [userEmail]);
    const user = userRes.rows[0];
    if (!user) return res.status(401).json({ success: false, message: "User not found" });

    // 1. Permission Check
    if (!(await validateDatasetAccess(user.user_id, datasetId, user.role))) {
      return res.status(403).json({ success: false, message: "Forbidden: You do not have access to this dataset" });
    }

    const dsRes = await pool.query("SELECT file_name FROM datasets WHERE dataset_id = $1", [datasetId]);
    if (!dsRes.rows[0]) return res.status(404).json({ success: false, message: "Dataset not found" });

    const { file_name } = dsRes.rows[0];
    const paths = getDatasetPaths(datasetId, file_name);

    // 2. Resolve the best available CSV file (cleaned > working > raw)
    let csvFilePath = null;
    for (const candidate of [paths.cleaned, paths.working, paths.raw]) {
      try { await fs.access(candidate); csvFilePath = candidate; break; } catch {}
    }

    if (!csvFilePath) {
      return res.json({
        success: true,
        source: "fallback",
        answer: "⚠️ This dataset has not been finalized yet. Please complete the cleaning process first."
      });
    }

    // 3. Spawn Python Query Engine — pass explicit csv_file for correct data loading
    const pythonScript = path.resolve(process.cwd(), "..", "ml_engine", "pipeline", "query_engine.py");

    const pyProcess = spawn("python", [
      pythonScript,
      "--user_id",    userEmail,
      "--dataset_id", datasetId,
      "--question",   queryText,
      "--dataset_dir", path.dirname(csvFilePath),
      "--csv_file",   csvFilePath,   // ← explicit file path, no guessing
    ]);

    let stdout = "";
    let stderr = "";
    pyProcess.stdout.on("data", (data) => (stdout += data.toString()));
    pyProcess.stderr.on("data", (data) => (stderr += data.toString()));

    pyProcess.on("close", (code) => {
      if (stderr) console.warn(`[query_engine stderr]: ${stderr.slice(0, 500)}`);
      if (code !== 0) {
        console.error(`[query_engine] exited with code ${code}`);
        return res.json({ success: true, source: "fallback", answer: "The query engine encountered an error. Please try rephrasing your question." });
      }
      try {
        const result = JSON.parse(stdout.trim());
        return res.json({
          success: true,
          source: "ml-engine",
          answer: result.answer || "I couldn't find an answer.",
          intent: result.intent,
          confidence: result.confidence
        });
      } catch {
        // Raw text response (shouldn't happen, but handle gracefully)
        return res.json({ success: true, source: "ml-engine-raw", answer: stdout.trim() });
      }
    });

  } catch (err) {
    console.error("askQuestion error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
