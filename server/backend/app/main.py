import json
import os
from pathlib import Path

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import SessionRecord
from .schemas import SessionIn, SessionOut, SummaryOut, UserItem
from .models import ModelUsageRecord
from .schemas import ModelItem, ModelUsageIn, ModelUsageOut, SpendDateOut

APP_TITLE = "Copilot Usage Receiver"
AI_CREDITS_DIVISOR = 1_000_000_000

Path(os.getenv("DB_PATH", "/app/data/copilot_usage.db")).parent.mkdir(parents=True, exist_ok=True)
Base.metadata.create_all(bind=engine)

# ── Lightweight runtime migrations (handles existing DBs without alembic) ────
from sqlalchemy import inspect as sa_inspect, text as sa_text
with engine.connect() as _conn:
    _cols = {c["name"] for c in sa_inspect(engine).get_columns("chat_sessions")}
    if "patch_count" not in _cols:
        _conn.execute(sa_text("ALTER TABLE chat_sessions ADD COLUMN patch_count INTEGER DEFAULT 0"))
        _conn.commit()

with engine.connect() as _conn:
    _model_cols = {c["name"] for c in sa_inspect(engine).get_columns("model_usage")}
    if "session_id" not in _model_cols:
        _conn.execute(sa_text("ALTER TABLE model_usage ADD COLUMN session_id VARCHAR(128)"))
        _conn.commit()

app = FastAPI(title=APP_TITLE, version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def healthcheck() -> dict:
    return {"status": "ok"}


@app.post("/api/v1/sessions", response_model=SessionOut)
def upsert_session(payload: SessionIn, db: Session = Depends(get_db)) -> SessionRecord:
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


@app.post("/api/v1/sessions/batch", response_model=list[SessionOut])
def upsert_sessions_batch(
    payload: list[SessionIn],
    db: Session = Depends(get_db),
) -> list[SessionRecord]:
    """Upsert multiple sessions in a single request (max 500)."""
    if len(payload) > 500:
        from fastapi import HTTPException
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
def upsert_model_usage(payload: ModelUsageIn, db: Session = Depends(get_db)) -> ModelUsageOut:
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
    db: Session = Depends(get_db),
) -> list[ModelUsageOut]:
    """Upsert model-level usage rows in batch (max 2000)."""
    if len(payload) > 2000:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="Batch size must not exceed 2000 model-usage rows.")

    output: list[ModelUsageOut] = []
    for item in payload:
        row = upsert_model_usage(item, db)
        output.append(row)
    db.commit()
    return output


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
