import json
import os
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .migrations import apply_migrations
from .models import SessionRecord
from .schemas import SessionIn, SessionOut, SummaryOut, UserItem
from .models import ModelUsageRecord
from .schemas import ModelItem, ModelUsageIn, ModelUsageOut, SpendDateOut

APP_TITLE = "Copilot Usage Receiver"
AI_CREDITS_DIVISOR = 1_000_000_000
WRITE_ENDPOINTS = {
    "/api/v1/sessions",
    "/api/v1/sessions/batch",
    "/api/v1/model-usage",
    "/api/v1/model-usage/batch",
}


@dataclass(frozen=True)
class RuntimeConfig:
    environment: str
    auth_required: bool
    auth_token: str
    cors_allowed_origins: list[str]
    max_ingest_body_bytes: int
    rate_limit_window_seconds: int
    rate_limit_max_requests: int


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


def _split_csv(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


def _load_runtime_config() -> RuntimeConfig:
    environment = os.getenv("APP_ENV", "development").strip().lower()
    is_non_dev = environment not in {"dev", "development", "local", "test"}

    auth_token = os.getenv("API_AUTH_TOKEN", "").strip()
    auth_required_env = os.getenv("API_AUTH_REQUIRED")
    auth_required = is_non_dev if auth_required_env is None else _is_truthy(auth_required_env)

    cors_raw = os.getenv("CORS_ALLOWED_ORIGINS", "")
    if cors_raw.strip():
        cors_allowed_origins = _split_csv(cors_raw)
    elif is_non_dev:
        cors_allowed_origins = []
    else:
        cors_allowed_origins = ["*"]

    return RuntimeConfig(
        environment=environment,
        auth_required=auth_required,
        auth_token=auth_token,
        cors_allowed_origins=cors_allowed_origins,
        max_ingest_body_bytes=int(os.getenv("MAX_INGEST_BODY_BYTES", "1048576")),
        rate_limit_window_seconds=int(os.getenv("RATE_LIMIT_WINDOW_SECONDS", "60")),
        rate_limit_max_requests=int(os.getenv("RATE_LIMIT_MAX_REQUESTS", "120")),
    )


RUNTIME_CONFIG = _load_runtime_config()


def _error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
            }
        },
    )


class InMemoryRateLimiter:
    def __init__(self, window_seconds: int, max_requests: int) -> None:
        self.window_seconds = max(1, window_seconds)
        self.max_requests = max(1, max_requests)
        self._requests: dict[str, deque[float]] = {}

    def allow(self, key: str, now: float | None = None) -> bool:
        current = now if now is not None else time.time()
        queue = self._requests.setdefault(key, deque())
        cutoff = current - self.window_seconds
        while queue and queue[0] < cutoff:
            queue.popleft()

        if len(queue) >= self.max_requests:
            return False

        queue.append(current)
        return True


RATE_LIMITER = InMemoryRateLimiter(
    window_seconds=RUNTIME_CONFIG.rate_limit_window_seconds,
    max_requests=RUNTIME_CONFIG.rate_limit_max_requests,
)

Path(os.getenv("DB_PATH", "/app/data/copilot_usage.db")).parent.mkdir(parents=True, exist_ok=True)
Base.metadata.create_all(bind=engine)
apply_migrations(engine)

app = FastAPI(title=APP_TITLE, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=RUNTIME_CONFIG.cors_allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)

    code_map = {
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        413: "payload_too_large",
        422: "validation_error",
        429: "rate_limited",
    }
    code = code_map.get(exc.status_code, "request_error")
    return _error_response(exc.status_code, code, str(exc.detail))


@app.exception_handler(RequestValidationError)
def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    return _error_response(422, "validation_error", str(exc))


@app.middleware("http")
async def enforce_ingest_limits(request: Request, call_next):
    if request.method == "POST" and request.url.path in WRITE_ENDPOINTS:
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > RUNTIME_CONFIG.max_ingest_body_bytes:
                    return _error_response(
                        413,
                        "payload_too_large",
                        f"Payload exceeds max allowed size of {RUNTIME_CONFIG.max_ingest_body_bytes} bytes.",
                    )
            except ValueError:
                return _error_response(422, "validation_error", "Invalid Content-Length header.")

    return await call_next(request)


