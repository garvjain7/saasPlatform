import axios from "axios";

const RAG_SERVER_URL = process.env.RAG_SERVER_URL || "http://localhost:5001";
const RAG_TIMEOUT_MS = 300_000; // 5 min for LLM queries
const UPLOAD_TIMEOUT_MS = 120_000; // 2 min for file loading

const ragApi = axios.create({
  baseURL: RAG_SERVER_URL,
  timeout: RAG_TIMEOUT_MS,
});

// POST /api/rag/upload
export const ragUpload = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file provided" });
  }

  try {
    const formData = new FormData();
    const fs = await import("fs");
    const fileBuffer = fs.readFileSync(req.file.path);

    formData.append(
      "file",
      new Blob([fileBuffer]),
      req.file.originalname
    );

    const response = await ragApi.post("/api/rag/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: UPLOAD_TIMEOUT_MS,
    });

    return res.json(response.data);
  } catch (err) {
    console.error("[RAG Upload] Error:", err.message);
    if (err.code === "ECONNREFUSED") {
      return res.status(503).json({
        error: "RAG server not running. Start it with: python ml_engine/rag_server.py",
      });
    }
    return res.status(500).json({ error: err.message });
  }
};

// POST /api/rag/chat
export const ragChat = async (req, res) => {
  const { question, backend = "ollama" } = req.body;

  if (!question || !question.trim()) {
    return res.status(400).json({ error: "Question is required" });
  }

  try {
    const response = await ragApi.post("/api/rag/chat", {
      question: question.trim(),
      backend,
    });

    const answer = response.data.answer || "No answer generated.";
    
    if (answer.includes("AI temporarily unavailable") || answer.includes("does not support image") || answer.includes("Cannot read image")) {
      return res.json({
        success: true,
        source: "fallback",
        answer: "The AI model does not support image input. Please use a text-only model or switch to the query engine for dataset insights.",
        backend: "fallback",
      });
    }

    return res.json({
      success: true,
      source: "rag-engine",
      answer: answer,
      backend: response.data.backend || backend,
    });
  } catch (err) {
    console.error("[RAG Chat] Error:", err.message);

    if (err.code === "ECONNREFUSED") {
      return res.json({
        success: true,
        source: "fallback",
        answer:
          "The RAG server is not running. Start it with: python ml_engine/rag_server.py --port 5001",
        backend: "fallback",
      });
    }

    const errMsg =
      err.response?.data?.error || err.message || "Unknown error";
      
    if (errMsg.includes("does not support image") || errMsg.includes("Cannot read image")) {
      return res.json({
        success: true,
        source: "fallback",
        answer: "The selected AI model does not support image input. Please use a different model (e.g., mistral, llama3, phi3) or use the query engine for dataset insights.",
        backend: "fallback",
      });
    }
    
    return res.json({
      success: true,
      source: "fallback",
      answer: `RAG engine error: ${errMsg}. Ensure Ollama is running (ollama serve) and a text-capable model is installed.`,
      backend: "fallback",
    });
  }
};

// GET /api/rag/status
export const ragStatus = async (req, res) => {
  try {
    const response = await ragApi.get("/api/rag/status", { timeout: 5000 });
    return res.json(response.data);
  } catch (err) {
    return res.json({
      ollama: false,
      huggingface: false,
      dataset_loaded: false,
      server_running: false,
      error: err.code === "ECONNREFUSED" ? "RAG server not running" : err.message,
    });
  }
};

// GET /api/rag/models
export const ragModels = async (req, res) => {
  try {
    const response = await ragApi.get("/api/rag/models", { timeout: 5000 });
    return res.json(response.data);
  } catch (err) {
    return res.json({ models: [], error: err.message });
  }
};

// POST /api/rag/clear
export const ragClear = async (req, res) => {
  try {
    const response = await ragApi.post("/api/rag/clear", {}, { timeout: 5000 });
    return res.json(response.data);
  } catch (err) {
    return res.json({ status: "error", error: err.message });
  }
};
