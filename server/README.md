# Copilot Usage Server Stack

This folder contains a server-side collector and dashboard for Copilot chat usage sessions.

## Components

- `backend/`: Python FastAPI receiver with SQLite persistence.
- `frontend/`: React dashboard for summary metrics and per-user filtering.
- `docker-compose.yml`: Runs backend and frontend in separate containers.

## Data Model

Each chat session is stored in SQLite (`chat_sessions` table) with:
- `session_id`
- `user_id`
- title, timestamps
- token and usage totals
- `raw_payload` JSON

## Backend API

### Health
- `GET /health`

### Upsert a session
- `POST /api/v1/sessions`

Sample payload:

```json
{
  "session_id": "sample-session-001",
  "user_id": "alex",
  "title": "Investigate parser output",
  "started_at": "2026-06-06T08:15:00Z",
  "ended_at": "2026-06-06T08:25:00Z",
  "total_input_tokens": 1200,
  "total_output_tokens": 350,
  "total_cached_tokens": 200,
  "total_tokens": 1550,
  "total_nano_aiu": 1900000000,
  "total_duration_ms": 41000,
  "model_turn_count": 4,
  "tool_call_count": 9,
  "raw_payload": {
    "source": "copilot_usage_extension"
  }
}
```

### List sessions
- `GET /api/v1/sessions`
- `GET /api/v1/sessions?user_id=alex`

### Users for filter dropdown
- `GET /api/v1/users`

### Summary metrics
- `GET /api/v1/summary`
- `GET /api/v1/summary?user_id=alex`

## Run With Docker

From this `server/` folder:

```bash
docker compose up --build
```

Then open:
- Frontend: `http://localhost:5173`
- Backend OpenAPI docs: `http://localhost:8000/docs`

## Local Run Without Docker

### Backend

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate
pip install -r requirements.txt
set DB_PATH=./local.db
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
set VITE_API_BASE_URL=http://localhost:8000
npm run dev
```