@app.middleware("http")
async def enforce_rate_limits(request: Request, call_next):
    if request.method == "POST" and request.url.path in WRITE_ENDPOINTS:
        client_host = request.client.host if request.client else "unknown"
        limit_key = f"{client_host}:{request.url.path}"
        if not RATE_LIMITER.allow(limit_key):
            return _error_response(429, "rate_limited", "Rate limit exceeded. Please retry later.")

    return await call_next(request)


def require_write_auth(request: Request) -> None:
    if not RUNTIME_CONFIG.auth_required:
        return

    if not RUNTIME_CONFIG.auth_token:
        raise HTTPException(
            status_code=403,
            detail={
                "error": {
                    "code": "forbidden",
                    "message": "Server misconfiguration: auth is required but API_AUTH_TOKEN is not set.",
                }
            },
        )

    auth_header = request.headers.get("authorization", "").strip()
    if auth_header.lower().startswith("bearer "):
        supplied = auth_header[7:].strip()
    else:
        supplied = request.headers.get("x-api-key", "").strip()

    if supplied != RUNTIME_CONFIG.auth_token:
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "unauthorized",
                    "message": "Missing or invalid API token.",
                }
            },
        )


@app.get("/health")
def healthcheck() -> dict:
    return {
        "status": "ok",
        "environment": RUNTIME_CONFIG.environment,
        "auth_required": RUNTIME_CONFIG.auth_required,
    }


@app.post("/api/v1/sessions", response_model=SessionOut)
def upsert_session(
    payload: SessionIn,
    _: None = Depends(require_write_auth),
    db: Session = Depends(get_db),
) -> SessionRecord:
    existing = db.scalar(select(SessionRecord).where(SessionRecord.session_id == payload.session_id))
    record = _apply_upsert(existing, payload, db)
    db.commit()
    db.refresh(record)
    return record


def _apply_upsert(existing: SessionRecord | None, payload: SessionIn, db: Session) -> SessionRecord:
    """Shared upsert logic used by both single and batch endpoints."""
    if existing is None:
        existing = SessionRecord(session_id=payload.session_id, user_id=payload.user_id, raw_payload="{}")
        db.add(existing)
    else:
        # Increment patch counter each time an existing session is re-posted.
        existing.patch_count = (existing.patch_count or 0) + 1

    existing.user_id = payload.user_id
    existing.title = payload.title
    existing.started_at = payload.started_at
    existing.ended_at = payload.ended_at
    existing.total_input_tokens = payload.total_input_tokens
    existing.total_output_tokens = payload.total_output_tokens
    existing.total_cached_tokens = payload.total_cached_tokens
    existing.total_tokens = payload.total_tokens
    existing.total_nano_aiu = payload.total_nano_aiu
    existing.total_duration_ms = payload.total_duration_ms
    existing.model_turn_count = payload.model_turn_count
    existing.tool_call_count = payload.tool_call_count
    existing.raw_payload = json.dumps(payload.raw_payload)
    return existing


def _model_usage_key(
    *,
    date: str,
    user_id: str,
    model: str,
    session_id: str | None,
) -> tuple[str, str, str, str]:
    return (date, user_id, model, session_id or "")


def _apply_model_usage_upsert(
    existing: ModelUsageRecord | None,
    payload: ModelUsageIn,
    db: Session,
) -> ModelUsageRecord:
    if existing is None:
        existing = ModelUsageRecord(
            session_id=payload.session_id,
            date=payload.date,
            user_id=payload.user_id,
            model=payload.model,
        )
        db.add(existing)
    else:
        existing.session_id = payload.session_id

    existing.nano_aiu = payload.nano_aiu
    existing.input_tokens = payload.input_tokens
    existing.output_tokens = payload.output_tokens
    existing.session_count = payload.session_count
    existing.request_count = payload.request_count
    return existing


