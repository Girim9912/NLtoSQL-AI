# Enhanced backend/main.py with improved LLM capabilities

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
import json
import re
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio
import aiohttp

# Enhanced logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load .env secrets
load_dotenv()
DEEPINFRA_API_KEY = os.getenv("DEEPINFRA_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

app = FastAPI(
    title="NLtoSQL AI Backend",
    description="Enhanced Natural Language to SQL Query Generator with Multiple LLM Support",
    version="0.3.0"
)

# Enhanced CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "https://yourdomain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enhanced data models
class QueryRequest(BaseModel):
    query: str
    session_id: str
    model_preference: Optional[str] = "auto"  # auto, deepinfra, openai, anthropic
    
    @validator('query')
    def query_must_not_be_empty(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError('Query cannot be empty')
        return v.strip()

class SQLGenerationResponse(BaseModel):
    sql: str
    results: List[Dict[str, Any]] = []
    error: str = None
    model_used: str = None
    confidence_score: float = 0.0
    explanation: str = None

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
            
            self.user_db_map[session_id] = {
                'db_path': sqlite_path,
                'created_at': datetime.now(),
                'original_filename': file.filename
            }
            return session_id
        except Exception as e:
            logger.error(f"File processing error: {e}")
            raise HTTPException(status_code=400, detail=f"File processing failed: {str(e)}")
    
    def _convert_to_sqlite(self, file_path: str, session_id: str, file_ext: str) -> str:
        """Convert various file types to SQLite database."""
        sqlite_path = os.path.join(self.temp_dir, f"{session_id}.db")
        
        try:
            if file_ext in ["csv", "txt"]:
                # Enhanced CSV reading with better error handling
                df = pd.read_csv(file_path, encoding='utf-8', on_bad_lines='skip')
            elif file_ext in ["xls", "xlsx"]:
                df = pd.read_excel(file_path)
            elif file_ext == "db":
                return file_path
            else:
                raise ValueError(f"Unsupported file format: {file_ext}")
            
            # Clean column names
            df.columns = df.columns.str.strip().str.replace(' ', '_').str.replace(r'[^\w]', '', regex=True)
            
            conn = sqlite3.connect(sqlite_path)
            try:
                df.to_sql("data", conn, if_exists="replace", index=False)
                logger.info(f"Successfully created SQLite database with {len(df)} rows and {len(df.columns)} columns")
            finally:
                conn.close()
            
            return sqlite_path
        except Exception as e:
            logger.error(f"File conversion error: {e}")
            raise
    
    def get_db_info(self, session_id: str) -> Dict[str, Any]:
        """Retrieve database info for a session."""
        db_info = self.user_db_map.get(session_id)
        if not db_info:
            raise HTTPException(status_code=404, detail="No database found for this session")
        return db_info

# Enhanced LLM providers with multiple models
class LLMProviders:
    @staticmethod
    async def call_openai(prompt: str) -> Dict[str, Any]:
        """Call OpenAI API for SQL generation."""
        if not OPENAI_API_KEY:
            return {"success": False, "error": "OpenAI API key not configured"}
        
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        }
        
        data = {
            "model": "gpt-4",
            "messages": [
                {"role": "system", "content": "You are an expert SQL developer. Generate only valid SQLite queries without explanations or formatting."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1,
            "max_tokens": 500
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post("https://api.openai.com/v1/chat/completions", 
                                       headers=headers, json=data) as response:
                    if response.status == 200:
                        result = await response.json()
                        sql = result["choices"][0]["message"]["content"].strip()
                        return {"success": True, "sql": LLMProviders.clean_sql(sql), "model": "gpt-4"}
                    else:
                        error_text = await response.text()
                        return {"success": False, "error": f"OpenAI API error: {error_text}"}
        except Exception as e:
            logger.error(f"OpenAI API error: {e}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    async def call_deepinfra(prompt: str) -> Dict[str, Any]:
        """Call DeepInfra API to generate SQL."""
        if not DEEPINFRA_API_KEY:
            return {"success": False, "error": "DeepInfra API key not configured"}
        
        headers = {
            "Authorization": f"Bearer {DEEPINFRA_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # Updated to use a more recent model
        url = "https://api.deepinfra.com/v1/openai/chat/completions"
        data = {
            "model": "meta-llama/Meta-Llama-3-70B-Instruct",
            "messages": [
                {"role": "system", "content": "You are an expert SQL developer. Generate only valid SQLite queries without explanations or formatting."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.1,
            "max_tokens": 500
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=headers, json=data) as response:
                    if response.status == 200:
                        result = await response.json()
                        sql = result["choices"][0]["message"]["content"].strip()
                        return {"success": True, "sql": LLMProviders.clean_sql(sql), "model": "llama-3-70b"}
                    else:
                        error_text = await response.text()
                        return {"success": False, "error": f"DeepInfra API error: {error_text}"}
        except Exception as e:
            logger.error(f"DeepInfra API error: {e}")
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def clean_sql(sql_text: str) -> str:
        """Clean and extract SQL from LLM response."""
        # Remove markdown formatting
        sql_text = re.sub(r'```sql\n?', '', sql_text)
        sql_text = re.sub(r'```\n?', '', sql_text)
        
        # Remove common prefixes
        sql_text = re.sub(r'^(SQL Query:|Query:|SQL:)\s*', '', sql_text, flags=re.IGNORECASE)
        
        # Extract the actual SQL query
        lines = sql_text.strip().split('\n')
        sql_lines = []
        
        for line in lines:
            line = line.strip()
            if line and not line.startswith('--') and not line.startswith('#'):
                sql_lines.append(line)
        
        return ' '.join(sql_lines).strip()
    
    @staticmethod
    def extract_enhanced_schema(db_path: str) -> Dict[str, Any]:
        """Extract comprehensive database schema information."""
        conn = sqlite3.connect(db_path)
        try:
            cursor = conn.cursor()
            schema_info = {
                'tables': [],
                'sample_data': {},
                'stats': {}
            }
            
            # Get all tables
            tables = cursor.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()
            
            for (table_name,) in tables:
                # Get column information
                columns = cursor.execute(f"PRAGMA table_info({table_name});").fetchall()
                column_info = [
                    {
                        'name': col[1],
                        'type': col[2],
                        'not_null': bool(col[3]),
                        'primary_key': bool(col[5])
                    }
                    for col in columns
                ]
                
                # Get sample data (first 3 rows)
                sample_data = cursor.execute(f"SELECT * FROM {table_name} LIMIT 3;").fetchall()
                column_names = [col['name'] for col in column_info]
                
                # Get basic statistics
                row_count = cursor.execute(f"SELECT COUNT(*) FROM {table_name};").fetchone()[0]
                
                schema_info['tables'].append({
                    'name': table_name,
                    'columns': column_info,
                    'row_count': row_count
                })
                
                schema_info['sample_data'][table_name] = [
                    dict(zip(column_names, row)) for row in sample_data
                ]
            
            return schema_info
        finally:
            conn.close()
    
    @staticmethod
    async def generate_with_fallback(prompt: str, preference: str = "auto") -> Dict[str, Any]:
        """Generate SQL with fallback between different LLM providers."""
        providers = []
        
        if preference == "openai" and OPENAI_API_KEY:
            providers = [LLMProviders.call_openai]
        elif preference == "deepinfra" and DEEPINFRA_API_KEY:
            providers = [LLMProviders.call_deepinfra]
        else:
            # Auto mode - try available providers in order of preference
            if OPENAI_API_KEY:
                providers.append(LLMProviders.call_openai)
            if DEEPINFRA_API_KEY:
                providers.append(LLMProviders.call_deepinfra)
        
        if not providers:
            return {"success": False, "error": "No LLM providers configured"}
        
        # Try each provider
        for provider in providers:
            try:
                result = await provider(prompt)
                if result.get("success"):
                    return result
                logger.warning(f"Provider failed: {result.get('error')}")
            except Exception as e:
                logger.error(f"Provider exception: {e}")
                continue
        
        return {"success": False, "error": "All LLM providers failed"}

def generate_enhanced_prompt(query: str, schema_info: Dict[str, Any]) -> str:
    """Generate an enhanced prompt for better SQL generation."""
    
    # Build schema description
    schema_parts = []
    for table in schema_info['tables']:
        table_name = table['name']
        columns = table['columns']
        row_count = table['row_count']
        
        column_descriptions = []
        for col in columns:
            col_desc = f"{col['name']} ({col['type']}"
            if col['not_null']:
                col_desc += ", NOT NULL"
            if col['primary_key']:
                col_desc += ", PRIMARY KEY"
            col_desc += ")"
            column_descriptions.append(col_desc)
        
        table_desc = f"Table '{table_name}' ({row_count} rows):\n  - " + "\n  - ".join(column_descriptions)
        
        # Add sample data if available
        if table_name in schema_info['sample_data'] and schema_info['sample_data'][table_name]:
            sample_data = schema_info['sample_data'][table_name]
            table_desc += f"\n  Sample data: {json.dumps(sample_data[:2], indent=2)}"
        
        schema_parts.append(table_desc)
    
    schema_description = "\n\n".join(schema_parts)
    
    return f"""You are an expert SQL developer. Generate a precise SQLite query based on the following:

DATABASE SCHEMA:
{schema_description}

NATURAL LANGUAGE QUERY: {query}

REQUIREMENTS:
- Generate ONLY the SQL query, no explanations or formatting
- Use proper SQLite syntax
- Be case-sensitive with column names
- Use appropriate WHERE, GROUP BY, ORDER BY clauses as needed
- For aggregations, use proper GROUP BY clauses
- Handle NULL values appropriately

SQL Query:"""

# Initialize session manager
session_manager = SessionManager()

@app.post("/upload", response_model=Dict[str, str])
async def upload_file(file: UploadFile = File(...)):
    """Handle file uploads and create a new session."""
    try:
        session_id = session_manager.create_session(file)
        return {"message": "Upload successful", "session_id": session_id}
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/generate-sql", response_model=SQLGenerationResponse)
async def generate_sql(req: QueryRequest):
    """Generate and execute SQL based on natural language query."""
    try:
        # Get database info for the session
        db_info = session_manager.get_db_info(req.session_id)
        db_path = db_info['db_path']
        
        # Extract enhanced database schema
        schema_info = LLMProviders.extract_enhanced_schema(db_path)
        
        # Generate enhanced prompt
        prompt = generate_enhanced_prompt(req.query, schema_info)
        
        # Generate SQL via LLM with fallback
        api_response = await LLMProviders.generate_with_fallback(prompt, req.model_preference)
        
        if not api_response.get("success"):
            return SQLGenerationResponse(
                sql="", 
                error=api_response.get("error", "Unknown error")
            )
        
        sql = api_response["sql"]
        model_used = api_response.get("model", "unknown")
        
        # Validate and execute SQL
        conn = sqlite3.connect(db_path)
        try:
            cursor = conn.cursor()
            
            # Basic SQL injection prevention
            dangerous_keywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE']
            sql_upper = sql.upper()
            for keyword in dangerous_keywords:
                if keyword in sql_upper and 'SELECT' not in sql_upper:
                    return SQLGenerationResponse(
                        sql=sql,
                        error="Query contains potentially dangerous operations. Only SELECT queries are allowed."
                    )
            
            cursor.execute(sql)
            
            columns = [description[0] for description in cursor.description] if cursor.description else []
            raw_results = cursor.fetchall()
            
            results = [
                {columns[i]: value for i, value in enumerate(row)} 
                for row in raw_results
            ]
            
            # Calculate confidence score based on results
            confidence_score = min(1.0, len(results) / 100.0) if results else 0.5
            
            return SQLGenerationResponse(
                sql=sql, 
                results=results,
                model_used=model_used,
                confidence_score=confidence_score,
                explanation=f"Query executed successfully, returned {len(results)} rows"
            )
        
        except sqlite3.Error as e:
            logger.error(f"SQL Execution Error: {e}")
            return SQLGenerationResponse(
                sql=sql, 
                error=f"SQL execution error: {str(e)}",
                model_used=model_used
            )
        finally:
            conn.close()
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        return SQLGenerationResponse(
            sql="", 
            error=f"Unexpected error: {str(e)}"
        )

@app.get("/schemas/{session_id}")
async def get_schema(session_id: str):
    """Retrieve comprehensive database schema for a given session."""
    try:
        db_info = session_manager.get_db_info(session_id)
        schema_info = LLMProviders.extract_enhanced_schema(db_info['db_path'])
        
        return {
            "success": True, 
            "schema": schema_info,
            "session_info": {
                "created_at": db_info['created_at'].isoformat(),
                "original_filename": db_info['original_filename']
            }
        }
    
    except HTTPException as he:
        return JSONResponse(status_code=he.status_code, content={"success": False, "error": he.detail})
    except Exception as e:
        logger.error(f"Schema retrieval error: {e}")
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@app.get("/health")
async def health_check():
    """Health check endpoint with LLM provider status."""
    providers_status = {
        "openai": bool(OPENAI_API_KEY),
        "deepinfra": bool(DEEPINFRA_API_KEY),
    }
    
    return {
        "status": "healthy",
        "providers": providers_status,
        "active_sessions": len(session_manager.user_db_map)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)