# main.py - Enhanced FastAPI application with modular structure

from fastapi import FastAPI, File, UploadFile, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, validator
from dotenv import load_dotenv
import os
import shutil
import uuid
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncio

# Import our modular services
from services.llm_providers import LLMManager, OpenAIProvider, DeepInfraProvider, AnthropicProvider
from services.database_manager import DatabaseManager
from services.sql_validator import SQLValidator
from services.prompt_generator import PromptGenerator

# Enhanced logging
logging.basicConfig(level=logging.INFO, 
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# API Keys
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
DEEPINFRA_API_KEY = os.getenv("DEEPINFRA_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

app = FastAPI(
    title="NLtoSQL AI Backend",
    description="Enhanced Natural Language to SQL Query Generator with Multiple LLM Support",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Enhanced CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "https://yourdomain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data models
class QueryRequest(BaseModel):
    query: str
    session_id: str
    model_preference: Optional[str] = "auto"  # auto, openai, deepinfra, anthropic
    
    @validator('query')
    def query_must_not_be_empty(cls, v):
        if not v or len(v.strip()) == 0:
            raise ValueError('Query cannot be empty')
        return v.strip()

class SQLGenerationResponse(BaseModel):
    sql: str
    results: List[Dict[str, Any]] = []
    error: Optional[str] = None
    model_used: Optional[str] = None
    provider_used: Optional[str] = None
    confidence_score: float = 0.0
    explanation: Optional[str] = None
    execution_time: Optional[float] = None
    formatted_sql: Optional[str] = None

class PredictRequest(BaseModel):
    question: str
    session_id: str
    model_preference: Optional[str] = "auto"

class PredictResponse(BaseModel):
    sql: str
    results: List[Dict[str, Any]] = []
    confidence_score: float = 0.0
    model_used: Optional[str] = None
    provider_used: Optional[str] = None
    execution_time: Optional[float] = None
    error: Optional[str] = None

class SessionInfo(BaseModel):
    session_id: str
    created_at: datetime
    original_filename: str
    table_count: int
    total_rows: int

# Session management
class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, Dict[str, Any]] = {}
    
    def create_session(self, session_id: str, filename: str):
        """Create a new session"""
        self.sessions[session_id] = {
            'session_id': session_id,
            'created_at': datetime.now(),
            'original_filename': filename,
            'last_accessed': datetime.now()
        }
    
    def get_session(self, session_id: str) -> Dict[str, Any]:
        """Get session information"""
        if session_id not in self.sessions:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Update last accessed
        self.sessions[session_id]['last_accessed'] = datetime.now()
        return self.sessions[session_id]
    
    def list_sessions(self) -> List[Dict[str, Any]]:
        """List all active sessions"""
        return list(self.sessions.values())

# Initialize components
llm_manager = LLMManager()
database_manager = DatabaseManager()
sql_validator = SQLValidator()
prompt_generator = PromptGenerator()
session_manager = SessionManager()

# Initialize LLM providers
def initialize_llm_providers():
    """Initialize available LLM providers"""
    if OPENAI_API_KEY:
        openai_provider = OpenAIProvider(OPENAI_API_KEY)
        llm_manager.add_provider(openai_provider)
        logger.info("OpenAI provider initialized")
    
    if DEEPINFRA_API_KEY:
        deepinfra_provider = DeepInfraProvider(DEEPINFRA_API_KEY)
        llm_manager.add_provider(deepinfra_provider)
        logger.info("DeepInfra provider initialized")
    
    if ANTHROPIC_API_KEY:
        anthropic_provider = AnthropicProvider(ANTHROPIC_API_KEY)
        llm_manager.add_provider(anthropic_provider)
        logger.info("Anthropic provider initialized")

# Initialize providers on startup
initialize_llm_providers()

@app.post("/upload", response_model=Dict[str, str])
async def upload_file(file: UploadFile = File(...)):
    """Handle file uploads and create a new session"""
    try:
        # Save uploaded file temporarily
        temp_path = f"temp/{uuid.uuid4()}_{file.filename}"
        os.makedirs("temp", exist_ok=True)
        
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Create database from file
        session_id = database_manager.create_database_from_file(temp_path, file.filename)
        
        # Create session
        session_manager.create_session(session_id, file.filename)
        
        # Clean up temporary file
        os.remove(temp_path)
        
        logger.info(f"File uploaded and processed: {file.filename} -> session {session_id}")
        return {"message": "Upload successful", "session_id": session_id}
        
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/generate-sql", response_model=SQLGenerationResponse)
async def generate_sql(req: QueryRequest):
    """Generate and execute SQL based on natural language query"""
    start_time = datetime.now()
    
    try:
        # Validate session
        session_info = session_manager.get_session(req.session_id)
        
        # Get database schema
        schema_info = database_manager.get_schema_info(req.session_id)
        
        # Generate enhanced prompt
        prompt = prompt_generator.generate_sql_prompt(req.query, schema_info)
        
        # Generate SQL using LLM
        llm_response = await llm_manager.generate_sql(prompt, req.model_preference)
        
        if not llm_response.get("success"):
            return SQLGenerationResponse(
                sql="",
                error=llm_response.get("error", "Unknown error"),
                execution_time=(datetime.now() - start_time).total_seconds()
            )
        
        sql = llm_response["sql"]
        model_used = llm_response.get("model", "unknown")
        provider_used = llm_response.get("provider", "unknown")
        
        # Validate SQL
        validation_result = sql_validator.validate_sql(sql)
        if not validation_result["valid"]:
            return PredictResponse(
                sql=sql,
                error=f"SQL validation failed: {validation_result['error']}",
                model_used=model_used,
                provider_used=provider_used,
                execution_time=(datetime.now() - start_time).total_seconds()
            )
        
        # Execute SQL
        execution_result = database_manager.execute_query(req.session_id, sql)
        
        if not execution_result["success"]:
            return PredictResponse(
                sql=sql,
                error=execution_result["error"],
                model_used=model_used,
                provider_used=provider_used,
                execution_time=(datetime.now() - start_time).total_seconds()
            )
        
        results = execution_result["results"]
        
        # Calculate confidence score
        confidence_score = min(1.0, len(results) / 100.0) if results else 0.5
        
        execution_time = (datetime.now() - start_time).total_seconds()
        
        return PredictResponse(
            sql=sql,
            results=results,
            confidence_score=confidence_score,
            model_used=model_used,
            provider_used=provider_used,
            execution_time=execution_time
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        execution_time = (datetime.now() - start_time).total_seconds()
        return PredictResponse(
            sql="",
            error=f"Unexpected error: {str(e)}",
            execution_time=execution_time
        )

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    providers = llm_manager.get_available_providers()
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "available_providers": providers,
        "active_sessions": len(session_manager.sessions)
    }

@app.get("/schema/{session_id}")
async def get_schema(session_id: str):
    """Get database schema for a session"""
    try:
        session_info = session_manager.get_session(session_id)
        schema_info = database_manager.get_schema_info(session_id)
        
        return {
            "session_id": session_id,
            "schema": schema_info,
            "session_info": session_info
        }
    except Exception as e:
        logger.error(f"Schema retrieval error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/sessions", response_model=List[SessionInfo])
async def list_sessions():
    """List all active sessions"""
    try:
        sessions = session_manager.list_sessions()
        result = []
        
        for session in sessions:
            try:
                schema_info = database_manager.get_schema_info(session['session_id'])
                table_count = len(schema_info['tables'])
                total_rows = sum(table['row_count'] for table in schema_info['tables'])
                
                result.append(SessionInfo(
                    session_id=session['session_id'],
                    created_at=session['created_at'],
                    original_filename=session['original_filename'],
                    table_count=table_count,
                    total_rows=total_rows
                ))
            except Exception as e:
                logger.error(f"Error processing session {session['session_id']}: {e}")
                continue
        
        return result
    except Exception as e:
        logger.error(f"Session listing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/execute-sql/{session_id}")
async def execute_sql(session_id: str, sql_query: str):
    """Execute a custom SQL query"""
    try:
        session_info = session_manager.get_session(session_id)
        
        # Validate SQL
        validation_result = sql_validator.validate_sql(sql_query)
        if not validation_result["valid"]:
            raise HTTPException(status_code=400, detail=validation_result["error"])
        
        # Execute SQL
        execution_result = database_manager.execute_query(session_id, sql_query)
        
        if not execution_result["success"]:
            raise HTTPException(status_code=400, detail=execution_result["error"])
        
        return {
            "sql": sql_query,
            "formatted_sql": validation_result.get("formatted", sql_query),
            "results": execution_result["results"],
            "row_count": execution_result["row_count"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"SQL execution error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/providers")
async def list_providers():
    """List available LLM providers"""
    providers = llm_manager.get_available_providers()
    return {
        "available_providers": providers,
        "fallback_order": llm_manager.fallback_order
    }

@app.post("/providers/test")
async def test_providers():
    """Test all available providers"""
    test_prompt = "Generate a simple SELECT query to get all records from a table named 'users'"
    results = {}
    
    for provider_name in llm_manager.get_available_providers():
        try:
            result = await llm_manager.generate_sql(test_prompt, provider_name)
            results[provider_name] = {
                "success": result.get("success", False),
                "response": result.get("sql", ""),
                "error": result.get("error", None)
            }
        except Exception as e:
            results[provider_name] = {
                "success": False,
                "error": str(e)
            }
    
    return {
        "test_prompt": test_prompt,
        "results": results
    }

@app.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Delete a session and its associated database"""
    try:
        session_info = session_manager.get_session(session_id)
        
        # Delete database file
        db_path = os.path.join("temp", f"{session_id}.db")
        if os.path.exists(db_path):
            os.remove(db_path)
        
        # Remove session from manager
        del session_manager.sessions[session_id]
        
        return {"message": f"Session {session_id} deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Session deletion error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler for better error responses"""
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": str(exc) if app.debug else "An unexpected error occurred"
        }
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    ) "unknown")
        
        # Validate SQL
        validation_result = sql_validator.validate_sql(sql)
        if not validation_result["valid"]:
            return SQLGenerationResponse(
                sql=sql,
                error=f"SQL validation failed: {validation_result['error']}",
                model_used=model_used,
                provider_used=provider_used,
                execution_time=(datetime.now() - start_time).total_seconds()
            )
        
        formatted_sql = validation_result.get("formatted", sql)
        
        # Execute SQL
        execution_result = database_manager.execute_query(req.session_id, sql)
        
        if not execution_result["success"]:
            return SQLGenerationResponse(
                sql=sql,
                formatted_sql=formatted_sql,
                error=execution_result["error"],
                model_used=model_used,
                provider_used=provider_used,
                execution_time=(datetime.now() - start_time).total_seconds()
            )
        
        results = execution_result["results"]
        
        # Calculate confidence score
        confidence_score = min(1.0, len(results) / 100.0) if results else 0.5
        
        execution_time = (datetime.now() - start_time).total_seconds()
        
        return SQLGenerationResponse(
            sql=sql,
            formatted_sql=formatted_sql,
            results=results,
            model_used=model_used,
            provider_used=provider_used,
            confidence_score=confidence_score,
            explanation=f"Query executed successfully, returned {len(results)} rows",
            execution_time=execution_time
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        execution_time = (datetime.now() - start_time).total_seconds()
        return SQLGenerationResponse(
            sql="",
            error=f"Unexpected error: {str(e)}",
            execution_time=execution_time
        )

@app.post("/predict", response_model=PredictResponse)
async def predict(req: PredictRequest):
    """Predict endpoint for API integration - simplified interface"""
    start_time = datetime.now()
    
    try:
        # Validate session
        session_info = session_manager.get_session(req.session_id)
        
        # Get database schema
        schema_info = database_manager.get_schema_info(req.session_id)
        
        # Generate enhanced prompt
        prompt = prompt_generator.generate_sql_prompt(req.question, schema_info)
        
        # Generate SQL using LLM
        llm_response = await llm_manager.generate_sql(prompt, req.model_preference)
        
        if not llm_response.get("success"):
            return PredictResponse(
                sql="",
                error=llm_response.get("error", "Unknown error"),
                execution_time=(datetime.now() - start_time).total_seconds()
            )
        
        sql = llm_response["sql"]
        model_used = llm_response.get("model", "unknown")
        provider_used = llm_response.get("provider",