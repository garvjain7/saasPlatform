import express from "express";
import { getCleanedData, getOriginalData } from "../controllers/cleanedDataController.js";
import { protect } from "../middleware/protect.js";
import { logDatasetAccess, logCleaningActivity } from "../controllers/activityController.js";
import { pool } from "../config/db.js";

const router = express.Router();

router.get("/cleaned-data/:id", protect, async (req, res, next) => {
  const startTime = Date.now();
  const datasetId = req.params.id;
  
  try {
    const userId = req.user?.userId || req.user?.email;
    const userEmail = req.user?.email;
    
    let userName = userEmail?.split('@')[0] || 'Unknown';
    let datasetName = datasetId;
    
    if (userId && datasetId) {
      try {
        const dsResult = await pool.query(
          `SELECT d.name, COALESCE(u.email, $2) as uploaded_by 
           FROM datasets d 
           LEFT JOIN users u ON d.uploaded_by = u.user_id 
           WHERE d.dataset_id = $1 OR d.id::text = $1`,
          [datasetId, userEmail]
        );
        if (dsResult.rows.length > 0) {
          datasetName = dsResult.rows[0].name || datasetName;
          const uploadedBy = dsResult.rows[0].uploaded_by;
          userName = uploadedBy ? uploadedBy.split('@')[0] : userName;
        }
      } catch (e) {}
      
      await logDatasetAccess(userId, userName, userEmail, datasetId, datasetName, 'ok');
      
      await logCleaningActivity(userId, userName, userEmail, datasetId, datasetName, 'ok', 'Accessed cleaned data');
    }
    
    req.activityStartTime = startTime;
    next();
  } catch (err) {
    console.error("Activity logging error:", err);
    next();
  }
}, getCleanedData);

router.get("/original-data/:id", protect, getOriginalData);

export default router;