@app.post("/api/v1/sessions/batch", response_model=list[SessionOut])
def upsert_sessions_batch(
    payload: list[SessionIn],
    _: None = Depends(require_write_auth),
    db: Session = Depends(get_db),
) -> list[SessionRecord]:
    """Upsert multiple sessions in a single request (max 500)."""
    if len(payload) > 500:
        raise HTTPException(status_code=422, detail="Batch size must not exceed 500 sessions.")

    # Fetch all existing records matching the incoming session IDs in one query.
    ids = [p.session_id for p in payload]
    existing_map: dict[str, SessionRecord] = {
        r.session_id: r
        for r in db.scalars(select(SessionRecord).where(SessionRecord.session_id.in_(ids)))
    }

    results: list[SessionRecord] = []
    for item in payload:
        record = _apply_upsert(existing_map.get(item.session_id), item, db)
        results.append(record)

    db.commit()
    for record in results:
        db.refresh(record)
    return results


@app.get("/api/v1/sessions", response_model=list[SessionOut])
def list_sessions(
    user_id: str | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=365),
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[SessionRecord]:
    from datetime import date as dt_date, timedelta
    
    cutoff = (dt_date.today() - timedelta(days=days)).isoformat()
    
    query = (
        select(SessionRecord)
        .where(SessionRecord.started_at.is_not(None))
        .where(SessionRecord.started_at >= cutoff)
        .order_by(SessionRecord.started_at.desc())
        .limit(limit)
    )
    if user_id:
        query = query.where(SessionRecord.user_id == user_id)
    return list(db.scalars(query))


@app.get("/api/v1/users", response_model=list[UserItem])
def list_users(db: Session = Depends(get_db)) -> list[UserItem]:
    rows = db.execute(
        select(SessionRecord.user_id)
        .where(SessionRecord.user_id.is_not(None))
        .distinct()
        .order_by(SessionRecord.user_id.asc())
    ).all()
    return [UserItem(user_id=row[0]) for row in rows if row[0]]


@app.get("/api/v1/summary", response_model=SummaryOut)
def get_summary(
    user_id: str | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
) -> SummaryOut:
    from datetime import date as dt_date, timedelta
    
    filters = []
    if user_id:
        filters.append(SessionRecord.user_id == user_id)
    
    # Add date filtering
    cutoff = (dt_date.today() - timedelta(days=days)).isoformat()
    filters.append(SessionRecord.started_at.is_not(None))
    filters.append(SessionRecord.started_at >= cutoff)

    agg = db.execute(
        select(
            func.count(SessionRecord.id),
            func.count(func.distinct(SessionRecord.user_id)),
            func.coalesce(func.sum(SessionRecord.total_input_tokens), 0),
            func.coalesce(func.sum(SessionRecord.total_output_tokens), 0),
            func.coalesce(func.sum(SessionRecord.total_cached_tokens), 0),
            func.coalesce(func.sum(SessionRecord.total_tokens), 0),
            func.coalesce(func.sum(SessionRecord.total_nano_aiu), 0),
            func.coalesce(func.sum(SessionRecord.total_duration_ms), 0),
            func.coalesce(func.sum(SessionRecord.model_turn_count), 0),
            func.coalesce(func.sum(SessionRecord.tool_call_count), 0),
        ).where(*filters)
    ).one()

    total_nano_aiu = int(agg[6])
    total_credits = round(total_nano_aiu / AI_CREDITS_DIVISOR, 4)

    return SummaryOut(
        total_sessions=int(agg[0]),
        distinct_users=int(agg[1]),
        total_input_tokens=int(agg[2]),
        total_output_tokens=int(agg[3]),
        total_cached_tokens=int(agg[4]),
        total_tokens=int(agg[5]),
        total_nano_aiu=total_nano_aiu,
        total_ai_credits=total_credits,
        total_cost_usd=round(total_credits * 0.01, 6),
        total_duration_ms=int(agg[7]),
        total_model_turns=int(agg[8]),
        total_tool_calls=int(agg[9]),
    )


