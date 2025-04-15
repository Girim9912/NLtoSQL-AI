from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3
import requests
import recd 
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DEEPINFRA_API_KEY="DEEPINFRA_API_KEY"

if not DEEPINFRA_API_KEY:
    print("⚠️ Warning: DeepInfra API key not found in environment variables!")
    # You can set a default for development, but don't commit this
    DEEPINFRA_API_KEY = "default_key_for_dev"

# Rest of your code remains the same...

# 🎯 Function to query DeepInfra LLM and extract clean SQL
def generate_sql_from_deepinfra(prompt: str) -> str:
    url = "https://api.deepinfra.com/v1/openai/chat/completions"
    headers = {
        "Authorization": f"Bearer {DEEPINFRA_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "model": "meta-llama/Meta-Llama-3-8B-Instruct",
        "messages": [
            {"role": "system", "content": "You are an expert SQL assistant."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0,
        "max_tokens": 150
    }

    response = requests.post(url, headers=headers, json=payload)
    response.raise_for_status()
    data = response.json()

    generated = data["choices"][0]["message"]["content"]
    print("🧠 DeepInfra Raw Response:", generated)

    # 🔍 Extract SQL block if exists
    sql_blocks = re.findall(r"```sql(.*?)```", generated, re.DOTALL)
    sql = sql_blocks[0].strip() if sql_blocks else generated.strip()

    # 🧽 Fix common issues
    sql = sql.replace("hire_date", "hired_date")

    print("✅ Cleaned SQL:", sql)
    return sql

# 🚀 FastAPI setup
app = FastAPI()

# 🌐 Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 📦 Request schema
class QueryRequest(BaseModel):
    query: str

@app.get("/")
def read_root():
    return {"message": "Welcome to NLtoSQL powered by DeepInfra"}

@app.post("/generate-sql")
async def generate_sql(req: QueryRequest):
    try:
        prompt = (
            f"You are a helpful assistant that translates natural language to SQL (SQLite syntax).\n"
            f"Natural language: {req.query}\nSQL:"
        )

        sql = generate_sql_from_deepinfra(prompt)

        # Optional: sanity check
        if not any(keyword in sql.lower() for keyword in ["select", "from"]):
            raise ValueError("Generated text does not appear to be SQL")

        # 🛠️ Execute the SQL
        conn = sqlite3.connect("sample.db")
        cursor = conn.cursor()
        cursor.execute(sql)
        rows = cursor.fetchall()
        conn.close()

        return {"sql": sql, "results": rows}

    except Exception as e:
        print("🔥 Error:", str(e))
        return {"sql": "-- Error generating SQL", "error": str(e), "results": []}
