import path from "path";
import fs from "fs/promises";

export const analyticsSummary = async (req, res) => {
  const datasetId = req.query.datasetId || req.body.datasetId;
  if (!datasetId) return res.status(400).json({ error: "datasetId is required" });

  const userId = req.user?.email;
  if (!userId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  try {
    const insightsPath = path.resolve(process.cwd(), `../ml_engine/data/users/${userId}/${datasetId}/insights.json`);
    const kpiPath = path.resolve(process.cwd(), `../ml_engine/data/users/${userId}/${datasetId}/kpi_summary.json`);
    
    let insights = [];
    
    try {
      const insightData = await fs.readFile(insightsPath, "utf-8");
      const parsed = JSON.parse(insightData);
      insights = parsed.insights || [];
    } catch (err) {
      console.warn("insights.json not found, falling back to kpi_summary.json");
      const kpiData = await fs.readFile(kpiPath, "utf-8");
      const kpi = JSON.parse(kpiData);
      insights = [
        { key: "total", title: "Total Revenue", value: kpi.kpis?.total_sales !== undefined ? `$${kpi.kpis.total_sales.toLocaleString()}` : "N/A", description: "Across all periods" },
        { key: "profit", title: "Total Profit", value: kpi.kpis?.total_profit !== undefined ? `$${kpi.kpis.total_profit.toLocaleString()}` : "N/A", description: "Across all periods" },
        { key: "average", title: "Avg Order Value", value: kpi.kpis?.avg_order_value !== undefined ? `$${kpi.kpis.avg_order_value.toFixed(2)}` : "N/A", description: "Average per transaction" }
      ];
    }

    res.json({ success: true, insights });
  } catch (err) {
    console.error("Artifact read error:", err);
    res.status(500).json({ error: "Failed to read analytics summary", details: err.message });
  }
};

export const analyticsChart = async (req, res) => {
  const { datasetId } = req.body;
  if (!datasetId) return res.status(400).json({ error: "datasetId is required" });

  const userId = req.user?.email;
  if (!userId) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  try {
    const forecastPath = path.resolve(process.cwd(), `../ml_engine/data/users/${userId}/${datasetId}/forecast.json`);
    
    const data = await fs.readFile(forecastPath, "utf-8");
    res.json(JSON.parse(data));
  } catch (err) {
    console.error("Artifact read error:", err);
    res.status(500).json({ error: "Failed to read forecast data", details: err.message });
  }
};