# ── Spend summary (date-grouped from sessions) ───────────────────────────────

@app.get("/api/v1/spend-summary", response_model=list[SpendDateOut])
def get_spend_summary(
    user_id: str | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
) -> list[SpendDateOut]:
    """Session metrics grouped by calendar date (from started_at), newest first."""
    from datetime import date as dt_date, timedelta
    cutoff = (dt_date.today() - timedelta(days=days)).isoformat()

    filters = [
        SessionRecord.started_at.is_not(None),
        SessionRecord.started_at >= cutoff,
    ]
    if user_id:
        filters.append(SessionRecord.user_id == user_id)

    date_expr = func.substr(SessionRecord.started_at, 1, 10)

    rows = db.execute(
        select(
            date_expr.label("date"),
            func.count(SessionRecord.id),
            func.coalesce(func.sum(SessionRecord.total_input_tokens), 0),
            func.coalesce(func.sum(SessionRecord.total_output_tokens), 0),
            func.coalesce(func.sum(SessionRecord.total_cached_tokens), 0),
            func.coalesce(func.sum(SessionRecord.total_tokens), 0),
            func.coalesce(func.sum(SessionRecord.total_nano_aiu), 0),
            func.coalesce(func.sum(SessionRecord.model_turn_count), 0),
            func.coalesce(func.sum(SessionRecord.tool_call_count), 0),
        ).where(*filters).group_by(date_expr).order_by(date_expr.desc())
    ).all()

    result = []
    for row in rows:
        nano_aiu = int(row[6])
        ai_credits = round(nano_aiu / AI_CREDITS_DIVISOR, 4)
        result.append(SpendDateOut(
            date=row[0] or "unknown",
            session_count=int(row[1]),
            total_input_tokens=int(row[2]),
            total_output_tokens=int(row[3]),
            total_cached_tokens=int(row[4]),
            total_tokens=int(row[5]),
            total_nano_aiu=nano_aiu,
            total_ai_credits=ai_credits,
            total_cost_usd=round(ai_credits * 0.01, 6),
            model_turn_count=int(row[7]),
            tool_call_count=int(row[8]),
        ))
    return result


# ── Model-level usage ────────────────────────────────────────────────────────

@app.post("/api/v1/model-usage", response_model=ModelUsageOut)
def upsert_model_usage(
    payload: ModelUsageIn,
    _: None = Depends(require_write_auth),
    db: Session = Depends(get_db),
) -> ModelUsageOut:
    """Upsert model-level usage keyed by (date, user_id, model)."""
    query = select(ModelUsageRecord).where(
        ModelUsageRecord.date == payload.date,
        ModelUsageRecord.user_id == payload.user_id,
        ModelUsageRecord.model == payload.model,
    )
    if payload.session_id:
        query = query.where(ModelUsageRecord.session_id == payload.session_id)
    else:
        query = query.where(ModelUsageRecord.session_id.is_(None))

    existing = db.scalar(query)
    existing = _apply_model_usage_upsert(existing, payload, db)
    db.commit()
    db.refresh(existing)
    return ModelUsageOut(
        date=existing.date,
        user_id=existing.user_id,
        model=existing.model,
        nano_aiu=existing.nano_aiu,
        input_tokens=existing.input_tokens,
        output_tokens=existing.output_tokens,
        session_count=existing.session_count,
        request_count=existing.request_count,
        ai_credits=round(existing.nano_aiu / AI_CREDITS_DIVISOR, 4),
    )


