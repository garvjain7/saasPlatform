import express from "express";
import { askQuestion } from "../controllers/chatController.js";
import { queryLimiter } from "../middleware/rateLimiter.js";
import { protect } from "../middleware/protect.js";
import { logQueryActivity } from "../controllers/activityController.js";
import { pool } from "../config/db.js";

const router = express.Router();

    const wrapWithActivity = (handler) => {
  return async (req, res) => {
    const startTime = Date.now();
    const datasetId = req.body.datasetId;
    const userEmail = req.user?.email;  // Hoisted to outer scope
    
    try {
      // Use user_id for valid UUID in postgres, fallback cautiously
      const userId = req.user?.user_id || req.user?.userId;
      
      let userName = userEmail?.split('@')[0] || 'Unknown';
      let datasetName = datasetId;
      
      if (userId && datasetId) {
        try {
          const dsResult = await pool.query(
            "SELECT name, COALESCE(uploaded_by, $2) as uploaded_by FROM datasets WHERE dataset_id = $1 OR id::text = $1",
            [datasetId, userEmail]
          );
          if (dsResult.rows.length > 0) {
            datasetName = dsResult.rows[0].name || datasetName;
          }
        } catch (e) {}
        
        req.activityDatasetName = datasetName;
        req.activityUserName = userName;
      }
      
      req.activityStartTime = startTime;
      req.activityUserId = userId;
      req.activityUserEmail = userEmail;
      req.activityDatasetId = datasetId;
    } catch (err) {
      console.error("Activity logging error:", err);
    }
    
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      const duration = Math.round((Date.now() - startTime) / 1000);
      
      if (req.activityUserId && req.activityDatasetId) {
        logQueryActivity(
          req.activityUserId,
          req.activityUserName || userEmail?.split('@')[0],
          userEmail,
          req.activityDatasetId,
          req.activityDatasetName || datasetId,
          req.body.message || req.body.question || 'Query',
          data.success ? 'ok' : 'failed',
          duration
        ).catch(console.error);
      }
      
      return originalJson(data);
    };
    
    return handler(req, res);
  };
};

router.post("/chat", protect, queryLimiter, wrapWithActivity(askQuestion));
router.post("/query", protect, queryLimiter, wrapWithActivity(askQuestion));

export default router;
