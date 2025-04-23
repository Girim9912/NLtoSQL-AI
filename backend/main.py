from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3
import os
import shutil
import pandas as pd
from openai import OpenAI
from dotenv import load_dotenv
from typing import Optional
import uuid

# ==============================
# 🔐 Environment + API Setup
# ==============================
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ==============================
# 📁 Constants and Paths
# ==============================
UPLOAD_DIR = "uploads"
DEFAULT_DB = os.path.join(UPLOAD_DIR, "chinook.db")

os.makedirs(UPLOAD_DIR, exist_ok=True)

# ==============================
# 🚀 FastAPI Setup
# ==============================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================
# 🧠 Helper: Extract schema
# ==============================
def extract_schema_for_prompt(db_path: str) -> str:
    schema_lines = []
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Get all table names
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()

        for table_name, in tables:
            cursor.execute(f"PRAGMA table_info({table_name});")
            columns = cursor.fetchall()
            col_defs = [f"{col[1]} {col[2]}" for col in columns]
            schema_lines.append(f"Table: {table_name} ({', '.join(col_defs)})")

        conn.close()
    except Exception as e:
        schema_lines.append(f"-- Error extracting schema: {str(e)}")

    return "\n".join(schema_lines)

# ==============================
# 🧠 Helper: Execute SQL
# ==============================
def run_sql_query(db_path: str, sql: str):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(sql)
    rows = cursor.fetchall()
    headers = [description[0] for description in cursor.description]
    conn.close()
    return headers, rows

# ==============================
# 📄 Routes
# ==============================

@app.get("/")
def read_root():
    return {"message": "NLtoSQL backend is live 🎉"}

class QueryRequest(BaseModel):
    query: str
    db_path: Optional[str] = DEFAULT_DB

@app.post("/generate-sql")
async def generate_sql(req: QueryRequest):
    try:
        schema = extract_schema_for_prompt(req.db_path or DEFAULT_DB)
        prompt = (
            "You are an expert data analyst. Convert the following question to a SQL query using SQLite syntax.\n"
            f"Database schema:\n{schema}\n\n"
            f"User question: {req.query}\nSQL:"
        )

        response = client.chat.completions.create(
            model="meta-llama/Meta-Llama-3-8B-Instruct",
            messages=[
                {"role": "system", "content": "You are a helpful SQL assistant."},
                {"role": "user", "content": prompt}
            ],
            temperature=0,
            max_tokens=150,
        )

        raw_sql = response.choices[0].message.content
        clean_sql = raw_sql.strip().strip("```sql").strip("```")

        # Try to run it
        headers, rows = run_sql_query(req.db_path or DEFAULT_DB, clean_sql)

        return {
            "sql": clean_sql,
            "headers": headers,
            "results": rows
        }

    except Exception as e:
        return {
            "sql": "-- Error generating SQL",
            "headers": [],
            "results": [],
            "error": str(e)
        }

@app.post("/upload-db")
async def upload_database(file: UploadFile = File(...)):
    try:
        filename = file.filename
        ext = os.path.splitext(filename)[1].lower()
        session_id = str(uuid.uuid4())[:8]
        target_db_path = os.path.join(UPLOAD_DIR, f"{session_id}.db")

        # Save DB directly
        if ext == ".db":
            with open(target_db_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

        # Convert CSV to SQLite
        elif ext == ".csv":
            df = pd.read_csv(file.file)
            df.to_sql("data", sqlite3.connect(target_db_path), index=False, if_exists="replace")

        # Convert Excel
        elif ext in [".xls", ".xlsx"]:
            df = pd.read_excel(file.file)
            df.to_sql("data", sqlite3.connect(target_db_path), index=False, if_exists="replace")

        # Convert TXT
        elif ext == ".txt":
            df = pd.read_csv(file.file, delimiter="\t")
            df.to_sql("data", sqlite3.connect(target_db_path), index=False, if_exists="replace")

        else:
            return {"error": f"Unsupported file type: {ext}"}

        return {"message": "Upload successful", "db_path": target_db_path}

    except Exception as e:
        return {"error": f"Upload failed: {str(e)}"}
