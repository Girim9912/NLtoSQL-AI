# Enhanced backend/main.py with security, performance, and reliability improvements

from fastapi import FastAPI, File, UploadFile, Request, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, validator, Field
from dotenv import load_dotenv
import os
import shutil
import sqlite3
import pandas as pd
import uuid
import requests
import logging
import asyncio
import aiofiles
from typing import List, Dict, Any, Optional
from contextlib import asynccontextmanager
import time
from datetime import datetime, timedelta
import hashlib
import json
from functools import lru_cache
import asyncpg
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

# Enhanced logging with structured format
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()
DEEPINFRA_API_KEY = os.getenv("DEEPINFRA_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
MAX_FILE_SIZE = int(os.getenv("MAX_FILE_SIZE", 50 * 1024 * 1024))  # 50MB default
SESSION_TIMEOUT = int(os.getenv("SESSION_TIMEOUT", 3600))  # 1 hour default
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", 100))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", 3600))

# API endpoints configuration
DEEPINFRA_ENDPOINTS = {
    "llama2": "https://api.deepinfra.com/v1/inference/meta-llama/Llama-2-70b-chat-hf",
    "codellama": "https://api.deepinfra.com/v1/inference/codellama/CodeLlama-34b-Instruct-hf",
    "mistral": "https://api.deepinfra.com/v1/inference/mistralai/Mistral-7B-Instruct-v0.1"
}

# Security configuration
security = HTTPBearer(auto_error=False)
ALLOWED_FILE_TYPES = {'.csv', '.xlsx', '.xls', '.json', '.db', '.sqlite'}
MAX_SQL_LENGTH = 2000
MAX_QUERY_LENGTH = 1000

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    logger.info("Starting NLtoSQL AI Backend")
    # Startup
    session_manager.cleanup_old_sessions()
    yield
    # Shutdown
    logger.info("Shutting down NLtoSQL AI Backend")
    session_manager.cleanup_all_sessions()

app = FastAPI(
    title="NLtoSQL AI Backend",
    description="Secure Natural Language to SQL Query Generator with Advanced Features",
    version="0.3.0",
    lifespan=lifespan
)

# Enhanced CORS with security considerations
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
    expose_headers=["X-Rate-Limit-Remaining", "X-Rate-Limit-Reset"]
)

# Enhanced data models with comprehensive validation
class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=MAX_QUERY_LENGTH)
    session_id: str = Field(..., regex=r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
    model_preference: Optional[str] = Field("llama2", regex=r'^(llama2|codellama|mistral)$')
    
    @validator('query')
    def validate_query(cls, v):
        # Basic SQL injection prevention
        dangerous_keywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE']
        query_upper = v.upper()
        if any(keyword in query_upper for keyword in dangerous_keywords):
            raise ValueError('Query contains potentially dangerous keywords')
        return v.strip()

class SQLGenerationResponse(BaseModel):
    sql: str
    results: List[Dict[str, Any]] = []
    error: Optional[str] = None
    execution_time: Optional[float] = None
    row_count: Optional[int] = None
    model_used: Optional[str] = None

class SessionInfo(BaseModel):
    session_id: str
    created_at: datetime
    file_name: str
    file_size: int
    table_count: int
    expires_at: datetime

# Rate limiting middleware
class RateLimiter:
    def __init__(self):
        self.requests = {}
    
    def is_allowed(self, client_ip: str) -> tuple[bool, int]:
        now = time.time()
        if client_ip not in self.requests:
            self.requests[client_ip] = []
        
        # Clean old requests
        self.requests[client_ip] = [
            req_time for req_time in self.requests[client_ip] 
            if now - req_time < RATE_LIMIT_WINDOW
        ]
        
        if len(self.requests[client_ip]) >= RATE_LIMIT_REQUESTS:
            return False, 0
        
        self.requests[client_ip].append(now)
        return True, RATE_LIMIT_REQUESTS - len(self.requests[client_ip])

rate_limiter = RateLimiter()

async def check_rate_limit(request: Request):
    client_ip = request.client.host
    allowed, remaining = rate_limiter.is_allowed(client_ip)
    
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Try again later."
        )
    
    return remaining

