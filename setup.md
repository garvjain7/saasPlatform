# Project Setup Guide

## Prerequisites

- **Node.js** (v18+)
- **Python** (v3.10+)
- **Git**
- **PostgreSQL** (v14+)
- **Redis**
- **Docker** & **Docker Compose** (optional)

---

## Quick Start

### 1. Clone and Install Dependencies

```bash
# Install all dependencies
npm run install:all
```

### 2. Database Setup

Ensure PostgreSQL is running and create the database:

```sql
CREATE DATABASE datainsights;
```

Ensure Redis is running (default: `redis://127.0.0.1:6379`)

### 3. Python ML Environment

```bash
# Create virtual environment
python -m venv .venv

# Activate (Windows)
.venv\Scripts\activate

# Activate (Mac/Linux)
source .venv/bin/activate

# Install ML dependencies
pip install -r ml_engine/requirements.txt
```

### 4. Backend Configuration

```bash
cd backend-node
cp .env.example .env
```

Update `.env` with your database credentials:

```env
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=datainsights
DB_USER=postgres
DB_PASSWORD=root
JWT_SECRET=your_jwt_secret_key
NODE_ENV=development
```

### 5. Run the Application

```bash
# From data_insights root - runs both frontend and backend
npm run dev
```

Or separately:

```bash
# Backend (port 5000)
npm run dev:backend

# Frontend (port 5173)
npm run dev:frontend
```

---

## Docker Setup (Alternative)

```bash
docker-compose up --build
```

---

## Access

- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
