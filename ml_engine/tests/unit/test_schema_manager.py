import pytest
import pandas as pd
import json
import os
import shutil
from pipeline.schema_manager import detect_column_semantics, profile_dataset

@pytest.fixture
def mock_dataset_dir(tmpdir):
    d = tmpdir.mkdir("dataset_001")
    return str(d)

@pytest.fixture
def sample_df():
    return pd.DataFrame({
        "transaction_time": ["2024-01-01", "2024-01-02"],
        "sales_amount": [100.5, 200.0],
        "item_name": ["Widget A", "Widget B"],
        "region_area": ["North", "South"]
    })

def test_detect_column_semantics():
    columns = ["transaction_time", "sales_amount", "item_name", "region_area", "unknown_col"]
    schema = detect_column_semantics(columns)
    
    assert "date_column" in schema
    assert schema["date_column"] == "transaction_time"
    assert schema["date_confidence"] >= 0.7
    
    assert "sales_column" in schema
    assert schema["sales_column"] == "sales_amount"
    
    assert "product_column" in schema
    assert schema["product_column"] == "item_name"

def test_profile_dataset(sample_df, mock_dataset_dir):
    profile = profile_dataset(sample_df, mock_dataset_dir)
    
    assert profile["row_count"] == 2
    assert profile["column_count"] == 4
    assert len(profile["numeric_columns"]) == 1
    assert "sales_amount" in profile["numeric_columns"]
    
    assert os.path.exists(os.path.join(mock_dataset_dir, "profile_report.json"))
