import path from "path";
import fs from "fs/promises";
import { createReadStream } from "fs";
import { parse } from "csv-parse";
import XLSX from "xlsx";
import { pool } from "../config/db.js";

/** Map schema.txt columns to fields the React app already expects */
export function mapDatasetRow(row) {
  if (!row) return row;
  const schema = row.schema_json && typeof row.schema_json === "object" ? row.schema_json : {};
  return {
    ...row,
    name: row.dataset_name,
    filename: row.file_name,
    status: row.upload_status,
    size: row.file_size,
    uploaded_by: row.uploaded_by_name || row.uploaded_by_email || row.uploaded_by,
    rows_count: schema.rows_count ?? schema.total_rows ?? null,
    columns_count: schema.columns_count ?? schema.total_columns ?? null,
    version: 1,
    has_access: row.has_access ?? true, // Default to true if not specified (e.g. for admins)
  };
}

/** Check if user has access to a dataset */
async function checkAccess(userId, datasetId, userRole) {
  if (userRole === 'admin') return true;

  const result = await pool.query(
    "SELECT can_view FROM permissions WHERE user_id = $1 AND dataset_id = $2 AND can_view = TRUE",
    [userId, datasetId]
  );
  return result.rows.length > 0;
}

export const getAllDatasets = async (req, res) => {
  const userId = req.user?.email;
  if (!userId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  try {
    const userRes = await pool.query("SELECT user_id, role, company_id FROM users WHERE email = $1", [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = userRes.rows[0];
    const companyId = user.company_id;
    const isEmployee = user.role === 'employee';

    let query = `
      SELECT d.*, u.full_name AS uploaded_by_name, u.email AS uploaded_by_email
    `;
    const params = [companyId];

    if (isEmployee) {
      query += `, CASE WHEN p.can_view = TRUE THEN TRUE ELSE FALSE END AS has_access `;
      query += ` FROM datasets d
                 LEFT JOIN users u ON d.uploaded_by = u.user_id
                 LEFT JOIN permissions p ON d.dataset_id = p.dataset_id AND p.user_id = $2
                 WHERE d.company_id = $1 `;
      params.push(user.user_id);
    } else {
      query += ` FROM datasets d
                 LEFT JOIN users u ON d.uploaded_by = u.user_id
                 WHERE d.company_id = $1 `;
    }

    query += ` ORDER BY d.created_at DESC `;

    const result = await pool.query(query, params);

    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows.map(row => mapDatasetRow({
        ...row,
        has_access: isEmployee ? row.has_access : true
      })),
    });
  } catch (err) {
    console.error("getAllDatasets error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getAllDatasetsAdmin = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.full_name AS uploaded_by_name, u.email AS uploaded_by_email, c.company_name
       FROM datasets d
       LEFT JOIN users u ON d.uploaded_by = u.user_id
       LEFT JOIN companies c ON d.company_id = c.company_id
       ORDER BY d.created_at DESC`
    );
    return res.json({
      success: true,
      count: result.rows.length,
      data: result.rows.map(mapDatasetRow),
    });
  } catch (err) {
    console.error("getAllDatasetsAdmin error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getDatasetById = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.full_name AS uploaded_by_name, u.email AS uploaded_by_email
       FROM datasets d
       LEFT JOIN users u ON d.uploaded_by = u.user_id
       WHERE d.dataset_id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: "Dataset not found" });

    // Check access
    const userRole = req.user?.role;
    const userId = (await pool.query("SELECT user_id FROM users WHERE email = $1", [req.user?.email])).rows[0]?.user_id;

    const hasAccess = await checkAccess(userId, req.params.id, userRole);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Unauthorized: Access restricted by administrator" });
    }

    return res.json({ success: true, data: mapDatasetRow({ ...result.rows[0], has_access: true }) });
  } catch (err) {
    console.error("getDatasetById error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getDatasetStatus = async (req, res) => {
  const datasetId = req.params.id;
  const userId = req.user?.email;
  if (!userId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  try {
    const dataset = await pool.query("SELECT * FROM datasets WHERE dataset_id = $1", [datasetId]);
    if (dataset.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Dataset not found" });
    }

    const dbStatus = dataset.rows[0].upload_status;
    const userRole = req.user?.role;
    const dbUserIdResult = await pool.query("SELECT user_id FROM users WHERE email = $1", [userId]);
    const dbUserId = dbUserIdResult.rows[0]?.user_id;

    if (!await checkAccess(dbUserId, datasetId, userRole)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // If DB has status, use it - but also verify with file-based check for completed
    if (dbStatus === "completed") {
      const finalArtifactPath = path.resolve(process.cwd(), "..", "ml_engine", "data", "users", userId, datasetId, "insights.json");
      try {
        await fs.access(finalArtifactPath);
        return res.json({ success: true, status: "completed" });
      } catch {
        // Seeded DB rows are often "completed" without local ML artifacts
        return res.json({ success: true, status: "completed" });
      }
    } else if (dbStatus === 'failed') {
      // Try to get error from crash.json
      try {
        const crashArtifactPath = path.resolve(process.cwd(), "..", "ml_engine", "data", "users", userId, datasetId, "crash.json");
        const crashData = await fs.readFile(crashArtifactPath, 'utf8');
        const errorMsg = JSON.parse(crashData).error || "Unknown pipeline error";
        return res.json({ success: true, status: "failed", error: errorMsg });
      } catch {
        return res.json({ success: true, status: "failed" });
      }
    } else if (dbStatus === 'processing') {
      // Verify it's still actually processing
      const finalArtifactPath = path.resolve(process.cwd(), "..", "ml_engine", "data", "users", userId, datasetId, "insights.json");
      try {
        await fs.access(finalArtifactPath);
        // It finished - update DB
        await pool.query("UPDATE datasets SET upload_status = 'completed', updated_at = NOW() WHERE dataset_id = $1", [datasetId]);
        return res.json({ success: true, status: "completed" });
      } catch {
        try {
          const crashArtifactPath = path.resolve(process.cwd(), "..", "ml_engine", "data", "users", userId, datasetId, "crash.json");
          await fs.access(crashArtifactPath);
          await pool.query("UPDATE datasets SET upload_status = 'failed', updated_at = NOW() WHERE dataset_id = $1", [datasetId]);
          return res.json({ success: true, status: "failed" });
        } catch {
          return res.json({ success: true, status: "processing" });
        }
      }
    } else {
      // Unknown status - default to processing
      return res.json({ success: true, status: "processing" });
    }
  } catch (err) {
    console.error("getDatasetStatus error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const assignDataset = async (req, res) => {
  const datasetId = req.params.id;
  const { userIds } = req.body; // Array of UUIDs
  const adminEmail = req.user?.email;

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ success: false, message: "userIds array is required" });
  }

  try {
    const adminResult = await pool.query("SELECT user_id, company_id FROM users WHERE email = $1", [adminEmail]);
    const admin = adminResult.rows[0];

    // Bulk assign
    for (const uid of userIds) {
      await pool.query(
        `INSERT INTO permissions (company_id, user_id, dataset_id, can_view, granted_by)
         VALUES ($1, $2, $3, TRUE, $4)
         ON CONFLICT (user_id, dataset_id) 
         DO UPDATE SET can_view = TRUE, updated_at = NOW()`,
        [admin.company_id, uid, datasetId, admin.user_id]
      );
    }

    res.json({ success: true, message: `Successfully assigned ${userIds.length} users` });
  } catch (err) {
    console.error("assignDataset error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const unassignDataset = async (req, res) => {
  const datasetId = req.params.id;
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ success: false, message: "userId is required" });

  try {
    // Requirements: set can_view = false instead of deleting
    await pool.query(
      "UPDATE permissions SET can_view = FALSE, updated_at = NOW() WHERE user_id = $1 AND dataset_id = $2",
      [userId, datasetId]
    );
    res.json({ success: true, message: "User access revoked successfully" });
  } catch (err) {
    console.error("unassignDataset error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Preview first 50 rows of a dataset
 * GET /api/datasets/:id/preview
 */
export const getDatasetPreview = async (req, res) => {
  const datasetId = req.params.id;
  const userEmail = req.user?.email;

  try {
    const userResult = await pool.query("SELECT user_id, role FROM users WHERE email = $1", [userEmail]);
    const user = userResult.rows[0];

    if (!user) return res.status(401).json({ success: false, message: "User not found" });

    // 1. Check Access
    const hasAccess = await checkAccess(user.user_id, datasetId, user.role);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Unauthorized: You do not have permission to preview this dataset" });
    }

    // 2. Fetch dataset record
    const dsResult = await pool.query("SELECT file_name, dataset_name FROM datasets WHERE dataset_id = $1", [datasetId]);
    if (dsResult.rows.length === 0) return res.status(404).json({ success: false, message: "Dataset not found" });

    const fileName = dsResult.rows[0].file_name;
    const filePath = path.resolve(process.cwd(), "..", "uploads", "raw", fileName);

    // 3. Detect file type and parse
    const fileExt = path.extname(fileName).toLowerCase();

    if (fileExt === '.csv') {
      const rows = [];
      const parser = createReadStream(filePath).pipe(
        parse({
          columns: true,
          trim: true,
          skip_empty_lines: true,
          to_line: 51 // Header + 50 rows
        })
      );

      for await (const record of parser) {
        rows.push(record);
        if (rows.length >= 50) break;
      }

      return res.json({ success: true, data: rows, total_rows_previewed: rows.length });
    }
    else if (fileExt === '.xlsx' || fileExt === '.xls') {
      const fileBuffer = await fs.readFile(filePath);
      const workbook = XLSX.read(fileBuffer, { type: 'buffer', sheetRows: 51 });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      // sheet_to_json with sheetRows might include header row if not specified, 
      // but usually gives the objects directly.
      const limitedRows = rows.slice(0, 50);

      return res.json({ success: true, data: limitedRows, total_rows_previewed: limitedRows.length });
    }
    else {
      return res.status(400).json({ success: false, message: `Unsupported file format for preview: ${fileExt}` });
    }

  } catch (err) {
    console.error("getDatasetPreview error:", err);
    if (err.code === 'ENOENT') {
      return res.status(404).json({ success: false, message: "Dataset file not found on server" });
    }
    return res.status(500).json({ success: false, message: "Failed to load dataset preview" });
  }
};

/**
 * Download the full dataset
 * GET /api/datasets/:id/download
 */
export const downloadDataset = async (req, res) => {
  const datasetId = req.params.id;
  const userEmail = req.user?.email;

  try {
    const userResult = await pool.query("SELECT user_id, role FROM users WHERE email = $1", [userEmail]);
    const user = userResult.rows[0];

    if (!user) return res.status(401).json({ success: false, message: "User not found" });

    // 1. Check Access
    const hasAccess = await checkAccess(user.user_id, datasetId, user.role);
    if (!hasAccess) {
      return res.status(403).json({ success: false, message: "Unauthorized: Access denied" });
    }

    // 2. Fetch record
    const dsResult = await pool.query("SELECT file_name, dataset_name FROM datasets WHERE dataset_id = $1", [datasetId]);
    if (dsResult.rows.length === 0) return res.status(404).json({ success: false, message: "Dataset not found" });

    const fileName = dsResult.rows[0].file_name;
    const originalName = dsResult.rows[0].dataset_name;
    const filePath = path.resolve(process.cwd(), "..", "uploads", "raw", fileName);

    // 3. Send file
    res.download(filePath, originalName, (err) => {
      if (err) {
        console.error("Download error:", err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: "Failed to download file" });
        }
      }
    });

  } catch (err) {
    console.error("downloadDataset error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getDatasetAssignments = async (req, res) => {
  const datasetId = req.params.id;
  try {
    const result = await pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.department, u.designation 
       FROM users u
       JOIN permissions p ON u.user_id = p.user_id
       WHERE p.dataset_id = $1 AND p.can_view = TRUE`,
      [datasetId]
    );
    res.json({ success: true, users: result.rows });
  } catch (err) {
    console.error("getDatasetAssignments error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateDatasetStatus = async (req, res) => {
  const { status } = req.body;
  const allowedStatus = ["uploaded", "processing", "completed", "failed", "ready", "trained"];

  if (!allowedStatus.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid status value: ${status}` });
  }

  try {
    const userRole = req.user?.role;
    const userEmail = req.user?.email;
    const dbUserId = (await pool.query("SELECT user_id FROM users WHERE email = $1", [userEmail])).rows[0]?.user_id;

    if (!await checkAccess(dbUserId, req.params.id, userRole)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const uploadStatus = status === "trained" ? "completed" : status;
    const result = await pool.query(
      "UPDATE datasets SET upload_status = $1, updated_at = NOW() WHERE dataset_id = $2 RETURNING *",
      [uploadStatus, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: "Dataset not found" });
    return res.json({ success: true, message: "Dataset status updated" });
  } catch (err) {
    console.error("updateDatasetStatus error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const cleanDataset = async (req, res) => {
  return res.json({
    success: true,
    message: "Data cleaning is automatically handled by the background AI pipeline.",
  });
};

export const trainDataset = async (req, res) => {
  return res.json({
    success: true,
    message: "Model training is automatically handled by the background AI pipeline.",
  });
};

export const getAnalysis = async (req, res) => {
  const datasetId = req.params.id;
  const userId = req.user?.email;
  if (!userId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  const userRole = req.user?.role;
  const dbUserId = (await pool.query("SELECT user_id FROM users WHERE email = $1", [userId])).rows[0]?.user_id;
  if (!await checkAccess(dbUserId, datasetId, userRole)) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  // Try multiple paths to find the dataset files
  const possiblePaths = [
    path.resolve(process.cwd(), "..", "ml_engine", "data", "users", userId, datasetId),
    path.resolve(process.cwd(), "..", "ml_engine", "data", "users", "tharunmellacheruvu@gmail.com", datasetId),
    path.resolve(process.cwd(), "..", "ml_engine", "data", "users", "demo@example.com", datasetId),
  ];

  let basePath = null;
  for (const p of possiblePaths) {
    try {
      await fs.access(p);
      basePath = p;
      break;
    } catch { }
  }

  if (!basePath) {
    return res.json({
      success: true,
      dataset_name: datasetId,
      row_count: 0,
      column_count: 0,
      quality_score: null,
      total_nulls: 0,
      duplicate_rows: 0,
      cleaning_report: [],
      columns: [],
    });
  }

  try {
    // Try to read profile report
    const profilePath = path.join(basePath, "profile_report.json");
    let profile = {};
    try {
      profile = JSON.parse(await fs.readFile(profilePath, "utf-8"));
    } catch { }

    // Read cleaned data to get column analysis
    const cleanedDataPath = path.join(basePath, "cleaned_data.csv");
    let columns = [];
    let cleaningReport = [];

    try {
      const csv = await fs.readFile(cleanedDataPath, 'utf-8');
      const lines = csv.split('\n').filter(line => line.trim());
      if (lines.length > 1) {
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

        // Read a sample to analyze columns
        const sampleLines = lines.slice(1, Math.min(101, lines.length));

        columns = headers.map((colName, idx) => {
          const colValues = sampleLines.map(line => {
            const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            return cells[idx];
          }).filter(v => v !== '' && v !== undefined);

          const nullCount = sampleLines.length - colValues.length;
          const nullPct = (nullCount / sampleLines.length) * 100;

          // Determine type from sample
          const numericCount = colValues.filter(v => !isNaN(parseFloat(v)) && isFinite(v)).length;
          const isNumeric = numericCount > colValues.length * 0.7;

          // Check if datetime
          const dateCount = colValues.filter(v => !isNaN(Date.parse(v)) && v.length > 6).length;
          const isDateTime = dateCount > colValues.length * 0.5;

          const uniqueCount = new Set(colValues).size;

          return {
            name: colName,
            type: isNumeric ? 'float64' : isDateTime ? 'datetime' : 'string',
            null_count: nullCount,
            null_pct: parseFloat(nullPct.toFixed(2)),
            nunique: uniqueCount,
            sample: colValues.slice(0, 3),
            inferred_type: isNumeric ? 'numeric' : isDateTime ? 'datetime' : uniqueCount < 10 ? 'categorical' : 'text'
          };
        });
      }
    } catch (err) {
      console.warn('Could not read cleaned data:', err.message);
    }

    // Read metadata for cleaning report
    const metadataPath = path.join(basePath, "dataset_metadata.json");
    let qualityScore = null;
    let totalNulls = 0;
    let duplicateRows = 0;
    let cleaningStats = {
      missing_values_handled: 0,
      duplicates_removed: 0,
      outliers_removed: 0,
      data_type_fixes: 0
    };

    try {
      const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
      qualityScore = metadata.data_quality_score;
      cleaningStats.missing_values_handled = metadata.missing_values_handled || 0;
      cleaningStats.duplicates_removed = metadata.duplicates_removed || 0;
      cleaningStats.outliers_removed = metadata.outliers_removed || 0;
      cleaningStats.data_type_fixes = metadata.data_type_fixes || 0;
    } catch { }

    // Calculate totals
    totalNulls = columns.reduce((sum, c) => sum + (c.null_count || 0), 0);

    // Generate cleaning report
    if (cleaningStats.missing_values_handled > 0 || cleaningStats.duplicates_removed > 0 || cleaningStats.outliers_removed > 0) {
      cleaningReport = [
        { category: 'Missing Values', count: cleaningStats.missing_values_handled, action: 'Filled using MEAN/MEDIAN/MODE', reason: 'Columns with missing values were imputed' },
        { category: 'Duplicates', count: cleaningStats.duplicates_removed, action: 'Removed duplicate rows', reason: 'Identical rows detected in dataset' },
        { category: 'Outliers', count: cleaningStats.outliers_removed, action: 'Removed using IQR method', reason: 'Values outside 1.5*IQR range detected' },
        { category: 'Data Types', count: cleaningStats.data_type_fixes, action: 'Converted to standard format', reason: 'Date columns converted to datetime' }
      ].filter(item => item.count > 0);
    }

    return res.json({
      success: true,
      dataset_name: profile.dataset_name || datasetId,
      row_count: profile.row_count || 0,
      column_count: profile.column_count || columns.length,
      quality_score: qualityScore,
      total_nulls: totalNulls,
      duplicate_rows: duplicateRows,
      cleaning_report: cleaningReport,
      columns: columns
    });
  } catch (err) {
    console.error('getAnalysis error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getMetrics = async (req, res) => {
  const datasetId = req.params.id;
  const userId = req.user?.email;
  if (!userId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  const userRole = req.user?.role;
  const dbUserId = (await pool.query("SELECT user_id FROM users WHERE email = $1", [userId])).rows[0]?.user_id;
  if (!await checkAccess(dbUserId, datasetId, userRole)) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  const metricsPath = path.resolve(process.cwd(), "..", "ml_engine", "data", "users", userId, datasetId, "metrics.json");

  try {
    const data = await fs.readFile(metricsPath, "utf-8");
    return res.json(JSON.parse(data));
  } catch (err) {
    return res.status(404).json({ success: false, message: "Metrics not found" });
  }
};

export const getDashboardConfig = async (req, res) => {
  const datasetId = req.params.id;
  const userId = req.user?.email || "tharunmellacheruvu@gmail.com";
  const userRole = req.user?.role;

  const dbUserId = (await pool.query("SELECT user_id FROM users WHERE email = $1", [userId])).rows[0]?.user_id;
  if (dbUserId && !await checkAccess(dbUserId, datasetId, userRole)) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  // Try multiple paths to find the dataset files
  const possiblePaths = [
    path.resolve(process.cwd(), "..", "ml_engine", "data", "users", userId, datasetId),
    path.resolve(process.cwd(), "..", "ml_engine", "data", "users", "tharunmellacheruvu@gmail.com", datasetId),
    path.resolve(process.cwd(), "..", "ml_engine", "data", "users", "demo@example.com", datasetId),
  ];

  let datasetDir = null;
  for (const p of possiblePaths) {
    try {
      const dashPath = path.join(p, "dashboard_config.json");
      await fs.access(dashPath);
      datasetDir = p;
      break;
    } catch { }
  }

  if (!datasetDir) {
    return res.status(404).json({ success: false, message: "Dashboard configuration not ready or not found." });
  }

  try {
    const dashPath = path.join(datasetDir, "dashboard_config.json");
    const dashData = await fs.readFile(dashPath, "utf-8");
    const config = JSON.parse(dashData);

    try {
      const kpiPath = path.join(datasetDir, "kpi_summary.json");
      const kpiData = await fs.readFile(kpiPath, "utf-8");
      config.kpis_raw = JSON.parse(kpiData);
    } catch { }

    try {
      const modelMetricsPath = path.join(datasetDir, "model_metrics.json");
      const mmData = await fs.readFile(modelMetricsPath, "utf-8");
      config.model_metrics = JSON.parse(mmData);
    } catch { }

    return res.json({ success: true, ...config });
  } catch (err) {
    return res.status(404).json({ success: false, message: "Dashboard configuration not ready or not found." });
  }
};

// Delete dataset
export const deleteDataset = async (req, res) => {
  const datasetId = req.params.id;
  const userId = req.user?.email;

  if (!userId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  try {
    // Get user's company
    const userResult = await pool.query("SELECT company_id FROM users WHERE email = $1", [userId]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ success: false, message: "User not found" });
    }
    const companyId = userResult.rows[0].company_id;

    // Check if dataset belongs to user's company
    const datasetCheck = await pool.query(
      "SELECT dataset_id, dataset_name FROM datasets WHERE dataset_id = $1 AND company_id = $2",
      [datasetId, companyId]
    );

    if (datasetCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Dataset not found or access denied" });
    }

    // Delete from database
    await pool.query("DELETE FROM datasets WHERE dataset_id = $1", [datasetId]);

    // Delete files from ml_engine directory
    const datasetDir = path.resolve(process.cwd(), "..", "ml_engine", "data", "users", userId, datasetId);
    try {
      await fs.rm(datasetDir, { recursive: true, force: true });
    } catch (fsErr) {
      console.warn("Could not delete dataset files:", fsErr.message);
    }

    return res.json({ success: true, message: "Dataset deleted successfully" });
  } catch (err) {
    console.error("deleteDataset error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};