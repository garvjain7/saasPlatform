import pytest
import pandas as pd
import json
import os
from pipeline.dashboard import generate_dashboard_config

@pytest.fixture
def mock_dataset_dir(tmpdir):
    d = tmpdir.mkdir("dataset_002")
    
    # Mock schema
    schema = {
        "date_column": "date",
        "sales_column": "sales",
        "product_column": "product",
        "region_column": "region"
    }
    with open(os.path.join(str(d), "schema.json"), "w") as f:
        json.dump(schema, f)
        
    # Mock data
    df = pd.DataFrame({
        "date": ["2024-01-01", "2024-01-02"],
        "sales": [100.0, 200.0],
        "profit": [10.0, 20.0],
        "discount": [0.1, 0.2],
        "product": ["A", "B"],
        "region": ["N", "S"]
    })
    df.to_csv(os.path.join(str(d), "cleaned_data.csv"), index=False)
    
    return str(d)

def test_generate_dashboard_config(mock_dataset_dir):
    result = generate_dashboard_config(mock_dataset_dir)
    assert result["status"] == "success"
    
    config_path = result["config_file"]
    with open(config_path, "r") as f:
        config = json.load(f)
        
    charts = config["charts"]
    # Should recommend Line (date+sales), Bar (product+sales), Pie (region+sales), Heatmap (>=3 numerics)
    assert len(charts) == 4
    
    chart_ids = [c["id"] for c in charts]
    assert "trend_line" in chart_ids
    assert "product_bar" in chart_ids
    assert "region_pie" in chart_ids
    assert "correlation_heatmap" in chart_ids
