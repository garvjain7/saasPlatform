import express from "express";
import {
  getAllDatasets,
  getDatasetById,
  getDatasetStatus,
  updateDatasetStatus,
  cleanDataset,
  trainDataset,
  getAnalysis,
  getMetrics,
  getDashboardConfig,
  deleteDataset,
  getAllDatasetsAdmin,
} from "../controllers/datasetController.js";
import { protect } from "../middleware/protect.js";
import { logCleaningActivity } from "../controllers/activityController.js";
import { pool } from "../config/db.js";

const router = express.Router();

/* =====================================================
   DATASET MANAGEMENT
   All routes require authentication
 ===================================================== */

// Get all datasets
router.get("/datasets", protect, getAllDatasets);

// Get all datasets (admin - no company filter)
router.get("/datasets-admin", protect, getAllDatasetsAdmin);

// Get dataset by ID
router.get("/datasets/:id", protect, getDatasetById);

// Get dataset status
router.get("/dataset-status/:id", protect, getDatasetStatus);

// Update dataset status (admin / debug)
router.patch("/datasets/:id/status", protect, updateDatasetStatus);

// Delete dataset
router.delete("/datasets/:id", protect, deleteDataset);

/* =====================================================
   ML PIPELINE AUTOMATION
===================================================== */

// Clean dataset (Python script)
router.post("/datasets/:id/clean", protect, async (req, res) => {
  const datasetId = req.params.id;
  const userId = req.user?.id || req.user?.email;
  const userEmail = req.user?.email;
  
  if (userId && datasetId) {
    try {
      let datasetName = datasetId;
      const dsResult = await pool.query(`SELECT dataset_name FROM datasets WHERE dataset_id = $1::uuid`, [
        datasetId,
      ]);
      if (dsResult.rows.length > 0) {
        datasetName = dsResult.rows[0].dataset_name || datasetName;
      }
      
      const userName = userEmail?.split('@')[0] || 'Unknown';
      let detail = req.body?.detail || 'Data cleaning initiated';
      await logCleaningActivity(userId, userName, userEmail, datasetId, datasetName, 'completed', detail);
    } catch (e) {
      console.error("Error logging cleaning activity:", e);
    }
  }
  
  cleanDataset(req, res);
});

// Train ML model (Python script)
router.post("/datasets/:id/train", protect, trainDataset);

// Get data analysis report
router.get("/datasets/:id/analysis", protect, getAnalysis);

// Get trained model metrics
router.get("/datasets/:id/metrics", protect, getMetrics);

// Get dashboard configuration (charts, insights, KPIs)
router.get("/dashboard/:id", getDashboardConfig);

export default router;
