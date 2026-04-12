# Dataset Insight Chatbot

A privacy-first chatbot that answers questions about your data.

## How it works

```
User question (natural language)
        ↓
Schema extractor — col names, types, stats only. ZERO raw rows sent to any LLM.
        ↓
LLM (Ollama local  OR  Claude API)
generates a pandas query string
        ↓
Sandbox executor (RestrictedPython)
blocks: os · sys · open · exec · eval · subprocess · socket · requests
        ↓
Query runs on real DataFrame on your server
        ↓
LLM converts result → natural language answer
        ↓
Answer shown to user
```

Your raw data **never** leaves your server — not even to Claude.

---

## Project structure

```
dataset-insight-chatbot/
├── backend/
│   ├── main.py            ← FastAPI app (all pipeline logic)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   └── index.html         ← Single-file UI (HTML + CSS + JS)
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Quick start (without Docker)

### 1. Install Python dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Set environment variables

```bash
cp .env.example .env
# Edit .env — add your ANTHROPIC_API_KEY if you want Claude mode
```

### 3. Start Ollama (for local mode)

```bash
ollama serve              # in a separate terminal
ollama pull llama3        # first time only
```

If running on Linux, allow CORS from the browser:
```bash
OLLAMA_ORIGINS="*" ollama serve
```

### 4. Start the backend

```bash
cd backend
uvicorn main:app --reload --port 8000
```

### 5. Open the frontend

```bash
# From project root
python -m http.server 3000 --directory frontend
# Then visit: http://localhost:3000
```

Or just open `frontend/index.html` directly in your browser.

---

## Quick start (with Docker)

```bash
cp .env.example .env          # add your API key
docker-compose up --build
```

- Frontend → http://localhost:3000
- Backend API → http://localhost:8000
- API docs → http://localhost:8000/docs

---

## Environment variables

| Variable           | Default                          | Description                   |
|--------------------|----------------------------------|-------------------------------|
| `ANTHROPIC_API_KEY`| *(required for Claude mode)*     | Your Claude API key           |
| `OLLAMA_URL`       | `http://localhost:11434`         | Ollama server URL             |
| `OLLAMA_MODEL`     | `llama3`                         | Ollama model to use           |

---

## Supported file types

| Format | Extension       |
|--------|----------------|
| CSV    | `.csv`, `.txt` |
| TSV    | `.tsv`         |
| JSON   | `.json`        |
| Excel  | `.xlsx`, `.xls`|

---

## API endpoints

| Method | Path                    | Description                           |
|--------|-------------------------|---------------------------------------|
| POST   | `/upload`               | Upload dataset → returns schema only  |
| POST   | `/query`                | Run pipeline → returns NL answer      |
| GET    | `/datasets`             | List all loaded datasets              |
| DELETE | `/dataset/{id}`         | Remove a dataset from memory          |
| GET    | `/health`               | Health check                          |
| GET    | `/docs`                 | Swagger UI (auto-generated)           |

### POST /upload

```json
// Response
{
  "dataset_id": "sales.csv",
  "schema": {
    "row_count": 5000,
    "columns": {
      "revenue": {
        "type": "numeric",
        "min": 100, "max": 95000, "mean": 4820.5, ...
      },
      "region": {
        "type": "categorical",
        "unique_count": 4,
        "top_values": ["North", "South", "East", "West"]
      }
    }
  }
}
```

### POST /query

```json
// Request
{
  "dataset_id": "sales.csv",
  "question": "Which region has the highest average revenue?",
  "model": "ollama"   // or "claude"
}

// Response
{
  "answer": "The North region has the highest average revenue at $6,240.",
  "code":   "result = df.groupby('region')['revenue'].mean().idxmax()",
  "result": "North"
}
```

---

## Sandbox security

The `safe_execute()` function uses **RestrictedPython** to prevent malicious code:

**Blocked at static check (regex, before compilation):**
- `import os`, `import sys`, `import subprocess`
- `open()`, `exec()`, `eval()`, `compile()`
- `__import__`, `getattr`, `setattr`
- `socket`, `requests`, `httpx`, `urllib`, `shutil`, `pathlib`

**Blocked at runtime (RestrictedPython):**
- Any access to `__class__`, `__bases__`, `__subclasses__`
- File I/O, network access, process spawning

**Allowed inside sandbox:**
- `df` (the pandas DataFrame)
- `pd` (pandas)
- `np` (numpy)
- Basic Python builtins: `len`, `range`, `list`, `dict`, `str`, `int`, `float`, `bool`, `abs`, `round`, `min`, `max`, `sum`, `sorted`, `enumerate`, `zip`, `map`, `filter`, `isinstance`

---

## Extending

**Add auth:** Use FastAPI's `Depends` to protect `/query` with a JWT or API key.

**Persistent storage:** Replace the `_datasets` dict with Redis or a database.

**Multiple users:** Add a `user_id` field to `QueryRequest` and key datasets by `f"{user_id}:{filename}"`.

**Streaming responses:** Use `StreamingResponse` and stream tokens from the LLM back to the browser via Server-Sent Events.

**More models:** Add an `elif model == "openai"` branch in `call_llm()` using the OpenAI SDK.
