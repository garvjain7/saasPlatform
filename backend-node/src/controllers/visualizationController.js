import Dataset from "../models/Dataset.js";
import path from "path";
import fs from "fs/promises";

export const getVisualization = async (req, res) => {
  try {
    const datasetId = req.params.id;
    if (!datasetId) return res.status(400).json({ success: false, message: "Dataset ID required" });

    const userId = req.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const possiblePaths = [
      path.resolve(process.cwd(), "..", "ml_engine", "data", "users", userId, datasetId, "dashboard_config.json"),
      path.resolve(process.cwd(), "..", "ml_engine", "data", "users", userId, `temp-${datasetId}`, "dashboard_config.json"),
      path.resolve(process.cwd(), "..", "ml_engine", "data", "users", userId, datasetId.replace(/^temp-/, ''), "dashboard_config.json"),
      path.resolve(process.cwd(), "..", "ml_engine", "data", "users", "tharunmellacheruvu@gmail.com", datasetId, "dashboard_config.json"),
      path.resolve(process.cwd(), "..", "ml_engine", "data", "users", "demo@example.com", datasetId, "dashboard_config.json"),
    ];
    
    let dashboardData = null;
    for (const dashboardPath of possiblePaths) {
      try {
        const data = await fs.readFile(dashboardPath, "utf-8");
        dashboardData = JSON.parse(data);
        console.log(`[VISUAL] Found at: ${dashboardPath}`);
        break;
      } catch {}
    }

    // Try to find any dataset folder for this user
    if (!dashboardData && userId) {
      try {
        const userDataDir = path.resolve(process.cwd(), "..", "ml_engine", "data", "users", userId);
        const entries = await fs.readdir(userDataDir);
        for (const entry of entries) {
          const checkPath = path.join(userDataDir, entry, "dashboard_config.json");
          try {
            const data = await fs.readFile(checkPath, "utf-8");
            dashboardData = JSON.parse(data);
            console.log(`[VISUAL] Found at: ${checkPath}`);
            break;
          } catch {}
        }
      } catch (err) {
        console.log(`[VISUAL] Could not read user directory: ${err.message}`);
      }
    }

    if (!dashboardData) {
      return res.status(404).json({
        success: false,
        message: "Dashboard configuration not yet generated or available",
      });
    }

    return res.json(dashboardData);

  } catch (err) {
    console.error("VISUAL CONTROLLER ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