# Enhanced session management with security and cleanup
class SessionManager:
    def __init__(self, temp_dir='temp'):
        self.sessions = {}
        self.temp_dir = temp_dir
        os.makedirs(temp_dir, exist_ok=True)
        logger.info(f"Session manager initialized with temp dir: {temp_dir}")
    
    async def create_session(self, file: UploadFile) -> tuple[str, SessionInfo]:
        """Create a new session with enhanced security and validation."""
        # Validate file
        await self._validate_file(file)
        
        session_id = str(uuid.uuid4())
        file_ext = self._get_file_extension(file.filename)
        file_path = os.path.join(self.temp_dir, f"{session_id}{file_ext}")
        
        try:
            # Save file asynchronously
            file_size = await self._save_file_async(file, file_path)
            
            # Convert to SQLite
            sqlite_path, table_count = await self._convert_to_sqlite_async(file_path, session_id, file_ext)
            
            # Create session info
            session_info = SessionInfo(
                session_id=session_id,
                created_at=datetime.now(),
                file_name=file.filename,
                file_size=file_size,
                table_count=table_count,
                expires_at=datetime.now() + timedelta(seconds=SESSION_TIMEOUT)
            )
            
            self.sessions[session_id] = {
                'db_path': sqlite_path,
                'info': session_info,
                'access_count': 0,
                'last_accessed': datetime.now()
            }
            
            # Clean up original file if different from SQLite
            if file_path != sqlite_path:
                os.remove(file_path)
            
            logger.info(f"Session created: {session_id}")
            return session_id, session_info
            
        except Exception as e:
            logger.error(f"Session creation failed: {e}")
            # Cleanup on failure
            for path in [file_path, os.path.join(self.temp_dir, f"{session_id}.db")]:
                if os.path.exists(path):
                    os.remove(path)
            raise HTTPException(status_code=400, detail=f"Session creation failed: {str(e)}")
    
    async def _validate_file(self, file: UploadFile):
        """Validate uploaded file for security and constraints."""
        if not file.filename:
            raise ValueError("No filename provided")
        
        file_ext = self._get_file_extension(file.filename)
        if file_ext not in ALLOWED_FILE_TYPES:
            raise ValueError(f"File type {file_ext} not allowed")
        
        # Check file size
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise ValueError(f"File size exceeds maximum allowed ({MAX_FILE_SIZE} bytes)")
        
        # Reset file pointer
        await file.seek(0)
    
    def _get_file_extension(self, filename: str) -> str:
        """Extract and validate file extension."""
        if not filename or '.' not in filename:
            raise ValueError("Invalid filename")
        return '.' + filename.split(".")[-1].lower()
    
    async def _save_file_async(self, file: UploadFile, file_path: str) -> int:
        """Save uploaded file asynchronously."""
        file_size = 0
        async with aiofiles.open(file_path, 'wb') as f:
            while chunk := await file.read(8192):  # 8KB chunks
                await f.write(chunk)
                file_size += len(chunk)
        return file_size
    
    async def _convert_to_sqlite_async(self, file_path: str, session_id: str, file_ext: str) -> tuple[str, int]:
        """Convert various file types to SQLite database asynchronously."""
        sqlite_path = os.path.join(self.temp_dir, f"{session_id}.db")
        
        try:
            if file_ext == '.csv':
                df = pd.read_csv(file_path, encoding='utf-8')
            elif file_ext in ['.xls', '.xlsx']:
                df = pd.read_excel(file_path, sheet_name=None)  # Read all sheets
                if isinstance(df, dict):
                    # Multiple sheets
                    conn = sqlite3.connect(sqlite_path)
                    table_count = 0
                    for sheet_name, sheet_df in df.items():
                        if not sheet_df.empty:
                            sheet_df.to_sql(f"sheet_{sheet_name}", conn, if_exists="replace", index=False)
                            table_count += 1
                    conn.close()
                    return sqlite_path, table_count
                else:
                    # Single sheet
                    df = df
            elif file_ext == '.json':
                df = pd.read_json(file_path)
            elif file_ext in ['.db', '.sqlite']:
                if file_path != sqlite_path:
                    shutil.copy(file_path, sqlite_path)
                # Count tables in existing database
                conn = sqlite3.connect(sqlite_path)
                cursor = conn.cursor()
                cursor.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table';")
                table_count = cursor.fetchone()[0]
                conn.close()
                return sqlite_path, table_count
            else:
                raise ValueError(f"Unsupported file format: {file_ext}")
            
            # For single dataframe cases
            if isinstance(df, pd.DataFrame):
                conn = sqlite3.connect(sqlite_path)
                df.to_sql("data", conn, if_exists="replace", index=False)
                conn.close()
                return sqlite_path, 1
            
        except Exception as e:
            logger.error(f"File conversion error: {e}")
            raise ValueError(f"Failed to convert file: {str(e)}")
    
    def get_session(self, session_id: str) -> dict:
        """Retrieve session with access tracking."""
        if session_id not in self.sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session = self.sessions[session_id]
        
        # Check if session expired
        if datetime.now() > session['info'].expires_at:
            self.cleanup_session(session_id)
            raise HTTPException(status_code=410, detail="Session expired")
        
        # Update access tracking
        session['access_count'] += 1
        session['last_accessed'] = datetime.now()
        
        return session
    
    def cleanup_session(self, session_id: str):
        """Clean up a specific session."""
        if session_id in self.sessions:
            session = self.sessions[session_id]
            db_path = session['db_path']
            if os.path.exists(db_path):
                os.remove(db_path)
            del self.sessions[session_id]
            logger.info(f"Session cleaned up: {session_id}")
    
    def cleanup_old_sessions(self):
        """Clean up expired sessions."""
        now = datetime.now()
        expired_sessions = [
            sid for sid, session in self.sessions.items()
            if now > session['info'].expires_at
        ]
        
        for session_id in expired_sessions:
            self.cleanup_session(session_id)
        
        logger.info(f"Cleaned up {len(expired_sessions)} expired sessions")
    
    def cleanup_all_sessions(self):
        """Clean up all sessions (for shutdown)."""
        session_ids = list(self.sessions.keys())
        for session_id in session_ids:
            self.cleanup_session(session_id)

