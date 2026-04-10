import path from "path";
import fs from "fs/promises";

const parseCSV = (csvText) => {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return { headers: [], rows: [] };

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    values.push(current.trim());
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = values[idx] !== undefined ? values[idx] : "";
    });
    return obj;
  });
  return { headers, rows };
};

const detectColumnType = (rows, col) => {
  let numCount = 0;
  let dateCount = 0;
  const sample = Math.min(rows.length, 200);
  for (let i = 0; i < sample; i++) {
    const val = rows[i][col];
    if (val === "" || val === undefined || val === null) continue;
    if (!isNaN(parseFloat(val)) && isFinite(val)) numCount++;
    else if (!isNaN(Date.parse(val)) && /\d{4}[-/]\d{2}[-/]\d{2}/.test(val)) dateCount++;
  }
  const threshold = sample * 0.6;
  if (numCount > threshold) return "numeric";
  if (dateCount > threshold) return "date";
  return "categorical";
};

export const getCleanedData = async (req, res) => {
  try {
    const datasetId = req.params.id;
    const userId = req.user?.email;
    console.log(`[CLEANED-DATA] datasetId=${datasetId}, userId=${userId}`);
    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    if (!datasetId) {
      return res.status(400).json({ success: false, message: "Dataset ID required" });
    }

    // Try multiple paths to find the dataset files
    const possiblePaths = [
      path.resolve(process.cwd(), "..", "ml_engine", "data", "users", userId, datasetId),
      path.resolve(process.cwd(), "..", "ml_engine", "data", "users", "tharunmellacheruvu@gmail.com", datasetId),
      path.resolve(process.cwd(), "..", "ml_engine", "data", "users", "demo@example.com", datasetId),
    ];
    
    let datasetDir = null;
    let cleanedPath = null;
    
    for (const p of possiblePaths) {
      const cp = path.join(p, "cleaned_data.csv");
      try {
        await fs.access(cp);
        datasetDir = p;
        cleanedPath = cp;
        break;
      } catch {}
    }

    if (!cleanedPath) {
      return res.status(404).json({
        success: false,
        message: "Cleaned data not found. Ensure the dataset has been processed.",
      });
    }
    
    console.log(`[CLEANED-DATA] Found cleaned data at: ${cleanedPath}`);

    let csvText;
    try {
      csvText = await fs.readFile(cleanedPath, "utf-8");
      console.log(`[CLEANED-DATA] Found cleaned data file, size: ${csvText.length} bytes`);
    } catch (err) {
      console.log(`[CLEANED-DATA] File read error: ${err.message}`);
      return res.status(404).json({
        success: false,
        message: "Cleaned data not found. Ensure the dataset has been processed.",
      });
    }

    const { headers, rows } = parseCSV(csvText);

    if (headers.length === 0) {
      return res.status(400).json({ success: false, message: "Empty CSV file" });
    }

    // Detect column types
    const columnTypes = {};
    const columnStats = {};
    headers.forEach((col) => {
      const type = detectColumnType(rows, col);
      columnTypes[col] = type;

      if (type === "numeric") {
        const vals = rows
          .map((r) => parseFloat(r[col]))
          .filter((v) => !isNaN(v));
        vals.sort((a, b) => a - b);
        columnStats[col] = {
          min: vals.length ? vals[0] : 0,
          max: vals.length ? vals[vals.length - 1] : 0,
          mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
          count: vals.length,
        };
      } else {
        const uniqueVals = [...new Set(rows.map((r) => r[col]).filter((v) => v !== ""))];
        columnStats[col] = {
          uniqueCount: uniqueVals.length,
          values: uniqueVals.slice(0, 50),
        };
      }
    });

    // Apply filters from query params
    let filteredRows = [...rows];
    const filters = req.query.filters ? JSON.parse(req.query.filters) : {};

    Object.entries(filters).forEach(([col, filterVal]) => {
      if (!headers.includes(col)) return;
      const type = columnTypes[col];

      if (type === "categorical" || type === "date") {
        if (Array.isArray(filterVal) && filterVal.length > 0) {
          const set = new Set(filterVal.map(String));
          filteredRows = filteredRows.filter((r) => set.has(String(r[col])));
        }
      } else if (type === "numeric") {
        if (filterVal.min !== undefined) {
          filteredRows = filteredRows.filter(
            (r) => parseFloat(r[col]) >= parseFloat(filterVal.min)
          );
        }
        if (filterVal.max !== undefined) {
          filteredRows = filteredRows.filter(
            (r) => parseFloat(r[col]) <= parseFloat(filterVal.max)
          );
        }
      }
    });

    // Apply search
    if (req.query.search) {
      const searchLower = req.query.search.toLowerCase();
      filteredRows = filteredRows.filter((r) =>
        headers.some((h) => String(r[h]).toLowerCase().includes(searchLower))
      );
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 500;
    const totalRows = filteredRows.length;
    const paginatedRows = filteredRows.slice((page - 1) * limit, page * limit);

    // Load schema for enriched metadata
    let schema = {};
    try {
      const schemaPath = path.join(datasetDir, "schema.json");
      const schemaData = await fs.readFile(schemaPath, "utf-8");
      schema = JSON.parse(schemaData);
    } catch {}

    // Load KPI summary
    let kpis = {};
    try {
      const kpiPath = path.join(datasetDir, "kpi_summary.json");
      const kpiData = await fs.readFile(kpiPath, "utf-8");
      kpis = JSON.parse(kpiData);
    } catch {}

    return res.json({
      success: true,
      headers,
      columnTypes,
      columnStats,
      schema,
      kpis,
      rows: paginatedRows,
      totalRows,
      page,
      limit,
      totalPages: Math.ceil(totalRows / limit),
    });
  } catch (err) {
    console.error("CLEANED DATA ERROR:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getOriginalData = async (req, res) => {
  try {
    const datasetId = req.params.id;
    const userId = req.user?.email;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    if (!datasetId) {
      return res.status(400).json({ success: false, message: "Dataset ID required" });
    }

    const possiblePaths = [
      path.resolve(process.cwd(), "..", "ml_engine", "data", "users", userId, datasetId),
      path.resolve(process.cwd(), "..", "ml_engine", "data", "users", "tharunmellacheruvu@gmail.com", datasetId),
      path.resolve(process.cwd(), "..", "ml_engine", "data", "users", "demo@example.com", datasetId),
    ];
    
    let datasetDir = null;
    let originalPath = null;
    
    for (const p of possiblePaths) {
      const op = path.join(p, "raw_data.csv");
      try {
        await fs.access(op);
        datasetDir = p;
        originalPath = op;
        break;
      } catch {}
    }

    if (!originalPath) {
      return res.status(404).json({
        success: false,
        message: "Original data not found. Ensure the dataset has been processed.",
      });
    }

    const { headers, rows } = parseCSV(csvText);

    if (headers.length === 0) {
      return res.status(400).json({ success: false, message: "Empty CSV file" });
    }

    const columnTypes = {};
    headers.forEach((col) => {
      columnTypes[col] = detectColumnType(rows, col);
    });

    let filteredRows = [...rows];
    const filters = req.query.filters ? JSON.parse(req.query.filters) : {};

    Object.entries(filters).forEach(([col, filterVal]) => {
      if (!headers.includes(col)) return;
      const type = columnTypes[col];

      if (type === "categorical" || type === "date") {
        if (Array.isArray(filterVal) && filterVal.length > 0) {
          const set = new Set(filterVal.map(String));
          filteredRows = filteredRows.filter((r) => set.has(String(r[col])));
        }
      } else if (type === "numeric") {
        if (filterVal.min !== undefined) {
          filteredRows = filteredRows.filter(
            (r) => parseFloat(r[col]) >= parseFloat(filterVal.min)
          );
        }
        if (filterVal.max !== undefined) {
          filteredRows = filteredRows.filter(
            (r) => parseFloat(r[col]) <= parseFloat(filterVal.max)
          );
        }
      }
    });

    if (req.query.search) {
      const searchLower = req.query.search.toLowerCase();
      filteredRows = filteredRows.filter((r) =>
        headers.some((h) => String(r[h]).toLowerCase().includes(searchLower))
      );
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 500;
    const totalRows = filteredRows.length;
    const paginatedRows = filteredRows.slice((page - 1) * limit, page * limit);

    return res.json({
      success: true,
      headers,
      columnTypes,
      rows: paginatedRows,
      totalRows,
      page,
      limit,
      totalPages: Math.ceil(totalRows / limit),
    });
  } catch (err) {
    console.error("ORIGINAL DATA ERROR:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
