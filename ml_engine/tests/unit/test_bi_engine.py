import pytest
import pandas as pd
import json
import os
from pipeline.bi_engine import extract_kpis, perform_root_cause_analysis

@pytest.fixture
def bi_df():
    return pd.DataFrame({
        "date": ["2024-01-01", "2024-01-02", "2024-02-01", "2024-02-02"],
        "sales": [100.0, 150.0, 200.0, 50.0],
        "profit": [10.0, 15.0, 20.0, 5.0],
        "product": ["A", "B", "A", "C"],
        "region": ["North", "South", "North", "East"]
    })

@pytest.fixture
def bi_schema():
    return {
        "date_column": "date",
        "sales_column": "sales",
        "profit_column": "profit",
        "product_column": "product",
        "region_column": "region"
    }

def test_extract_kpis(bi_df, bi_schema):
    kpis = extract_kpis(bi_df, bi_schema)
    assert kpis["total_sales"] == 500.0
    assert kpis["total_profit"] == 50.0
    assert kpis["profit_margin_percentage"] == 10.0
    assert kpis["average_order_value"] == 125.0
    assert kpis["best_product"]["name"] == "A"
    assert kpis["best_region"]["name"] == "North"

def test_perform_root_cause_analysis(bi_df, bi_schema):
    # Split will happen at row 2 (midpoint)
    # p1: sum sales = 250, p2: sum sales = 250
    # Change row 3 to make period 2 drop
    bi_df.loc[3, "sales"] = 10.0
    rca = perform_root_cause_analysis(bi_df, bi_schema)
    
    assert "period_comparison" in rca
    assert rca["period_comparison"]["direction"] == "decreased"
    assert "major_contributing_factors" in rca
