"""
Dataset Insight Chatbot — Complete Backend
Features:
- JWT login via PostgreSQL (users + user_roles + roles tables)
- 4 roles: admin, analyst, employee, viewer
- Dataset upload, versioning, schema extraction
- Prompt → pandas query → AST sandbox → natural language answer
- Data editing via prompt (admin only)
- Full query logging to DB (queries, generated_code, execution, results, audit)
- Groq + OpenAI + Ollama LLM support
- Download endpoint for admin + analyst
"""

from dotenv import load_dotenv
load_dotenv()

import os, re, io, json, textwrap, uuid, hashlib, time, ast
from pathlib import Path
from typing import Any, Optional
from datetime import datetime, timedelta

import pandas as pd
import numpy as np
import psycopg2
from psycopg2.extras import RealDictCursor
from passlib.context import CryptContext
from jose import JWTError, jwt

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import httpx

# ── Config
DB_HOST      = os.getenv("DB_HOST", "localhost")
DB_PORT      = os.getenv("DB_PORT", "5432")
DB_NAME      = os.getenv("DB_NAME", "")
DB_USER      = os.getenv("DB_USER", "postgres")
DB_PASSWORD  = os.getenv("DB_PASSWORD", "")
JWT_SECRET   = os.getenv("JWT_SECRET", "change-this-secret-key-123456")
JWT_EXPIRE   = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL   = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL   = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OLLAMA_URL   = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "codellama:7b")
UPLOAD_DIR   = Path(os.getenv("UPLOAD_DIR", "./uploads"))
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_RESULT_ROWS = 100
FRONTEND_DIR    = Path(__file__).parent.parent / "frontend"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer      = HTTPBearer(auto_error=False)

ROLE_PERMISSIONS = {
    "admin":    {"can_query":True,  "can_modify":True,  "can_upload":True,  "can_download":True},
    "analyst":  {"can_query":True,  "can_modify":False, "can_upload":True,  "can_download":True},
    "employee": {"can_query":True,  "can_modify":False, "can_upload":False, "can_download":False},
    "viewer":   {"can_query":False, "can_modify":False, "can_upload":False, "can_download":False},
}

MODIFY_KEYWORDS = [
    "fill","replace","update","set ","delete","drop","remove","rename",
    "insert","add column","change","modify","clean","impute","assign",
    "overwrite","convert","map ","encode","strip","trim","lowercase","uppercase",
]

def role_can(role: str, action: str) -> bool:
    return ROLE_PERMISSIONS.get(role, {}).get(action, False)

def is_modify_prompt(q: str) -> bool:
    return any(kw in q.lower() for kw in MODIFY_KEYWORDS)

app = FastAPI(title="Dataset Insight Chatbot")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_cache: dict[str, pd.DataFrame] = {}

# ── DB helpers
def get_db():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASSWORD, cursor_factory=RealDictCursor)

def db_execute(sql, params=None):
    conn = get_db()
    try:
        cur = conn.cursor(); cur.execute(sql, params); conn.commit()
    except Exception as e:
        conn.rollback(); raise e
    finally:
        conn.close()

def db_fetchone(sql, params=None):
    conn = get_db()
    try:
        cur = conn.cursor(); cur.execute(sql, params)
        row = cur.fetchone(); return dict(row) if row else None
    finally:
        conn.close()

def db_fetchall(sql, params=None):
    conn = get_db()
    try:
        cur = conn.cursor(); cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

# ── Auth helpers
def get_user_with_role(email: str):
    user = db_fetchone("""
        SELECT u.user_id, u.email, u.password_hash, u.name,
               u.first_name, u.last_name, u.company_id, u.is_active
        FROM users u WHERE u.email = %s AND u.is_active = TRUE
    """, (email,))
    if not user:
        return None
    roles = db_fetchall("""
        SELECT r.role_name FROM user_roles ur
        JOIN roles r ON r.role_id = ur.role_id WHERE ur.user_id = %s
    """, (user["user_id"],))
    role_names = [r["role_name"] for r in roles]
    for p in ["admin","analyst","employee","viewer"]:
        if p in role_names:
            user["role"] = p; break
    else:
        user["role"] = role_names[0] if role_names else "viewer"
    user["all_roles"] = role_names
    return user