# Initialize session manager
session_manager = SessionManager()

# Enhanced LLM providers with fallback and caching
class LLMProviders:
    def __init__(self):
        self.cache = {}
        self.cache_ttl = 300  # 5 minutes
    
    def _get_cache_key(self, prompt: str, model: str) -> str:
        """Generate cache key for prompt."""
        return hashlib.md5(f"{model}:{prompt}".encode()).hexdigest()
    
    def _is_cache_valid(self, cache_entry: dict) -> bool:
        """Check if cache entry is still valid."""
        return time.time() - cache_entry['timestamp'] < self.cache_ttl
    
    async def generate_sql(self, prompt: str, model: str = "llama2") -> Dict[str, Any]:
        """Generate SQL with caching and fallback."""
        cache_key = self._get_cache_key(prompt, model)
        
        # Check cache first
        if cache_key in self.cache and self._is_cache_valid(self.cache[cache_key]):
            logger.info(f"Cache hit for model {model}")
            return self.cache[cache_key]['result']
        
        # Try primary model
        result = await self._call_api(prompt, model)
        
        # Fallback to other models if primary fails
        if not result.get("success") and model != "mistral":
            logger.warning(f"Primary model {model} failed, trying fallback")
            result = await self._call_api(prompt, "mistral")
        
        # Cache successful results
        if result.get("success"):
            self.cache[cache_key] = {
                'result': result,
                'timestamp': time.time()
            }
        
        return result
    
    async def _call_api(self, prompt: str, model: str) -> Dict[str, Any]:
        """Call specific LLM API with timeout and error handling."""
        if model not in DEEPINFRA_ENDPOINTS:
            return {"success": False, "error": f"Unknown model: {model}"}
        
        headers = {
            "Authorization": f"Bearer {DEEPINFRA_API_KEY}",
            "Content-Type": "application/json"
        }
        
        data = {
            "input": prompt,
            "temperature": 0.1,
            "max_tokens": 500,
            "stop": ["\n\n", "```"]
        }
        
        try:
            async with aiofiles.ClientSession(timeout=aiofiles.ClientTimeout(total=30)) as session:
                async with session.post(DEEPINFRA_ENDPOINTS[model], headers=headers, json=data) as response:
                    response.raise_for_status()
                    result = await response.json()
                    
                    if "results" in result and result["results"]:
                        generated_text = result["results"][0]["generated_text"]
                        sql = self._extract_sql(generated_text)
                        return {"success": True, "sql": sql, "model": model}
                    
                    return {"success": False, "error": "No results from API"}
        
        except Exception as e:
            logger.error(f"API call failed for {model}: {e}")
            return {"success": False, "error": str(e)}
    
    def _extract_sql(self, generated_text: str) -> str:
        """Extract clean SQL from generated text."""
        # Remove common prefixes and clean up
        text = generated_text.strip()
        
        # Remove markdown code blocks
        if "```sql" in text:
            text = text.split("```sql")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        
        # Remove common prefixes
        prefixes = ["SQL Query:", "Query:", "SELECT", "select"]
        for prefix in prefixes:
            if prefix in text:
                text = text.split(prefix)[-1]
                break
        
        # Clean and validate
        sql = text.strip().rstrip(';') + ';'
        
        # Basic validation
        if len(sql) > MAX_SQL_LENGTH:
            raise ValueError("Generated SQL exceeds maximum length")
        
        return sql
    
    @staticmethod
    def extract_schema(db_path: str) -> str:
        """Extract comprehensive database schema."""
        conn = sqlite3.connect(db_path)
        try:
            cursor = conn.cursor()
            schema_parts = []
            
            # Get all tables
            tables = cursor.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()
            
            for table_name, in tables:
                # Get table structure
                columns = cursor.execute(f"PRAGMA table_info({table_name});").fetchall()
                
                # Get sample data
                sample = cursor.execute(f"SELECT * FROM {table_name} LIMIT 3;").fetchall()
                
                table_info = f"Table: {table_name}\nColumns: "
                table_info += ", ".join([f"{col[1]} ({col[2]})" for col in columns])
                
                if sample:
                    table_info += f"\nSample data ({len(sample)} rows):\n"
                    col_names = [col[1] for col in columns]
                    for row in sample:
                        table_info += "  " + str(dict(zip(col_names, row))) + "\n"
                
                schema_parts.append(table_info)
            
            return "\n\n".join(schema_parts)
        finally:
            conn.close()

