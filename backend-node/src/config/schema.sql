-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================
-- COMPANIES
-- =========================
CREATE TABLE companies (
    company_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================
-- USERS
-- =========================
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    name TEXT,
    first_name TEXT,
    last_name TEXT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    phone TEXT,
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================
-- ROLES
-- =========================
CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,
    role_name TEXT UNIQUE
);

-- =========================
-- USER ROLES
-- =========================
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    role_id INT REFERENCES roles(role_id),
    assigned_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, role_id)
);

-- =========================
-- DATASETS
-- =========================
CREATE TABLE datasets (
    dataset_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    uploaded_by UUID REFERENCES users(user_id),
    hash TEXT NOT NULL,
    status TEXT DEFAULT 'processing',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(company_id, hash)
);

-- =========================
-- DATASET VERSIONS
-- =========================
CREATE TABLE dataset_versions (
    version_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID REFERENCES datasets(dataset_id) ON DELETE CASCADE,

    raw_file_path TEXT NOT NULL,
    cleaned_file_path TEXT,

    is_cleaned BOOLEAN DEFAULT FALSE,

    row_count INT,
    column_count INT,

    schema_json JSONB,
    report_path TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================
-- DATASET OWNERSHIP
-- =========================
CREATE TABLE dataset_ownership (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID REFERENCES datasets(dataset_id) ON DELETE CASCADE,
    owner_user_id UUID REFERENCES users(user_id),
    is_primary BOOLEAN DEFAULT FALSE
);

-- =========================
-- DATASET PERMISSIONS
-- =========================
CREATE TABLE dataset_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID REFERENCES datasets(dataset_id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,

    can_view BOOLEAN DEFAULT TRUE,
    can_insert BOOLEAN DEFAULT FALSE,
    can_update BOOLEAN DEFAULT FALSE,
    can_delete BOOLEAN DEFAULT FALSE,

    granted_by UUID REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(dataset_id, user_id)
);

-- =========================
-- QUERIES
-- =========================
CREATE TABLE queries (
    query_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(company_id),
    dataset_id UUID REFERENCES datasets(dataset_id),
    version_id UUID REFERENCES dataset_versions(version_id),
    user_id UUID REFERENCES users(user_id),

    question TEXT NOT NULL,
    query_type TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================
-- GENERATED CODE
-- =========================
CREATE TABLE query_generated_code (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id UUID REFERENCES queries(query_id) ON DELETE CASCADE,

    generated_code TEXT,
    code_type TEXT,

    is_valid BOOLEAN,
    validation_error TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================
-- QUERY EXECUTION
-- =========================
CREATE TABLE query_execution (
    execution_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id UUID REFERENCES queries(query_id) ON DELETE CASCADE,

    executed_code TEXT,
    execution_engine TEXT,

    status TEXT,
    error TEXT,

    execution_time FLOAT,

    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================
-- QUERY RESULTS
-- =========================
CREATE TABLE query_results (
    result_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id UUID REFERENCES queries(query_id) ON DELETE CASCADE,

    result_type TEXT,
    result_data TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================
-- QUERY PERMISSION AUDIT
-- =========================
CREATE TABLE query_permissions_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id UUID REFERENCES queries(query_id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(user_id),

    action_type TEXT,
    allowed BOOLEAN,

    checked_at TIMESTAMP DEFAULT NOW()
);

-- =========================
-- QUERY RETRY LOGS
-- =========================
CREATE TABLE query_retry_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id UUID REFERENCES queries(query_id),

    attempt_number INT,
    error TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================
-- QUERY CACHE
-- =========================
CREATE TABLE query_cache (
    cache_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID,
    version_id UUID,

    query_hash TEXT,
    result_ref TEXT,

    created_at TIMESTAMP DEFAULT NOW(),

    UNIQUE(dataset_id, version_id, query_hash)
);

-- =========================
-- CLEANING JOBS
-- =========================
CREATE TABLE dataset_cleaning_jobs (
    job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID,
    version_id UUID,

    status TEXT,
    error TEXT,

    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

-- =========================
-- EMPLOYEE RECORDS
-- =========================
CREATE TABLE employee_records (
    employee_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(company_id),

    user_id UUID REFERENCES users(user_id),

    department TEXT,
    designation TEXT,

    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================
-- INDEXES
-- =========================
CREATE INDEX idx_users_company ON users(company_id);
CREATE INDEX idx_datasets_company ON datasets(company_id);
CREATE INDEX idx_dataset_permissions_user ON dataset_permissions(user_id);
CREATE INDEX idx_queries_user ON queries(user_id);
CREATE INDEX idx_queries_dataset ON queries(dataset_id);
CREATE INDEX idx_query_cache_lookup 
ON query_cache(dataset_id, version_id, query_hash);

-- =========================
-- SEED DATA
-- =========================
INSERT INTO roles (role_name) VALUES 
    ('admin'),
    ('analyst'),
    ('viewer'),
    ('employee');

INSERT INTO companies (company_id, name) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Default Company');