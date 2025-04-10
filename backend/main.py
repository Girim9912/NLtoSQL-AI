from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# Allow CORS for your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str

@app.post("/generate-sql")
async def generate_sql(req: QueryRequest):
    # Placeholder logic – later we'll connect the ML model
    return {"sql": f"SELECT * FROM users WHERE name LIKE '%{req.query}%'"}

@app.get("/")
def read_root():
    return {"message": "Welcome to NLtoSQL Backend"}
