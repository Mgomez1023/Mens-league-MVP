python3 -m venv .venv 
source .venv/bin/activate 
uvicorn app.main:app --reload --port 8000