def create_token(data: dict) -> str:
    payload = {**data, "exp": datetime.utcnow() + timedelta(minutes=JWT_EXPIRE)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid or expired token.")

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    if not credentials:
        raise HTTPException(401, "Authentication required.")
    return decode_token(credentials.credentials)

def get_dataset_permission(dataset_id: str, user_id: str):
    return db_fetchone("""
        SELECT can_view, can_insert, can_update, can_delete
        FROM dataset_permissions WHERE dataset_id = %s AND user_id = %s
    """, (dataset_id, user_id))

# ── Schema extraction
def extract_schema(df: pd.DataFrame) -> dict:
    schema: dict[str, Any] = {"row_count": len(df), "columns": {}}
    for col in df.columns:
        s = df[col]
        info: dict[str, Any] = {"dtype": str(s.dtype), "null_count": int(s.isna().sum())}
        if pd.api.types.is_numeric_dtype(s):
            info["type"] = "numeric"
            desc = s.describe()
            info.update({"min":round(float(desc["min"]),4),"max":round(float(desc["max"]),4),
                         "mean":round(float(desc["mean"]),4),"median":round(float(s.median()),4),
                         "std":round(float(desc["std"]),4)})
        elif pd.api.types.is_datetime64_any_dtype(s):
            info["type"] = "datetime"; info["min"] = str(s.min()); info["max"] = str(s.max())
        else:
            vc = s.value_counts()
            info["type"] = "categorical"
            info["unique_count"] = int(vc.shape[0])
            info["top_values"] = [str(v) for v in vc.head(5).index.tolist()]
        schema["columns"][col] = info
    return schema

# ── AST Sandbox
BLOCKED_IMPORTS = {"os","sys","subprocess","socket","shutil","pathlib","requests",
    "httpx","urllib","ftplib","smtplib","http","importlib","runpy","pty",
    "signal","ctypes","cffi","pickle","shelve","multiprocessing","threading","concurrent"}
BLOCKED_ATTRS = {"__import__","__builtins__","__loader__","__spec__","__subclasses__",
    "__bases__","__mro__","__code__","__globals__","__closure__","__reduce__","__reduce_ex__"}
BLOCKED_CALLS = {"eval","exec","compile","open","input","breakpoint"}

class ASTSafetyChecker(ast.NodeVisitor):
    def visit_Import(self, node):
        for a in node.names:
            if a.name.split(".")[0] in BLOCKED_IMPORTS:
                raise ValueError(f"Import '{a.name}' not allowed.")
        self.generic_visit(node)
    def visit_ImportFrom(self, node):
        if (node.module or "").split(".")[0] in BLOCKED_IMPORTS:
            raise ValueError(f"Import from '{node.module}' not allowed.")
        self.generic_visit(node)
    def visit_Call(self, node):
        if isinstance(node.func, ast.Name) and node.func.id in BLOCKED_CALLS:
            raise ValueError(f"Call to '{node.func.id}' not allowed.")
        self.generic_visit(node)
    def visit_Attribute(self, node):
        if node.attr in BLOCKED_ATTRS:
            raise ValueError(f"Access to '{node.attr}' not allowed.")
        self.generic_visit(node)

def safe_execute(code: str, df: pd.DataFrame) -> Any:
    try:
        tree = ast.parse(code, mode="exec")
    except SyntaxError as e:
        raise ValueError(f"Syntax error: {e}")
    ASTSafetyChecker().visit(tree)
    byte_code = compile(tree, "<query>", "exec")
    sb = {"len":len,"range":range,"list":list,"dict":dict,"tuple":tuple,"set":set,
          "str":str,"int":int,"float":float,"bool":bool,"abs":abs,"round":round,
          "min":min,"max":max,"sum":sum,"sorted":sorted,"enumerate":enumerate,
          "zip":zip,"map":map,"filter":filter,"isinstance":isinstance,"type":type,
          "print":print,"repr":repr,"hasattr":hasattr,"True":True,"False":False,"None":None}
    g = {"__builtins__": sb, "df": df, "pd": pd, "np": np}
    lv: dict = {"result": None}
    exec(byte_code, g, lv)  # noqa: S102
    
    res = lv.get("result")
    if res is not None:
        return res
    return g.get("result")

# ── LLM prompts
QUERY_SYSTEM = """You are a pandas code generator. Given a dataset schema and a user question,
output ONLY Python code that:
1. Uses variable `df` (a pandas DataFrame already loaded).
2. Assigns the final answer or modified DataFrame to `result`.
3. Never imports anything. Never uses os, sys, open, exec, eval.
4. For modifications: apply changes to df directly, set result = df
5. For queries: set result = the computed answer
6. CRITICAL: When using boolean indexing, ALWAYS use `&` or `|` instead of Python `and` or `or`. ALWAYS wrap each condition in parentheses, e.g. `df[(df['a'] > 1) & (df['b'] < 2)]`.
7. CRITICAL: NEVER use `if` statements to evaluate a DataFrame or Series (e.g. NEVER write `if df['col'] == 'val':`). Instead, use Pandas vectorization or `df.loc`.
8. CRITICAL: For value replacements, ALWAYS use `df.loc`. Example: `df.loc[df['col'] == 'old_val', 'col'] = 'new_val'`. DO NOT use `df.apply` or loops.
Respond with ONLY raw Python code — no markdown, no backticks, no explanation."""

NL_SYSTEM = """You are a helpful data analyst. Given a user question and query result,
write a clear concise answer in natural language. Be specific with numbers.
Do NOT show code or raw tables."""

# ── LLM callers
async def call_groq(system: str, user: str) -> str:
    if not GROQ_API_KEY: raise HTTPException(500, "GROQ_API_KEY not set in .env")
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post("https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization":f"Bearer {GROQ_API_KEY}","Content-Type":"application/json"},
            json={"model":os.getenv("GROQ_MODEL",GROQ_MODEL),"max_tokens":1024,
                  "messages":[{"role":"system","content":system},{"role":"user","content":user}]})
        if r.status_code != 200: raise HTTPException(500, f"Groq error: {r.text}")
    return r.json()["choices"][0]["message"]["content"].strip()

