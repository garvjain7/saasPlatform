import { pool } from "../config/db.js";
import path from "path";
import fs from "fs/promises";

/**
 * Validates if a user has access to a specific dataset.
 * @param {string} userId - UUID of the user.
 * @param {string} datasetId - UUID of the dataset.
 * @param {string} role - User role ('admin' or 'employee').
 * @returns {Promise<boolean>}
 */
export async function validateDatasetAccess(userId, datasetId, role) {
  if (role === 'admin') return true;

  try {
    const result = await pool.query(
      "SELECT can_view FROM permissions WHERE user_id = $1 AND dataset_id = $2 AND can_view = TRUE",
      [userId, datasetId]
    );
    return result.rows.length > 0;
  } catch (err) {
    console.error("[AccessUtils] Error checking permissions:", err.message);
    return false;
  }
}

/**
 * Returns standardized paths for dataset files.
 * @param {string} datasetId - UUID of the dataset.
 * @param {string} fileName - Original sanitized filename or generated unique name.
 */
export function getDatasetPaths(datasetId, fileName) {
  const rootDir = process.cwd();
  const uploadsDir = path.resolve(rootDir, "..", "uploads");
  
  return {
    raw: path.join(uploadsDir, "raw", fileName),
    working: path.join(uploadsDir, "raw", `working_${datasetId}.csv`),
    cleaned: path.join(uploadsDir, "cleaned", `cleaned_${datasetId}.csv`),
    artifacts: path.resolve(rootDir, "..", "ml_engine", "artifacts", datasetId)
  };
}

/**
 * Ensures a directory exists for artifacts.
 */
export async function ensureArtifactsDir(datasetId) {
  const { artifacts } = getDatasetPaths(datasetId);
  await fs.mkdir(artifacts, { recursive: true });
  return artifacts;
}
