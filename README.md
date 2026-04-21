# PropIQ Track Backend

Production FastAPI backend for PropIQ Track mobile app.

## Tech Stack
- FastAPI (Python 3.11)
- MongoDB Atlas
- Deployed on Railway

## Required Environment Variables
- `MONGO_URL` - MongoDB Atlas connection string
- `DB_NAME` - Database name (default: `propiq_prod`)
- `EMERGENT_LLM_KEY` - Optional, for AI-powered features

## Start Command
```bash
uvicorn server:app --host 0.0.0.0 --port $PORT
```

## Health Check
- `GET /api/health` → `{"status": "healthy"}`
- `GET /api/health/detailed` → detailed DB/auth checks
