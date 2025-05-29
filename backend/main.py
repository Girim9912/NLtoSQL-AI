# Improved backend/main.py

from fastapi import FastAPI, File, UploadFile, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, validator
from dotenv import load_dotenv
import os
import shutil
import sqlite3
import pandas as pd
import uuid
import requests
import logging
from typing import List, Dict, Any

# Enhanced logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load .env secrets
load_dotenv()
DEEPINFRA_API_KEY = os.getenv("DEEPINFRA_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")  # Optional alternative
DEEPINFRA_API_URL = "https://api.deepinfra.com/v1/inference/meta-llama/Llama-2-70b-chat-hf"

app = FastAPI(
    title="NLtoSQL AI Backend",
    description="Natural Language to SQL Query Generator",
    version="0.2.0"
)

# CORS configuration with more robust settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://yourdomain.com"],  # Add production domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enhanced data models with validation
class QueryRequest(BaseModel):
    query: str
    session_id: str
    
    @validator('query')
    def query_must_not_be_empty(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError('Query cannot be empty')
        return v.strip()

class SQLGenerationResponse(BaseModel):
    sql: str
    results: List[Dict[str, Any]] = []
    error: str = None

# Centralized session and file management
class SessionManager:
    def __init__(self, temp_dir='temp'):
        self.user_db_map = {}
        self.temp_dir = temp_dir
        os.makedirs(temp_dir, exist_ok=True)
    
    def create_session(self, file: UploadFile) -> str:
        """Create a new session and process the uploaded file."""
        session_id = str(uuid.uuid4())
        file_ext = file.filename.split(".")[-1].lower()
        file_path = os.path.join(self.temp_dir, f"{session_id}.{file_ext}")
        
        try:
            with open(file_path, "wb") as f:
                shutil.copyfileobj(file.file, f)
            
            # Convert to SQLite
            sqlite_path = self._convert_to_sqlite(file_path, session_id, file_ext)
            
            self.user_db_map[session_id] = sqlite_path
            return session_id
        except Exception as e:
            logger.error(f"File processing error: {e}")
            raise HTTPException(status_code=400, detail=f"File processing failed: {str(e)}")
    
    def _convert_to_sqlite(self, file_path: str, session_id: str, file_ext: str) -> str:
        """Convert various file types to SQLite database."""
        sqlite_path = os.path.join(self.temp_dir, f"{session_id}.db")
        
        if file_ext in ["csv", "txt"]:
            df = pd.read_csv(file_path)
        elif file_ext in ["xls", "xlsx"]:
            df = pd.read_excel(file_path)
        elif file_ext == "db":
            return file_path
        else:
            raise ValueError("Unsupported file format")
        
        conn = sqlite3.connect(sqlite_path)
        try:
            df.to_sql("data", conn, if_exists="replace", index=False)
        finally:
            conn.close()
        
        return sqlite_path
    
    def get_db_path(self, session_id: str) -> str:
        """Retrieve database path for a session."""
        db_path = self.user_db_map.get(session_id)
        if not db_path:
            raise HTTPException(status_code=404, detail="No database found for this session")
        return db_path

# Initialize session manager
session_manager = SessionManager()

# Multiple LLM providers for redundancy
class LLMProviders:
    @staticmethod
    def call_deepinfra(prompt: str) -> Dict[str, Any]:
        """Call DeepInfra API to generate SQL."""
        headers = {
            "Authorization": f"Bearer {DEEPINFRA_API_KEY}",
            "Content-Type": "application/json"
        }
        
        data = {
            "input": prompt,
            "temperature": 0.1,
            "max_tokens": 500
        }
        
        try:
            response = requests.post(DEEPINFRA_API_URL, headers=headers, json=data)
            response.raise_for_status()
            result = response.json()
            
            if "results" in result and result["results"]:
                generated_text = result["results"][0]["generated_text"]
                sql = generated_text.split("SQL Query:")[-1].strip() if "SQL Query:" in generated_text else generated_text.strip()
                return {"success": True, "sql": sql}
            
            return {"success": False, "error": "No results from DeepInfra"}
        
        except requests.exceptions.RequestException as e:
            logger.error(f"DeepInfra API error: {e}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def extract_schema(db_path: str) -> str:
        """Extract database schema in a readable format."""
        conn = sqlite3.connect(db_path)
        try:
            cursor = conn.cursor()
            schema_parts = []
            
            for table_info in cursor.execute("SELECT name, sql FROM sqlite_master WHERE type='table';"):
                table_name, create_statement = table_info
                schema_parts.append(f"Table: {table_name}\n{create_statement}")
            
            return "\n\n".join(schema_parts)
        finally:
            conn.close()

def generate_prompt(query: str, schema: str) -> str:
    """Generate a sophisticated prompt for SQL generation."""
    return f"""You are an expert SQL developer specializing in writing precise, efficient SQL queries.

Database Schema:
{schema}

Requirements:
- Convert the following natural language query to a valid SQLite query
- Ensure the query is syntactically correct
- Optimize for readability and performance
- Handle potential edge cases

Natural Language Query: {query}

Provide ONLY the SQL query, without any additional explanation or backticks:
"""

@app.post("/upload", response_model=Dict[str, str])
async def upload_file(file: UploadFile = File(...)):
    """Handle file uploads and create a new session."""
    session_id = session_manager.create_session(file)
    return {"message": "Upload successful", "session_id": session_id}

@app.post("/generate-sql", response_model=SQLGenerationResponse)
async def generate_sql(req: QueryRequest):
    """Generate and execute SQL based on natural language query."""
    try:
        # Get database path for the session
        db_path = session_manager.get_db_path(req.session_id)
        
        # Extract database schema
        schema = LLMProviders.extract_schema(db_path)
        
        # Generate prompt
        prompt = generate_prompt(req.query, schema)
        
        # Generate SQL via LLM
        api_response = LLMProviders.call_deepinfra(prompt)
        
        if not api_response.get("success"):
            return SQLGenerationResponse(
                sql="", 
                error=api_response.get("error", "Unknown error")
            )
        
        sql = api_response["sql"]
        
        # Execute SQL
        conn = sqlite3.connect(db_path)
        try:
            cursor = conn.cursor()
            cursor.execute(sql)
            
            columns = [description[0] for description in cursor.description] if cursor.description else []
            raw_results = cursor.fetchall()
            
            results = [
                {columns[i]: value for i, value in enumerate(row)} 
                for row in raw_results
            ]
            
            return SQLGenerationResponse(sql=sql, results=results)
        
        except sqlite3.Error as e:
            logger.error(f"SQL Execution Error: {e}")
            return SQLGenerationResponse(
                sql=sql, 
                error=f"SQL execution error: {str(e)}"
            )
        finally:
            conn.close()
    
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return SQLGenerationResponse(
            sql="", 
            error=f"Unexpected error: {str(e)}"
        )

@app.get("/schemas/{session_id}")
async def get_schema(session_id: str):
    """Retrieve database schema for a given session."""
    try:
        db_path = session_manager.get_db_path(session_id)
        
        conn = sqlite3.connect(db_path)
        try:
            cursor = conn.cursor()
            tables = []
            
            for table_info in cursor.execute("SELECT name FROM sqlite_master WHERE type='table';"):
                table_name = table_info[0]
                
                columns = [
                    {
                        "name": column_info[1],
                        "type": column_info[2]
                    }
                    for column_info in cursor.execute(f"PRAGMA table_info({table_name});")
                ]
                
                tables.append({
                    "name": table_name,
                    "columns": columns
                })
            
            return {"success": True, "tables": tables}
        
        finally:
            conn.close()
    
    except HTTPException as he:
        return JSONResponse(status_code=he.status_code, content={"success": False, "error": he.detail})
    except Exception as e:
        logger.error(f"Schema retrieval error: {e}")
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)