async def call_openai(system: str, user: str) -> str:
    if not OPENAI_API_KEY: raise HTTPException(500, "OPENAI_API_KEY not set in .env")
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post("https://api.openai.com/v1/chat/completions",
            headers={"Authorization":f"Bearer {OPENAI_API_KEY}","Content-Type":"application/json"},
            json={"model":OPENAI_MODEL,"max_tokens":1024,
                  "messages":[{"role":"system","content":system},{"role":"user","content":user}]})
        if r.status_code != 200: raise HTTPException(500, f"OpenAI error: {r.text}")
    return r.json()["choices"][0]["message"]["content"].strip()

async def call_ollama(system: str, user: str) -> str:
    model = os.getenv("OLLAMA_MODEL", OLLAMA_MODEL)
    async with httpx.AsyncClient(timeout=180) as c:
        try:
            r = await c.post(f"{OLLAMA_URL}/api/chat",
                json={"model":model,"stream":False,
                      "messages":[{"role":"system","content":system},{"role":"user","content":user}]})
            if r.status_code == 200: return r.json()["message"]["content"].strip()
        except Exception: pass
        r = await c.post(f"{OLLAMA_URL}/api/generate",
            json={"model":model,"prompt":f"{system}\n\n{user}","stream":False})
        r.raise_for_status()
        return r.json()["response"].strip()

async def call_llm(model: str, system: str, user: str) -> str:
    if model == "groq":   return await call_groq(system, user)
    if model == "openai": return await call_openai(system, user)
    return await call_ollama(system, user)

# ── DB logging helpers
def log_query(company_id, dataset_id, version_id, user_id, question, query_type) -> str:
    qid = str(uuid.uuid4())
    db_execute("""INSERT INTO queries (query_id,company_id,dataset_id,version_id,user_id,question,query_type)
        VALUES (%s,%s,%s,%s,%s,%s,%s)""", (qid,company_id,dataset_id,version_id,user_id,question,query_type))
    return qid

