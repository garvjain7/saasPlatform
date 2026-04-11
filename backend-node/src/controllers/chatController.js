import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ML engine base path (relative to backend-node/src/controllers)
const ML_ENGINE_DIR = path.resolve(__dirname, "../../../ml_engine");
const QUERY_SCRIPT  = path.join(ML_ENGINE_DIR, "pipeline", "query_engine.py");
const DATA_DIR      = path.join(ML_ENGINE_DIR, "data", "users");

const QUERY_TIMEOUT_MS = 30_000; // 30 second hard limit

export const askQuestion = async (req, res) => {
  const { message, question, datasetId, model } = req.body;
  const queryText = (message || question || "").trim();

  if (!queryText || !datasetId) {
    return res.status(400).json({
      success: false,
      message: "Both 'message' (or 'question') and 'datasetId' are required.",
    });
  }

  // Use email for path, fallback to demo email
  const userEmail = req.user?.email || "tharunmellacheruvu@gmail.com";
  
  // Try multiple paths to find the dataset
  const possibleDirs = [
    path.join(DATA_DIR, userEmail, datasetId),
    path.join(DATA_DIR, "tharunmellacheruvu@gmail.com", datasetId),
    path.join(DATA_DIR, "demo@example.com", datasetId),
  ];
  
  let datasetDir = null;
  for (const dir of possibleDirs) {
    try {
      const fs = await import('fs');
      if (fs.existsSync(dir)) {
        datasetDir = dir;
        break;
      }
    } catch {}
  }
  
  if (!datasetDir) {
    return res.json({
      success: true,
      source: "fallback",
      answer: "⚠️ Dataset not found. Please ensure the dataset was uploaded and processed successfully. Try selecting a different dataset from the dropdown.",
      intent: "error",
      confidence: 0,
    });
  }

  try {
    const payload = {
      dataset_id: datasetId,
      file_dir_path: datasetDir,
      question: queryText,
      model: model || "groq",
      role: req.user?.role || "viewer"
    };

    const response = await axios.post("http://127.0.0.1:8000/internal/query", payload, {
      timeout: QUERY_TIMEOUT_MS,
      headers: { "Content-Type": "application/json" }
    });

    const data = response.data;
    
    return res.json({
      success: true,
      source: "ml-engine",
      answer: data.answer || "I could not find an answer to your question.",
      code: data.code || null,
      intent: data.intent || "unknown",
      confidence: data.confidence ?? null,
    });
  } catch (error) {
    console.error("[ChatController] Error connecting to FastAPI query engine:", error.message);
    if (error.response) {
      console.error("[ChatController] FastAPI returned error array:", error.response.data);
    }
    return safeFallback("The query engine timed out or encountered an error. Is the FastAPI backend running?", res);
  }
};

const safeFallback = (reason, res) => {
  return res.json({
    success:    true,
    source:     "fallback",
    answer:     `⚠️ ${reason} Please verify your dataset was processed successfully, or rephrase your question.`,
    intent:     "error",
    confidence: 0,
  });
};
