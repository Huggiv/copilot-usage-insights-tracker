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
- `GET /ready`
- `GET /metrics`

Operational notes:

- API responses include `X-Request-Id` for trace correlation.
- Backend logs emit structured JSON per request with method, path, status, duration, and request ID.
- `/metrics` exposes ingestion/query counters and query latency aggregates.

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

Query options:

- `days` (default `30`, use `0` for all-time)
- `page` (default `1`)
- `page_size` (default `100`, max `1000`)

Response shape:

```json
{
  "items": [],
  "page": 1,
  "page_size": 100,
  "total": 0,
  "total_pages": 0
}
```

### Users for filter dropdown
- `GET /api/v1/users`

### Summary metrics
- `GET /api/v1/summary`
- `GET /api/v1/summary?user_id=alex`

Use `days=0` to request all-time summary totals.

### Model usage list
- `GET /api/v1/model-usage`
- `GET /api/v1/model-usage?user_id=alex&model=gpt-4o`

Query options:

- `days` (default `30`, use `0` for all-time)
- `page` (default `1`)
- `page_size` (default `100`, max `1000`)

Response shape matches the sessions pagination envelope.

## Security and Runtime Controls

The collector now supports environment-driven API hardening controls.

- `APP_ENV`: Runtime environment (`development`, `test`, `production`, etc.).
- `API_AUTH_REQUIRED`: Optional override (`true`/`false`). If unset, auth is required automatically outside dev/test/local environments.
- `API_AUTH_TOKEN`: Shared token for write endpoints. Accepted as `Authorization: Bearer <token>` or `X-API-Key: <token>`.
- `CORS_ALLOWED_ORIGINS`: Comma-separated list of allowed origins. In non-dev environments, default is no allowed origins unless explicitly set.
- `MAX_INGEST_BODY_BYTES`: Max allowed POST payload size for ingestion endpoints. Default `1048576`.
- `RATE_LIMIT_WINDOW_SECONDS`: Sliding rate-limit window for write endpoints. Default `60`.
- `RATE_LIMIT_MAX_REQUESTS`: Max write requests allowed per client/path within the window. Default `120`.

Write endpoints protected by auth and limits:

- `POST /api/v1/sessions`
- `POST /api/v1/sessions/batch`
- `POST /api/v1/model-usage`
- `POST /api/v1/model-usage/batch`

Batch ingestion behavior:

- Batch endpoints are idempotent by logical key and update existing rows when replayed.
- Batch upserts run in a single transaction per request.

## Data Normalization and Migrations

- Session timestamp fields (`started_at`, `ended_at`) are normalized to UTC ISO format (`YYYY-MM-DDTHH:MM:SSZ`) on ingest.
- `model_usage.date` accepts `YYYY-MM-DD` or ISO timestamp values and is normalized to `YYYY-MM-DD`.
- Backend startup runs explicit tracked SQL migrations via `schema_migrations` table.
- Migrations currently cover compatibility columns and query indexes for common filters (`user_id`, `started_at/date`, `model`, `session_id`).

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
