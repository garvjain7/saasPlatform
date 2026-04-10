import os
import json
import pandas as pd
import pytest
from ml_engine.pipeline.insight_engine import AIAnalystInsightEngine

def test_insight_engine_generation(tmp_path):
    dataset_dir = str(tmp_path)
    
    schema = {
        "sales_column": "Revenue",
        "date_column": "Date"
    }
    
    with open(os.path.join(dataset_dir, "schema.json"), "w") as f:
        json.dump(schema, f)
        
    df = pd.DataFrame({
        "Date": ["2023-01-01", "2023-02-01", "2023-03-01", "2023-04-01"],
        "Revenue": [100, 150, 200, 250] # Perfect linear trend
    })
    
    df.to_csv(os.path.join(dataset_dir, "cleaned_data.csv"), index=False)
    
    metrics = {
        "profit_margin": -0.05
    }
    with open(os.path.join(dataset_dir, "metrics.json"), "w") as f:
        json.dump(metrics, f)
        
    with open(os.path.join(dataset_dir, "kpi_summary.json"), "w") as f:
        json.dump({}, f)
        
    engine = AIAnalystInsightEngine(dataset_dir)
    success = engine.execute()
    
    assert success is True
    
    with open(os.path.join(dataset_dir, "insights.json"), "r") as f:
        insights_data = json.load(f)
        
    assert "insights" in insights_data
    insights = insights_data["insights"]
    
    # Check for trend slope
    trend_insight = next((i for i in insights if i["type"] == "trend_slope"), None)
    assert trend_insight is not None
    assert trend_insight["severity"] == "info"
    
    # Check for profitability warning
    profit_insight = next((i for i in insights if i["type"] == "profitability"), None)
    assert profit_insight is not None
    assert profit_insight["severity"] == "critical" # -0.05
