import pytest
from pipeline.query_engine import detect_intent, check_guardrails

def test_check_guardrails():
    assert check_guardrails("Who is the CEO of Apple?") is not None
    assert check_guardrails("What is the weather today?") is not None
    assert check_guardrails("What is the total sales?") is None

def test_detect_intent():
    assert detect_intent("What is the average profit?") == "aggregation"
    assert detect_intent("Why did sales drop last month?") == "root_cause"
    assert detect_intent("Forecast the revenue for next week.") == "trend_analysis"
    assert detect_intent("What should I do to increase profit?") == "recommendation"
    assert detect_intent("Compare Q1 and Q2 sales.") == "comparison"
    assert detect_intent("What factors impact sales the most?") == "feature_importance"
