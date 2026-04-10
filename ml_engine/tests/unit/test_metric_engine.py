import os
import json
import pandas as pd
import pytest
from ml_engine.pipeline.metric_engine import SemanticMetricEngine

def test_metric_dependency_resolution(tmp_path):
    dataset_dir = str(tmp_path)
    
    schema = {
        "sales_column": "Revenue",
        "profit_column": "Net_Income",
        "cost_column": "Expenses",
        "quantity_column": "Units"
    }
    
    with open(os.path.join(dataset_dir, "schema.json"), "w") as f:
        json.dump(schema, f)
        
    df = pd.DataFrame({
        "Revenue": [100, 200, 300],
        "Net_Income": [10, 20, 30],
        "Expenses": [90, 180, 270],
        "Units": [1, 2, 3]
    })
    
    df.to_csv(os.path.join(dataset_dir, "cleaned_data.csv"), index=False)
    
    engine = SemanticMetricEngine(dataset_dir)
    success = engine.execute()
    
    assert success is True
    
    with open(os.path.join(dataset_dir, "metrics.json"), "r") as f:
        metrics = json.load(f)
        
    assert metrics["total_sales"] == 600
    assert metrics["total_profit"] == 60
    assert metrics["total_revenue"] == 600
    assert metrics["profit_margin"] == 0.1
    assert metrics["total_cost"] == 540
    assert metrics["average_order_value"] == 100
