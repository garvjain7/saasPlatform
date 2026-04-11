/**
 * Mock Data for Standalone Demo Mode
 * Current look: Startup (5-8 datasets, 20-30 logs)
 */

export const MOCK_USERS = [
  { id: 1, full_name: "Admin Demo", email: "admin@demo.com", role: "admin", initials: "AD", color: "#f85149", is_active: true, datasets: 12 },
  { id: 2, full_name: "Employee User", email: "user@demo.com", role: "employee", initials: "EU", color: "#58a6ff", is_active: true, datasets: 4 },
  { id: 3, full_name: "Sarah Chen", email: "sarah@example.com", role: "employee", initials: "SC", color: "#3fb950", is_active: true, datasets: 8 },
  { id: 4, full_name: "Michael Ross", email: "michael@example.com", role: "employee", initials: "MR", color: "#d29922", is_active: true, datasets: 2 }
];

export const MOCK_DATASETS = [
  {
    dataset_id: "ds_001",
    name: "Q1_Sales_Performance.csv",
    rows_count: 12450,
    columns_count: 18,
    file_size: 2400000,
    status: "ready",
    uploaded_by: "Admin Demo",
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    version: 1
  },
  {
    dataset_id: "ds_002",
    name: "Customer_Churn_Analysis.xlsx",
    rows_count: 8200,
    columns_count: 24,
    file_size: 1800000,
    status: "ready",
    uploaded_by: "Sarah Chen",
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    version: 2
  },
  {
    dataset_id: "ds_003",
    name: "Marketing_Spend_2025.csv",
    rows_count: 450,
    columns_count: 12,
    file_size: 45000,
    status: "ready",
    uploaded_by: "Admin Demo",
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    version: 1
  },
  {
    dataset_id: "ds_004",
    name: "Inventory_Stock_Levels.csv",
    rows_count: 56000,
    columns_count: 8,
    file_size: 8900000,
    status: "processing",
    uploaded_by: "Employee User",
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    version: 1
  },
  {
    dataset_id: "ds_005",
    name: "HR_Employee_Feedback.csv",
    rows_count: 120,
    columns_count: 45,
    file_size: 12000,
    status: "ready",
    uploaded_by: "Sarah Chen",
    created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
    version: 1
  },
  {
    dataset_id: "ds_006",
    name: "Web_Traffic_Logs_Oct.zip",
    rows_count: 150000,
    columns_count: 32,
    file_size: 45000000,
    status: "failed",
    uploaded_by: "Michael Ross",
    created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    version: 1
  }
];

export const MOCK_ACTIVITY_LOGS = [
  { log_id: 1, user_name: "Admin Demo", event_description: "uploaded Q1_Sales_Performance.csv", status: "ok", created_at: new Date(Date.now() - 600000).toISOString() },
  { log_id: 2, user_name: "Employee User", event_description: "previewed Customer_Churn_Analysis.xlsx", status: "ok", created_at: new Date(Date.now() - 1200000).toISOString() },
  { log_id: 3, user_name: "Sarah Chen", event_description: "failed to process Web_Traffic_Logs_Oct.zip", status: "failed", created_at: new Date(Date.now() - 3600000).toISOString() },
  { log_id: 4, user_name: "System", event_description: "completed cleaning Inventory_Stock_Levels.csv", status: "ok", created_at: new Date(Date.now() - 7200000).toISOString() },
  { log_id: 5, user_name: "Admin Demo", event_description: "updated role for Michael Ross", status: "ok", created_at: new Date(Date.now() - 86400000).toISOString() },
  { log_id: 6, user_name: "Michael Ross", event_description: "logged in", status: "ok", created_at: new Date(Date.now() - 9000000).toISOString() },
  { log_id: 7, user_name: "Admin Demo", event_description: "downloaded datasets report", status: "ok", created_at: new Date(Date.now() - 15000000).toISOString() },
  { log_id: 8, user_name: "Employee User", event_description: "asked a query on Sales data", status: "ok", created_at: new Date(Date.now() - 20000000).toISOString() }
];

export const MOCK_PREVIEW_DATA = {
  columns: ["ID", "Name", "Category", "Amount", "Status", "Priority"],
  rows: Array.from({ length: 50 }, (_, i) => ({
    ID: 1000 + i,
    Name: i % 2 === 0 ? "Project " + (i+1) : "Task " + (i+1),
    Category: ["Sales", "Marketing", "HR", "Ops"][Math.floor(Math.random() * 4)],
    Amount: "$" + (Math.random() * 5000).toFixed(2),
    Status: ["Complete", "Pending", "Active"][Math.floor(Math.random() * 3)],
    Priority: ["High", "Medium", "Low"][Math.floor(Math.random() * 3)]
  }))
};