def log_generated_code(qid, code, code_type, is_valid, error=None):
    db_execute("""INSERT INTO query_generated_code (id,query_id,generated_code,code_type,is_valid,validation_error)
        VALUES (%s,%s,%s,%s,%s,%s)""", (str(uuid.uuid4()),qid,code,code_type,is_valid,error))

def log_execution(qid, code, engine, status, error, exec_time):
    db_execute("""INSERT INTO query_execution (execution_id,query_id,executed_code,execution_engine,status,error,execution_time)
        VALUES (%s,%s,%s,%s,%s,%s,%s)""", (str(uuid.uuid4()),qid,code,engine,status,error,exec_time))

def log_result(qid, result_type, result_data):
    db_execute("""INSERT INTO query_results (result_id,query_id,result_type,result_data)
        VALUES (%s,%s,%s,%s)""", (str(uuid.uuid4()),qid,result_type,result_data))

def log_audit(qid, user_id, action, allowed):
    db_execute("""INSERT INTO query_permissions_audit (id,query_id,user_id,action_type,allowed)
        VALUES (%s,%s,%s,%s,%s)""", (str(uuid.uuid4()),qid,user_id,action,allowed))

# ── Request models
class LoginRequest(BaseModel):
    email: str; password: str

class QueryRequest(BaseModel):
    dataset_id: str; question: str; model: str = "groq"

class InternalQueryRequest(BaseModel):
    """Request model for the internal (auth-free) query endpoint used by the Node.js backend."""
    dataset_id: str
    file_dir_path: str
    question: str
    model: str = "groq"
    role: str = "viewer"  # Default to viewer if not provided for safety

class CreateUserRequest(BaseModel):
    email: str; password: str; name: str
    role: str = "employee"
    company_id: Optional[str] = "00000000-0000-0000-0000-000000000001"

class GrantPermissionRequest(BaseModel):
    user_id: str; can_view: bool = True; can_insert: bool = False
    can_update: bool = False; can_delete: bool = False

