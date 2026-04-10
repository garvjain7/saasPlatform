import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def create_sample_dataset(rows=5000):
    np.random.seed(42)
    
    # 1. Dates (2 years of daily data)
    start_date = datetime(2022, 1, 1)
    dates = [start_date + timedelta(days=np.random.randint(0, 730)) for _ in range(rows)]
    
    # 2. Categoricals
    regions = np.random.choice(["North", "South", "East", "West"], rows, p=[0.3, 0.2, 0.4, 0.1])
    products = np.random.choice(["Laptop", "Smartphone", "Tablet", "Monitor", "Keyboard"], rows)
    categories = []
    for p in products:
        if p in ["Laptop", "Smartphone", "Tablet"]: categories.append("Electronics")
        else: categories.append("Accessories")
        
    # 3. Numericals
    base_prices = {"Laptop": 1200, "Smartphone": 800, "Tablet": 400, "Monitor": 300, "Keyboard": 100}
    prices = [base_prices[p] * np.random.uniform(0.9, 1.1) for p in products]
    quantities = np.random.poisson(lam=5, size=rows)
    
    # Intentionally leave out revenue/sales to test the `derived_features` engine (price * quantity)
    
    # 4. Anomalies/Noise
    # Add a few ridiculous outliers to challenge the cleaner
    prices[10] = 999999 
    quantities[15] = -50
    
    # Missing values
    for _ in range(int(rows * 0.05)):
        idx = np.random.randint(0, rows)
        prices[idx] = np.nan
        
    df = pd.DataFrame({
        "transaction_date": dates,
        "region_id": regions,
        "product_name": products,
        "category": categories,
        "unit_price": prices,
        "qty_sold": quantities
    })
    
    df.to_csv("tests/data/sample_sales.csv", index=False)
    print(f"Generated sample_sales.csv with {rows} rows.")

if __name__ == "__main__":
    create_sample_dataset()