def generate_enhanced_prompt(query: str, schema: str) -> str:
    """Generate an enhanced prompt for better SQL generation."""
    return f"""You are an expert SQL developer. Generate a precise SQLite query for the given natural language request.

DATABASE SCHEMA:
{schema}

REQUIREMENTS:
- Write valid SQLite syntax only
- Use appropriate JOINs when querying multiple tables
- Include proper WHERE clauses for filtering
- Use aggregate functions (COUNT, SUM, AVG) when appropriate
- Optimize for performance
- Return only the SQL query, no explanations

NATURAL LANGUAGE REQUEST: {query}

SQL QUERY:"""

# Initialize LLM provider
llm_provider = LLMProviders()

# API Routes with enhanced functionality

@app.post("/upload", response_model=Dict[str, Any])
async def upload_file(
    file: UploadFile = File(...),
    rate_limit_remaining: int = Depends(check_rate_limit)
):
    """Enhanced file upload with comprehensive validation and session management."""
    try:
        session_id, session_info = await session_manager.create_session(file)
        
        return {
            "success": True,
            "message": "File uploaded successfully",
            "session_id": session_id,
            "session_info": session_info.dict(),
            "rate_limit_remaining": rate_limit_remaining
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail="Upload failed")

@app.post("/generate-sql", response_model=SQLGenerationResponse)
async def generate_sql(
    req: QueryRequest,
    rate_limit_remaining: int = Depends(check_rate_limit)
):
    """Enhanced SQL generation with performance monitoring and error handling."""
    start_time = time.time()
    
    try:
        # Get session
        session = session_manager.get_session(req.session_id)
        db_path = session['db_path']
        
        # Extract schema
        schema = LLMProviders.extract_schema(db_path)
        
        # Generate enhanced prompt
        prompt = generate_enhanced_prompt(req.query, schema)
        
        # Generate SQL using LLM
        api_response = await llm_provider.generate_sql(prompt, req.model_preference)
        
        if not api_response.get("success"):
            return SQLGenerationResponse(
                sql="",
                error=api_response.get("error", "SQL generation failed"),
                execution_time=time.time() - start_time
            )
        
        sql = api_response["sql"]
        
        # Execute SQL with safety measures
        conn = sqlite3.connect(db_path)
        try:
            cursor = conn.cursor()
            
            # Set query timeout and limits
            cursor.execute("PRAGMA query_timeout = 30000;")  # 30 seconds
            cursor.execute(sql)
            
            # Get results with pagination
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            raw_results = cursor.fetchmany(1000)  # Limit to 1000 rows
            
            results = [
                {columns[i]: value for i, value in enumerate(row)}
                for row in raw_results
            ]
            
            execution_time = time.time() - start_time
            
            return SQLGenerationResponse(
                sql=sql,
                results=results,
                execution_time=execution_time,
                row_count=len(results),
                model_used=api_response.get("model")
            )
        
        except sqlite3.Error as e:
            logger.error(f"SQL execution error: {e}")
            return SQLGenerationResponse(
                sql=sql,
                error=f"SQL execution error: {str(e)}",
                execution_time=time.time() - start_time
            )
        finally:
            conn.close()
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in generate_sql: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/sessions/{session_id}", response_model=Dict[str, Any])
async def get_session_info(session_id: str):
    """Get detailed session information."""
    try:
        session = session_manager.get_session(session_id)
        return {
            "success": True,
            "session_info": session['info'].dict(),
            "access_count": session['access_count'],
            "last_accessed": session['last_accessed'].isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Session info error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve session info")

@app.get("/schemas/{session_id}")
async def get_schema(session_id: str):
    """Enhanced schema retrieval with detailed table information."""
    try:
        session = session_manager.get_session(session_id)
        db_path = session['db_path']
        
        conn = sqlite3.connect(db_path)
        try:
            cursor = conn.cursor()
            tables = []
            
            for table_info in cursor.execute("SELECT name FROM sqlite_master WHERE type='table';"):
                table_name = table_info[0]
                
                # Get column information
                columns = []
                for column_info in cursor.execute(f"PRAGMA table_info({table_name});"):
                    columns.append({
                        "name": column_info[1],
                        "type": column_info[2],
                        "not_null": bool(column_info[3]),
                        "default_value": column_info[4],
                        "primary_key": bool(column_info[5])
                    })
                
                # Get row count
                row_count = cursor.execute(f"SELECT COUNT(*) FROM {table_name};").fetchone()[0]
                
                tables.append({
                    "name": table_name,
                    "columns": columns,
                    "row_count": row_count
                })
            
            return {"success": True, "tables": tables}
        
        finally:
            conn.close()
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Schema retrieval error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve schema")

@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Manually delete a session."""
    try:
        if session_id not in session_manager.sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        session_manager.cleanup_session(session_id)
        return {"success": True, "message": "Session deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Session deletion error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete session")

@app.get("/health")
async def health_check():
    """Health check endpoint with system status."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "active_sessions": len(session_manager.sessions),
        "version": "0.3.0"
    }

# Cleanup task (run periodically)
@app.on_event("startup")
async def startup_task():
    """Startup tasks including periodic cleanup."""
    async def periodic_cleanup():
        while True:
            await asyncio.sleep(300)  # 5 minutes
            session_manager.cleanup_old_sessions()
    
    asyncio.create_task(periodic_cleanup())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
        access_log=True
    )