@app.post("/api/v1/model-usage/batch", response_model=list[ModelUsageOut])
def upsert_model_usage_batch(
    payload: list[ModelUsageIn],
    _: None = Depends(require_write_auth),
    db: Session = Depends(get_db),
) -> list[ModelUsageOut]:
    """Upsert model-level usage rows in batch (max 2000)."""
    if not payload:
        return []

    if len(payload) > 2000:
        raise HTTPException(status_code=422, detail="Batch size must not exceed 2000 model-usage rows.")

    existing_rows = list(
        db.scalars(
            select(ModelUsageRecord).where(
                ModelUsageRecord.date.in_({item.date for item in payload}),
                ModelUsageRecord.user_id.in_({item.user_id for item in payload}),
                ModelUsageRecord.model.in_({item.model for item in payload}),
            )
        )
    )
    existing_map: dict[tuple[str, str, str, str], ModelUsageRecord] = {
        _model_usage_key(
            date=row.date,
            user_id=row.user_id,
            model=row.model,
            session_id=row.session_id,
        ): row
        for row in existing_rows
    }

    rows: list[ModelUsageRecord] = []
    for item in payload:
        key = _model_usage_key(
            date=item.date,
            user_id=item.user_id,
            model=item.model,
            session_id=item.session_id,
        )
        row = _apply_model_usage_upsert(existing_map.get(key), item, db)
        existing_map[key] = row
        rows.append(row)

    db.commit()
    return [
        ModelUsageOut(
            date=row.date,
            user_id=row.user_id,
            model=row.model,
            nano_aiu=row.nano_aiu,
            input_tokens=row.input_tokens,
            output_tokens=row.output_tokens,
            session_count=row.session_count,
            request_count=row.request_count,
            ai_credits=round(row.nano_aiu / AI_CREDITS_DIVISOR, 4),
        )
        for row in rows
    ]


@app.get("/api/v1/model-usage", response_model=list[ModelUsageOut])
def list_model_usage(
    user_id: str | None = Query(default=None),
    date: str | None = Query(default=None),
    model: str | None = Query(default=None),
    days: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
) -> list[ModelUsageOut]:
    """List stored model-level usage, optionally filtered by user_id, date range, and/or model."""
    from datetime import date as dt_date, timedelta
    cutoff = (dt_date.today() - timedelta(days=days)).isoformat()

    query = select(
        ModelUsageRecord.date,
        ModelUsageRecord.user_id,
        ModelUsageRecord.model,
        func.coalesce(func.sum(ModelUsageRecord.nano_aiu), 0),
        func.coalesce(func.sum(ModelUsageRecord.input_tokens), 0),
        func.coalesce(func.sum(ModelUsageRecord.output_tokens), 0),
        func.coalesce(func.sum(ModelUsageRecord.session_count), 0),
        func.coalesce(func.sum(ModelUsageRecord.request_count), 0),
    ).where(
        ModelUsageRecord.date.is_not(None),
        ModelUsageRecord.date >= cutoff,
    )
    if user_id:
        query = query.where(ModelUsageRecord.user_id == user_id)
    if date:
        query = query.where(ModelUsageRecord.date == date)
    if model:
        query = query.where(ModelUsageRecord.model == model)

    query = query.group_by(
        ModelUsageRecord.date,
        ModelUsageRecord.user_id,
        ModelUsageRecord.model,
    ).order_by(
        ModelUsageRecord.date.desc(),
        func.sum(ModelUsageRecord.nano_aiu).desc(),
    )

    records = db.execute(query).all()
    return [
        ModelUsageOut(
            date=r[0],
            user_id=r[1],
            model=r[2],
            nano_aiu=int(r[3]),
            input_tokens=int(r[4]),
            output_tokens=int(r[5]),
            session_count=int(r[6]),
            request_count=int(r[7]),
            ai_credits=round(int(r[3]) / AI_CREDITS_DIVISOR, 4),
        )
        for r in records
    ]


@app.get("/api/v1/models", response_model=list[ModelItem])
def list_models(
    user_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[ModelItem]:
    query = select(ModelUsageRecord.model).where(ModelUsageRecord.model.is_not(None))
    if user_id:
        query = query.where(ModelUsageRecord.user_id == user_id)

    rows = db.execute(query.distinct().order_by(ModelUsageRecord.model.asc())).all()
    return [ModelItem(model=row[0]) for row in rows if row[0]]
