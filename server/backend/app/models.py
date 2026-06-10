from sqlalchemy import DateTime, Float, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class SessionRecord(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    started_at: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ended_at: Mapped[str | None] = mapped_column(String(64), nullable=True)

    total_input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_cached_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_nano_aiu: Mapped[int] = mapped_column(Integer, default=0)
    total_duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    model_turn_count: Mapped[int] = mapped_column(Integer, default=0)
    tool_call_count: Mapped[int] = mapped_column(Integer, default=0)

    raw_payload: Mapped[str] = mapped_column(Text)
    patch_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SessionMetricsByUser(Base):
    __tablename__ = "session_metrics_by_user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    ai_credits: Mapped[float] = mapped_column(Float, default=0.0)


class ModelUsageRecord(Base):
    """Per-day, per-user, per-model usage reported by the extension."""
    __tablename__ = "model_usage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    date: Mapped[str] = mapped_column(String(10), index=True)        # YYYY-MM-DD
    user_id: Mapped[str] = mapped_column(String(128), index=True)
    model: Mapped[str] = mapped_column(String(255), index=True)
    nano_aiu: Mapped[int] = mapped_column(Integer, default=0)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    session_count: Mapped[int] = mapped_column(Integer, default=0)
    request_count: Mapped[int] = mapped_column(Integer, default=0)
    reported_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