# ══════════════════════════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/auth/login")
def login(req: LoginRequest):
    user = get_user_with_role(req.email)
    if not user or not pwd_context.verify(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password.")
    name = user.get("name") or f"{user.get('first_name','')} {user.get('last_name','')}".strip()
    token = create_token({"sub":str(user["user_id"]),"email":user["email"],
        "role":user["role"],"all_roles":user["all_roles"],
        "name":name,"company_id":str(user["company_id"])})
    return {"token":token,"email":user["email"],"role":user["role"],
            "all_roles":user["all_roles"],"name":name,"company_id":str(user["company_id"])}

@app.get("/auth/me")
def get_me(cu: dict = Depends(get_current_user)):
    return cu

@app.post("/auth/create-user")
def create_user(req: CreateUserRequest, cu: dict = Depends(get_current_user)):
    if cu["role"] != "admin": raise HTTPException(403, "Only admins can create users.")
    role_row = db_fetchone("SELECT role_id FROM roles WHERE role_name = %s", (req.role,))
    if not role_row: raise HTTPException(400, f"Role '{req.role}' not found.")
    uid = str(uuid.uuid4())
    db_execute("""INSERT INTO users (user_id,company_id,email,password_hash,name,is_active)
        VALUES (%s,%s,%s,%s,%s,TRUE)""",
        (uid, req.company_id, req.email, pwd_context.hash(req.password), req.name))
    db_execute("INSERT INTO user_roles (id,user_id,role_id) VALUES (%s,%s,%s)",
        (str(uuid.uuid4()), uid, role_row["role_id"]))
    return {"message": f"User {req.email} created with role {req.role}", "user_id": uid}

@app.get("/auth/users")
def list_users(cu: dict = Depends(get_current_user)):
    if cu["role"] != "admin": raise HTTPException(403, "Only admins can list users.")
    return {"users": db_fetchall("""
        SELECT u.user_id, u.email, u.name, u.is_active, u.created_at,
               string_agg(r.role_name, ', ') as roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.user_id
        LEFT JOIN roles r ON r.role_id = ur.role_id
        WHERE u.company_id = %s GROUP BY u.user_id
        ORDER BY u.created_at DESC
    """, (cu["company_id"],))}

# ══════════════════════════════════════════════════════════════════════════════
# DATASET ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/upload")
async def upload_dataset(file: UploadFile = File(...), cu: dict = Depends(get_current_user)):
    if not role_can(cu["role"], "can_upload"):
        raise HTTPException(403, f"Your role ({cu['role']}) cannot upload datasets.")
    ext = Path(file.filename).suffix.lower()
    content = await file.read()
    try:
        if ext in (".csv",".txt"): df = pd.read_csv(io.BytesIO(content))
        elif ext == ".tsv":        df = pd.read_csv(io.BytesIO(content), sep="\t")
        elif ext == ".json":       df = pd.read_json(io.BytesIO(content))
        elif ext in (".xlsx",".xls"): df = pd.read_excel(io.BytesIO(content))
        else: raise HTTPException(400, f"Unsupported type: {ext}")
    except HTTPException: raise
    except Exception as e: raise HTTPException(422, f"Parse error: {e}")

    for col in df.columns:
        if "date" in col.lower() or "time" in col.lower():
            try: df[col] = pd.to_datetime(df[col])
            except: pass

    file_hash  = hashlib.md5(content).hexdigest()
    company_id = cu.get("company_id", "00000000-0000-0000-0000-000000000001")
    user_id    = cu["sub"]
    dataset_id = str(uuid.uuid4())
    version_id = str(uuid.uuid4())
    save_path  = UPLOAD_DIR / f"{dataset_id}{ext}"
    with open(save_path, "wb") as f: f.write(content)
    schema = extract_schema(df)

    try:
        db_execute("""INSERT INTO datasets (dataset_id,company_id,name,uploaded_by,hash,status,is_active)
            VALUES (%s,%s,%s,%s,%s,'ready',TRUE)""",
            (dataset_id, company_id, file.filename, user_id, file_hash))
        db_execute("""INSERT INTO dataset_versions
            (version_id,dataset_id,raw_file_path,row_count,column_count,schema_json,is_cleaned)
            VALUES (%s,%s,%s,%s,%s,%s,FALSE)""",
            (version_id,dataset_id,str(save_path),len(df),len(df.columns),json.dumps(schema)))
        db_execute("""INSERT INTO dataset_ownership (id,dataset_id,owner_user_id,is_primary)
            VALUES (%s,%s,%s,TRUE)""", (str(uuid.uuid4()),dataset_id,user_id))
        db_execute("""INSERT INTO dataset_permissions
            (id,dataset_id,user_id,can_view,can_insert,can_update,can_delete,granted_by)
            VALUES (%s,%s,%s,TRUE,TRUE,TRUE,TRUE,%s)""",
            (str(uuid.uuid4()),dataset_id,user_id,user_id))
    except Exception as e:
        raise HTTPException(500, f"DB error: {e}")

    _cache[dataset_id] = df
    return {"dataset_id":dataset_id,"version_id":version_id,"filename":file.filename,"schema":schema}

@app.get("/datasets")
def list_datasets(cu: dict = Depends(get_current_user)):
    company_id = cu.get("company_id","00000000-0000-0000-0000-000000000001")
    return {"datasets": db_fetchall("""
        SELECT d.dataset_id, d.name, d.created_at, d.status,
               dv.row_count, dv.column_count, dv.version_id
        FROM datasets d
        LEFT JOIN dataset_versions dv ON dv.dataset_id = d.dataset_id
        WHERE d.company_id = %s AND d.is_active = TRUE
        ORDER BY d.created_at DESC
    """, (company_id,))}

@app.post("/datasets/{dataset_id}/grant")
def grant_permission(dataset_id: str, req: GrantPermissionRequest, cu: dict = Depends(get_current_user)):
    if cu["role"] != "admin": raise HTTPException(403, "Only admins can grant permissions.")
    db_execute("""
        INSERT INTO dataset_permissions (id,dataset_id,user_id,can_view,can_insert,can_update,can_delete,granted_by)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (dataset_id,user_id) DO UPDATE SET
            can_view=EXCLUDED.can_view, can_insert=EXCLUDED.can_insert,
            can_update=EXCLUDED.can_update, can_delete=EXCLUDED.can_delete
    """, (str(uuid.uuid4()),dataset_id,req.user_id,req.can_view,req.can_insert,req.can_update,req.can_delete,cu["sub"]))
    return {"message":"Permissions updated."}

# ══════════════════════════════════════════════════════════════════════════════
# QUERY ENDPOINT — FULL PIPELINE
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/query")
async def query_dataset(req: QueryRequest, cu: dict = Depends(get_current_user)):
    user_id    = cu["sub"]
    role       = cu["role"]
    company_id = cu.get("company_id","00000000-0000-0000-0000-000000000001")
    modify     = is_modify_prompt(req.question)
    query_type = "modify" if modify else "insight"

    dataset_row = db_fetchone("""
        SELECT d.dataset_id, dv.version_id, dv.raw_file_path
        FROM datasets d JOIN dataset_versions dv ON dv.dataset_id = d.dataset_id
        WHERE d.dataset_id = %s AND d.is_active = TRUE
        ORDER BY dv.created_at DESC LIMIT 1
    """, (req.dataset_id,))
    if not dataset_row: raise HTTPException(404,"Dataset not found.")

    version_id = dataset_row["version_id"]
    query_id   = log_query(company_id, req.dataset_id, version_id, user_id, req.question, query_type)
    ds_perm    = get_dataset_permission(req.dataset_id, user_id)

    # Permission check
    if modify:
        allowed = role_can(role,"can_modify") and (not ds_perm or ds_perm.get("can_update",False))
        log_audit(query_id, user_id, "modify", allowed)
        if not allowed:
            return {"answer":f"Your role ({role}) cannot modify data. Contact an admin.","code":None,"result":None,"allowed":False}
    else:
        allowed = role_can(role,"can_query") and (not ds_perm or ds_perm.get("can_view",True))
        log_audit(query_id, user_id, "query", allowed)
        if not allowed:
            return {"answer":"Your role cannot query this dataset.","code":None,"result":None,"allowed":False}

    # Load DataFrame
    df = _cache.get(req.dataset_id)
    if df is None:
        fp = dataset_row["raw_file_path"]; ext = Path(fp).suffix.lower()
        try:
            if ext in (".csv",".txt"): df = pd.read_csv(fp)
            elif ext == ".tsv":        df = pd.read_csv(fp, sep="\t")
            elif ext == ".json":       df = pd.read_json(fp)
            elif ext in (".xlsx",".xls"): df = pd.read_excel(fp)
        except Exception as e: raise HTTPException(500, f"Failed to load dataset: {e}")
        _cache[req.dataset_id] = df

    schema = extract_schema(df)

    # Cache check (read only)
    if not modify:
        q_hash = hashlib.md5(req.question.lower().strip().encode()).hexdigest()
        cached = db_fetchone("""
            SELECT result_ref FROM query_cache
            WHERE dataset_id=%s AND version_id=%s AND query_hash=%s
        """, (req.dataset_id, version_id, q_hash))
        if cached:
            return {"answer":cached["result_ref"],"code":None,"result":cached["result_ref"],"modified":False,"cached":True}

    # Generate pandas code
    op_hint = "MODIFY — apply changes to df, set result = df" if modify else "READ — do not modify df"
    prompt  = (f"Dataset schema:\n{json.dumps(schema,indent=2)}\n\n"
               f"Operation: {op_hint}\n\nQuestion: {req.question}\n\n"
               "Write pandas code. Assign final answer to `result`.")
    raw_code = await call_llm(req.model, QUERY_SYSTEM, prompt)
    raw_code = re.sub(r"```(?:python)?","",raw_code).replace("```","").strip()

    # Execute in sandbox
    t0 = time.time(); exec_error = None; result = None
    try:
        result    = safe_execute(raw_code, df if modify else df.copy())
        exec_time = round(time.time()-t0, 4)
        log_generated_code(query_id, raw_code, "pandas", True)
        log_execution(query_id, raw_code, req.model, "success", None, exec_time)
    except Exception as e:
        exec_error = str(e)
        exec_time  = round(time.time()-t0, 4)
        log_generated_code(query_id, raw_code, "pandas", False, exec_error)
        log_execution(query_id, raw_code, req.model, "failed", exec_error, exec_time)
        return {"answer":f"Query failed: {e}","code":raw_code,"error":exec_error,"allowed":True}

    # Update stored dataset if modify
    if modify and isinstance(result, pd.DataFrame):
        _cache[req.dataset_id] = result
        fp = dataset_row["raw_file_path"]
        if Path(fp).suffix.lower() == ".csv": result.to_csv(fp, index=False)
        result_str = f"Dataset updated. New shape: {result.shape[0]} rows × {result.shape[1]} columns."
    elif isinstance(result, pd.DataFrame):
        result_str = result.head(MAX_RESULT_ROWS).to_string(index=False)
    elif isinstance(result, pd.Series):
        result_str = result.head(MAX_RESULT_ROWS).to_string()
    elif isinstance(result, (np.integer, np.floating)):
        result_str = str(result.item())
    else:
        result_str = str(result)

    # Natural language answer
    nl_prompt = f"User question: {req.question}\n\nResult:\n{result_str}\n\nAnswer naturally."
    answer    = await call_llm(req.model, NL_SYSTEM, nl_prompt)
    log_result(query_id, query_type, answer)

    # Cache read result
    if not modify:
        q_hash = hashlib.md5(req.question.lower().strip().encode()).hexdigest()
        try:
            db_execute("""INSERT INTO query_cache (cache_id,dataset_id,version_id,query_hash,result_ref)
                VALUES (%s,%s,%s,%s,%s) ON CONFLICT (dataset_id,version_id,query_hash) DO NOTHING""",
                (str(uuid.uuid4()),req.dataset_id,version_id,q_hash,answer))
        except: pass

    return {"answer":answer,"code":raw_code,"result":result_str[:2000],
            "modified":modify,"allowed":True,"query_id":query_id}

# ══════════════════════════════════════════════════════════════════════════════
# DOWNLOAD, HISTORY, HEALTH
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/download/{dataset_id}")
def download_dataset(dataset_id: str, cu: dict = Depends(get_current_user)):
    if not role_can(cu["role"],"can_download"):
        raise HTTPException(403,"Your role cannot download datasets.")
    df = _cache.get(dataset_id)
    if df is None: raise HTTPException(404,"Dataset not loaded.")
    stream = io.StringIO(); df.to_csv(stream, index=False); stream.seek(0)
    return StreamingResponse(iter([stream.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition":f"attachment; filename=dataset_{dataset_id[:8]}.csv"})

@app.get("/history/{dataset_id}")
def query_history(dataset_id: str, cu: dict = Depends(get_current_user)):
    return {"history": db_fetchall("""
        SELECT q.query_id, q.question, q.query_type, q.created_at,
               qr.result_data as answer, qe.status, qe.execution_time
        FROM queries q
        LEFT JOIN query_results qr ON qr.query_id = q.query_id
        LEFT JOIN query_execution qe ON qe.query_id = q.query_id
        WHERE q.dataset_id = %s AND q.user_id = %s
        ORDER BY q.created_at DESC LIMIT 50
    """, (dataset_id, cu["sub"]))}

@app.get("/health")
def health():
    try: get_db().close(); db_ok = True
    except: db_ok = False
    return {"status":"ok","database":"connected" if db_ok else "disconnected","datasets_in_memory":len(_cache)}

# ══════════════════════════════════════════════════════════════════════════════
# INTERNAL QUERY ENDPOINT — Auth-free, DB-free, for Node.js microservice use
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/internal/query")
async def internal_query(req: InternalQueryRequest):
    """Auth-free query endpoint for the saasPlatform Node.js backend.
    The Node.js backend handles authentication and dataset path resolution,
    then forwards the query here for LLM processing.
    """
    dir_path = Path(req.file_dir_path)

    # Find the dataset file — look for CSV/Excel/JSON in the directory
    df = None
    if dir_path.is_file():
        fp = dir_path
    elif dir_path.is_dir():
        # Search for data files in priority order
        fp = None
        for pattern in ["cleaned_data.csv", "*.csv", "*.xlsx", "*.json"]:
            matches = list(dir_path.glob(pattern))
            if matches:
                fp = matches[0]
                break
        if fp is None:
            return {"answer": "No data file found in the dataset directory.",
                    "code": None, "result": None, "error": "no_data_file"}
    else:
        return {"answer": f"Dataset path not found: {req.file_dir_path}",
                "code": None, "result": None, "error": "path_not_found"}

    # Load from cache or file
    cache_key = f"internal_{req.dataset_id}"
    df = _cache.get(cache_key)
    if df is None:
        ext = fp.suffix.lower()
        try:
            for enc in ["utf-8", "latin-1", "cp1252"]:
                try:
                    if ext in (".csv", ".txt"):
                        df = pd.read_csv(fp, encoding=enc)
                    elif ext == ".tsv":
                        df = pd.read_csv(fp, sep="\t", encoding=enc)
                    break
                except UnicodeDecodeError:
                    continue
            if df is None:
                if ext == ".json":
                    df = pd.read_json(fp)
                elif ext in (".xlsx", ".xls"):
                    df = pd.read_excel(fp)
                else:
                    return {"answer": f"Unsupported file type: {ext}",
                            "code": None, "result": None, "error": "unsupported_type"}
        except Exception as e:
            return {"answer": f"Failed to load dataset: {e}",
                    "code": None, "result": None, "error": str(e)}
        # Auto-parse date columns
        for col in df.columns:
            if "date" in col.lower() or "time" in col.lower():
                try:
                    df[col] = pd.to_datetime(df[col])
                except Exception:
                    pass
        _cache[cache_key] = df

    schema = extract_schema(df)

    # Generate pandas code via LLM
    modify = is_modify_prompt(req.question)
    
    if modify and not role_can(req.role, "can_modify"):
        return {
            "answer": f"⚠️ Access Denied: Your current role ('{req.role}') does not have permission to modify datasets. Please contact an admin.",
            "code": None,
            "result": None,
            "error": "permission_denied",
            "intent": "error",
            "confidence": 0
        }
        
    op_hint = "MODIFY — apply changes to df, set result = df" if modify else "READ — do not modify df"
    prompt = (f"Dataset schema:\n{json.dumps(schema, indent=2)}\n\n"
              f"Operation: {op_hint}\n\nQuestion: {req.question}\n\n"
              "Write pandas code. Assign final answer to `result`.")
    raw_code = await call_llm(req.model, QUERY_SYSTEM, prompt)
    raw_code = re.sub(r"```(?:python)?", "", raw_code).replace("```", "").strip()

    # Execute in sandbox
    t0 = time.time()
    try:
        result = safe_execute(raw_code, df if modify else df.copy())
        exec_time = round(time.time() - t0, 4)
    except Exception as e:
        return {"answer": f"Query execution failed: {e}",
                "code": raw_code, "error": str(e), "intent": "error", "confidence": 0}

    # Format result
    if modify and isinstance(result, pd.DataFrame):
        _cache[cache_key] = result
        result_str = f"Dataset updated. New shape: {result.shape[0]} rows × {result.shape[1]} columns."
    elif isinstance(result, pd.DataFrame):
        result_str = result.head(MAX_RESULT_ROWS).to_string(index=False)
    elif isinstance(result, pd.Series):
        result_str = result.head(MAX_RESULT_ROWS).to_string()
    elif isinstance(result, (np.integer, np.floating)):
        result_str = str(result.item())
    else:
        result_str = str(result)

    # Natural language answer
    nl_prompt = f"User question: {req.question}\n\nResult:\n{result_str}\n\nAnswer naturally."
    answer = await call_llm(req.model, NL_SYSTEM, nl_prompt)

    return {
        "answer": answer,
        "code": raw_code,
        "result": result_str[:2000],
        "intent": "modify" if modify else "insight",
        "confidence": 0.9,
        "execution_time": exec_time,
    }

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")
    @app.get("/")
    def serve_index(): return FileResponse(str(FRONTEND_DIR / "index.html"))
